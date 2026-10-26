import os
import shutil
import time
import json
import hashlib
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
from ..database import get_db_connection

router = APIRouter(prefix="/api/saves", tags=["saves"])

from ..services.storage_service import get_snapshots_dir, get_roms_dir

DEFAULT_ICLOUD_PATH = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/OmniVaultSaves"

COMMON_SAVE_EXTS = {".srm", ".sav", ".state", ".state1", ".state2", ".state3", ".mcd", ".ps2", ".gci", ".raw", ".bin", ".dat", ".sfo"}

def get_game_info(game_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, title, platform, file_size_mb, rom_format FROM games WHERE id = ?", (str(game_id),))
    row = c.fetchone()
    conn.close()
    return row

def get_snapshot_folder(game_title: str) -> Path:
    safe_name = "".join(c for c in game_title if c.isalnum() or c in (" ", "-", "_")).strip()
    folder = get_snapshots_dir() / safe_name
    folder.mkdir(parents=True, exist_ok=True)
    return folder

def find_active_save_files(game_title: str, platform: str) -> List[Path]:
    """
    Scans known emulator save directories on macOS and configured ROMs folder for real save files
    matching the game's title or platform ID across all emulators (RetroArch, Dolphin, PCSX2,
    PPSSPP, RPCS3, Vita3K, shadPS4, xemu, Xenia, Ryujinx).
    """
    clean_stem = "".join(c for c in game_title if c.isalnum() or c in (" ", "-", "_")).strip().lower()
    search_dirs = [
        get_roms_dir() / platform,
        Path.home() / "Library/Application Support/RetroArch/saves",
        Path.home() / "Library/Application Support/RetroArch/states",
        Path.home() / "Library/Application Support/Dolphin/GC",
        Path.home() / "Library/Application Support/Dolphin/Wii",
        Path.home() / "Library/Application Support/PCSX2/memcards",
        Path.home() / ".config/ppsspp/PSP/SAVEDATA",
        Path.home() / "Library/Application Support/rpcs3/dev_hdd0/home/00000001/savedata",
        Path.home() / "Library/Application Support/Vita3K/Vita3K/ux0/user/00/savedata",
        Path.home() / "Library/Application Support/shadPS4/user/savedata",
        Path.home() / "Library/Application Support/xemu/xemu",
        Path.home() / "Library/Application Support/Xenia/content",
        Path.home() / "Documents/Xenia/content",
        Path.home() / "Library/Application Support/Ryujinx/bis/user/save",
        Path.home() / "Library/Application Support/Cemu/mlc01/usr/save",
        Path.home() / "Library/Application Support/Lime3DS/sdmc/Nintendo 3DS",
        Path.home() / "Library/Application Support/Azahar/sdmc/Nintendo 3DS",
        Path.home() / "Library/Application Support/melonDS"
    ]
    
    found_saves = []
    for s_dir in search_dirs:
        if not s_dir.exists():
            continue
        try:
            # Check direct files
            for item in s_dir.iterdir():
                if item.is_file() and item.suffix.lower() in COMMON_SAVE_EXTS:
                    item_stem = item.stem.lower()
                    if clean_stem in item_stem or item_stem in clean_stem:
                        found_saves.append(item)
                elif item.is_dir():
                    # For folder-based saves (RPCS3, Vita3K, shadPS4, Xenia)
                    dir_stem = item.name.lower()
                    if clean_stem in dir_stem or dir_stem in clean_stem:
                        for sub_item in item.rglob("*"):
                            if sub_item.is_file():
                                found_saves.append(sub_item)
                                break
        except Exception:
            pass
            
    return found_saves

@router.get("/snapshots/{game_id}")
def list_snapshots(game_id: str):
    """Lists authentic historical Time-Machine save snapshots for a game."""
    game = get_game_info(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    folder = get_snapshot_folder(game["title"])
    meta_file = folder / "snapshots_manifest.json"
    
    manifest = []
    if meta_file.exists():
        try:
            with open(meta_file, "r") as f:
                raw_list = json.load(f)
                # Verify that files physically exist on disk
                for item in raw_list:
                    snap_file = folder / item.get("filename", "")
                    if snap_file.exists():
                        manifest.append(item)
        except Exception:
            manifest = []

    # Check for any active in-game saves ready to be snapshotted
    active_saves = find_active_save_files(game["title"], game["platform"])

    return {
        "game_id": game_id,
        "title": game["title"],
        "platform": game["platform"],
        "snapshots_dir": str(folder),
        "total_snapshots": len(manifest),
        "snapshots": manifest,
        "active_saves_found": len(active_saves),
        "active_save_paths": [str(p) for p in active_saves]
    }

@router.post("/create-snapshot")
def create_snapshot(payload: Dict[str, Any] = Body(...)):
    """
    Creates a real immutable Time-Machine save snapshot by copying
    active memory / battery saves (.srm, .sav, .state) into the snapshot archive.
    """
    game_id = payload.get("game_id")
    label = payload.get("label", "Manual Checkpoint").strip()
    is_auto = payload.get("is_auto", False)
    source_file_path = payload.get("source_file_path")

    game = get_game_info(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Locate real source save file
    target_source: Optional[Path] = None
    if source_file_path and os.path.exists(source_file_path):
        target_source = Path(source_file_path)
    else:
        active_saves = find_active_save_files(game["title"], game["platform"])
        if active_saves:
            # Sort by most recently modified
            active_saves.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            target_source = active_saves[0]

    folder = get_snapshot_folder(game["title"])
    meta_file = folder / "snapshots_manifest.json"

    manifest = []
    if meta_file.exists():
        try:
            with open(meta_file, "r") as f:
                manifest = json.load(f)
        except Exception:
            manifest = []

    snap_id = f"snap_{int(time.time())}"

    if target_source and target_source.exists() and target_source.stat().st_size > 0:
        # Copy real save binary
        dest_filename = f"{target_source.stem}_{snap_id}{target_source.suffix}"
        dest_filepath = folder / dest_filename
        shutil.copy2(target_source, dest_filepath)

        size_kb = round(dest_filepath.stat().st_size / 1024, 1)
        sha1_hash = hashlib.sha1(dest_filepath.read_bytes()).hexdigest()

        new_snap = {
            "id": snap_id,
            "filename": dest_filename,
            "label": label or "Player Checkpoint",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "size_kb": size_kb,
            "sha1": sha1_hash,
            "original_path": str(target_source),
            "is_auto": is_auto,
            "is_real_save": True
        }
    else:
        # If no active emulator save file exists yet, do not invent dummy data
        raise HTTPException(
            status_code=400,
            detail=f"No active save file or state (.sav, .srm, .state) found on disk for '{game['title']}'. Launch the game and create an in-game save first."
        )

    manifest.insert(0, new_snap)
    with open(meta_file, "w") as f:
        json.dump(manifest, f, indent=2)

    return {
        "status": "created",
        "snapshot": new_snap,
        "message": f"Time-Machine snapshot created from active save: '{new_snap['label']}'"
    }

@router.post("/rollback")
def rollback_snapshot(payload: Dict[str, Any] = Body(...)):
    """
    Safely rolls back active game memory to a verified historical snapshot.
    Copies the real snapshot binary back to the active save directory with an auto-safety backup.
    """
    game_id = payload.get("game_id")
    snap_id = payload.get("snapshot_id")

    game = get_game_info(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    folder = get_snapshot_folder(game["title"])
    meta_file = folder / "snapshots_manifest.json"

    if not meta_file.exists():
        raise HTTPException(status_code=404, detail="No snapshots found for this game")

    with open(meta_file, "r") as f:
        manifest = json.load(f)

    target_snap = next((s for s in manifest if s["id"] == snap_id), None)
    if not target_snap:
        raise HTTPException(status_code=404, detail="Target snapshot not found in manifest")

    snap_file = folder / target_snap["filename"]
    if not snap_file.exists():
        raise HTTPException(status_code=404, detail=f"Snapshot file '{target_snap['filename']}' no longer exists on disk")

    # Determine destination active save path
    dest_path = None
    orig_path_str = target_snap.get("original_path")
    if orig_path_str:
        dest_path = Path(orig_path_str)
    else:
        active_saves = find_active_save_files(game["title"], game["platform"])
        if active_saves:
            dest_path = active_saves[0]
        else:
            dest_path = get_roms_dir() / game['platform'] / snap_file.name

    # Safety auto-backup of active save before rollback
    safety_snap = None
    if dest_path.exists():
        safety_id = f"snap_safety_{int(time.time())}"
        safety_filename = f"{dest_path.stem}_{safety_id}.pre_rollback.bak"
        safety_path = folder / safety_filename
        shutil.copy2(dest_path, safety_path)

        safety_snap = {
            "id": safety_id,
            "filename": safety_filename,
            "label": f"Safety Backup (Before Rollback to {target_snap['label']})",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "size_kb": round(safety_path.stat().st_size / 1024, 1),
            "original_path": str(dest_path),
            "is_auto": True
        }
        manifest.insert(0, safety_snap)
        with open(meta_file, "w") as f:
            json.dump(manifest, f, indent=2)

    # Execute actual binary restore
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(snap_file, dest_path)

    return {
        "status": "rolled_back",
        "restored_snapshot": target_snap,
        "destination_restored": str(dest_path),
        "safety_backup": safety_snap,
        "message": f"Successfully rolled back active save to '{target_snap['label']}'."
    }

@router.get("/cloud-status")
def get_cloud_status():
    """Checks iCloud Drive and local cloud sync directory status."""
    icloud_available = DEFAULT_ICLOUD_PATH.parent.exists()
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT key, value FROM settings WHERE key IN ('cloud_sync_enabled', 'cloud_sync_path', 'cloud_last_sync')")
    rows = c.fetchall()
    conn.close()
    settings = {r["key"]: r["value"] for r in rows}

    sync_path = settings.get("cloud_sync_path") or str(DEFAULT_ICLOUD_PATH)

    total_snaps = 0
    if SNAPSHOTS_DIR.exists():
        for ext in COMMON_SAVE_EXTS:
            total_snaps += len(list(SNAPSHOTS_DIR.glob(f"**/*{ext}")))

    return {
        "icloud_available": icloud_available,
        "sync_enabled": settings.get("cloud_sync_enabled") == "true",
        "sync_path": sync_path,
        "last_synced": settings.get("cloud_last_sync") or "Never",
        "total_local_snapshots": total_snaps
    }

@router.post("/sync-cloud")
def sync_cloud(payload: Dict[str, Any] = Body(...)):
    """Synchronizes real save snapshots to iCloud Drive or backup directory."""
    target_path_str = payload.get("sync_path") or str(DEFAULT_ICLOUD_PATH)
    target_path = Path(target_path_str)
    
    try:
        target_path.mkdir(parents=True, exist_ok=True)
        shutil.copytree(SNAPSHOTS_DIR, target_path, dirs_exist_ok=True)
        
        sync_time = time.strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("INSERT INTO settings (key, value) VALUES ('cloud_sync_enabled', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'")
        c.execute("INSERT INTO settings (key, value) VALUES ('cloud_sync_path', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (target_path_str,))
        c.execute("INSERT INTO settings (key, value) VALUES ('cloud_last_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (sync_time,))
        conn.commit()
        conn.close()

        return {
            "status": "synced",
            "sync_path": str(target_path),
            "timestamp": sync_time,
            "message": f"Successfully synced save snapshots to {target_path_str}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cloud sync failed: {str(e)}")
