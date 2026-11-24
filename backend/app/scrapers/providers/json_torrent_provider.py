import hashlib
import re
import urllib.parse
from typing import Any, Dict, List, Optional

import httpx

from .base import BaseSearchProvider
from ...services.mirror_resolver import title_matches_game

DEFAULT_PLATFORM_TAGS: Dict[str, List[str]] = {
    "Xbox360": ["Xbox 360", "XBOX360", "360"],
    "Xbox": ["Xbox"],
    "PS5": ["PS5"],
    "PS3": ["PS3"],
    "PS4": ["PS4"],
    "PS2": ["PS2"],
    "PS1": ["PS1", "PSX"],
    "PSP": ["PSP"],
    "PSVita": ["PSVita", "PS Vita", "Vita"],
    "Windows": ["PC", "Windows"],
    "macOS": ["macOS", "Mac"],
    "Switch": ["Switch", "NSW"],
    "Switch2": ["Switch 2", "Switch2"],
    "Wii": ["Wii"],
    "WiiU": ["Wii U", "WiiU"],
    "GameCube": ["GameCube", "GC"],
    "3DS": ["3DS"],
    "NDS": ["NDS", "DS"],
    "N64": ["N64"],
    "Dreamcast": ["Dreamcast", "DC"],
    "Saturn": ["Saturn"],
    "GBA": ["GBA"],
}

DEFAULT_PUBLIC_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://opentracker.i2p.rocks:6969/announce",
]


def _normalize_query(title: str) -> str:
    s = re.sub(r"\(.*?\)", "", title or "")
    s = re.sub(r"\[.*?\]", "", s)
    s = re.sub(r"(USA|Europe|Japan|En,Fr,De|Rev \d|v\d\.\d+)", "", s, flags=re.IGNORECASE)
    s = re.sub(r"^([^,]+),\s*(The|A|An)\b", r"\2 \1", s.strip(), flags=re.IGNORECASE)
    s = s.replace("'", "").replace("’", "").replace("`", "")
    s = re.sub(r"[:\-_/]", " ", s)
    return " ".join(s.split()).strip()


class JsonTorrentApiProvider(BaseSearchProvider):
    """
    Generic user-configured JSON torrent search API adapter (BYOS).
    Queries any JSON endpoint returning entries with name + info_hash + seeders/size.
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
            provider_type="json_torrent_api",
            is_enabled=is_enabled,
        )
        self.endpoint_url = endpoint_url.strip()
        self.config = config if isinstance(config, dict) else {}
        self.query_param = str(self.config.get("query_param") or "q")
        self.cat_param = str(self.config.get("cat_param") or "cat")
        self.category = self.config.get("category", "400")
        self.platform_tags = self.config.get("platform_tags") or DEFAULT_PLATFORM_TAGS
        self.trackers = self.config.get("trackers") or DEFAULT_PUBLIC_TRACKERS

    def _build_query_url(self, search_term: str) -> str:
        parsed = urllib.parse.urlparse(self.endpoint_url)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        params[self.query_param] = search_term
        if self.cat_param and self.category not in (None, ""):
            params[self.cat_param] = str(self.category)
        new_query = urllib.parse.urlencode(params)
        return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))

    async def test_connection(self) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=7.0, follow_redirects=True, verify=False) as client:
                resp = await client.get(self._build_query_url("test"), headers={"User-Agent": "OmniVault/2.0"})
                if resp.status_code == 200:
                    return {"status": "ok", "message": f"Connected to JSON torrent API ({self.name})"}
                return {"status": "error", "message": f"Endpoint returned HTTP {resp.status_code}"}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        clean_q = _normalize_query(query)
        if not clean_q:
            return []

        p_up = (platform or "").strip().upper()
        if p_up in ("", "ALL", "RETRO"):
            tags = []
        else:
            p_low = platform.strip().lower()
            matched_tags = next(
                (v for k, v in self.platform_tags.items() if str(k).strip().lower() == p_low),
                None,
            )
            tags = matched_tags if matched_tags is not None else [platform]

        query_candidates: List[str] = []
        for tag in tags:
            query_candidates.append(f"{clean_q} {tag}")
        query_candidates.append(clean_q)

        if " - " in query or ":" in query:
            base_raw = query.split(" - ")[0].split(":")[0]
            base_q = _normalize_query(base_raw)
            q_digits = re.findall(r"\b\d+\b", clean_q)
            if (
                base_q
                and base_q != clean_q
                and len(base_q.split()) >= 2
                and all(d in re.findall(r"\b\d+\b", base_q) for d in q_digits)
            ):
                for tag in tags[:1]:
                    query_candidates.append(f"{base_q} {tag}")
                query_candidates.append(base_q)

        unique_queries = list(dict.fromkeys(query_candidates))[:3]
        results: List[Dict[str, Any]] = []
        seen_hashes = set()
        headers = {"User-Agent": "OmniVault/2.0 Torrent Client"}
        tr_encoded = "&".join(f"tr={urllib.parse.quote(tr)}" for tr in self.trackers)

        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, verify=False) as client:
                for search_term in unique_queries:
                    url = self._build_query_url(search_term)
                    resp = await client.get(url, headers=headers)
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    if not isinstance(data, list) or not data:
                        continue

                    for item in data:
                        if not isinstance(item, dict):
                            continue
                        name = item.get("name") or item.get("title")
                        if not name or name == "No results returned":
                            continue
                        matched, m_score = title_matches_game(query, name, platform=platform, strict=True)
                        if not matched:
                            continue
                        info_hash = item.get("info_hash") or item.get("infohash")
                        if not info_hash or info_hash in seen_hashes:
                            continue
                        seen_hashes.add(info_hash)

                        seeders = int(item.get("seeders", 0) or 0)
                        leechers = int(item.get("leechers", 0) or 0)
                        size_bytes = int(item.get("size", 0) or 0)
                        size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0.0

                        magnet_uri = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote(name)}"
                        if tr_encoded:
                            magnet_uri = f"{magnet_uri}&{tr_encoded}"

                        digest = hashlib.md5(f"{self.provider_id}:{info_hash}".encode()).hexdigest()[:10]
                        results.append({
                            "id": f"jsontor-{digest}",
                            "title": name,
                            "platform": platform,
                            "platform_name": platform,
                            "source": self.name,
                            "source_name": self.name,
                            "source_id": self.provider_id,
                            "direct_download_url": None,
                            "magnet_uri": magnet_uri,
                            "torrent_url": None,
                            "file_size_mb": size_mb,
                            "seeders": seeders,
                            "leechers": leechers,
                            "match_score": m_score,
                            "description": f"{self.name} • {seeders} Seeders • {size_mb} MB",
                            "year": None,
                        })

                        if len(results) >= min(limit, 3):
                            break
                    if len(results) >= min(limit, 3):
                        break
        except Exception as exc:
            print(f"[JsonTorrentApiProvider '{self.name}' error]: {exc}")

        return results[:limit]
