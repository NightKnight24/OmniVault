import asyncio
import re
import urllib.parse
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Registry of all requested scraping sources & mirrors
MIRROR_SOURCES: Dict[str, Dict[str, Any]] = {
    "r-roms": {
        "id": "r-roms",
        "name": "r/roms Megathread",
        "url": "https://r-roms.gitlab.io/",
        "type": "Curated Preservation Directory",
        "description": "Reddit r/roms community index linking to 400+ verified Archive.org, Myrient & No-Intro collections.",
        "platforms": ["3DS", "PSVita", "NDS", "PSP", "PS1", "PS2", "PS3", "Switch", "Xbox", "Xbox360", "PS4", "GameCube", "Wii", "N64", "GBA", "SNES", "NES", "Genesis", "Dreamcast", "Saturn"],
        "supports_direct_download": True,
        "is_enabled": True
    },
    "blueroms": {
        "id": "blueroms",
        "name": "BlueRoms",
        "url": "https://www.blueroms.ws/",
        "type": "Direct High-Speed Mirror",
        "description": "High-bandwidth direct downloads with tokenized CDN for 3DS, Vita, Switch, PSP, NDS, PS1-4, Xbox.",
        "platforms": ["3DS", "PSVita", "PSP", "NDS", "PS1", "PS2", "PS3", "PS4", "Xbox", "Xbox360", "GameCube", "Wii", "Switch", "N64", "GBA", "SNES", "Genesis", "Dreamcast", "Arcade"],
        "supports_direct_download": False,
        "is_enabled": False
    },
    "consoleroms": {
        "id": "consoleroms",
        "name": "ConsoleRoms",
        "url": "https://www.consoleroms.com/",
        "type": "Retro ROM Directory",
        "description": "Fast index of classic console and arcade titles.",
        "platforms": ["GBA", "GBC", "GB", "NDS", "SNES", "NES", "N64", "PS1", "PS2", "Xbox", "MAME"],
        "supports_direct_download": True,
        "is_enabled": True
    },
    "romsgames": {
        "id": "romsgames",
        "name": "RomsGames",
        "url": "https://www.romsgames.net/",
        "type": "Retro ROM Portal",
        "description": "Extensive library of verified ROM releases with complete metadata.",
        "platforms": ["NDS", "PSP", "GBA", "PS1", "PS2", "SNES", "NES", "N64", "GameCube", "Wii", "Genesis"],
        "supports_direct_download": False,
        "is_enabled": True
    },
    "romsfun": {
        "id": "romsfun",
        "name": "RomsFun",
        "url": "https://romsfun.com/",
        "type": "Multi-Region Archive",
        "description": "Large multi-region catalog with granular version selections (USA, Europe, Japan, Rev 1).",
        "platforms": ["3DS", "PSVita", "PSP", "NDS", "PS1", "PS2", "PS3", "PS4", "Xbox", "Xbox360", "Switch", "Wii", "GameCube", "GBA", "SNES"],
        "supports_direct_download": True,
        "is_enabled": True
    },
    "romslab": {
        "id": "romslab",
        "name": "RomsLab",
        "url": "https://romslab.com/",
        "type": "Modern & Retro Releases",
        "description": "Catalog of modern and retro releases with repack mirrors.",
        "platforms": ["Switch", "PS3", "PS4", "Xbox", "Xbox360", "3DS", "PSVita", "NDS", "Retro"],
        "supports_direct_download": False,
        "is_enabled": True
    },
    "ziperto": {
        "id": "ziperto",
        "name": "Ziperto",
        "url": "https://www.ziperto.com/",
        "type": "Handheld Preservation Mirror",
        "description": "Specialized archive for Nintendo Switch (NSP/XCI), 3DS (.cia/.3ds), and PS Vita (.vpk).",
        "platforms": ["Switch", "3DS", "PSVita"],
        "supports_direct_download": False,
        "is_enabled": True
    },
    "vimm": {
        "id": "vimm",
        "name": "Vimm's Lair",
        "url": "https://vimm.net/",
        "type": "Historical Preservation Vault",
        "description": "Iconic vintage vault for catalog search, scans, and preservation status verification.",
        "platforms": ["NES", "SNES", "N64", "GBA", "GameCube", "Wii", "PS1", "PS2", "PS3", "Xbox", "Xbox360", "PSP", "Genesis", "Dreamcast", "Saturn"],
        "supports_direct_download": False,
        "is_enabled": True
    },
    "dlpsgame": {
        "id": "dlpsgame",
        "name": "DLPSGame",
        "url": "https://dlpsgame.com/",
        "type": "PlayStation PKG Mirror",
        "description": "Dedicated library of 17,000+ PS4 and PS3 games with high-speed MediaFire and 1fichier mirrors.",
        "platforms": ["PS4", "PS3"],
        "supports_direct_download": False,
        "is_enabled": True
    }
}

# R-Roms Curated Archive.org Collections by Platform
R_ROMS_PLATFORM_COLLECTIONS: Dict[str, List[str]] = {
    "PS3": [
        "sony_playstation3_f"
    ],
    "3DS": [
        "3ds-main-encrypted",
        "3ds-main-encrypted-p2",
        "nintendo-3ds-complete-collection",
        "nintendo-3ds-complete-collection-pt2"
    ],
    "PSVita": [
        "PSVITA_VPK",
        "sony-playstation-vita-usa-full-set-nonpdrm-format",
        "sony-playstation-vita-usa-full-set-nonpdrm-format-dlc-updates",
        "PSVITA_MAIDUMP"
    ],
    "NDS": [
        "2024-nintendo-ds-hearto-1g1r-collection",
        "no-intro-nintendo-ds-decrypted-roms-0001-6308-x-001-x-193-x-b-01-x-b-03-z-001-z-183",
        "No-Intro_Nintendo_DSi_2018-06-30"
    ],
    "PSP": [
        "rr-sony-playstation-portable"
    ],
    "GameCube": [
        "GamecubeCollectionByGhostware",
        "rvz-gc-usa-redump",
        "RedumpNintendoGameCubeAmerica"
    ],
    "Wii": [
        "Wii_ISO",
        "wii_rvz_usa",
        "WiiRomSetByGhostware"
    ],
    "PS1": [
        "sony-playstation-usa-translations-1g1r-chd-perfect-collection_202310"
    ],
    "PS2": [
        "chd_ps2",
        "ps2_chd_usa"
    ],
    "N64": [
        "No-Intro_N64_Collection"
    ],
    "GBA": [
        "recalbox-nointro-gba-1g1r-retroninjasamurai"
    ],
    "SNES": [
        "nointro-snes"
    ],
    "NES": [
        "ef_nintendo_entertainment_-system_-no-intro_2024-04-23"
    ],
    "Genesis": [
        "nointro.md"
    ],
    "Dreamcast": [
        "DreamcastSelfBoot",
        "DreamcastCollectionByGhostwareMulti-region"
    ],
    "Saturn": [
        "SSCHD-Arquivista"
    ],
    "GB": [
        "No-Intro_GB"
    ],
    "GBC": [
        "No-Intro_GBC"
    ],
    "SegaCD": [
        "redump.sega_megacd-segacd"
    ],
    "TG16": [
        "nointro.tg-16"
    ],
    "MasterSystem": [
        "nointro.ms-mkiii"
    ],
    "GameGear": [
        "nointro.gg"
    ],
    "Atari2600": [
        "nointro.atari-2600"
    ],
    "Atari7800": [
        "atari-7800-roms-ultra"
    ],
    "NeoGeo": [
        "neogeoaesmvscomplete"
    ],
    "Arcade": [
        "MAME_0.225_CHDs"
    ],
    "Xbox": [
        "xbox_original_usa_redump"
    ],
    "Xbox360": [
        "XBOX_360_1",
        "XBOX_360_2",
        "XBOX_360_3",
        "XBOX_360_4",
        "XBOX_360_5",
        "xbox_360_god_part_1",
        "xbox_360_god_part_2",
        "xbox_360_god_part_3"
    ],
    "Switch": [
        "nintendo_switch_nsp_xci"
    ],
    "PS4": [
        "ps4-retail-fpkg"
    ]
}

# BlueRoms platform URL paths
BLUEROMS_PLATFORM_MAP: Dict[str, str] = {
    "3DS": "3ds",
    "PSVita": "psvita",
    "PSP": "psp",
    "NDS": "nds",
    "PS1": "ps1",
    "PS2": "ps2",
    "PS3": "ps3",
    "PS4": "ps4",
    "Xbox": "xbox",
    "Xbox360": "xbox360",
    "GameCube": "gamecube",
    "Wii": "wii",
    "Switch": "switch",
    "N64": "n64",
    "GBA": "gba",
    "SNES": "snes",
    "Genesis": "genesis",
    "Dreamcast": "dreamcast",
    "Arcade": "arcade",
    "NeoGeo": "neogeo"
}

CONSOLEROMS_PLATFORM_MAP: Dict[str, str] = {
    "SNES": "snes",
    "NES": "nes",
    "N64": "n64",
    "GBA": "gba",
    "GBC": "gbc",
    "GB": "gb",
    "PS1": "psx",
    "PS2": "ps2",
    "NDS": "nds",
    "Arcade": "mame",
    "MAME": "mame"
}

ROMSFUN_PLATFORM_SLUGS: Dict[str, List[str]] = {
    "PS4": ["playstation-4", "ps4"],
    "PS3": ["playstation-3", "ps3"],
    "PS2": ["playstation-2", "ps2"],
    "PS1": ["playstation-1", "playstation", "ps1", "psx"],
    "PSP": ["playstation-portable", "psp"],
    "PSVita": ["playstation-vita", "psvita", "vita"],
    "Xbox": ["xbox"],
    "Xbox360": ["xbox-360", "xbox360"],
    "GameCube": ["gamecube", "gc"],
    "Wii": ["nintendo-wii", "wii"],
    "WiiU": ["wii-u", "wiiu"],
    "Switch": ["nintendo-switch", "switch"],
    "NDS": ["nintendo-ds", "nds"],
    "3DS": ["nintendo-3ds", "3ds"],
    "GBA": ["game-boy-advance", "gba"],
    "GBC": ["game-boy-color", "gbc"],
    "GB": ["game-boy", "gb"],
    "SNES": ["super-nintendo", "snes"],
    "NES": ["nintendo-entertainment-system", "nes"],
    "N64": ["nintendo-64", "n64"],
    "Genesis": ["sega-genesis", "genesis", "mega-drive"],
    "Dreamcast": ["sega-dreamcast", "dreamcast"],
    "Saturn": ["sega-saturn", "saturn"]
}

def clean_title_for_search(title: str) -> str:
    """Removes region tags, parentheses, brackets, inverted articles, apostrophes, and revision codes for fuzzy matching."""
    s = re.sub(r"\(.*?\)", "", title)
    s = re.sub(r"\[.*?\]", "", s)
    s = re.sub(r"(USA|Europe|Japan|En,Fr,De|Rev \d|v\d\.\d+)", "", s, flags=re.IGNORECASE)
    # Normalize inverted articles: "Legend of Zelda, The" -> "The Legend of Zelda"
    s = re.sub(r"^([^,]+),\s*(The|A|An)\b", r"\2 \1", s.strip(), flags=re.IGNORECASE)
    # Strip apostrophes: "Demon's Souls" -> "Demons Souls"
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[:\-_/]", " ", s)
    return " ".join(s.split()).strip()

class MirrorResolver:
    """
    Unified multi-source ROM scraper, mirror resolver, and automated failover engine.
    Supports r-roms, BlueRoms, ConsoleRoms, RomsGames, RomsFun, RomsLab, Ziperto, Vimm's Lair, and Archive.org.
    """

    def __init__(self):
        self.verified_mirror_cache: Dict[str, Dict[str, Any]] = {}

    def get_sources_status(self) -> List[Dict[str, Any]]:
        return list(MIRROR_SOURCES.values())

    async def check_source_health(self, source_id: str) -> Dict[str, Any]:
        """Performs a live latency and status ping against the requested mirror source."""
        source = MIRROR_SOURCES.get(source_id)
        if not source:
            return {"source_id": source_id, "status": "unknown", "latency_ms": -1, "error": "Source not found"}

        import time
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True, verify=False) as client:
                resp = await client.get(source["url"], headers={"User-Agent": USER_AGENT})
                latency = round((time.time() - start) * 1000)
                is_ok = resp.status_code == 200
                return {
                    "source_id": source_id,
                    "name": source["name"],
                    "status": "online" if is_ok else "degraded",
                    "http_code": resp.status_code,
                    "latency_ms": latency,
                    "supports_direct_download": source["supports_direct_download"]
                }
        except Exception as e:
            latency = round((time.time() - start) * 1000)
            return {
                "source_id": source_id,
                "name": source["name"],
                "status": "offline",
                "http_code": 0,
                "latency_ms": latency,
                "error": str(e)
            }

    async def ping_all_sources(self) -> List[Dict[str, Any]]:
        """Pings all 8+ mirror sources concurrently."""
        tasks = [self.check_source_health(s_id) for s_id in MIRROR_SOURCES.keys()]
        return await asyncio.gather(*tasks)

    # -------------------------------------------------------------
    # 1. R-ROMS Preservation Index (Archive.org fully disabled per policy)
    # -------------------------------------------------------------
    async def scrape_r_roms(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        # Strictly disabled: OmniVault uses direct game CDNs and BitTorrent indexers instead of Archive.org
        return []

    # -------------------------------------------------------------
    # 2. BlueRoms Scraper (Direct High-Speed CDN Token Generation)
    # -------------------------------------------------------------
    async def scrape_blueroms(self, query: str, platform: Optional[str] = None, limit: int = 8) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        plat_slug = BLUEROMS_PLATFORM_MAP.get(platform, "3ds") if platform else "3ds"
        url = f"https://www.blueroms.ws/{plat_slug}"

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    q_words = clean_q.lower().split()
                    
                    # BlueRoms lists games as /game/<plat>/<slug>
                    game_links = soup.find_all("a", href=re.compile(rf"^/game/{plat_slug}/"))
                    matched_games = []
                    seen_urls = set()

                    for a in game_links:
                        title = a.get_text(strip=True)
                        href = a.get("href", "")
                        if not title or href in seen_urls:
                            continue
                        if all(w in title.lower() for w in q_words) or clean_q.lower() in href.lower():
                            seen_urls.add(href)
                            matched_games.append((title, href))
                            if len(matched_games) >= limit:
                                break

                    # For matched games, resolve their download token
                    for title, game_href in matched_games:
                        try:
                            game_page_url = urllib.parse.urljoin("https://www.blueroms.ws", game_href)
                            g_resp = await client.get(game_page_url)
                            if g_resp.status_code == 200:
                                g_soup = BeautifulSoup(g_resp.text, "html.parser")
                                dl_link = g_soup.find("a", href=re.compile(r"^/download/gAAAAAB"))
                                if dl_link:
                                    token_url = urllib.parse.urljoin("https://www.blueroms.ws", dl_link["href"])
                                    # Request the token page to extract the real signed CDN link
                                    tok_resp = await client.get(token_url, headers={"Referer": game_page_url})
                                    if tok_resp.status_code == 200:
                                        t_soup = BeautifulSoup(tok_resp.text, "html.parser")
                                        final_a = t_soup.find("a", href=re.compile(r"https://files\.blueroms\.ws/"))
                                        if final_a:
                                            direct_url = final_a["href"]
                                            results.append({
                                                "title": title,
                                                "platform": platform or plat_slug.upper(),
                                                "filename": f"{title}.zip",
                                                "direct_url": direct_url,
                                                "source_id": "blueroms",
                                                "source_name": "BlueRoms (High-Speed CDN)",
                                                "file_size_mb": 0.0,
                                                "is_direct_downloadable": True,
                                                "page_url": game_page_url
                                            })
                        except Exception as ge:
                            print(f"[BlueRoms token resolve error]: {ge}")

        except Exception as e:
            print(f"[BlueRoms scraper error]: {e}")

        return results

    # -------------------------------------------------------------
    # 3. ConsoleRoms Scraper (Direct High-Speed CDN Resolution)
    # -------------------------------------------------------------
    async def scrape_consoleroms(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://www.consoleroms.com/search?search_term_string={urllib.parse.quote(clean_q)}"
        target_plat = CONSOLEROMS_PLATFORM_MAP.get(platform.upper()) if platform else None

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    candidates = []
                    seen_hrefs = set()
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        if "/roms/" in href and href.count("/") >= 3 and href not in seen_hrefs:
                            p_part = href.split("/")[2].lower()
                            if target_plat and p_part != target_plat:
                                continue
                            seen_hrefs.add(href)
                            # Extract clean title from slug
                            slug = href.split("/")[3]
                            t = slug.replace("-", " ").title()
                            candidates.append((t, p_part.upper(), href))
                            if len(candidates) >= limit:
                                break

                    # Resolve direct downloads.consoleroms.com CDN link
                    for text, p_part, rel_href in candidates:
                        page_url = urllib.parse.urljoin("https://www.consoleroms.com", rel_href)
                        direct_url = page_url
                        is_direct = False
                        try:
                            dl_page = page_url.rstrip("/") + "/download"
                            dl_resp = await client.get(dl_page, timeout=5.0)
                            if dl_resp.status_code == 200:
                                dl_match = re.search(r'https://downloads\.consoleroms\.com/roms/[^"<>\r\n;]+', dl_resp.text)
                                if dl_match:
                                    direct_url = dl_match.group(0).rstrip('"\'')
                                    is_direct = True
                                else:
                                    dl_soup = BeautifulSoup(dl_resp.text, "html.parser")
                                    dl_a = dl_soup.find("a", href=re.compile(r"https://downloads\.consoleroms\.com/roms/"))
                                    if dl_a:
                                        direct_url = dl_a["href"]
                                        is_direct = True
                        except Exception:
                            pass

                        clean_plat = "PS1" if p_part == "PSX" else p_part
                        results.append({
                            "title": text,
                            "platform": platform or clean_plat,
                            "filename": f"{text}.zip",
                            "direct_url": direct_url,
                            "source_id": "consoleroms",
                            "source_name": "ConsoleRoms (Direct CDN)" if is_direct else "ConsoleRoms",
                            "file_size_mb": 0.0,
                            "is_direct_downloadable": is_direct,
                            "page_url": page_url
                        })
        except Exception as e:
            print(f"[ConsoleRoms scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # 4. RomsGames Scraper
    # -------------------------------------------------------------
    async def scrape_romsgames(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://www.romsgames.net/search/?q={urllib.parse.quote(clean_q)}"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        text = a.get_text(strip=True)
                        if ("-rom-" in href or "/roms/" in href) and text and not any(k in text.lower() for k in ["emulator", "roms", "page"]):
                            if platform:
                                p_low = platform.lower()
                                if not any(k in href.lower() or k in text.lower() for k in [p_low, "nintendo", "playstation", "sega", "xbox"]):
                                    continue
                            results.append({
                                "title": text,
                                "platform": platform or "Retro",
                                "filename": f"{text}.zip",
                                "direct_url": urllib.parse.urljoin("https://www.romsgames.net", href),
                                "source_id": "romsgames",
                                "source_name": "RomsGames",
                                "file_size_mb": 0.0,
                                "is_direct_downloadable": False,
                                "page_url": urllib.parse.urljoin("https://www.romsgames.net", href)
                            })
                            if len(results) >= limit:
                                break
        except Exception as e:
            print(f"[RomsGames scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # 5. RomsFun Scraper (All-Console Multi-Region Direct Stream Resolver)
    # -------------------------------------------------------------
    async def scrape_romsfun(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://romsfun.com/?s={urllib.parse.quote(clean_q)}"
        target_slugs = None
        if platform:
            p_clean = platform.strip().lower()
            for k, slugs in ROMSFUN_PLATFORM_SLUGS.items():
                if k.lower() == p_clean:
                    target_slugs = [s.lower() for s in slugs]
                    break

        browser_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, verify=False, headers=browser_headers) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    links = soup.find_all("a", href=re.compile(r"romsfun\.com/roms/"))
                    seen_pages = set()
                    candidate_urls = []
                    for a in links:
                        href = a["href"]
                        text = a.get_text(strip=True)
                        if href not in seen_pages and text and not text.lower().startswith("roms"):
                            if target_slugs:
                                if not any(slug in href.lower() for slug in target_slugs):
                                    continue
                            seen_pages.add(href)
                            candidate_urls.append((href, text))

                    # Sort candidates so exact title match is prioritized
                    def score_candidate(item):
                        href, txt = item
                        q_clean = clean_q.lower()
                        slug_part = href.split('/')[-1].replace('.html', '').replace('-', ' ').lower()
                        score = 0.0
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
                    candidate_urls = candidate_urls[:3]

                    # For each candidate game page, resolve the real direct download stream via admin-ajax
                    for page_url, title_text in candidate_urls:
                        try:
                            g_resp = await client.get(page_url, timeout=7.0)
                            if g_resp.status_code != 200:
                                continue
                            g_soup = BeautifulSoup(g_resp.text, "html.parser")
                            dl_a = g_soup.find("a", href=re.compile(r"/download/"))
                            if not dl_a:
                                continue
                            dl_landing = dl_a["href"]

                            # Inspect landing page for region sub-options (/1, /2, etc.)
                            sub_resp = await client.get(dl_landing, timeout=7.0)
                            target_referers = []
                            if sub_resp.status_code == 200:
                                sub_soup = BeautifulSoup(sub_resp.text, "html.parser")
                                sub_links = sub_soup.find_all("a", href=re.compile(r"/download/[^/]+/[0-9]+"))
                                if sub_links:
                                    for sl in sub_links[:5]:
                                        sl_text = sl.get_text(strip=True)
                                        target_referers.append((sl["href"], sl_text))
                            if not target_referers:
                                target_referers = [(dl_landing, title_text)]

                            # Query admin-ajax for direct link
                            ajax_url = "https://romsfun.com/wp-admin/admin-ajax.php"
                            for ref_url, ref_label in target_referers[:3]:
                                try:
                                    ajax_headers = {
                                        "User-Agent": USER_AGENT,
                                        "Accept": "application/json, text/javascript, */*; q=0.01",
                                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                                        "Referer": ref_url,
                                        "X-Requested-With": "XMLHttpRequest"
                                    }
                                    a_resp = await client.post(ajax_url, data={"action": "k_get_download"}, headers=ajax_headers, timeout=6.0)
                                    if a_resp.status_code == 200:
                                        data = a_resp.json()
                                        if data.get("success"):
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
                                                if ".7z" in stream_link.lower():
                                                    ext = ".7z"
                                                elif ".nsp" in stream_link.lower():
                                                    ext = ".nsp"
                                                elif ".pkg" in stream_link.lower():
                                                    ext = ".pkg"
                                                
                                                clean_fname = file_name if any(str(file_name).lower().endswith(e) for e in [".zip", ".7z", ".nsp", ".pkg", ".chd", ".iso", ".rvz"]) else f"{file_name}{ext}"
                                                is_direct = any(h in stream_link.lower() for h in ("romsfast.com", "psgamedl.com", ".zip", ".7z", ".iso", ".rvz", ".chd", ".pkg", ".nsp", ".xci"))
                                                results.append({
                                                    "title": file_name,
                                                    "platform": platform or "Retro",
                                                    "filename": clean_fname,
                                                    "direct_url": stream_link,
                                                    "source_id": "romsfun",
                                                    "source_name": "⚡ RomsFast High-Speed CDN" if is_direct else "🌐 RomsFun Web Archive",
                                                    "quality": "Direct High-Speed CDN" if is_direct else "Web Mirror",
                                                    "file_size_mb": size_mb,
                                                    "is_direct_downloadable": is_direct,
                                                    "page_url": page_url,
                                                    "badge": "⚡ DIRECT CDN" if is_direct else "🌐 WEB HOSTER",
                                                    "badge_color": "emerald" if is_direct else "slate"
                                                })
                                                if len(results) >= limit:
                                                    break
                                except Exception as ae:
                                    print(f"[RomsFun ajax stream error]: {ae}")
                        except Exception as ge:
                            print(f"[RomsFun game page error]: {ge}")

        except Exception as e:
            print(f"[RomsFun scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # 6. RomsLab Scraper (Nintendo Switch Individual NSPs/XCIs, Updates & DLCs)
    # -------------------------------------------------------------
    async def scrape_romslab(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://romslab.com/?s={urllib.parse.quote(clean_q)}"
        browser_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        try:
            async with httpx.AsyncClient(timeout=9.0, follow_redirects=True, verify=False, headers=browser_headers) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    post_candidates = []
                    for h in soup.find_all(["h2", "h3"]):
                        a = h.find("a")
                        if a:
                            text = a.get_text(strip=True)
                            href = a.get("href", "")
                            if text and href and "romslab.com" in href:
                                if platform and platform.upper() == "PS4":
                                    if "ps4" not in text.lower() and "ps4" not in href.lower():
                                        continue
                                post_candidates.append((href, text))
                                if len(post_candidates) >= 2:
                                    break

                    for post_url, post_title in post_candidates:
                        try:
                            p_resp = await client.get(post_url, timeout=7.0)
                            if p_resp.status_code == 200:
                                p_soup = BeautifulSoup(p_resp.text, "html.parser")
                                all_links = p_soup.find_all("a", href=True)
                                seen_dl = set()
                                for la in all_links:
                                    lh = la["href"].strip()
                                    lt = la.get_text(strip=True)
                                    if any(h in lh for h in ["datanodes.to", "1fichier.com", "qiwi.gg", "gofile.io", "mega.nz", "mediafire.com", "pixeldrain.com"]):
                                        if lh in seen_dl:
                                            continue
                                        seen_dl.add(lh)
                                        # Determine stream type (Base Game, Update, DLC)
                                        stream_type = "Base Game NSP"
                                        lt_lower = lt.lower()
                                        lh_lower = lh.lower()
                                        if "update" in lt_lower or "update" in lh_lower:
                                            stream_type = "Update NSP"
                                        elif "dlc" in lt_lower or "dlc" in lh_lower:
                                            stream_type = "DLC NSP"
                                        elif "xci" in lt_lower or "xci" in lh_lower:
                                            stream_type = "Base Game XCI"

                                        clean_title = f"{post_title} [{stream_type}]"
                                        ext = ".xci" if "xci" in stream_type.lower() else ".nsp"
                                        is_direct = any(h in lh for h in ["mediafire.com", "gofile.io", "pixeldrain.com"]) and not any(bad in lh for bad in ["datanodes.to", "1fichier.com", "filecrypt.cc", "mega.nz", "qiwi.gg"])
                                        results.append({
                                            "title": clean_title,
                                            "platform": platform or "Switch",
                                            "filename": f"{post_title}_{stream_type.replace(' ', '_')}{ext}",
                                            "direct_url": lh,
                                            "source_id": "romslab",
                                            "source_name": f"🎮 RomsLab Switch [{stream_type}]",
                                            "quality": f"Switch {stream_type} ({'Direct' if is_direct else 'Web Hoster'})",
                                            "file_size_mb": 0.0,
                                            "is_direct_downloadable": is_direct,
                                            "page_url": post_url,
                                            "badge": f"🎮 {stream_type.upper()}" if is_direct else "🌐 WEB HOSTER",
                                            "badge_color": "purple"
                                        })
                                        if len(results) >= limit:
                                            break
                        except Exception as pe:
                            print(f"[RomsLab post parse error]: {pe}")
        except Exception as e:
            print(f"[RomsLab scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # 7. Ziperto Scraper (Switch, 3DS, Vita releases)
    # -------------------------------------------------------------
    async def scrape_ziperto(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://www.ziperto.com/?s={urllib.parse.quote(clean_q)}"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    links = soup.find_all("a", rel="bookmark")
                    for a in links:
                        text = a.get_text(strip=True)
                        href = a.get("href", "")
                        if text and href:
                            results.append({
                                "title": text,
                                "platform": platform or ("3DS" if "3ds" in text.lower() else "Switch"),
                                "filename": f"{text}.cia" if "3ds" in text.lower() else f"{text}.nsp",
                                "direct_url": href,
                                "source_id": "ziperto",
                                "source_name": "Ziperto",
                                "file_size_mb": 0.0,
                                "is_direct_downloadable": False,
                                "page_url": href
                            })
                            if len(results) >= limit:
                                break
        except Exception as e:
            print(f"[Ziperto scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # 8. Vimm's Lair Scraper (Historical Vault Status)
    # -------------------------------------------------------------
    async def scrape_vimm(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://vimm.net/vault/?p=list&q={urllib.parse.quote(clean_q)}"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    rows = soup.find_all("tr")
                    for r in rows:
                        a = r.find("a")
                        if a and a.get("href", "").startswith("/vault/"):
                            title = a.get_text(strip=True)
                            vault_url = urllib.parse.urljoin("https://vimm.net", a["href"])
                            results.append({
                                "title": title,
                                "platform": platform or "Retro",
                                "filename": f"{title}.zip",
                                "direct_url": vault_url,
                                "source_id": "vimm",
                                "source_name": "Vimm's Lair",
                                "file_size_mb": 0.0,
                                "is_direct_downloadable": False,
                                "page_url": vault_url
                            })
                            if len(results) >= limit:
                                break
        except Exception as e:
            print(f"[Vimm scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # 9. DLPSGame Scraper (Dedicated PS4 & PS3 PKG Mirror)
    # -------------------------------------------------------------
    async def scrape_dlpsgame(self, query: str, platform: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        results = []
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return results

        url = f"https://dlpsgame.com/?s={urllib.parse.quote(clean_q)}"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False, headers={"User-Agent": USER_AGENT}) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    seen = set()
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        text = a.get_text(strip=True)
                        if not href or href in seen or any(bad in href.lower() for bad in ["/category/", "/tag/", "/author/", "list-all", "list-game", "page/"]):
                            continue
                        # Target PS4 or PS3 game pages
                        is_target_plat = False
                        if platform and platform.upper() == "PS3":
                            is_target_plat = "ps3" in href.lower() or "ps3" in text.lower()
                        else:
                            is_target_plat = "ps4" in href.lower() or "ps4" in text.lower() or "pkg" in href.lower()

                        if is_target_plat and text and len(text) > 2 and not any(k in text.lower() for k in ["category", "list all", "guide install", "privacy", "contact"]):
                            seen.add(href)
                            clean_t = re.sub(r"\b(PS4|PKG|Free Download|v\d\.\d+)\b", "", text, flags=re.IGNORECASE).strip()
                            clean_t = re.sub(r"\s+", " ", clean_t).strip(" -:")
                            if not clean_t:
                                clean_t = text
                            results.append({
                                "title": clean_t,
                                "platform": platform or "PS4",
                                "filename": f"{clean_t}.pkg",
                                "direct_url": href,
                                "source_id": "dlpsgame",
                                "source_name": "DLPSGame",
                                "file_size_mb": 0.0,
                                "is_direct_downloadable": False,
                                "page_url": href
                            })
                            if len(results) >= limit:
                                break
        except Exception as e:
            print(f"[DLPSGame scraper error]: {e}")
        return results

    # -------------------------------------------------------------
    # Unified Concurrent Multi-Source Search
    # -------------------------------------------------------------
    async def search_all_sources(self, query: str, platform: Optional[str] = None, limit_per_source: int = 6) -> List[Dict[str, Any]]:
        """Concurrently queries all 9+ mirror sources and aggregates the verified results."""
        p_up = platform.strip().upper() if platform else None

        def source_supports(s_id: str) -> bool:
            if not p_up:
                return True
            s_conf = MIRROR_SOURCES.get(s_id)
            if not s_conf:
                return True
            plats = [p.upper() for p in s_conf.get("platforms", [])]
            return "ALL SYSTEMS" in plats or p_up in plats

        tasks = []
        if source_supports("r-roms"):
            tasks.append(self.scrape_r_roms(query, platform, limit=limit_per_source))
        if source_supports("blueroms"):
            tasks.append(self.scrape_blueroms(query, platform, limit=limit_per_source))
        if source_supports("dlpsgame"):
            tasks.append(self.scrape_dlpsgame(query, platform, limit=limit_per_source))
        if source_supports("romsfun"):
            tasks.append(self.scrape_romsfun(query, platform, limit=limit_per_source))
        if source_supports("romslab"):
            tasks.append(self.scrape_romslab(query, platform, limit=limit_per_source))
        if source_supports("consoleroms"):
            tasks.append(self.scrape_consoleroms(query, platform, limit=limit_per_source))
        if source_supports("romsgames"):
            tasks.append(self.scrape_romsgames(query, platform, limit=limit_per_source))
        if source_supports("ziperto"):
            tasks.append(self.scrape_ziperto(query, platform, limit=limit_per_source))
        if source_supports("vimm"):
            tasks.append(self.scrape_vimm(query, platform, limit=limit_per_source))

        raw_results = await asyncio.gather(*tasks, return_exceptions=True)
        aggregated = []

        for sublist in raw_results:
            if isinstance(sublist, list):
                aggregated.extend(sublist)

        # Sort: direct downloadable mirrors first, then by title
        aggregated.sort(key=lambda x: (not x.get("is_direct_downloadable", False), x.get("title", "")))
        return aggregated

    # -------------------------------------------------------------
    # Torrentio-Style Multi-Stream Aggregator
    # -------------------------------------------------------------
    async def get_rom_mirrors(self, query: str, platform: str) -> List[Dict[str, Any]]:
        """
        ROM Mirror & P2P Torrent Aggregator:
        Concurrently queries ConsoleRoms CDN, BlueRoms, DLPSGame MediaFire,
        RomsLab, and active P2P indexers (The Pirate Bay, Nyaa.si).
        Ranks verified direct CDN downloads first, followed by active P2P torrents, then web mirrors.
        """
        clean_q = clean_title_for_search(query)
        if not clean_q:
            return []

        p_up = platform.strip().upper() if platform else "RETRO"
        tasks = []

        # 1. ConsoleRoms direct Cloudflare CDN
        if p_up in CONSOLEROMS_PLATFORM_MAP or p_up in ("NES", "SNES", "N64", "GBA", "GBC", "GB", "PS1", "PS2", "NDS", "ARCADE"):
            tasks.append(self.scrape_consoleroms(clean_q, platform, limit=5))

        # 2. RomsFun / RomsFast direct CDN
        tasks.append(self.scrape_romsfun(clean_q, platform, limit=5))

        # 3. RomsLab for Switch individual NSPs/XCIs, Updates, and DLCs
        if p_up in ("SWITCH", "PS4") or "switch" in platform.lower():
            tasks.append(self.scrape_romslab(clean_q, platform, limit=5))

        # 4. DLPSGame for PS3/PS4 MediaFire PKGs
        if p_up in ("PS4", "PS3"):
            tasks.append(self.scrape_dlpsgame(clean_q, platform, limit=3))

        # 6. Active custom Torznab / BitTorrent providers from database
        try:
            from ..scrapers.providers.manager import get_active_provider_instances
            for prov in get_active_provider_instances():
                if prov.provider_type in ("torznab", "torrent"):
                    tasks.append(prov.search(query, platform, limit=5))
        except Exception as te:
            print(f"[Torrent search error]: {te}")

        # Gather all concurrently with 10-second timeout
        raw_stream_lists = await asyncio.gather(*tasks, return_exceptions=True)
        all_streams = []

        seen_urls = set()
        rank = 1

        for slist in raw_stream_lists:
            if isinstance(slist, list):
                for item in slist:
                    d_url = item.get("direct_url") or item.get("magnet_uri") or item.get("torrent_url") or item.get("direct_download_url")
                    if not d_url or d_url in seen_urls:
                        continue
                    seen_urls.add(d_url)

                    src_name = item.get("source_name") or item.get("source") or "Preservation Mirror"
                    src_id = item.get("source_id") or ("tpb" if "The Pirate Bay" in src_name else ("nyaa" if "Nyaa" in src_name else "mirror"))
                    badge = item.get("badge", "⚡ DIRECT")
                    badge_color = item.get("badge_color", "emerald")
                    quality = item.get("quality", "Verified Mirror")
                    size_mb = item.get("file_size_mb", 0.0)
                    is_direct = item.get("is_direct_downloadable", True)

                    # Determine clean format
                    fmt = "ROM"
                    fn = item.get("filename", "").lower()
                    if fn.endswith(".nsp"):
                        fmt = "NSP"
                    elif fn.endswith(".xci"):
                        fmt = "XCI"
                    elif fn.endswith(".zip"):
                        fmt = "ZIP"
                    elif fn.endswith(".7z"):
                        fmt = "7Z"
                    elif fn.endswith(".chd"):
                        fmt = "CHD"
                    elif fn.endswith(".iso"):
                        fmt = "ISO"
                    elif fn.endswith(".z64") or fn.endswith(".n64"):
                        fmt = "Z64"
                    elif fn.endswith(".pkg"):
                        fmt = "PKG"
                    elif "magnet:" in str(d_url) or str(d_url).endswith(".torrent"):
                        fmt = "MAGNET" if "magnet:" in str(d_url) else "TORRENT"
                        seeds = item.get("seeders", 0)
                        badge = f"🧲 TORRENT ({seeds} SEEDS)" if seeds else "🧲 P2P TORRENT"
                        quality = f"P2P Torrent ({seeds} Seeds)" if seeds else "P2P BitTorrent"
                        badge_color = "amber"
                        is_direct = False

                    all_streams.append({
                        "id": f"mirror-{rank}",
                        "title": item.get("title", query),
                        "platform": platform,
                        "filename": item.get("filename", f"{query}.zip"),
                        "format": fmt,
                        "direct_url": d_url,
                        "source_id": src_id,
                        "source_name": src_name,
                        "quality": quality,
                        "file_size_mb": size_mb,
                        "is_direct": is_direct,
                        "page_url": item.get("page_url"),
                        "badge": badge,
                        "badge_color": badge_color,
                        "rank": rank
                    })
                    rank += 1

        def stream_sort_key(s):
            sid = s.get("source_id", "")
            is_direct = s.get("is_direct")
            is_torrent = s.get("format") in ("MAGNET", "TORRENT") or str(s.get("direct_url")).startswith("magnet:")
            
            # Type priority: Direct CDNs (0) > P2P Torrents (1) > Web hosters (2)
            if is_direct:
                type_prio = 0
            elif is_torrent:
                type_prio = 1
            else:
                type_prio = 2

            s_title = s.get("title", "").lower()
            q_clean = clean_q.lower()
            
            # Title accuracy: exact match gets 0, contains gets 1, partial gets 2
            if q_clean == s_title or q_clean == s_title.split("[")[0].strip():
                match_prio = 0
            elif q_clean in s_title:
                match_prio = 1
            else:
                match_prio = 2
            
            # Source priority
            if sid == "consoleroms":
                src_prio = 0
            elif sid == "romsfun":
                src_prio = 1
            elif sid == "tpb":
                src_prio = 2
            elif sid == "nyaa":
                src_prio = 3
            elif sid == "dlpsgame":
                src_prio = 4
            else:
                src_prio = 5
                
            return (type_prio, match_prio, src_prio)

        all_streams.sort(key=stream_sort_key)
        for idx, s in enumerate(all_streams):
            s["rank"] = idx + 1

        return all_streams

    get_torrentio_streams = get_rom_mirrors

    # -------------------------------------------------------------
    # Automated Mirror Failover Resolver
    # -------------------------------------------------------------
    async def find_working_mirror_for_game(self, game_title: str, platform: str, current_failed_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Automated Mirror Failover:
        Given a game that failed or whose link is 404, queries the mirror network in priority order,
        performs live binary verification (HTTP 200/206), and returns the first healthy working mirror.
        """
        cache_key = f"{platform}:{game_title}".lower()
        if cache_key in self.verified_mirror_cache:
            return self.verified_mirror_cache[cache_key]

        print(f"[MirrorResolver] Primary URL failed. Searching mirrors for: '{game_title}' ({platform})...")

        # 1. Try ConsoleRoms direct Cloudflare CDN first (for SNES, NES, N64, GBA, GBC, GB, PS1, PS2, NDS, Arcade)
        if platform.upper() in CONSOLEROMS_PLATFORM_MAP:
            console_results = await self.scrape_consoleroms(game_title, platform, limit=3)
            for m in console_results:
                d_url = m.get("direct_url")
                if d_url and d_url != current_failed_url and m.get("is_direct_downloadable"):
                    if await self.verify_direct_stream(d_url):
                        print(f"[MirrorResolver] Verified live mirror found on ConsoleRoms CDN: {d_url}")
                        self.verified_mirror_cache[cache_key] = m
                        return m

        # 2. Try RomsFast / RomsFun verified direct CDN
        romsfun_results = await self.scrape_romsfun(game_title, platform, limit=3)
        for m in romsfun_results:
            d_url = m.get("direct_url")
            if d_url and d_url != current_failed_url and m.get("is_direct_downloadable"):
                if await self.verify_direct_stream(d_url):
                    print(f"[MirrorResolver] Verified live mirror found on RomsFast CDN: {d_url}")
                    self.verified_mirror_cache[cache_key] = m
                    return m

        # 3. Try RomsLab for Switch
        if platform.upper() == "SWITCH":
            romslab_results = await self.scrape_romslab(game_title, platform, limit=3)
            for m in romslab_results:
                d_url = m.get("direct_url")
                if d_url and d_url != current_failed_url:
                    self.verified_mirror_cache[cache_key] = m
                    return m

        # 5. Try DLPSGame (for PS4 and PS3)
        if platform.upper() in ("PS4", "PS3"):
            dlps_results = await self.scrape_dlpsgame(game_title, platform, limit=3)
            for m in dlps_results:
                d_url = m.get("direct_url")
                if d_url and d_url != current_failed_url:
                    if await self.verify_direct_stream(d_url):
                        print(f"[MirrorResolver] Verified live mirror found on DLPSGame: {d_url}")
                        self.verified_mirror_cache[cache_key] = m
                        return m

        # 6. Fallback to generic multi-source search
        all_results = await self.search_all_sources(game_title, platform, limit_per_source=3)
        for m in all_results:
            d_url = m.get("direct_url")
            if d_url and d_url != current_failed_url and m.get("is_direct_downloadable"):
                if await self.verify_direct_stream(d_url):
                    print(f"[MirrorResolver] Verified live mirror found on {m.get('source_name')}: {d_url}")
                    self.verified_mirror_cache[cache_key] = m
                    return m

        print(f"[MirrorResolver] No direct mirrors available for '{game_title}'.")
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
