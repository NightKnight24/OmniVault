import asyncio
import json
import os
import shutil
import sys
import time
import urllib.parse
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import httpx

from ..database import get_db_connection

CLOUD_SETTINGS_KEY = "cloud_storage_config"

CLOUD_PROVIDER_META: Dict[str, Dict[str, Any]] = {
    "icloud": {
        "id": "icloud",
        "name": "iCloud Drive",
        "short_name": "iCloud",
        "supports_api": False,
        "badge_color": "sky",
    },
    "gdrive": {
        "id": "gdrive",
        "name": "Google Drive",
        "short_name": "GDrive",
        "supports_api": True,
        "badge_color": "emerald",
    },
    "onedrive": {
        "id": "onedrive",
        "name": "OneDrive",
        "short_name": "OneDrive",
        "supports_api": True,
        "badge_color": "blue",
    },
}

VALID_TARGET_IDS = ("local", "icloud", "gdrive", "onedrive")
CLOUD_TARGET_IDS = ("icloud", "gdrive", "onedrive")


def _default_cloud_config() -> Dict[str, Any]:
    return {
        "default_target": "local",
        "providers": {
            "icloud": {
                "custom_path": "",
                "prefer_api": False,
                "delete_local_after_upload": False,
            },
            "gdrive": {
                "custom_path": "",
                "prefer_api": False,
                "delete_local_after_upload": True,
                "access_token": "",
                "refresh_token": "",
                "client_id": "",
                "client_secret": "",
            },
            "onedrive": {
                "custom_path": "",
                "prefer_api": False,
                "delete_local_after_upload": True,
                "access_token": "",
                "refresh_token": "",
                "client_id": "",
                "client_secret": "",
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
                "account": "Apple ID (Local Sync)",
                "free_gb": _safe_disk_free_gb(p),
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
            "free_gb": _safe_disk_free_gb(gdrive_mount),
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
            "free_gb": _safe_disk_free_gb(onedrive_mount),
        }

    return detected


def _build_target_entry(pid: str, cfg: Dict[str, Any], mounts: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    meta = CLOUD_PROVIDER_META[pid]
    pcfg = cfg.get("providers", {}).get(pid) or {}
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
    has_api_token = bool(meta["supports_api"] and (token or (refresh and pcfg.get("client_id"))))
    prefer_api = bool(pcfg.get("prefer_api") and meta["supports_api"])

    mount_path = ""
    roms_path = ""
    account = ""
    free_gb = 0.0
    mode = "unconfigured"
    available = False

    if custom_valid and custom_roms is not None and not prefer_api:
        mount_path = custom_path_str
        roms_path = str(custom_roms)
        account = "Custom Sync Folder"
        free_gb = _safe_disk_free_gb(custom_roms)
        mode = "mount"
        available = True
    elif native and not prefer_api:
        mount_path = native["mount_path"]
        roms_path = native["roms_path"]
        account = native["account"]
        free_gb = native["free_gb"]
        mode = "mount"
        available = True
    elif has_api_token:
        account = "Direct REST API"
        mode = "api"
        available = True
        if native:
            mount_path = native["mount_path"]
            roms_path = native["roms_path"]
            free_gb = native["free_gb"]
    elif custom_valid and custom_roms is not None:
        mount_path = custom_path_str
        roms_path = str(custom_roms)
        account = "Custom Sync Folder"
        free_gb = _safe_disk_free_gb(custom_roms)
        mode = "mount"
        available = True
    elif native:
        mount_path = native["mount_path"]
        roms_path = native["roms_path"]
        account = native["account"]
        free_gb = native["free_gb"]
        mode = "mount"
        available = True

    return {
        "id": pid,
        "name": meta["name"],
        "short_name": meta["short_name"],
        "available": available,
        "mode": mode,
        "mount_path": mount_path,
        "roms_path": roms_path,
        "custom_path": custom_path_str,
        "account": account,
        "free_gb": free_gb,
        "supports_api": bool(meta["supports_api"]),
        "has_api_token": has_api_token,
        "masked_token": _mask_secret(token),
        "prefer_api": prefer_api,
        "delete_local_after_upload": bool(pcfg.get("delete_local_after_upload", True if pid != "icloud" else False)),
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

    provs_payload = payload.get("providers")
    if isinstance(provs_payload, dict):
        for pid in CLOUD_TARGET_IDS:
            upd = provs_payload.get(pid)
            if not isinstance(upd, dict):
                continue
            target_cfg = cfg["providers"].setdefault(pid, {})
            if "custom_path" in upd:
                target_cfg["custom_path"] = str(upd.get("custom_path") or "").strip()
            if "prefer_api" in upd:
                target_cfg["prefer_api"] = bool(upd.get("prefer_api"))
            if "delete_local_after_upload" in upd:
                target_cfg["delete_local_after_upload"] = bool(upd.get("delete_local_after_upload"))
            if upd.get("clear_token"):
                target_cfg["access_token"] = ""
                target_cfg["refresh_token"] = ""
                target_cfg["client_id"] = ""
                target_cfg["client_secret"] = ""
            else:
                for key in ("access_token", "refresh_token", "client_id", "client_secret"):
                    if key in upd and str(upd.get(key) or "").strip():
                        target_cfg[key] = str(upd[key]).strip()

    # Single-provider shorthand fields if posted directly
    single_pid = str(payload.get("provider_id") or "").strip().lower()
    if single_pid in CLOUD_TARGET_IDS:
        target_cfg = cfg["providers"].setdefault(single_pid, {})
        if "custom_path" in payload:
            target_cfg["custom_path"] = str(payload.get("custom_path") or "").strip()
        if "prefer_api" in payload:
            target_cfg["prefer_api"] = bool(payload.get("prefer_api"))
        if "delete_local_after_upload" in payload:
            target_cfg["delete_local_after_upload"] = bool(payload.get("delete_local_after_upload"))
        if payload.get("clear_token"):
            target_cfg["access_token"] = ""
            target_cfg["refresh_token"] = ""
        else:
            for key in ("access_token", "refresh_token", "client_id", "client_secret"):
                if key in payload and str(payload.get(key) or "").strip():
                    target_cfg[key] = str(payload[key]).strip()

    _save_raw_cloud_config(cfg)
    return get_cloud_targets_status()


def resolve_download_destination(platform: str, requested_target: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolves the concrete filesystem directory and cloud upload strategy for a queued download.
    """
    from .storage_service import get_roms_dir

    cfg = _load_raw_cloud_config()
    eff_target = (requested_target or cfg.get("default_target") or "local").strip().lower()
    if eff_target not in VALID_TARGET_IDS:
        eff_target = "local"

    clean_plat = (platform or "Retro").strip() or "Retro"

    if eff_target == "local":
        dest_dir = get_roms_dir() / clean_plat
        dest_dir.mkdir(parents=True, exist_ok=True)
        return {
            "target_id": "local",
            "target_label": "Local Drive",
            "mode": "local",
            "dest_dir": dest_dir,
            "delete_local_after_upload": False,
        }

    mounts = detect_native_cloud_mounts()
    entry = _build_target_entry(eff_target, cfg, mounts)
    if not entry["available"]:
        raise ValueError(
            f"{entry['name']} is not configured or not mounted yet. "
            f"Connect {entry['name']} sync or paste an API token in Settings -> Storage & Downloads."
        )

    if entry["mode"] == "mount" and entry["roms_path"]:
        dest_dir = Path(entry["roms_path"]) / clean_plat
        dest_dir.mkdir(parents=True, exist_ok=True)
        return {
            "target_id": eff_target,
            "target_label": entry["name"],
            "mode": "mount",
            "dest_dir": dest_dir,
            "delete_local_after_upload": False,
        }

    staging_dir = get_roms_dir() / ".cloud_staging" / clean_plat
    staging_dir.mkdir(parents=True, exist_ok=True)
    return {
        "target_id": eff_target,
        "target_label": entry["name"],
        "mode": "api",
        "dest_dir": staging_dir,
        "delete_local_after_upload": bool(entry["delete_local_after_upload"]),
    }


async def _refresh_oauth_token(provider_id: str, pcfg: Dict[str, Any]) -> str:
    access_token = str(pcfg.get("access_token") or "").strip()
    refresh_token = str(pcfg.get("refresh_token") or "").strip()
    client_id = str(pcfg.get("client_id") or "").strip()
    client_secret = str(pcfg.get("client_secret") or "").strip()

    if not refresh_token or not client_id:
        return access_token

    if provider_id == "gdrive":
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": client_id,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        if client_secret:
            data["client_secret"] = client_secret
    elif provider_id == "onedrive":
        token_url = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
        data = {
            "client_id": client_id,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        if client_secret:
            data["client_secret"] = client_secret
    else:
        return access_token

    try:
        async with httpx.AsyncClient(timeout=12.0, verify=False) as client:
            resp = await client.post(token_url, data=data)
            if resp.status_code == 200:
                new_tok = str(resp.json().get("access_token") or "").strip()
                if new_tok:
                    cfg = _load_raw_cloud_config()
                    if provider_id in cfg["providers"]:
                        cfg["providers"][provider_id]["access_token"] = new_tok
                        _save_raw_cloud_config(cfg)
                    return new_tok
    except Exception as exc:
        print(f"[{provider_id} token refresh note]: {exc}")

    return access_token


async def test_cloud_target(provider_id: str, override_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    pid = (provider_id or "").strip().lower()
    if pid not in CLOUD_TARGET_IDS:
        return {"status": "error", "message": f"Unknown cloud provider '{provider_id}'"}

    cfg = _load_raw_cloud_config()
    if isinstance(override_payload, dict):
        pcfg = dict(cfg["providers"].get(pid) or {})
        for k in ("custom_path", "prefer_api", "delete_local_after_upload", "access_token", "refresh_token", "client_id", "client_secret"):
            if k in override_payload and str(override_payload.get(k) or "").strip() != "":
                pcfg[k] = override_payload[k]
        cfg["providers"][pid] = pcfg

    mounts = detect_native_cloud_mounts()
    entry = _build_target_entry(pid, cfg, mounts)

    if not entry["available"]:
        return {
            "status": "error",
            "provider_id": pid,
            "message": f"{entry['name']} sync folder not detected and no API token is configured.",
        }

    if entry["mode"] == "mount" and entry["roms_path"]:
        try:
            roms_dir = Path(entry["roms_path"])
            roms_dir.mkdir(parents=True, exist_ok=True)
            probe = roms_dir / ".omnivault_cloud_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            free_gb = _safe_disk_free_gb(roms_dir)
            return {
                "status": "ok",
                "provider_id": pid,
                "mode": "mount",
                "message": f"{entry['name']} writable at {roms_dir} ({free_gb} GB free)",
                "roms_path": str(roms_dir),
                "free_gb": free_gb,
            }
        except Exception as exc:
            return {
                "status": "error",
                "provider_id": pid,
                "mode": "mount",
                "message": f"{entry['name']} folder not writable: {exc}",
            }

    # REST API connectivity check
    pcfg = cfg["providers"][pid]
    token = str(pcfg.get("access_token") or "").strip()
    if not token and pcfg.get("refresh_token") and pcfg.get("client_id"):
        token = await _refresh_oauth_token(pid, pcfg)

    if not token:
        return {"status": "error", "provider_id": pid, "mode": "api", "message": "Access token missing."}

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
                        "message": f"Google Drive API verified ({email})" + (f" • {free_gb} GB free" if free_gb > 0 else ""),
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
                        "message": f"OneDrive API verified ({owner})" + (f" • {free_gb} GB free" if free_gb > 0 else ""),
                        "free_gb": free_gb,
                    }
                return {"status": "error", "provider_id": pid, "mode": "api", "message": f"OneDrive returned HTTP {resp.status_code}"}
    except Exception as exc:
        return {"status": "error", "provider_id": pid, "mode": "api", "message": str(exc)}

    return {"status": "error", "provider_id": pid, "message": "Unsupported API test"}


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


async def upload_file_to_cloud_api(
    provider_id: str,
    local_path: Path,
    platform: str,
    progress_cb: Optional[Callable[[int, int, float], None]] = None,
) -> Dict[str, Any]:
    """
    Uploads a completed ROM file or packaged game bundle directly to Google Drive or OneDrive via REST API.
    """
    pid = (provider_id or "").strip().lower()
    cfg = _load_raw_cloud_config()
    pcfg = cfg.get("providers", {}).get(pid) or {}
    token = str(pcfg.get("access_token") or "").strip()
    if not token and pcfg.get("refresh_token") and pcfg.get("client_id"):
        token = await _refresh_oauth_token(pid, pcfg)
    if not token:
        raise ValueError(f"No API access token configured for {pid}")

    cleanup_temp_zip: Optional[Path] = None
    upload_path = local_path
    if local_path.is_dir():
        zip_target = local_path.parent / f"{local_path.stem}.zip"
        upload_path = await asyncio.to_thread(_zip_directory_sync, local_path, zip_target)
        cleanup_temp_zip = upload_path

    total_bytes = upload_path.stat().st_size
    clean_plat = (platform or "Retro").strip() or "Retro"

    try:
        async with httpx.AsyncClient(timeout=120.0, verify=False) as client:
            if pid == "gdrive":
                root_id = await _ensure_gdrive_folder(client, token, "OmniVault ROMs")
                plat_id = await _ensure_gdrive_folder(client, token, clean_plat, parent_id=root_id)

                init_resp = await client.post(
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
                    json={"name": upload_path.name, "parents": [plat_id]},
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
                        json={"name": upload_path.name, "parents": [plat_id]},
                        headers={
                            "Authorization": f"Bearer {token}",
                            "Content-Type": "application/json; charset=UTF-8",
                            "X-Upload-Content-Length": str(total_bytes),
                        },
                    )
                if init_resp.status_code not in (200, 201) or not init_resp.headers.get("Location"):
                    raise RuntimeError(f"Google Drive upload init failed: HTTP {init_resp.status_code}")

                session_uri = init_resp.headers["Location"]
                chunk_size = 8 * 1024 * 1024
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
                        if put_resp.status_code not in (200, 201, 308):
                            raise RuntimeError(f"Google Drive chunk upload failed: HTTP {put_resp.status_code}")
                        sent += len(chunk)
                        if progress_cb:
                            elapsed = max(time.monotonic() - t0, 0.01)
                            progress_cb(sent, total_bytes, (len(chunk) / (1024 * 1024)) / elapsed)

                return {
                    "provider": "Google Drive",
                    "remote_path": f"Google Drive/OmniVault ROMs/{clean_plat}/{upload_path.name}",
                    "filename": upload_path.name,
                }

            if pid == "onedrive":
                encoded_plat = urllib.parse.quote(clean_plat)
                encoded_name = urllib.parse.quote(upload_path.name)
                session_url = f"https://graph.microsoft.com/v1.0/me/drive/root:/OmniVault%20ROMs/{encoded_plat}/{encoded_name}:/createUploadSession"
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
                    raise RuntimeError(f"OneDrive upload init failed: HTTP {init_resp.status_code}")
                upload_url = init_resp.json().get("uploadUrl")
                if not upload_url:
                    raise RuntimeError("OneDrive did not return uploadUrl")

                chunk_size = 10 * 1024 * 1024  # multiple of 320 KiB
                sent = 0
                with open(upload_path, "rb") as f:
                    while sent < total_bytes:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        end = sent + len(chunk) - 1
                        t0 = time.monotonic()
                        put_resp = await client.put(
                            upload_url,
                            content=chunk,
                            headers={
                                "Content-Length": str(len(chunk)),
                                "Content-Range": f"bytes {sent}-{end}/{total_bytes}",
                            },
                        )
                        if put_resp.status_code not in (200, 201, 202):
                            raise RuntimeError(f"OneDrive chunk upload failed: HTTP {put_resp.status_code}")
                        sent += len(chunk)
                        if progress_cb:
                            elapsed = max(time.monotonic() - t0, 0.01)
                            progress_cb(sent, total_bytes, (len(chunk) / (1024 * 1024)) / elapsed)

                return {
                    "provider": "OneDrive",
                    "remote_path": f"OneDrive/OmniVault ROMs/{clean_plat}/{upload_path.name}",
                    "filename": upload_path.name,
                }

        raise ValueError(f"Direct REST upload not supported for '{pid}'")
    finally:
        if cleanup_temp_zip and cleanup_temp_zip.exists():
            try:
                cleanup_temp_zip.unlink()
            except Exception:
                pass
