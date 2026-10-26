import httpx
import urllib.parse
import re
from typing import List, Dict, Any, Optional
from .base import BaseSearchProvider

PLATFORM_TAGS: Dict[str, List[str]] = {
    "Xbox360": ["Xbox 360", "XBOX360", "360"],
    "Xbox": ["Xbox"],
    "PS3": ["PS3"],
    "PS4": ["PS4"],
    "PS2": ["PS2"],
    "PS1": ["PS1", "PSX"],
    "PSP": ["PSP"],
    "PSVita": ["PSVita", "PS Vita", "Vita"],
    "Switch": ["Switch", "NSW"],
    "Wii": ["Wii"],
    "WiiU": ["Wii U", "WiiU"],
    "GameCube": ["GameCube", "GC"],
    "3DS": ["3DS"],
    "NDS": ["NDS", "DS"],
    "N64": ["N64"],
    "Dreamcast": ["Dreamcast", "DC"],
    "Saturn": ["Saturn"],
    "GBA": ["GBA"]
}

def normalize_title_for_tpb(title: str) -> str:
    s = re.sub(r"\(.*?\)", "", title)
    s = re.sub(r"\[.*?\]", "", s)
    s = re.sub(r"(USA|Europe|Japan|En,Fr,De|Rev \d|v\d\.\d+)", "", s, flags=re.IGNORECASE)
    # Normalize inverted articles: "Legend of Zelda, The" -> "The Legend of Zelda"
    s = re.sub(r"^([^,]+),\s*(The|A|An)\b", r"\2 \1", s.strip(), flags=re.IGNORECASE)
    # Strip apostrophes: "Demon's Souls" -> "Demons Souls"
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[:\-_/]", " ", s)
    return " ".join(s.split()).strip()

class ThePirateBaySearchProvider(BaseSearchProvider):
    """
    Native BitTorrent Search Provider using The Pirate Bay API (apibay.org).
    Queries Category 400 (Games: PC, PSx, Xbox, Wii, Handheld, Romsets)
    with multi-tier title fallback and constructs standard BitTorrent magnet URIs.
    """
    def __init__(self, is_enabled: bool = True):
        super().__init__(
            provider_id="tpb_games",
            name="The Pirate Bay",
            provider_type="torrent",
            is_enabled=is_enabled
        )
        self.endpoint_url = "https://apibay.org/q.php"

    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        clean_q = normalize_title_for_tpb(query)
        if not clean_q:
            return []

        p_up = platform.strip().upper()
        tags = PLATFORM_TAGS.get(platform, [platform]) if p_up not in ("ALL", "RETRO") else []

        # Multi-tier search queries
        query_candidates = []
        for tag in tags:
            query_candidates.append(f"{clean_q} {tag}")
        query_candidates.append(clean_q)

        # If title has subtitle or hyphen, also try base title
        if " - " in query or ":" in query:
            base_raw = query.split(" - ")[0].split(":")[0]
            base_q = normalize_title_for_tpb(base_raw)
            if base_q and base_q != clean_q:
                for tag in tags:
                    query_candidates.append(f"{base_q} {tag}")
                query_candidates.append(base_q)

        # Fallback to first 2 words if multi-word (e.g. "Halo 3 Essentials" -> "Halo 3")
        words = clean_q.split()
        if len(words) >= 3:
            short_q = " ".join(words[:2])
            for tag in tags:
                query_candidates.append(f"{short_q} {tag}")
            query_candidates.append(short_q)

        # Deduplicate candidates preserving order
        unique_queries = list(dict.fromkeys(query_candidates))

        results = []
        seen_hashes = set()
        headers = {"User-Agent": "OmniVault/1.0 Torrent Client"}

        try:
            async with httpx.AsyncClient(timeout=7.0, follow_redirects=True, verify=False) as client:
                for search_term in unique_queries:
                    url = f"{self.endpoint_url}?q={urllib.parse.quote(search_term)}&cat=400"
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        if isinstance(data, list) and data and data[0].get("name") != "No results returned":
                            for item in data:
                                name = item.get("name")
                                if not name or name == "No results returned":
                                    continue
                                info_hash = item.get("info_hash")
                                if not info_hash or info_hash in seen_hashes:
                                    continue
                                seen_hashes.add(info_hash)

                                seeders = int(item.get("seeders", 0) or 0)
                                leechers = int(item.get("leechers", 0) or 0)
                                size_bytes = int(item.get("size", 0) or 0)
                                size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0.0

                                trackers = [
                                    "udp://tracker.opentrackr.org:1337/announce",
                                    "udp://open.stealth.si:80/announce",
                                    "udp://tracker.torrent.eu.org:451/announce",
                                    "udp://tracker.openbittorrent.com:6969/announce",
                                    "udp://opentracker.i2p.rocks:6969/announce"
                                ]
                                tr_encoded = "&".join(f"tr={urllib.parse.quote(tr)}" for tr in trackers)
                                magnet_uri = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote(name)}&{tr_encoded}"

                                results.append({
                                    "id": f"tpb-{info_hash[:8]}",
                                    "title": name,
                                    "platform": platform,
                                    "platform_name": platform,
                                    "source": "The Pirate Bay",
                                    "source_name": "The Pirate Bay",
                                    "source_id": "tpb",
                                    "direct_download_url": None,
                                    "magnet_uri": magnet_uri,
                                    "torrent_url": None,
                                    "direct_url": magnet_uri,
                                    "file_size_mb": size_mb,
                                    "seeders": seeders,
                                    "leechers": leechers,
                                    "description": f"The Pirate Bay • {seeders} Seeders • {size_mb} MB",
                                    "year": None
                                })
                                if len(results) >= limit:
                                    break
                    if results:
                        # Found sufficient results on this tier
                        break
        except Exception as e:
            print(f"[TPB search error]: {e}")

        return results
