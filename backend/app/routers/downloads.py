import subprocess
import os
import glob
import time
import urllib.parse
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body, Query
from fastapi.responses import FileResponse
from typing import Dict, Any, List
from ..database import get_db_connection, row_to_game_dict
from ..services.downloader import queue_download, DOWNLOAD_STATES, ACTIVE_TASKS
from ..services.storage_service import get_roms_dir, get_storage_config
from ..services.mirror_resolver import mirror_resolver

router = APIRouter(prefix="/api/downloads", tags=["downloads"])

@router.get("")
def list_downloads():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM downloads ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    downloads = []
    seen_ids = set()
    for r in rows:
        d = dict(r)
        if d["id"] in DOWNLOAD_STATES:
            d.update(DOWNLOAD_STATES[d["id"]])
        seen_ids.add(d["id"])
        downloads.append(d)
        
    # Also inject any live active download states not yet flushed to DB
    for d_id, state in DOWNLOAD_STATES.items():
        if d_id not in seen_ids:
            downloads.insert(0, dict(state))
            seen_ids.add(d_id)
            
    # Sort: active downloading/queued first, then by date
    def sort_key(item):
        status = item.get("status", "")
        if status == "downloading":
            return 0
        if status in ("queued", "resolving_mirror"):
            return 1
        return 2

    downloads.sort(key=sort_key)
    return {"downloads": downloads}

_INSTALLED_CACHE: Dict[str, Any] = {
    "timestamp": 0.0,
    "installed": []
}

def invalidate_installed_cache():
    _INSTALLED_CACHE["timestamp"] = 0.0

@router.get("/installed")
def list_installed_games():
    """
    Scans /Volumes/ROMS allocated folders and downloads table
    to return all downloaded and installed ROMs available on the local drive.
    Caches results in memory for 30s to prevent disk-IO and SQLite lockups.
    """
    now = time.time()
    if now - _INSTALLED_CACHE["timestamp"] < 30.0 and _INSTALLED_CACHE["installed"]:
        return {"installed": _INSTALLED_CACHE["installed"]}

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Fetch completed records from downloads table
    cursor.execute("SELECT d.*, g.box_art_2d, g.genre, g.rating, g.description FROM downloads d LEFT JOIN games g ON d.game_id = g.id WHERE d.status = 'completed'")
    download_rows = cursor.fetchall()
    
    installed_map: Dict[str, Dict[str, Any]] = {}
    
    for r in download_rows:
        path = r["destination_path"]
        if path and os.path.exists(path):
            if os.path.isdir(path):
                # If directory, find largest ROM file inside it recursively
                rom_files = [
                    f for f in Path(path).rglob("*")
                    if f.is_file() and f.suffix.lower() in valid_exts and not f.name.endswith(".part")
                ]
                if rom_files:
                    rom_files.sort(key=lambda x: x.stat().st_size, reverse=True)
                    path = str(rom_files[0])
                else:
                    continue
            stat = os.stat(path)
            size_mb = round(stat.st_size / (1024 * 1024), 2)
            title = r["game_title"]
            box_art = r["box_art_2d"] or f"/api/covers/image?title={urllib.parse.quote(title)}&platform={urllib.parse.quote(r['platform'])}"
            real_filename = os.path.basename(path)
            installed_map[path] = {
                "id": r["id"],
                "game_id": r["game_id"],
                "title": title,
                "platform": r["platform"],
                "filename": real_filename,
                "path": path,
                "file_size_mb": size_mb,
                "box_art_2d": box_art,
                "genre": r["genre"] or "Action-Adventure",
                "rating": r["rating"],
                "description": r["description"] or "Officially preserved and ready to play in OmniVault.",
                "downloaded_at": r["updated_at"] or r["created_at"]
            }

    # 2. Also scan configured ROMs subdirectories directly for any present ROMs
    from ..services.storage_service import get_roms_dir
    roms_dir = get_roms_dir()
    valid_exts = {
        ".zip", ".7z", ".sfc", ".smc", ".nes", ".z64", ".n64", ".v64",
        ".gba", ".gb", ".gbc", ".nds", ".dsi", ".iso", ".chd", ".rvz", ".cso", ".gcm",
        ".pce", ".sms", ".gg", ".a26", ".a78", ".md", ".gen", ".bin", ".cue", ".pbp",
        ".3ds", ".cia", ".vpk", ".pkg", ".nsp", ".xci", ".wux", ".wud", ".rpx", ".xbe", ".xex"
    }
    EXCLUDED_FOLDERS = {
        "BIOS", "EMULATORS", "CORES", "FIRMWARE", "KEYS",
        "PATCHES", "SAVESNAPSHOTS", "SAVES", "STATES",
        "SHADERS", "TEXTURES", "OMNIVAULT-DATA", "OMNIVAULT-SOURCE", "OMNIVAULT.APP"
    }
    
    if roms_dir.exists() and roms_dir.is_dir():
        for plat_folder in roms_dir.iterdir():
            if plat_folder.is_dir() and not plat_folder.name.startswith((".", "OmniVault")) and plat_folder.name.upper() not in EXCLUDED_FOLDERS:
                platform_name = plat_folder.name
                for rom_file in plat_folder.rglob("*"):
                    if rom_file.is_file() and rom_file.suffix.lower() in valid_exts and not rom_file.name.endswith(".part"):
                        if rom_file.suffix.lower() == ".bin" and rom_file.with_suffix(".cue").exists():
                            continue
                        fpath = str(rom_file)
                        if fpath in installed_map:
                            continue
                            
                        clean_stem = rom_file.stem
                        if clean_stem.upper() in ("EBOOT", "DEFAULT", "GAME", "TRACK01", "TRACK 01") and rom_file.parent != plat_folder:
                            clean_stem = rom_file.parent.name

                        clean_title = re.sub(r"\s*[\(\[].*?[\)\]]", "", clean_stem).strip()
                        clean_title = re.sub(r"^(.*?),\s*The\b(.*)$", r"The \1\2", clean_title, flags=re.I)
                        if " - " in clean_title:
                            clean_title = clean_title.replace(" - ", ": ")
                        clean_title = re.sub(r"([a-z])([A-Z])", r"\1 \2", clean_title) # handle camelCase e.g. cavestory -> Cave Story

                        stripped_q = re.sub(r"[^a-zA-Z0-9]+", "", clean_stem).lower()

                        # Fast indexed lookup with title variants & stripped normalization
                        cursor.execute("""
                            SELECT * FROM games 
                            WHERE title = ? OR slug = ? OR title = ? OR title LIKE ?
                               OR REPLACE(REPLACE(REPLACE(LOWER(title), ' ', ''), '-', ''), '_', '') = ?
                            LIMIT 1
                        """, (clean_stem, clean_stem.lower(), clean_title, f"{clean_title}%", stripped_q))
                        matched = cursor.fetchone()
                        
                        game_dict = row_to_game_dict(matched) if matched else {}
                        final_title = game_dict.get("title") or clean_title or clean_stem.replace("_", " ").title()

                        # Deduplicate: If an entry already exists in installed_map for this exact game or title, don't show duplicate unmanaged card
                        if any(item.get("title", "").lower() == final_title.lower() for item in installed_map.values()):
                            continue
                        if rom_file.suffix.lower() in (".zip", ".7z", ".rar") and any(item.get("title", "").lower().startswith(clean_title.lower()) for item in installed_map.values()):
                            continue

                        box_art = game_dict.get("box_art_2d") or f"/api/covers/image?title={urllib.parse.quote(final_title)}&platform={urllib.parse.quote(platform_name)}"
                        stat = rom_file.stat()
                        size_mb = round(stat.st_size / (1024 * 1024), 2)
                        
                        installed_map[fpath] = {
                            "id": f"local-{clean_stem[:12]}",
                            "game_id": game_dict.get("id", f"local-{clean_stem[:12]}"),
                            "title": final_title,
                            "platform": platform_name,
                            "filename": rom_file.name,
                            "path": fpath,
                            "file_size_mb": size_mb,
                            "box_art_2d": box_art,
                            "genre": game_dict.get("genre", "Classic"),
                            "rating": game_dict.get("rating"),
                            "description": game_dict.get("description", "Locally stored classic ROM ready to play."),
                            "downloaded_at": "Local Drive"
                        }

    conn.close()
    res_list = list(installed_map.values())
    _INSTALLED_CACHE["timestamp"] = time.time()
    _INSTALLED_CACHE["installed"] = res_list
    return {"installed": res_list}

@router.post("/start")
async def start_download(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("game_id")
    download_type = payload.get("type", "direct")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    game = cursor.fetchone()
    conn.close()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    if download_type in ("magnet", "torrent"):
        magnet_or_torrent = payload.get("magnet_uri") or payload.get("direct_url") or game["magnet_uri"]
        if magnet_or_torrent and (magnet_or_torrent.startswith("magnet:") or magnet_or_torrent.endswith(".torrent")):
            # Start native BitTorrent download via aria2c worker
            filename = payload.get("filename") or f"{game['title']}.zip"
            item = queue_download(
                game_id=game["id"],
                game_title=game["title"],
                platform=game["platform"],
                url=magnet_or_torrent,
                filename=filename,
                download_type="torrent"
            )
            return {
                "status": "queued",
                "message": f"Queued BitTorrent download for {game['title']}",
                "download": item
            }
        else:
            raise HTTPException(status_code=400, detail="No P2P torrent magnet link configured for this game.")

    url = payload.get("direct_url") or game["direct_download_url"] or ""

    # If the URL is empty, an invalid archive.org URL, or an expired/temporary token link, dynamically resolve live line-speed mirror or torrent
    is_temp_or_dead = not url or "archive.org" in url or "blueroms.ws" in url or ("expires=" in url and "sig=" in url)
    if is_temp_or_dead:
        mirrors = await mirror_resolver.get_rom_mirrors(game["title"], game["platform"])
        if mirrors:
            # 1. Filter for true direct mirrors first
            direct_mirrors = [
                m for m in mirrors
                if m.get("is_direct") and not any(h in (m.get("direct_url") or "").lower() for h in ("datanodes.to", "filecrypt.cc", "1fichier.com"))
            ]
            if direct_mirrors:
                best_mirror = direct_mirrors[0]
                url = best_mirror.get("direct_url") or ""
                if not payload.get("filename") and best_mirror.get("filename"):
                    payload["filename"] = best_mirror.get("filename")
                if url and "expires=" not in url and "sig=" not in url:
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("UPDATE games SET direct_download_url = ? WHERE id = ?", (url, game["id"]))
                    conn.commit()
                    conn.close()
            else:
                # 2. Check for active BitTorrent mirrors (The Pirate Bay, Nyaa)
                torrent_mirrors = [m for m in mirrors if (m.get("direct_url") or "").startswith("magnet:") or (m.get("direct_url") or "").endswith(".torrent")]
                if torrent_mirrors:
                    best_torrent = torrent_mirrors[0]
                    t_url = best_torrent["direct_url"]
                    t_filename = best_torrent.get("filename") or f"{game['title']}.zip"
                    t_size = float(best_torrent.get("file_size_mb") or 0.0)
                    if t_size > 0:
                        conn = get_db_connection()
                        cursor = conn.cursor()
                        cursor.execute("UPDATE games SET file_size_mb = ? WHERE id = ?", (t_size, game["id"]))
                        conn.commit()
                        conn.close()
                    item = queue_download(
                        game_id=game["id"],
                        game_title=game["title"],
                        platform=game["platform"],
                        url=t_url,
                        filename=t_filename,
                        download_type="torrent"
                    )
                    return {
                        "status": "queued",
                        "message": f"Queued internal BitTorrent download ({best_torrent.get('source_name', 'Torrent')})",
                        "download": item
                    }
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="No direct ROM mirror or torrent available for automated internal download. Open the game details to choose from alternative verified mirrors."
                    )

    if any(h in url.lower() for h in ("datanodes.to", "filecrypt.cc", "1fichier.com", "mega.nz", "ziperto.com")):
        # If the stored URL was a web hoster, try falling back to an internal torrent
        mirrors = await mirror_resolver.get_rom_mirrors(game["title"], game["platform"])
        torrent_mirrors = [m for m in mirrors if (m.get("direct_url") or "").startswith("magnet:") or (m.get("direct_url") or "").endswith(".torrent")]
        if torrent_mirrors:
            best_torrent = torrent_mirrors[0]
            item = queue_download(
                game_id=game["id"],
                game_title=game["title"],
                platform=game["platform"],
                url=best_torrent["direct_url"],
                filename=best_torrent.get("filename") or f"{game['title']}.zip",
                download_type="torrent"
            )
            return {
                "status": "queued",
                "message": f"Queued internal BitTorrent download ({best_torrent.get('source_name', 'Torrent')})",
                "download": item
            }
        raise HTTPException(
            status_code=400,
            detail="This hoster requires captcha verification and cannot be downloaded directly. Please select an alternate direct mirror or P2P torrent from the ROM Mirrors list."
        )

    if not url:
        raise HTTPException(status_code=404, detail="No active high-speed mirror or torrent could be reached for this game. Try opening the game detail modal to select from available sources.")

    # If an external stream was selected, persist it as the game's direct URL
    if payload.get("direct_url"):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE games SET direct_download_url = ? WHERE id = ?", (payload["direct_url"], game["id"]))
        conn.commit()
        conn.close()

    filename = payload.get("filename")
    if not filename:
        raw_name = os.path.basename(urllib.parse.urlparse(url).path) if url else ""
        if raw_name:
            filename = urllib.parse.unquote(raw_name)
        else:
            safe_title = "".join(c for c in game["title"] if c.isalnum() or c in (" ", "-", "_")).strip()
            ext = game["rom_format"] or ".zip"
            if not ext.startswith("."):
                ext = f".{ext}"
            filename = f"{safe_title}{ext}"
            
    is_torrent_url = url.startswith("magnet:") or url.endswith(".torrent")
    effective_type = "torrent" if is_torrent_url else "direct"
            
    item = queue_download(
        game_id=game["id"],
        game_title=game["title"],
        platform=game["platform"],
        url=url,
        filename=filename,
        download_type=effective_type
    )
    return item

@router.get("/rom-file")
def get_rom_file(path: str = Query(..., description="Absolute path to the ROM file on disk")):
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ROM file does not exist on disk")
    from ..services.emulator_manager import emulator_manager
    effective_path = emulator_manager._resolve_active_mod_rom(path)
    real_path = os.path.realpath(effective_path)
    allowed_roots = [str(get_roms_dir()), "/Volumes/ROMS", "OmniVault", "Downloads", "GAMES"]
    if not any(root in real_path or real_path.startswith(root) for root in allowed_roots):
        raise HTTPException(status_code=403, detail="Access denied to requested file path")
    return FileResponse(
        real_path,
        filename=os.path.basename(real_path),
        media_type="application/octet-stream"
    )

@router.post("/launch")
def launch_game(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    platform = payload.get("platform")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ROM file does not exist on disk")
        
    try:
        from ..services.emulator_manager import emulator_manager
        if not platform:
            parent_name = os.path.basename(os.path.dirname(path))
            platform = parent_name
        res = emulator_manager.launch_game(path, platform, force=True)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/delete")
def delete_installed_rom(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ROM file not found on disk")
        
    try:
        import shutil
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
            part_path = f"{path}.part"
            if os.path.exists(part_path):
                try:
                    os.remove(part_path)
                except Exception:
                    pass
        
        # Also clean from downloads DB if present
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM downloads WHERE destination_path = ? OR destination_path LIKE ?", (path, f"%{os.path.basename(path)}%"))
        conn.commit()
        conn.close()
        invalidate_installed_cache()
        return {"status": "deleted", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/open-path")
def reveal_path_in_finder(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")
    if os.path.exists(path):
        subprocess.run(["open", "-R", path], check=False)
        return {"status": "success", "opened": path}
    parent = os.path.dirname(path)
    if os.path.exists(parent):
        subprocess.run(["open", parent], check=False)
        return {"status": "success", "opened": parent}
    raise HTTPException(status_code=404, detail="File or folder does not exist on disk")

@router.post("/{download_id}/open")
def reveal_in_finder(download_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT destination_path FROM downloads WHERE id = ?", (download_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not row["destination_path"]:
        raise HTTPException(status_code=404, detail="File path not found")
        
    path = row["destination_path"]
    if os.path.exists(path):
        subprocess.run(["open", "-R", path], check=False)
        return {"status": "success", "opened": path}
    else:
        parent = os.path.dirname(path)
        if os.path.exists(parent):
            subprocess.run(["open", parent], check=False)
            return {"status": "success", "opened": parent}
        raise HTTPException(status_code=404, detail="File does not exist on disk")

@router.delete("/{download_id}")
def cancel_download(download_id: str):
    if download_id in ACTIVE_TASKS:
        ACTIVE_TASKS[download_id].cancel()
        del ACTIVE_TASKS[download_id]
        
    if download_id in DOWNLOAD_STATES:
        del DOWNLOAD_STATES[download_id]
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM downloads WHERE id = ?", (download_id,))
    conn.commit()
    conn.close()
    return {"status": "cancelled", "id": download_id}

@router.post("/verify-checksum")
def verify_checksum(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="ROM file not found on disk")
        
    import zlib
    import hashlib
    
    crc = 0
    sha1 = hashlib.sha1()
    md5 = hashlib.md5()
    total_bytes = 0
    
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            crc = zlib.crc32(chunk, crc)
            sha1.update(chunk)
            md5.update(chunk)
            total_bytes += len(chunk)
            
    crc_hex = f"{crc & 0xFFFFFFFF:08X}"
    sha1_hex = sha1.hexdigest().upper()
    md5_hex = md5.hexdigest().upper()
    
    return {
        "status": "verified",
        "path": path,
        "filename": os.path.basename(path),
        "size_bytes": total_bytes,
        "crc32": crc_hex,
        "sha1": sha1_hex,
        "md5": md5_hex,
        "authenticity": f"Computed Cryptographic Hash (CRC32: {crc_hex})"
    }

@router.post("/extract")
def extract_rom_archive(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Archive file not found on disk")
        
    parent = Path(path).parent
    ext = Path(path).suffix.lower()
    extracted_files = []
    
    try:
        if ext == ".zip":
            import zipfile
            with zipfile.ZipFile(path, 'r') as zf:
                zf.extractall(parent)
                extracted_files = zf.namelist()
        elif ext in [".7z", ".rar", ".tar", ".gz"]:
            cmd = "7z" if os.path.exists("/opt/homebrew/bin/7z") else "7za"
            res = subprocess.run([cmd, "x", "-y", f"-o{parent}", path], capture_output=True, text=True)
            if res.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Extraction failed: {res.stderr}")
            extracted_files = [f.name for f in parent.iterdir() if f.is_file() and not f.name.endswith(ext)]
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported archive format: {ext}")
            
        return {
            "status": "extracted",
            "archive": path,
            "extracted_count": len(extracted_files),
            "files": extracted_files[:10],
            "directory": str(parent)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting archive: {str(e)}")
