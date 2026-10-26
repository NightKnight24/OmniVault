from fastapi import APIRouter, HTTPException, Body, Query
from typing import Dict, Any, List, Optional
import asyncio
import json
import uuid
import re
from ..database import get_db_connection
from ..scrapers.providers.manager import search_all_providers
from ..scrapers.metadata_scraper import scrape_game_metadata
from ..services.mirror_resolver import mirror_resolver

router = APIRouter(prefix="/api/scrape", tags=["scrape"])

@router.get("/search")
async def search_online_sources_get(
    q: str = Query(..., description="Game title to search"),
    platform: Optional[str] = Query("SNES", description="Console platform")
):
    return await search_online_sources({"query": q, "platform": platform})

@router.post("/search")
async def search_online_sources(payload: Dict[str, Any] = Body(...)):
    query = payload.get("query", "").strip()
    platform = payload.get("platform", "SNES")
    
    if not query:
        raise HTTPException(status_code=400, detail="Search query is required")
        
    # Concurrently search both Torznab / BitTorrent & Archive providers AND all mirror sites
    # (r-roms, BlueRoms, ConsoleRoms, RomsGames, RomsFun, RomsLab, Ziperto, Vimm's Lair)
    prov_task = search_all_providers(query, platform=platform, limit=12)
    mirror_task = mirror_resolver.search_all_sources(query, platform=platform, limit_per_source=4)
    
    try:
        prov_results, mirror_results = await asyncio.wait_for(
            asyncio.gather(prov_task, mirror_task, return_exceptions=True),
            timeout=8.0
        )
    except asyncio.TimeoutError:
        prov_results, mirror_results = [], []
    
    combined_candidates: List[Dict[str, Any]] = []
    
    # Prioritize dedicated mirror sites first for accurate console ROMs and direct PKG links
    if isinstance(mirror_results, list):
        for m in mirror_results:
            combined_candidates.append({
                "id": f"mirror-{uuid.uuid4().hex[:6]}",
                "title": m.get("title", query),
                "platform": platform,
                "platform_name": platform,
                "source": m.get("source_name", "Direct Mirror"),
                "direct_download_url": m.get("direct_url"),
                "magnet_uri": None,
                "torrent_url": None,
                "file_size_mb": m.get("file_size_mb", 0.0),
                "seeders": None,
                "leechers": None,
                "description": f"Retrieved from {m.get('source_name')} mirror.",
                "year": None
            })

    if isinstance(prov_results, list):
        combined_candidates.extend(prov_results)
            
    # 1G1R deduplication: merge mirrors into unique title representations
    seen_titles: Dict[str, Dict[str, Any]] = {}
    for item in combined_candidates:
        clean_key = re.sub(r"\(.*?\)|\[.*?\]", "", item.get("title", "")).strip().lower()
        if not clean_key:
            clean_key = item.get("title", "").strip().lower()
            
        if clean_key not in seen_titles:
            seen_titles[clean_key] = item
        else:
            # Upgrade direct URL or magnet if previous candidate lacked it
            curr = seen_titles[clean_key]
            if not curr.get("direct_download_url") and item.get("direct_download_url"):
                curr["direct_download_url"] = item["direct_download_url"]
                curr["source"] = f"{curr.get('source')} + {item.get('source')}"
            if not curr.get("magnet_uri") and item.get("magnet_uri"):
                curr["magnet_uri"] = item["magnet_uri"]
            if (not curr.get("file_size_mb") or curr.get("file_size_mb") == 0) and item.get("file_size_mb"):
                curr["file_size_mb"] = item["file_size_mb"]

    deduped_candidates = list(seen_titles.values())
    
    # Enrich with metadata / box arts / trailer preview / Wikipedia synopses (top 6)
    enriched = []
    for idx, item in enumerate(deduped_candidates[:16]):
        meta = await scrape_game_metadata(item["title"], platform, fetch_remote_synopsis=(idx < 6))
        enriched.append({
            "id": f"{platform.lower()}-{uuid.uuid4().hex[:6]}",
            "title": item["title"],
            "platform": platform,
            "platform_name": platform,
            "genre": item.get("genre") or meta["genre"],
            "release_year": (
                int(item["year"]) if item.get("year") and str(item["year"]).isdigit()
                else (meta.get("release_year") or 1995)
            ),
            "rating": meta["rating"],
            "rating_count": meta["rating_count"],
            "description": item.get("description") or meta["description"],
            "box_art_2d": meta["box_art_2d"],
            "box_art_3d": meta["box_art_3d"],
            "backdrop": meta["backdrop"],
            "trailer_url": meta["trailer_url"],
            "screenshots": meta["screenshots"],
            "direct_download_url": item.get("direct_download_url"),
            "magnet_uri": item.get("magnet_uri"),
            "torrent_url": item.get("torrent_url"),
            "file_size_mb": item.get("file_size_mb", 0.0),
            "seeders": item.get("seeders"),
            "leechers": item.get("leechers"),
            "rom_format": item.get("rom_format") or f".{platform.lower()}",
            "source": item.get("source", "Preservation Archive")
        })
        
    return {"results": enriched}

@router.post("/import")
def import_game_to_vault(game: Dict[str, Any] = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    game_id = game.get("id") or f"{game.get('platform', 'SNES').lower()}-{uuid.uuid4().hex[:6]}"
    screenshots_json = json.dumps(game.get("screenshots", []))
    
    cursor.execute("""
    INSERT OR REPLACE INTO games (
        id, title, slug, platform, platform_name, genre, release_year,
        developer, publisher, rating, rating_count, description,
        box_art_2d, box_art_3d, backdrop, trailer_url, screenshots,
        direct_download_url, magnet_uri, file_size_mb, rom_format, is_featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        game_id,
        game.get("title", "Untitled Game"),
        game_id,
        game.get("platform", "SNES"),
        game.get("platform_name", game.get("platform", "SNES")),
        game.get("genre", "Retro"),
        game.get("release_year", 1995),
        game.get("developer", "Unknown"),
        game.get("publisher", "Unknown"),
        game.get("rating", 0.0) or 0.0,
        game.get("rating_count", 0) or 0,
        game.get("description", ""),
        game.get("box_art_2d", ""),
        game.get("box_art_3d", ""),
        game.get("backdrop", ""),
        game.get("trailer_url", ""),
        screenshots_json,
        game.get("direct_download_url", ""),
        game.get("magnet_uri", ""),
        game.get("file_size_mb", 0.0),
        game.get("rom_format", ""),
        0
    ))
    conn.commit()
    conn.close()
    return {"status": "success", "game_id": game_id}

@router.post("/populate-all")
async def trigger_full_library_scrape(payload: Dict[str, Any] = Body(default={})):
    # Archive.org scraping permanently disabled per user instruction
    return {"status": "disabled", "message": "Archive.org scraper is permanently disabled. OmniVault uses verified CDN mirrors and local ROM collections.", "indexed": {}}


@router.post("/scan-local-collection")
async def scan_local_collection():
    """
    Scans /Volumes/ROMS across all console folders (NES, SNES, N64, GB, GBC, GBA,
    NDS, 3DS, GameCube, Wii, Wii U, Switch, PSP, PS1, PS2, PS3, PS4, PSVita, Xbox, Xbox 360, etc.),
    scrapes full metadata (box art, genre, release year, description, video trailers),
    and imports them into vault.db so the entire collection is instantly playable across all emulators.
    """
    import os
    import re
    from pathlib import Path
    from ..scrapers.metadata_scraper import scrape_game_metadata

    from ..services.storage_service import get_roms_dir
    roms_dir = get_roms_dir()
    if not roms_dir.exists():
        raise HTTPException(status_code=404, detail=f"ROMs directory not found: {roms_dir}")

    valid_exts = {
        ".zip", ".7z", ".sfc", ".smc", ".nes", ".z64", ".n64", ".v64",
        ".gba", ".gb", ".gbc", ".nds", ".dsi", ".iso", ".chd", ".rvz", ".cso", ".gcm",
        ".pce", ".sms", ".gg", ".a26", ".a78", ".md", ".gen", ".bin", ".cue", ".pbp",
        ".3ds", ".cia", ".vpk", ".pkg", ".nsp", ".xci", ".wux", ".wud", ".rpx", ".xbe", ".xex"
    }

    conn = get_db_connection()
    cursor = conn.cursor()

    total_scanned = 0
    new_imported = 0
    platforms_found = set()

    for plat_folder in roms_dir.iterdir():
        if plat_folder.is_dir() and not plat_folder.name.startswith((".", "OmniVault", "Emulators", "SaveSnapshots", "Patches", "BIOS")):
            platform = plat_folder.name
            platforms_found.add(platform)

            for rom_file in plat_folder.iterdir():
                if rom_file.is_file() and rom_file.suffix.lower() in valid_exts and not rom_file.name.endswith(".part"):
                    if rom_file.suffix.lower() == ".bin" and rom_file.with_suffix(".cue").exists():
                        continue

                    total_scanned += 1
                    raw_stem = rom_file.stem
                    # Clean title: strip [!], (USA), (En,Fr), etc.
                    clean_title = re.sub(r"\[.*?\]|\(.*?\)", "", raw_stem).replace("_", " ").strip()
                    if not clean_title:
                        clean_title = raw_stem

                    game_id = f"local-{platform.lower()}-{raw_stem[:12].lower().replace(' ', '-')}"

                    # Check if already in games table
                    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
                    existing = cursor.fetchone()

                    if not existing:
                        meta = await scrape_game_metadata(clean_title, platform, fetch_remote_synopsis=(new_imported < 10))
                        size_mb = round(rom_file.stat().st_size / (1024 * 1024), 2)
                        screenshots_json = json.dumps(meta.get("screenshots", []))

                        cursor.execute("""
                        INSERT OR REPLACE INTO games (
                            id, title, slug, platform, platform_name, genre, release_year,
                            developer, publisher, rating, rating_count, description,
                            box_art_2d, box_art_3d, backdrop, trailer_url, screenshots,
                            direct_download_url, magnet_uri, file_size_mb, rom_format, is_featured
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            game_id, clean_title, raw_stem.lower().replace(" ", "-"),
                            platform, platform, meta.get("genre", "Classic"),
                            meta.get("release_year") or None, meta.get("developer"), meta.get("publisher"),
                            0.0, 0, meta.get("description", f"Local ROM of {clean_title} ready for immediate emulation."),
                            meta.get("box_art_2d", ""), meta.get("box_art_3d", ""),
                            meta.get("backdrop", ""), meta.get("trailer_url", ""),
                            screenshots_json, f"file://{rom_file}", "", size_mb, rom_file.suffix, 0
                        ))

                        # Also register in downloads as completed
                        cursor.execute("""
                        INSERT OR REPLACE INTO downloads (
                            id, game_id, game_title, platform, status, progress, speed,
                            filename, destination_path, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'completed', 100, '', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """, (
                            f"dl-{game_id}", game_id, clean_title, platform,
                            rom_file.name, str(rom_file)
                        ))

                        new_imported += 1

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "total_scanned": total_scanned,
        "new_imported": new_imported,
        "platforms_scanned": list(platforms_found),
        "message": f"Scanned {total_scanned} ROM files across {len(platforms_found)} platforms. Imported and scraped {new_imported} games into OmniVault."
    }

