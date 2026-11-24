import asyncio
import html
import os
import re
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from ..database import get_db_connection, row_to_game_dict
from .video_service import extract_youtube_id

TGDB_API_BASE = "https://api.thegamesdb.net/v1"
TGDB_STATIC_DUMP_URL = "https://cdn.thegamesdb.net/json/database-latest.json"
DEFAULT_THEGAMESDB_PUBLIC_KEY = "5a0d37004fc14802a8913a12dae883b753f2bc6bc3b18685733fa3df4c07d5c0"

# Verified against TheGamesDB /v1/Platforms
TGDB_PLATFORM_MAP: Dict[str, int] = {
    "NES": 7,
    "SNES": 6,
    "N64": 3,
    "GameCube": 2,
    "Wii": 9,
    "WiiU": 38,
    "Switch": 4971,
    "Switch2": 5021,
    "GB": 4,
    "GBC": 41,
    "GBA": 5,
    "NDS": 8,
    "3DS": 4912,
    "PS1": 10,
    "PS2": 11,
    "PS3": 12,
    "PS4": 4919,
    "PS5": 4980,
    "PSP": 13,
    "PSVita": 39,
    "Xbox": 14,
    "Xbox360": 15,
    "Windows": 1,
    "macOS": 37,
    "Genesis": 18,
    "SegaCD": 21,
    "Saturn": 17,
    "Dreamcast": 16,
    "MasterSystem": 35,
    "GameGear": 20,
    "Arcade": 23,
    "NeoGeo": 24,
    "TG16": 34,
    "Atari2600": 22,
    "Atari5200": 26,
    "Atari7800": 27,
    "C64": 40,
    "WonderSwan": 4925,
    "WonderSwanColor": 4926,
}

TGDB_ID_TO_PLATFORM: Dict[int, str] = {pid: plat for plat, pid in TGDB_PLATFORM_MAP.items()}

MODERN_TGDB_FIRST_PLATFORMS = {
    "Switch2",
    "Switch",
    "PS5",
    "PS4",
    "PS3",
    "PSVita",
    "3DS",
    "WiiU",
    "Xbox360",
    "Xbox",
    "Windows",
    "macOS",
}

TGDB_PLATFORM_DISPLAY_NAMES: Dict[str, str] = {
    "NES": "Nintendo Entertainment System",
    "SNES": "Super Nintendo",
    "N64": "Nintendo 64",
    "GameCube": "Nintendo GameCube",
    "Wii": "Nintendo Wii",
    "WiiU": "Nintendo Wii U",
    "Switch": "Nintendo Switch",
    "Switch2": "Nintendo Switch 2",
    "GB": "Game Boy",
    "GBC": "Game Boy Color",
    "GBA": "Game Boy Advance",
    "NDS": "Nintendo DS",
    "3DS": "Nintendo 3DS",
    "PS1": "PlayStation",
    "PS2": "PlayStation 2",
    "PS3": "PlayStation 3",
    "PS4": "PlayStation 4",
    "PS5": "PlayStation 5",
    "PSP": "PlayStation Portable",
    "PSVita": "PlayStation Vita",
    "Xbox": "Microsoft Xbox",
    "Xbox360": "Xbox 360",
    "Windows": "Windows (PC)",
    "macOS": "macOS",
    "Genesis": "Sega Genesis",
    "SegaCD": "Sega CD",
    "Saturn": "Sega Saturn",
    "Dreamcast": "Sega Dreamcast",
    "MasterSystem": "Sega Master System",
    "GameGear": "Sega Game Gear",
    "Arcade": "Arcade",
    "NeoGeo": "Neo Geo",
    "TG16": "TurboGrafx-16",
    "Atari2600": "Atari 2600",
    "Atari5200": "Atari 5200",
    "Atari7800": "Atari 7800",
    "C64": "Commodore 64",
    "WonderSwan": "WonderSwan",
    "WonderSwanColor": "WonderSwan Color",
}

TGDB_GENRE_FALLBACK: Dict[int, str] = {
    1: "Action",
    2: "Adventure",
    3: "Construction & Management",
    4: "RPG",
    5: "Puzzle",
    6: "Strategy",
    7: "Racing",
    8: "Shooter",
    9: "Life Simulation",
    10: "Fighting",
    11: "Sports",
    12: "Sandbox",
    13: "Flight Simulator",
    14: "MMO",
    15: "Platformer",
    16: "Stealth",
    17: "Music",
    18: "Horror",
    19: "Vehicle Simulation",
    20: "Board",
    21: "Education",
    22: "Family",
    23: "Party",
    24: "Quiz",
    25: "Casino",
}

_NEGATIVE_CACHE_TTL_SECS = 86400  # 24 hours
_negative_cache: Dict[str, float] = {}
_inflight: Dict[str, asyncio.Task] = {}

_TITLE_ALIASES = {
    "god of war - koutan no kokuin": "God of War: Chains of Olympus",
    "god of war koutan no kokuin": "God of War: Chains of Olympus",
    "zelda no densetsu - kamigami no triforce": "The Legend of Zelda: A Link to the Past",
    "dairantou smash bros. for nintendo 3ds": "Super Smash Bros. for Nintendo 3DS",
    "dairantou smash bros": "Super Smash Bros.",
    "sonic cd": "Sonic CD",
    "biohazard": "Resident Evil",
    "rockman": "Mega Man",
    "pocket monsters": "Pokemon",
    "akumajou dracula": "Castlevania",
    "seiken densetsu": "Secret of Mana",
}


def _cover_cache_key(title: str, platform: Optional[str]) -> str:
    """Matches the cache key normalization used by /api/covers."""
    t = (title or "").strip()
    t = re.sub(r"^(.*?),\s*The\b(.*)$", r"The \1\2", t, flags=re.I)
    t = re.sub(r"^(.*?),\s*A\b(.*)$", r"A \1\2", t, flags=re.I)
    t = re.sub(r"\s*[\(\[].*?[\)\]]", "", t).strip()
    if " - " in t:
        t = t.replace(" - ", ": ")
    t_lower = t.lower()
    for alias_key, alias_val in _TITLE_ALIASES.items():
        if alias_key in t_lower:
            t = alias_val
            break
    return f"{t.lower()}_{platform.lower() if platform else ''}"


def _normalize_title(t: str) -> str:
    s = (t or "").strip()
    s = re.sub(r"^(.*?),\s*(The|A|An)\b(.*)$", r"\2 \1\3", s, flags=re.I)
    s = re.sub(r"\s*[\(\[].*?[\)\]]", "", s)
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s)
    return " ".join(s.lower().split())


def _default_key() -> str:
    return (os.environ.get("OMNIVAULT_THEGAMESDB_API_KEY") or DEFAULT_THEGAMESDB_PUBLIC_KEY).strip()


def get_thegamesdb_credentials() -> Dict[str, Any]:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT key, value FROM settings WHERE key IN "
        "('thegamesdb_api_key', 'thegamesdb_enabled', 'thegamesdb_remaining_allowance', 'thegamesdb_allowance_updated_at')"
    )
    rows = {r["key"]: r["value"] for r in c.fetchall()}
    conn.close()

    custom_key = (rows.get("thegamesdb_api_key") or "").strip()
    using_custom = bool(custom_key)
    api_key = custom_key if using_custom else _default_key()
    enabled = rows.get("thegamesdb_enabled", "true").lower() == "true"

    rem_raw = rows.get("thegamesdb_remaining_allowance")
    remaining_allowance: Optional[int] = None
    if rem_raw is not None and str(rem_raw).strip() != "":
        try:
            remaining_allowance = int(rem_raw)
        except ValueError:
            remaining_allowance = None

    return {
        "api_key": api_key,
        "custom_key": custom_key,
        "using_custom_key": using_custom,
        "enabled": enabled and bool(api_key),
        "remaining_allowance": remaining_allowance,
        "allowance_updated_at": rows.get("thegamesdb_allowance_updated_at"),
    }


def get_thegamesdb_config() -> Dict[str, Any]:
    creds = get_thegamesdb_credentials()
    raw_custom = creds["custom_key"]
    masked_custom = ""
    if raw_custom:
        masked_custom = f"{raw_custom[:4]}••••••••{raw_custom[-4:]}" if len(raw_custom) > 8 else "••••••••"

    return {
        "enabled": creds["enabled"],
        "using_custom_key": creds["using_custom_key"],
        "has_custom_key": bool(raw_custom),
        "masked_custom_key": masked_custom,
        "using_default_key": bool(creds["api_key"] and not creds["using_custom_key"]),
        "remaining_allowance": creds["remaining_allowance"],
        "allowance_updated_at": creds["allowance_updated_at"],
        "supported_platforms": [
            {"id": p, "name": TGDB_PLATFORM_DISPLAY_NAMES.get(p, p), "tgdb_id": pid}
            for p, pid in TGDB_PLATFORM_MAP.items()
        ],
    }


def save_thegamesdb_config(
    api_key: Optional[str] = None,
    enabled: Optional[bool] = None,
    clear_custom_key: bool = False,
) -> Dict[str, Any]:
    conn = get_db_connection()
    c = conn.cursor()

    if clear_custom_key:
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_api_key', '')")
        c.execute("DELETE FROM settings WHERE key IN ('thegamesdb_remaining_allowance', 'thegamesdb_allowance_updated_at')")
        _negative_cache.clear()
    elif api_key is not None:
        cleaned = api_key.strip()
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_api_key', ?)", (cleaned,))
        c.execute("DELETE FROM settings WHERE key IN ('thegamesdb_remaining_allowance', 'thegamesdb_allowance_updated_at')")
        _negative_cache.clear()

    if enabled is not None:
        c.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_enabled', ?)",
            ("true" if enabled else "false",),
        )

    conn.commit()
    conn.close()
    return get_thegamesdb_config()


def _record_allowance(data: Dict[str, Any], conn_cursor: Any = None) -> Optional[int]:
    if not isinstance(data, dict):
        return None
    rem = data.get("remaining_monthly_allowance")
    if rem is None:
        return None
    try:
        rem_int = int(rem)
    except (TypeError, ValueError):
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    if conn_cursor is not None:
        conn_cursor.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_remaining_allowance', ?)",
            (str(rem_int),),
        )
        conn_cursor.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_allowance_updated_at', ?)",
            (now_iso,),
        )
        return rem_int

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_remaining_allowance', ?)",
        (str(rem_int),),
    )
    c.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('thegamesdb_allowance_updated_at', ?)",
        (now_iso,),
    )
    conn.commit()
    conn.close()
    return rem_int


def is_thegamesdb_active() -> bool:
    creds = get_thegamesdb_credentials()
    if not (creds["enabled"] and creds["api_key"]):
        return False
    rem = creds["remaining_allowance"]
    if rem is not None and rem <= 5:
        # Allow automatic resume on a new UTC month in case allowance rolled over
        updated_at = creds.get("allowance_updated_at") or ""
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        if updated_at.startswith(current_month):
            return False
    return True


async def test_thegamesdb_key(api_key: Optional[str] = None) -> Dict[str, Any]:
    creds = get_thegamesdb_credentials()
    provided = (api_key or "").strip()
    token = provided or creds["api_key"]
    if not token:
        return {"status": "error", "message": "No TheGamesDB API key available."}

    url = f"{TGDB_API_BASE}/Platforms?apikey={urllib.parse.quote(token)}"
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(url, headers={"User-Agent": "OmniVault/2.0"})
            if resp.status_code != 200:
                detail = resp.text[:180]
                try:
                    detail = resp.json().get("status") or detail
                except Exception:
                    pass
                return {"status": "error", "message": f"TheGamesDB returned HTTP {resp.status_code}: {detail}"}

            data = resp.json()
            plats = data.get("data", {}).get("platforms", {})
            rem = data.get("remaining_monthly_allowance")
            if not provided or provided == creds["api_key"]:
                _record_allowance(data)

            mode_label = "Custom Key" if (provided or creds["using_custom_key"]) else "Shared Public Key"
            return {
                "status": "ok",
                "message": f"Connected via {mode_label} ({len(plats)} platforms accessible, {rem} monthly calls remaining)",
                "remaining_monthly_allowance": rem,
                "platforms_count": len(plats),
            }
    except Exception as exc:
        return {"status": "error", "message": f"TheGamesDB connection failed: {exc}"}


def _extract_boxart(game_id: Any, include_boxart: Dict[str, Any]) -> Optional[str]:
    if not include_boxart:
        return None
    b_data = include_boxart.get("data", {})
    entries = b_data.get(str(game_id)) or b_data.get(game_id) or []
    if not isinstance(entries, list) or not entries:
        return None

    chosen = None
    for entry in entries:
        if entry.get("type") == "boxart" and entry.get("side") == "front" and entry.get("filename"):
            chosen = entry
            break
    if not chosen:
        for entry in entries:
            if entry.get("filename"):
                chosen = entry
                break
    if not chosen:
        return None

    base_urls = include_boxart.get("base_url") or {}
    base = (
        base_urls.get("large")
        or base_urls.get("medium")
        or base_urls.get("original")
        or base_urls.get("thumb")
        or "https://cdn.thegamesdb.net/images/large/"
    )
    return f"{base}{chosen['filename'].lstrip('/')}"


def _parse_release_year(release_date: Optional[str]) -> Optional[int]:
    if not release_date:
        return None
    m = re.match(r"(\d{4})", str(release_date).strip())
    return int(m.group(1)) if m else None


def _map_genre(genre_ids: Any) -> str:
    if isinstance(genre_ids, list):
        for gid in genre_ids:
            try:
                mapped = TGDB_GENRE_FALLBACK.get(int(gid))
                if mapped:
                    return mapped
            except (TypeError, ValueError):
                continue
    return "Action"


def _score_game_candidate(candidate_title: str, query_title: str) -> float:
    cand_norm = _normalize_title(candidate_title)
    q_norm = _normalize_title(query_title)
    if not cand_norm or not q_norm:
        return 0.0
    if cand_norm == q_norm:
        return 100.0
    score = 0.0
    if cand_norm.startswith(q_norm) or q_norm.startswith(cand_norm):
        score += 70.0 - min(25.0, float(abs(len(cand_norm) - len(q_norm))))
    elif q_norm in cand_norm or cand_norm in q_norm:
        score += 55.0 - min(25.0, float(abs(len(cand_norm) - len(q_norm))))

    q_words = set(q_norm.split())
    c_words = set(cand_norm.split())
    if q_words and c_words:
        overlap = len(q_words.intersection(c_words)) / max(len(q_words), len(c_words))
        score += overlap * 45.0
    return score


async def _fetch_lookup_uncached(title: str, platform: Optional[str] = None) -> Optional[Dict[str, Any]]:
    creds = get_thegamesdb_credentials()
    if not creds["enabled"] or not creds["api_key"]:
        return None

    clean_q = re.sub(r"\s*[\(\[].*?[\)\]]", "", (title or "").strip()).strip() or (title or "").strip()
    if not clean_q:
        return None

    params: Dict[str, Any] = {
        "apikey": creds["api_key"],
        "name": clean_q,
        "fields": "players,publishers,genres,overview,rating,youtube",
        "include": "boxart",
    }
    if platform and platform in TGDB_PLATFORM_MAP:
        params["filter[platform]"] = str(TGDB_PLATFORM_MAP[platform])

    url = f"{TGDB_API_BASE}/Games/ByGameName?{urllib.parse.urlencode(params)}"
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(url, headers={"User-Agent": "OmniVault/2.0"})
            if resp.status_code != 200:
                return None
            payload = resp.json()
            _record_allowance(payload)

            games = payload.get("data", {}).get("games", []) or []
            if not games:
                return None

            scored = sorted(
                games,
                key=lambda g: _score_game_candidate(g.get("game_title", ""), clean_q),
                reverse=True,
            )
            best = scored[0]
            if _score_game_candidate(best.get("game_title", ""), clean_q) < 18.0:
                return None

            include_boxart = (payload.get("include") or {}).get("boxart") or {}
            box_art = _extract_boxart(best.get("id"), include_boxart)
            overview = (best.get("overview") or "").strip() or None
            players_val = best.get("players")
            yt_id = extract_youtube_id(best.get("youtube"))
            trailer_embed = (
                f"https://www.youtube-nocookie.com/embed/{yt_id}?rel=0&modestbranding=1"
                if yt_id
                else None
            )
            return {
                "tgdb_id": best.get("id"),
                "title": best.get("game_title"),
                "release_year": _parse_release_year(best.get("release_date")),
                "description": overview,
                "box_art_2d": box_art,
                "trailer_url": trailer_embed,
                "genre": _map_genre(best.get("genres")),
                "players": str(players_val) if players_val is not None else None,
                "rating_label": best.get("rating"),
            }
    except Exception as exc:
        print(f"[TheGamesDB lookup error for '{title}']: {exc}")
        return None


async def lookup_game_thegamesdb(title: str, platform: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Quota-conscious lookup by game title (+ optional OmniVault platform).
    Deduplicates concurrent in-flight lookups and negative-caches misses for 24h.
    """
    if not is_thegamesdb_active():
        return None

    norm_key = f"{_normalize_title(title)}::{(platform or '').lower()}"
    if not norm_key or norm_key.startswith("::"):
        return None

    neg_ts = _negative_cache.get(norm_key)
    if neg_ts and (time.time() - neg_ts) < _NEGATIVE_CACHE_TTL_SECS:
        return None

    existing_task = _inflight.get(norm_key)
    if existing_task and not existing_task.done():
        return await existing_task

    async def _runner() -> Optional[Dict[str, Any]]:
        try:
            res = await _fetch_lookup_uncached(title, platform)
            if res is None:
                _negative_cache[norm_key] = time.time()
            else:
                _negative_cache.pop(norm_key, None)
            return res
        finally:
            _inflight.pop(norm_key, None)

    task = asyncio.create_task(_runner())
    _inflight[norm_key] = task
    return await task


def _is_generic_desc(desc: Optional[str]) -> bool:
    if not desc:
        return True
    d = desc.strip()
    if len(d) < 85:
        return True
    generic_markers = (
        "is an acclaimed classic",
        "Classic preservation release of",
        "preserved release with verified checksums",
        "Verified preservation ROM archive",
        "1G1R",
        "preservation archive",
        "preservation ROM",
        "Official verified",
        "Official 1G1R",
        "Authentic 1G1R",
        "NV2A",
    )
    return any(marker in d for marker in generic_markers)


async def sync_platform_from_thegamesdb(
    platform: str,
    max_pages: int = 3,
    start_page: int = 1,
) -> Dict[str, Any]:
    """
    Fetches official games and box art from TheGamesDB ByPlatformID for an OmniVault platform
    (such as Switch2, Switch, PS4, PS3, 3DS, etc.) and upserts them into games + cached_covers.
    Never holds a SQLite connection open across async HTTP calls.
    """
    tgdb_pid = TGDB_PLATFORM_MAP.get(platform)
    if not tgdb_pid:
        return {"status": "error", "message": f"Unsupported TheGamesDB platform '{platform}'."}

    creds = get_thegamesdb_credentials()
    if not creds["enabled"] or not creds["api_key"]:
        return {"status": "error", "message": "TheGamesDB integration is disabled or missing an API key."}

    max_pages = max(1, min(10, int(max_pages)))
    start_page = max(1, int(start_page))
    display_platform = TGDB_PLATFORM_DISPLAY_NAMES.get(platform, platform)

    # 1. Perform all HTTP pagination requests before acquiring a DB write lock
    fetched_pages: List[Dict[str, Any]] = []
    last_error_status: Optional[int] = None
    has_more = False
    next_page: Optional[int] = None

    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        for page_num in range(start_page, start_page + max_pages):
            params = {
                "apikey": creds["api_key"],
                "id": str(tgdb_pid),
                "fields": "players,publishers,genres,overview,rating,youtube",
                "include": "boxart",
                "page": str(page_num),
            }
            url = f"{TGDB_API_BASE}/Games/ByPlatformID?{urllib.parse.urlencode(params)}"
            resp = await client.get(url, headers={"User-Agent": "OmniVault/2.0"})
            if resp.status_code != 200:
                last_error_status = resp.status_code
                break

            payload = resp.json()
            fetched_pages.append(payload)

            next_url = (payload.get("pages") or {}).get("next")
            if next_url:
                has_more = True
                next_page = page_num + 1
            else:
                has_more = False
                next_page = None
                break

    if not fetched_pages:
        code_hint = f"HTTP {last_error_status}" if last_error_status else "no response"
        return {"status": "error", "message": f"TheGamesDB returned {code_hint} on page {start_page}."}

    # 2. Apply all catalog updates and allowance metadata in one SQLite transaction
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS cached_covers ("
        "title_key TEXT PRIMARY KEY, platform TEXT, cover_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )

    cursor.execute(
        "SELECT id, title, description, release_year, box_art_2d, box_art_3d, backdrop, trailer_url FROM games WHERE platform = ?",
        (platform,),
    )
    existing_by_norm: Dict[str, Dict[str, Any]] = {}
    for row in cursor.fetchall():
        norm = _normalize_title(row["title"])
        if norm and norm not in existing_by_norm:
            existing_by_norm[norm] = dict(row)

    imported = 0
    updated = 0
    remaining_allowance = creds.get("remaining_allowance")

    for payload in fetched_pages:
        rem = _record_allowance(payload, conn_cursor=cursor)
        if rem is not None:
            remaining_allowance = rem

        games_batch = payload.get("data", {}).get("games", []) or []
        include_boxart = (payload.get("include") or {}).get("boxart") or {}

        for g in games_batch:
            gid = g.get("id")
            gtitle = (g.get("game_title") or "").strip()
            if not gid or not gtitle:
                continue

            norm = _normalize_title(gtitle)
            year = _parse_release_year(g.get("release_date"))
            overview = (g.get("overview") or "").strip()
            genre = _map_genre(g.get("genres"))
            box_art = _extract_boxart(gid, include_boxart) or ""
            yt_id = extract_youtube_id(g.get("youtube"))
            trailer_embed = (
                f"https://www.youtube-nocookie.com/embed/{yt_id}?rel=0&modestbranding=1"
                if yt_id
                else ""
            )

            existing = existing_by_norm.get(norm)
            if existing:
                new_desc = existing["description"]
                if overview and _is_generic_desc(existing["description"]):
                    new_desc = overview
                new_year = existing["release_year"] or year
                old_box = existing["box_art_2d"] or ""
                new_box = box_art if (box_art and (not old_box or "libretro-thumbnails" in old_box)) else old_box
                new_box3d = existing["box_art_3d"] or new_box
                new_backdrop = existing["backdrop"] or new_box
                old_trailer = existing.get("trailer_url") or ""
                new_trailer = (
                    trailer_embed
                    if (trailer_embed and (not old_trailer or "listType=search" in old_trailer))
                    else old_trailer
                )

                if (
                    new_desc != existing["description"]
                    or new_year != existing["release_year"]
                    or new_box != existing["box_art_2d"]
                    or new_trailer != old_trailer
                ):
                    cursor.execute(
                        "UPDATE games SET description = ?, release_year = ?, box_art_2d = ?, box_art_3d = ?, backdrop = ?, trailer_url = ? WHERE id = ?",
                        (new_desc, new_year, new_box, new_box3d, new_backdrop, new_trailer, existing["id"]),
                    )
                    updated += 1
            else:
                row_id = f"{platform.lower()}-tgdb-{gid}"
                slug = re.sub(r"[^a-z0-9]+", "-", gtitle.lower()).strip("-") or row_id
                desc_final = overview or f"{gtitle} for {display_platform}."
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO games (
                        id, title, slug, platform, platform_name, genre, release_year,
                        description, box_art_2d, box_art_3d, backdrop, trailer_url, screenshots, rom_format, is_featured
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 0)
                    """,
                    (
                        row_id,
                        gtitle,
                        slug,
                        platform,
                        display_platform,
                        genre,
                        year,
                        desc_final,
                        box_art,
                        box_art,
                        box_art,
                        trailer_embed,
                        platform.lower(),
                    ),
                )
                if cursor.rowcount > 0:
                    imported += 1
                    existing_by_norm[norm] = {
                        "id": row_id,
                        "title": gtitle,
                        "description": desc_final,
                        "release_year": year,
                        "box_art_2d": box_art,
                        "box_art_3d": box_art,
                        "backdrop": box_art,
                        "trailer_url": trailer_embed,
                    }

            if box_art:
                cache_key = _cover_cache_key(gtitle, platform)
                cursor.execute(
                    "INSERT OR REPLACE INTO cached_covers (title_key, platform, cover_url) VALUES (?, ?, ?)",
                    (cache_key, platform, box_art),
                )

    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "platform": platform,
        "platform_name": display_platform,
        "imported": imported,
        "updated": updated,
        "pages_fetched": len(fetched_pages),
        "has_more": has_more,
        "next_page": next_page,
        "remaining_monthly_allowance": remaining_allowance,
    }


async def enrich_game_by_id(game_id: str) -> Dict[str, Any]:
    """
    On-demand TheGamesDB metadata & cover enrichment for a single catalog entry.
    Updates description, release_year, box_art_2d, box_art_3d, backdrop, genre, and cached_covers.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return {"status": "error", "enriched": False, "message": "Game not found"}

    game_dict = row_to_game_dict(row)
    title = game_dict.get("title", "")
    platform = game_dict.get("platform")

    creds = get_thegamesdb_credentials()
    if not creds["enabled"] or not creds["api_key"]:
        return {"status": "error", "enriched": False, "message": "TheGamesDB is disabled or missing an API key", "game": game_dict}

    # Force a fresh check for explicit user refresh (no DB connection held open across HTTP)
    norm_key = f"{_normalize_title(title)}::{(platform or '').lower()}"
    _negative_cache.pop(norm_key, None)

    tgdb = await _fetch_lookup_uncached(title, platform)
    if not tgdb:
        return {"status": "not_found", "enriched": False, "message": "No matching entry returned by TheGamesDB", "game": game_dict}

    new_desc = tgdb["description"] if tgdb.get("description") else game_dict.get("description")
    new_year = tgdb["release_year"] or game_dict.get("release_year")
    new_genre = game_dict.get("genre")
    if (not new_genre or new_genre in ("Retro", "Imported", "Unknown")) and tgdb.get("genre"):
        new_genre = tgdb["genre"]

    box_art = tgdb.get("box_art_2d")
    new_box_2d = box_art or game_dict.get("box_art_2d")
    new_box_3d = box_art or game_dict.get("box_art_3d") or new_box_2d
    new_backdrop = game_dict.get("backdrop") or box_art
    old_trailer = game_dict.get("trailer_url") or ""
    new_trailer = (
        tgdb["trailer_url"]
        if (tgdb.get("trailer_url") and (not old_trailer or "listType=search" in old_trailer))
        else old_trailer
    )

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE games
        SET description = ?, release_year = ?, genre = ?, box_art_2d = ?, box_art_3d = ?, backdrop = ?, trailer_url = ?
        WHERE id = ?
        """,
        (new_desc, new_year, new_genre, new_box_2d, new_box_3d, new_backdrop, new_trailer, game_id),
    )

    if box_art:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS cached_covers ("
            "title_key TEXT PRIMARY KEY, platform TEXT, cover_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        )
        cursor.execute(
            "INSERT OR REPLACE INTO cached_covers (title_key, platform, cover_url) VALUES (?, ?, ?)",
            (_cover_cache_key(title, platform), platform, box_art),
        )

    conn.commit()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    updated_row = cursor.fetchone()
    conn.close()

    return {
        "status": "ok",
        "enriched": True,
        "game": row_to_game_dict(updated_row) if updated_row else game_dict,
    }


MODERN_SYNC_PLATFORMS = [
    "Switch2", "PS5", "Windows", "macOS", "Switch",
    "PS4", "PS3", "Xbox360", "Xbox", "3DS", "PSVita", "WiiU",
]


def _clean_tgdb_text(raw: Optional[str]) -> str:
    if not raw:
        return ""
    txt = html.unescape(str(raw))
    return txt.replace("\r\n", "\n").replace("\r", "\n").strip()


async def sync_from_thegamesdb_static_dump(scope: str = "all") -> Dict[str, Any]:
    """
    Imports TheGamesDB's official static catalog dump (database-latest.json, ~121k games)
    across the requested scope ('modern' or 'all' 39 OmniVault systems) using ZERO API quota calls.
    Never holds a SQLite connection open during the HTTP download.
    """
    creds = get_thegamesdb_credentials()
    if not creds["enabled"]:
        return {"status": "error", "message": "TheGamesDB integration is disabled in Settings."}

    clean_scope = (scope or "all").strip().lower()
    targets = MODERN_SYNC_PLATFORMS if clean_scope == "modern" else list(TGDB_PLATFORM_MAP.keys())
    allowed_set = set(targets)

    # 1. Fetch static dump before touching SQLite
    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, verify=False) as client:
            resp = await client.get(TGDB_STATIC_DUMP_URL, headers={"User-Agent": "OmniVault/2.0"})
            if resp.status_code != 200:
                return {"status": "error", "message": f"Static CDN returned HTTP {resp.status_code}"}
            payload = resp.json()
    except Exception as exc:
        return {"status": "error", "message": f"Static dump fetch failed: {exc}"}

    raw_games = (payload.get("data") or {}).get("games") or []
    if not isinstance(raw_games, list) or not raw_games:
        return {"status": "error", "message": "Static dump returned no games data."}

    # 2. Deduplicate 1G1R per (platform, normalized_title), preferring EN/US/World + rich metadata
    best_by_key: Dict[tuple, tuple] = {}
    for g in raw_games:
        if not isinstance(g, dict):
            continue
        try:
            tgdb_pid = int(g.get("platform") or 0)
        except (TypeError, ValueError):
            continue
        plat = TGDB_ID_TO_PLATFORM.get(tgdb_pid)
        if not plat or plat not in allowed_set:
            continue

        gid = g.get("id")
        gtitle = _clean_tgdb_text(g.get("game_title"))
        if not gid or not gtitle:
            continue

        norm = _normalize_title(gtitle)
        if not norm:
            continue

        overview = _clean_tgdb_text(g.get("overview"))
        yt_id = extract_youtube_id(g.get("youtube"))
        year = _parse_release_year(g.get("release_date"))
        try:
            reg_id = int(g.get("region_id") or 0)
        except (TypeError, ValueError):
            reg_id = 0
        reg_score = 2 if reg_id == 1 else (1 if reg_id in (0, 2) else 0)
        score = (reg_score, 1 if yt_id else 0, min(len(overview), 2000), 1 if year else 0, -int(gid))

        key = (plat, norm)
        prev = best_by_key.get(key)
        if prev is None or score > prev[0]:
            best_by_key[key] = (score, int(gid), gtitle, overview, year, _map_genre(g.get("genres")), yt_id)

    # Free raw JSON early before DB transaction
    del raw_games, payload

    # 3. Upsert into SQLite in one fast batched transaction
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, platform, title, description, release_year, box_art_2d, box_art_3d, backdrop, trailer_url FROM games"
    )
    existing_by_key: Dict[tuple, Dict[str, Any]] = {}
    for row in cursor.fetchall():
        norm = _normalize_title(row["title"])
        key = (row["platform"], norm)
        if norm and key not in existing_by_key:
            existing_by_key[key] = dict(row)

    updates: List[tuple] = []
    inserts: List[tuple] = []
    per_plat_imported: Dict[str, int] = {p: 0 for p in targets}
    per_plat_updated: Dict[str, int] = {p: 0 for p in targets}

    for (plat, _norm), (_score, gid, gtitle, overview, year, genre, yt_id) in best_by_key.items():
        display_platform = TGDB_PLATFORM_DISPLAY_NAMES.get(plat, plat)
        box_art = f"https://cdn.thegamesdb.net/images/thumb/boxart/front/{gid}-1.jpg"
        trailer_embed = f"https://www.youtube-nocookie.com/embed/{yt_id}?rel=0&modestbranding=1" if yt_id else ""

        existing = existing_by_key.get((plat, _norm))
        if existing:
            new_desc = existing["description"]
            if overview and _is_generic_desc(existing["description"]):
                new_desc = overview
            new_year = existing["release_year"] or year
            old_box = existing["box_art_2d"] or ""
            new_box = box_art if (not old_box or "libretro-thumbnails" in old_box) else old_box
            new_box3d = existing["box_art_3d"] or new_box
            new_backdrop = existing["backdrop"] or new_box
            old_trailer = existing.get("trailer_url") or ""
            new_trailer = (
                trailer_embed
                if (trailer_embed and (not old_trailer or "listType=search" in old_trailer))
                else old_trailer
            )
            if (
                new_desc != existing["description"]
                or new_year != existing["release_year"]
                or new_box != existing["box_art_2d"]
                or new_trailer != old_trailer
            ):
                updates.append((new_desc, new_year, new_box, new_box3d, new_backdrop, new_trailer, existing["id"]))
                per_plat_updated[plat] = per_plat_updated.get(plat, 0) + 1
        else:
            row_id = f"{plat.lower()}-tgdb-{gid}"
            slug = re.sub(r"[^a-z0-9]+", "-", gtitle.lower()).strip("-") or row_id
            desc_final = overview or f"{gtitle} for {display_platform}."
            inserts.append((
                row_id,
                gtitle,
                slug,
                plat,
                display_platform,
                genre,
                year,
                desc_final,
                box_art,
                box_art,
                box_art,
                trailer_embed,
                plat.lower(),
            ))
            per_plat_imported[plat] = per_plat_imported.get(plat, 0) + 1

    if updates:
        cursor.executemany(
            "UPDATE games SET description = ?, release_year = ?, box_art_2d = ?, box_art_3d = ?, backdrop = ?, trailer_url = ? WHERE id = ?",
            updates,
        )
    if inserts:
        cursor.executemany(
            """
            INSERT OR IGNORE INTO games (
                id, title, slug, platform, platform_name, genre, release_year,
                description, box_art_2d, box_art_3d, backdrop, trailer_url, screenshots, rom_format, is_featured
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 0)
            """,
            inserts,
        )

    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM games")
    total_catalog_games = int(cursor.fetchone()[0])
    conn.close()

    results = [
        {
            "platform": p,
            "platform_name": TGDB_PLATFORM_DISPLAY_NAMES.get(p, p),
            "status": "ok",
            "imported": per_plat_imported.get(p, 0),
            "updated": per_plat_updated.get(p, 0),
        }
        for p in targets
    ]

    return {
        "status": "ok",
        "source": "thegamesdb_static_dump",
        "api_calls_used": 0,
        "scope": "modern" if clean_scope == "modern" else "all",
        "platforms_synced": len(targets),
        "total_platforms_targeted": len(targets),
        "total_imported": len(inserts),
        "total_updated": len(updates),
        "total_catalog_games": total_catalog_games,
        "remaining_monthly_allowance": creds.get("remaining_allowance"),
        "stopped_early": False,
        "results": results,
    }


async def sync_all_platforms_from_thegamesdb(
    scope: str = "all",
    pages_per_platform: int = 1,
    use_static_dump: bool = True,
) -> Dict[str, Any]:
    """
    Syncs multiple or all 39 platforms from TheGamesDB.
    Uses TheGamesDB's free zero-quota static catalog dump by default, falling back to API pagination if unreachable.
    """
    clean_scope = (scope or "all").strip().lower()
    if use_static_dump:
        dump_res = await sync_from_thegamesdb_static_dump(scope=clean_scope)
        if dump_res.get("status") == "ok":
            return dump_res
        print(f"[TheGamesDB Static Dump Fallback]: {dump_res.get('message')}")

    creds = get_thegamesdb_credentials()
    if not creds["enabled"] or not creds["api_key"]:
        return {"status": "error", "message": "TheGamesDB integration is disabled or missing an API key."}

    targets = MODERN_SYNC_PLATFORMS if clean_scope == "modern" else list(TGDB_PLATFORM_MAP.keys())
    pages_clamped = max(1, min(3, int(pages_per_platform or 1)))

    total_imported = 0
    total_updated = 0
    remaining_allowance = creds.get("remaining_allowance")
    stopped_early = False
    results: List[Dict[str, Any]] = []

    for plat in targets:
        if remaining_allowance is not None and int(remaining_allowance) < 20:
            stopped_early = True
            break
        res = await sync_platform_from_thegamesdb(platform=plat, max_pages=pages_clamped, start_page=1)
        results.append({
            "platform": plat,
            "platform_name": res.get("platform_name", TGDB_PLATFORM_DISPLAY_NAMES.get(plat, plat)),
            "status": res.get("status"),
            "imported": int(res.get("imported") or 0),
            "updated": int(res.get("updated") or 0),
            "message": res.get("message"),
        })
        if res.get("status") == "ok":
            total_imported += int(res.get("imported") or 0)
            total_updated += int(res.get("updated") or 0)
        rem = res.get("remaining_monthly_allowance")
        if rem is not None:
            remaining_allowance = rem
            if int(remaining_allowance) < 20:
                stopped_early = True
                break

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM games")
    total_catalog_games = int(cur.fetchone()[0])
    conn.close()

    return {
        "status": "ok",
        "source": "thegamesdb_api",
        "scope": "modern" if clean_scope == "modern" else "all",
        "platforms_synced": len(results),
        "total_platforms_targeted": len(targets),
        "total_imported": total_imported,
        "total_updated": total_updated,
        "total_catalog_games": total_catalog_games,
        "remaining_monthly_allowance": remaining_allowance,
        "stopped_early": stopped_early,
        "results": results,
    }
