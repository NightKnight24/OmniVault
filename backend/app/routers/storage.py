from fastapi import APIRouter, HTTPException, Body, Query, Request
from fastapi.responses import HTMLResponse
from typing import Dict, Any, Optional
from ..services.storage_service import (
    get_storage_config,
    save_storage_config,
    browse_directory_native,
    reveal_storage_path,
    get_quick_setup_defaults,
    get_detected_volumes,
    get_setup_status,
    complete_setup
)
from ..services.cloud_storage_service import (
    complete_cloud_oauth_callback,
    get_cloud_targets_status,
    open_cloud_system_signin,
    save_cloud_targets_config,
    start_cloud_oauth_flow,
    test_cloud_target,
)

router = APIRouter(prefix="/api/storage", tags=["storage"])

@router.get("/config")
def get_storage_configuration():
    """
    Returns current active directory locations (ROMs / Downloads & App Data),
    quick setup presets, disk usage, and detected volumes.
    """
    try:
        return get_storage_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load storage config: {str(e)}")

@router.post("/config")
def update_storage_configuration(payload: Dict[str, Any] = Body(...)):
    """
    Saves user customized or selected storage paths for:
    - dir_roms
    - dir_app_data
    - mode ("quick" or "custom")
    """
    try:
        updated = save_storage_config(payload)
        return {"status": "success", "config": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save storage config: {str(e)}")

@router.post("/quick-setup")
def apply_quick_setup():
    """
    1-Click Quick Setup: Intelligently selects recommended defaults based on
    mounted portable drive (/Volumes/ROMS) or internal storage and creates all folders.
    """
    try:
        defaults = get_quick_setup_defaults()
        updated = save_storage_config({
            "mode": "quick",
            "dir_roms": defaults["dir_roms"],
            "dir_app_data": defaults["dir_app_data"]
        })
        return {
            "status": "success",
            "message": f"Quick Setup successfully applied using {defaults['preset_label']}!",
            "config": updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quick setup failed: {str(e)}")

@router.get("/setup-status")
def get_setup_wizard_status():
    """Returns whether the initial launch setup wizard has been completed and current storage readiness."""
    try:
        return get_setup_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get setup status: {str(e)}")

@router.post("/complete-setup")
def complete_initial_setup(payload: Dict[str, Any] = Body(default={})):
    """Marks the initial setup wizard as completed and persists user storage choices."""
    try:
        return complete_setup(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to complete setup: {str(e)}")

@router.post("/browse")
def browse_folder_dialog(payload: Dict[str, Any] = Body(default={})):
    """
    Opens the native macOS Finder folder selection dialog so the user can
    interactively pick any folder on any internal or external drive.
    """
    default_path = payload.get("default_path")
    res = browse_directory_native(default_path)
    return res

@router.post("/reveal")
def reveal_folder_in_finder(payload: Dict[str, Any] = Body(...)):
    """
    Reveals the specified storage folder (roms, app_data, app_bundle) in macOS Finder.
    """
    folder_type = payload.get("folder", "roms")
    custom_path = payload.get("path")
    res = reveal_storage_path(folder_type, custom_path)
    return res

@router.get("/volumes")
def list_available_volumes():
    """Lists all detected, writable storage drives and free space on macOS."""
    return {"volumes": get_detected_volumes()}


@router.get("/cloud-targets")
def get_cloud_targets():
    """Returns configured and auto-detected iCloud Drive, Google Drive, and OneDrive download targets."""
    try:
        return get_cloud_targets_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load cloud targets: {str(e)}")


@router.post("/cloud-targets")
def update_cloud_targets(payload: Dict[str, Any] = Body(...)):
    """Saves default destination target and per-cloud provider sync folder or REST API tokens."""
    try:
        updated = save_cloud_targets_config(payload)
        return {"status": "success", **updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save cloud targets: {str(e)}")


@router.post("/cloud-targets/test")
async def verify_cloud_target(payload: Dict[str, Any] = Body(...)):
    """Tests write access or REST API authentication for iCloud Drive, Google Drive, or OneDrive."""
    provider_id = payload.get("provider_id", "")
    return await test_cloud_target(provider_id, payload)


@router.post("/cloud-signin-system")
def launch_cloud_system_signin(payload: Dict[str, Any] = Body(...)):
    """Opens native macOS iCloud settings or official Google Drive / OneDrive desktop sign-in."""
    try:
        provider_id = payload.get("provider_id", "")
        return open_cloud_system_signin(provider_id)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch sign-in: {str(e)}")


@router.post("/cloud-oauth/start")
def initiate_cloud_oauth(request: Request, payload: Dict[str, Any] = Body(...)):
    """Starts OAuth 2.0 PKCE browser 'Sign in & Allow' flow for Google Drive or OneDrive."""
    try:
        base_url = f"{request.url.scheme}://{request.url.netloc}"
        return start_cloud_oauth_flow(
            provider_id=payload.get("provider_id", ""),
            client_id=payload.get("client_id"),
            client_secret=payload.get("client_secret"),
            redirect_base=base_url,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start OAuth sign-in: {str(e)}")


@router.get("/cloud-oauth/callback", response_class=HTMLResponse)
async def handle_cloud_oauth_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
):
    """Receives OAuth 2.0 PKCE loopback callback and stores cloud tokens locally."""
    html_page = await complete_cloud_oauth_callback(
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )
    return HTMLResponse(content=html_page)
