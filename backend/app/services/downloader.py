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
from typing import Dict, Any, Optional
from ..database import get_db_connection

ACTIVE_TASKS: Dict[str, asyncio.Task] = {}
DOWNLOAD_STATES: Dict[str, Dict[str, Any]] = {}

VALID_ROM_EXTS = {
    ".sfc", ".smc", ".nes", ".z64", ".n64", ".v64",
    ".gba", ".gb", ".gbc", ".nds", ".dsi", ".iso", ".chd", ".rvz", ".cso", ".gcm",
    ".pce", ".sms", ".gg", ".a26", ".a78", ".md", ".gen", ".bin", ".cue", ".pbp",
    ".3ds", ".cia", ".vpk", ".pkg", ".nsp", ".xci", ".wux", ".wud", ".rpx", ".xbe", ".xex"
}

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
    url_low = url.lower()
    if any(h in url_low for h in ("romsfun.com", "romsfast.com", "psgamedl.com")):
        headers["Referer"] = "https://romsfun.com/"
    elif "consoleroms.com" in url_low:
        headers["Referer"] = "https://www.consoleroms.com/"
    else:
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme and parsed.netloc:
                headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"
        except Exception:
            pass
    return headers

def extract_and_resolve_rom_file(archive_path: Path, game_title: str = "") -> Path:
    """
    Extracts .zip, .7z, or .rar archives and identifies the extracted playable ROM file.
    Cleans up redundant archive files to prevent double disk space and ghost library duplicates.
    Returns the path to the primary ROM file, or archive_path if extraction leaves only the archive.
    """
    ext = archive_path.suffix.lower()
    dest_dir = archive_path.parent
    
    # 1. Perform extraction if archive
    extracted_successfully = False
    if ext == ".zip":
        try:
            import zipfile
            with zipfile.ZipFile(archive_path, 'r') as zf:
                zf.extractall(dest_dir)
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
            res = subprocess.run([cmd, "x", "-y", f"-o{dest_dir}", str(archive_path)], capture_output=True, check=False)
            if res.returncode == 0:
                extracted_successfully = True
        except Exception as se:
            print(f"[AutoExtract 7z/rar Error] {se}")

    # 2. Check for extracted ROM files recursively in dest_dir
    candidates = []
    try:
        now = time.time()
        for f in dest_dir.rglob("*"):
            if f.is_file() and f.suffix.lower() in VALID_ROM_EXTS and not f.name.endswith(".part"):
                mtime = f.stat().st_mtime
                size = f.stat().st_size
                candidates.append((f, mtime, size))
    except Exception as e:
        print(f"[Scan Extracted ROM Error]: {e}")

    if candidates:
        # Prioritize files modified recently or largest size
        candidates.sort(key=lambda c: (c[1] > now - 600, c[2]), reverse=True)
        primary_rom = candidates[0][0]
        
        # If extraction was successful and a distinct non-archive ROM file was produced,
        # clean up the redundant archive file to free storage and avoid duplicate UI cards!
        if extracted_successfully and primary_rom != archive_path and primary_rom.suffix.lower() not in (".zip", ".7z", ".rar"):
            try:
                if archive_path.exists():
                    archive_path.unlink()
            except Exception as ue:
                print(f"[Archive unlink note]: {ue}")
                
        return primary_rom

    return archive_path

async def download_torrent_worker(download_id: str, magnet_or_torrent: str, dest_dir: Path, game_title: str = "", platform: str = ""):
    """
    Native BitTorrent Downloader using aria2c with automatic public DHT, trackers,
    progress parsing, auto-extraction, and mirror failover.
    """
    proc = None
    try:
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
                # 1. First extract any new archive files (.zip, .7z, .rar)
                new_archives = [
                    f for f in dest_dir.rglob("*")
                    if f.is_file() and f.suffix.lower() in (".zip", ".7z", ".rar") and (f not in existing_files or f.stat().st_mtime > now - 600)
                ]
                for arc in new_archives:
                    extract_and_resolve_rom_file(arc, game_title)

                # 2. Find primary playable ROM file recursively
                candidates = []
                for f in dest_dir.rglob("*"):
                    if f.is_file() and f.suffix.lower() in VALID_ROM_EXTS and not f.name.endswith(".part"):
                        mtime = f.stat().st_mtime
                        size = f.stat().st_size
                        is_new = f not in existing_files or mtime > now - 600
                        candidates.append((f, is_new, size, mtime))

                if candidates:
                    # Prioritize newly created/modified ROMs and largest size
                    candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)
                    resolved_file = candidates[0][0]
            except Exception as se:
                print(f"[Torrent Scan Error]: {se}")

            final_dest = str(resolved_file) if resolved_file else str(dest_dir)
            final_fname = resolved_file.name if resolved_file else (f"{game_title}.zip" if game_title else "ROM Archive")

            final_state = {
                "status": "completed",
                "progress": 100.0,
                "speed": "0 MB/s",
                "eta": "Complete",
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
                    return await download_file_worker(download_id, working_url, dest_path, game_title=game_title, platform=platform)
            except Exception as fe:
                print(f"[Torrent Failover Error]: {fe}")

        error_state = {
            "status": "error",
            "error_message": f"Torrent download failed: {str(e)}",
            "speed": "0 MB/s"
        }
        DOWNLOAD_STATES[download_id].update(error_state)
        update_db_download(download_id, error_state)

async def download_file_worker(download_id: str, url: str, dest_path: Path, game_title: str = "", platform: str = ""):
    temp_path = dest_path.with_suffix(dest_path.suffix + ".part")
    downloaded = 0
    total_size = 0
    
    try:
        if not url:
            raise ValueError("No primary URL configured — resolving live mirror")

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
                    final_rom_path = extract_and_resolve_rom_file(dest_path, game_title)
                        
                    final_state = {
                        "status": "completed",
                        "progress": 100.0,
                        "downloaded_bytes": total_size,
                        "total_bytes": total_size,
                        "speed": "0 MB/s",
                        "eta": "Complete",
                        "filename": final_rom_path.name,
                        "destination_path": str(final_rom_path)
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
        state = {"status": "paused", "speed": "0 MB/s"}
        DOWNLOAD_STATES[download_id].update(state)
        update_db_download(download_id, state)
        return
    except Exception as e:
        # AUTOMATIC MIRROR / TORRENT FAILOVER
        if game_title and platform:
            try:
                state = {
                    "status": "resolving_mirror",
                    "speed": "0 MB/s",
                    "eta": "Resolving mirror or torrent..."
                }
                DOWNLOAD_STATES[download_id].update(state)
                update_db_download(download_id, state)
                
                from .mirror_resolver import mirror_resolver
                mirrors = await mirror_resolver.get_rom_mirrors(game_title, platform)
                if mirrors:
                    # 1. Try alternative verified direct mirror
                    direct_candidates = [m for m in mirrors if m.get("is_direct") and m.get("direct_url") != url]
                    if direct_candidates:
                        working_url = direct_candidates[0]["direct_url"]
                        return await download_file_worker(download_id, working_url, dest_path, game_title=game_title, platform=platform)
                    # 2. Try BitTorrent magnet mirror
                    torrent_candidates = [m for m in mirrors if (m.get("direct_url") or "").startswith("magnet:") or (m.get("direct_url") or "").endswith(".torrent")]
                    if torrent_candidates:
                        working_magnet = torrent_candidates[0]["direct_url"]
                        return await download_torrent_worker(download_id, working_magnet, dest_path.parent, game_title=game_title, platform=platform)
            except Exception as fe:
                print(f"[Downloader Failover Error]: {fe}")
                
        error_msg = f"{str(e)}"
        if "Primary & Mirror" not in error_msg:
            error_msg = f"{error_msg} (Verified direct ROM mirror not available for this specific dump. Use BitTorrent / Online Scraper mirrors.)"
            
        error_state = {
            "status": "error",
            "error_message": error_msg,
            "speed": "0 MB/s"
        }
        DOWNLOAD_STATES[download_id].update(error_state)
        update_db_download(download_id, error_state)

def update_db_download(download_id: str, fields: Dict[str, Any]):
    conn = get_db_connection()
    cursor = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in fields.keys()])
    values = list(fields.values()) + [download_id]
    cursor.execute(f"UPDATE downloads SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
    conn.commit()
    conn.close()

def queue_download(game_id: str, game_title: str, platform: str, url: str, filename: str, download_type: str = "direct") -> Dict[str, Any]:
    download_id = str(uuid.uuid4())[:8]
    dest_dir = get_download_dir(platform)
    dest_path = dest_dir / filename
    
    is_torrent = url.startswith("magnet:") or url.endswith(".torrent") or download_type in ("magnet", "torrent")
    effective_type = "torrent" if is_torrent else "direct"
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO downloads (
        id, game_id, game_title, platform, filename, download_type,
        source_url, status, progress, destination_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0.0, ?)
    """, (download_id, game_id, game_title, platform, filename, effective_type, url, str(dest_path)))
    conn.commit()
    conn.close()
    
    DOWNLOAD_STATES[download_id] = {
        "id": download_id,
        "game_id": game_id,
        "game_title": game_title,
        "platform": platform,
        "filename": filename,
        "download_type": effective_type,
        "status": "queued",
        "progress": 0.0,
        "speed": "0 MB/s",
        "eta": "Starting...",
        "destination_path": str(dest_path)
    }
    
    if is_torrent:
        task = asyncio.create_task(download_torrent_worker(download_id, url, dest_dir, game_title=game_title, platform=platform))
    else:
        task = asyncio.create_task(download_file_worker(download_id, url, dest_path, game_title=game_title, platform=platform))
        
    ACTIVE_TASKS[download_id] = task
    return DOWNLOAD_STATES[download_id]

def recover_stalled_downloads():
    """
    On backend initialization, scans the downloads database.
    Fixes orphaned 'queued' or 'downloading' tasks left behind by previous sessions.
    """
    try:
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
