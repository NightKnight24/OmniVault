import subprocess
import os
import glob
import json
import threading
import time
import urllib.parse
import re
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body, Query
from typing import Dict, Any, List
from .. import database as dbmod
from ..database import get_db_connection, row_to_game_dict
from ..services.downloader import (
    cancel_or_remove_download,
    clear_finished_downloads,
    get_queue_status,
    move_queued_download,
    queue_download,
    set_queue_paused,
    DOWNLOAD_STATES,
)
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
            
    # Sort: active downloading first, then waiting queue by queue_position, then finished history
    def sort_key(item):
        status = item.get("status", "")
        if status in ("downloading", "resolving_mirror"):
            return (0, 0)
        if status == "queued":
            return (1, int(item.get("queue_position") or 9999))
        return (2, 0)

    downloads.sort(key=sort_key)
    return {"downloads": downloads, "queue": get_queue_status()}

_INSTALLED_CACHE: Dict[str, Any] = {
    "timestamp": 0.0,
    "loaded": False,
    "refreshing": False,
    "installed": []
}


def invalidate_installed_cache():
    _INSTALLED_CACHE["timestamp"] = 0.0
    _INSTALLED_CACHE["loaded"] = False


def _installed_snapshot_path() -> Path:
    return dbmod.DB_PATH.parent / "installed_cache.json"


def _load_installed_snapshot() -> bool:
    snap = _installed_snapshot_path()
    try:
        if snap.exists():
            data = json.loads(snap.read_text(encoding="utf-8"))
            if isinstance(data, list):
                _INSTALLED_CACHE["installed"] = data
                _INSTALLED_CACHE["loaded"] = True
                _INSTALLED_CACHE["timestamp"] = time.time() - 50.0  # trigger background freshness soon after instant return
                return True
    except Exception:
        pass
    return False


def _save_installed_snapshot(items: List[Dict[str, Any]]) -> None:
    snap = _installed_snapshot_path()
    try:
        snap.parent.mkdir(parents=True, exist_ok=True)
        tmp = snap.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(items), encoding="utf-8")
        os.replace(tmp, snap)
    except Exception:
        pass


def _iter_rom_entries(base_dir: Path, valid_exts: set, max_depth: int = 2):
    """Depth-capped os.scandir ROM walker that skips hidden, cache, dev, .app internals, and .bin pairs with .cue."""
    skip_dirs = {".git", "node_modules", "__pycache__", ".cache", "tmp", "temp"}

    def _walk(current_dir: Path, depth: int):
        try:
            with os.scandir(current_dir) as it:
                entries = list(it)
        except OSError:
            return
        cue_stems = {
            e.name[:-4].lower()
            for e in entries
            if len(e.name) > 4 and e.name.lower().endswith(".cue")
        }
        for entry in entries:
            name = entry.name
            if name.startswith("."):
                continue
            low_name = name.lower()
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if is_dir:
                if low_name.endswith(".app"):
                    yield Path(entry.path), True, 0
                    continue
                if depth < max_depth and low_name not in skip_dirs:
                    yield from _walk(Path(entry.path), depth + 1)
            else:
                ext = os.path.splitext(low_name)[1]
                if ext in valid_exts and not low_name.endswith(".part"):
                    if ext == ".bin" and len(low_name) > 4 and low_name[:-4] in cue_stems:
                        continue
                    try:
                        sz = entry.stat(follow_symlinks=False).st_size
                    except OSError:
                        sz = 0
                    yield Path(entry.path), False, sz

    yield from _walk(base_dir, 0)


def _scan_installed_games_sync() -> List[Dict[str, Any]]:
    from ..services.thegamesdb_service import TGDB_PLATFORM_DISPLAY_NAMES
    from ..services.storage_service import get_roms_dir
    from ..services.cloud_storage_service import get_cloud_targets_status

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT d.*, g.box_art_2d, g.genre, g.rating, g.description "
        "FROM downloads d LEFT JOIN games g ON d.game_id = g.id WHERE d.status = 'completed'"
    )
    download_rows = cursor.fetchall()

    installed_map: Dict[str, Dict[str, Any]] = {}
    valid_exts = {
        ".zip", ".7z", ".rar", ".sfc", ".smc", ".nes", ".z64", ".n64", ".v64",
        ".gba", ".gb", ".gbc", ".nds", ".dsi", ".iso", ".chd", ".rvz", ".cso", ".gcm",
        ".pce", ".sms", ".gg", ".a26", ".a78", ".md", ".gen", ".bin", ".cue", ".pbp",
        ".3ds", ".cia", ".vpk", ".pkg", ".nsp", ".xci", ".wux", ".wud", ".rpx", ".xbe", ".xex",
        ".dmg", ".exe", ".msi", ".toast", ".img",
    }

    for r in download_rows:
        path = r["destination_path"]
        if path and os.path.exists(path):
            dir_bundle_bytes = None
            if os.path.isdir(path):
                dir_p = Path(path)
                if path.lower().endswith(".app"):
                    dir_bundle_bytes = 0
                else:
                    rom_files = sorted(
                        (
                            (p, sz)
                            for p, is_app, sz in _iter_rom_entries(dir_p, valid_exts, max_depth=2)
                            if not is_app
                        ),
                        key=lambda x: x[1],
                        reverse=True,
                    )
                    if rom_files:
                        path = str(rom_files[0][0])
                        dir_bundle_bytes = rom_files[0][1]
                    elif (r["platform"] or "").upper() in ("WINDOWS", "MACOS", "PS5"):
                        dir_bundle_bytes = 0
                    else:
                        continue
            total_bytes = dir_bundle_bytes if dir_bundle_bytes is not None else os.stat(path).st_size
            size_mb = round(total_bytes / (1024 * 1024), 2)
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
                "description": r["description"] or "Saved on local ROM library.",
                "downloaded_at": r["updated_at"] or r["created_at"],
            }

    cursor.execute("SELECT DISTINCT platform FROM games")
    canon_plat_map = {str(r[0]).lower(): str(r[0]) for r in cursor.fetchall() if r[0]}
    known_platforms = (
        set(canon_plat_map.keys())
        | {"psx", "retro", "imported", "roms"}
        | {k.lower() for k in TGDB_PLATFORM_DISPLAY_NAMES.keys()}
    )

    roms_dir = get_roms_dir()
    EXCLUDED_FOLDERS = {
        "BIOS", "EMULATORS", "CORES", "FIRMWARE", "KEYS",
        "PATCHES", "SAVESNAPSHOTS", "SAVES", "STATES",
        "SHADERS", "TEXTURES", "OMNIVAULT-DATA", "OMNIVAULT-SOURCE", "OMNIVAULT.APP"
    }

    scan_roots = [("Local Drive", roms_dir)]
    try:
        cloud_info = get_cloud_targets_status()
        for ct in cloud_info.get("targets") or []:
            if ct.get("available") and ct.get("mode") == "mount" and ct.get("roms_path"):
                cp = Path(ct["roms_path"])
                if cp != roms_dir and cp.exists():
                    scan_roots.append((ct.get("name") or ct["id"], cp))
    except Exception:
        pass

    discovered: List[tuple] = []
    present_canon_plats = set()
    for storage_label, root_dir in scan_roots:
        if root_dir.exists() and root_dir.is_dir():
            for plat_folder in root_dir.iterdir():
                if (
                    plat_folder.is_dir()
                    and not plat_folder.name.startswith((".", "OmniVault"))
                    and plat_folder.name.upper() not in EXCLUDED_FOLDERS
                    and plat_folder.name.lower() in known_platforms
                ):
                    platform_name = plat_folder.name
                    canon_plat = canon_plat_map.get(platform_name.lower(), platform_name)
                    present_canon_plats.add(canon_plat)
                    for rom_file, is_app_bundle, total_bytes in _iter_rom_entries(plat_folder, valid_exts, max_depth=2):
                        fpath = str(rom_file)
                        if fpath not in installed_map:
                            discovered.append((storage_label, platform_name, canon_plat, plat_folder, rom_file, is_app_bundle, total_bytes))

    # One batched SQL query for all metadata across discovered platforms (O(1) dict matching instead of 10k+ SQLite queries)
    by_plat_title: Dict[tuple, Dict[str, Any]] = {}
    by_plat_norm: Dict[tuple, Dict[str, Any]] = {}
    by_slug: Dict[str, Dict[str, Any]] = {}
    by_title: Dict[str, Dict[str, Any]] = {}

    if present_canon_plats and discovered:
        plats_list = list(present_canon_plats)
        placeholders = ",".join(["?"] * len(plats_list))
        cursor.execute(
            f"""
            SELECT id, title, slug, platform, genre, rating, description, box_art_2d
            FROM games
            WHERE platform IN ({placeholders})
            """,
            plats_list,
        )
        for row in cursor.fetchall():
            gd = dict(row)
            t_str = str(gd.get("title") or "")
            p_str = str(gd.get("platform") or "")
            s_str = str(gd.get("slug") or "")
            t_low = t_str.lower()
            p_low = p_str.lower()
            by_plat_title.setdefault((p_low, t_low), gd)
            t_norm = re.sub(r"[^a-z0-9]+", "", t_low)
            if t_norm:
                by_plat_norm.setdefault((p_low, t_norm), gd)
            if s_str:
                by_slug.setdefault(s_str.lower(), gd)
            if t_low:
                by_title.setdefault(t_low, gd)

    conn.close()

    seen_titles_lower = {str(item.get("title") or "").lower() for item in installed_map.values()}
    seen_clean_titles = {re.sub(r"\s*[\(\[].*?[\)\]]", "", t).strip() for t in seen_titles_lower if t}

    for storage_label, platform_name, canon_plat, plat_folder, rom_file, is_app_bundle, total_bytes in discovered:
        fpath = str(rom_file)
        if fpath in installed_map:
            continue
        is_valid_file = not is_app_bundle
        clean_stem = rom_file.stem
        if clean_stem.upper() in ("EBOOT", "DEFAULT", "GAME", "TRACK01", "TRACK 01") and rom_file.parent != plat_folder:
            clean_stem = rom_file.parent.name

        clean_title = re.sub(r"\s*[\(\[].*?[\)\]]", "", clean_stem).strip()
        clean_title = re.sub(r"^(.*?),\s*The\b(.*)$", r"The \1\2", clean_title, flags=re.I)
        if " - " in clean_title:
            clean_title = clean_title.replace(" - ", ": ")
        clean_title = re.sub(r"([a-z])([A-Z])", r"\1 \2", clean_title)

        p_low = canon_plat.lower()
        clean_low = clean_title.lower()
        stem_low = clean_stem.lower()
        stripped_q = re.sub(r"[^a-z0-9]+", "", stem_low)

        game_dict = (
            by_plat_title.get((p_low, clean_low))
            or by_plat_title.get((p_low, stem_low))
            or by_plat_norm.get((p_low, stripped_q))
            or by_slug.get(stem_low)
            or by_title.get(clean_low)
            or {}
        )

        final_title = game_dict.get("title") or clean_title or clean_stem.replace("_", " ").title()
        final_title_low = final_title.lower()

        if final_title_low in seen_titles_lower:
            continue
        if is_valid_file and rom_file.suffix.lower() in (".zip", ".7z", ".rar") and clean_low in seen_clean_titles:
            continue

        box_art = game_dict.get("box_art_2d") or f"/api/covers/image?title={urllib.parse.quote(final_title)}&platform={urllib.parse.quote(platform_name)}"
        size_mb = round(total_bytes / (1024 * 1024), 2)

        seen_titles_lower.add(final_title_low)
        seen_clean_titles.add(clean_low)
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
            "description": game_dict.get("description", "Saved on local ROM library."),
            "downloaded_at": storage_label,
            "storage_location": storage_label,
        }

    res_list = list(installed_map.values())
    _INSTALLED_CACHE["timestamp"] = time.time()
    _INSTALLED_CACHE["loaded"] = True
    _INSTALLED_CACHE["installed"] = res_list
    _save_installed_snapshot(res_list)
    return res_list


def _trigger_installed_refresh_bg() -> None:
    if _INSTALLED_CACHE.get("refreshing"):
        return
    _INSTALLED_CACHE["refreshing"] = True

    def _run():
        try:
            _scan_installed_games_sync()
        except Exception as exc:
            print(f"[Installed Scan BG Note]: {exc}")
        finally:
            _INSTALLED_CACHE["refreshing"] = False

    threading.Thread(target=_run, daemon=True).start()


@router.get("/installed")
def list_installed_games(refresh: bool = Query(False)):
    """
    Scans known console folders in configured storage roots and downloads table
    to return all downloaded and installed ROMs available on the local drive.
    Serves cached/snapshot results instantaneously and refreshes in background unless refresh=true.
    """
    if refresh:
        return {"installed": _scan_installed_games_sync()}

    now = time.time()
    if _INSTALLED_CACHE["loaded"]:
        if (now - _INSTALLED_CACHE["timestamp"]) >= 60.0:
            _trigger_installed_refresh_bg()
        return {"installed": _INSTALLED_CACHE["installed"]}

    if _load_installed_snapshot():
        _trigger_installed_refresh_bg()
        return {"installed": _INSTALLED_CACHE["installed"]}

    _trigger_installed_refresh_bg()
    return {"installed": _INSTALLED_CACHE["installed"]}

@router.post("/start")
async def start_download(payload: Dict[str, Any] = Body(...)):
    game_id = payload.get("game_id")
    download_type = payload.get("type", "direct")
    destination_target = payload.get("destination_target")
    
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
            try:
                item = queue_download(
                    game_id=game["id"],
                    game_title=game["title"],
                    platform=game["platform"],
                    url=magnet_or_torrent,
                    filename=filename,
                    download_type="torrent",
                    destination_target=destination_target,
                )
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            return {
                "status": "queued",
                "message": f"Queued BitTorrent download for {game['title']}",
                "download": item
            }
        else:
            raise HTTPException(status_code=400, detail="No P2P torrent magnet link configured for this game.")

    url = payload.get("direct_url") or game["direct_download_url"] or ""

    # If the URL is empty or an expired/temporary token link, resolve from configured BYOS sources
    is_temp_or_dead = not url or "gAAAAAB" in url or ("expires=" in url and "sig=" in url)
    if is_temp_or_dead:
        mirrors = await mirror_resolver.get_rom_mirrors(game["title"], game["platform"])
        if mirrors:
            # Mirrors arrive strictly ranked (Real-Debrid priority when active, else fastest direct CDN -> top-seeded torrent)
            from ..services.realdebrid_service import is_realdebrid_active, is_hoster_url
            rd_active = is_realdebrid_active()
            selected = None
            for m in mirrors:
                cand_url = str(m.get("direct_url") or "").strip()
                if not cand_url:
                    continue
                cand_low = cand_url.lower()
                if "filecrypt.cc" in cand_low:
                    continue
                is_tor = cand_url.startswith("magnet:") or cand_low.endswith(".torrent")
                if is_tor:
                    selected = m
                    break
                if m.get("is_direct") and (rd_active or not is_hoster_url(cand_url)):
                    selected = m
                    break

            if selected:
                sel_url = str(selected["direct_url"]).strip()
                if sel_url.startswith("magnet:") or sel_url.lower().endswith(".torrent"):
                    t_filename = selected.get("filename") or f"{game['title']}.zip"
                    t_size = float(selected.get("file_size_mb") or 0.0)
                    if t_size > 0:
                        conn = get_db_connection()
                        cursor = conn.cursor()
                        cursor.execute("UPDATE games SET file_size_mb = ? WHERE id = ?", (t_size, game["id"]))
                        conn.commit()
                        conn.close()
                    try:
                        item = queue_download(
                            game_id=game["id"],
                            game_title=game["title"],
                            platform=game["platform"],
                            url=sel_url,
                            filename=t_filename,
                            download_type="torrent",
                            destination_target=destination_target,
                        )
                    except ValueError as ve:
                        raise HTTPException(status_code=400, detail=str(ve))
                    return {
                        "status": "queued",
                        "message": f"Queued top-ranked download ({selected.get('source_name', 'Torrent')})",
                        "download": item,
                    }

                url = sel_url
                if not payload.get("filename") and selected.get("filename"):
                    payload["filename"] = selected.get("filename")
                if url and "expires=" not in url and "sig=" not in url:
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("UPDATE games SET direct_download_url = ? WHERE id = ?", (url, game["id"]))
                    conn.commit()
                    conn.close()
            else:
                raise HTTPException(
                    status_code=400,
                    detail="No direct ROM mirror or torrent available for automated internal download. Open the game details to choose from alternative verified mirrors.",
                )

    from ..services.realdebrid_service import is_realdebrid_active, is_hoster_url
    if not is_realdebrid_active() and (is_hoster_url(url) or "filecrypt.cc" in url.lower()):
        # If the stored URL was a web hoster, try falling back to an internal torrent
        mirrors = await mirror_resolver.get_rom_mirrors(game["title"], game["platform"])
        torrent_mirrors = [m for m in mirrors if (m.get("direct_url") or "").startswith("magnet:") or (m.get("direct_url") or "").endswith(".torrent")]
        if torrent_mirrors:
            best_torrent = torrent_mirrors[0]
            try:
                item = queue_download(
                    game_id=game["id"],
                    game_title=game["title"],
                    platform=game["platform"],
                    url=best_torrent["direct_url"],
                    filename=best_torrent.get("filename") or f"{game['title']}.zip",
                    download_type="torrent",
                    destination_target=destination_target,
                )
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
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
            
    try:
        item = queue_download(
            game_id=game["id"],
            game_title=game["title"],
            platform=game["platform"],
            url=url,
            filename=filename,
            download_type=effective_type,
            destination_target=destination_target,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    return item

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

@router.post("/{download_id}/move")
async def move_download_in_queue(download_id: str, payload: Dict[str, Any] = Body(...)):
    direction = (payload.get("direction") or "up").strip().lower()
    moved = move_queued_download(download_id, direction)
    if not moved:
        raise HTTPException(status_code=400, detail="Download is not waiting in the sequential queue")
    return {"status": "moved", "id": download_id, "queue": get_queue_status()}


@router.post("/queue/pause")
async def pause_download_queue():
    return {"status": "paused", "queue": set_queue_paused(True)}


@router.post("/queue/resume")
async def resume_download_queue():
    return {"status": "resumed", "queue": set_queue_paused(False)}


@router.post("/clear-completed")
async def clear_completed_downloads_route():
    removed = clear_finished_downloads()
    return {"status": "cleared", "removed": removed, "queue": get_queue_status()}


@router.delete("/{download_id}")
async def cancel_download(download_id: str):
    cancel_or_remove_download(download_id)
    return {"status": "cancelled", "id": download_id, "queue": get_queue_status()}

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
