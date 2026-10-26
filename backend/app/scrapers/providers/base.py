from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class BaseSearchProvider(ABC):
    def __init__(self, provider_id: str, name: str, provider_type: str = "builtin", is_enabled: bool = True):
        self.provider_id = provider_id
        self.name = name
        self.provider_type = provider_type
        self.is_enabled = is_enabled

    @abstractmethod
    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        """
        Executes a query against the provider source.
        Returns a list of standardized result dictionaries:
        {
            "id": str,
            "title": str,
            "platform": str,
            "platform_name": str,
            "source": str,
            "direct_download_url": Optional[str],
            "magnet_uri": Optional[str],
            "torrent_url": Optional[str],
            "file_size_mb": float,
            "seeders": Optional[int],
            "leechers": Optional[int],
            "description": str,
            "year": Optional[int]
        }
        """
        pass
