import asyncio
import html
import json
import re
import time
import unicodedata
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

import httpx
from bs4 import BeautifulSoup

from ..database import get_db_connection
from .realdebrid_service import DEBRID_HOSTER_DOMAINS, is_hoster_url, is_realdebrid_active

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

SUPPORTED_ADAPTERS = (
    "archive_org",
    "wp_hoster",
    "wp_ajax_cdn",
    "slug_cdn",
    "platform_listing_token",
    "html_search",
    "directory_link",
)

ARCHIVE_PLATFORM_QUERIES: Dict[str, str] = {
    "SNES": '(SNES OR "Super Nintendo")',
    "NES": '(NES OR "Nintendo Entertainment System")',
    "N64": '(N64 OR "Nintendo 64")',
    "GBA": '(GBA OR "Game Boy Advance")',
    "GBC": '(GBC OR "Game Boy Color")',
    "GB": '("Game Boy" OR GB)',
    "NDS": '("Nintendo DS" OR NDS)',
    "3DS": '("Nintendo 3DS" OR 3DS)',
    "GameCube": '(GameCube OR GCN)',
    "Wii": '("Nintendo Wii" OR Wii)',
    "WiiU": '("Wii U" OR WiiU)',
    "Switch": '("Nintendo Switch" OR Switch)',
    "Switch2": '("Switch 2" OR "Nintendo Switch 2")',
    "PS1": '(PS1 OR PSX OR PlayStation)',
    "PS2": '(PS2 OR "PlayStation 2")',
    "PS3": '(PS3 OR "PlayStation 3")',
    "PS4": '(PS4 OR "PlayStation 4")',
    "PS5": '(PS5 OR "PlayStation 5")',
    "PSP": '(PSP OR "PlayStation Portable")',
    "PSVita": '(PSVita OR "PS Vita" OR Vita)',
    "Xbox": 'Xbox',
    "Xbox360": '("Xbox 360" OR Xbox360)',
    "Windows": '(Windows OR PC OR DOS OR "MS-DOS")',
    "macOS": '(Macintosh OR Mac OR macOS OR OSX)',
    "Genesis": '(Genesis OR "Mega Drive")',
    "SegaCD": '("Sega CD" OR "Mega CD")',
    "Saturn": 'Saturn',
    "Dreamcast": 'Dreamcast',
    "MasterSystem": '"Master System"',
    "GameGear": '"Game Gear"',
    "Arcade": '(Arcade OR MAME)',
    "NeoGeo": '"Neo Geo"',
    "TG16": '(TurboGrafx OR "PC Engine")',
    "Atari2600": '"Atari 2600"',
    "Atari5200": '"Atari 5200"',
    "Atari7800": '"Atari 7800"',
    "C64": '("Commodore 64" OR C64)',
    "WonderSwan": 'WonderSwan',
    "WonderSwanColor": 'WonderSwan',
}

ARCHIVE_ROM_EXTS = (
    ".zip", ".7z", ".rar", ".sfc", ".smc", ".nes", ".z64", ".n64", ".v64",
    ".gba", ".gbc", ".gb", ".nds", ".3ds", ".cia", ".iso", ".chd",
    ".rvz", ".cso", ".pbp", ".bin", ".nsp", ".xci", ".nsz", ".vpk",
    ".pkg", ".md", ".gen", ".sms", ".gg", ".pce", ".a26", ".a78",
    ".ws", ".wsc", ".rom", ".dmg", ".exe", ".msi", ".img", ".toast", ".sit",
)


def _safe_json_loads(raw: Optional[str], default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _normalize_platforms(raw: Any) -> List[str]:
    if isinstance(raw, list):
        items = [str(p).strip() for p in raw if str(p).strip()]
    elif isinstance(raw, str):
        items = [p.strip() for p in raw.split(",") if p.strip()]
    else:
        items = []
    return items


def _row_to_source_dict(row: Any) -> Dict[str, Any]:
    d = dict(row)
    platforms = _safe_json_loads(d.get("platforms"), [])
    if not isinstance(platforms, list):
        platforms = []
    config = _safe_json_loads(d.get("config_json"), {})
    if not isinstance(config, dict):
        config = {}
    return {
        "id": d["id"],
        "name": d["name"],
        "url": d["url"],
        "adapter": d.get("adapter") or "html_search",
        "type": d.get("source_type") or "User Mirror Source",
        "source_type": d.get("source_type") or "User Mirror Source",
        "description": d.get("description") or "",
        "platforms": platforms,
        "search_template": d.get("search_template") or "",
        "supports_direct_download": bool(d.get("supports_direct_download")),
        "config": config,
        "priority": int(d.get("priority") if d.get("priority") is not None else 50),
        "is_enabled": bool(d.get("is_enabled")),
        "created_at": d.get("created_at"),
    }


def list_mirror_sources(enabled_only: bool = False) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    if enabled_only:
        cursor.execute(
            "SELECT * FROM custom_mirror_sources WHERE is_enabled = 1 ORDER BY priority ASC, created_at ASC"
        )
    else:
        cursor.execute("SELECT * FROM custom_mirror_sources ORDER BY priority ASC, created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    return [_row_to_source_dict(r) for r in rows]


def get_mirror_source(source_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM custom_mirror_sources WHERE id = ?", (source_id,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_source_dict(row) if row else None


def add_or_update_mirror_source(payload: Dict[str, Any]) -> Dict[str, Any]:
    name = (payload.get("name") or "").strip()
    url = (payload.get("url") or "").strip()
    adapter = (payload.get("adapter") or "html_search").strip()

    if not name or not url:
        raise ValueError("Source name and URL are required")
    if not url.startswith(("http://", "https://")):
        raise ValueError("Source URL must start with http:// or https://")
    if adapter not in SUPPORTED_ADAPTERS:
        raise ValueError(f"Unsupported adapter '{adapter}'. Must be one of: {', '.join(SUPPORTED_ADAPTERS)}")

    raw_id = (payload.get("id") or "").strip()
    base_slug = re.sub(r"[^a-z0-9-]+", "-", (raw_id or name).lower()).strip("-") or "byos-source"
    source_id = base_slug

    source_type = (payload.get("source_type") or payload.get("type") or f"BYOS ({adapter})").strip()
    description = (payload.get("description") or "").strip()
    platforms = _normalize_platforms(payload.get("platforms"))
    search_template = (payload.get("search_template") or "").strip()

    if "supports_direct_download" in payload and payload.get("supports_direct_download") is not None:
        supports_direct = bool(payload.get("supports_direct_download"))
    else:
        supports_direct = adapter in ("archive_org", "wp_ajax_cdn", "slug_cdn", "platform_listing_token")

    cfg = payload.get("config")
    if isinstance(cfg, str):
        cfg = _safe_json_loads(cfg, {})
    if not isinstance(cfg, dict):
        cfg = {}

    try:
        priority = int(payload.get("priority", 50))
    except (TypeError, ValueError):
        priority = 50
    is_enabled = bool(payload.get("is_enabled", True))

    conn = get_db_connection()
    cursor = conn.cursor()
    if not raw_id:
        cursor.execute("SELECT 1 FROM custom_mirror_sources WHERE id = ?", (source_id,))
        if cursor.fetchone():
            import uuid
            source_id = f"{base_slug[:48]}-{uuid.uuid4().hex[:4]}"
    cursor.execute(
        """
        INSERT OR REPLACE INTO custom_mirror_sources (
            id, name, url, adapter, source_type, description, platforms,
            search_template, supports_direct_download, config_json, priority, is_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source_id,
            name,
            url,
            adapter,
            source_type,
            description,
            json.dumps(platforms),
            search_template,
            1 if supports_direct else 0,
            json.dumps(cfg),
            priority,
            1 if is_enabled else 0,
        ),
    )
    conn.commit()
    cursor.execute("SELECT * FROM custom_mirror_sources WHERE id = ?", (source_id,))
    saved = cursor.fetchone()
    conn.close()
    return _row_to_source_dict(saved)


def delete_mirror_source(source_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM custom_mirror_sources WHERE id = ?", (source_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def toggle_mirror_source(source_id: str) -> Optional[bool]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_enabled FROM custom_mirror_sources WHERE id = ?", (source_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    new_state = 0 if row["is_enabled"] else 1
    cursor.execute("UPDATE custom_mirror_sources SET is_enabled = ? WHERE id = ?", (new_state, source_id))
    conn.commit()
    conn.close()
    return bool(new_state)


def find_referer_for_url(url: str) -> Optional[str]:
    """Finds a matching Referer header from the user's configured BYOS mirror sources or their CDN domains."""
    if not url:
        return None
    target_host = (urllib.parse.urlparse(url).netloc or "").lower().split(":")[0]
    if not target_host:
        return None

    for src in list_mirror_sources(enabled_only=False):
        src_url = src.get("url") or ""
        src_host = (urllib.parse.urlparse(src_url).netloc or "").lower().split(":")[0]
        src_root = src_host[4:] if src_host.startswith("www.") else src_host
        if src_root and (target_host == src_host or target_host == src_root or target_host.endswith(f".{src_root}")):
            return src_url

        cdn_domains = (src.get("config") or {}).get("cdn_domains") or []
        for dom in cdn_domains:
            d_clean = str(dom).lower().strip()
            if d_clean and (target_host == d_clean or target_host.endswith(f".{d_clean}")):
                return src_url
    return None


def import_source_pack(pack: Any) -> Dict[str, Any]:
    """
    Imports a BYOS JSON source pack containing mirror_sources, providers, and/or search_templates.
    """
    from ..scrapers.providers.manager import add_custom_provider, add_search_template

    if isinstance(pack, list):
        pack_dict = {"mirror_sources": pack}
    elif isinstance(pack, dict):
        pack_dict = pack
    else:
        raise ValueError("Source pack must be a JSON object or array")

    imported_mirrors = 0
    imported_providers = 0
    imported_templates = 0

    for src in pack_dict.get("mirror_sources") or []:
        if isinstance(src, dict) and src.get("name") and src.get("url"):
            add_or_update_mirror_source(src)
            imported_mirrors += 1

    for prov in pack_dict.get("providers") or []:
        if isinstance(prov, dict) and prov.get("name") and prov.get("endpoint_url"):
            add_custom_provider(
                name=prov["name"],
                endpoint_url=prov["endpoint_url"],
                api_key=prov.get("api_key", ""),
                provider_type=prov.get("type", "torznab"),
                config=prov.get("config"),
                provider_id=prov.get("id"),
                is_enabled=prov.get("is_enabled", True),
            )
            imported_providers += 1

    for tpl in pack_dict.get("search_templates") or []:
        if isinstance(tpl, dict) and tpl.get("name") and tpl.get("url_template"):
            if "{title}" in tpl["url_template"]:
                add_search_template(
                    name=tpl["name"],
                    url_template=tpl["url_template"],
                    description=tpl.get("description", ""),
                    template_id=tpl.get("id"),
                    is_enabled=tpl.get("is_enabled", True),
                )
                imported_templates += 1

    return {
        "status": "ok",
        "imported_mirrors": imported_mirrors,
        "imported_providers": imported_providers,
        "imported_templates": imported_templates,
    }


def export_source_pack() -> Dict[str, Any]:
    """Exports all configured BYOS mirror sources, providers (redacting secrets), and web search templates."""
    from ..scrapers.providers.manager import get_all_providers, get_search_templates

    mirrors = []
    for s in list_mirror_sources(enabled_only=False):
        mirrors.append({
            "id": s["id"],
            "name": s["name"],
            "url": s["url"],
            "adapter": s["adapter"],
            "type": s["source_type"],
            "description": s["description"],
            "platforms": s["platforms"],
            "search_template": s["search_template"],
            "supports_direct_download": s["supports_direct_download"],
            "priority": s["priority"],
            "is_enabled": s["is_enabled"],
            "config": s["config"],
        })

    providers = []
    for p in get_all_providers():
        providers.append({
            "id": p["id"],
            "name": p["name"],
            "type": p["type"],
            "endpoint_url": p["endpoint_url"],
            "api_key": "",
            "is_enabled": p["is_enabled"],
            "config": p.get("config") or {},
        })

    templates = []
    for t in get_search_templates():
        templates.append({
            "id": t["id"],
            "name": t["name"],
            "url_template": t["url_template"],
            "description": t.get("description") or "",
            "is_enabled": bool(t.get("is_enabled", 1)),
        })

    return {
        "version": 1,
        "mirror_sources": mirrors,
        "providers": providers,
        "search_templates": templates,
    }


def clean_title_for_search(title: str) -> str:
    """Removes region tags, parentheses, brackets, inverted articles, apostrophes, and revision codes for fuzzy matching."""
    s = re.sub(r"\(.*?\)", "", title or "")
    s = re.sub(r"\[.*?\]", "", s)
    s = re.sub(r"(USA|Europe|Japan|En,Fr,De|Rev \d|v\d\.\d+)", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^([^,]+),\s*(The|A|An)\b", r"\2 \1", s.strip(), flags=re.IGNORECASE)
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[:\-_/]", " ", s)
    return " ".join(s.split()).strip()


_ROMAN_NUMERAL_MAP: Dict[str, str] = {
    "ii": "2",
    "iii": "3",
    "iv": "4",
    "v": "5",
    "vi": "6",
    "vii": "7",
    "viii": "8",
    "ix": "9",
    "x": "10",
    "xi": "11",
    "xii": "12",
    "xiii": "13",
    "xiv": "14",
    "xv": "15",
    "xvi": "16",
}

_MATCH_STOPWORDS = {
    "the", "a", "an", "and", "of", "for", "in", "on", "to", "with", "at", "by", "from", "edition", "version",
}

_EDITION_MODIFIERS = {
    "deluxe", "ultimate", "complete", "goty", "definitive", "remastered", "remake",
    "hd", "special", "anniversary", "gold", "platinum", "plus", "shareware",
    "classic", "masterpiece", "directors", "director", "cut", "expanded", "enhanced",
    "standard", "digital", "launch", "collectors", "collector",
}

_RELEASE_FORMAT_TOKENS = {
    "nsp", "xci", "nsz", "pkg", "cia", "vpk", "dmg", "iso", "rvz", "chd", "cso", "pbp",
    "repack", "fitgirl", "dodi", "gog", "multilanguage", "ps5", "ps4", "ps3", "ps2", "ps1", "psx",
    "psp", "psvita", "xbox360", "3ds", "2ds", "nds", "wiiu", "n64", "snes", "nes", "gba", "gbc",
    "nsw", "switch2", "macos", "macintosh", "pc", "dos", "eur", "usa", "jpn", "decrypted",
    "trimmed", "fullrip", "scene", "backport", "patch", "update", "dlc", "addon",
}

_OPTIONAL_PLATFORM_WORDS = {
    "switch", "nintendo", "playstation", "xbox", "wii", "gamecube", "mac", "windows", "vita", "roms", "rom",
}

_PUBLISHER_PREFIXES = (
    ("ea", "sports"),
    ("ea", "games"),
    ("2k", "sports"),
    ("tom", "clancys"),
    ("sid", "meiers"),
    ("clive", "barkers"),
    ("american", "mcgees"),
)

_ACRONYM_EXPANSIONS: Dict[str, Tuple[str, ...]] = {
    "gta": ("grand", "theft", "auto"),
    "cod": ("call", "of", "duty"),
    "acnh": ("animal", "crossing", "new", "horizons"),
    "smw": ("super", "mario", "world"),
    "botw": ("breath", "of", "the", "wild"),
    "totk": ("tears", "of", "the", "kingdom"),
}

_CONTEXT_ACRONYMS: Dict[str, Tuple[str, ...]] = {
    "mk": ("mortal", "kombat"),
    "re": ("resident", "evil"),
    "sf": ("street", "fighter"),
    "ff": ("final", "fantasy"),
}

_GENERIC_NAV_LABELS = {
    "home", "roms", "games", "exclusives", "category", "archive", "downloads",
    "download", "featured", "trending", "popular", "latest", "random", "all games",
    "list game", "mario", "zelda", "pokemon",
}

_ROUNDUP_RE = re.compile(
    r"\b(?:dlc|updates?)\b.*\b(?:january|february|march|april|may|june|july|august|september|october|november|december|202\d)\b",
    re.IGNORECASE,
)

_BAD_MARKER_RE = re.compile(
    r"\b(?:guide\s+install|how\s+to\s+install|install\s+guide|walkthrough|soundtrack|original\s+score|artbook|wallpaper|firmware|prod\.keys|title\.keys|sequel\s+to|all\s+games\s+list|list\s+game|complete\s+collection|rom\s+pack|full\s+set|best\s+of)\b",
    re.IGNORECASE,
)

_PRESERVED_COMPOUND_RE = re.compile(
    r"\b(ps[1-5x]|xbox360|switch2|wiiu|n64|3ds|2ds|3do|c64|x64|x86|2k\d{2}|3d|2d|4k|f1)\b",
    re.IGNORECASE,
)


def _fold_ascii(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def _raw_alpha_words(text: str) -> set:
    folded = _fold_ascii(text).lower()
    return set(re.findall(r"[a-z0-9]+", folded))


_PLATFORM_EDITION_RE = re.compile(
    r"(?:-|–|:)?\s*\b(?:nintendo\s+switch\s+2|nintendo\s+switch|switch\s*2|wii\s*u|wii|ps[345]|xbox(?:\s*360)?|pc|mac(?:os)?)\s+edition\b",
    re.IGNORECASE,
)


def _strip_platform_edition(text: str) -> str:
    return _PLATFORM_EDITION_RE.sub(" ", text or "").strip()


def _extract_match_tokens(
    raw_title: str,
    preserve_words: Optional[set] = None,
    preserve_years: Optional[set] = None,
    strip_editions: bool = True,
) -> Tuple[List[str], set]:
    """
    Normalizes a game/release title into (core_word_tokens, sequel_number_tokens).
    Splits glued digits/camelCase, normalizes Roman numerals, strips release boilerplate,
    and isolates sequel numbers cleanly.
    """
    if not raw_title:
        return ([], set())

    p_words = preserve_words or set()
    p_years = preserve_years or set()

    s = _fold_ascii(raw_title).strip()
    # Strip file extensions at the end of filenames
    s = re.sub(
        r"\.(?:zip|7z|rar|nsp|xci|nsz|pkg|iso|chd|rvz|cia|3ds|vpk|dmg|exe|msi|toast|img|sfc|smc|nes|gba|gbc|gb|nds|z64|n64|rom|bin|cue|cso|pbp)$",
        "",
        s,
        flags=re.IGNORECASE,
    )
    # Strip leading No-Intro / archive catalog serial prefixes like "0123 - Super Mario World"
    s = re.sub(r"^\s*\d{3,4}\s*[-_.]\s*", "", s)
    # Move inverted articles before stripping brackets: "Legend of Zelda, The (USA)"
    m_inv = re.match(r"^([^(\[,]+?),\s*(The|A|An)\b(.*)$", s, flags=re.IGNORECASE)
    if m_inv:
        s = f"{m_inv.group(2)} {m_inv.group(1)} {m_inv.group(3)}".strip()

    # Strip bracketed/parenthesized release metadata
    s = re.sub(r"\[[^\]]*\]", " ", s)
    s = re.sub(r"\([^\)]*\)", " ", s)

    # Strip explicit platform edition suffixes ("- Wii Edition", "- Nintendo Switch 2 Edition")
    s = _strip_platform_edition(s)

    # Strip release phrases & multi-word platform tags outside parens when not in query
    s = re.sub(
        r"\b(?:free\s+download|direct\s+download|rom\s+download|full\s+game|base\s+game(?:\s+pkg)?|update\s*\+?\s*dlc|switch\s+nsp(?:/xci)?)\b",
        " ",
        s,
        flags=re.IGNORECASE,
    )
    if "playstation" not in p_words:
        s = re.sub(r"\bplaystation\s*[1-5]\b", " ", s, flags=re.IGNORECASE)
    if "xbox" not in p_words:
        s = re.sub(r"\bxbox\s*(?:360|one|series\s*[xs])\b", " ", s, flags=re.IGNORECASE)
    if "switch" not in p_words and "2" not in p_words:
        s = re.sub(r"\b(?:nintendo\s+)?switch\s+2\b", " ", s, flags=re.IGNORECASE)

    # Strip software versions, firmware requirements, disc indicators, multi-lang counts
    s = re.sub(r"\b(?:v|ver|version|patch)\s*\d+(?:\.\d+){1,4}[a-z]?\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\bv\d+\.\d+\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\bfw\s*\d+(?:\.\d+)?\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\bmulti\s*\d+\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\bbuild\s*\d+\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\bdisc\s*\d+(?:\s*of\s*\d+)?\b", " ", s, flags=re.IGNORECASE)

    # Split camelCase before lowering, preserving compounds like Switch2/PS5/N64/3DS/2K25
    protected: List[str] = []

    def _protect(m: re.Match) -> str:
        idx = len(protected)
        protected.append(m.group(0).lower())
        tag = "".join(chr(65 + int(d)) for d in f"{idx:03d}")
        return f" XPROTX{tag}X "

    s = _PRESERVED_COMPOUND_RE.sub(_protect, s)
    s = re.sub(r"([a-z0-9])['’`]+s\b", r"\1s", s, flags=re.IGNORECASE)
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = re.sub(r"([A-Za-z])(\d)", r"\1 \2", s)
    s = re.sub(r"(\d)([A-Za-z])", r"\1 \2", s)
    for idx, val in enumerate(protected):
        tag = "".join(chr(65 + int(d)) for d in f"{idx:03d}")
        s = re.sub(rf"xprotx{tag}x", val, s, flags=re.IGNORECASE)

    s = re.sub(r"[^a-zA-Z0-9]+", " ", s).lower().strip()
    raw_tokens = [tok for tok in s.split() if tok]

    # Merge isolated 's' from hyphenated possessives (e.g. yoshi-s-island -> yoshis island)
    merged: List[str] = []
    for tok in raw_tokens:
        if tok == "s" and merged and len(merged[-1]) >= 3 and merged[-1].isalpha():
            merged[-1] = merged[-1] + "s"
        else:
            merged.append(tok)

    # Convert standalone Roman numerals at index > 0 into digits
    normalized: List[str] = []
    for idx, tok in enumerate(merged):
        if idx > 0 and tok in _ROMAN_NUMERAL_MAP:
            if tok == "x" and idx + 1 < len(merged) and merged[idx - 1] == merged[idx + 1]:
                normalized.append(tok)
            else:
                normalized.append(_ROMAN_NUMERAL_MAP[tok])
        else:
            normalized.append(tok)

    core_tokens: List[str] = []
    num_tokens: set = set()

    for tok in normalized:
        if tok in _MATCH_STOPWORDS:
            continue
        if tok in _RELEASE_FORMAT_TOKENS and tok not in p_words:
            continue
        if tok in _OPTIONAL_PLATFORM_WORDS and tok not in p_words:
            continue
        if strip_editions and tok in _EDITION_MODIFIERS and tok not in p_words:
            continue

        # Year check (1970-2035)
        if tok.isdigit() and 1970 <= int(tok) <= 2035:
            if tok in p_years:
                num_tokens.add(tok)
            continue

        # Sports / sequel identifiers like 2k24, 2k25 or small sequel digits 1..99
        if re.fullmatch(r"2k\d{2}", tok):
            num_tokens.add(tok)
            continue

        if tok.isdigit():
            val = str(int(tok))
            if int(val) <= 999:
                num_tokens.add(val)
            continue

        core_tokens.append(tok)

    return (core_tokens, num_tokens)


def _expand_acronyms(tokens: List[str], counterpart_tokens: List[str]) -> List[str]:
    out: List[str] = []
    cp_set = set(counterpart_tokens)
    for tok in tokens:
        if tok in _ACRONYM_EXPANSIONS:
            out.extend(_ACRONYM_EXPANSIONS[tok])
        elif tok in _CONTEXT_ACRONYMS and all(w in cp_set for w in _CONTEXT_ACRONYMS[tok]):
            out.extend(_CONTEXT_ACRONYMS[tok])
        else:
            out.append(tok)
    return out


def title_matches_game(
    query_title: str,
    candidate_title: str,
    candidate_filename: str = "",
    platform: Optional[str] = None,
    strict: bool = True,
) -> Tuple[bool, float]:
    """
    Evaluates whether a scraped release title matches the requested game title.
    Enforces whole-word boundary matching, Roman numeral & acronym normalization,
    strict sequel/number isolation, and unrelated prefix/extra-word rejection.
    Returns (is_match, relevance_score_0_to_1).
    """
    q_raw = (query_title or "").strip()
    if not q_raw:
        return (False, 0.0)

    c_primary = (candidate_title or "").strip()
    if not c_primary:
        c_primary = (candidate_filename or "").strip()
    if not c_primary:
        return (False, 0.0)

    q_lower = _fold_ascii(q_raw).lower()
    c_lower = _fold_ascii(c_primary).lower()
    combo_lower = f"{c_lower} {_fold_ascii(candidate_filename).lower()}".strip()

    # Reject roundup / guide / soundtrack / firmware posts unless explicitly requested
    if _ROUNDUP_RE.search(c_lower) and not _ROUNDUP_RE.search(q_lower):
        return (False, 0.0)
    if _BAD_MARKER_RE.search(c_lower) and not _BAD_MARKER_RE.search(q_lower):
        return (False, 0.0)

    # Reject generic navigation / hub labels unless the user literally searched that label
    c_clean_label = re.sub(r"[^a-z0-9 ]+", "", c_lower).strip()
    q_clean_label = re.sub(r"[^a-z0-9 ]+", "", q_lower).strip()
    if c_clean_label in _GENERIC_NAV_LABELS and c_clean_label != q_clean_label:
        return (False, 0.0)

    q_canon = _strip_platform_edition(q_raw) or q_raw
    p_words = _raw_alpha_words(q_canon)
    p_years = set(re.findall(r"\b(?:19[7-9]\d|20[0-3]\d)\b", q_lower))

    q_core, q_nums = _extract_match_tokens(q_canon, preserve_words=p_words, preserve_years=p_years, strip_editions=False)
    c_core, c_nums = _extract_match_tokens(c_primary, preserve_words=p_words, preserve_years=p_years, strip_editions=True)

    # Check filename tokens as fallback or sequel-number disambiguation (e.g. title="Doom", filename="Doom2.zip")
    if candidate_filename and candidate_filename != c_primary:
        fn_core, fn_nums = _extract_match_tokens(candidate_filename, preserve_words=p_words, preserve_years=p_years, strip_editions=True)
        if not c_core and fn_core:
            c_core = fn_core
            c_nums = fn_nums
        elif not c_nums and fn_nums and (not fn_core or set(fn_core) == set(c_core)):
            c_nums = fn_nums

    if not q_core and not q_nums:
        return (False, 0.0)

    # Expand acronyms symmetrically so "GTA V" <-> "Grand Theft Auto 5"
    q_exp = _expand_acronyms(q_core, c_core)
    c_exp = _expand_acronyms(c_core, q_core)
    q_exp = _expand_acronyms(q_exp, c_exp)

    if not c_exp and not c_nums:
        return (False, 0.0)

    # Allow optional leading publisher prefix in query (e.g., "EA Sports UFC 5" matching "UFC 5")
    q_required = list(q_exp)
    if len(q_exp) >= 3 and tuple(q_exp[:2]) in _PUBLISHER_PREFIXES:
        if not all(p in c_exp for p in q_exp[:2]):
            q_required = q_exp[2:]

    # In free-form browse mode (strict=False), require all core query tokens + matching numbers if any specified
    c_set = set(c_exp)
    if not strict:
        matched_q = [w for w in q_required if w in c_set]
        if len(matched_q) < len(q_required):
            return (False, 0.0)
        if q_nums and not q_nums.issubset(c_nums):
            return (False, 0.0)
        ratio = len(q_required) / max(len(c_exp), 1)
        return (True, round(min(1.0, 0.65 + 0.35 * ratio), 3))

    # --- STRICT EXACT-GAME MODE ---
    # 1. Strict sequel number isolation
    if q_nums:
        if q_nums != c_nums:
            return (False, 0.0)
    else:
        # Query has no sequel number -> reject candidates that add sequel numbers (2, 3, 4, 64, ...)
        extra_nums = c_nums - {"1"}
        if extra_nums:
            return (False, 0.0)

    if not q_required:
        # Pure numeric title fallback (e.g. "2048")
        return (True, 1.0) if q_nums == c_nums else (False, 0.0)

    # 2. Exact whole-word core token coverage
    matched_count = sum(1 for w in q_required if w in c_set)
    if len(q_required) >= 5:
        if matched_count / len(q_required) < 0.8 or not all(w in c_set for w in q_required[:2]):
            return (False, 0.0)
    else:
        if matched_count < len(q_required):
            return (False, 0.0)

    # 3. Prefix Anchor Check: reject unrelated titles that happen to contain query at the end
    #    e.g., "Indiana Jones and the Temple of Doom" for "Doom"
    first_match_idx = None
    q_req_set = set(q_required)
    for idx, tok in enumerate(c_exp):
        if tok in q_req_set:
            first_match_idx = idx
            break
    if first_match_idx is None or first_match_idx > 0:
        return (False, 0.0)

    # 4. Extra-Word Precision Check: reject sequels/spinoffs/other subtitles when not in query
    extra_words = len([w for w in c_exp if w not in q_req_set])
    n_q = len(q_required)
    n_c = len(c_exp)
    if n_q == 1:
        if n_c != 1:
            return (False, 0.0)
    elif n_q == 2:
        if n_c > 3 or (n_q / max(n_c, 1)) < 0.66:
            return (False, 0.0)
    else:
        if (n_q / max(n_c, 1)) < 0.55 and extra_words > 2:
            return (False, 0.0)

    # Compute normalized confidence score
    exact_seq = 1.0 if q_required == c_exp else (matched_count / max(n_c, n_q))
    bonus = 0.05 if (platform and platform.lower() in combo_lower) else 0.0
    score = min(1.0, round(0.75 + 0.25 * exact_seq + bonus, 3))
    return (True, score)


def _classify_release_stream(anchor_text: str, href: str, platform: str, is_pkg: bool = False) -> tuple:
    """Classifies a release anchor/URL into (stream_type, extension) for Base Game / Update / DLC / Backport."""
    combined = f"{anchor_text} {href}".lower()
    plat_up = (platform or "").upper()
    is_base_explicit = bool(re.search(r"\bbase\b", combined))

    if is_pkg or plat_up in ("PS3", "PS4", "PS5"):
        ext = ".pkg"
        if plat_up == "PS5":
            for cand_ext in (".zip", ".7z", ".rar"):
                if cand_ext in combined:
                    ext = cand_ext
                    break
        fmt_label = ext.lstrip(".").upper()
        if "dlc" in combined or "addon" in combined or "add-on" in combined:
            return (f"DLC {fmt_label}", ext)
        if "backport" in combined or "fix" in combined:
            return (f"Backport / Fix {fmt_label}", ext)
        if "update" in combined or "patch" in combined or (re.search(r"\bv\d+\.\d+", combined) and not is_base_explicit):
            return (f"Update {fmt_label}", ext)
        return (f"Base Game {fmt_label}", ext)

    if plat_up == "WINDOWS":
        ext = ".zip"
        for cand_ext in (".iso", ".7z", ".rar", ".exe", ".msi"):
            if cand_ext in combined:
                ext = cand_ext
                break
        fmt_label = ext.lstrip(".").upper()
        if "dlc" in combined or "addon" in combined or "add-on" in combined:
            return (f"DLC {fmt_label}", ext)
        if "update" in combined or "patch" in combined or (re.search(r"\bv\d+\.\d+", combined) and not is_base_explicit):
            return (f"Update {fmt_label}", ext)
        return (f"Base Game {fmt_label}", ext)

    if plat_up == "MACOS":
        ext = ".dmg"
        for cand_ext in (".pkg", ".zip", ".7z", ".rar", ".iso"):
            if cand_ext in combined:
                ext = cand_ext
                break
        fmt_label = ext.lstrip(".").upper()
        if "dlc" in combined or "addon" in combined or "add-on" in combined:
            return (f"DLC {fmt_label}", ext)
        if "update" in combined or "patch" in combined or (re.search(r"\bv\d+\.\d+", combined) and not is_base_explicit):
            return (f"Update {fmt_label}", ext)
        return (f"Base Game {fmt_label}", ext)

    if plat_up == "3DS":
        ext = ".3ds" if ".3ds" in combined or "decrypted" in combined else ".cia"
    elif plat_up == "PSVITA":
        ext = ".vpk"
    elif ".xci" in combined or "xci" in (anchor_text or "").lower():
        ext = ".xci"
    elif ".nsz" in combined or "nsz" in (anchor_text or "").lower():
        ext = ".nsz"
    else:
        ext = ".nsp"

    fmt_label = ext.lstrip(".").upper()
    if "dlc" in combined or "addon" in combined or "add-on" in combined:
        return (f"DLC {fmt_label}", ext)
    if "update" in combined or "patch" in combined or (re.search(r"\bv\d+\.\d+", combined) and not is_base_explicit):
        return (f"Update {fmt_label}", ext)
    return (f"Base Game {fmt_label}", ext)


def _extract_hoster_links(
    soup: BeautifulSoup,
    post_title: str,
    post_url: str,
    platform: str,
    source_id: str,
    source_label: str,
    limit: int,
    is_pkg: bool = False,
) -> List[Dict[str, Any]]:
    """Extracts Real-Debrid-compatible hoster links from a post page, classified by Base/Update/DLC."""
    extracted: List[Dict[str, Any]] = []
    seen_dl = set()
    rd_active = is_realdebrid_active()

    for la in soup.find_all("a", href=True):
        lh = html.unescape(la["href"].strip())
        if not lh.startswith("http") or lh in seen_dl:
            continue
        if not is_hoster_url(lh):
            continue
        seen_dl.add(lh)

        lt = la.get_text(" ", strip=True)
        parent_txt = la.parent.get_text(" ", strip=True)[:120] if la.parent else ""
        context_txt = f"{lt} {parent_txt}".strip()
        stream_type, ext = _classify_release_stream(context_txt, lh, platform, is_pkg=is_pkg)

        is_direct = rd_active
        badge = f"⚡ REAL-DEBRID • {stream_type.upper()}" if rd_active else f"🌐 {stream_type.upper()}"

        extracted.append({
            "title": f"{post_title} [{stream_type}]",
            "platform": platform,
            "filename": f"{post_title}_{stream_type.replace(' ', '_').replace('/', '_')}{ext}",
            "direct_url": lh,
            "source_id": source_id,
            "source_name": f"{source_label} [{stream_type}]",
            "quality": f"{platform} {stream_type} ({'Real-Debrid Ready' if rd_active else 'Web Hoster'})",
            "file_size_mb": 0.0,
            "is_direct_downloadable": is_direct,
            "page_url": post_url,
            "badge": badge,
            "badge_color": "cyan" if rd_active else "purple",
        })
        if len(extracted) >= limit:
            break

    return extracted


def _stream_part_rank(title: str, source_name: str) -> int:
    """Orders Base Game (0) ahead of Updates/Patches (1), DLC (2), and Backports/Fixes (3)."""
    combined = f"{source_name} {title}".lower()
    if any(k in combined for k in ("backport", "[fix", "fix pkg", "backport / fix")):
        return 3
    if re.search(r"\b(dlc|addon|add-on)\b", combined):
        return 2
    if re.search(r"\b(update|patch)\b", combined):
        return 1
    return 0


async def _probe_direct_speed(url: str) -> Dict[str, Any]:
    """
    Lightweight 128 KB byte-range speed probe for direct HTTP mirrors.
    Measures latency (TTFB), transfer throughput (MB/s), and Content-Length / Content-Range size.
    """
    try:
        from .downloader import get_download_headers
        headers = get_download_headers(url)
    except Exception:
        headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    headers["Range"] = "bytes=0-131071"

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=2.2, follow_redirects=True, verify=False) as client:
            async with client.stream("GET", url, headers=headers) as resp:
                latency_ms = max(1, round((time.monotonic() - start) * 1000))
                if resp.status_code not in (200, 206):
                    return {"ok": False, "speed_mbps": 0.0, "latency_ms": 9999, "size_mb": 0.0}
                c_type = resp.headers.get("Content-Type", "").lower()
                if any(h in c_type for h in ("text/html", "text/xml", "application/xhtml+xml")):
                    return {"ok": False, "speed_mbps": 0.0, "latency_ms": 9999, "size_mb": 0.0}

                size_mb = 0.0
                c_range = resp.headers.get("Content-Range", "")
                m_range = re.search(r"/(\d+)$", c_range)
                if m_range:
                    total_bytes = int(m_range.group(1))
                    if total_bytes > 0:
                        size_mb = round(total_bytes / (1024 * 1024), 2)
                elif resp.headers.get("Content-Length", "").isdigit():
                    total_bytes = int(resp.headers["Content-Length"])
                    if total_bytes > 0:
                        size_mb = round(total_bytes / (1024 * 1024), 2)

                bytes_read = 0
                t0 = time.monotonic()
                async for chunk in resp.aiter_bytes(32768):
                    bytes_read += len(chunk)
                    if bytes_read >= 131072:
                        break
                if bytes_read <= 0:
                    return {"ok": False, "speed_mbps": 0.0, "latency_ms": 9999, "size_mb": size_mb}

                elapsed = max(time.monotonic() - t0, 0.005)
                speed_mbps = round((bytes_read / (1024 * 1024)) / elapsed, 2)
                return {
                    "ok": True,
                    "speed_mbps": speed_mbps,
                    "latency_ms": latency_ms,
                    "size_mb": size_mb,
                }
    except Exception:
        return {"ok": False, "speed_mbps": 0.0, "latency_ms": 9999, "size_mb": 0.0}


def _rank_mirrors(streams: List[Dict[str, Any]], clean_q: str, rd_active: bool) -> List[Dict[str, Any]]:
    """
    Sorts candidate mirror streams so:
    - With Real-Debrid active: RD hosters #1 -> RD-seeded torrents (by seeds/peers) -> Direct CDNs (by speed/latency) -> 0-seed torrents.
    - Without Real-Debrid: Direct CDNs (verified fastest MB/s first) -> Seeded torrents (by seeds then peers) -> 0-seed torrents -> Locked RD hosters.
    """
    q_low = (clean_q or "").strip().lower()

    def sort_key(s: Dict[str, Any]):
        s_title = (s.get("title") or "").lower()
        title_bucket = 0 if (q_low and q_low in s_title) else 1
        match_neg = -float(s.get("match_score") or 0.0)
        part_rank = _stream_part_rank(s.get("title", ""), s.get("source_name", ""))
        seeders = int(s.get("seeders") or 0)
        peers = int(s.get("peers") if s.get("peers") is not None else seeders)
        speed_mbps = float(s.get("speed_mbps") or 0.0)
        latency_ms = int(s.get("latency_ms") if s.get("latency_ms") is not None else 9999)
        speed_verified = bool(s.get("speed_verified"))
        src_prio = int(s.get("source_priority", 50))
        is_direct_val = bool(s.get("is_direct"))
        is_rd = bool(s.get("is_realdebrid"))
        requires_rd = bool(s.get("requires_realdebrid"))
        is_tor = bool(s.get("is_torrent")) or s.get("format") in ("MAGNET", "TORRENT") or str(s.get("direct_url")).startswith("magnet:")

        if rd_active:
            if is_rd and not is_tor:
                return (0, title_bucket, match_neg, part_rank, src_prio, 0.0, 0)
            if is_rd and is_tor and (seeders > 0 or peers > 0):
                return (1, title_bucket, match_neg, -seeders, -peers, part_rank, src_prio)
            if is_direct_val and not is_rd and not is_tor:
                return (2, title_bucket, match_neg, 0 if speed_verified else 1, -speed_mbps, latency_ms, part_rank)
            if is_tor:
                return (3, title_bucket, match_neg, -peers, src_prio, 0, 0)
            return (4, title_bucket, match_neg, src_prio, 0, 0, 0)

        if is_direct_val and not is_tor and not requires_rd:
            return (0, title_bucket, match_neg, 0 if speed_verified else 1, -speed_mbps, latency_ms, part_rank)
        if is_tor and (seeders > 0 or peers > 0):
            return (1, title_bucket, match_neg, -seeders, -peers, part_rank, src_prio)
        if is_tor:
            return (2, title_bucket, match_neg, -peers, src_prio, 0, 0)
        if requires_rd:
            return (3, title_bucket, match_neg, part_rank, src_prio, 0, 0)
        return (4, title_bucket, match_neg, src_prio, 0, 0, 0)

    ordered = sorted(streams, key=sort_key)
    for idx, s in enumerate(ordered):
        s["rank"] = idx + 1
    return ordered


def _lookup_ci(mapping: Dict[str, Any], key: Optional[str]) -> Any:
    if not mapping or not key:
        return None
    if key in mapping:
        return mapping[key]
    k_low = key.strip().lower()
    for mk, mv in mapping.items():
        if str(mk).strip().lower() == k_low:
            return mv
    return None


def _source_root_host(base_url: str) -> str:
    host = (urllib.parse.urlparse(base_url).netloc or "").lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def _build_search_url(base_url: str, search_path: str, query: str, platform: Optional[str] = None) -> str:
    q_enc = urllib.parse.quote(query)
    p_enc = urllib.parse.quote(platform or "")
    rel = search_path.replace("{query}", q_enc).replace("{title}", q_enc).replace("{platform}", p_enc)
    if rel.startswith(("http://", "https://")):
        return rel
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", rel.lstrip("/"))


class MirrorResolver:
    """
    100% BYOS (Bring Your Own Sources) multi-adapter ROM scraper, mirror resolver, and failover engine.
    All sources are user-configured in the database using generic protocol adapters.
    """

    def __init__(self):
        self.verified_mirror_cache: Dict[str, Dict[str, Any]] = {}

    def get_sources_status(self) -> List[Dict[str, Any]]:
        return list_mirror_sources(enabled_only=False)

    def _source_supports_platform(self, source: Dict[str, Any], platform: Optional[str]) -> bool:
        if not platform:
            return True
        p_up = platform.strip().upper()
        if not p_up or p_up == "ALL":
            return True
        plats = [str(p).strip().upper() for p in (source.get("platforms") or [])]
        if not plats:
            return True
        return "ALL" in plats or "ALL SYSTEMS" in plats or p_up in plats

    async def check_source_health(self, source_id: str) -> Dict[str, Any]:
        """Performs a live latency and status ping against a configured BYOS source."""
        source = get_mirror_source(source_id)
        if not source:
            return {"source_id": source_id, "status": "unknown", "latency_ms": -1, "error": "Source not found"}
        return await self.check_url_health(
            source["url"],
            source_id=source["id"],
            name=source["name"],
            supports_direct_download=source["supports_direct_download"],
        )

    async def check_url_health(
        self,
        url: str,
        source_id: str = "custom",
        name: str = "Source",
        supports_direct_download: bool = False,
    ) -> Dict[str, Any]:
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True, verify=False) as client:
                resp = await client.get(url, headers={"User-Agent": USER_AGENT})
                latency = round((time.time() - start) * 1000)
                is_ok = 200 <= resp.status_code < 400
                return {
                    "source_id": source_id,
                    "name": name,
                    "status": "online" if is_ok else "degraded",
                    "http_code": resp.status_code,
                    "latency_ms": latency,
                    "supports_direct_download": supports_direct_download,
                }
        except Exception as e:
            latency = round((time.time() - start) * 1000)
            return {
                "source_id": source_id,
                "name": name,
                "status": "offline",
                "http_code": 0,
                "latency_ms": latency,
                "error": str(e),
            }

    async def ping_all_sources(self) -> List[Dict[str, Any]]:
        sources = list_mirror_sources(enabled_only=False)
        if not sources:
            return []
        tasks = [self.check_source_health(s["id"]) for s in sources]
        return await asyncio.gather(*tasks)

    # -------------------------------------------------------------
    # Adapter 1: Generic WordPress Post + Debrid Hoster Extractor
    # -------------------------------------------------------------
    async def _scrape_wp_hoster(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 10,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        base_url = source["url"].rstrip("/")
        cfg = source.get("config") or {}
        search_path = str(cfg.get("search_path") or "/?s={query}")
        search_url = _build_search_url(base_url, search_path, clean_q, platform)
        root_host = _source_root_host(base_url)
        link_selector = str(cfg.get("link_selector") or "a[rel='bookmark'], h2 a, h3 a")
        exclude_paths = cfg.get("exclude_path_parts") or [
            "/category/",
            "/tag/",
            "/author/",
            "/badge/",
            "/collection/",
            "list-all",
            "list-game",
            "page/",
            "#",
        ]
        exclude_keywords = cfg.get("exclude_keywords") or [
            "category",
            "list all",
            "guide install",
            "privacy",
            "contact",
        ]
        platform_keywords = cfg.get("platform_keywords") or {}
        p_keywords = _lookup_ci(platform_keywords, platform)
        title_clean_regex = cfg.get("title_clean_regex")
        subpage_link_regex = str(cfg.get("subpage_link_regex") or "")
        is_pkg = str(cfg.get("file_kind") or "").lower() == "pkg"
        default_ext = str(cfg.get("default_ext") or "")

        browser_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        try:
            async with httpx.AsyncClient(timeout=9.0, follow_redirects=True, verify=False, headers=browser_headers) as client:
                resp = await client.get(search_url)
                if resp.status_code != 200:
                    return results

                soup = BeautifulSoup(resp.text, "html.parser")
                anchors = soup.select(link_selector) if link_selector else soup.find_all("a", href=True)
                scored_candidates: List[Tuple[float, int, str, str]] = []
                seen_posts = set()

                for a in anchors:
                    text = a.get_text(" ", strip=True)
                    href = (a.get("href") or "").strip()
                    if not text or not href:
                        continue
                    abs_href = urllib.parse.urljoin(base_url + "/", href)
                    if abs_href in seen_posts or abs_href.rstrip("/") == base_url:
                        continue
                    if root_host and root_host not in abs_href.lower():
                        continue
                    low_href = abs_href.lower()
                    if any(bad.lower() in low_href for bad in exclude_paths) or any(nav in low_href for nav in ("/badge/", "/collection/", "/publisher/")):
                        continue
                    low_text = text.lower()
                    if any(bad.lower() in low_text for bad in exclude_keywords):
                        continue

                    low_combo = f"{low_text} {low_href}"
                    if p_keywords and isinstance(p_keywords, list):
                        if not any(str(kw).lower() in low_combo for kw in p_keywords):
                            continue

                    clean_title = text
                    if title_clean_regex:
                        clean_title = re.sub(str(title_clean_regex), "", text, flags=re.IGNORECASE).strip()
                        clean_title = re.sub(r"\s+", " ", clean_title).strip(" -:") or text

                    matched, m_score = title_matches_game(query, clean_title, platform=platform, strict=strict)
                    if not matched and len(clean_title) > 30:
                        leaf_slug = re.sub(r"\.(?:html?|php|aspx)$", "", abs_href.rstrip("/").rsplit("/", 1)[-1], flags=re.IGNORECASE)
                        leaf_slug = re.sub(r"[-_](?:nsp|xci|nsz|pkg|rom|iso|cia|vpk)(?:[-_]\d+)?$", "", leaf_slug, flags=re.IGNORECASE)
                        leaf_slug = leaf_slug.replace("-", " ").replace("_", " ").strip()
                        slug_ok, slug_score = title_matches_game(query, leaf_slug, platform=platform, strict=strict)
                        if slug_ok:
                            matched = True
                            m_score = slug_score
                            clean_title = leaf_slug.title()
                    if not matched:
                        continue

                    part_prio = 0 if not re.search(r"\b(update|dlc|patch|backport)\b", low_text) else 1
                    seen_posts.add(abs_href)
                    scored_candidates.append((m_score, part_prio, abs_href, clean_title))

                scored_candidates.sort(key=lambda item: (-item[0], item[1]))
                max_posts = 4 if limit >= 8 else 3
                post_candidates = [(href, ttl, sc) for sc, _, href, ttl in scored_candidates[:max_posts]]

                for post_url, post_title, post_score in post_candidates:
                    inferred_plat = platform or "Switch"
                    if not platform:
                        low_t = post_title.lower()
                        if "ps5" in low_t or "playstation 5" in low_t:
                            inferred_plat = "PS5"
                        elif "macos" in low_t or "mac os" in low_t:
                            inferred_plat = "macOS"
                        elif "windows" in low_t or "pc game" in low_t:
                            inferred_plat = "Windows"
                        elif "3ds" in low_t:
                            inferred_plat = "3DS"
                        elif "vita" in low_t:
                            inferred_plat = "PSVita"
                        elif "ps4" in low_t:
                            inferred_plat = "PS4"
                        elif "ps3" in low_t:
                            inferred_plat = "PS3"

                    hoster_hits: List[Dict[str, Any]] = []
                    try:
                        p_resp = await client.get(post_url, timeout=7.0)
                        if p_resp.status_code == 200:
                            p_soup = BeautifulSoup(p_resp.text, "html.parser")
                            h1_el = p_soup.find("h1")
                            if h1_el:
                                h1_txt = h1_el.get_text(" ", strip=True)
                                if title_clean_regex:
                                    h1_txt = re.sub(str(title_clean_regex), "", h1_txt, flags=re.IGNORECASE).strip()
                                    h1_txt = re.sub(r"\s+", " ", h1_txt).strip(" -:") or h1_txt
                                if h1_txt and len(h1_txt) > 2:
                                    h1_ok, h1_score = title_matches_game(query, h1_txt, platform=platform, strict=strict)
                                    if h1_ok:
                                        post_title = h1_txt
                                        post_score = max(post_score, h1_score)
                                    elif strict and source["name"].lower() not in h1_txt.lower() and len(h1_txt.split()) >= 2:
                                        continue

                            hoster_hits = _extract_hoster_links(
                                p_soup,
                                post_title=post_title,
                                post_url=post_url,
                                platform=inferred_plat,
                                source_id=source["id"],
                                source_label=source["name"],
                                limit=max(1, limit - len(results)),
                                is_pkg=is_pkg,
                            )

                            if not hoster_hits and subpage_link_regex:
                                sub_seen = set()
                                sub_candidates = []
                                for sla in p_soup.find_all("a", href=True):
                                    sub_href = urllib.parse.urljoin(base_url + "/", sla["href"].strip())
                                    if sub_href in sub_seen:
                                        continue
                                    if root_host and root_host not in sub_href.lower():
                                        continue
                                    if re.search(subpage_link_regex, sub_href, re.IGNORECASE):
                                        sub_seen.add(sub_href)
                                        s_txt = sla.get_text(" ", strip=True)
                                        s_low = s_txt.lower()
                                        prio = 0 if any(kw in s_low for kw in ("1fichier", "mega", "mediafire", "gofile", "pixeldrain", "datanodes", "send")) else 1
                                        sub_candidates.append((prio, sub_href, s_txt))

                                sub_candidates.sort(key=lambda x: x[0])
                                if sub_candidates:
                                    top_subs = sub_candidates[:3]
                                    sub_resps = await asyncio.gather(
                                        *[client.get(u, headers={"Referer": post_url}, timeout=6.0) for _, u, _ in top_subs],
                                        return_exceptions=True,
                                    )
                                    for (_, sub_url, sub_label), s_resp in zip(top_subs, sub_resps):
                                        if isinstance(s_resp, Exception) or s_resp.status_code != 200:
                                            continue
                                        s_soup = BeautifulSoup(s_resp.text, "html.parser")
                                        sub_hits = _extract_hoster_links(
                                            s_soup,
                                            post_title=post_title,
                                            post_url=sub_url,
                                            platform=inferred_plat,
                                            source_id=source["id"],
                                            source_label=source["name"],
                                            limit=max(1, limit - len(results) - len(hoster_hits)),
                                            is_pkg=is_pkg,
                                        )
                                        existing_urls = {h["direct_url"] for h in hoster_hits}
                                        for sh in sub_hits:
                                            if sh["direct_url"] not in existing_urls:
                                                hoster_hits.append(sh)
                                                existing_urls.add(sh["direct_url"])
                                        if len(results) + len(hoster_hits) >= limit:
                                            break
                    except Exception as pe:
                        print(f"[{source['name']} post parse error]: {pe}")

                    for h in hoster_hits:
                        h["match_score"] = post_score

                    if hoster_hits:
                        results.extend(hoster_hits)
                    elif not strict and len(results) < limit:
                        ip_up = inferred_plat.upper()
                        ext = default_ext or (
                            ".pkg" if is_pkg or ip_up in ("PS3", "PS4", "PS5")
                            else (".cia" if ip_up == "3DS"
                            else (".vpk" if ip_up == "PSVITA"
                            else (".zip" if ip_up == "WINDOWS"
                            else (".dmg" if ip_up == "MACOS" else ".nsp"))))
                        )
                        results.append({
                            "title": post_title,
                            "platform": inferred_plat,
                            "filename": f"{post_title}{ext}",
                            "direct_url": post_url,
                            "source_id": source["id"],
                            "source_name": source["name"],
                            "quality": f"{inferred_plat} Archive Page",
                            "file_size_mb": 0.0,
                            "is_direct_downloadable": False,
                            "page_url": post_url,
                            "match_score": post_score,
                        })
                    if len(results) >= limit:
                        break
        except Exception as exc:
            print(f"[{source['name']} wp_hoster error]: {exc}")

        return results[:limit]

    # -------------------------------------------------------------
    # Adapter 2: WordPress + AJAX Direct Stream Resolver
    # -------------------------------------------------------------
    async def _scrape_wp_ajax_cdn(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 10,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        base_url = source["url"].rstrip("/")
        cfg = source.get("config") or {}
        search_path = str(cfg.get("search_path") or "/?s={query}")
        search_url = _build_search_url(base_url, search_path, clean_q, platform)
        item_path_contains = str(cfg.get("item_path_contains") or "/roms/")
        download_path_contains = str(cfg.get("download_path_contains") or "/download/")
        ajax_path = str(cfg.get("ajax_path") or "/wp-admin/admin-ajax.php")
        ajax_action = str(cfg.get("ajax_action") or "k_get_download")
        platform_slugs = cfg.get("platform_slugs") or {}
        target_slugs = _lookup_ci(platform_slugs, platform)
        if not target_slugs and platform and platform.strip().upper() == "SWITCH2":
            target_slugs = _lookup_ci(platform_slugs, "Switch")
        if isinstance(target_slugs, str):
            target_slugs = [target_slugs]
        cdn_domains = [str(d).lower() for d in (cfg.get("cdn_domains") or [])]

        browser_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, verify=False, headers=browser_headers) as client:
                resp = await client.get(search_url)
                if resp.status_code != 200:
                    return results

                soup = BeautifulSoup(resp.text, "html.parser")
                links = soup.find_all("a", href=True)
                seen_pages = set()
                candidate_urls: List[Tuple[str, str, float]] = []
                for a in links:
                    href = urllib.parse.urljoin(base_url + "/", a["href"])
                    text = a.get_text(strip=True)
                    if item_path_contains not in href:
                        continue
                    if href not in seen_pages and text and not text.lower().startswith("roms"):
                        if target_slugs and not any(str(slug).lower() in href.lower() for slug in target_slugs):
                            continue
                        slug_part = href.split("/")[-1].replace(".html", "").replace("-", " ")
                        matched, m_score = title_matches_game(
                            query,
                            text,
                            candidate_filename=slug_part,
                            platform=platform,
                            strict=strict,
                        )
                        if not matched:
                            continue
                        seen_pages.add(href)
                        candidate_urls.append((href, text, m_score))

                def score_candidate(item):
                    href, _, m_score = item
                    q_clean = clean_q.lower()
                    slug_part = href.split("/")[-1].replace(".html", "").replace("-", " ").lower()
                    score = m_score * 100.0
                    if slug_part == q_clean:
                        score += 100.0
                    elif q_clean in slug_part:
                        score += 60.0 - min(40.0, float(len(slug_part) - len(q_clean)))
                    q_words = set(q_clean.split())
                    s_words = set(slug_part.split())
                    if q_words:
                        score += (len(q_words.intersection(s_words)) / len(q_words)) * 40.0
                    return score

                candidate_urls.sort(key=score_candidate, reverse=True)
                ajax_url = urllib.parse.urljoin(base_url + "/", ajax_path.lstrip("/"))

                for page_url, title_text, cand_score in candidate_urls[:3]:
                    try:
                        g_resp = await client.get(page_url, timeout=7.0)
                        if g_resp.status_code != 200:
                            continue
                        g_soup = BeautifulSoup(g_resp.text, "html.parser")
                        dl_a = g_soup.find("a", href=re.compile(re.escape(download_path_contains)))
                        if not dl_a:
                            continue
                        dl_landing = urllib.parse.urljoin(base_url + "/", dl_a["href"])

                        sub_resp = await client.get(dl_landing, timeout=7.0)
                        target_referers = []
                        if sub_resp.status_code == 200:
                            sub_soup = BeautifulSoup(sub_resp.text, "html.parser")
                            sub_links = sub_soup.find_all("a", href=re.compile(rf"{re.escape(download_path_contains)}[^/]+/[0-9]+"))
                            for sl in sub_links[:5]:
                                target_referers.append((urllib.parse.urljoin(base_url + "/", sl["href"]), sl.get_text(strip=True)))
                        if not target_referers:
                            target_referers = [(dl_landing, title_text)]

                        for ref_url, ref_label in target_referers[:3]:
                            try:
                                ajax_headers = {
                                    "User-Agent": USER_AGENT,
                                    "Accept": "application/json, text/javascript, */*; q=0.01",
                                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                                    "Referer": ref_url,
                                    "X-Requested-With": "XMLHttpRequest",
                                }
                                a_resp = await client.post(ajax_url, data={"action": ajax_action}, headers=ajax_headers, timeout=6.0)
                                if a_resp.status_code != 200:
                                    continue
                                data = a_resp.json()
                                if not data.get("success"):
                                    continue
                                dl_info = data.get("data", {})
                                stream_link = dl_info.get("download_url")
                                file_name = dl_info.get("file_name") or ref_label or title_text
                                file_size_str = dl_info.get("file_size", "0MB")

                                size_mb = 0.0
                                size_match = re.search(r"([0-9.]+)\s*(MB|GB|KB)", str(file_size_str), re.IGNORECASE)
                                if size_match:
                                    val = float(size_match.group(1))
                                    unit = size_match.group(2).upper()
                                    if unit == "GB":
                                        size_mb = round(val * 1024, 2)
                                    elif unit == "KB":
                                        size_mb = round(val / 1024, 2)
                                    else:
                                        size_mb = round(val, 2)

                                if not stream_link and dl_info.get("html"):
                                    hm = re.search(r'href=["\'](https?://[^"\']+)["\']', dl_info["html"])
                                    if hm:
                                        stream_link = hm.group(1)

                                if stream_link:
                                    stream_link = stream_link.replace("&#038;", "&").replace("&amp;", "&")
                                    ext = ".zip"
                                    for cand_ext in (".7z", ".rar", ".nsp", ".pkg", ".xci", ".rvz", ".chd", ".iso", ".dmg", ".exe"):
                                        if cand_ext in stream_link.lower():
                                            ext = cand_ext
                                            break
                                    clean_fname = (
                                        file_name
                                        if any(str(file_name).lower().endswith(e) for e in (".zip", ".7z", ".rar", ".nsp", ".pkg", ".chd", ".iso", ".rvz", ".xci", ".dmg", ".exe"))
                                        else f"{file_name}{ext}"
                                    )
                                    if strict:
                                        fn_ok, fn_score = title_matches_game(
                                            query,
                                            file_name,
                                            candidate_filename=clean_fname,
                                            platform=platform,
                                            strict=True,
                                        )
                                        if not fn_ok:
                                            continue
                                        cand_score = max(cand_score, fn_score)
                                    sl_low = stream_link.lower()
                                    is_direct = (
                                        any(d in sl_low for d in cdn_domains)
                                        or any(h in sl_low for h in (".zip", ".7z", ".rar", ".iso", ".rvz", ".chd", ".pkg", ".nsp", ".xci", ".dmg", ".exe"))
                                    )
                                    results.append({
                                        "title": file_name,
                                        "platform": platform or "Retro",
                                        "filename": clean_fname,
                                        "direct_url": stream_link,
                                        "source_id": source["id"],
                                        "source_name": f"{source['name']} Direct CDN" if is_direct else source["name"],
                                        "quality": "Direct High-Speed CDN" if is_direct else "Web Mirror",
                                        "file_size_mb": size_mb,
                                        "is_direct_downloadable": is_direct,
                                        "page_url": page_url,
                                        "badge": "⚡ DIRECT CDN" if is_direct else "🌐 WEB HOSTER",
                                        "badge_color": "emerald" if is_direct else "slate",
                                        "match_score": cand_score,
                                    })
                                    if len(results) >= limit:
                                        return results[:limit]
                            except Exception as ae:
                                print(f"[{source['name']} ajax stream error]: {ae}")
                    except Exception as ge:
                        print(f"[{source['name']} item page error]: {ge}")
        except Exception as exc:
            print(f"[{source['name']} wp_ajax_cdn error]: {exc}")

        return results[:limit]

    # -------------------------------------------------------------
    # Adapter 3: Slug Path -> Direct CDN Download Page
    # -------------------------------------------------------------
    async def _scrape_slug_cdn(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 10,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        base_url = source["url"].rstrip("/")
        cfg = source.get("config") or {}
        search_path = str(cfg.get("search_path") or "/search?search_term_string={query}")
        search_url = _build_search_url(base_url, search_path, clean_q, platform)
        item_path_prefix = str(cfg.get("item_path_prefix") or "/roms/")
        download_suffix = str(cfg.get("download_suffix") or "/download")
        platform_map = cfg.get("platform_map") or {}
        target_plat = _lookup_ci(platform_map, platform)
        cdn_regex = str(cfg.get("cdn_url_regex") or r'https?://[^\s"<>\r\n;]+\.(?:zip|7z|rar|chd|iso)(?:\?[^\s"<>\r\n;]*)?')

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(search_url)
                if resp.status_code != 200:
                    return results

                soup = BeautifulSoup(resp.text, "html.parser")
                candidates: List[Tuple[float, str, str, str]] = []
                seen_hrefs = set()
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if item_path_prefix in href and href.count("/") >= 3 and href not in seen_hrefs:
                        parts = [p for p in href.split("/") if p]
                        p_part = parts[1].lower() if len(parts) >= 3 else ""
                        if target_plat and p_part != str(target_plat).lower():
                            continue
                        slug = parts[-1]
                        t = slug.replace("-", " ").title()
                        link_label = a.get_text(" ", strip=True) or t
                        matched, m_score = title_matches_game(
                            query,
                            t,
                            candidate_filename=link_label,
                            platform=platform,
                            strict=strict,
                        )
                        if not matched:
                            continue
                        seen_hrefs.add(href)
                        candidates.append((m_score, t, p_part.upper(), href))

                candidates.sort(key=lambda item: -item[0])

                for m_score, text, p_part, rel_href in candidates[:limit]:
                    page_url = urllib.parse.urljoin(base_url + "/", rel_href.lstrip("/"))
                    direct_url = page_url
                    is_direct = False
                    try:
                        dl_page = page_url.rstrip("/") + download_suffix
                        dl_resp = await client.get(dl_page, timeout=5.0)
                        if dl_resp.status_code == 200:
                            dl_match = re.search(cdn_regex, dl_resp.text)
                            if dl_match:
                                direct_url = dl_match.group(0).rstrip('"\'')
                                is_direct = True
                            else:
                                dl_soup = BeautifulSoup(dl_resp.text, "html.parser")
                                dl_a = dl_soup.find("a", href=re.compile(cdn_regex))
                                if dl_a:
                                    direct_url = dl_a["href"]
                                    is_direct = True
                    except Exception:
                        pass

                    if strict and not is_direct:
                        continue

                    clean_plat = "PS1" if p_part == "PSX" else p_part
                    results.append({
                        "title": text,
                        "platform": platform or clean_plat,
                        "filename": f"{text}.zip",
                        "direct_url": direct_url,
                        "source_id": source["id"],
                        "source_name": f"{source['name']} (Direct CDN)" if is_direct else source["name"],
                        "file_size_mb": 0.0,
                        "is_direct_downloadable": is_direct,
                        "page_url": page_url,
                        "match_score": m_score,
                    })
        except Exception as exc:
            print(f"[{source['name']} slug_cdn error]: {exc}")

        return results[:limit]

    # -------------------------------------------------------------
    # Adapter 4: Platform Listing -> Signed Token Page -> CDN Link
    # -------------------------------------------------------------
    async def _scrape_platform_listing_token(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 8,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        base_url = source["url"].rstrip("/")
        cfg = source.get("config") or {}
        platform_map = cfg.get("platform_map") or {}
        plat_slug = _lookup_ci(platform_map, platform) if platform else None
        if not plat_slug and platform and platform.strip().upper() == "SWITCH2":
            plat_slug = _lookup_ci(platform_map, "Switch")
        if not plat_slug:
            plat_slug = str(cfg.get("default_platform_slug") or (platform or "3ds").lower())

        listing_path = str(cfg.get("listing_path") or "/{platform_slug}").replace("{platform_slug}", str(plat_slug))
        listing_url = urllib.parse.urljoin(base_url + "/", listing_path.lstrip("/"))
        game_href_prefix = str(cfg.get("game_href_template") or "/game/{platform_slug}/").replace("{platform_slug}", str(plat_slug))
        token_href_regex = str(cfg.get("token_href_regex") or r"^/download/")
        cdn_url_regex = str(cfg.get("cdn_url_regex") or r"https?://[^\"'<>]+\.(?:zip|7z|rar|chd|iso|nsp|cia|vpk)")

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, verify=False, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(listing_url)
                if resp.status_code != 200:
                    return results

                soup = BeautifulSoup(resp.text, "html.parser")
                game_links = soup.find_all("a", href=re.compile(rf"^{re.escape(game_href_prefix)}"))
                matched_games: List[Tuple[float, str, str]] = []
                seen_urls = set()

                for a in game_links:
                    title = a.get_text(strip=True)
                    href = a.get("href", "")
                    if not title or href in seen_urls:
                        continue
                    slug_name = href.rsplit("/", 1)[-1].replace("-", " ")
                    matched, m_score = title_matches_game(
                        query,
                        title,
                        candidate_filename=slug_name,
                        platform=platform,
                        strict=strict,
                    )
                    if matched:
                        seen_urls.add(href)
                        matched_games.append((m_score, title, href))

                matched_games.sort(key=lambda item: -item[0])

                for m_score, title, game_href in matched_games[:limit]:
                    try:
                        game_page_url = urllib.parse.urljoin(base_url + "/", game_href.lstrip("/"))
                        g_resp = await client.get(game_page_url)
                        if g_resp.status_code != 200:
                            continue
                        g_soup = BeautifulSoup(g_resp.text, "html.parser")
                        dl_link = g_soup.find("a", href=re.compile(token_href_regex))
                        if not dl_link:
                            continue
                        token_url = urllib.parse.urljoin(base_url + "/", dl_link["href"].lstrip("/"))
                        tok_resp = await client.get(token_url, headers={"Referer": game_page_url})
                        if tok_resp.status_code != 200:
                            continue
                        t_soup = BeautifulSoup(tok_resp.text, "html.parser")
                        final_a = t_soup.find("a", href=re.compile(cdn_url_regex))
                        if final_a:
                            direct_url = final_a["href"]
                            results.append({
                                "title": title,
                                "platform": platform or str(plat_slug).upper(),
                                "filename": f"{title}.zip",
                                "direct_url": direct_url,
                                "source_id": source["id"],
                                "source_name": f"{source['name']} (High-Speed CDN)",
                                "file_size_mb": 0.0,
                                "is_direct_downloadable": True,
                                "page_url": game_page_url,
                                "match_score": m_score,
                            })
                    except Exception as ge:
                        print(f"[{source['name']} token resolve error]: {ge}")
        except Exception as exc:
            print(f"[{source['name']} platform_listing_token error]: {exc}")

        return results[:limit]

    # -------------------------------------------------------------
    # Adapter 5: Generic HTML Search Scraper
    # -------------------------------------------------------------
    async def _scrape_html_search(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 10,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        base_url = source["url"].rstrip("/")
        cfg = source.get("config") or {}
        search_path = str(cfg.get("search_path") or "/?s={query}")
        search_url = _build_search_url(base_url, search_path, clean_q, platform)
        row_selector = str(cfg.get("row_selector") or "a[href]")
        result_href_regex = str(cfg.get("result_href_regex") or "")
        exclude_text = [str(w).lower() for w in (cfg.get("exclude_keywords") or ["emulator", "roms", "page"])]
        default_ext = str(cfg.get("default_ext") or ".zip")

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(search_url)
                if resp.status_code != 200:
                    return results

                soup = BeautifulSoup(resp.text, "html.parser")
                seen_urls = set()
                scored_rows: List[Tuple[float, Dict[str, Any]]] = []
                for el in soup.select(row_selector):
                    a = el if el.name == "a" else el.find("a", href=True)
                    if not a or not a.get("href"):
                        continue
                    href = a["href"].strip()
                    text = a.get_text(strip=True)
                    if not text or not href or any(k in text.lower() for k in exclude_text):
                        continue
                    if result_href_regex and not re.search(result_href_regex, href, re.IGNORECASE):
                        continue

                    matched, m_score = title_matches_game(query, text, platform=platform, strict=strict)
                    if not matched:
                        continue

                    full_url = urllib.parse.urljoin(base_url + "/", href.lstrip("/"))
                    if full_url in seen_urls:
                        continue
                    seen_urls.add(full_url)

                    scored_rows.append((m_score, {
                        "title": text,
                        "platform": platform or "Retro",
                        "filename": f"{text}{default_ext}",
                        "direct_url": full_url,
                        "source_id": source["id"],
                        "source_name": source["name"],
                        "file_size_mb": 0.0,
                        "is_direct_downloadable": False,
                        "page_url": full_url,
                        "match_score": m_score,
                    }))

                scored_rows.sort(key=lambda item: -item[0])
                results = [item[1] for item in scored_rows[:limit]]
        except Exception as exc:
            print(f"[{source['name']} html_search error]: {exc}")

        return results[:limit]

    # -------------------------------------------------------------
    # Adapter 6: Internet Archive Open Preservation API (archive.org)
    # -------------------------------------------------------------
    async def _scrape_archive_org(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 8,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        plat_clean = (platform or "").strip()
        if plat_clean and plat_clean.upper() not in ("ALL", "RETRO"):
            plat_clause = _lookup_ci(ARCHIVE_PLATFORM_QUERIES, plat_clean) or f'"{plat_clean}"'
            search_expr = f'title:("{clean_q}") AND {plat_clause} AND mediatype:(software OR data)'
        else:
            search_expr = f'title:("{clean_q}") AND mediatype:(software OR data)'

        params = urllib.parse.urlencode(
            {
                "q": search_expr,
                "fl[]": ["identifier", "title", "downloads", "item_size"],
                "sort[]": "downloads desc",
                "rows": 8,
                "output": "json",
            },
            doseq=True,
        )
        search_url = f"https://archive.org/advancedsearch.php?{params}"

        try:
            async with httpx.AsyncClient(
                timeout=7.5,
                follow_redirects=True,
                verify=False,
                headers={"User-Agent": "OmniVault/2.0"},
            ) as client:
                s_resp = await client.get(search_url)
                if s_resp.status_code != 200:
                    return results

                docs = s_resp.json().get("response", {}).get("docs", []) or []
                if not docs:
                    return results

                top_docs = docs[:5]
                meta_resps = await asyncio.gather(
                    *[
                        client.get(f"https://archive.org/metadata/{urllib.parse.quote(str(d['identifier']))}/files")
                        for d in top_docs
                        if d.get("identifier")
                    ],
                    return_exceptions=True,
                )

                for doc, m_resp in zip(top_docs, meta_resps):
                    if isinstance(m_resp, Exception) or m_resp.status_code != 200:
                        continue
                    ident = str(doc.get("identifier") or "").strip()
                    doc_title = str(doc.get("title") or ident)
                    if not ident:
                        continue

                    try:
                        files = m_resp.json().get("result", []) or []
                    except Exception:
                        continue

                    rom_files = []
                    for f in files:
                        if str(f.get("private", "")).lower() == "true":
                            continue
                        fname = str(f.get("name") or "").strip()
                        if not fname or fname.startswith("__"):
                            continue
                        fname_low = fname.lower()
                        if not fname_low.endswith(ARCHIVE_ROM_EXTS):
                            continue
                        if re.search(r"fg-\d+\.bin$", fname_low):
                            continue
                        rom_files.append(f)

                    if not rom_files:
                        continue

                    matched_scored: List[Tuple[float, Dict[str, Any]]] = []
                    for f in rom_files:
                        fname_leaf = str(f.get("name") or "").rsplit("/", 1)[-1]
                        base_name = fname_leaf.rsplit(".", 1)[0]
                        ok, f_score = title_matches_game(
                            query,
                            base_name,
                            candidate_filename=fname_leaf,
                            platform=platform,
                            strict=strict,
                        )
                        if ok:
                            matched_scored.append((f_score, f))

                    if not matched_scored and len(rom_files) == 1:
                        doc_ok, doc_score = title_matches_game(query, doc_title, platform=platform, strict=strict)
                        if doc_ok:
                            fname_leaf = str(rom_files[0].get("name") or "").rsplit("/", 1)[-1]
                            _, fn_nums = _extract_match_tokens(fname_leaf)
                            _, q_nums = _extract_match_tokens(query)
                            if (not q_nums and not (fn_nums - {"1"})) or (q_nums == fn_nums or not fn_nums):
                                matched_scored.append((doc_score, rom_files[0]))

                    if not matched_scored:
                        continue

                    def file_sort_key(item: Tuple[float, Dict[str, Any]]):
                        f_score, f = item
                        fn_low = str(f.get("name") or "").lower()
                        noise = 1 if any(k in fn_low for k in ("hack", "collection", "complete set", "best set")) else 0
                        try:
                            sz = int(f.get("size") or 0)
                        except (TypeError, ValueError):
                            sz = 0
                        return (noise, -f_score, sz)

                    matched_scored.sort(key=file_sort_key)

                    for f_score, f in matched_scored[:2]:
                        fname = str(f.get("name") or "").strip()
                        dl_url = f"https://archive.org/download/{urllib.parse.quote(ident)}/{urllib.parse.quote(fname)}"
                        try:
                            size_mb = round(int(f.get("size") or 0) / (1024 * 1024), 2)
                        except (TypeError, ValueError):
                            size_mb = 0.0

                        base_name = fname.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                        results.append({
                            "title": base_name or doc_title,
                            "platform": platform or "Retro",
                            "filename": fname.rsplit("/", 1)[-1],
                            "direct_url": dl_url,
                            "source_id": source["id"],
                            "source_name": source["name"],
                            "quality": "Internet Archive Direct",
                            "file_size_mb": size_mb,
                            "is_direct_downloadable": True,
                            "page_url": f"https://archive.org/details/{urllib.parse.quote(ident)}",
                            "badge": "🏛️ ARCHIVE.ORG",
                            "badge_color": "emerald",
                            "match_score": f_score,
                        })
                        if len(results) >= limit:
                            return results[:limit]
        except Exception as exc:
            print(f"[Archive.org adapter error]: {exc}")

        return results[:limit]

    async def scrape_source(
        self,
        source: Dict[str, Any],
        query: str,
        platform: Optional[str] = None,
        limit: int = 10,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        adapter = (source.get("adapter") or "html_search").strip()
        if adapter == "directory_link":
            return []
        if adapter == "archive_org":
            return await self._scrape_archive_org(source, query, platform, limit=limit, strict=strict)
        if adapter == "wp_hoster":
            return await self._scrape_wp_hoster(source, query, platform, limit=limit, strict=strict)
        if adapter == "wp_ajax_cdn":
            return await self._scrape_wp_ajax_cdn(source, query, platform, limit=limit, strict=strict)
        if adapter == "slug_cdn":
            return await self._scrape_slug_cdn(source, query, platform, limit=limit, strict=strict)
        if adapter == "platform_listing_token":
            return await self._scrape_platform_listing_token(source, query, platform, limit=limit, strict=strict)
        return await self._scrape_html_search(source, query, platform, limit=limit, strict=strict)

    async def scrape_source_by_id(
        self,
        source_id: str,
        query: str,
        platform: Optional[str] = None,
        limit: int = 10,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        source = get_mirror_source(source_id)
        if not source:
            raise KeyError(f"Unknown source: {source_id}")
        return await self.scrape_source(source, query, platform=platform, limit=limit, strict=strict)

    # -------------------------------------------------------------
    # Unified Concurrent Multi-Source Search
    # -------------------------------------------------------------
    async def search_all_sources(
        self,
        query: str,
        platform: Optional[str] = None,
        limit_per_source: int = 6,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        sources = [s for s in list_mirror_sources(enabled_only=True) if self._source_supports_platform(s, platform)]
        if not sources:
            return []

        tasks = [
            self.scrape_source(src, query, platform=platform, limit=limit_per_source, strict=strict)
            for src in sources
        ]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

        aggregated: List[Dict[str, Any]] = []
        for sublist in raw_results:
            if isinstance(sublist, list):
                aggregated.extend(sublist)

        aggregated.sort(
            key=lambda x: (
                not x.get("is_direct_downloadable", False),
                -float(x.get("match_score") or 0.0),
                x.get("title", ""),
            )
        )
        return aggregated

    # -------------------------------------------------------------
    # Multi-Stream Mirror & Indexer Aggregator
    # -------------------------------------------------------------
    async def get_rom_mirrors(
        self,
        query: str,
        platform: str,
        source_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        ROM Mirror & Torrent Aggregator:
        Concurrently queries all enabled user-configured BYOS mirror sources and custom indexers
        (or a single source when source_id is specified), strictly enforcing exact-game title matching.
        Ranks Real-Debrid hosters (when active) / verified direct CDNs / seeded torrents first.
        """
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return []

        target_source_id = (source_id or "").strip() or None
        all_enabled_sources = list_mirror_sources(enabled_only=True)
        sources = [s for s in all_enabled_sources if self._source_supports_platform(s, platform)]
        if target_source_id:
            matched_src = [s for s in all_enabled_sources if s["id"] == target_source_id]
            if not matched_src and target_source_id == "archive-org":
                matched_src = [{
                    "id": "archive-org",
                    "name": "Internet Archive (Archive.org)",
                    "url": "https://archive.org",
                    "adapter": "archive_org",
                    "platforms": ["ALL"],
                    "supports_direct_download": True,
                    "priority": 40,
                    "config": {},
                }]
            sources = matched_src

        source_prio_map = {s["id"]: int(s.get("priority", 50)) for s in sources}

        tasks = []
        for src in sources:
            if src.get("adapter") == "directory_link":
                continue
            tasks.append(self.scrape_source(src, query, platform=platform, limit=8, strict=True))

        try:
            from ..scrapers.providers.manager import get_active_provider_instances
            for prov in get_active_provider_instances():
                if target_source_id and prov.provider_id != target_source_id:
                    continue
                if prov.provider_type in ("torznab", "torrent", "json_torrent_api", "rss_torrent_feed"):
                    tasks.append(prov.search(query, platform, limit=6))
        except Exception as te:
            print(f"[Provider search error]: {te}")

        if not tasks:
            return []

        raw_stream_lists = await asyncio.gather(*tasks, return_exceptions=True)
        all_streams: List[Dict[str, Any]] = []
        seen_urls = set()
        rank = 1
        rd_active = is_realdebrid_active()

        for slist in raw_stream_lists:
            if not isinstance(slist, list):
                continue
            for item in slist:
                d_url = (
                    item.get("direct_url")
                    or item.get("magnet_uri")
                    or item.get("torrent_url")
                    or item.get("direct_download_url")
                )
                if not d_url or d_url in seen_urls:
                    continue

                cand_title = str(item.get("title") or "").strip()
                cand_filename = str(item.get("filename") or "").strip()
                matched_ok, match_score = title_matches_game(
                    query,
                    cand_title,
                    candidate_filename=cand_filename,
                    platform=platform,
                    strict=True,
                )
                if not matched_ok:
                    continue

                is_torrent = "magnet:" in str(d_url) or str(d_url).lower().endswith(".torrent")
                is_hoster = is_hoster_url(str(d_url))
                is_direct = bool(item.get("is_direct_downloadable", True))
                is_realdebrid = False

                # Filter out non-downloadable raw HTML webpages so downloads never fetch HTML
                if not is_direct and not is_hoster and not is_torrent:
                    continue

                seen_urls.add(d_url)

                src_name = item.get("source_name") or item.get("source") or "BYOS Mirror"
                src_id = item.get("source_id") or "mirror"
                badge = item.get("badge", "⚡ DIRECT")
                badge_color = item.get("badge_color", "emerald")
                quality = item.get("quality", "Verified Mirror")
                size_mb = float(item.get("file_size_mb") or 0.0)
                seeders = int(item.get("seeders") or 0)
                leechers = int(item.get("leechers") or 0)
                peers = seeders + leechers

                fmt = "ROM"
                fn = cand_filename.lower()
                if fn.endswith(".nsp"):
                    fmt = "NSP"
                elif fn.endswith(".xci"):
                    fmt = "XCI"
                elif fn.endswith(".nsz"):
                    fmt = "NSZ"
                elif fn.endswith(".cia"):
                    fmt = "CIA"
                elif fn.endswith(".3ds"):
                    fmt = "3DS"
                elif fn.endswith(".vpk"):
                    fmt = "VPK"
                elif fn.endswith(".zip"):
                    fmt = "ZIP"
                elif fn.endswith(".7z"):
                    fmt = "7Z"
                elif fn.endswith(".chd"):
                    fmt = "CHD"
                elif fn.endswith(".rvz"):
                    fmt = "RVZ"
                elif fn.endswith(".iso"):
                    fmt = "ISO"
                elif fn.endswith(".z64") or fn.endswith(".n64"):
                    fmt = "Z64"
                elif fn.endswith(".pkg"):
                    fmt = "PKG"
                elif fn.endswith(".dmg"):
                    fmt = "DMG"
                elif fn.endswith(".rar"):
                    fmt = "RAR"
                elif fn.endswith(".exe"):
                    fmt = "EXE"
                elif fn.endswith(".msi"):
                    fmt = "MSI"
                elif fn.endswith(".img"):
                    fmt = "IMG"
                elif fn.endswith(".toast"):
                    fmt = "TOAST"

                if is_torrent:
                    fmt = "MAGNET" if "magnet:" in str(d_url) else "TORRENT"
                    is_direct = False
                    if rd_active:
                        is_realdebrid = True
                        badge = f"⚡ REAL-DEBRID • {fmt} ({seeders}S / {peers}P)" if (seeders or peers) else f"⚡ REAL-DEBRID • {fmt}"
                        quality = f"Real-Debrid Cached / P2P ({seeders} Seeds • {peers} Peers)"
                        badge_color = "cyan"
                    else:
                        badge = f"🧲 {fmt} ({seeders}S / {peers}P)" if (seeders or peers) else "🧲 P2P TORRENT"
                        quality = f"P2P Torrent ({seeders} Seeds • {peers} Peers)"
                        badge_color = "amber"
                elif rd_active and is_hoster:
                    is_realdebrid = True
                    is_direct = True
                    if "REAL-DEBRID" not in str(badge).upper():
                        badge = f"⚡ REAL-DEBRID • {fmt}"
                    badge_color = "cyan"
                    if "Real-Debrid" not in quality:
                        quality = f"{quality} • Real-Debrid"

                is_downloadable = bool(is_direct or is_realdebrid or is_torrent)
                all_streams.append({
                    "id": f"mirror-{rank}",
                    "title": cand_title or query,
                    "platform": platform,
                    "filename": cand_filename or f"{query}.zip",
                    "format": fmt,
                    "direct_url": d_url,
                    "source_id": src_id,
                    "source_name": src_name,
                    "quality": quality,
                    "file_size_mb": size_mb,
                    "is_direct": is_direct,
                    "is_realdebrid": is_realdebrid,
                    "requires_realdebrid": bool(is_hoster and not rd_active and not is_torrent and not is_direct),
                    "is_downloadable": is_downloadable,
                    "is_torrent": is_torrent,
                    "match_score": round(float(item.get("match_score") or match_score), 3),
                    "speed_mbps": 0.0,
                    "latency_ms": 9999,
                    "speed_verified": False,
                    "page_url": item.get("page_url"),
                    "badge": badge,
                    "badge_color": badge_color,
                    "seeders": seeders,
                    "leechers": leechers,
                    "peers": peers,
                    "source_priority": source_prio_map.get(src_id, 40),
                    "rank": rank,
                })
                rank += 1

        # Concurrent 128 KB byte-range speed probe for top direct HTTP mirrors
        probe_candidates = [
            s for s in all_streams
            if s["is_direct"]
            and not s["is_realdebrid"]
            and not s["is_torrent"]
            and str(s["direct_url"]).startswith("http")
        ][:6]

        if probe_candidates:
            try:
                probe_results = await asyncio.wait_for(
                    asyncio.gather(*[_probe_direct_speed(s["direct_url"]) for s in probe_candidates], return_exceptions=True),
                    timeout=2.8,
                )
                for s, p_res in zip(probe_candidates, probe_results):
                    if isinstance(p_res, dict) and p_res.get("ok"):
                        s["speed_verified"] = True
                        s["speed_mbps"] = float(p_res.get("speed_mbps") or 0.0)
                        s["latency_ms"] = int(p_res.get("latency_ms") or 9999)
                        if s["file_size_mb"] <= 0 and float(p_res.get("size_mb") or 0.0) > 0:
                            s["file_size_mb"] = float(p_res["size_mb"])
                    elif isinstance(p_res, dict) and not p_res.get("ok"):
                        s["is_direct"] = False
                        s["is_downloadable"] = bool(s["is_realdebrid"] or s["is_torrent"])
                        s["speed_verified"] = False
                        s["quality"] = f"{s['quality']} (Unverified)"
            except asyncio.TimeoutError:
                pass

        return _rank_mirrors(all_streams, clean_q, rd_active)

    get_torrentio_streams = get_rom_mirrors

    # -------------------------------------------------------------
    # Automated Mirror Failover Resolver
    # -------------------------------------------------------------
    async def find_working_mirror_for_game(
        self,
        game_title: str,
        platform: str,
        current_failed_url: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Iterates enabled BYOS sources for the platform in priority order, verifying
        healthy HTTP 200/206 non-HTML direct streams first.
        """
        cache_key = f"{platform}:{game_title}".lower()
        if cache_key in self.verified_mirror_cache:
            return self.verified_mirror_cache[cache_key]

        sources = [s for s in list_mirror_sources(enabled_only=True) if self._source_supports_platform(s, platform)]
        ordered_sources = sorted(
            sources,
            key=lambda s: (not s.get("supports_direct_download"), int(s.get("priority", 50))),
        )

        for src in ordered_sources:
            if src.get("adapter") == "directory_link":
                continue
            try:
                hits = await self.scrape_source(src, game_title, platform=platform, limit=3, strict=True)
            except Exception:
                continue
            for m in hits:
                d_url = m.get("direct_url")
                if not d_url or d_url == current_failed_url:
                    continue
                if m.get("is_direct_downloadable") and await self.verify_direct_stream(d_url):
                    self.verified_mirror_cache[cache_key] = m
                    return m
                if is_realdebrid_active() and is_hoster_url(d_url):
                    self.verified_mirror_cache[cache_key] = m
                    return m

        return None

    async def verify_direct_stream(self, url: str) -> bool:
        """Verifies if an HTTP URL accepts range requests or streams cleanly (HTTP 200 or 206) without buffering."""
        try:
            headers = {"User-Agent": USER_AGENT, "Range": "bytes=0-1024"}
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, verify=False) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    if resp.status_code not in (200, 206):
                        return False
                    c_type = resp.headers.get("Content-Type", "").lower()
                    if any(h in c_type for h in ("text/html", "text/xml", "application/xhtml+xml")):
                        return False
                    return True
        except Exception:
            return False


mirror_resolver = MirrorResolver()
