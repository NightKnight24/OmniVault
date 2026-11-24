import math
import os
import re
import urllib.parse
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, List, Dict, Any
from ..database import ensure_games_extended_columns, get_db_connection, row_to_game_dict
from ..scrapers.providers.manager import get_all_providers
from ..services.mirror_resolver import mirror_resolver, list_mirror_sources
from ..services.realdebrid_service import get_supported_hoster_domains, is_realdebrid_active
from ..services.thegamesdb_service import (
    TGDB_PLATFORM_DISPLAY_NAMES,
    enrich_game_by_id,
    is_thegamesdb_active,
    lookup_game_thegamesdb,
)
from ..services.video_service import resolve_game_videos

CONSOLE_FAMILIES = {
    "playstation": {
        "id": "playstation",
        "name": "PlayStation",
        "badge": "SONY",
        "platforms": ["PS5", "PS4", "PS3", "PS2", "PS1", "PSP", "PSVita"],
    },
    "nintendo_home": {
        "id": "nintendo_home",
        "name": "Nintendo Home",
        "badge": "NIN-HOME",
        "platforms": ["Switch2", "Switch", "WiiU", "Wii", "GameCube", "N64", "SNES", "NES", "FDS"],
    },
    "nintendo_handheld": {
        "id": "nintendo_handheld",
        "name": "Nintendo Handheld",
        "badge": "NIN-PORTABLE",
        "platforms": ["3DS", "NDS", "GBA", "GBC", "GB", "VirtualBoy", "GameAndWatch", "PokemonMini"],
    },
    "xbox": {
        "id": "xbox",
        "name": "Xbox",
        "badge": "MS",
        "platforms": ["XboxSeriesX", "XboxOne", "Xbox360", "Xbox"],
    },
    "pc_desktop": {
        "id": "pc_desktop",
        "name": "PC & Mac",
        "badge": "PC / MAC",
        "platforms": ["Windows", "macOS"],
    },
    "sega": {
        "id": "sega",
        "name": "Sega",
        "badge": "SEGA",
        "platforms": ["Dreamcast", "Saturn", "SegaCD", "Sega32X", "Genesis", "MasterSystem", "GameGear", "SG1000", "SegaPico"],
    },
    "arcade_retro": {
        "id": "arcade_retro",
        "name": "Arcade & Retro",
        "badge": "RETRO",
        "platforms": [
            "Arcade", "NeoGeo", "NeoGeoCD", "NGP", "NGPC",
            "TG16", "TGCD", "PCFX", "3DO",
            "Jaguar", "JaguarCD", "Lynx",
            "Atari2600", "Atari5200", "Atari7800",
            "ColecoVision", "Intellivision", "Vectrex", "CDi",
            "WonderSwan", "WonderSwanColor", "Playdate", "Evercade",
        ],
    },
    "computers_mobile": {
        "id": "computers_mobile",
        "name": "Computers & Mobile",
        "badge": "COMP / MOB",
        "platforms": [
            "C64", "Amiga", "AmigaCD32", "ZXSpectrum", "AmstradCPC",
            "MSX", "AtariST", "Atari800", "AppleII", "PC98", "PC88",
            "X68000", "FMTowns", "Android", "iOS", "OculusQuest",
        ],
    },
}

_STATIC_ASSIGNED_PLATFORMS = {
    p.lower()
    for fam_id, fam in CONSOLE_FAMILIES.items()
    if fam_id != "computers_mobile"
    for p in fam["platforms"]
}


def _resolve_family_platforms(cursor, fam_id: str) -> List[str]:
    fid = (fam_id or "").strip().lower()
    if fid not in CONSOLE_FAMILIES:
        return []
    if fid != "computers_mobile":
        return list(CONSOLE_FAMILIES[fid]["platforms"])
    base = list(CONSOLE_FAMILIES["computers_mobile"]["platforms"])
    seen = {p.lower() for p in base}
    cursor.execute("SELECT DISTINCT platform FROM games")
    for (plat,) in cursor.fetchall():
        if plat and plat.lower() not in _STATIC_ASSIGNED_PLATFORMS and plat.lower() not in seen:
            base.append(plat)
            seen.add(plat.lower())
    return base


router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("/meta/families")
def get_console_families():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT platform, COUNT(*) as game_count
    FROM games
    GROUP BY platform
    """)
    plat_counts = {r["platform"]: r["game_count"] for r in cursor.fetchall()}

    families_out = []
    for fam_id, fam in CONSOLE_FAMILIES.items():
        fam_plats = _resolve_family_platforms(cursor, fam_id)
        total_games = sum(plat_counts.get(p, 0) for p in fam_plats)
        families_out.append({
            "id": fam_id,
            "name": fam["name"],
            "badge": fam["badge"],
            "platforms": fam_plats,
            "total_games": total_games,
        })
    conn.close()
    return families_out


@router.get("/meta/platforms")
def get_platforms():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT platform, MAX(platform_name) as platform_name, COUNT(*) as game_count
    FROM games
    GROUP BY platform
    ORDER BY game_count DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    plat_to_fam = {}
    for fam_id, fam in CONSOLE_FAMILIES.items():
        for p in fam["platforms"]:
            plat_to_fam[p.lower()] = fam_id

    out = []
    for r in rows:
        code = r["platform"]
        if not code:
            continue
        fam_id = plat_to_fam.get(code.lower(), "computers_mobile")
        out.append({
            "platform": code,
            "platform_name": TGDB_PLATFORM_DISPLAY_NAMES.get(code) or r["platform_name"] or code,
            "game_count": r["game_count"],
            "family": fam_id,
        })
    return out


def _build_scope_where(cursor, platform: Optional[str], family: Optional[str], alias: str = "") -> tuple:
    prefix = f"{alias}." if alias else ""
    if platform and isinstance(platform, str) and platform.upper() != "ALL":
        return f" AND LOWER({prefix}platform) = LOWER(?)", [platform.strip()]
    if family and isinstance(family, str) and family.lower() in CONSOLE_FAMILIES:
        fam_plats = _resolve_family_platforms(cursor, family.lower())
        if fam_plats:
            placeholders = ",".join(["?"] * len(fam_plats))
            return f" AND {prefix}platform IN ({placeholders})", fam_plats
    return "", []


@router.get("/meta/genres")
def get_genres(platform: Optional[str] = Query(None), family: Optional[str] = Query(None)):
    ensure_games_extended_columns()
    conn = get_db_connection()
    cursor = conn.cursor()
    scope_sql, scope_params = _build_scope_where(cursor, platform, family)
    cursor.execute(
        f"""
        SELECT genre, genres_list, COUNT(*) as cnt
        FROM games
        WHERE 1=1 {scope_sql}
        GROUP BY genre, genres_list
        """,
        scope_params,
    )
    counts: Dict[str, int] = {}
    for row in cursor.fetchall():
        c = int(row["cnt"] or 0)
        glist = str(row["genres_list"] or "").strip()
        if glist:
            tags = {t.strip() for t in glist.split("|") if t.strip()}
        elif row["genre"]:
            tags = {str(row["genre"]).strip()}
        else:
            tags = set()
        for t in tags:
            if t and t != "Uncategorized":
                counts[t] = counts.get(t, 0) + c
    conn.close()
    sorted_genres = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"name": name, "count": cnt} for name, cnt in sorted_genres if cnt > 0]


@router.get("/meta/filters")
def get_catalog_filters(platform: Optional[str] = Query(None), family: Optional[str] = Query(None)):
    """Returns rich TheGamesDB metadata filter facets (developers, publishers, ESRB ratings, decades, multiplayer)."""
    ensure_games_extended_columns()
    conn = get_db_connection()
    cursor = conn.cursor()
    scope_sql, scope_params = _build_scope_where(cursor, platform, family)

    cursor.execute(
        f"""
        SELECT developer, COUNT(*) as cnt
        FROM games
        WHERE developer IS NOT NULL AND TRIM(developer) != '' AND developer != 'Unknown' {scope_sql}
        GROUP BY developer
        ORDER BY cnt DESC, developer ASC
        LIMIT 120
        """,
        scope_params,
    )
    developers = [{"name": r["developer"], "count": r["cnt"]} for r in cursor.fetchall()]

    cursor.execute(
        f"""
        SELECT publisher, COUNT(*) as cnt
        FROM games
        WHERE publisher IS NOT NULL AND TRIM(publisher) != '' AND publisher != 'Unknown' {scope_sql}
        GROUP BY publisher
        ORDER BY cnt DESC, publisher ASC
        LIMIT 120
        """,
        scope_params,
    )
    publishers = [{"name": r["publisher"], "count": r["cnt"]} for r in cursor.fetchall()]

    cursor.execute(
        f"""
        SELECT esrb_rating, COUNT(*) as cnt
        FROM games
        WHERE esrb_rating IS NOT NULL AND TRIM(esrb_rating) != '' {scope_sql}
        GROUP BY esrb_rating
        ORDER BY cnt DESC
        """,
        scope_params,
    )
    esrb_ratings = [{"name": r["esrb_rating"], "count": r["cnt"]} for r in cursor.fetchall()]

    cursor.execute(
        f"""
        SELECT (release_year / 10) * 10 as decade, COUNT(*) as cnt
        FROM games
        WHERE release_year IS NOT NULL AND release_year >= 1970 AND release_year <= 2035 {scope_sql}
        GROUP BY decade
        ORDER BY decade DESC
        """,
        scope_params,
    )
    decades = [{"decade": int(r["decade"]), "label": f"{int(r['decade'])}s", "count": r["cnt"]} for r in cursor.fetchall() if r["decade"]]

    cursor.execute(
        f"SELECT COUNT(*) FROM games WHERE coop = 'Yes' {scope_sql}",
        scope_params,
    )
    coop_count = int(cursor.fetchone()[0] or 0)

    conn.close()
    return {
        "developers": developers,
        "publishers": publishers,
        "esrb_ratings": esrb_ratings,
        "decades": decades,
        "coop_count": coop_count,
    }


def _append_game_filters(
    cursor,
    platform: Optional[str],
    family: Optional[str],
    genre: Optional[str],
    developer: Optional[str],
    publisher: Optional[str],
    esrb: Optional[str],
    players: Optional[str],
    coop: Optional[bool],
    decade: Optional[int],
    year: Optional[int],
    search: Optional[str],
    featured_only: Optional[bool],
    favorites_only: Optional[bool],
) -> tuple:
    clauses: List[str] = []
    params: List[Any] = []

    scope_sql, scope_params = _build_scope_where(cursor, platform, family, alias="g")
    if scope_sql:
        clauses.append(scope_sql[5:])
        params.extend(scope_params)

    if genre and isinstance(genre, str) and genre.upper() != "ALL":
        g_clean = genre.strip()
        if g_clean.lower() == "survival horror":
            clauses.append("(g.genre IN ('Survival Horror', 'Horror') OR g.genres_list LIKE '%|Horror|%' OR g.genres_list LIKE '%|Survival Horror|%')")
        else:
            clauses.append("(LOWER(g.genre) = LOWER(?) OR LOWER(g.genres_list) LIKE LOWER(?))")
            params.extend([g_clean, f"%|{g_clean}|%"])

    if developer and isinstance(developer, str) and developer.upper() != "ALL":
        d_clean = developer.strip()
        clauses.append("(LOWER(g.developer) = LOWER(?) OR LOWER(g.developer) LIKE LOWER(?))")
        params.extend([d_clean, f"%{d_clean}%"])

    if publisher and isinstance(publisher, str) and publisher.upper() != "ALL":
        p_clean = publisher.strip()
        clauses.append("(LOWER(g.publisher) = LOWER(?) OR LOWER(g.publisher) LIKE LOWER(?))")
        params.extend([p_clean, f"%{p_clean}%"])

    if esrb and isinstance(esrb, str) and esrb.upper() != "ALL":
        clauses.append("LOWER(g.esrb_rating) = LOWER(?)")
        params.append(esrb.strip())

    if players and isinstance(players, str) and players.upper() != "ALL":
        pl = players.strip().lower()
        if pl == "1":
            clauses.append("g.players = 1")
        elif pl in ("2+", "multiplayer"):
            clauses.append("g.players >= 2")
        elif pl == "4+":
            clauses.append("g.players >= 4")
        elif pl == "coop":
            clauses.append("g.coop = 'Yes'")

    if isinstance(coop, bool) and coop:
        clauses.append("g.coop = 'Yes'")

    if isinstance(decade, int) and decade >= 1970:
        clauses.append("g.release_year >= ? AND g.release_year <= ?")
        params.extend([decade, decade + 9])

    if isinstance(year, int) and year >= 1970:
        clauses.append("g.release_year = ?")
        params.append(year)

    if search and isinstance(search, str) and search.strip():
        q = search.strip()
        like_q = f"%{q}%"
        clauses.append(
            "(g.title LIKE ? OR g.alternates LIKE ? OR g.developer LIKE ? OR g.publisher LIKE ? OR g.description LIKE ?)"
        )
        params.extend([like_q, like_q, like_q, like_q, like_q])

    if isinstance(featured_only, bool) and featured_only:
        clauses.append("g.is_featured = 1")

    if isinstance(favorites_only, bool) and favorites_only:
        clauses.append("f.game_id IS NOT NULL")

    if not clauses:
        return "", []
    return " AND " + " AND ".join(clauses), params


@router.get("")
def list_games(
    platform: Optional[str] = None,
    family: Optional[str] = None,
    genre: Optional[str] = None,
    developer: Optional[str] = None,
    publisher: Optional[str] = None,
    esrb: Optional[str] = None,
    players: Optional[str] = None,
    coop: Optional[bool] = False,
    decade: Optional[int] = None,
    year: Optional[int] = None,
    search: Optional[str] = None,
    sort: Optional[str] = "rating_desc",
    featured_only: Optional[bool] = False,
    favorites_only: Optional[bool] = False,
    page: int = 1,
    page_size: int = 24,
):
    ensure_games_extended_columns()
    conn = get_db_connection()
    cursor = conn.cursor()

    where_sql, filter_params = _append_game_filters(
        cursor=cursor,
        platform=platform,
        family=family,
        genre=genre,
        developer=developer,
        publisher=publisher,
        esrb=esrb,
        players=players,
        coop=coop,
        decade=decade,
        year=year,
        search=search,
        featured_only=featured_only,
        favorites_only=favorites_only,
    )

    query = f"""
    SELECT g.*,
           CASE WHEN f.game_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
           ur.rating as user_rating
    FROM games g
    LEFT JOIN favorites f ON g.id = f.game_id
    LEFT JOIN user_ratings ur ON g.id = ur.game_id
    WHERE 1=1{where_sql}
    """
    params = list(filter_params)

    order_prefix = ""
    if search and isinstance(search, str) and search.strip():
        sq = search.strip()
        order_prefix = "CASE WHEN LOWER(g.title) = LOWER(?) THEN 0 WHEN LOWER(g.title) LIKE LOWER(?) THEN 1 ELSE 2 END ASC, "
        params.extend([sq, f"{sq}%"])

    if sort == "rating_desc":
        order_clause = "g.rating DESC, g.rating_count DESC, g.title ASC"
    elif sort == "popularity_desc":
        order_clause = "g.rating_count DESC, g.rating DESC, g.title ASC"
    elif sort == "title_asc":
        order_clause = "g.title ASC"
    elif sort == "title_desc":
        order_clause = "g.title DESC"
    elif sort == "developer_asc":
        order_clause = "CASE WHEN g.developer IS NULL OR g.developer = '' THEN 1 ELSE 0 END ASC, g.developer ASC, g.title ASC"
    elif sort == "size_desc":
        order_clause = "g.file_size_mb DESC, g.title ASC"
    elif sort == "size_asc":
        order_clause = "g.file_size_mb ASC, g.title ASC"
    elif sort == "year_desc":
        order_clause = "CASE WHEN g.release_year IS NULL OR g.release_year = 0 THEN 1 ELSE 0 END ASC, g.release_year DESC, g.title ASC"
    elif sort == "year_asc":
        order_clause = "CASE WHEN g.release_year IS NULL OR g.release_year = 0 THEN 1 ELSE 0 END ASC, g.release_year ASC, g.title ASC"
    else:
        order_clause = "g.id ASC"

    safe_page = max(1, int(page or 1))
    safe_size = max(1, min(120, int(page_size or 24)))
    offset = (safe_page - 1) * safe_size
    query += f" ORDER BY {order_prefix}{order_clause} LIMIT ? OFFSET ?"
    params.extend([safe_size, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    games = [row_to_game_dict(r) for r in rows]

    count_query = f"""
    SELECT COUNT(*)
    FROM games g
    LEFT JOIN favorites f ON g.id = f.game_id
    WHERE 1=1{where_sql}
    """
    cursor.execute(count_query, filter_params)
    total_count = cursor.fetchone()[0]
    total_pages = max(1, math.ceil(total_count / safe_size))

    conn.close()
    return {
        "total": total_count,
        "page": safe_page,
        "page_size": safe_size,
        "total_pages": total_pages,
        "games": games,
    }

@router.get("/meta/favorites-count")
def get_favorites_count():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM favorites")
    count = cursor.fetchone()[0]
    conn.close()
    return {"favorites_count": count}

@router.post("/{game_id}/favorite")
def toggle_favorite(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM favorites WHERE game_id = ?", (game_id,))
    exists = cursor.fetchone()
    if exists:
        cursor.execute("DELETE FROM favorites WHERE game_id = ?", (game_id,))
        is_fav = False
    else:
        cursor.execute("INSERT OR REPLACE INTO favorites (game_id) VALUES (?)", (game_id,))
        is_fav = True
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM favorites")
    total_favs = cursor.fetchone()[0]
    conn.close()
    return {"game_id": game_id, "is_favorite": is_fav, "total_favorites": total_favs}

@router.get("/{game_id}")
async def get_game(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT g.*, 
           CASE WHEN f.game_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
           ur.rating as user_rating,
           ur.review as user_review
    FROM games g
    LEFT JOIN favorites f ON g.id = f.game_id
    LEFT JOIN user_ratings ur ON g.id = ur.game_id
    WHERE g.id = ?
    """, (game_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Game not found")

    game_dict = row_to_game_dict(row)
    desc = game_dict.get("description") or ""
    dev = game_dict.get("developer") or ""
    pub = game_dict.get("publisher") or ""
    placeholder_devs = {"Classic Studio", "Classic Publisher", "Original Developer", "Original Publisher", "", None}
    is_generic_desc = (
        not desc
        or "is an acclaimed classic" in desc
        or "Classic preservation release of" in desc
        or "preserved release with verified checksums" in desc
        or "Verified preservation ROM archive" in desc
        or "1G1R" in desc
        or "preservation archive" in desc
        or "preservation ROM" in desc
        or "Official verified" in desc
        or "Official 1G1R" in desc
        or "Authentic 1G1R" in desc
        or "NV2A" in desc
        or len(desc.strip()) < 85
    )

    updated_fields = False
    if is_generic_desc and is_thegamesdb_active():
        try:
            tgdb = await lookup_game_thegamesdb(
                game_dict.get("title", ""),
                game_dict.get("platform"),
            )
            if tgdb:
                if tgdb.get("description"):
                    game_dict["description"] = tgdb["description"]
                    is_generic_desc = False
                    updated_fields = True
                if tgdb.get("release_year") and (game_dict.get("release_year") is None or updated_fields):
                    game_dict["release_year"] = tgdb["release_year"]
                    updated_fields = True
                old_box = game_dict.get("box_art_2d") or ""
                if tgdb.get("box_art_2d") and (not old_box or "libretro-thumbnails" in old_box):
                    game_dict["box_art_2d"] = tgdb["box_art_2d"]
                    game_dict["box_art_3d"] = game_dict.get("box_art_3d") or tgdb["box_art_2d"]
                    game_dict["backdrop"] = game_dict.get("backdrop") or tgdb["box_art_2d"]
                    updated_fields = True
                old_trailer = game_dict.get("trailer_url") or ""
                if tgdb.get("trailer_url") and (not old_trailer or "listType=search" in old_trailer):
                    game_dict["trailer_url"] = tgdb["trailer_url"]
                    updated_fields = True
        except Exception:
            pass

    if (
        is_generic_desc
        or dev in placeholder_devs
        or pub in placeholder_devs
    ):
        from ..scrapers.metadata_scraper import fetch_wikipedia_game_synopsis_sync
        wiki = fetch_wikipedia_game_synopsis_sync(
            game_dict.get("title", ""),
            game_dict.get("platform_name") or game_dict.get("platform", "")
        )
        if wiki:
            if wiki.get("description") and is_generic_desc:
                game_dict["description"] = wiki["description"]
                updated_fields = True
            if wiki.get("release_year") and (game_dict.get("release_year") is None or is_generic_desc):
                game_dict["release_year"] = wiki["release_year"]
                updated_fields = True
            if wiki.get("developer") and (dev in placeholder_devs or not dev):
                game_dict["developer"] = wiki["developer"]
                updated_fields = True
            elif dev in placeholder_devs:
                game_dict["developer"] = None
            if wiki.get("publisher") and (pub in placeholder_devs or not pub):
                game_dict["publisher"] = wiki["publisher"]
                updated_fields = True
            elif pub in placeholder_devs:
                game_dict["publisher"] = None
        else:
            if dev in placeholder_devs:
                game_dict["developer"] = None
            if pub in placeholder_devs:
                game_dict["publisher"] = None

    if updated_fields:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE games
            SET description = ?, release_year = ?, developer = ?, publisher = ?,
                box_art_2d = ?, box_art_3d = ?, backdrop = ?, trailer_url = ?
            WHERE id = ?
            """,
            (
                game_dict.get("description"),
                game_dict.get("release_year"),
                game_dict.get("developer"),
                game_dict.get("publisher"),
                game_dict.get("box_art_2d"),
                game_dict.get("box_art_3d"),
                game_dict.get("backdrop"),
                game_dict.get("trailer_url"),
                game_id,
            ),
        )
        conn.commit()
        conn.close()

    plat_raw = game_dict.get("platform", "")
    plat_up = plat_raw.strip().upper()

    helpers: List[Dict[str, Any]] = []
    seen_ids = set()
    has_archive_org = False

    for src in list_mirror_sources(enabled_only=True):
        plats = [str(p).strip().upper() for p in (src.get("platforms") or [])]
        if plats and "ALL" not in plats and "ALL SYSTEMS" not in plats and plat_up not in plats:
            continue
        src_id = src["id"]
        adapter = (src.get("adapter") or "html_search").strip()
        if adapter == "archive_org" or src_id == "archive-org":
            has_archive_org = True
        if src_id in seen_ids:
            continue
        seen_ids.add(src_id)
        helpers.append({
            "source_id": src_id,
            "name": src["name"],
            "adapter": adapter,
            "can_scrape": adapter != "directory_link",
            "supports_direct_download": bool(src.get("supports_direct_download")),
            "url": src.get("url", ""),
            "description": src.get("description") or src.get("source_type") or "User-configured BYOS source",
        })

    if not has_archive_org:
        helpers.append({
            "source_id": "archive-org",
            "name": "Internet Archive (Archive.org)",
            "adapter": "archive_org",
            "can_scrape": True,
            "supports_direct_download": True,
            "url": "https://archive.org",
            "description": "Public archival collections on Archive.org",
        })

    try:
        for prov in get_all_providers():
            if not prov.get("is_enabled"):
                continue
            pid = prov["id"]
            if pid in seen_ids:
                continue
            if prov.get("type") in ("torznab", "torrent", "json_torrent_api", "rss_torrent_feed"):
                seen_ids.add(pid)
                helpers.append({
                    "source_id": pid,
                    "name": prov["name"],
                    "adapter": prov["type"],
                    "can_scrape": True,
                    "supports_direct_download": False,
                    "url": prov.get("endpoint_url") or "",
                    "description": f"In-app P2P / {prov.get('type')} indexer",
                })
    except Exception as pe:
        print(f"[Helpers provider list note]: {pe}")

    game_dict["web_search_helpers"] = helpers

    return game_dict


@router.post("/{game_id}/enrich-tgdb")
async def enrich_game_thegamesdb(game_id: str):
    """On-demand metadata and cover enrichment via TheGamesDB."""
    result = await enrich_game_by_id(game_id)
    if result.get("status") == "error" and result.get("message") == "Game not found":
        raise HTTPException(status_code=404, detail="Game not found")
    return result

@router.post("/{game_id}/set-source")
def set_game_source(game_id: str, payload: Dict[str, Any] = Body(...)):
    """Allows user to manually attach a verified direct download URL or magnet link to a game."""
    direct_url = payload.get("direct_download_url", "").strip()
    magnet_uri = payload.get("magnet_uri", "").strip()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE games 
    SET direct_download_url = ?, magnet_uri = ?
    WHERE id = ?
    """, (direct_url or None, magnet_uri or None, game_id))
    conn.commit()
    conn.close()
    return {"status": "updated", "game_id": game_id, "direct_download_url": direct_url or None, "magnet_uri": magnet_uri or None}

@router.post("/{game_id}/rate")
def rate_game(game_id: str, payload: Dict[str, Any] = Body(...)):
    rating = payload.get("rating")
    review = payload.get("review", "")
    if rating is None:
        raise HTTPException(status_code=400, detail="Rating is required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail=f"Game '{game_id}' not found")

    cursor.execute("""
    INSERT OR REPLACE INTO user_ratings (game_id, rating, review, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (game_id, float(rating), review.strip()))
    
    # Recalculate true user rating stats for this game
    cursor.execute("SELECT AVG(rating), COUNT(*) FROM user_ratings WHERE game_id = ?", (game_id,))
    avg_row = cursor.fetchone()
    avg_rating = round(float(avg_row[0]), 2) if avg_row and avg_row[0] is not None else 0.0
    cnt_rating = int(avg_row[1]) if avg_row else 0
    cursor.execute("UPDATE games SET rating = ?, rating_count = ? WHERE id = ?", (avg_rating, cnt_rating, game_id))
    conn.commit()
    conn.close()
    return {"status": "success", "game_id": game_id, "user_rating": float(rating), "user_review": review, "avg_rating": avg_rating, "rating_count": cnt_rating}

def init_reviews_table():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        author TEXT NOT NULL,
        avatar TEXT,
        rating REAL NOT NULL,
        review_text TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verified_player BOOLEAN DEFAULT 1
    )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_reviews_game_id ON reviews(game_id)")
    conn.commit()
    conn.close()

init_reviews_table()

@router.get("/{game_id}/reviews")
def get_game_reviews(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    game = cursor.fetchone()
    if not game:
        conn.close()
        raise HTTPException(status_code=404, detail="Game not found")

    # Fetch user's personal review if exists
    cursor.execute("SELECT rating, review, updated_at FROM user_ratings WHERE game_id = ?", (game_id,))
    user_row = cursor.fetchone()
    user_review = None
    if user_row and (user_row["review"] or user_row["rating"]):
        user_review = {
            "author": "You",
            "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=localuser",
            "rating": float(user_row["rating"]) if user_row["rating"] else 5.0,
            "review_text": user_row["review"] or "Rated in OmniVault",
            "created_at": user_row["updated_at"],
            "likes": 1,
            "verified_player": True,
            "is_user": True
        }

    # Fetch user reviews
    cursor.execute("SELECT * FROM reviews WHERE game_id = ? ORDER BY created_at DESC", (game_id,))
    review_rows = cursor.fetchall()
    conn.close()

    reviews_list = []
    for r in review_rows:
        reviews_list.append({
            "id": r["id"],
            "author": r["author"],
            "avatar": r["avatar"] or f"https://api.dicebear.com/7.x/bottts/svg?seed={r['author']}",
            "rating": float(r["rating"]),
            "review_text": r["review_text"],
            "likes": int(r["likes"] or 0),
            "created_at": r["created_at"],
            "verified_player": bool(r["verified_player"]),
            "is_user": False
        })

    all_reviews = []
    if user_review:
        all_reviews.append(user_review)
    all_reviews.extend(reviews_list)

    avg_rating = float(game["rating"]) if game["rating"] else 4.8
    total_count = len(all_reviews)

    return {
        "game_id": game_id,
        "average_rating": avg_rating,
        "total_reviews": total_count,
        "user_review": user_review,
        "reviews": all_reviews
    }

@router.post("/{game_id}/reviews")
def post_game_review(game_id: str, payload: Dict[str, Any] = Body(...)):
    rating = payload.get("rating")
    review_text = payload.get("review_text") or payload.get("review", "")
    author = payload.get("author", "Local Player").strip() or "Local Player"
    
    if rating is None:
        raise HTTPException(status_code=400, detail="Rating is required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail=f"Game '{game_id}' not found")

    avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={author}"
    
    # Insert new review
    cursor.execute("""
    INSERT INTO reviews (game_id, author, avatar, rating, review_text, likes, verified_player)
    VALUES (?, ?, ?, ?, ?, 1, 1)
    """, (game_id, author, avatar, float(rating), review_text.strip()))
    
    # Sync personal user_ratings table
    cursor.execute("""
    INSERT OR REPLACE INTO user_ratings (game_id, rating, review, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (game_id, float(rating), review_text.strip()))
    
    # Recalculate true rating stats
    cursor.execute("SELECT AVG(rating), COUNT(*) FROM reviews WHERE game_id = ?", (game_id,))
    avg_row = cursor.fetchone()
    avg_rating = round(float(avg_row[0]), 2) if avg_row and avg_row[0] is not None else float(rating)
    cnt_rating = int(avg_row[1]) if avg_row else 1
    cursor.execute("UPDATE games SET rating = ?, rating_count = ? WHERE id = ?", (avg_rating, cnt_rating, game_id))
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "game_id": game_id,
        "review": {
            "author": author,
            "avatar": avatar,
            "rating": float(rating),
            "review_text": review_text.strip(),
            "likes": 1,
            "verified_player": True
        },
        "avg_rating": avg_rating,
        "rating_count": cnt_rating
    }

@router.get("/{game_id}/videos")
async def get_game_videos(game_id: str):
    """Resolves and caches inline YouTube trailer & gameplay videos for any catalog entry."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, title, platform, platform_name, trailer_url FROM games WHERE id = ?",
        (game_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Game not found")

    videos = await resolve_game_videos(
        game_id=row["id"],
        title=row["title"],
        platform=row["platform"],
        platform_name=row["platform_name"] or row["platform"],
        existing_trailer_url=row["trailer_url"],
    )
    return {
        "game_id": row["id"],
        "title": row["title"],
        "platform": row["platform"],
        **videos,
    }


@router.get("/{game_id}/mirrors")
@router.get("/{game_id}/streams")
async def get_game_mirrors(game_id: str, source_id: Optional[str] = Query(None)):
    """
    ROM Mirror & Torrent Resolution:
    Aggregates verified live mirrors from user-configured BYOS sources and indexers on-demand for any game,
    or scrapes a single specified source_id directly inside OmniVault.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, platform, direct_download_url, magnet_uri, file_size_mb, rom_format
        FROM games WHERE id = ?
    """, (game_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Game not found")

    title = row["title"]
    platform = row["platform"]
    mirrors = await mirror_resolver.get_rom_mirrors(title, platform, source_id=source_id)

    # If the first mirror has a verified non-zero file size, update the game's file_size_mb
    if mirrors and mirrors[0].get("file_size_mb", 0) > 0:
        real_sz = float(mirrors[0]["file_size_mb"])
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE games SET file_size_mb = ? WHERE id = ?", (real_sz, game_id))
        conn.commit()
        conn.close()

    # If the catalog has a direct URL not already in mirrors, include as fallback
    cat_url = row["direct_download_url"]
    if cat_url and not source_id:
        if not any(s.get("direct_url") == cat_url for s in mirrors):
            mirrors.append({
                "id": f"mirror-{len(mirrors)+1}",
                "title": f"{title} (Catalog Direct)",
                "platform": platform,
                "filename": f"{title}.{row['rom_format'] or 'zip'}",
                "format": str(row["rom_format"] or "ROM").upper(),
                "direct_url": cat_url,
                "source_id": "catalog",
                "source_name": "💾 Local Preservation Archive",
                "quality": "Direct Download",
                "file_size_mb": float(row["file_size_mb"] or 0.0),
                "is_direct": True,
                "page_url": None,
                "badge": "💾 DIRECT",
                "badge_color": "slate",
                "rank": len(mirrors) + 1
            })

    rd_active = is_realdebrid_active()
    rd_unlocked = sum(1 for m in mirrors if m.get("is_realdebrid"))
    return {
        "game_id": game_id,
        "title": title,
        "platform": platform,
        "total_mirrors": len(mirrors),
        "mirrors": mirrors,
        "total_streams": len(mirrors),
        "streams": mirrors,
        "realdebrid_active": rd_active,
        "realdebrid_unlocked_count": rd_unlocked,
        "supported_hosts_count": len(get_supported_hoster_domains()),
    }
