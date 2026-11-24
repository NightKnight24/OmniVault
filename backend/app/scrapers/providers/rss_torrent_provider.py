import hashlib
import re
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

import httpx

from .base import BaseSearchProvider
from ...services.mirror_resolver import title_matches_game

DEFAULT_PUBLIC_TRACKERS = [
    "udp://open.stealth.si:80/announce",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
]


def _normalize_rss_query(title: str) -> str:
    s = re.sub(r"\(.*?\)", "", title or "")
    s = re.sub(r"\[.*?\]", "", s)
    s = re.sub(r"(USA|Europe|Japan|En,Fr,De|Rev \d|v\d\.\d+)", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^([^,]+),\s*(The|A|An)\b", r"\2 \1", s.strip(), flags=re.IGNORECASE)
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[:\-_/]", " ", s)
    return " ".join(s.split()).strip()


class RssTorrentFeedProvider(BaseSearchProvider):
    """
    Generic user-configured RSS/XML torrent feed adapter (BYOS).
    Queries RSS/XML feeds and extracts magnet URIs (from infoHash or links), sizes, and seeder counts.
    """

    def __init__(
        self,
        provider_id: str,
        name: str,
        endpoint_url: str,
        config: Optional[Dict[str, Any]] = None,
        is_enabled: bool = True,
    ):
        super().__init__(
            provider_id=provider_id,
            name=name,
            provider_type="rss_torrent_feed",
            is_enabled=is_enabled,
        )
        self.endpoint_url = endpoint_url.strip()
        self.config = config if isinstance(config, dict) else {}
        self.rss_query_template = str(self.config.get("rss_query_template") or "?page=rss&q={query}&c=6_0")
        self.trackers = self.config.get("trackers") or DEFAULT_PUBLIC_TRACKERS

    def _build_feed_url(self, q_term: str) -> str:
        encoded = urllib.parse.quote(q_term)
        if "{query}" in self.endpoint_url:
            return self.endpoint_url.replace("{query}", encoded)
        tpl = self.rss_query_template.replace("{query}", encoded)
        if tpl.startswith(("http://", "https://")):
            return tpl
        if tpl.startswith("?"):
            base = self.endpoint_url.rstrip("/")
            sep = "&" if "?" in base else "?"
            return f"{base}{sep}{tpl.lstrip('?')}"
        return urllib.parse.urljoin(self.endpoint_url.rstrip("/") + "/", tpl.lstrip("/"))

    async def test_connection(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False) as client:
                resp = await client.get(self._build_feed_url("test"), headers={"User-Agent": "OmniVault/2.0"})
                if resp.status_code == 200:
                    return {"status": "ok", "message": f"Connected to RSS torrent feed ({self.name})"}
                return {"status": "error", "message": f"Feed returned HTTP {resp.status_code}"}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        clean_q = _normalize_rss_query(query)
        if not clean_q:
            return []

        queries = [clean_q]
        if " - " in query or ":" in query:
            base_raw = query.split(" - ")[0].split(":")[0]
            base_q = _normalize_rss_query(base_raw)
            if base_q and base_q != clean_q:
                queries.append(base_q)

        results: List[Dict[str, Any]] = []
        seen_titles = set()
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) OmniVault/2.0"}
        tr_encoded = "&".join(f"tr={urllib.parse.quote(tr)}" for tr in self.trackers)

        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, verify=False) as client:
                for q_term in queries:
                    url = self._build_feed_url(q_term)
                    resp = await client.get(url, headers=headers)
                    if resp.status_code != 200:
                        continue
                    root = ET.fromstring(resp.text)
                    items = root.findall(".//item")
                    for it in items:
                        title_el = it.find("title")
                        if title_el is None:
                            continue

                        title = (title_el.text or "Unknown Release").strip()
                        if title in seen_titles:
                            continue
                        matched, m_score = title_matches_game(query, title, platform=platform, strict=True)
                        if not matched:
                            continue
                        seen_titles.add(title)

                        link_el = it.find("link")
                        link_val = (link_el.text or "").strip() if link_el is not None else ""
                        enclosure = it.find("enclosure")
                        enc_url = enclosure.get("url", "").strip() if enclosure is not None else ""
                        raw_url = enc_url or link_val

                        seeders = 0
                        leechers = 0
                        info_hash = None
                        size_mb = 0.0

                        if enclosure is not None and enclosure.get("length"):
                            try:
                                size_mb = round(int(enclosure.get("length", "0")) / (1024 * 1024), 2)
                            except Exception:
                                pass

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

                        magnet_uri = None
                        torrent_url = None
                        if info_hash:
                            magnet_uri = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote(title)}"
                            if tr_encoded:
                                magnet_uri = f"{magnet_uri}&{tr_encoded}"
                        elif raw_url.startswith("magnet:"):
                            magnet_uri = raw_url
                        elif raw_url:
                            torrent_url = raw_url

                        digest = hashlib.md5(f"{self.provider_id}:{title}:{info_hash or raw_url}".encode()).hexdigest()[:10]
                        results.append({
                            "id": f"rsstor-{digest}",
                            "title": title,
                            "platform": platform,
                            "platform_name": platform,
                            "source": self.name,
                            "source_name": self.name,
                            "source_id": self.provider_id,
                            "direct_download_url": None,
                            "magnet_uri": magnet_uri,
                            "torrent_url": torrent_url,
                            "file_size_mb": size_mb,
                            "seeders": seeders,
                            "leechers": leechers,
                            "match_score": m_score,
                            "description": f"{self.name} • {seeders} Seeders • {size_mb} MB",
                            "year": None,
                        })

                        if len(results) >= limit:
                            break
                    if len(results) >= limit:
                        break
        except Exception as exc:
            print(f"[RssTorrentFeedProvider '{self.name}' error]: {exc}")

        return results[:limit]
