import httpx
import xml.etree.ElementTree as ET
import urllib.parse
from typing import List, Dict, Any, Optional
from .base import BaseSearchProvider

class TorznabSearchProvider(BaseSearchProvider):
    def __init__(self, provider_id: str, name: str, endpoint_url: str, api_key: str = "", is_enabled: bool = True):
        super().__init__(
            provider_id=provider_id,
            name=name,
            provider_type="torznab",
            is_enabled=is_enabled
        )
        self.endpoint_url = endpoint_url.strip()
        self.api_key = api_key.strip()

    def _build_url(self, params: Dict[str, str]) -> str:
        parsed = urllib.parse.urlparse(self.endpoint_url)
        existing_params = dict(urllib.parse.parse_qsl(parsed.query))
        existing_params.update(params)
        if self.api_key and "apikey" not in existing_params:
            existing_params["apikey"] = self.api_key
            
        new_query = urllib.parse.urlencode(existing_params)
        return urllib.parse.urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            new_query,
            parsed.fragment
        ))

    async def test_connection(self) -> Dict[str, Any]:
        """Tests caps or basic ping to verify endpoint and API key."""
        test_url = self._build_url({"t": "caps"})
        try:
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
                resp = await client.get(test_url)
                if resp.status_code == 200:
                    return {"status": "ok", "message": "Successfully connected to Torznab endpoint"}
                # Try fallback search ping
                fallback_url = self._build_url({"t": "search", "q": "ping", "limit": "1"})
                resp2 = await client.get(fallback_url)
                if resp2.status_code == 200:
                    return {"status": "ok", "message": "Successfully connected to Torznab endpoint"}
                return {"status": "error", "message": f"Endpoint returned HTTP {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        clean_query = query.strip()
        if not clean_query:
            return []

        search_query = f"{clean_query} {platform}".strip()
        search_url = self._build_url({
            "t": "search",
            "q": search_query,
            "limit": str(limit)
        })

        results = []
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                headers = {"User-Agent": "OmniVault/1.0 Torznab Client"}
                resp = await client.get(search_url, headers=headers)
                if resp.status_code != 200:
                    return []

                content_type = resp.headers.get("content-type", "").lower()
                text = resp.text

                # Parse JSON if returned
                if "json" in content_type or text.strip().startswith("{"):
                    import json
                    try:
                        data = json.loads(text)
                        items = []
                        if isinstance(data, list):
                            items = data
                        elif isinstance(data, dict):
                            channel = data.get("channel", {})
                            items = channel.get("item", []) if isinstance(channel, dict) else data.get("items", [])

                        for item in items:
                            title = item.get("title", "Unknown Title")
                            magnet = item.get("magneturl") or item.get("link") if str(item.get("link", "")).startswith("magnet:") else None
                            torrent_url = item.get("enclosure", {}).get("@url") or item.get("link") if not magnet else None
                            size_bytes = int(item.get("size", 0) or 0)
                            size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0.0
                            seeders = int(item.get("seeders", 0) or 0)
                            
                            results.append({
                                "id": f"torznab-{abs(hash(title))%1000000}",
                                "title": title,
                                "platform": platform,
                                "platform_name": platform,
                                "source": f"{self.name} (Torznab)",
                                "direct_download_url": None,
                                "magnet_uri": magnet,
                                "torrent_url": torrent_url,
                                "file_size_mb": size_mb,
                                "seeders": seeders,
                                "leechers": int(item.get("peers", 0) or 0),
                                "description": f"Retrieved via custom Torznab feed ({self.name}).",
                                "year": None
                            })
                        return results
                    except Exception:
                        pass

                # Parse Torznab XML RSS
                try:
                    root = ET.fromstring(text)
                    channel = root.find("channel")
                    if channel is not None:
                        for item in channel.findall("item"):
                            title_elem = item.find("title")
                            title = title_elem.text if title_elem is not None and title_elem.text else "Unknown"
                            
                            enclosure = item.find("enclosure")
                            torrent_url = enclosure.get("url") if enclosure is not None else None
                            size_bytes = int(enclosure.get("length", 0)) if enclosure is not None and enclosure.get("length") else 0
                            
                            # Check torznab attributes
                            magnet_uri = None
                            seeders = None
                            leechers = None
                            
                            for attr in item.findall("{http://torznab.com/schemas/2015/feed}attr"):
                                name = attr.get("name")
                                val = attr.get("value")
                                if name == "magneturl":
                                    magnet_uri = val
                                elif name == "seeders":
                                    seeders = int(val) if val and val.isdigit() else 0
                                elif name == "peers":
                                    leechers = int(val) if val and val.isdigit() else 0
                                elif name == "size" and not size_bytes:
                                    size_bytes = int(val) if val and val.isdigit() else 0

                            size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0.0

                            results.append({
                                "id": f"torznab-{abs(hash(title))%1000000}",
                                "title": title,
                                "platform": platform,
                                "platform_name": platform,
                                "source": f"{self.name} (Torznab)",
                                "direct_download_url": None,
                                "magnet_uri": magnet_uri,
                                "torrent_url": torrent_url,
                                "file_size_mb": size_mb,
                                "seeders": seeders,
                                "leechers": leechers,
                                "description": f"Retrieved via user-configured Torznab feed ({self.name}).",
                                "year": None
                            })
                except Exception as xml_err:
                    print(f"[Torznab XML Parse Error]: {xml_err}")

        except Exception as e:
            print(f"[Torznab Provider '{self.name}' Error]: {e}")

        return results
