import asyncio
import gzip
import html
import json
import os
import re
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..database import (
    BUNDLE_DATA_DIR,
    DB_DIR,
    ensure_games_extended_columns,
    get_db_connection,
    row_to_game_dict,
)
from .video_service import extract_youtube_id

TGDB_API_BASE = "https://api.thegamesdb.net/v1"
TGDB_STATIC_DUMP_URL = "https://cdn.thegamesdb.net/json/database-latest.json"
DEFAULT_THEGAMESDB_PUBLIC_KEY = "5a0d37004fc14802a8913a12dae883b753f2bc6bc3b18685733fa3df4c07d5c0"

# Verified against TheGamesDB /v1/Platforms
TGDB_PLATFORM_MAP: Dict[str, int] = {
    "NES": 7,
    "FDS": 4936,
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
    "VirtualBoy": 4918,
    "GameAndWatch": 4950,
    "PokemonMini": 4957,
    "PS1": 10,
    "PS2": 11,
    "PS3": 12,
    "PS4": 4919,
    "PS5": 4980,
    "PSP": 13,
    "PSVita": 39,
    "Xbox": 14,
    "Xbox360": 15,
    "XboxOne": 4920,
    "XboxSeriesX": 4981,
    "Windows": 1,
    "macOS": 37,
    "Genesis": 18,
    "Sega32X": 33,
    "SegaCD": 21,
    "Saturn": 17,
    "Dreamcast": 16,
    "MasterSystem": 35,
    "GameGear": 20,
    "SG1000": 4949,
    "SegaPico": 4958,
    "Arcade": 23,
    "NeoGeo": 24,
    "NeoGeoCD": 4956,
    "NGP": 4922,
    "NGPC": 4923,
    "TG16": 34,
    "TGCD": 4955,
    "PCFX": 4930,
    "3DO": 25,
    "Jaguar": 28,
    "JaguarCD": 29,
    "Lynx": 4924,
    "Atari2600": 22,
    "Atari5200": 26,
    "Atari7800": 27,
    "ColecoVision": 31,
    "Intellivision": 32,
    "Vectrex": 4939,
    "CDi": 4917,
    "WonderSwan": 4925,
    "WonderSwanColor": 4926,
    "Playdate": 5016,
    "Evercade": 4985,
    "C64": 40,
    "Amiga": 4911,
    "AmigaCD32": 4947,
    "ZXSpectrum": 4913,
    "AmstradCPC": 4914,
    "MSX": 4929,
    "AtariST": 4937,
    "Atari800": 4943,
    "AppleII": 4942,
    "PC98": 4934,
    "PC88": 4933,
    "X68000": 4931,
    "FMTowns": 4932,
    "Android": 4916,
    "iOS": 4915,
    "OculusQuest": 4990,
}

TGDB_ID_TO_PLATFORM: Dict[int, str] = {pid: plat for plat, pid in TGDB_PLATFORM_MAP.items()}
# Merge PAL/JP Mega Drive (36) into Genesis for clean 1G1R deduplication
TGDB_ID_TO_PLATFORM[36] = "Genesis"

MODERN_TGDB_FIRST_PLATFORMS = {
    "Switch2",
    "Switch",
    "PS5",
    "PS4",
    "PS3",
    "PSVita",
    "3DS",
    "WiiU",
    "XboxSeriesX",
    "XboxOne",
    "Xbox360",
    "Xbox",
    "Windows",
    "macOS",
}

TGDB_PLATFORM_DISPLAY_NAMES: Dict[str, str] = {
    "NES": "Nintendo Entertainment System",
    "FDS": "Famicom Disk System",
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
    "VirtualBoy": "Nintendo Virtual Boy",
    "GameAndWatch": "Game & Watch",
    "PokemonMini": "Pokémon Mini",
    "PS1": "PlayStation",
    "PS2": "PlayStation 2",
    "PS3": "PlayStation 3",
    "PS4": "PlayStation 4",
    "PS5": "PlayStation 5",
    "PSP": "PlayStation Portable",
    "PSVita": "PlayStation Vita",
    "Xbox": "Microsoft Xbox",
    "Xbox360": "Xbox 360",
    "XboxOne": "Xbox One",
    "XboxSeriesX": "Xbox Series X/S",
    "Windows": "Windows (PC)",
    "macOS": "macOS",
    "Genesis": "Sega Genesis",
    "Sega32X": "Sega 32X",
    "SegaCD": "Sega CD",
    "Saturn": "Sega Saturn",
    "Dreamcast": "Sega Dreamcast",
    "MasterSystem": "Sega Master System",
    "GameGear": "Sega Game Gear",
    "SG1000": "Sega SG-1000",
    "SegaPico": "Sega Pico",
    "Arcade": "Arcade",
    "NeoGeo": "Neo Geo",
    "NeoGeoCD": "Neo Geo CD",
    "NGP": "Neo Geo Pocket",
    "NGPC": "Neo Geo Pocket Color",
    "TG16": "TurboGrafx-16",
    "TGCD": "TurboGrafx-CD",
    "PCFX": "NEC PC-FX",
    "3DO": "3DO",
    "Jaguar": "Atari Jaguar",
    "JaguarCD": "Atari Jaguar CD",
    "Lynx": "Atari Lynx",
    "Atari2600": "Atari 2600",
    "Atari5200": "Atari 5200",
    "Atari7800": "Atari 7800",
    "ColecoVision": "ColecoVision",
    "Intellivision": "Intellivision",
    "Vectrex": "Vectrex",
    "CDi": "Philips CD-i",
    "WonderSwan": "WonderSwan",
    "WonderSwanColor": "WonderSwan Color",
    "Playdate": "Playdate",
    "Evercade": "Evercade",
    "C64": "Commodore 64",
    "Amiga": "Commodore Amiga",
    "AmigaCD32": "Amiga CD32",
    "ZXSpectrum": "Sinclair ZX Spectrum",
    "AmstradCPC": "Amstrad CPC",
    "MSX": "MSX",
    "AtariST": "Atari ST",
    "Atari800": "Atari 800",
    "AppleII": "Apple II",
    "PC98": "NEC PC-98",
    "PC88": "NEC PC-88",
    "X68000": "Sharp X68000",
    "FMTowns": "FM Towns",
    "Android": "Android",
    "iOS": "iOS",
    "OculusQuest": "Meta Quest",
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
    24: "Productivity",
    25: "Quiz",
    26: "Utility",
    27: "Virtual Console",
    28: "Unofficial",
    29: "Video",
    30: "Demo",
}

_GENRE_NAME_CLEANUP = {
    "Role-Playing": "RPG",
    "Platform": "Platformer",
    "Construction and Management Simulation": "Construction & Management",
    "GBA Video / PSP Video": "Video",
}

_TGDB_REF_CACHE: Optional[Dict[str, Any]] = None


def _load_tgdb_reference(force_reload: bool = False) -> Dict[str, Any]:
    global _TGDB_REF_CACHE
    if _TGDB_REF_CACHE is not None and not force_reload:
        return _TGDB_REF_CACHE

    loaded: Dict[str, Any] = {"genres": {}, "developers": {}, "publishers": {}, "platforms": {}}
    for candidate in (DB_DIR / "tgdb_reference.json.gz", BUNDLE_DATA_DIR / "tgdb_reference.json.gz"):
        if candidate.exists():
            try:
                with gzip.open(candidate, "rt", encoding="utf-8") as f:
                    parsed = json.load(f)
                if isinstance(parsed, dict):
                    loaded.update(parsed)
                    break
            except Exception as exc:
                print(f"[TGDB Reference Load Note]: {exc}")

    # Normalize genre names consistently
    norm_genres: Dict[int, str] = dict(TGDB_GENRE_FALLBACK)
    for k, v in (loaded.get("genres") or {}).items():
        try:
            gid = int(k)
            gname = _GENRE_NAME_CLEANUP.get(str(v).strip(), str(v).strip())
            if gname:
                norm_genres[gid] = gname
        except (TypeError, ValueError):
            continue
    loaded["genres_int"] = norm_genres
    _TGDB_REF_CACHE = loaded
    return loaded


def _resolve_tgdb_platform(tgdb_pid: int, include_platforms: Optional[Dict[str, Any]] = None) -> Tuple[str, str]:
    """Resolves any of the 153 TheGamesDB platform IDs into (platform_code, display_name)."""
    if tgdb_pid in TGDB_ID_TO_PLATFORM:
        code = TGDB_ID_TO_PLATFORM[tgdb_pid]
        return code, TGDB_PLATFORM_DISPLAY_NAMES.get(code, code)

    ref = _load_tgdb_reference()
    pinfo = (include_platforms or {}).get(str(tgdb_pid)) or (ref.get("platforms") or {}).get(str(tgdb_pid)) or {}
    raw_name = str(pinfo.get("name") or f"Platform {tgdb_pid}").strip()
    raw_alias = str(pinfo.get("alias") or "").strip()

    clean_base = raw_alias or raw_name
    code = re.sub(r"[^A-Za-z0-9]+", "", clean_base.title())[:24] or f"TGDB{tgdb_pid}"
    TGDB_PLATFORM_DISPLAY_NAMES.setdefault(code, raw_name)
    return code, raw_name

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


def _map_genres_full(genre_ids: Any) -> Tuple[str, str]:
    """
    Resolves all TheGamesDB genre IDs for a game into:
      (primary_genre, pipe_delimited_genres_list)
    Prefers specific genres (e.g. Shooter, RPG, Platformer, Fighting, Horror, Racing)
    over generic 'Action' when a title has multiple genres, while keeping ALL genres
    in genres_list so filtering by any matching category succeeds.
    """
    ref = _load_tgdb_reference()
    gmap: Dict[int, str] = ref.get("genres_int") or TGDB_GENRE_FALLBACK
    names: List[str] = []
    if isinstance(genre_ids, list):
        for gid in genre_ids:
            try:
                mapped = gmap.get(int(gid))
                if mapped and mapped not in names:
                    names.append(mapped)
            except (TypeError, ValueError):
                continue

    if not names:
        return "", ""

    all_tags = list(names)
    if "Action" in names and "Adventure" in names and "Action-Adventure" not in all_tags:
        all_tags.append("Action-Adventure")

    specific = [n for n in names if n not in ("Action", "Adventure", "Unofficial", "Virtual Console")]
    if specific:
        primary = specific[0]
    elif "Action" in names and "Adventure" in names:
        primary = "Action-Adventure"
    else:
        primary = names[0]

    genres_pipe = "|" + "|".join(all_tags) + "|"
    return primary, genres_pipe


def _map_genre(genre_ids: Any) -> str:
    primary, _ = _map_genres_full(genre_ids)
    return primary or "Action"


def _resolve_entity_names(entity_ids: Any, bucket: str, max_items: int = 3) -> str:
    if not isinstance(entity_ids, list) or not entity_ids:
        return ""
    ref = _load_tgdb_reference()
    table = ref.get(bucket) or {}
    out: List[str] = []
    for eid in entity_ids:
        name = str(table.get(str(eid)) or "").strip()
        if name and name not in out:
            out.append(name)
            if len(out) >= max_items:
                break
    return ", ".join(out)


def _extract_media_bundle(
    game_id: Any,
    bdata: Dict[str, Any],
    thumb_base: str,
    large_base: str,
) -> Tuple[str, str, str]:
    """Extracts (front_boxart_url, backdrop_url, screenshots_json) from static dump include.boxart."""
    entries = bdata.get(str(game_id)) or bdata.get(game_id) or []
    if not isinstance(entries, list) or not entries:
        fallback = f"{thumb_base}boxart/front/{game_id}-1.jpg"
        return fallback, fallback, "[]"

    front_file = ""
    fanart_file = ""
    screens: List[str] = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        fn = str(e.get("filename") or "").lstrip("/")
        if not fn:
            continue
        etype = e.get("type")
        if etype == "boxart" and e.get("side") == "front" and not front_file:
            front_file = fn
        elif etype == "fanart":
            if not fanart_file:
                fanart_file = fn
            if len(screens) < 6:
                screens.append(f"{large_base}{fn}")
        elif etype == "screenshot" and len(screens) < 6:
            screens.append(f"{large_base}{fn}")

    box_url = f"{large_base}{front_file}" if front_file else f"{thumb_base}boxart/front/{game_id}-1.jpg"
    backdrop_url = f"{large_base}{fanart_file}" if fanart_file else box_url
    screens_json = json.dumps(screens[:6]) if screens else "[]"
    return box_url, backdrop_url, screens_json


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
    from ..database import rebuild_fast_catalog_indexes
    from ..routers.games import invalidate_catalog_meta_cache
    rebuild_fast_catalog_indexes(force=True)
    invalidate_catalog_meta_cache()
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
    "Switch2", "PS5", "XboxSeriesX", "Windows", "macOS", "Switch",
    "PS4", "XboxOne", "PS3", "Xbox360", "Xbox", "3DS", "PSVita", "WiiU",
]


def _clean_tgdb_text(raw: Optional[str]) -> str:
    if not raw:
        return ""
    txt = html.unescape(str(raw))
    return txt.replace("\r\n", "\n").replace("\r", "\n").strip()


async def sync_from_thegamesdb_static_dump(scope: str = "all") -> Dict[str, Any]:
    """
    Imports TheGamesDB's official static catalog dump (database-latest.json, ~121k+ entries across 150+ systems)
    with full metadata (multi-genres, developers, publishers, ESRB age ratings, players, co-op, release dates,
    alternate titles, verified front boxart, 1080p fanart backdrops, screenshots & YouTube trailers)
    using ZERO API quota calls.
    Never holds a SQLite connection open during the HTTP download.
    """
    creds = get_thegamesdb_credentials()
    if not creds["enabled"]:
        return {"status": "error", "message": "TheGamesDB integration is disabled in Settings."}

    clean_scope = (scope or "all").strip().lower()
    modern_only = clean_scope == "modern"
    modern_set = set(MODERN_SYNC_PLATFORMS)

    # 1. Fetch static dump before touching SQLite
    try:
        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True, verify=False) as client:
            resp = await client.get(TGDB_STATIC_DUMP_URL, headers={"User-Agent": "OmniVault/2.1"})
            if resp.status_code != 200:
                return {"status": "error", "message": f"Static CDN returned HTTP {resp.status_code}"}
            payload = resp.json()
    except Exception as exc:
        return {"status": "error", "message": f"Static dump fetch failed: {exc}"}

    raw_games = (payload.get("data") or {}).get("games") or []
    if not isinstance(raw_games, list) or not raw_games:
        return {"status": "error", "message": "Static dump returned no games data."}

    inc = payload.get("include") or {}
    box_inc = inc.get("boxart") or {}
    box_data: Dict[str, Any] = box_inc.get("data") or {}
    base_urls = box_inc.get("base_url") or {}
    thumb_base = str(base_urls.get("thumb") or "https://cdn.thegamesdb.net/images/thumb/")
    large_base = str(base_urls.get("large") or base_urls.get("medium") or "https://cdn.thegamesdb.net/images/large/")
    plat_inc_raw = inc.get("platform") or {}
    plat_inc: Dict[str, Any] = plat_inc_raw.get("data") if isinstance(plat_inc_raw.get("data"), dict) else plat_inc_raw

    # Pre-warm reference tables (genres, 8.7k developers, 4.7k publishers, 153 platforms)
    _load_tgdb_reference()

    # 2. Deduplicate 1G1R per (platform, normalized_title), preferring EN/US/World + rich metadata
    best_by_key: Dict[tuple, Dict[str, Any]] = {}
    discovered_platforms: Dict[str, str] = {}

    for g in raw_games:
        if not isinstance(g, dict):
            continue
        try:
            tgdb_pid = int(g.get("platform") or 0)
        except (TypeError, ValueError):
            continue
        if tgdb_pid <= 0:
            continue

        plat, display_plat = _resolve_tgdb_platform(tgdb_pid, plat_inc)
        if modern_only and plat not in modern_set:
            continue

        gid = g.get("id")
        gtitle = _clean_tgdb_text(g.get("game_title"))
        if not gid or not gtitle:
            continue

        norm = _normalize_title(gtitle)
        if not norm:
            continue

        discovered_platforms[plat] = display_plat
        overview = _clean_tgdb_text(g.get("overview"))
        yt_id = extract_youtube_id(g.get("youtube"))
        rel_date = str(g.get("release_date") or "").strip()
        year = _parse_release_year(rel_date)
        primary_genre, genres_pipe = _map_genres_full(g.get("genres"))
        dev_str = _resolve_entity_names(g.get("developers"), "developers", max_items=3)
        pub_str = _resolve_entity_names(g.get("publishers"), "publishers", max_items=3)
        esrb_str = _clean_tgdb_text(g.get("rating"))
        coop_raw = str(g.get("coop") or "").strip()
        coop_str = "Yes" if coop_raw.lower() == "yes" else ("No" if coop_raw.lower() == "no" else "")
        try:
            players_int = max(0, int(g.get("players") or 0))
        except (TypeError, ValueError):
            players_int = 0
        alts_raw = g.get("alternates")
        alts_str = " | ".join(str(a).strip() for a in alts_raw if a and str(a).strip())[:500] if isinstance(alts_raw, list) else ""

        try:
            reg_id = int(g.get("region_id") or 0)
        except (TypeError, ValueError):
            reg_id = 0
        reg_score = 2 if reg_id == 1 else (1 if reg_id in (0, 2) else 0)
        meta_richness = (
            (1 if primary_genre else 0)
            + (1 if dev_str else 0)
            + (1 if pub_str else 0)
            + (1 if str(gid) in box_data else 0)
        )
        score = (reg_score, meta_richness, 1 if yt_id else 0, min(len(overview), 2000), 1 if year else 0, -int(gid))

        key = (plat, norm)
        prev = best_by_key.get(key)
        if prev is None or score > prev["score"]:
            box_url, backdrop_url, screens_json = _extract_media_bundle(gid, box_data, thumb_base, large_base)
            best_by_key[key] = {
                "score": score,
                "gid": int(gid),
                "title": gtitle,
                "display_plat": display_plat,
                "overview": overview,
                "year": year,
                "release_date": rel_date,
                "genre": primary_genre,
                "genres_list": genres_pipe,
                "developer": dev_str,
                "publisher": pub_str,
                "esrb_rating": esrb_str,
                "players": players_int,
                "coop": coop_str,
                "alternates": alts_str,
                "yt_id": yt_id,
                "box_url": box_url,
                "backdrop_url": backdrop_url,
                "screens_json": screens_json,
            }

    # Free raw JSON early before DB transaction
    del raw_games, box_data, payload

    # 3. Upsert into SQLite in one fast batched transaction
    ensure_games_extended_columns()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, platform, title, genre, genres_list, developer, publisher,
               esrb_rating, players, coop, release_date, alternates,
               description, release_year, box_art_2d, box_art_3d, backdrop, screenshots, trailer_url
        FROM games
        """
    )
    existing_by_key: Dict[tuple, Dict[str, Any]] = {}
    for row in cursor.fetchall():
        norm = _normalize_title(row["title"])
        key = (row["platform"], norm)
        if norm and key not in existing_by_key:
            existing_by_key[key] = dict(row)

    updates: List[tuple] = []
    inserts: List[tuple] = []
    per_plat_imported: Dict[str, int] = {}
    per_plat_updated: Dict[str, int] = {}

    for (plat, _norm), item in best_by_key.items():
        gid = item["gid"]
        gtitle = item["title"]
        display_platform = item["display_plat"]
        overview = item["overview"]
        year = item["year"]
        rel_date = item["release_date"]
        genre = item["genre"]
        genres_list = item["genres_list"]
        dev_str = item["developer"]
        pub_str = item["publisher"]
        esrb_str = item["esrb_rating"]
        players_int = item["players"]
        coop_str = item["coop"]
        alts_str = item["alternates"]
        box_art = item["box_url"]
        backdrop_art = item["backdrop_url"]
        screens_json = item["screens_json"]
        yt_id = item["yt_id"]
        trailer_embed = f"https://www.youtube-nocookie.com/embed/{yt_id}?rel=0&modestbranding=1" if yt_id else ""

        existing = existing_by_key.get((plat, _norm))
        if existing:
            new_desc = existing["description"]
            if overview and (_is_generic_desc(existing["description"]) or len(overview) > len(existing["description"] or "")):
                new_desc = overview
            new_year = year or existing["release_year"]
            new_rel_date = rel_date or existing.get("release_date") or ""

            old_genre = existing.get("genre") or ""
            new_genre = genre if (genre and (not old_genre or old_genre in ("Action", "Retro", "Imported", "Unknown", "Uncategorized"))) else (old_genre or "Uncategorized")
            new_genres_list = genres_list or existing.get("genres_list") or (f"|{new_genre}|" if new_genre else "")

            old_dev = existing.get("developer") or ""
            new_dev = dev_str if (dev_str and (not old_dev or old_dev in ("Unknown", "Retro Studio"))) else old_dev
            old_pub = existing.get("publisher") or ""
            new_pub = pub_str if (pub_str and (not old_pub or old_pub in ("Unknown", "Retro Publisher"))) else old_pub

            new_esrb = esrb_str or existing.get("esrb_rating") or ""
            new_players = players_int if players_int > 0 else int(existing.get("players") or 0)
            new_coop = coop_str or existing.get("coop") or ""
            new_alts = alts_str or existing.get("alternates") or ""

            old_box = existing["box_art_2d"] or ""
            new_box = box_art if (not old_box or "libretro-thumbnails" in old_box or "thumb/boxart/front/" in old_box) else old_box
            new_box3d = new_box
            old_backdrop = existing["backdrop"] or ""
            new_backdrop = backdrop_art if (not old_backdrop or old_backdrop == old_box or "thumb/boxart/" in old_backdrop) else old_backdrop
            old_screens = existing.get("screenshots") or "[]"
            new_screens = screens_json if (screens_json != "[]" and (not old_screens or old_screens == "[]")) else old_screens

            old_trailer = existing.get("trailer_url") or ""
            new_trailer = (
                trailer_embed
                if (trailer_embed and (not old_trailer or "listType=search" in old_trailer))
                else old_trailer
            )
            if (
                new_desc != existing["description"]
                or new_year != existing["release_year"]
                or new_rel_date != (existing.get("release_date") or "")
                or new_genre != old_genre
                or new_genres_list != (existing.get("genres_list") or "")
                or new_dev != old_dev
                or new_pub != old_pub
                or new_esrb != (existing.get("esrb_rating") or "")
                or new_players != int(existing.get("players") or 0)
                or new_coop != (existing.get("coop") or "")
                or new_alts != (existing.get("alternates") or "")
                or new_box != existing["box_art_2d"]
                or new_backdrop != old_backdrop
                or new_screens != old_screens
                or new_trailer != old_trailer
            ):
                updates.append((
                    new_desc, new_year, new_rel_date, new_genre, new_genres_list,
                    new_dev, new_pub, new_esrb, new_players, new_coop, new_alts,
                    new_box, new_box3d, new_backdrop, new_screens, new_trailer,
                    existing["id"],
                ))
                per_plat_updated[plat] = per_plat_updated.get(plat, 0) + 1
        else:
            row_id = f"{plat.lower()}-tgdb-{gid}"
            slug = re.sub(r"[^a-z0-9]+", "-", gtitle.lower()).strip("-") or row_id
            desc_final = overview or f"{gtitle} for {display_platform}."
            final_genre = genre or "Uncategorized"
            final_genres_list = genres_list or f"|{final_genre}|"
            inserts.append((
                row_id,
                gtitle,
                slug,
                plat,
                display_platform,
                final_genre,
                final_genres_list,
                year,
                rel_date,
                dev_str,
                pub_str,
                esrb_str,
                players_int,
                coop_str,
                alts_str,
                desc_final,
                box_art,
                box_art,
                backdrop_art,
                trailer_embed,
                screens_json,
                plat.lower(),
            ))
            per_plat_imported[plat] = per_plat_imported.get(plat, 0) + 1

    if updates:
        cursor.executemany(
            """
            UPDATE games SET
                description = ?, release_year = ?, release_date = ?,
                genre = ?, genres_list = ?, developer = ?, publisher = ?,
                esrb_rating = ?, players = ?, coop = ?, alternates = ?,
                box_art_2d = ?, box_art_3d = ?, backdrop = ?, screenshots = ?, trailer_url = ?
            WHERE id = ?
            """,
            updates,
        )
    if inserts:
        cursor.executemany(
            """
            INSERT OR IGNORE INTO games (
                id, title, slug, platform, platform_name, genre, genres_list,
                release_year, release_date, developer, publisher,
                esrb_rating, players, coop, alternates,
                description, box_art_2d, box_art_3d, backdrop, trailer_url, screenshots, rom_format, is_featured
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            inserts,
        )

    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM games")
    total_catalog_games = int(cursor.fetchone()[0])
    cursor.execute("SELECT COUNT(DISTINCT platform) FROM games")
    total_platforms_in_db = int(cursor.fetchone()[0])
    conn.close()

    from ..database import rebuild_fast_catalog_indexes
    from ..routers.games import invalidate_catalog_meta_cache
    rebuild_fast_catalog_indexes(force=True)
    invalidate_catalog_meta_cache()

    synced_plat_codes = sorted(discovered_platforms.keys())
    results = [
        {
            "platform": p,
            "platform_name": discovered_platforms.get(p, TGDB_PLATFORM_DISPLAY_NAMES.get(p, p)),
            "status": "ok",
            "imported": per_plat_imported.get(p, 0),
            "updated": per_plat_updated.get(p, 0),
        }
        for p in synced_plat_codes
    ]

    return {
        "status": "ok",
        "source": "thegamesdb_static_dump",
        "api_calls_used": 0,
        "scope": "modern" if modern_only else "all",
        "platforms_synced": len(synced_plat_codes),
        "total_platforms_targeted": len(synced_plat_codes),
        "total_platforms_in_catalog": total_platforms_in_db,
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
