from typing import Any, Dict
from fastapi import APIRouter, Body, HTTPException

from ..scrapers.providers.manager import (
    SUPPORTED_PROVIDER_TYPES,
    add_custom_provider,
    add_search_template,
    build_provider_instance,
    delete_custom_provider,
    delete_search_template,
    get_all_providers,
    get_search_templates,
    toggle_custom_provider,
)
from ..services.mirror_resolver import export_source_pack, import_source_pack
from ..services.realdebrid_service import (
    get_realdebrid_config,
    test_realdebrid_key,
    verify_and_save_realdebrid_config,
)
from ..services.thegamesdb_service import (
    get_thegamesdb_config,
    save_thegamesdb_config,
    sync_all_platforms_from_thegamesdb,
    sync_platform_from_thegamesdb,
    test_thegamesdb_key,
)

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("")
def list_providers():
    return {"providers": get_all_providers()}


@router.post("")
def create_provider(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name", "").strip()
    endpoint_url = payload.get("endpoint_url", "").strip()
    api_key = payload.get("api_key", "").strip()
    provider_type = (payload.get("type") or "torznab").strip()
    config = payload.get("config")

    if not name or not endpoint_url:
        raise HTTPException(status_code=400, detail="Provider name and endpoint URL are required")
    if provider_type not in SUPPORTED_PROVIDER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider type '{provider_type}'. Allowed: {', '.join(SUPPORTED_PROVIDER_TYPES)}",
        )

    try:
        provider = add_custom_provider(
            name=name,
            endpoint_url=endpoint_url,
            api_key=api_key,
            provider_type=provider_type,
            config=config if isinstance(config, dict) else None,
            provider_id=payload.get("id"),
            is_enabled=payload.get("is_enabled", True),
        )
        return provider
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{provider_id}")
def remove_provider(provider_id: str):
    success = delete_custom_provider(provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"status": "deleted", "id": provider_id}


@router.patch("/{provider_id}/toggle")
def toggle_provider(provider_id: str):
    new_state = toggle_custom_provider(provider_id)
    if new_state is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"status": "updated", "id": provider_id, "is_enabled": new_state}


@router.post("/test")
async def test_provider_connection(payload: Dict[str, Any] = Body(...)):
    endpoint_url = payload.get("endpoint_url", "").strip()
    api_key = payload.get("api_key", "").strip()
    name = payload.get("name", "Test Provider")
    provider_type = (payload.get("type") or "torznab").strip()
    config = payload.get("config") if isinstance(payload.get("config"), dict) else {}

    if not endpoint_url:
        raise HTTPException(status_code=400, detail="Endpoint URL is required")

    temp_provider = build_provider_instance(
        provider_id="temp-test",
        name=name,
        provider_type=provider_type,
        endpoint_url=endpoint_url,
        api_key=api_key,
        config=config,
    )
    return await temp_provider.test_connection()


@router.post("/import-pack")
def import_full_pack(payload: Any = Body(...)):
    try:
        return import_source_pack(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/export-pack")
def export_full_pack():
    return export_source_pack()


# ---------------- Search Templates ----------------

@router.get("/templates")
def list_search_templates():
    return {"templates": get_search_templates()}


@router.post("/templates")
def create_search_template(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name", "").strip()
    url_template = payload.get("url_template", "").strip()
    description = payload.get("description", "").strip()

    if not name or not url_template:
        raise HTTPException(status_code=400, detail="Template name and URL template are required")

    if "{title}" not in url_template:
        raise HTTPException(status_code=400, detail="URL template must contain '{title}' placeholder")

    return add_search_template(name, url_template, description)


@router.delete("/templates/{template_id}")
def remove_search_template(template_id: str):
    success = delete_search_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "deleted", "id": template_id}


# ---------------- Real-Debrid Integration ----------------

@router.get("/realdebrid")
def get_realdebrid():
    return get_realdebrid_config()


@router.post("/realdebrid")
async def update_realdebrid(payload: Dict[str, Any] = Body(...)):
    api_key = payload.get("api_key")
    enabled = payload.get("enabled")
    res = await verify_and_save_realdebrid_config(api_key=api_key, enabled=enabled)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Invalid Real-Debrid API token"))
    return res["config"]


@router.post("/realdebrid/test")
async def test_realdebrid(payload: Dict[str, Any] = Body(default={})):
    api_key = payload.get("api_key")
    return await test_realdebrid_key(api_key=api_key)


# ---------------- TheGamesDB Integration ----------------

@router.get("/thegamesdb")
def get_thegamesdb():
    return get_thegamesdb_config()


@router.post("/thegamesdb")
def update_thegamesdb(payload: Dict[str, Any] = Body(...)):
    return save_thegamesdb_config(
        api_key=payload.get("api_key"),
        enabled=payload.get("enabled"),
        clear_custom_key=bool(payload.get("clear_custom_key", False)),
    )


@router.post("/thegamesdb/test")
async def test_thegamesdb(payload: Dict[str, Any] = Body(default={})):
    return await test_thegamesdb_key(api_key=payload.get("api_key"))


@router.post("/thegamesdb/sync-platform")
async def sync_thegamesdb_platform(payload: Dict[str, Any] = Body(default={})):
    platform = (payload.get("platform") or "Switch2").strip()
    max_pages = int(payload.get("max_pages", 3) or 3)
    start_page = int(payload.get("start_page", 1) or 1)
    result = await sync_platform_from_thegamesdb(platform=platform, max_pages=max_pages, start_page=start_page)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "TheGamesDB sync failed"))
    return result


@router.post("/thegamesdb/sync-all")
async def sync_all_thegamesdb_platforms(payload: Dict[str, Any] = Body(default={})):
    scope = (payload.get("scope") or "all").strip()
    pages_per_platform = int(payload.get("pages_per_platform", 1) or 1)
    use_static_dump = bool(payload.get("use_static_dump", True))
    result = await sync_all_platforms_from_thegamesdb(
        scope=scope,
        pages_per_platform=pages_per_platform,
        use_static_dump=use_static_dump,
    )
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "TheGamesDB batch sync failed"))
    return result
