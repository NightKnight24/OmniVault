import asyncio
import re
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, HTTPException, Query

from ..database import get_db_connection
from ..scrapers.providers.manager import build_provider_instance, get_all_providers
from ..services.downloader import queue_download
from ..services.mirror_resolver import (
    add_or_update_mirror_source,
    delete_mirror_source,
    export_source_pack,
    import_source_pack,
    list_mirror_sources,
    mirror_resolver,
    toggle_mirror_source,
)
from ..services.realdebrid_service import (
    get_realdebrid_config,
    is_hoster_url,
    is_realdebrid_active,
    test_realdebrid_key,
)
from ..services.thegamesdb_service import get_thegamesdb_config, test_thegamesdb_key

router = APIRouter(prefix="/api/mirrors", tags=["mirrors"])


@router.get("/sources")
async def list_sources(ping: bool = Query(True)):
    """Returns all user-configured BYOS mirror sources with optional live latency/health metrics."""
    configured = list_mirror_sources(enabled_only=False)
    if not configured:
        return {"sources": []}

    health_by_id: Dict[str, Dict[str, Any]] = {}
    if ping:
        health_reports = await mirror_resolver.ping_all_sources()
        health_by_id = {h["source_id"]: h for h in health_reports}

    sources_data = []
    for s_info in configured:
        data = dict(s_info)
        if ping:
            h = health_by_id.get(s_info["id"], {})
            data["status"] = h.get("status", "online")
            data["latency_ms"] = h.get("latency_ms", 0)
            data["http_code"] = h.get("http_code", 200)
        else:
            data["status"] = "configured" if s_info.get("is_enabled") else "disabled"
            data["latency_ms"] = 0
            data["http_code"] = 200
        sources_data.append(data)
    return {"sources": sources_data}


@router.post("/sources")
def create_or_update_source(payload: Dict[str, Any] = Body(...)):
    try:
        saved = add_or_update_mirror_source(payload)
        return {"status": "saved", "source": saved}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/sources/{source_id}")
def remove_source(source_id: str):
    if not delete_mirror_source(source_id):
        raise HTTPException(status_code=404, detail=f"Mirror source '{source_id}' not found")
    return {"status": "deleted", "id": source_id}


@router.patch("/sources/{source_id}/toggle")
def toggle_source(source_id: str):
    new_state = toggle_mirror_source(source_id)
    if new_state is None:
        raise HTTPException(status_code=404, detail=f"Mirror source '{source_id}' not found")
    return {"status": "updated", "id": source_id, "is_enabled": new_state}


@router.post("/import-pack")
def import_mirrors_pack(payload: Any = Body(...)):
    try:
        return import_source_pack(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/export-pack")
def export_mirrors_pack():
    return export_source_pack()


@router.post("/search")
async def search_mirrors(payload: Dict[str, Any] = Body(...)):
    """Unified multi-source search across all enabled user-configured BYOS mirror sources."""
    query = payload.get("query", "").strip()
    platform = payload.get("platform")
    source_id = payload.get("source_id")
    strict = bool(payload.get("strict", False))

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if source_id:
        try:
            results = await mirror_resolver.scrape_source_by_id(source_id, query, platform, strict=strict)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"Unknown source: {source_id}")
    else:
        results = await mirror_resolver.search_all_sources(query, platform, strict=strict)

    return {
        "query": query,
        "platform": platform,
        "total_results": len(results),
        "results": results,
    }


@router.post("/find-mirror")
async def find_working_mirror(payload: Dict[str, Any] = Body(...)):
    """Scans enabled BYOS mirror sources in priority order for a verified working download stream."""
    title = payload.get("title", "").strip()
    platform = payload.get("platform", "Retro").strip()
    current_failed_url = payload.get("failed_url")

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    mirror = await mirror_resolver.find_working_mirror_for_game(title, platform, current_failed_url)
    if mirror:
        return {
            "status": "found",
            "title": title,
            "platform": platform,
            "mirror": mirror,
        }
    return {
        "status": "not_found",
        "title": title,
        "platform": platform,
        "message": "No direct working mirrors could be automatically verified from configured BYOS sources.",
    }


@router.post("/test-source")
async def test_single_source(payload: Dict[str, Any] = Body(...)):
    url = (payload.get("url") or "").strip()
    source_id = (payload.get("source_id") or "").strip()
    if url:
        return await mirror_resolver.check_url_health(
            url,
            source_id=source_id or "custom",
            name=(payload.get("name") or "Custom Source").strip(),
        )
    if source_id:
        return await mirror_resolver.check_source_health(source_id)
    raise HTTPException(status_code=400, detail="Either 'source_id' or 'url' is required")


async def _check_provider_health(prov: Dict[str, Any]) -> Dict[str, Any]:
    if not prov.get("is_enabled"):
        return {
            "id": prov["id"],
            "name": prov["name"],
            "type": prov["type"],
            "endpoint_url": prov["endpoint_url"],
            "is_enabled": False,
            "status": "disabled",
            "latency_ms": 0,
            "message": "Disabled by user",
        }
    start = time.time()
    instance = build_provider_instance(
        provider_id=prov["id"],
        name=prov["name"],
        provider_type=prov["type"],
        endpoint_url=prov["endpoint_url"],
        api_key=prov.get("api_key") or "",
        config=prov.get("config"),
        is_enabled=True,
    )
    res = await instance.test_connection()
    latency = round((time.time() - start) * 1000)
    ok = res.get("status") == "ok"
    return {
        "id": prov["id"],
        "name": prov["name"],
        "type": prov["type"],
        "endpoint_url": prov["endpoint_url"],
        "is_enabled": True,
        "status": "online" if ok else "offline",
        "latency_ms": latency,
        "message": res.get("message", ""),
    }


@router.post("/test-all")
async def test_all_sources():
    """Concurrently checks health & latency across all BYOS mirrors, torrent feeds, TheGamesDB, and Real-Debrid."""
    configured_mirrors = list_mirror_sources(enabled_only=False)
    configured_providers = get_all_providers()
    tgdb_cfg = get_thegamesdb_config()
    rd_cfg = get_realdebrid_config()

    async def check_mirror(s: Dict[str, Any]) -> Dict[str, Any]:
        if not s.get("is_enabled"):
            return {
                "source_id": s["id"],
                "name": s["name"],
                "url": s["url"],
                "adapter": s["adapter"],
                "is_enabled": False,
                "status": "disabled",
                "http_code": 0,
                "latency_ms": 0,
            }
        h = await mirror_resolver.check_url_health(
            s["url"],
            source_id=s["id"],
            name=s["name"],
            supports_direct_download=s.get("supports_direct_download", False),
        )
        return {
            **h,
            "url": s["url"],
            "adapter": s["adapter"],
            "is_enabled": True,
        }

    mirror_tasks = [check_mirror(s) for s in configured_mirrors]
    provider_tasks = [_check_provider_health(p) for p in configured_providers]

    async def check_tgdb() -> Dict[str, Any]:
        if not tgdb_cfg.get("enabled"):
            return {"status": "disabled", "message": "TheGamesDB is disabled"}
        return await test_thegamesdb_key()

    async def check_rd() -> Dict[str, Any]:
        if not rd_cfg.get("has_key"):
            return {"status": "unconfigured", "message": "No Real-Debrid API token saved"}
        if not rd_cfg.get("enabled"):
            return {"status": "disabled", "message": "Real-Debrid is disabled"}
        return await test_realdebrid_key()

    mirrors_res, providers_res, tgdb_res, rd_res = await asyncio.gather(
        asyncio.gather(*mirror_tasks) if mirror_tasks else asyncio.sleep(0, result=[]),
        asyncio.gather(*provider_tasks) if provider_tasks else asyncio.sleep(0, result=[]),
        check_tgdb(),
        check_rd(),
    )

    all_items: List[Dict[str, Any]] = list(mirrors_res) + list(providers_res)
    summary = {
        "total": len(all_items),
        "online": sum(1 for i in all_items if i.get("status") == "online"),
        "degraded": sum(1 for i in all_items if i.get("status") == "degraded"),
        "offline": sum(1 for i in all_items if i.get("status") == "offline"),
        "disabled": sum(1 for i in all_items if i.get("status") == "disabled"),
    }

    return {
        "summary": summary,
        "mirrors": mirrors_res,
        "providers": providers_res,
        "thegamesdb": tgdb_res,
        "realdebrid": rd_res,
    }


@router.post("/import-and-download")
async def import_and_download(payload: Dict[str, Any] = Body(...)):
    """Queues a direct mirror or torrent download attached to an existing catalog game_id (or imports if new)."""
    title = payload.get("title")
    platform = payload.get("platform", "Retro")
    direct_url = (payload.get("direct_url") or "").strip()
    filename = payload.get("filename") or f"{title}.zip"
    source_name = payload.get("source_name", "External Mirror")
    requested_game_id = (payload.get("game_id") or "").strip()
    destination_target = payload.get("destination_target")

    if not title or not direct_url:
        raise HTTPException(status_code=400, detail="title and direct_url are required")

    is_torrent = direct_url.startswith("magnet:") or direct_url.lower().endswith(".torrent")
    if not is_torrent and is_hoster_url(direct_url) and not is_realdebrid_active():
        raise HTTPException(
            status_code=400,
            detail="Real-Debrid token required to unlock this file hoster directly in-app. Add your Real-Debrid token in Settings -> Real-Debrid.",
        )

    clean_stem = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-")
    game_id = requested_game_id or f"{platform.lower()}-{clean_stem[:30]}"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
    existing = cursor.fetchone()
    if existing:
        if not direct_url.startswith("magnet:"):
            cursor.execute("UPDATE games SET direct_download_url = ? WHERE id = ?", (direct_url, game_id))
    else:
        cursor.execute(
            """
            INSERT INTO games (id, title, slug, platform, platform_name, genre, direct_download_url, description)
            VALUES (?, ?, ?, ?, ?, 'Imported', ?, ?)
            ON CONFLICT(id) DO UPDATE SET direct_download_url = excluded.direct_download_url
            """,
            (
                game_id,
                title,
                clean_stem,
                platform,
                platform,
                direct_url,
                f"Imported from {source_name} mirror.",
            ),
        )
    conn.commit()
    conn.close()

    effective_type = "torrent" if is_torrent else "direct"
    try:
        item = queue_download(
            game_id=game_id,
            game_title=title,
            platform=platform,
            url=direct_url,
            filename=filename,
            download_type=effective_type,
            destination_target=destination_target,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    return {
        "status": "queued",
        "game_id": game_id,
        "title": title,
        "download": item,
    }
