import asyncio
import sys
import shutil
import os
import time
import uuid
import re
import httpx
import subprocess
import urllib.parse
from pathlib import Path
from typing import Dict, Any, List, Optional
from ..database import get_db_connection

ACTIVE_TASKS: Dict[str, asyncio.Task] = {}
DOWNLOAD_STATES: Dict[str, Dict[str, Any]] = {}
DOWNLOAD_QUEUE: List[Dict[str, Any]] = []
CURRENT_DOWNLOAD_ID: Optional[str] = None
QUEUE_PAUSED: bool = False
QUEUE_EVENT: Optional[asyncio.Event] = None
QUEUE_WORKER_TASK: Optional[asyncio.Task] = None

_FAILED_MIRROR_URLS: Dict[str, float] = {}
_FAILED_URL_TTL = 1800.0


def mark_url_failed(url: str) -> None:
    clean = (url or "").strip()
    if clean:
        _FAILED_MIRROR_URLS[clean] = time.monotonic()


def is_url_recently_failed(url: str) -> bool:
    clean = (url or "").strip()
    if not clean:
        return False
    ts = _FAILED_MIRROR_URLS.get(clean)
    if ts is None:
        return False
    if (time.monotonic() - ts) < _FAILED_URL_TTL:
        return True
    _FAILED_MIRROR_URLS.pop(clean, None)
    return False

VALID_ROM_EXTS = {
    ".sfc", ".smc", ".nes", ".z64", ".n64", ".v64",
    ".gba", ".gb", ".gbc", ".nds", ".dsi", ".iso", ".chd", ".rvz", ".cso", ".gcm",
    ".pce", ".sms", ".gg", ".a26", ".a78", ".md", ".gen", ".bin", ".cue", ".pbp",
    ".3ds", ".cia", ".vpk", ".pkg", ".nsp", ".xci", ".wux", ".wud", ".rpx", ".xbe", ".xex",
    ".dmg", ".exe", ".msi", ".toast", ".img",
}

def _ensure_downloads_cloud_columns() -> None:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cols = {r[1] for r in cursor.execute("PRAGMA table_info(downloads)").fetchall()}
        if "destination_target" not in cols:
            cursor.execute("ALTER TABLE downloads ADD COLUMN destination_target TEXT DEFAULT 'local'")
        if "destination_label" not in cols:
            cursor.execute("ALTER TABLE downloads ADD COLUMN destination_label TEXT DEFAULT 'Local Drive'")
        conn.commit()
        conn.close()
    except Exception as exc:
        print(f"[Downloads Column Migration Note]: {exc}")


def get_download_dir(platform: str = "SNES") -> Path:
    """
    Allocates downloads to the configured ROMs folder (e.g. /Volumes/ROMS or custom user directory).
    """
    from .storage_service import get_roms_dir
    p = get_roms_dir() / platform
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_download_headers(url: str) -> Dict[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*"
    }
    try:
        from .mirror_resolver import find_referer_for_url
        matched_referer = find_referer_for_url(url)
    except Exception:
        matched_referer = None

    if matched_referer:
        headers["Referer"] = matched_referer
    else:
        try:
            parsed = urllib.parse.urlparse(url)
            host_low = (parsed.netloc or "").lower()
            if parsed.scheme and parsed.netloc and not host_low.endswith("real-debrid.com"):
                headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"
        except Exception:
            pass
    return headers

def _bundle_size(path: Path) -> int:
    """Computes total byte size of all files inside a directory or macOS .app bundle."""
    try:
        return sum(bf.stat().st_size for bf in path.rglob("*") if bf.is_file())
    except Exception:
        return 0


def extract_and_resolve_rom_file(archive_path: Path, game_title: str = "", platform: str = "") -> Path:
    """
    Extracts .zip, .7z, or .rar archives and identifies the extracted playable ROM/game file or bundle.
    For Windows, macOS, and PS5 multi-file releases, extracts into a per-title subfolder to keep assets isolated.
    Cleans up redundant archive files to prevent double disk space and ghost library duplicates.
    Returns the path to the primary file, .app bundle, extracted folder, or archive_path on fallback.
    """
    ext = archive_path.suffix.lower()
    dest_dir = archive_path.parent
    plat_up = (platform or dest_dir.name or "").upper()
    is_folder_platform = plat_up in ("WINDOWS", "MACOS", "PS5")

    extract_dir = dest_dir / archive_path.stem if (is_folder_platform and ext in (".zip", ".7z", ".rar")) else dest_dir
    if extract_dir != dest_dir:
        extract_dir.mkdir(parents=True, exist_ok=True)

    # 1. Perform extraction if archive
    extracted_successfully = False
    if ext == ".zip":
        try:
            import zipfile
            with zipfile.ZipFile(archive_path, 'r') as zf:
                zf.extractall(extract_dir)
            extracted_successfully = True
        except Exception as ze:
            print(f"[AutoExtract Zip Error] {ze}")
    elif ext in (".7z", ".rar"):
        try:
            if sys.platform == "win32":
                win_7z = [
                    r"C:\OmniVault\bin\7z.exe",
                    r"C:\Windows\System32\7z.exe",
                    r"C:\Program Files\Python312-arm64\Scripts\7z.exe"
                ]
                cmd = next((c for c in win_7z if os.path.exists(c)), shutil.which("7z.exe") or shutil.which("7z") or "7z")
            else:
                cmd = "/opt/homebrew/bin/7z" if os.path.exists("/opt/homebrew/bin/7z") else "7z"
            res = subprocess.run([cmd, "x", "-y", f"-o{extract_dir}", str(archive_path)], capture_output=True, check=False)
            if res.returncode == 0:
                extracted_successfully = True
        except Exception as se:
            print(f"[AutoExtract 7z/rar Error] {se}")

    # 2. Check for extracted files or macOS .app bundles inside scan_root
    scan_root = extract_dir if (is_folder_platform and extracted_successfully) else dest_dir
    candidates = []
    now = time.time()
    try:
        for f in scan_root.rglob("*"):
            if any(parent.suffix.lower() == ".app" for parent in f.parents):
                continue
            if plat_up == "MACOS" and f.is_dir() and f.suffix.lower() == ".app":
                candidates.append((f, f.stat().st_mtime, _bundle_size(f)))
            elif f.is_file() and f.suffix.lower() in VALID_ROM_EXTS and not f.name.endswith(".part"):
                candidates.append((f, f.stat().st_mtime, f.stat().st_size))
    except Exception as e:
        print(f"[Scan Extracted ROM Error]: {e}")

    primary_rom: Optional[Path] = None
    if candidates:
        candidates.sort(key=lambda c: (c[1] > now - 600, c[2]), reverse=True)
        primary_rom = candidates[0][0]
    elif is_folder_platform and extracted_successfully:
        try:
            if any(f.is_file() for f in extract_dir.rglob("*")):
                primary_rom = extract_dir
        except Exception:
            pass

    if primary_rom is not None:
        if extracted_successfully and primary_rom != archive_path and primary_rom.suffix.lower() not in (".zip", ".7z", ".rar"):
            try:
                if archive_path.exists():
                    archive_path.unlink()
            except Exception as ue:
                print(f"[Archive unlink note]: {ue}")
        return primary_rom

    return archive_path

async def _finalize_cloud_api_upload_if_needed(
    download_id: str,
    final_rom_path: Path,
    platform: str,
    dest_meta: Optional[Dict[str, Any]],
) -> str:
    """
    If the queued destination is a Cloud REST API target (Google Drive / OneDrive API mode),
    uploads the resolved ROM/bundle and optionally cleans up local staging files.
    Returns the final stored destination_path string.
    """
    if not dest_meta or dest_meta.get("mode") != "api":
        return str(final_rom_path)

    target_id = dest_meta.get("target_id", "")
    target_label = dest_meta.get("target_label") or "Cloud Drive"
    last_emit = 0.0

    def on_upload_progress(sent: int, total: int, speed_mbps: float) -> None:
        nonlocal last_emit
        now = time.monotonic()
        if now - last_emit < 0.4 and sent < total:
            return
        last_emit = now
        pct = min(99.9, round((sent / max(total, 1)) * 100.0, 1))
        st = {
            "status": "downloading",
            "progress": pct,
            "downloaded_bytes": sent,
            "total_bytes": total,
            "speed": f"☁️ {speed_mbps:.1f} MB/s",
            "eta": f"Uploading to {target_label}...",
        }
        if download_id in DOWNLOAD_STATES:
            DOWNLOAD_STATES[download_id].update(st)
        update_db_download(download_id, st)

    init_up = {
        "status": "downloading",
        "progress": 0.0,
        "speed": f"☁️ Connecting {target_label}...",
        "eta": f"Uploading to {target_label}...",
    }
    if download_id in DOWNLOAD_STATES:
        DOWNLOAD_STATES[download_id].update(init_up)
    update_db_download(download_id, init_up)

    from .cloud_storage_service import upload_file_to_cloud_api
    upload_res = await upload_file_to_cloud_api(
        provider_id=target_id,
        local_path=final_rom_path,
        platform=platform,
        progress_cb=on_upload_progress,
    )
    remote_path = upload_res.get("remote_path") or f"{target_label}/{platform}/{final_rom_path.name}"

    if dest_meta.get("delete_local_after_upload") and final_rom_path.exists():
        try:
            if final_rom_path.is_dir():
                shutil.rmtree(final_rom_path, ignore_errors=True)
            else:
                final_rom_path.unlink(missing_ok=True)
        except Exception as exc:
            print(f"[Cloud Staging Cleanup Note]: {exc}")
        return remote_path

    return str(final_rom_path)


async def download_torrent_worker(
    download_id: str,
    magnet_or_torrent: str,
    dest_dir: Path,
    game_title: str = "",
    platform: str = "",
    dest_meta: Optional[Dict[str, Any]] = None,
):
    """
    Native BitTorrent Downloader using aria2c with automatic public DHT, trackers,
    progress parsing, auto-extraction, and mirror failover.
    """
    proc = None
    try:
        from .realdebrid_service import is_realdebrid_active, resolve_magnet
        if is_realdebrid_active() and magnet_or_torrent.startswith("magnet:"):
            rd_state = {
                "status": "downloading",
                "progress": 0.0,
                "speed": "Checking Real-Debrid cache...",
                "eta": "Resolving...",
                "downloaded_bytes": 0,
                "total_bytes": 0,
            }
            DOWNLOAD_STATES[download_id].update(rd_state)
            update_db_download(download_id, rd_state)
            rd_res = await resolve_magnet(magnet_or_torrent)
            if rd_res and rd_res.get("download"):
                rd_name = rd_res.get("filename") or (f"{game_title}.zip" if game_title else "rom_archive.zip")
                rd_dest = dest_dir / rd_name
                print(f"[Real-Debrid] Resolved cached magnet to CDN: {rd_name}")
                return await download_file_worker(
                    download_id,
                    rd_res["download"],
                    rd_dest,
                    game_title=game_title,
                    platform=platform,
                    dest_meta=dest_meta,
                )

        if sys.platform == "win32":
            win_candidates = [
                r"C:\OmniVault\bin\aria2c.exe",
                r"C:\Windows\System32\aria2c.exe",
                r"C:\Program Files\Python312-arm64\Scripts\aria2c.exe"
            ]
            aria2_bin = next((c for c in win_candidates if os.path.exists(c)), shutil.which("aria2c.exe") or shutil.which("aria2c") or "aria2c")
        else:
            aria2_bin = "/opt/homebrew/bin/aria2c" if os.path.exists("/opt/homebrew/bin/aria2c") else "aria2c"
        
        state = {
            "status": "downloading",
            "progress": 0.0,
            "speed": "Connecting to peers...",
            "eta": "Connecting...",
            "downloaded_bytes": 0,
            "total_bytes": 0
        }
        DOWNLOAD_STATES[download_id].update(state)
        update_db_download(download_id, state)
        
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        trackers = [
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.tracker.cl:1337/announce",
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://opentracker.i2p.rocks:6969/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://open.stealth.si:80/announce",
            "udp://explodie.org:6969/announce",
            "http://tracker.openbittorrent.com:80/announce"
        ]
        tracker_arg = f"--bt-tracker={','.join(trackers)}"

        cmd = [
            aria2_bin,
            f"--dir={dest_dir}",
            "--seed-time=0",
            "--bt-stop-timeout=60",
            "--file-allocation=none",
            "--summary-interval=1",
            "--max-connection-per-server=16",
            "--enable-dht=true",
            "--dht-entry-point=dht.transmissionbt.com:6881",
            "--dht-entry-point6=dht.transmissionbt.com:6881",
            "--bt-enable-lpd=true",
            "--check-certificate=false",
            "--follow-torrent=mem",
            tracker_arg,
            magnet_or_torrent
        ]
        
        existing_files = set()
        try:
            existing_files = set(dest_dir.rglob("*"))
        except Exception:
            pass

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        
        last_update = time.time()
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace")
            
            # Check if paused or cancelled
            if download_id in DOWNLOAD_STATES and DOWNLOAD_STATES[download_id].get("status") == "paused":
                proc.terminate()
                return
                
            m_pct = re.search(r"\((\d+)%\)", line)
            m_spd = re.search(r"DL:([^\s\]]+)", line)
            m_eta = re.search(r"ETA:([^\s\]]+)", line)
            m_peers = re.search(r"CN:(\d+)", line)
            
            now = time.time()
            if now - last_update >= 0.5:
                prog = float(m_pct.group(1)) if m_pct else DOWNLOAD_STATES[download_id].get("progress", 0.0)
                speed_str = m_spd.group(1) if m_spd else ("Connecting to peers..." if not m_pct else "Downloading")
                eta_str = m_eta.group(1) if m_eta else ""
                
                if m_peers and not m_pct:
                    speed_str = f"Connecting (Peers: {m_peers.group(1)})"
                
                cur_state = {
                    "status": "downloading",
                    "progress": prog,
                    "speed": f"{speed_str}/s" if (speed_str.endswith("B") or speed_str.endswith("b")) else speed_str,
                    "eta": eta_str
                }
                DOWNLOAD_STATES[download_id].update(cur_state)
                update_db_download(download_id, cur_state)
                last_update = now
                
        await proc.wait()
        if proc.returncode == 0:
            # Identify downloaded ROM file or extract archive
            resolved_file = None
            try:
                now = time.time()
                plat_up = (platform or dest_dir.name or "").upper()
                resolved_from_archives = []
                # 1. First extract any new archive files (.zip, .7z, .rar)
                new_archives = [
                    f for f in dest_dir.rglob("*")
                    if f.is_file() and f.suffix.lower() in (".zip", ".7z", ".rar") and (f not in existing_files or f.stat().st_mtime > now - 600)
                ]
                for arc in new_archives:
                    resolved_from_archives.append(extract_and_resolve_rom_file(arc, game_title, platform))

                # 2. Find primary playable ROM file or .app bundle recursively
                candidates = []
                for f in dest_dir.rglob("*"):
                    if any(parent.suffix.lower() == ".app" for parent in f.parents):
                        continue
                    if plat_up == "MACOS" and f.is_dir() and f.suffix.lower() == ".app":
                        mtime = f.stat().st_mtime
                        size = _bundle_size(f)
                        is_new = f not in existing_files or mtime > now - 600
                        candidates.append((f, is_new, size, mtime))
                    elif f.is_file() and f.suffix.lower() in VALID_ROM_EXTS and not f.name.endswith(".part"):
                        mtime = f.stat().st_mtime
                        size = f.stat().st_size
                        is_new = f not in existing_files or mtime > now - 600
                        candidates.append((f, is_new, size, mtime))

                if candidates:
                    # Prioritize newly created/modified ROMs and largest size
                    candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)
                    resolved_file = candidates[0][0]
                elif resolved_from_archives:
                    resolved_file = resolved_from_archives[0]
            except Exception as se:
                print(f"[Torrent Scan Error]: {se}")

            final_dest_path = resolved_file or dest_dir
            final_fname = resolved_file.name if resolved_file else (f"{game_title}.zip" if game_title else "ROM Archive")
            final_dest = await _finalize_cloud_api_upload_if_needed(download_id, final_dest_path, platform, dest_meta)
            eta_label = (
                f"Saved to {dest_meta['target_label']}"
                if (dest_meta and dest_meta.get("target_id") != "local")
                else "Complete"
            )

            final_state = {
                "status": "completed",
                "progress": 100.0,
                "speed": "0 MB/s",
                "eta": eta_label,
                "filename": final_fname,
                "destination_path": final_dest
            }
            DOWNLOAD_STATES[download_id].update(final_state)
            update_db_download(download_id, final_state)
            try:
                from ..routers.downloads import invalidate_installed_cache
                invalidate_installed_cache()
            except Exception:
                pass
            return
        else:
            raise Exception(f"aria2c exited with code {proc.returncode}")
            
    except asyncio.CancelledError:
        if proc:
            try:
                proc.terminate()
            except Exception:
                pass
        if download_id in DOWNLOAD_STATES:
            state = {"status": "paused", "speed": "0 MB/s"}
            DOWNLOAD_STATES[download_id].update(state)
            update_db_download(download_id, state)
        return
    except Exception as e:
        print(f"[Torrent Downloader Error]: {e}")
        # Automatic mirror failover to direct CDN if available
        if game_title and platform:
            try:
                from .mirror_resolver import mirror_resolver
                mirrors = await mirror_resolver.get_rom_mirrors(game_title, platform)
                direct_candidates = [m for m in mirrors if m.get("is_direct") and not (m.get("direct_url") or "").startswith("magnet:")]
                if direct_candidates:
                    working_url = direct_candidates[0]["direct_url"]
                    dest_path = dest_dir / (direct_candidates[0].get("filename") or f"{game_title}.zip")
                    print(f"[Torrent Failover] Falling back to direct CDN: {working_url}")
                    return await download_file_worker(download_id, working_url, dest_path, game_title=game_title, platform=platform, dest_meta=dest_meta)
            except Exception as fe:
                print(f"[Torrent Failover Error]: {fe}")

        error_state = {
            "status": "error",
            "error_message": f"Torrent download failed: {str(e)}",
            "speed": "0 MB/s"
        }
        DOWNLOAD_STATES[download_id].update(error_state)
        update_db_download(download_id, error_state)

async def download_file_worker(
    download_id: str,
    url: str,
    dest_path: Path,
    game_title: str = "",
    platform: str = "",
    dest_meta: Optional[Dict[str, Any]] = None,
    tried_urls: Optional[set] = None,
    failover_depth: int = 0,
):
    temp_path = dest_path.with_suffix(dest_path.suffix + ".part")
    downloaded = 0
    total_size = 0
    seen_urls = set(tried_urls or ())
    orig_url = url
    if orig_url:
        seen_urls.add(orig_url)
    
    try:
        if not url:
            raise ValueError("No primary URL configured — resolving live mirror")

        from .realdebrid_service import is_realdebrid_active, is_hoster_url, unrestrict_link
        if is_realdebrid_active() and is_hoster_url(url):
            rd_state = {
                "status": "downloading",
                "progress": 0.0,
                "speed": "Unrestricting via Real-Debrid...",
                "eta": "Resolving...",
                "downloaded_bytes": downloaded,
                "total_bytes": 0,
            }
            DOWNLOAD_STATES[download_id].update(rd_state)
            update_db_download(download_id, rd_state)
            rd_res = await unrestrict_link(url)
            if rd_res and rd_res.get("download"):
                url = rd_res["download"]
                seen_urls.add(url)
                if rd_res.get("filename"):
                    safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", os.path.basename(rd_res["filename"])).strip(" .")
                    if safe_name:
                        dest_path = dest_path.parent / safe_name
                        temp_path = dest_path.with_suffix(dest_path.suffix + ".part")
                print(f"[Real-Debrid] Unrestricted hoster link -> {dest_path.name}")

        # ZERO-LOCAL-DISK DIRECT RAM-TO-CLOUD STREAMING (Google Drive / OneDrive API Mode)
        if dest_meta and dest_meta.get("mode") == "api":
            from .cloud_storage_service import stream_url_to_cloud_api

            target_label = dest_meta.get("target_label") or "Cloud Drive"
            last_emit = 0.0

            def _on_stream_progress(sent: int, total: int, speed_mbps: float) -> None:
                nonlocal last_emit
                now_m = time.monotonic()
                if now_m - last_emit < 0.35 and (total <= 0 or sent < total):
                    return
                last_emit = now_m
                pct = 0.0 if total <= 0 else min(99.9, round((sent / total) * 100.0, 1))
                if total > 0 and speed_mbps > 0:
                    rem_b = max(0, total - sent)
                    eta_s = int(rem_b / max(speed_mbps * 1024 * 1024, 1))
                    eta_txt = f"{eta_s}s" if eta_s < 60 else f"{eta_s // 60}m {eta_s % 60}s"
                    eta_disp = f"Direct → {target_label} ({eta_txt})"
                else:
                    eta_disp = f"Direct → {target_label} (Streaming...)"
                st = {
                    "status": "downloading",
                    "progress": pct,
                    "downloaded_bytes": sent,
                    "total_bytes": total,
                    "speed": f"☁️ {speed_mbps:.1f} MB/s",
                    "eta": eta_disp,
                }
                if download_id in DOWNLOAD_STATES:
                    DOWNLOAD_STATES[download_id].update(st)
                update_db_download(download_id, st)

            init_cloud = {
                "status": "downloading",
                "progress": 0.0,
                "speed": f"☁️ Streaming → {target_label}...",
                "eta": "0 Local Disk...",
                "downloaded_bytes": 0,
                "total_bytes": 0,
            }
            if download_id in DOWNLOAD_STATES:
                DOWNLOAD_STATES[download_id].update(init_cloud)
            update_db_download(download_id, init_cloud)

            stream_res = await stream_url_to_cloud_api(
                provider_id=dest_meta["target_id"],
                source_url=url,
                request_headers=get_download_headers(url),
                fallback_filename=dest_path.name,
                platform=platform,
                progress_cb=_on_stream_progress,
                is_paused_cb=lambda: bool(download_id in DOWNLOAD_STATES and DOWNLOAD_STATES[download_id].get("status") == "paused"),
            )
            if stream_res.get("status") == "paused":
                return

            done_state = {
                "status": "completed",
                "progress": 100.0,
                "downloaded_bytes": stream_res.get("total_bytes", 0),
                "total_bytes": stream_res.get("total_bytes", 0),
                "speed": "0 MB/s",
                "eta": f"Streamed to {target_label} (0 Local Disk)",
                "filename": stream_res.get("filename") or dest_path.name,
                "destination_path": stream_res.get("remote_path") or f"{target_label}:/OmniVault/ROMs/{platform}/{dest_path.name}",
            }
            if download_id in DOWNLOAD_STATES:
                DOWNLOAD_STATES[download_id].update(done_state)
            update_db_download(download_id, done_state)
            return

        dest_path.parent.mkdir(parents=True, exist_ok=True)

        state = {
            "status": "downloading",
            "progress": 0.0,
            "speed": "Connecting to mirror...",
            "eta": "Starting...",
            "downloaded_bytes": downloaded,
            "total_bytes": 0
        }
        DOWNLOAD_STATES[download_id].update(state)
        update_db_download(download_id, state)

        # Check existing bytes if resuming
        if temp_path.exists():
            downloaded = temp_path.stat().st_size
            
        headers = get_download_headers(url)
        if downloaded > 0:
            headers["Range"] = f"bytes={downloaded}-"
            
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, verify=False) as client:
            async with client.stream("GET", url, headers=headers) as response:
                if response.status_code in (200, 206):
                    c_type = response.headers.get("Content-Type", "").lower()
                    if any(h in c_type for h in ("text/html", "text/xml", "application/xhtml+xml")):
                        raise ValueError(f"Target mirror returned HTML webpage ({c_type}) instead of binary ROM stream")
                    
                    content_length = response.headers.get("Content-Length")
                    if content_length:
                        total_size = downloaded + int(content_length)
                    else:
                        total_size = 0
                        
                    mode = "ab" if downloaded > 0 else "wb"
                    with open(temp_path, mode) as f:
                        last_update = time.time()
                        bytes_since_update = 0
                        
                        async for chunk in response.aiter_bytes(chunk_size=65536):
                            if download_id in DOWNLOAD_STATES and DOWNLOAD_STATES[download_id].get("status") == "paused":
                                return
                                
                            f.write(chunk)
                            downloaded += len(chunk)
                            bytes_since_update += len(chunk)
                            
                            now = time.time()
                            if now - last_update >= 0.5:
                                elapsed = now - last_update
                                speed_bps = bytes_since_update / elapsed
                                speed_mb = speed_bps / (1024 * 1024)
                                progress = min(100.0, round((downloaded / total_size) * 100, 1)) if total_size > 0 else 0.0
                                
                                remaining_bytes = max(0, total_size - downloaded) if total_size > 0 else 0
                                eta_secs = int(remaining_bytes / speed_bps) if (speed_bps > 0 and total_size > 0) else 0
                                eta_str = f"{eta_secs}s" if eta_secs < 60 else f"{eta_secs//60}m {eta_secs%60}s"
                                
                                state = {
                                    "status": "downloading",
                                    "progress": progress,
                                    "downloaded_bytes": downloaded,
                                    "total_bytes": total_size,
                                    "speed": f"{speed_mb:.1f} MB/s",
                                    "eta": eta_str
                                }
                                DOWNLOAD_STATES[download_id].update(state)
                                update_db_download(download_id, state)
                                
                                last_update = now
                                bytes_since_update = 0
                                
                    # Finished successfully!
                    if temp_path.exists():
                        file_size = temp_path.stat().st_size
                        ext = dest_path.suffix.lower()
                        is_disc = ext in (".pkg", ".iso", ".wux", ".rvz", ".chd", ".nsp", ".xci", ".god")
                        if is_disc and file_size < 1_000_000:
                            temp_path.unlink()
                            raise ValueError(f"Downloaded disc/package file is only {file_size} bytes (invalid dump or blocked download)")
                        elif file_size < 1024:
                            temp_path.unlink()
                            raise ValueError(f"Downloaded file is suspiciously small ({file_size} bytes)")
                        temp_path.rename(dest_path)
                        
                    # Auto-extract and resolve primary playable ROM path
                    final_rom_path = extract_and_resolve_rom_file(dest_path, game_title, platform)
                    stored_dest = await _finalize_cloud_api_upload_if_needed(download_id, final_rom_path, platform, dest_meta)
                    if dest_meta and dest_meta.get("mode") == "mount" and dest_meta.get("evict_local_after_sync"):
                        from .cloud_storage_service import schedule_cloud_mount_eviction
                        schedule_cloud_mount_eviction(final_rom_path)
                    eta_label = (
                        f"Saved to {dest_meta['target_label']}"
                        if (dest_meta and dest_meta.get("target_id") != "local")
                        else "Complete"
                    )
                        
                    final_state = {
                        "status": "completed",
                        "progress": 100.0,
                        "downloaded_bytes": total_size,
                        "total_bytes": total_size,
                        "speed": "0 MB/s",
                        "eta": eta_label,
                        "filename": final_rom_path.name,
                        "destination_path": stored_dest
                    }
                    DOWNLOAD_STATES[download_id].update(final_state)
                    update_db_download(download_id, final_state)
                    try:
                        from ..routers.downloads import invalidate_installed_cache
                        invalidate_installed_cache()
                    except Exception:
                        pass
                    return
                else:
                    raise Exception(f"HTTP {response.status_code}")
    except asyncio.CancelledError:
        if download_id in DOWNLOAD_STATES:
            state = {"status": "paused", "speed": "0 MB/s"}
            DOWNLOAD_STATES[download_id].update(state)
            update_db_download(download_id, state)
        return
    except Exception as e:
        print(f"[Downloader Error] {orig_url} -> {e}")
        mark_url_failed(orig_url)
        if url and url != orig_url:
            mark_url_failed(url)
        # AUTOMATIC MIRROR / TORRENT FAILOVER (bounded, deduplicated & Base-Game-first)
        if failover_depth < 5 and game_title and platform:
            try:
                state = {
                    "status": "resolving_mirror",
                    "speed": "0 MB/s",
                    "eta": "Trying next mirror..."
                }
                if download_id in DOWNLOAD_STATES:
                    DOWNLOAD_STATES[download_id].update(state)
                update_db_download(download_id, state)
                
                from .mirror_resolver import mirror_resolver, _stream_part_rank
                mirrors = await mirror_resolver.get_rom_mirrors(game_title, platform)
                if mirrors:
                    # 1. Try alternative verified Base-Game direct mirror not already attempted
                    direct_candidates = [
                        m for m in mirrors
                        if m.get("is_direct") and m.get("direct_url") and m.get("direct_url") not in seen_urls
                    ]
                    direct_candidates.sort(
                        key=lambda m: (
                            _stream_part_rank(m.get("title", ""), m.get("source_name", "")),
                            not bool(m.get("speed_verified")),
                            int(m.get("rank") or 999),
                        )
                    )
                    if direct_candidates:
                        working_url = direct_candidates[0]["direct_url"]
                        return await download_file_worker(
                            download_id,
                            working_url,
                            dest_path,
                            game_title=game_title,
                            platform=platform,
                            dest_meta=dest_meta,
                            tried_urls=seen_urls,
                            failover_depth=failover_depth + 1,
                        )
                    # 2. Try BitTorrent magnet mirror not already attempted
                    torrent_candidates = [
                        m for m in mirrors
                        if m.get("direct_url")
                        and m.get("direct_url") not in seen_urls
                        and (m.get("direct_url", "").startswith("magnet:") or m.get("direct_url", "").endswith(".torrent"))
                    ]
                    if torrent_candidates:
                        working_magnet = torrent_candidates[0]["direct_url"]
                        return await download_torrent_worker(download_id, working_magnet, dest_path.parent, game_title=game_title, platform=platform, dest_meta=dest_meta)
            except Exception as fe:
                print(f"[Downloader Failover Error]: {fe}")
                
        error_msg = f"{str(e)}"
        if "Primary & Mirror" not in error_msg:
            error_msg = f"{error_msg} — Hoster/CDN unavailable right now; pick another mirror in Download Sources."
            
        error_state = {
            "status": "error",
            "eta": "Mirror unavailable",
            "error_message": error_msg,
            "speed": "0 MB/s"
        }
        if download_id in DOWNLOAD_STATES:
            DOWNLOAD_STATES[download_id].update(error_state)
        update_db_download(download_id, error_state)

def update_db_download(download_id: str, fields: Dict[str, Any]):
    if not fields:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
    values = list(fields.values()) + [download_id]
    cursor.execute(f"UPDATE downloads SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
    conn.commit()
    conn.close()


def _get_queue_event() -> asyncio.Event:
    global QUEUE_EVENT
    if QUEUE_EVENT is None:
        QUEUE_EVENT = asyncio.Event()
    return QUEUE_EVENT


def _sync_queue_positions() -> None:
    if CURRENT_DOWNLOAD_ID and CURRENT_DOWNLOAD_ID in DOWNLOAD_STATES:
        DOWNLOAD_STATES[CURRENT_DOWNLOAD_ID]["queue_position"] = 0
    for idx, job in enumerate(DOWNLOAD_QUEUE, start=1):
        qid = job["download_id"]
        if qid in DOWNLOAD_STATES:
            DOWNLOAD_STATES[qid]["queue_position"] = idx
            if DOWNLOAD_STATES[qid].get("status") == "queued":
                DOWNLOAD_STATES[qid]["eta"] = (
                    "Queue Paused" if QUEUE_PAUSED else f"Queued (#{idx} in line)"
                )


def get_queue_status() -> Dict[str, Any]:
    return {
        "active_id": CURRENT_DOWNLOAD_ID,
        "queued_count": len(DOWNLOAD_QUEUE),
        "paused": QUEUE_PAUSED,
        "max_concurrent": 1,
    }


async def _queue_worker_loop() -> None:
    """Strictly executes 1 download job at a time from DOWNLOAD_QUEUE in order."""
    global CURRENT_DOWNLOAD_ID
    evt = _get_queue_event()
    while True:
        if QUEUE_PAUSED or not DOWNLOAD_QUEUE:
            evt.clear()
            if QUEUE_PAUSED or not DOWNLOAD_QUEUE:
                await evt.wait()
            continue

        job = DOWNLOAD_QUEUE.pop(0)
        download_id = job["download_id"]
        if download_id not in DOWNLOAD_STATES:
            _sync_queue_positions()
            continue

        CURRENT_DOWNLOAD_ID = download_id
        _sync_queue_positions()

        if job["is_torrent"]:
            coro = download_torrent_worker(
                download_id,
                job["url"],
                job["dest_dir"],
                game_title=job["game_title"],
                platform=job["platform"],
                dest_meta=job.get("dest_meta"),
            )
        else:
            coro = download_file_worker(
                download_id,
                job["url"],
                job["dest_path"],
                game_title=job["game_title"],
                platform=job["platform"],
                dest_meta=job.get("dest_meta"),
            )

        task = asyncio.create_task(coro)
        ACTIVE_TASKS[download_id] = task
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            print(f"[Queue Worker Error for {download_id}]: {exc}")
        finally:
            if ACTIVE_TASKS.get(download_id) is task:
                ACTIVE_TASKS.pop(download_id, None)
            if CURRENT_DOWNLOAD_ID == download_id:
                CURRENT_DOWNLOAD_ID = None
            _sync_queue_positions()


def _ensure_queue_worker() -> None:
    global QUEUE_WORKER_TASK
    if QUEUE_WORKER_TASK is None or QUEUE_WORKER_TASK.done():
        QUEUE_WORKER_TASK = asyncio.create_task(_queue_worker_loop())


def move_queued_download(download_id: str, direction: str) -> bool:
    """Moves a waiting download in DOWNLOAD_QUEUE ('up', 'down', or 'top')."""
    idx = next((i for i, j in enumerate(DOWNLOAD_QUEUE) if j["download_id"] == download_id), None)
    if idx is None:
        return False
    dir_clean = (direction or "").strip().lower()
    if dir_clean == "top":
        job = DOWNLOAD_QUEUE.pop(idx)
        DOWNLOAD_QUEUE.insert(0, job)
    elif dir_clean == "up" and idx > 0:
        DOWNLOAD_QUEUE[idx - 1], DOWNLOAD_QUEUE[idx] = DOWNLOAD_QUEUE[idx], DOWNLOAD_QUEUE[idx - 1]
    elif dir_clean == "down" and idx < len(DOWNLOAD_QUEUE) - 1:
        DOWNLOAD_QUEUE[idx + 1], DOWNLOAD_QUEUE[idx] = DOWNLOAD_QUEUE[idx], DOWNLOAD_QUEUE[idx + 1]
    _sync_queue_positions()
    return True


def cancel_or_remove_download(download_id: str) -> None:
    """Removes a queued item or cancels the currently active item so the next queued job starts immediately."""
    DOWNLOAD_QUEUE[:] = [j for j in DOWNLOAD_QUEUE if j["download_id"] != download_id]
    task = ACTIVE_TASKS.pop(download_id, None)
    DOWNLOAD_STATES.pop(download_id, None)
    if task and not task.done():
        task.cancel()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM downloads WHERE id = ?", (download_id,))
    conn.commit()
    conn.close()
    _sync_queue_positions()


def set_queue_paused(paused: bool) -> Dict[str, Any]:
    global QUEUE_PAUSED
    QUEUE_PAUSED = bool(paused)
    if not QUEUE_PAUSED:
        _ensure_queue_worker()
        _get_queue_event().set()
    _sync_queue_positions()
    return get_queue_status()


def clear_finished_downloads() -> int:
    """Removes completed, errored, and paused history records without touching active or queued downloads."""
    finished_ids = [
        did for did, st in list(DOWNLOAD_STATES.items())
        if st.get("status") in ("completed", "error", "paused")
    ]
    for did in finished_ids:
        DOWNLOAD_STATES.pop(did, None)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM downloads WHERE status IN ('completed', 'error', 'paused')")
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return max(deleted, len(finished_ids))


def queue_download(
    game_id: str,
    game_title: str,
    platform: str,
    url: str,
    filename: str,
    download_type: str = "direct",
    destination_target: Optional[str] = None,
) -> Dict[str, Any]:
    _ensure_downloads_cloud_columns()
    from .cloud_storage_service import resolve_download_destination

    dest_meta = resolve_download_destination(platform, destination_target)
    download_id = str(uuid.uuid4())[:8]
    dest_dir = Path(dest_meta["dest_dir"])
    safe_filename = os.path.basename(filename or "") or f"{game_title}.zip"
    dest_path = dest_dir / safe_filename
    dest_target_id = str(dest_meta["target_id"])
    dest_target_label = str(dest_meta["target_label"])

    is_torrent = url.startswith("magnet:") or url.endswith(".torrent") or download_type in ("magnet", "torrent")
    effective_type = "torrent" if is_torrent else "direct"
    queue_pos = len(DOWNLOAD_QUEUE) + 1
    initial_eta = "Starting..." if (CURRENT_DOWNLOAD_ID is None and not QUEUE_PAUSED and queue_pos == 1) else f"Queued (#{queue_pos} in line)"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO downloads (
        id, game_id, game_title, platform, filename, download_type,
        source_url, status, progress, eta, destination_path,
        destination_target, destination_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0.0, ?, ?, ?, ?)
    """, (
        download_id, game_id, game_title, platform, safe_filename, effective_type,
        url, initial_eta, str(dest_path), dest_target_id, dest_target_label
    ))
    conn.commit()
    conn.close()

    DOWNLOAD_STATES[download_id] = {
        "id": download_id,
        "game_id": game_id,
        "game_title": game_title,
        "platform": platform,
        "filename": safe_filename,
        "download_type": effective_type,
        "status": "queued",
        "progress": 0.0,
        "speed": "0 MB/s",
        "eta": initial_eta,
        "queue_position": queue_pos,
        "destination_path": str(dest_path),
        "destination_target": dest_target_id,
        "destination_label": dest_target_label,
    }

    DOWNLOAD_QUEUE.append({
        "download_id": download_id,
        "game_id": game_id,
        "game_title": game_title,
        "platform": platform,
        "url": url,
        "dest_dir": dest_dir,
        "dest_path": dest_path,
        "dest_meta": dest_meta,
        "is_torrent": is_torrent,
    })
    _sync_queue_positions()
    _ensure_queue_worker()
    _get_queue_event().set()
    return DOWNLOAD_STATES[download_id]

def recover_stalled_downloads():
    """
    On backend initialization, scans the downloads database.
    Fixes orphaned 'queued' or 'downloading' tasks left behind by previous sessions.
    """
    try:
        _ensure_downloads_cloud_columns()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM downloads WHERE status IN ('downloading', 'queued')")
        rows = cursor.fetchall()
        for r in rows:
            dest = r["destination_path"]
            if dest and os.path.exists(dest) and os.path.isfile(dest) and os.path.getsize(dest) > 1024:
                cursor.execute("UPDATE downloads SET status = 'completed', progress = 100.0, speed = '0 MB/s', eta = 'Complete' WHERE id = ?", (r["id"],))
            else:
                cursor.execute("""
                    UPDATE downloads 
                    SET status = 'error', 
                        error_message = 'Session interrupted. Click to restart download.',
                        speed = '0 MB/s'
                    WHERE id = ?
                """, (r["id"],))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Recover Stalled Downloads Error]: {e}")

# Run recovery on module load
recover_stalled_downloads()
