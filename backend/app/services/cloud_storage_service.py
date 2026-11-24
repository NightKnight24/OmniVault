import asyncio
import base64
import hashlib
import html
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import webbrowser
import zipfile
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Tuple

import httpx

from ..database import get_db_connection

CLOUD_SETTINGS_KEY = "cloud_storage_config"

CLOUD_PROVIDER_META: Dict[str, Dict[str, Any]] = {
    "icloud": {
        "id": "icloud",
        "name": "iCloud Drive",
        "short_name": "iCloud",
        "supports_api": False,
        "supports_oauth": False,
        "supports_webdav": False,
        "badge_color": "sky",
    },
    "gdrive": {
        "id": "gdrive",
        "name": "Google Drive",
        "short_name": "GDrive",
        "supports_api": True,
        "supports_oauth": True,
        "supports_webdav": False,
        "badge_color": "emerald",
    },
    "onedrive": {
        "id": "onedrive",
        "name": "OneDrive",
        "short_name": "OneDrive",
        "supports_api": True,
        "supports_oauth": True,
        "supports_webdav": False,
        "badge_color": "blue",
    },
    "webdav": {
        "id": "webdav",
        "name": "WebDAV Cloud / NAS",
        "short_name": "WebDAV",
        "supports_api": True,
        "supports_oauth": False,
        "supports_webdav": True,
        "badge_color": "violet",
    },
}

VALID_TARGET_IDS = ("local", "icloud", "gdrive", "onedrive", "webdav")
CLOUD_TARGET_IDS = ("icloud", "gdrive", "onedrive", "webdav")

# Ephemeral PKCE state store (in-memory only, never persisted to git)
_PENDING_OAUTH_STATES: Dict[str, Dict[str, Any]] = {}
_ICLOUD_QUOTA_CACHE: Dict[str, Any] = {"ts": 0.0, "free_gb": None}


def sanitize_console_folder_name(platform: str) -> str:
    """Returns a clean, dedicated console folder name (e.g. SNES, PS5, Switch2, GameCube)."""
    raw = (platform or "Retro").strip()
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", raw).strip(" ._")
    return cleaned or "Retro"


def _default_cloud_config() -> Dict[str, Any]:
    return {
        "default_target": "local",
        "providers": {
            "icloud": {
                "custom_path": "",
                "prefer_api": False,
                "delete_local_after_upload": False,
                "evict_local_after_sync": False,
            },
            "gdrive": {
                "custom_path": "",
                "prefer_api": False,
                "delete_local_after_upload": True,
                "evict_local_after_sync": False,
                "access_token": "",
                "refresh_token": "",
                "client_id": "",
                "client_secret": "",
                "connected_account": "",
            },
            "onedrive": {
                "custom_path": "",
                "prefer_api": False,
                "delete_local_after_upload": True,
                "evict_local_after_sync": False,
                "access_token": "",
                "refresh_token": "",
                "client_id": "",
                "client_secret": "",
                "connected_account": "",
            },
            "webdav": {
                "webdav_url": "",
                "username": "",
                "password": "",
                "base_path": "",
                "prefer_api": True,
                "delete_local_after_upload": True,
            },
        },
    }


def _load_raw_cloud_config() -> Dict[str, Any]:
    cfg = _default_cloud_config()
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT value FROM settings WHERE key = ?", (CLOUD_SETTINGS_KEY,))
        row = c.fetchone()
        conn.close()
        if row and row["value"]:
            parsed = json.loads(row["value"])
            if isinstance(parsed, dict):
                default_t = str(parsed.get("default_target") or "local").strip().lower()
                if default_t in VALID_TARGET_IDS:
                    cfg["default_target"] = default_t
                saved_provs = parsed.get("providers") or {}
                if isinstance(saved_provs, dict):
                    for pid in CLOUD_TARGET_IDS:
                        if isinstance(saved_provs.get(pid), dict):
                            cfg["providers"][pid].update(saved_provs[pid])
    except Exception as exc:
        print(f"[Cloud Config Load Note]: {exc}")
    return cfg


def _save_raw_cloud_config(cfg: Dict[str, Any]) -> None:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (CLOUD_SETTINGS_KEY, json.dumps(cfg)),
    )
    conn.commit()
    conn.close()


def _mask_secret(val: str) -> str:
    clean = (val or "").strip()
    if not clean:
        return ""
    if len(clean) <= 10:
        return "*" * len(clean)
    return f"{clean[:4]}...{clean[-4:]}"


def _derive_roms_subpath(root_path: Path) -> Path:
    name_low = root_path.name.lower()
    if name_low == "roms":
        return root_path
    if name_low == "omnivault":
        return root_path / "ROMs"
    return root_path / "OmniVault" / "ROMs"


def _safe_disk_free_gb(target: Path) -> float:
    probe = target
    while probe and not probe.exists() and probe.parent != probe:
        probe = probe.parent
    try:
        stat = shutil.disk_usage(str(probe if probe.exists() else Path.home()))
        return round(stat.free / (1024 ** 3), 1)
    except Exception:
        return 0.0


def _get_icloud_real_quota_gb(force_refresh: bool = False) -> Optional[float]:
    """Queries actual remote iCloud remaining quota via macOS `/usr/bin/brctl quota` instead of local SSD free space."""
    if sys.platform != "darwin" or not Path("/usr/bin/brctl").exists():
        return None
    now = time.monotonic()
    if not force_refresh and (now - _ICLOUD_QUOTA_CACHE["ts"]) < 60.0:
        return _ICLOUD_QUOTA_CACHE["free_gb"]
    free_gb: Optional[float] = None
    try:
        res = subprocess.run(
            ["/usr/bin/brctl", "quota"],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        m = re.search(r"(\d+)\s+bytes\s+of\s+quota\s+remaining", res.stdout or "", re.I)
        if m:
            free_gb = round(int(m.group(1)) / (1024 ** 3), 2)
    except Exception:
        free_gb = None
    _ICLOUD_QUOTA_CACHE["ts"] = now
    _ICLOUD_QUOTA_CACHE["free_gb"] = free_gb
    return free_gb


def _pick_writable_subdir(base_dir: Path) -> Optional[Path]:
    try:
        if base_dir.exists() and os.access(str(base_dir), os.W_OK):
            return base_dir
        if not base_dir.exists():
            return None
        for child in sorted(base_dir.iterdir()):
            if child.name.startswith(".") or not child.is_dir():
                continue
            if os.access(str(child), os.W_OK):
                return child
    except Exception:
        pass
    return None


def _resolve_oauth_client_id(pid: str, pcfg: Dict[str, Any]) -> str:
    saved = str(pcfg.get("client_id") or "").strip()
    if saved:
        return saved
    if pid == "gdrive":
        return (os.environ.get("OMNIVAULT_GDRIVE_CLIENT_ID") or "").strip()
    if pid == "onedrive":
        return (os.environ.get("OMNIVAULT_ONEDRIVE_CLIENT_ID") or "").strip()
    return ""


def detect_native_cloud_mounts() -> Dict[str, Dict[str, Any]]:
    """
    Detects native local cloud-sync mount points for iCloud Drive, Google Drive, and OneDrive
    without storing any hardcoded user-specific identifiers.
    """
    detected: Dict[str, Dict[str, Any]] = {}
    home = Path.home()

    # 1. iCloud Drive
    icloud_candidates: List[Path] = []
    if sys.platform == "win32":
        icloud_candidates.append(home / "iCloudDrive")
    else:
        icloud_candidates.append(home / "Library" / "Mobile Documents" / "com~apple~CloudDocs")
    for p in icloud_candidates:
        if p.exists() and p.is_dir() and os.access(str(p), os.W_OK):
            roms_p = _derive_roms_subpath(p)
            detected["icloud"] = {
                "mount_path": str(p),
                "roms_path": str(roms_p),
                "account": "Apple ID (iCloud Sync)",
                "local_cache_free_gb": _safe_disk_free_gb(p),
                "free_gb": _get_icloud_real_quota_gb(),
            }
            break

    # 2. Google Drive
    gdrive_mount: Optional[Path] = None
    gdrive_account = ""
    if sys.platform == "win32":
        for p in (Path("G:/My Drive"), home / "Google Drive" / "My Drive", home / "Google Drive"):
            if p.exists() and p.is_dir() and os.access(str(p), os.W_OK):
                gdrive_mount = p
                break
    else:
        cloud_storage = home / "Library" / "CloudStorage"
        if cloud_storage.exists() and cloud_storage.is_dir():
            for entry in sorted(cloud_storage.iterdir()):
                if not entry.is_dir() or not entry.name.startswith("GoogleDrive-"):
                    continue
                acct = entry.name[len("GoogleDrive-"):].strip()
                my_drive = entry / "My Drive"
                writable = _pick_writable_subdir(my_drive) or _pick_writable_subdir(entry)
                if writable:
                    gdrive_mount = writable
                    gdrive_account = acct
                    break
        if gdrive_mount is None:
            for p in (Path("/Volumes/GoogleDrive/My Drive"), home / "Google Drive" / "My Drive", home / "Google Drive"):
                if p.exists() and p.is_dir() and os.access(str(p), os.W_OK):
                    gdrive_mount = p
                    break

    if gdrive_mount is not None:
        detected["gdrive"] = {
            "mount_path": str(gdrive_mount),
            "roms_path": str(_derive_roms_subpath(gdrive_mount)),
            "account": gdrive_account or "Google Drive Sync",
            "local_cache_free_gb": _safe_disk_free_gb(gdrive_mount),
            "free_gb": None,
        }

    # 3. Microsoft OneDrive
    onedrive_mount: Optional[Path] = None
    onedrive_account = ""
    if sys.platform == "win32":
        for env_key in ("OneDriveConsumer", "OneDriveCommercial", "OneDrive"):
            val = os.environ.get(env_key)
            if val:
                p = Path(val)
                if p.exists() and p.is_dir() and os.access(str(p), os.W_OK):
                    onedrive_mount = p
                    onedrive_account = p.name
                    break
        if onedrive_mount is None:
            p = home / "OneDrive"
            if p.exists() and p.is_dir() and os.access(str(p), os.W_OK):
                onedrive_mount = p
    else:
        cloud_storage = home / "Library" / "CloudStorage"
        if cloud_storage.exists() and cloud_storage.is_dir():
            for entry in sorted(cloud_storage.iterdir()):
                if not entry.is_dir() or not entry.name.startswith("OneDrive"):
                    continue
                writable = _pick_writable_subdir(entry)
                if writable:
                    onedrive_mount = writable
                    suffix = entry.name[len("OneDrive"):].lstrip("-_ ").strip()
                    onedrive_account = suffix or "Personal"
                    break
        if onedrive_mount is None:
            p = home / "OneDrive"
            if p.exists() and p.is_dir() and os.access(str(p), os.W_OK):
                onedrive_mount = p

    if onedrive_mount is not None:
        detected["onedrive"] = {
            "mount_path": str(onedrive_mount),
            "roms_path": str(_derive_roms_subpath(onedrive_mount)),
            "account": onedrive_account or "OneDrive Sync",
            "local_cache_free_gb": _safe_disk_free_gb(onedrive_mount),
            "free_gb": None,
        }

    return detected


def _desktop_app_installed(pid: str) -> bool:
    if sys.platform != "darwin":
        return False
    if pid == "icloud":
        return True
    if pid == "gdrive":
        return Path("/Applications/Google Drive.app").exists()
    if pid == "onedrive":
        return Path("/Applications/OneDrive.app").exists()
    return False


def _webdav_auth_and_base(pcfg: Dict[str, Any]) -> Tuple[str, Optional[httpx.BasicAuth]]:
    raw_url = str(pcfg.get("webdav_url") or "").strip().rstrip("/")
    base_sub = str(pcfg.get("base_path") or "").strip().strip("/")
    full_base = f"{raw_url}/{base_sub}" if (raw_url and base_sub) else raw_url
    user = str(pcfg.get("username") or "").strip()
    pwd = str(pcfg.get("password") or "").strip()
    auth = httpx.BasicAuth(user, pwd) if (user or pwd) else None
    return full_base, auth


def _build_target_entry(pid: str, cfg: Dict[str, Any], mounts: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    meta = CLOUD_PROVIDER_META[pid]
    pcfg = cfg.get("providers", {}).get(pid) or {}

    if pid == "webdav":
        wurl = str(pcfg.get("webdav_url") or "").strip()
        wuser = str(pcfg.get("username") or "").strip()
        wpwd = str(pcfg.get("password") or "").strip()
        wbase = str(pcfg.get("base_path") or "").strip().strip("/")
        parsed = urllib.parse.urlparse(wurl) if wurl else None
        is_valid = bool(parsed and parsed.scheme in ("http", "https") and parsed.netloc)
        host_label = parsed.netloc if parsed and parsed.netloc else ""
        account = f"{wuser}@{host_label}" if (wuser and host_label) else host_label
        base_seg = f"{wbase}/" if wbase else ""
        return {
            "id": "webdav",
            "name": meta["name"],
            "short_name": meta["short_name"],
            "available": is_valid,
            "mode": "api" if is_valid else "unconfigured",
            "zero_local_disk": is_valid,
            "console_subfolder_pattern": "OmniVault/ROMs/<Console>/",
            "mount_path": "",
            "roms_path": f"WebDAV:/{base_seg}OmniVault/ROMs/<Console>/" if is_valid else "",
            "custom_path": "",
            "webdav_url": wurl,
            "username": wuser,
            "base_path": wbase,
            "account": account,
            "free_gb": None,
            "local_cache_free_gb": None,
            "quota_label": "0 Local Disk Stream" if is_valid else "",
            "supports_api": True,
            "supports_oauth": False,
            "supports_webdav": True,
            "desktop_app_installed": False,
            "has_oauth_client_id": False,
            "client_id": "",
            "has_api_token": bool(is_valid and (wuser or wpwd)),
            "masked_token": _mask_secret(wpwd),
            "prefer_api": True,
            "delete_local_after_upload": True,
            "evict_local_after_sync": False,
            "badge_color": meta["badge_color"],
        }

    native = mounts.get(pid)
    custom_path_str = str(pcfg.get("custom_path") or "").strip()
    custom_roms: Optional[Path] = None
    custom_valid = False
    if custom_path_str:
        cp = Path(custom_path_str).expanduser()
        if cp.exists() and cp.is_dir() and os.access(str(cp), os.W_OK):
            custom_valid = True
            custom_roms = _derive_roms_subpath(cp)
        elif cp.parent.exists() and os.access(str(cp.parent), os.W_OK):
            custom_valid = True
            custom_roms = _derive_roms_subpath(cp)

    token = str(pcfg.get("access_token") or "").strip()
    refresh = str(pcfg.get("refresh_token") or "").strip()
    eff_client_id = _resolve_oauth_client_id(pid, pcfg)
    has_api_token = bool(meta["supports_api"] and (token or (refresh and eff_client_id)))
    prefer_api = bool(pcfg.get("prefer_api") and meta["supports_api"])
    connected_account = str(pcfg.get("connected_account") or "").strip()

    mount_path = ""
    roms_path = ""
    account = ""
    free_gb: Optional[float] = None
    local_cache_free_gb: Optional[float] = None
    quota_label = ""
    mode = "unconfigured"
    available = False
    zero_local_disk = False

    if has_api_token and (prefer_api or not (custom_valid or native)):
        account = connected_account or "Signed In (Direct Cloud Stream)"
        mode = "api"
        available = True
        zero_local_disk = True
        quota_label = "0 Local Disk Stream"
        roms_path = f"{meta['name']}:/OmniVault/ROMs/<Console>/"
        if native:
            mount_path = native["mount_path"]
            local_cache_free_gb = native.get("local_cache_free_gb")
    elif custom_valid and custom_roms is not None:
        mount_path = custom_path_str
        roms_path = str(custom_roms)
        account = "Custom Sync Folder"
        local_cache_free_gb = _safe_disk_free_gb(custom_roms)
        if pid == "icloud":
            free_gb = _get_icloud_real_quota_gb()
            quota_label = f"{free_gb} GB iCloud Free" if free_gb is not None else "iCloud Sync Ready"
        else:
            quota_label = "Cloud Sync Ready"
        mode = "mount"
        available = True
        zero_local_disk = bool(pcfg.get("evict_local_after_sync"))
    elif native:
        mount_path = native["mount_path"]
        roms_path = native["roms_path"]
        account = native["account"]
        free_gb = native.get("free_gb")
        local_cache_free_gb = native.get("local_cache_free_gb")
        if pid == "icloud":
            quota_label = f"{free_gb} GB iCloud Free" if free_gb is not None else "iCloud Sync Ready"
        else:
            quota_label = "Cloud Sync Ready"
        mode = "mount"
        available = True
        zero_local_disk = bool(pcfg.get("evict_local_after_sync"))
    elif has_api_token:
        account = connected_account or "Signed In (Direct Cloud Stream)"
        mode = "api"
        available = True
        zero_local_disk = True
        quota_label = "0 Local Disk Stream"
        roms_path = f"{meta['name']}:/OmniVault/ROMs/<Console>/"

    return {
        "id": pid,
        "name": meta["name"],
        "short_name": meta["short_name"],
        "available": available,
        "mode": mode,
        "zero_local_disk": zero_local_disk,
        "console_subfolder_pattern": "OmniVault/ROMs/<Console>/",
        "mount_path": mount_path,
        "roms_path": roms_path,
        "custom_path": custom_path_str,
        "account": account,
        "free_gb": free_gb,
        "local_cache_free_gb": local_cache_free_gb,
        "quota_label": quota_label,
        "supports_api": bool(meta["supports_api"]),
        "supports_oauth": bool(meta["supports_oauth"]),
        "supports_webdav": False,
        "desktop_app_installed": _desktop_app_installed(pid),
        "has_oauth_client_id": bool(eff_client_id),
        "client_id": str(pcfg.get("client_id") or ""),
        "has_api_token": has_api_token,
        "masked_token": _mask_secret(token or refresh),
        "prefer_api": prefer_api,
        "delete_local_after_upload": bool(pcfg.get("delete_local_after_upload", True if pid != "icloud" else False)),
        "evict_local_after_sync": bool(pcfg.get("evict_local_after_sync", False)),
        "badge_color": meta["badge_color"],
    }


def get_cloud_targets_status() -> Dict[str, Any]:
    cfg = _load_raw_cloud_config()
    mounts = detect_native_cloud_mounts()
    targets = [_build_target_entry(pid, cfg, mounts) for pid in CLOUD_TARGET_IDS]
    return {
        "default_target": cfg.get("default_target", "local"),
        "targets": targets,
    }


def save_cloud_targets_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _load_raw_cloud_config()
    if "default_target" in payload and payload["default_target"] is not None:
        dt = str(payload["default_target"]).strip().lower()
        if dt not in VALID_TARGET_IDS:
            raise ValueError(f"Unsupported destination target '{dt}'")
        cfg["default_target"] = dt

    def _apply_provider_update(pid: str, upd: Dict[str, Any]) -> None:
        target_cfg = cfg["providers"].setdefault(pid, {})
        if pid == "webdav":
            if upd.get("clear_token"):
                target_cfg["webdav_url"] = ""
                target_cfg["username"] = ""
                target_cfg["password"] = ""
                target_cfg["base_path"] = ""
                if cfg.get("default_target") == "webdav":
                    cfg["default_target"] = "local"
                return
            if "webdav_url" in upd:
                target_cfg["webdav_url"] = str(upd.get("webdav_url") or "").strip().rstrip("/")
            if "username" in upd:
                target_cfg["username"] = str(upd.get("username") or "").strip()
            if "password" in upd and str(upd.get("password") or "").strip():
                target_cfg["password"] = str(upd.get("password") or "").strip()
            if "base_path" in upd:
                target_cfg["base_path"] = str(upd.get("base_path") or "").strip().strip("/")
            return

        if "custom_path" in upd:
            target_cfg["custom_path"] = str(upd.get("custom_path") or "").strip()
        if "prefer_api" in upd:
            target_cfg["prefer_api"] = bool(upd.get("prefer_api"))
        if "delete_local_after_upload" in upd:
            target_cfg["delete_local_after_upload"] = bool(upd.get("delete_local_after_upload"))
        if "evict_local_after_sync" in upd:
            target_cfg["evict_local_after_sync"] = bool(upd.get("evict_local_after_sync"))
        if "client_id" in upd:
            target_cfg["client_id"] = str(upd.get("client_id") or "").strip()
        if "client_secret" in upd and str(upd.get("client_secret") or "").strip():
            target_cfg["client_secret"] = str(upd.get("client_secret") or "").strip()
        if upd.get("clear_token"):
            target_cfg["access_token"] = ""
            target_cfg["refresh_token"] = ""
            target_cfg["connected_account"] = ""
        else:
            for key in ("access_token", "refresh_token"):
                if key in upd and str(upd.get(key) or "").strip():
                    target_cfg[key] = str(upd[key]).strip()

    provs_payload = payload.get("providers")
    if isinstance(provs_payload, dict):
        for pid in CLOUD_TARGET_IDS:
            upd = provs_payload.get(pid)
            if isinstance(upd, dict):
                _apply_provider_update(pid, upd)

    single_pid = str(payload.get("provider_id") or "").strip().lower()
    if single_pid in CLOUD_TARGET_IDS:
        _apply_provider_update(single_pid, payload)

    _save_raw_cloud_config(cfg)
    return get_cloud_targets_status()


def resolve_download_destination(platform: str, requested_target: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolves the console-organized destination and cloud streaming strategy for a queued download.
    Every download is organized under its own dedicated <Console> folder (e.g. OmniVault/ROMs/SNES/).
    When mode == 'api' (Google Drive OAuth, OneDrive OAuth, or WebDAV Cloud/NAS), HTTP & Real-Debrid
    downloads stream straight through RAM to the cloud with ZERO bytes written to the local drive.
    """
    from .storage_service import get_roms_dir

    cfg = _load_raw_cloud_config()
    eff_target = (requested_target or cfg.get("default_target") or "local").strip().lower()
    if eff_target not in VALID_TARGET_IDS:
        eff_target = "local"

    clean_plat = sanitize_console_folder_name(platform)

    if eff_target == "local":
        dest_dir = get_roms_dir() / clean_plat
        dest_dir.mkdir(parents=True, exist_ok=True)
        return {
            "target_id": "local",
            "target_label": "Local Drive",
            "mode": "local",
            "stream_direct": False,
            "dest_dir": dest_dir,
            "console_folder": clean_plat,
            "delete_local_after_upload": False,
            "evict_local_after_sync": False,
        }

    mounts = detect_native_cloud_mounts()
    entry = _build_target_entry(eff_target, cfg, mounts)
    if not entry["available"]:
        raise ValueError(
            f"{entry['name']} is not connected yet. "
            f"Sign in or connect {entry['name']} in Settings -> Storage & Downloads."
        )

    if (
        entry["mode"] == "mount"
        and entry["roms_path"]
        and not str(entry["roms_path"]).startswith(("Google Drive:", "OneDrive:", "WebDAV:"))
    ):
        dest_dir = Path(entry["roms_path"]) / clean_plat
        dest_dir.mkdir(parents=True, exist_ok=True)
        return {
            "target_id": eff_target,
            "target_label": entry["name"],
            "mode": "mount",
            "stream_direct": False,
            "dest_dir": dest_dir,
            "console_folder": clean_plat,
            "delete_local_after_upload": False,
            "evict_local_after_sync": bool(entry.get("evict_local_after_sync")),
        }

    lazy_staging_dir = Path(tempfile.gettempdir()) / "omnivault_cloud_tmp" / clean_plat
    return {
        "target_id": eff_target,
        "target_label": entry["name"],
        "mode": "api",
        "stream_direct": True,
        "dest_dir": lazy_staging_dir,
        "console_folder": clean_plat,
        "delete_local_after_upload": True,
        "evict_local_after_sync": False,
    }


def open_cloud_system_signin(provider_id: str) -> Dict[str, Any]:
    """
    Opens the native system or official desktop app sign-in window so users can sign in & allow
    iCloud Drive, Google Drive, or OneDrive without manual token setup.
    """
    pid = (provider_id or "").strip().lower()
    if pid not in ("icloud", "gdrive", "onedrive"):
        raise ValueError(f"System app sign-in is not applicable to '{provider_id}'")

    if pid == "icloud":
        if sys.platform == "darwin":
            subprocess.Popen(["open", "x-apple.systempreferences:com.apple.preferences.AppleIDPrefPane"])
            return {
                "status": "opened",
                "provider_id": "icloud",
                "message": "Opened macOS Apple Account / iCloud Settings. Sign in and enable iCloud Drive — OmniVault will detect it automatically.",
            }
        webbrowser.open("https://support.apple.com/en-us/103232")
        return {"status": "opened", "provider_id": "icloud", "message": "Opened iCloud Drive setup page."}

    if pid == "gdrive":
        app_bundle = Path("/Applications/Google Drive.app")
        if sys.platform == "darwin" and app_bundle.exists():
            subprocess.Popen(["open", "-a", str(app_bundle)])
            return {
                "status": "opened",
                "provider_id": "gdrive",
                "message": "Launched Google Drive for macOS. Sign in with your Google account (choose 'Stream files' for zero local disk usage).",
            }
        url = "https://www.google.com/drive/download/"
        if sys.platform == "darwin":
            subprocess.Popen(["open", url])
        else:
            webbrowser.open(url)
        return {
            "status": "opened",
            "provider_id": "gdrive",
            "message": "Opened Google Drive official installer, or enter an OAuth Client ID below to sign in directly in your browser.",
        }

    app_bundle = Path("/Applications/OneDrive.app")
    if sys.platform == "darwin" and app_bundle.exists():
        subprocess.Popen(["open", "-a", str(app_bundle)])
        return {
            "status": "opened",
            "provider_id": "onedrive",
            "message": "Launched Microsoft OneDrive. Sign in with your Microsoft account (Files On-Demand keeps files in the cloud).",
        }
    url = "https://www.microsoft.com/microsoft-365/onedrive/download"
    if sys.platform == "darwin":
        subprocess.Popen(["open", url])
    else:
        webbrowser.open(url)
    return {
        "status": "opened",
        "provider_id": "onedrive",
        "message": "Opened Microsoft OneDrive official download page, or enter an OAuth Client ID below to sign in directly in your browser.",
    }


def start_cloud_oauth_flow(
    provider_id: str,
    client_id: Optional[str] = None,
    client_secret: Optional[str] = None,
    redirect_base: str = "http://127.0.0.1:19842",
) -> Dict[str, Any]:
    """
    Initiates an OAuth 2.0 Loopback + PKCE (S256) 'Sign in & Allow' flow in the user's browser
    for Google Drive or Microsoft OneDrive. Zero secrets are hardcoded in the repository.
    """
    pid = (provider_id or "").strip().lower()
    if pid not in ("gdrive", "onedrive"):
        raise ValueError("Browser OAuth sign-in is supported for Google Drive and OneDrive.")

    cfg = _load_raw_cloud_config()
    pcfg = cfg["providers"].setdefault(pid, {})
    if client_id and client_id.strip():
        pcfg["client_id"] = client_id.strip()
    if client_secret and client_secret.strip():
        pcfg["client_secret"] = client_secret.strip()
    _save_raw_cloud_config(cfg)

    eff_client_id = _resolve_oauth_client_id(pid, pcfg)
    if not eff_client_id:
        raise ValueError(
            f"Enter a free {CLOUD_PROVIDER_META[pid]['name']} Desktop OAuth Client ID once (no secret needed with PKCE) "
            f"to use Browser Sign-In, or click 'Sign in ({CLOUD_PROVIDER_META[pid]['short_name']} App)' to sign in via the official desktop app."
        )

    now = time.time()
    for st_k in list(_PENDING_OAUTH_STATES.keys()):
        if now - _PENDING_OAUTH_STATES[st_k].get("created_at", 0) > 900:
            _PENDING_OAUTH_STATES.pop(st_k, None)

    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(24)
    redirect_uri = f"{redirect_base.rstrip('/')}/api/storage/cloud-oauth/callback"

    _PENDING_OAUTH_STATES[state] = {
        "provider_id": pid,
        "code_verifier": code_verifier,
        "client_id": eff_client_id,
        "client_secret": str(pcfg.get("client_secret") or "").strip(),
        "redirect_uri": redirect_uri,
        "created_at": now,
    }

    if pid == "gdrive":
        params = {
            "client_id": eff_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/drive.file email profile",
            "access_type": "offline",
            "prompt": "consent",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    else:
        params = {
            "client_id": eff_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "response_mode": "query",
            "scope": "Files.ReadWrite offline_access User.Read",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        auth_url = f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}"

    if sys.platform == "darwin":
        subprocess.Popen(["open", auth_url])
    else:
        webbrowser.open(auth_url)

    return {
        "status": "opened",
        "provider_id": pid,
        "auth_url": auth_url,
        "redirect_uri": redirect_uri,
        "message": f"Opened {CLOUD_PROVIDER_META[pid]['name']} sign-in in your browser. Click 'Allow' to finish connecting.",
    }


def _render_oauth_html(success: bool, title: str, subtitle: str) -> str:
    accent = "#10b981" if success else "#f43f5e"
    safe_title = html.escape(title)
    safe_sub = html.escape(subtitle)
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>OmniVault Cloud Sign-In</title>
  <style>
    body {{
      margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #080c14; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }}
    .card {{
      max-width: 460px; padding: 32px; border-radius: 24px; background: #0f172a;
      border: 1px solid rgba(255,255,255,0.12); text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.6);
    }}
    .badge {{
      display: inline-block; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 800;
      background: {accent}22; color: {accent}; border: 1px solid {accent}66; margin-bottom: 16px;
    }}
    h1 {{ font-size: 20px; margin: 0 0 10px 0; }}
    p {{ font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">{'CONNECTED' if success else 'SIGN-IN ERROR'}</div>
    <h1>{safe_title}</h1>
    <p>{safe_sub}</p>
  </div>
  <script>
    if ({'true' if success else 'false'}) {{
      setTimeout(function() {{ try {{ window.close(); }} catch (e) {{}} }}, 2500);
    }}
  </script>
</body>
</html>"""


async def complete_cloud_oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
) -> str:
    """Completes the OAuth 2.0 PKCE code exchange and saves tokens locally."""
    if error:
        return _render_oauth_html(False, "Cloud Sign-In Cancelled", error_description or error)

    pending = _PENDING_OAUTH_STATES.pop(state or "", None)
    if not pending or not code:
        return _render_oauth_html(
            False,
            "Invalid or Expired Sign-In Session",
            "Please return to OmniVault Settings and click Sign In again.",
        )

    pid = pending["provider_id"]
    token_url = (
        "https://oauth2.googleapis.com/token"
        if pid == "gdrive"
        else "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    )
    form_data = {
        "client_id": pending["client_id"],
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": pending["redirect_uri"],
        "code_verifier": pending["code_verifier"],
    }
    if pending.get("client_secret"):
        form_data["client_secret"] = pending["client_secret"]

    try:
        async with httpx.AsyncClient(timeout=20.0, verify=False) as client:
            resp = await client.post(token_url, data=form_data)
            if resp.status_code != 200:
                detail = resp.text[:220]
                return _render_oauth_html(False, "Token Exchange Failed", f"Provider returned HTTP {resp.status_code}: {detail}")

            tok_json = resp.json()
            access_token = str(tok_json.get("access_token") or "").strip()
            refresh_token = str(tok_json.get("refresh_token") or "").strip()
            if not access_token:
                return _render_oauth_html(False, "No Access Token Returned", "Provider response did not include an access_token.")

            account_label = ""
            if pid == "gdrive":
                about = await client.get(
                    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if about.status_code == 200:
                    u = about.json().get("user") or {}
                    account_label = u.get("emailAddress") or u.get("displayName") or ""
            else:
                drv = await client.get(
                    "https://graph.microsoft.com/v1.0/me/drive",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if drv.status_code == 200:
                    u = (drv.json().get("owner") or {}).get("user") or {}
                    account_label = u.get("email") or u.get("displayName") or ""

        cfg = _load_raw_cloud_config()
        pcfg = cfg["providers"].setdefault(pid, {})
        pcfg["access_token"] = access_token
        if refresh_token:
            pcfg["refresh_token"] = refresh_token
        pcfg["client_id"] = pending["client_id"]
        if pending.get("client_secret"):
            pcfg["client_secret"] = pending["client_secret"]
        if account_label:
            pcfg["connected_account"] = account_label
        pcfg["prefer_api"] = True
        pcfg["delete_local_after_upload"] = True
        _save_raw_cloud_config(cfg)

        pname = CLOUD_PROVIDER_META[pid]["name"]
        acct_note = f" ({account_label})" if account_label else ""
        return _render_oauth_html(
            True,
            f"{pname} Connected{acct_note}!",
            f"Direct zero-local-disk cloud streaming is active under {pname}/OmniVault/ROMs/<Console>/. You can return to OmniVault now.",
        )
    except Exception as exc:
        return _render_oauth_html(False, "Cloud Sign-In Error", str(exc))


async def _refresh_oauth_token(provider_id: str, pcfg: Dict[str, Any]) -> str:
    access_token = str(pcfg.get("access_token") or "").strip()
    refresh_token = str(pcfg.get("refresh_token") or "").strip()
    client_id = _resolve_oauth_client_id(provider_id, pcfg)
    client_secret = str(pcfg.get("client_secret") or "").strip()

    if not refresh_token or not client_id:
        return access_token

    if provider_id == "gdrive":
        token_url = "https://oauth2.googleapis.com/token"
    elif provider_id == "onedrive":
        token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    else:
        return access_token

    data: Dict[str, str] = {
        "client_id": client_id,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    if client_secret:
        data["client_secret"] = client_secret

    try:
        async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
            resp = await client.post(token_url, data=data)
            if resp.status_code == 200:
                body = resp.json()
                new_tok = str(body.get("access_token") or "").strip()
                new_ref = str(body.get("refresh_token") or "").strip()
                if new_tok:
                    cfg = _load_raw_cloud_config()
                    if provider_id in cfg["providers"]:
                        cfg["providers"][provider_id]["access_token"] = new_tok
                        if new_ref:
                            cfg["providers"][provider_id]["refresh_token"] = new_ref
                        _save_raw_cloud_config(cfg)
                    return new_tok
    except Exception as exc:
        print(f"[{provider_id} token refresh note]: {exc}")

    return access_token


async def _ensure_webdav_folders(
    client: httpx.AsyncClient,
    base_url: str,
    auth: Optional[httpx.BasicAuth],
    segments: List[str],
) -> str:
    """Recursively creates WebDAV collection directories (`OmniVault/ROMs/<Console>`) using MKCOL."""
    current = base_url.rstrip("/")
    for seg in segments:
        encoded = urllib.parse.quote(seg)
        current = f"{current}/{encoded}"
        resp = await client.request("MKCOL", current + "/", auth=auth)
        if resp.status_code in (200, 201, 204, 301, 302, 405):
            continue
        if resp.status_code in (401, 403):
            raise RuntimeError(f"WebDAV authentication failed (HTTP {resp.status_code})")
        # Some WebDAV servers ignore MKCOL without trailing slash or return 409 if already present on rewrite
        resp2 = await client.request("MKCOL", current, auth=auth)
        if resp2.status_code not in (200, 201, 204, 301, 302, 405, 409):
            raise RuntimeError(f"WebDAV MKCOL failed for '{seg}': HTTP {resp2.status_code}")
    return current


async def test_cloud_target(provider_id: str, override_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    pid = (provider_id or "").strip().lower()
    if pid not in CLOUD_TARGET_IDS:
        return {"status": "error", "message": f"Unknown cloud provider '{provider_id}'"}

    cfg = _load_raw_cloud_config()
    if isinstance(override_payload, dict):
        pcfg = dict(cfg["providers"].get(pid) or {})
        for k in (
            "custom_path", "prefer_api", "delete_local_after_upload", "evict_local_after_sync",
            "access_token", "refresh_token", "client_id", "client_secret",
            "webdav_url", "username", "password", "base_path",
        ):
            if k in override_payload and override_payload.get(k) is not None and str(override_payload.get(k)).strip() != "":
                pcfg[k] = override_payload[k]
        cfg["providers"][pid] = pcfg

    mounts = detect_native_cloud_mounts()
    entry = _build_target_entry(pid, cfg, mounts)

    if not entry["available"]:
        return {
            "status": "error",
            "provider_id": pid,
            "message": f"{entry['name']} is not configured or signed in yet.",
        }

    # WebDAV / NAS test
    if pid == "webdav":
        pcfg = cfg["providers"]["webdav"]
        base_url, auth = _webdav_auth_and_base(pcfg)
        prop_xml = (
            '<?xml version="1.0" encoding="utf-8" ?>'
            '<D:propfind xmlns:D="DAV:"><D:prop><D:quota-available-bytes/></D:prop></D:propfind>'
        )
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, verify=False) as client:
                resp = await client.request(
                    "PROPFIND",
                    base_url + "/",
                    content=prop_xml,
                    headers={"Depth": "0", "Content-Type": "application/xml"},
                    auth=auth,
                )
                if resp.status_code in (401, 403):
                    return {"status": "error", "provider_id": "webdav", "mode": "api", "message": f"WebDAV login failed (HTTP {resp.status_code})"}
                if resp.status_code in (405, 501):
                    resp = await client.request("OPTIONS", base_url + "/", auth=auth)
                if resp.status_code in (200, 204, 207):
                    free_gb: Optional[float] = None
                    qm = re.search(r"<[^>]*quota-available-bytes[^>]*>\s*(\d+)\s*</", resp.text or "", re.I)
                    if qm:
                        free_gb = round(int(qm.group(1)) / (1024 ** 3), 1)
                    quota_txt = f" • {free_gb} GB free" if free_gb is not None else ""
                    return {
                        "status": "ok",
                        "provider_id": "webdav",
                        "mode": "api",
                        "message": f"WebDAV verified ({entry['account']}) • 0 Local Disk Stream • OmniVault/ROMs/<Console>/{quota_txt}",
                        "free_gb": free_gb,
                    }
                return {"status": "error", "provider_id": "webdav", "mode": "api", "message": f"WebDAV server returned HTTP {resp.status_code}"}
        except Exception as exc:
            return {"status": "error", "provider_id": "webdav", "mode": "api", "message": f"WebDAV connection error: {exc}"}

    if (
        entry["mode"] == "mount"
        and entry["roms_path"]
        and not str(entry["roms_path"]).startswith(("Google Drive:", "OneDrive:", "WebDAV:"))
    ):
        try:
            roms_dir = Path(entry["roms_path"])
            roms_dir.mkdir(parents=True, exist_ok=True)
            probe = roms_dir / ".omnivault_cloud_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            if pid == "icloud":
                real_gb = _get_icloud_real_quota_gb(force_refresh=True)
                quota_note = f" • {real_gb} GB iCloud quota remaining" if real_gb is not None else ""
                return {
                    "status": "ok",
                    "provider_id": pid,
                    "mode": "mount",
                    "message": f"iCloud Drive ready — organizes per console under {roms_dir}/<Console>/{quota_note}",
                    "roms_path": str(roms_dir),
                    "free_gb": real_gb,
                }
            return {
                "status": "ok",
                "provider_id": pid,
                "mode": "mount",
                "message": f"{entry['name']} sync ready — organizes per console under {roms_dir}/<Console>/",
                "roms_path": str(roms_dir),
                "free_gb": None,
            }
        except Exception as exc:
            return {
                "status": "error",
                "provider_id": pid,
                "mode": "mount",
                "message": f"{entry['name']} folder not writable: {exc}",
            }

    pcfg = cfg["providers"][pid]
    token = str(pcfg.get("access_token") or "").strip()
    if not token and pcfg.get("refresh_token") and _resolve_oauth_client_id(pid, pcfg):
        token = await _refresh_oauth_token(pid, pcfg)

    if not token:
        return {"status": "error", "provider_id": pid, "mode": "api", "message": "Access token missing — click Browser Sign-In to connect."}

    try:
        async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
            if pid == "gdrive":
                url = "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota"
                resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
                if resp.status_code == 401 and pcfg.get("refresh_token"):
                    token = await _refresh_oauth_token(pid, pcfg)
                    resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
                if resp.status_code == 200:
                    data = resp.json()
                    email = data.get("user", {}).get("emailAddress") or data.get("user", {}).get("displayName") or "Connected"
                    q = data.get("storageQuota") or {}
                    limit_b = int(q.get("limit") or 0)
                    usage_b = int(q.get("usage") or 0)
                    free_gb = round(max(0, limit_b - usage_b) / (1024 ** 3), 1) if limit_b > 0 else 0.0
                    return {
                        "status": "ok",
                        "provider_id": pid,
                        "mode": "api",
                        "message": f"Google Drive Direct Stream verified ({email}) • 0 Local Disk • OmniVault/ROMs/<Console>/"
                        + (f" • {free_gb} GB free" if free_gb > 0 else ""),
                        "free_gb": free_gb,
                    }
                return {"status": "error", "provider_id": pid, "mode": "api", "message": f"Google Drive returned HTTP {resp.status_code}"}

            if pid == "onedrive":
                url = "https://graph.microsoft.com/v1.0/me/drive"
                resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
                if resp.status_code == 401 and pcfg.get("refresh_token"):
                    token = await _refresh_oauth_token(pid, pcfg)
                    resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
                if resp.status_code == 200:
                    data = resp.json()
                    owner = data.get("owner", {}).get("user", {}).get("displayName") or "OneDrive Connected"
                    quota = data.get("quota") or {}
                    rem_b = int(quota.get("remaining") or 0)
                    free_gb = round(rem_b / (1024 ** 3), 1) if rem_b > 0 else 0.0
                    return {
                        "status": "ok",
                        "provider_id": pid,
                        "mode": "api",
                        "message": f"OneDrive Direct Stream verified ({owner}) • 0 Local Disk • OmniVault/ROMs/<Console>/"
                        + (f" • {free_gb} GB free" if free_gb > 0 else ""),
                        "free_gb": free_gb,
                    }
                return {"status": "error", "provider_id": pid, "mode": "api", "message": f"OneDrive returned HTTP {resp.status_code}"}
    except Exception as exc:
        return {"status": "error", "provider_id": pid, "mode": "api", "message": str(exc)}

    return {"status": "error", "provider_id": pid, "message": "Unsupported API test"}


def schedule_cloud_mount_eviction(file_path: Path, delay_secs: float = 15.0) -> None:
    """
    On macOS, optionally invokes `/usr/bin/brctl evict` after iCloud / FileProvider syncs the file
    so the ROM stays in iCloud Drive without occupying local SSD blocks.
    """
    if sys.platform != "darwin" or not Path("/usr/bin/brctl").exists():
        return
    p_str = str(file_path)
    if "Mobile Documents" not in p_str and "CloudStorage" not in p_str:
        return

    async def _evict_later() -> None:
        await asyncio.sleep(delay_secs)
        try:
            if file_path.exists():
                await asyncio.to_thread(
                    subprocess.run,
                    ["/usr/bin/brctl", "evict", p_str],
                    capture_output=True,
                    check=False,
                )
        except Exception:
            pass

    try:
        asyncio.get_running_loop().create_task(_evict_later())
    except RuntimeError:
        pass


def _zip_directory_sync(src_dir: Path, dest_zip: Path) -> Path:
    with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        for item in src_dir.rglob("*"):
            if item.is_file():
                rel = item.relative_to(src_dir.parent) if src_dir.suffix.lower() == ".app" else item.relative_to(src_dir)
                zf.write(item, rel)
    return dest_zip


async def _ensure_gdrive_folder(client: httpx.AsyncClient, token: str, name: str, parent_id: Optional[str] = None) -> str:
    safe_name = name.replace("'", "\\'")
    q = f"name = '{safe_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    else:
        q += " and 'root' in parents"

    list_resp = await client.get(
        "https://www.googleapis.com/drive/v3/files",
        params={"q": q, "fields": "files(id,name)", "pageSize": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    if list_resp.status_code == 200:
        files = list_resp.json().get("files") or []
        if files:
            return files[0]["id"]

    meta: Dict[str, Any] = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        meta["parents"] = [parent_id]
    create_resp = await client.post(
        "https://www.googleapis.com/drive/v3/files",
        json=meta,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    if create_resp.status_code not in (200, 201):
        raise RuntimeError(f"Failed creating Google Drive folder '{name}': HTTP {create_resp.status_code}")
    return create_resp.json()["id"]


async def _open_cloud_upload_session(
    client: httpx.AsyncClient,
    pid: str,
    pcfg: Dict[str, Any],
    token: str,
    clean_plat: str,
    filename: str,
    total_bytes: int,
) -> Tuple[str, int, str]:
    """Creates a resumable upload session inside OmniVault/ROMs/<Console>/<filename> and returns (session_url, chunk_size, remote_path)."""
    if pid == "gdrive":
        omni_id = await _ensure_gdrive_folder(client, token, "OmniVault")
        roms_id = await _ensure_gdrive_folder(client, token, "ROMs", parent_id=omni_id)
        plat_id = await _ensure_gdrive_folder(client, token, clean_plat, parent_id=roms_id)

        init_resp = await client.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
            json={"name": filename, "parents": [plat_id]},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": str(total_bytes),
            },
        )
        if init_resp.status_code == 401 and pcfg.get("refresh_token"):
            token = await _refresh_oauth_token(pid, pcfg)
            init_resp = await client.post(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
                json={"name": filename, "parents": [plat_id]},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=UTF-8",
                    "X-Upload-Content-Length": str(total_bytes),
                },
            )
        if init_resp.status_code not in (200, 201) or not init_resp.headers.get("Location"):
            raise RuntimeError(f"Google Drive upload session init failed: HTTP {init_resp.status_code}")
        return (
            init_resp.headers["Location"],
            8 * 1024 * 1024,
            f"Google Drive:/OmniVault/ROMs/{clean_plat}/{filename}",
        )

    if pid == "onedrive":
        encoded_plat = urllib.parse.quote(clean_plat)
        encoded_name = urllib.parse.quote(filename)
        session_url = f"https://graph.microsoft.com/v1.0/me/drive/root:/OmniVault/ROMs/{encoded_plat}/{encoded_name}:/createUploadSession"
        init_resp = await client.post(
            session_url,
            json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        if init_resp.status_code == 401 and pcfg.get("refresh_token"):
            token = await _refresh_oauth_token(pid, pcfg)
            init_resp = await client.post(
                session_url,
                json={"item": {"@microsoft.graph.conflictBehavior": "replace"}},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        if init_resp.status_code not in (200, 201):
            raise RuntimeError(f"OneDrive upload session init failed: HTTP {init_resp.status_code}")
        upload_url = init_resp.json().get("uploadUrl")
        if not upload_url:
            raise RuntimeError("OneDrive did not return uploadUrl")
        return (
            upload_url,
            10 * 1024 * 1024,
            f"OneDrive:/OmniVault/ROMs/{clean_plat}/{filename}",
        )

    raise ValueError(f"Direct cloud streaming not supported for '{pid}'")


async def stream_url_to_cloud_api(
    provider_id: str,
    source_url: str,
    request_headers: Dict[str, str],
    fallback_filename: str,
    platform: str,
    progress_cb: Optional[Callable[[int, int, float], None]] = None,
    is_paused_cb: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    """
    ZERO-LOCAL-DISK CLOUD STREAMER:
    Streams a ROM/game HTTP download directly through a RAM buffer into Google Drive,
    OneDrive, or WebDAV Cloud / NAS under `OmniVault/ROMs/<Console>/<filename>`
    without ever saving the file onto the local SSD or hard drive.
    """
    pid = (provider_id or "").strip().lower()
    cfg = _load_raw_cloud_config()
    pcfg = cfg.get("providers", {}).get(pid) or {}
    clean_plat = sanitize_console_folder_name(platform)
    filename = os.path.basename(fallback_filename or "rom_archive.zip") or "rom_archive.zip"

    token = ""
    webdav_base = ""
    webdav_auth: Optional[httpx.BasicAuth] = None
    if pid == "webdav":
        webdav_base, webdav_auth = _webdav_auth_and_base(pcfg)
        if not webdav_base:
            raise ValueError("WebDAV Cloud / NAS URL is not configured")
    else:
        token = str(pcfg.get("access_token") or "").strip()
        if not token and pcfg.get("refresh_token") and _resolve_oauth_client_id(pid, pcfg):
            token = await _refresh_oauth_token(pid, pcfg)
        if not token:
            raise ValueError(f"Not signed in to {CLOUD_PROVIDER_META.get(pid, {}).get('name', pid)}")

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, verify=False) as client:
        async with client.stream("GET", source_url, headers=request_headers) as response:
            if response.status_code not in (200, 206):
                raise RuntimeError(f"Mirror returned HTTP {response.status_code}")

            c_type = response.headers.get("Content-Type", "").lower()
            if any(h in c_type for h in ("text/html", "text/xml", "application/xhtml+xml")):
                raise ValueError(f"Target mirror returned HTML webpage ({c_type}) instead of binary ROM stream")

            cd = response.headers.get("Content-Disposition") or ""
            cd_match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";\r\n]+)"?', cd, re.I)
            if cd_match:
                parsed_cd = urllib.parse.unquote(cd_match.group(1)).strip()
                if parsed_cd:
                    filename = os.path.basename(parsed_cd)

            total_bytes = int(response.headers.get("Content-Length") or 0)

            # WebDAV PUT streams directly through an async generator (~128 KB RAM buffer, 0 local disk)
            if pid == "webdav":
                folder_url = await _ensure_webdav_folders(client, webdav_base, webdav_auth, ["OmniVault", "ROMs", clean_plat])
                target_url = f"{folder_url}/{urllib.parse.quote(filename)}"
                base_sub = str(pcfg.get("base_path") or "").strip().strip("/")
                remote_path = f"WebDAV:/{base_sub + '/' if base_sub else ''}OmniVault/ROMs/{clean_plat}/{filename}"
                sent = 0
                t_start = time.monotonic()

                async def _webdav_ram_stream() -> AsyncIterator[bytes]:
                    nonlocal sent
                    async for net_chunk in response.aiter_bytes(chunk_size=131072):
                        if is_paused_cb and is_paused_cb():
                            raise asyncio.CancelledError("Download paused")
                        sent += len(net_chunk)
                        if progress_cb:
                            elapsed = max(time.monotonic() - t_start, 0.01)
                            progress_cb(sent, total_bytes or sent, (sent / (1024 * 1024)) / elapsed)
                        yield net_chunk

                put_headers: Dict[str, str] = {"Content-Type": "application/octet-stream"}
                if total_bytes > 0:
                    put_headers["Content-Length"] = str(total_bytes)

                try:
                    put_resp = await client.put(target_url, content=_webdav_ram_stream(), headers=put_headers, auth=webdav_auth)
                except asyncio.CancelledError:
                    return {"status": "paused"}
                if put_resp.status_code not in (200, 201, 204):
                    raise RuntimeError(f"WebDAV PUT upload failed: HTTP {put_resp.status_code}")

                return {
                    "status": "completed",
                    "provider": CLOUD_PROVIDER_META["webdav"]["name"],
                    "remote_path": remote_path,
                    "filename": filename,
                    "total_bytes": total_bytes or sent,
                    "zero_local_disk": True,
                }

            # Google Drive & OneDrive require exact Content-Length upfront
            buffered_all: Optional[bytes] = None
            if total_bytes <= 0:
                ram_acc = bytearray()
                max_ram = 128 * 1024 * 1024
                async for piece in response.aiter_bytes(chunk_size=65536):
                    if is_paused_cb and is_paused_cb():
                        return {"status": "paused"}
                    ram_acc.extend(piece)
                    if len(ram_acc) > max_ram:
                        raise RuntimeError("Mirror omitted Content-Length for >128 MB stream")
                buffered_all = bytes(ram_acc)
                total_bytes = len(buffered_all)

            if total_bytes < 1024:
                raise ValueError(f"Streamed file is suspiciously small ({total_bytes} bytes)")

            session_uri, chunk_size, remote_path = await _open_cloud_upload_session(
                client, pid, pcfg, token, clean_plat, filename, total_bytes
            )

            sent = 0
            allowed_codes = (200, 201, 308) if pid == "gdrive" else (200, 201, 202)

            async def _flush_chunk(buf_bytes: bytes) -> None:
                nonlocal sent
                if not buf_bytes:
                    return
                end = sent + len(buf_bytes) - 1
                t0 = time.monotonic()
                put_resp = await client.put(
                    session_uri,
                    content=buf_bytes,
                    headers={
                        "Content-Length": str(len(buf_bytes)),
                        "Content-Range": f"bytes {sent}-{end}/{total_bytes}",
                    },
                )
                if put_resp.status_code not in allowed_codes:
                    raise RuntimeError(f"Cloud chunk upload failed: HTTP {put_resp.status_code}")
                sent += len(buf_bytes)
                if progress_cb:
                    elapsed = max(time.monotonic() - t0, 0.01)
                    progress_cb(sent, total_bytes, (len(buf_bytes) / (1024 * 1024)) / elapsed)

            if buffered_all is not None:
                for offset in range(0, total_bytes, chunk_size):
                    if is_paused_cb and is_paused_cb():
                        return {"status": "paused"}
                    await _flush_chunk(buffered_all[offset : offset + chunk_size])
            else:
                ram_buf = bytearray()
                async for net_chunk in response.aiter_bytes(chunk_size=131072):
                    if is_paused_cb and is_paused_cb():
                        return {"status": "paused"}
                    ram_buf.extend(net_chunk)
                    while len(ram_buf) >= chunk_size:
                        slice_bytes = bytes(ram_buf[:chunk_size])
                        del ram_buf[:chunk_size]
                        await _flush_chunk(slice_bytes)
                if ram_buf:
                    await _flush_chunk(bytes(ram_buf))
                    ram_buf.clear()

    return {
        "status": "completed",
        "provider": CLOUD_PROVIDER_META[pid]["name"],
        "remote_path": remote_path,
        "filename": filename,
        "total_bytes": total_bytes,
        "zero_local_disk": True,
    }


async def upload_file_to_cloud_api(
    provider_id: str,
    local_path: Path,
    platform: str,
    progress_cb: Optional[Callable[[int, int, float], None]] = None,
) -> Dict[str, Any]:
    """
    Uploads an assembled local file (e.g. from P2P BitTorrent piece assembly) into
    Google Drive, OneDrive, or WebDAV Cloud / NAS under `OmniVault/ROMs/<Console>/<filename>`.
    """
    pid = (provider_id or "").strip().lower()
    cfg = _load_raw_cloud_config()
    pcfg = cfg.get("providers", {}).get(pid) or {}

    cleanup_temp_zip: Optional[Path] = None
    upload_path = local_path
    if local_path.is_dir():
        zip_target = local_path.parent / f"{local_path.stem}.zip"
        upload_path = await asyncio.to_thread(_zip_directory_sync, local_path, zip_target)
        cleanup_temp_zip = upload_path

    total_bytes = upload_path.stat().st_size
    clean_plat = sanitize_console_folder_name(platform)

    try:
        async with httpx.AsyncClient(timeout=120.0, verify=False) as client:
            if pid == "webdav":
                webdav_base, webdav_auth = _webdav_auth_and_base(pcfg)
                if not webdav_base:
                    raise ValueError("WebDAV Cloud / NAS URL is not configured")
                folder_url = await _ensure_webdav_folders(client, webdav_base, webdav_auth, ["OmniVault", "ROMs", clean_plat])
                target_url = f"{folder_url}/{urllib.parse.quote(upload_path.name)}"
                base_sub = str(pcfg.get("base_path") or "").strip().strip("/")
                remote_path = f"WebDAV:/{base_sub + '/' if base_sub else ''}OmniVault/ROMs/{clean_plat}/{upload_path.name}"
                sent = 0
                t_start = time.monotonic()

                async def _file_chunks() -> AsyncIterator[bytes]:
                    nonlocal sent
                    with open(upload_path, "rb") as fh:
                        while True:
                            chunk = fh.read(4 * 1024 * 1024)
                            if not chunk:
                                break
                            sent += len(chunk)
                            if progress_cb:
                                elapsed = max(time.monotonic() - t_start, 0.01)
                                progress_cb(sent, total_bytes, (sent / (1024 * 1024)) / elapsed)
                            yield chunk

                put_resp = await client.put(
                    target_url,
                    content=_file_chunks(),
                    headers={"Content-Length": str(total_bytes), "Content-Type": "application/octet-stream"},
                    auth=webdav_auth,
                )
                if put_resp.status_code not in (200, 201, 204):
                    raise RuntimeError(f"WebDAV PUT failed: HTTP {put_resp.status_code}")
                return {
                    "provider": CLOUD_PROVIDER_META["webdav"]["name"],
                    "remote_path": remote_path,
                    "filename": upload_path.name,
                }

            token = str(pcfg.get("access_token") or "").strip()
            if not token and pcfg.get("refresh_token") and _resolve_oauth_client_id(pid, pcfg):
                token = await _refresh_oauth_token(pid, pcfg)
            if not token:
                raise ValueError(f"No API access token configured for {pid}")

            allowed_codes = (200, 201, 308) if pid == "gdrive" else (200, 201, 202)
            session_uri, chunk_size, remote_path = await _open_cloud_upload_session(
                client, pid, pcfg, token, clean_plat, upload_path.name, total_bytes
            )
            sent = 0
            with open(upload_path, "rb") as f:
                while sent < total_bytes:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    end = sent + len(chunk) - 1
                    t0 = time.monotonic()
                    put_resp = await client.put(
                        session_uri,
                        content=chunk,
                        headers={
                            "Content-Length": str(len(chunk)),
                            "Content-Range": f"bytes {sent}-{end}/{total_bytes}",
                        },
                    )
                    if put_resp.status_code not in allowed_codes:
                        raise RuntimeError(f"Cloud chunk upload failed: HTTP {put_resp.status_code}")
                    sent += len(chunk)
                    if progress_cb:
                        elapsed = max(time.monotonic() - t0, 0.01)
                        progress_cb(sent, total_bytes, (len(chunk) / (1024 * 1024)) / elapsed)

        return {
            "provider": CLOUD_PROVIDER_META[pid]["name"],
            "remote_path": remote_path,
            "filename": upload_path.name,
        }
    finally:
        if cleanup_temp_zip and cleanup_temp_zip.exists():
            try:
                cleanup_temp_zip.unlink()
            except Exception:
                pass
