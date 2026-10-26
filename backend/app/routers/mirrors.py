from fastapi import APIRouter, HTTPException, Body, Query
from typing import Dict, Any, List, Optional
import os
import re
from pathlib import Path
from ..services.mirror_resolver import mirror_resolver, MIRROR_SOURCES
from ..services.downloader import queue_download
from ..database import get_db_connection

router = APIRouter(prefix="/api/mirrors", tags=["mirrors"])

@router.get("/sources")
async def list_sources():
    """Returns all 8+ configured ROM mirror & scraper sources with live ping and health metrics."""
    health_reports = await mirror_resolver.ping_all_sources()
    # Merge health info into source definitions
    sources_data = []
    health_by_id = {h["source_id"]: h for h in health_reports}
    for s_id, s_info in MIRROR_SOURCES.items():
        data = dict(s_info)
        h = health_by_id.get(s_id, {})
        data["status"] = h.get("status", "online")
        data["latency_ms"] = h.get("latency_ms", 0)
        data["http_code"] = h.get("http_code", 200)
        sources_data.append(data)
    return {"sources": sources_data}

@router.post("/search")
async def search_mirrors(payload: Dict[str, Any] = Body(...)):
    """
    Unified multi-source search across r-roms, BlueRoms, ConsoleRoms, RomsGames,
    RomsFun, RomsLab, Ziperto, Vimm's Lair, and Archive.org.
    """
    query = payload.get("query", "").strip()
    platform = payload.get("platform")
    source_id = payload.get("source_id")
    
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
        
    if source_id:
        if source_id == "r-roms":
            results = await mirror_resolver.scrape_r_roms(query, platform)
        elif source_id == "blueroms":
            results = await mirror_resolver.scrape_blueroms(query, platform)
        elif source_id == "consoleroms":
            results = await mirror_resolver.scrape_consoleroms(query, platform)
        elif source_id == "romsgames":
            results = await mirror_resolver.scrape_romsgames(query, platform)
        elif source_id == "romsfun":
            results = await mirror_resolver.scrape_romsfun(query, platform)
        elif source_id == "romslab":
            results = await mirror_resolver.scrape_romslab(query, platform)
        elif source_id == "ziperto":
            results = await mirror_resolver.scrape_ziperto(query, platform)
        elif source_id == "dlpsgame":
            results = await mirror_resolver.scrape_dlpsgame(query, platform)
        elif source_id == "vimm":
            results = await mirror_resolver.scrape_vimm(query, platform)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown source: {source_id}")
    else:
        results = await mirror_resolver.search_all_sources(query, platform)
        
    return {
        "query": query,
        "platform": platform,
        "total_results": len(results),
        "results": results
    }

@router.post("/find-mirror")
async def find_working_mirror(payload: Dict[str, Any] = Body(...)):
    """
    Given a game title and platform, scans mirror sources in priority order
    and returns the first verified, working 200/206 direct download stream.
    """
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
            "mirror": mirror
        }
    else:
        return {
            "status": "not_found",
            "title": title,
            "platform": platform,
            "message": "No direct working mirrors could be automatically verified for this title."
        }

@router.post("/test-source")
async def test_single_source(payload: Dict[str, Any] = Body(...)):
    source_id = payload.get("source_id", "blueroms")
    result = await mirror_resolver.check_source_health(source_id)
    return result

@router.post("/import-and-download")
async def import_and_download(payload: Dict[str, Any] = Body(...)):
    """
    Imports a ROM found on an external mirror directly into the OmniVault local library
    and initiates the download worker.
    """
    title = payload.get("title")
    platform = payload.get("platform", "Retro")
    direct_url = payload.get("direct_url")
    filename = payload.get("filename") or f"{title}.zip"
    source_name = payload.get("source_name", "External Mirror")
    
    if not title or not direct_url:
        raise HTTPException(status_code=400, detail="title and direct_url are required")
        
    # Generate clean slug
    clean_stem = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-")
    game_id = f"{platform.lower()}-{clean_stem[:30]}"
    
    # Insert or update into games table
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO games (id, title, slug, platform, platform_name, genre, direct_download_url, description)
        VALUES (?, ?, ?, ?, ?, 'Imported', ?, ?)
        ON CONFLICT(id) DO UPDATE SET direct_download_url = excluded.direct_download_url
    """, (
        game_id,
        title,
        clean_stem,
        platform,
        platform,
        direct_url,
        f"Imported from {source_name} preservation mirror."
    ))
    conn.commit()
    conn.close()
    
    # Queue download
    is_torrent = direct_url.startswith("magnet:") or direct_url.endswith(".torrent")
    effective_type = "torrent" if is_torrent else "direct"
    item = queue_download(
        game_id=game_id,
        game_title=title,
        platform=platform,
        url=direct_url,
        filename=filename,
        download_type=effective_type
    )
    
    return {
        "status": "queued",
        "game_id": game_id,
        "title": title,
        "download": item
    }
