import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional

from ..database import get_db_connection, DB_DIR, DB_PATH

STORAGE_POINTER_FILE = DB_DIR / ".storage_config.json"

def get_detected_volumes() -> List[Dict[str, Any]]:
    """
    Detects mounted volumes on macOS or drive letters on Windows plus user home directory,
    filtering for real, writable storage targets (excluding read-only installer DMGs).
    """
    volumes = []
    seen_paths = set()

    if sys.platform == "win32":
        import string
        for letter in string.ascii_uppercase:
            drive_str = f"{letter}:\\"
            if os.path.exists(drive_str):
                try:
                    stat = shutil.disk_usage(drive_str)
                    total_gb = round(stat.total / (1024 ** 3), 1)
                    free_gb = round(stat.free / (1024 ** 3), 1)
                    is_writable = os.access(drive_str, os.W_OK)
                    volumes.append({
                        "name": f"Local Disk ({letter}:)",
                        "path": drive_str,
                        "total_gb": total_gb,
                        "free_gb": free_gb,
                        "is_writable": is_writable,
                        "is_portable": letter != "C"
                    })
                    seen_paths.add(drive_str)
                except Exception:
                    pass
        if os.path.exists(r"C:\OmniVault"):
            try:
                stat = shutil.disk_usage(r"C:\OmniVault")
                volumes.append({
                    "name": "OmniVault System Directory (C:\\OmniVault)",
                    "path": r"C:\OmniVault\ROMs",
                    "total_gb": round(stat.total / (1024 ** 3), 1),
                    "free_gb": round(stat.free / (1024 ** 3), 1),
                    "is_writable": True,
                    "is_portable": False
                })
            except Exception:
                pass
        return volumes

    vol_base = Path("/Volumes")

    if vol_base.exists():
        for v in sorted(vol_base.iterdir()):
            if not v.is_dir() or v.name.startswith("."):
                continue
            path_str = str(v)
            if path_str in seen_paths:
                continue
            try:
                # Test write permission and disk usage
                is_writable = os.access(path_str, os.W_OK)
                stat = shutil.disk_usage(path_str)
                total_gb = round(stat.total / (1024 ** 3), 1)
                free_gb = round(stat.free / (1024 ** 3), 1)
                
                # Filter out obvious tiny installer DMGs / read-only recovery
                if total_gb < 1.0 or not is_writable:
                    continue

                volumes.append({
                    "name": v.name,
                    "path": path_str,
                    "total_gb": total_gb,
                    "free_gb": free_gb,
                    "is_writable": is_writable,
                    "is_portable": v.name == "ROMS" or "external" in v.name.lower() or total_gb > 100
                })
                seen_paths.add(path_str)
            except Exception:
                pass

    # Add User Home Directory as standard local storage option
    home_dir = str(Path.home())
    if home_dir not in seen_paths:
        try:
            stat = shutil.disk_usage(home_dir)
            volumes.append({
                "name": "Macintosh Internal (~/OmniVault)",
                "path": str(Path.home() / "OmniVault"),
                "total_gb": round(stat.total / (1024 ** 3), 1),
                "free_gb": round(stat.free / (1024 ** 3), 1),
                "is_writable": os.access(home_dir, os.W_OK),
                "is_portable": False
            })
        except Exception:
            pass

    return volumes

def get_quick_setup_defaults() -> Dict[str, Any]:
    """
    Intelligently pre-picks the optimal locations for all 4 directories:
    On Windows: C:\\OmniVault (ROMs, Emulators, BIOS, OmniVault-Data)
    On macOS:
    1. Prefer /Volumes/ROMS if mounted & writable
    2. Fallback to /Volumes/GAMES or highest capacity external volume
    3. Fallback to ~/OmniVault on internal drive
    """
    if sys.platform == "win32":
        root = Path("C:/OmniVault")
        return {
            "preset_id": "windows_omnivault",
            "preset_label": "OmniVault Directory (C:\\OmniVault)",
            "dir_roms": str(root / "ROMs"),
            "dir_emulators": str(root / "Emulators"),
            "dir_bios": str(root / "BIOS"),
            "dir_app_data": str(root / "OmniVault-Data")
        }

    roms_vol = Path("/Volumes/ROMS")
    if roms_vol.exists() and os.access(str(roms_vol), os.W_OK):
        root = roms_vol
        preset_id = "portable_roms"
        preset_label = "Portable ROMs Drive (/Volumes/ROMS)"
        roms_path = str(root)
    else:
        games_vol = Path("/Volumes/GAMES")
        if games_vol.exists() and os.access(str(games_vol), os.W_OK):
            root = games_vol
            preset_id = "games_vol"
            preset_label = "Dedicated Games Volume (/Volumes/GAMES)"
            roms_path = str(root / "ROMs")
        else:
            root = Path.home() / "OmniVault"
            preset_id = "user_home"
            preset_label = "Local macOS Storage (~/OmniVault)"
            roms_path = str(root / "ROMs")

    return {
        "preset_id": preset_id,
        "preset_label": preset_label,
        "dir_roms": roms_path,
        "dir_emulators": str(root / "Emulators"),
        "dir_bios": str(root / "BIOS"),
        "dir_app_data": str(root / "OmniVault-Data")
    }

def _get_path_info(path_str: str) -> Dict[str, Any]:
    """Inspects path existence, permissions, and disk space."""
    p = Path(path_str).expanduser()
    exists = p.exists()
    
    # Calculate disk usage from path or nearest parent
    check_target = p if exists else (p.parent if p.parent.exists() else Path("/"))
    total_gb, free_gb, used_gb = 0.0, 0.0, 0.0
    try:
        stat = shutil.disk_usage(str(check_target))
        total_gb = round(stat.total / (1024 ** 3), 1)
        free_gb = round(stat.free / (1024 ** 3), 1)
        used_gb = round(stat.used / (1024 ** 3), 1)
    except Exception:
        pass

    is_writable = os.access(str(check_target), os.W_OK) if check_target.exists() else False

    return {
        "path": str(p),
        "exists": exists,
        "is_writable": is_writable,
        "total_gb": total_gb,
        "free_gb": free_gb,
        "used_gb": used_gb
    }

def get_storage_config() -> Dict[str, Any]:
    """
    Returns the comprehensive storage configuration including all 4 folders,
    quick defaults, detected volumes, and app bundle location.
    """
    quick_defaults = get_quick_setup_defaults()

    # 1. Check pointer file
    stored_config = {}
    if STORAGE_POINTER_FILE.exists():
        try:
            with open(STORAGE_POINTER_FILE, "r", encoding="utf-8") as f:
                stored_config = json.load(f)
        except Exception:
            stored_config = {}

    # 2. Check settings table in database
    db_settings = {}
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT key, value FROM settings WHERE key LIKE 'dir_%' OR key IN ('storage_setup_mode', 'download_dir')")
        for r in c.fetchall():
            db_settings[r["key"]] = r["value"]
        conn.close()
    except Exception:
        pass

    # Resolve paths (DB settings override pointer file, fallback to quick defaults)
    dir_roms = db_settings.get("dir_roms") or stored_config.get("dir_roms") or db_settings.get("download_dir") or quick_defaults["dir_roms"]
    dir_emulators = db_settings.get("dir_emulators") or stored_config.get("dir_emulators") or quick_defaults["dir_emulators"]
    dir_bios = db_settings.get("dir_bios") or stored_config.get("dir_bios") or quick_defaults["dir_bios"]
    dir_app_data = db_settings.get("dir_app_data") or stored_config.get("dir_app_data") or quick_defaults["dir_app_data"]
    setup_mode = db_settings.get("storage_setup_mode") or stored_config.get("storage_setup_mode") or "quick"

    if sys.platform == "win32":
        def _clean_win(p: Optional[str], default_p: str) -> str:
            if not p or not isinstance(p, str):
                return default_p
            if p.startswith("/Volumes") or "system32\\config\\systemprofile" in p.lower():
                return default_p
            return p
        dir_roms = _clean_win(dir_roms, quick_defaults["dir_roms"])
        dir_emulators = _clean_win(dir_emulators, quick_defaults["dir_emulators"])
        dir_bios = _clean_win(dir_bios, quick_defaults["dir_bios"])
        dir_app_data = _clean_win(dir_app_data, quick_defaults["dir_app_data"])
        app_bundle_path = r"C:\OmniVault"
    else:
        # App bundle path
        app_bundle_path = "/Volumes/ROMS/OmniVault.app"
        if not Path(app_bundle_path).exists():
            if Path("/Applications/OmniVault.app").exists():
                app_bundle_path = "/Applications/OmniVault.app"
            else:
                app_bundle_path = str(Path(__file__).resolve().parent.parent.parent.parent)

    detected_volumes = get_detected_volumes()

    return {
        "mode": setup_mode, # "quick" | "custom"
        "quick_defaults": quick_defaults,
        "app_bundle": {
            "path": app_bundle_path,
            "exists": Path(app_bundle_path).exists()
        },
        "directories": {
            "roms": _get_path_info(dir_roms),
            "emulators": _get_path_info(dir_emulators),
            "bios": _get_path_info(dir_bios),
            "app_data": _get_path_info(dir_app_data)
        },
        "detected_volumes": detected_volumes
    }

def save_storage_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Saves user choices for all 4 directories (ROMs, Emulators, BIOS, App Data)
    and propagates changes to disk, settings DB, pointer config, and runtime services.
    """
    mode = payload.get("mode", "custom")
    dir_roms = payload.get("dir_roms", "").strip()
    dir_emulators = payload.get("dir_emulators", "").strip()
    dir_bios = payload.get("dir_bios", "").strip()
    dir_app_data = payload.get("dir_app_data", "").strip()

    quick_defaults = get_quick_setup_defaults()
    if mode == "quick" or not (dir_roms and dir_emulators and dir_bios and dir_app_data):
        dir_roms = quick_defaults["dir_roms"]
        dir_emulators = quick_defaults["dir_emulators"]
        dir_bios = quick_defaults["dir_bios"]
        dir_app_data = quick_defaults["dir_app_data"]
        mode = "quick"

    # Expand user paths (~/...)
    p_roms = Path(dir_roms).expanduser().resolve()
    p_emus = Path(dir_emulators).expanduser().resolve()
    p_bios = Path(dir_bios).expanduser().resolve()
    p_data = Path(dir_app_data).expanduser().resolve()

    # Create directories safely
    p_roms.mkdir(parents=True, exist_ok=True)
    p_emus.mkdir(parents=True, exist_ok=True)
    p_bios.mkdir(parents=True, exist_ok=True)
    p_data.mkdir(parents=True, exist_ok=True)

    # Subdirectories for App Data
    (p_data / "SaveSnapshots").mkdir(parents=True, exist_ok=True)
    (p_data / ".mod_cache").mkdir(parents=True, exist_ok=True)
    (p_data / "Patches").mkdir(parents=True, exist_ok=True)

    # Write pointer file for fast boot
    pointer_data = {
        "storage_setup_mode": mode,
        "dir_roms": str(p_roms),
        "dir_emulators": str(p_emus),
        "dir_bios": str(p_bios),
        "dir_app_data": str(p_data)
    }
    STORAGE_POINTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STORAGE_POINTER_FILE, "w", encoding="utf-8") as f:
        json.dump(pointer_data, f, indent=2)

    # Save to settings database
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('dir_roms', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (str(p_roms),))
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('download_dir', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (str(p_roms),))
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('dir_emulators', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (str(p_emus),))
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('dir_bios', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (str(p_bios),))
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('dir_app_data', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (str(p_data),))
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('storage_setup_mode', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (mode,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[StorageConfig Save Warning]: {e}")

    # Propagate to emulator manager in memory
    try:
        from .emulator_manager import emulator_manager
        emulator_manager.emulators_dir = p_emus
        emulator_manager.bios_dir = p_bios
    except Exception:
        pass

    return get_storage_config()

def browse_directory_native(default_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Invokes native OS folder chooser dialog (PowerShell on Windows, AppleScript on macOS).
    Returns the selected folder path or canceled status.
    """
    if sys.platform == "win32":
        initial_dir = default_path or r"C:\OmniVault"
        if not os.path.exists(initial_dir):
            initial_dir = r"C:\\"
        ps_cmd = f"""
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Select OmniVault Folder'
$f.SelectedPath = '{initial_dir}'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    [Console]::WriteLine($f.SelectedPath)
}} else {{
    [Console]::WriteLine('CANCELED')
}}
"""
        try:
            res = subprocess.run(["powershell.exe", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=60)
            output = res.stdout.strip()
            if not output or "CANCELED" in output:
                return {"canceled": True, "path": None}
            clean_path = output.splitlines()[-1].strip()
            return {"canceled": False, "path": clean_path}
        except subprocess.TimeoutExpired:
            return {"canceled": True, "path": None, "error": "Dialog timed out"}
        except Exception as e:
            return {"canceled": True, "path": None, "error": str(e)}

    initial_dir = default_path or "/Volumes/ROMS"
    if not Path(initial_dir).exists():
        initial_dir = str(Path.home())

    script = f'''
    try
        tell application "Finder" to activate
        set chosen to choose folder with prompt "Select OmniVault Folder" default location (POSIX file "{initial_dir}")
        return POSIX path of chosen
    on error errMsg number errNum
        if errNum is -128 then
            return "CANCELED"
        else
            try
                set chosen to choose folder with prompt "Select OmniVault Folder"
                return POSIX path of chosen
            on error
                return "CANCELED"
            end try
        end if
    end try
    '''
    try:
        res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=60)
        output = res.stdout.strip()
        if not output or output == "CANCELED":
            return {"canceled": True, "path": None}
        # Strip trailing slash if present for POSIX cleanliness
        clean_path = output.rstrip("/")
        return {"canceled": False, "path": clean_path}
    except subprocess.TimeoutExpired:
        return {"canceled": True, "path": None, "error": "Dialog timed out"}
    except Exception as e:
        return {"canceled": True, "path": None, "error": str(e)}

def reveal_storage_path(folder_type: str, custom_path: Optional[str] = None) -> Dict[str, Any]:
    """Reveals the requested folder in macOS Finder."""
    config = get_storage_config()
    target_path = None

    if custom_path:
        target_path = Path(custom_path).expanduser()
    elif folder_type == "roms":
        target_path = Path(config["directories"]["roms"]["path"])
    elif folder_type == "emulators":
        target_path = Path(config["directories"]["emulators"]["path"])
    elif folder_type == "bios":
        target_path = Path(config["directories"]["bios"]["path"])
    elif folder_type == "app_data":
        target_path = Path(config["directories"]["app_data"]["path"])
    elif folder_type == "app_bundle":
        target_path = Path(config["app_bundle"]["path"])
    else:
        target_path = Path(config["directories"]["roms"]["path"])

    if not target_path.exists():
        target_path.mkdir(parents=True, exist_ok=True)

    if sys.platform == "win32":
        subprocess.run(["explorer", str(target_path)], check=False)
    else:
        subprocess.run(["/usr/bin/open", str(target_path)], check=False)
    return {"status": "opened", "path": str(target_path)}

# Global path accessors for backend modules
def get_roms_dir() -> Path:
    config = get_storage_config()
    p = Path(config["directories"]["roms"]["path"])
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_emulators_dir() -> Path:
    config = get_storage_config()
    p = Path(config["directories"]["emulators"]["path"])
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_bios_dir() -> Path:
    config = get_storage_config()
    p = Path(config["directories"]["bios"]["path"])
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_app_data_dir() -> Path:
    config = get_storage_config()
    p = Path(config["directories"]["app_data"]["path"])
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_snapshots_dir() -> Path:
    p = get_app_data_dir() / "SaveSnapshots"
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_mod_cache_dir() -> Path:
    p = get_app_data_dir() / ".mod_cache"
    p.mkdir(parents=True, exist_ok=True)
    return p

def get_patches_dir() -> Path:
    p = get_app_data_dir() / "Patches"
    p.mkdir(parents=True, exist_ok=True)
    return p
