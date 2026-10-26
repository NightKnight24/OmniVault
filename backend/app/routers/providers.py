from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
from ..scrapers.providers.manager import (
    get_all_providers,
    add_custom_provider,
    delete_custom_provider,
    toggle_custom_provider,
    get_search_templates,
    add_search_template,
    delete_search_template
)
from ..scrapers.providers.torznab_provider import TorznabSearchProvider

router = APIRouter(prefix="/api/providers", tags=["providers"])

@router.get("")
def list_providers():
    return {"providers": get_all_providers()}

@router.post("")
def create_provider(payload: Dict[str, Any] = Body(...)):
    name = payload.get("name", "").strip()
    endpoint_url = payload.get("endpoint_url", "").strip()
    api_key = payload.get("api_key", "").strip()
    provider_type = payload.get("type", "torznab")

    if not name or not endpoint_url:
        raise HTTPException(status_code=400, detail="Provider name and endpoint URL are required")

    provider = add_custom_provider(name, endpoint_url, api_key, provider_type)
    return provider

@router.delete("/{provider_id}")
def remove_provider(provider_id: str):
    if provider_id in ("rom_mirrors", "tpb_games", "nyaa_games"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in preservation provider")
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
async def test_torznab_connection(payload: Dict[str, Any] = Body(...)):
    endpoint_url = payload.get("endpoint_url", "").strip()
    api_key = payload.get("api_key", "").strip()
    name = payload.get("name", "Test Provider")

    if not endpoint_url:
        raise HTTPException(status_code=400, detail="Endpoint URL is required")

    temp_provider = TorznabSearchProvider(
        provider_id="temp-test",
        name=name,
        endpoint_url=endpoint_url,
        api_key=api_key
    )
    result = await temp_provider.test_connection()
    return result

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

    tpl = add_search_template(name, url_template, description)
    return tpl

@router.delete("/templates/{template_id}")
def remove_search_template(template_id: str):
    success = delete_search_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "deleted", "id": template_id}
