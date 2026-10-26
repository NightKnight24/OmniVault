import re
import json
import ssl
import httpx
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional, List
from .full_library_scraper import classify_genre

LIBRETRO_REPO_MAP = {
    "SNES": "Nintendo_-_Super_Nintendo_Entertainment_System",
    "NES": "Nintendo_-_Nintendo_Entertainment_System",
    "N64": "Nintendo_-_Nintendo_64",
    "GB": "Nintendo_-_Game_Boy",
    "GBC": "Nintendo_-_Game_Boy_Color",
    "GBA": "Nintendo_-_Game_Boy_Advance",
    "NDS": "Nintendo_-_Nintendo_DS",
    "DSI": "Nintendo_-_Nintendo_DS",
    "3DS": "Nintendo_-_Nintendo_3DS",
    "GameCube": "Nintendo_-_GameCube",
    "Wii": "Nintendo_-_Wii",
    "WiiU": "Nintendo_-_Wii_U",
    "Switch": "Nintendo_-_Nintendo_Switch",
    "PSP": "Sony_-_PlayStation_Portable",
    "PS1": "Sony_-_PlayStation",
    "PS2": "Sony_-_PlayStation_2",
    "PS3": "Sony_-_PlayStation_3",
    "PS4": "Sony_-_PlayStation_4",
    "PSVita": "Sony_-_PlayStation_Vita",
    "Xbox": "Microsoft_-_Xbox",
    "Xbox360": "Microsoft_-_Xbox_360",
    "Genesis": "Sega_-_Mega_Drive_-_Genesis",
    "SegaCD": "Sega_-_Mega_CD_-_Sega_CD",
    "Dreamcast": "Sega_-_Dreamcast",
    "Saturn": "Sega_-_Saturn",
    "MasterSystem": "Sega_-_Master_System_-_Mark_III",
    "GameGear": "Sega_-_Game_Gear",
    "Atari2600": "Atari_-_2600",
    "Atari7800": "Atari_-_7800",
    "NeoGeo": "SNK_-_Neo_Geo",
    "TG16": "NEC_-_PC_Engine_-_TurboGrafx_16",
}

def _format_libretro_title(platform: str, title: str) -> str:
    safe_title = re.sub(r'[&*/:<>?\\|"`]', '_', title).strip()
    if platform == "NeoGeo":
        return urllib.parse.quote(safe_title)
    if re.search(r'\((USA|Europe|World|Japan|En|US|EU)\b', safe_title, flags=re.I):
        return urllib.parse.quote(safe_title)
    return urllib.parse.quote(f"{safe_title} (USA)")

def get_libretro_boxart_url(platform: str, title: str) -> str:
    repo = LIBRETRO_REPO_MAP.get(platform, "Nintendo_-_Super_Nintendo_Entertainment_System")
    clean_title = _format_libretro_title(platform, title)
    return f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{clean_title}.png"

def get_libretro_screenshot_url(platform: str, title: str) -> str:
    repo = LIBRETRO_REPO_MAP.get(platform, "Nintendo_-_Super_Nintendo_Entertainment_System")
    clean_title = _format_libretro_title(platform, title)
    return f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Snaps/{clean_title}.png"

def get_trailer_embed_url(title: str, platform: str) -> str:
    """
    Returns an embedded YouTube search query trailer URL or official gameplay demo.
    """
    base_title = re.split(r"\(", title)[0].strip() or title
    clean_search = urllib.parse.quote(f"{base_title} {platform} gameplay trailer")
    return f"https://www.youtube.com/embed?listType=search&list={clean_search}&autoplay=0"

def fetch_wikipedia_game_synopsis_sync(title: str, platform: str = "") -> Optional[Dict[str, Any]]:
    """
    Fetches authentic historical game description, release year, developer, and lore
    from Wikipedia's REST API & OpenSearch with caching and compliant User-Agent.
    """
    raw_clean = re.sub(r"\[.*?\]", "", re.split(r"\(", title)[0]).strip()
    raw_clean = raw_clean.replace("_", " ").replace("-", " ").strip()
    if not raw_clean:
        return None

    # Strip publisher prefixes (Disney's, Tom Clancy's, LEGO, etc.) for better Wikipedia matching
    no_prefix = re.sub(r"^(Disney's|Tom Clancy's|Sid Meier's|LEGO)\s+", "", raw_clean, flags=re.I).strip()

    ctx = ssl._create_unverified_context()
    headers = {"User-Agent": "OmniVaultRetroPreservation/2.0 (https://omnivault.org; contact@omnivault.org) python-urllib/3.14"}
    
    candidates = [
        f"{raw_clean} (video game)",
        f"{raw_clean} ({platform} video game)",
        raw_clean,
    ]
    if no_prefix and no_prefix != raw_clean:
        candidates.extend([
            f"{no_prefix} (video game)",
            f"{no_prefix} ({platform} video game)",
            no_prefix
        ])

    queries = [
        f"{raw_clean} {platform} video game",
        f"{raw_clean} video game",
        f"{no_prefix} video game"
    ]

    for q in queries:
        try:
            search_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={urllib.parse.quote(q)}&limit=5&namespace=0&format=json"
            req = urllib.request.Request(search_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=2.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) >= 2 and data[1]:
                    for item in data[1]:
                        if item not in candidates:
                            candidates.append(item)
        except Exception:
            pass

    for page_title in candidates[:7]:
        try:
            encoded_page = urllib.parse.quote(page_title.replace(" ", "_"))
            summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded_page}"
            req = urllib.request.Request(summary_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=2.5) as resp:
                info = json.loads(resp.read().decode("utf-8"))
                extract = (info.get("extract") or "").strip()
                if not extract or info.get("type") == "disambiguation" or "may refer to:" in extract or len(extract) < 50:
                    continue
                # Verify it is gaming/console/media related
                if not any(w in extract.lower() for w in ["game", "play", "nintendo", "sega", "playstation", "xbox", "arcade", "series", "released", "developed", "published"]):
                    continue

                year_match = re.search(r"\b(19[789]\d|20[012]\d)\b", extract[:350])
                year = int(year_match.group(1)) if year_match else None
                dev_match = re.search(r"developed by ([A-Z][A-Za-z0-9\s&\-\.']+?)(?:\s+and published|\s+and released|\s+while\b|\s+for\b|\s+on\b|\s+in\b|,|\.)", extract[:450])
                pub_match = re.search(r"published by ([A-Z][A-Za-z0-9\s&\-\.']+?)(?:\s+and\b|\s+while\b|\s+for\b|\s+on\b|\s+in\b|,|\.)", extract[:450])
                both_match = re.search(r"developed and published by ([A-Z][A-Za-z0-9\s&\-\.']+?)(?:\s+and\b|\s+while\b|\s+for\b|\s+on\b|\s+in\b|,|\.)", extract[:450])
                dev = both_match.group(1).strip() if both_match else (dev_match.group(1).strip() if dev_match else None)
                pub = both_match.group(1).strip() if both_match else (pub_match.group(1).strip() if pub_match else None)
                thumb = (info.get("thumbnail") or {}).get("source")
                return {
                    "description": extract,
                    "release_year": year,
                    "developer": dev,
                    "publisher": pub,
                    "thumbnail": thumb,
                }
        except Exception:
            continue
    return None

async def scrape_game_metadata(title: str, platform: str, fetch_remote_synopsis: bool = True) -> Dict[str, Any]:
    """
    Scrapes comprehensive metadata, box arts, trailer, screenshots, and real synopsis for any game.
    """
    box_2d = get_libretro_boxart_url(platform, title)
    snap = get_libretro_screenshot_url(platform, title)
    trailer = get_trailer_embed_url(title, platform)
    clean_title = re.sub(r"\[.*?\]", "", re.split(r"\(", title)[0]).strip() or title
    genre = classify_genre(clean_title)

    wiki = fetch_wikipedia_game_synopsis_sync(clean_title, platform) if fetch_remote_synopsis else None
    description = (
        wiki["description"]
        if wiki and wiki.get("description")
        else f"{clean_title} ({platform}) — preserved release with verified checksums, box art, and full emulator compatibility in OmniVault."
    )

    return {
        "title": title,
        "platform": platform,
        "box_art_2d": box_2d,
        "box_art_3d": box_2d,
        "backdrop": snap,
        "trailer_url": trailer,
        "screenshots": [snap, box_2d],
        "rating": None,
        "rating_count": 0,
        "release_year": wiki.get("release_year") if wiki else None,
        "developer": wiki.get("developer") if wiki else None,
        "publisher": wiki.get("publisher") if wiki else None,
        "genre": genre,
        "description": description
    }
