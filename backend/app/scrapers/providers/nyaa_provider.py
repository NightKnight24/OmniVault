import httpx
import urllib.parse
import xml.etree.ElementTree as ET
import re
from typing import List, Dict, Any, Optional
from .base import BaseSearchProvider

def normalize_title_for_nyaa(title: str) -> str:
    s = re.sub(r"\(.*?\)", "", title)
    s = re.sub(r"\[.*?\]", "", s)
    s = re.sub(r"(USA|Europe|Japan|En,Fr,De|Rev \d|v\d\.\d+)", "", s, flags=re.IGNORECASE)
    # Normalize inverted articles: "Legend of Zelda, The" -> "The Legend of Zelda"
    s = re.sub(r"^([^,]+),\s*(The|A|An)\b", r"\2 \1", s.strip(), flags=re.IGNORECASE)
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[:\-_/]", " ", s)
    return " ".join(s.split()).strip()

class NyaaGamesSearchProvider(BaseSearchProvider):
    """
    Native BitTorrent Search Provider for Nyaa.si Category 6 (Games).
    Indexes Nintendo Switch NSPs/XCIs, JRPGs, Visual Novels, and translated ROMs.
    Extracts infoHash to construct standard BitTorrent magnet URIs with trackers.
    """
    def __init__(self, is_enabled: bool = True):
        super().__init__(
            provider_id="nyaa_games",
            name="Nyaa.si",
            provider_type="torrent",
            is_enabled=is_enabled
        )
        self.endpoint_url = "https://nyaa.si/"

    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        clean_q = normalize_title_for_nyaa(query)
        if not clean_q:
            return []

        queries = [clean_q]
        if " - " in query or ":" in query:
            base_raw = query.split(" - ")[0].split(":")[0]
            base_q = normalize_title_for_nyaa(base_raw)
            if base_q and base_q != clean_q:
                queries.append(base_q)

        results = []
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) OmniVault/1.0"}

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False) as client:
                for q_term in queries:
                    url = f"{self.endpoint_url}?page=rss&q={urllib.parse.quote(q_term)}&c=6_0"
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        root = ET.fromstring(resp.text)
                        items = root.findall(".//item")
                        for it in items:
                            title_el = it.find("title")
                            link_el = it.find("link")
                            if title_el is None:
                                continue

                            title = title_el.text or "Unknown Release"
                            torrent_url = link_el.text if link_el is not None else ""
                            
                            seeders = 0
                            leechers = 0
                            info_hash = None
                            size_mb = 0.0

                            for child in it:
                                tag = child.tag.lower()
                                if "seeders" in tag:
                                    try:
                                        seeders = int(child.text or 0)
                                    except Exception:
                                        pass
                                elif "leechers" in tag:
                                    try:
                                        leechers = int(child.text or 0)
                                    except Exception:
                                        pass
                                elif "infohash" in tag:
                                    info_hash = (child.text or "").strip()
                                elif "size" in tag:
                                    size_str = (child.text or "").strip()
                                    m_size = re.match(r"([\d\.]+)\s*([GMK]?i?B)", size_str, re.IGNORECASE)
                                    if m_size:
                                        val = float(m_size.group(1))
                                        unit = m_size.group(2).upper()
                                        if "G" in unit:
                                            size_mb = round(val * 1024, 2)
                                        elif "M" in unit:
                                            size_mb = round(val, 2)
                                        elif "K" in unit:
                                            size_mb = round(val / 1024, 2)

                            # Construct magnet URI if infoHash is present
                            magnet_uri = None
                            if info_hash:
                                trackers = [
                                    "http://nyaa.tracker.wf:7777/announce",
                                    "udp://open.stealth.si:80/announce",
                                    "udp://tracker.opentrackr.org:1337/announce",
                                    "udp://tracker.torrent.eu.org:451/announce"
                                ]
                                tr_encoded = "&".join(f"tr={urllib.parse.quote(tr)}" for tr in trackers)
                                magnet_uri = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote(title)}&{tr_encoded}"

                            target_url = magnet_uri or torrent_url

                            results.append({
                                "id": f"nyaa-{abs(hash(title))%1000000}",
                                "title": title,
                                "platform": platform,
                                "platform_name": platform,
                                "source": "Nyaa.si",
                                "source_name": "Nyaa.si",
                                "source_id": "nyaa",
                                "direct_download_url": None,
                                "magnet_uri": magnet_uri,
                                "torrent_url": torrent_url,
                                "direct_url": target_url,
                                "file_size_mb": size_mb,
                                "seeders": seeders,
                                "leechers": leechers,
                                "description": f"Nyaa.si Games • {seeders} Seeders • {size_mb} MB",
                                "year": None
                            })
                            if len(results) >= limit:
                                break
                    if results:
                        break
        except Exception as e:
            print(f"[Nyaa search error]: {e}")

        return results
