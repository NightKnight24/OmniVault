from fastapi import APIRouter, HTTPException, Body, Query, UploadFile, File
from typing import Dict, Any, List, Optional
from ..services.emulator_manager import emulator_manager, SUPPORTED_EMULATORS

router = APIRouter(prefix="/api/emulators", tags=["emulators"])

@router.get("/active-session")
async def get_active_session():
    """Returns the currently active native emulator session with game details."""
    session = emulator_manager.get_active_session()
    return {"session": session}

@router.post("/sync-controllers")
async def sync_controllers():
    """Forces an immediate controller synchronization across all emulators."""
    emulator_manager._sync_controller_configs()
    return {"status": "synced", "controllers": emulator_manager._detect_connected_controllers()}

@router.get("/status")
async def get_emulators_status():
    """Returns the live installation and version status of all supported native emulators."""
    statuses = await emulator_manager.get_all_status()
    return {"emulators": statuses}

@router.post("/install")
async def install_or_update_emulator(payload: Dict[str, Any] = Body(...)):
    """Downloads, installs, or updates the requested emulator directly into /Volumes/ROMS/Emulators."""
    emu_id = payload.get("emulator_id")
    if not emu_id or emu_id not in SUPPORTED_EMULATORS:
        raise HTTPException(status_code=400, detail=f"Invalid or missing emulator_id. Available: {list(SUPPORTED_EMULATORS.keys())}")
        
    try:
        result = await emulator_manager.install_or_update(emu_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/install-all")
async def install_all_emulators():
    """Batch-installs or updates all native emulators in the background."""
    results = []
    errors = []
    for emu_id in SUPPORTED_EMULATORS.keys():
        try:
            res = await emulator_manager.install_or_update(emu_id)
            results.append(res)
        except Exception as e:
            errors.append({"emulator_id": emu_id, "error": str(e)})
            
    return {
        "status": "completed",
        "installed": results,
        "errors": errors
    }

@router.post("/launch")
async def launch_in_emulator(payload: Dict[str, Any] = Body(...)):
    """Launches the specified ROM file directly in its native emulator."""
    path = payload.get("path")
    platform = payload.get("platform", "Retro")
    force = bool(payload.get("force", False))
    
    if not path:
        raise HTTPException(status_code=400, detail="ROM path is required")
        
    try:
        result = emulator_manager.launch_game(path, platform, force=force)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/bios-check/{platform}")
async def check_platform_bios(platform: str):
    """Checks if a platform strictly requires BIOS/keys and whether they are ready."""
    return emulator_manager.check_platform_bios_requirement(platform)

@router.post("/control")
async def control_active_emulator(payload: Dict[str, Any] = Body(...)):
    """Controls the currently active native emulator session (resume, quit, save_state, load_state, reset, volume)."""
    action = payload.get("action", "")
    value = payload.get("value")
    try:
        return emulator_manager.control_active_emulator(action, value)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings")
async def get_settings():
    """Returns unified graphics, audio, and BIOS path configurations across all emulators."""
    settings = emulator_manager.get_unified_settings()
    return {"settings": settings}

@router.post("/settings")
async def save_settings(payload: Dict[str, Any] = Body(...)):
    """Saves unified settings to database and automatically writes them to emulator config files."""
    settings = payload.get("settings", {})
    if not settings:
        raise HTTPException(status_code=400, detail="Settings payload required")
        
    result = emulator_manager.update_unified_settings(settings)
    return result

@router.get("/bios")
async def get_bios_status():
    """Scans /Volumes/ROMS/BIOS for official system firmware (PS2 BIOS, PS3 PUP, Vita Firmware, Switch Keys)."""
    status = emulator_manager.scan_bios_status()
    return status

@router.post("/upload-bios")
async def upload_bios_file(file: UploadFile = File(...)):
    """Accepts an uploaded BIOS or firmware file and saves/extracts it directly into /Volumes/ROMS/BIOS."""
    try:
        content = await file.read()
        res = emulator_manager.save_uploaded_bios(file.filename, content)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload BIOS file: {str(e)}")

@router.get("/setup-status")
async def get_setup_wizard_status():
    """Returns whether the initial launch setup wizard has been completed and current readiness."""
    status = emulator_manager.get_setup_status()
    return status

@router.post("/complete-setup")
async def complete_initial_setup(payload: Dict[str, Any] = Body(...)):
    """Marks the initial setup wizard as completed and persists user initial settings."""
    res = emulator_manager.complete_setup(payload)
    return res

@router.post("/open-folder")
async def open_emulator_folder(payload: Dict[str, Any] = Body(...)):
    """Reveals the requested folder (emulators or bios) in macOS Finder."""
    folder = payload.get("folder", "emulators")
    res = emulator_manager.open_folder(folder)
    return res

