import asyncio
import uuid
from typing import List, Dict, Any, Optional
from ...database import get_db_connection
from .base import BaseSearchProvider
from .torznab_provider import TorznabSearchProvider
from .tpb_provider import ThePirateBaySearchProvider
from .nyaa_provider import NyaaGamesSearchProvider

class RomMirrorSearchProvider(BaseSearchProvider):
    def __init__(self):
        super().__init__(
            provider_id="rom_mirrors",
            name="Direct ROM Mirrors (ConsoleRoms / RomsFast / BlueRoms)",
            provider_type="builtin",
            is_enabled=True
        )

    async def search(self, query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
        from ...services.mirror_resolver import mirror_resolver
        mirrors = await mirror_resolver.get_rom_mirrors(query, platform)
        results = []
        for s in mirrors[:limit]:
            results.append({
                "id": s["id"],
                "title": s["title"],
                "platform": s["platform"],
                "platform_name": s["platform"],
                "source": s["source_name"],
                "direct_download_url": s["direct_url"] if s.get("is_direct") else None,
                "magnet_uri": s["direct_url"] if not s.get("is_direct") else None,
                "torrent_url": None,
                "file_size_mb": s.get("file_size_mb", 0.0),
                "seeders": 25 if not s.get("is_direct") else None,
                "leechers": 2 if not s.get("is_direct") else None,
                "description": f"{s.get('quality', 'Verified Mirror')} • Format: {s.get('format', 'ROM')}",
                "year": None
            })
        return results

def get_all_providers() -> List[Dict[str, Any]]:
    builtin_mirror = RomMirrorSearchProvider()
    builtin_tpb = ThePirateBaySearchProvider()
    builtin_nyaa = NyaaGamesSearchProvider()

    providers_list = [
        {
            "id": builtin_mirror.provider_id,
            "name": builtin_mirror.name,
            "type": builtin_mirror.provider_type,
            "endpoint_url": "https://downloads.consoleroms.com",
            "api_key": None,
            "is_enabled": builtin_mirror.is_enabled,
            "is_builtin": True
        },
        {
            "id": builtin_tpb.provider_id,
            "name": builtin_tpb.name,
            "type": builtin_tpb.provider_type,
            "endpoint_url": "https://apibay.org",
            "api_key": None,
            "is_enabled": builtin_tpb.is_enabled,
            "is_builtin": True
        },
        {
            "id": builtin_nyaa.provider_id,
            "name": builtin_nyaa.name,
            "type": builtin_nyaa.provider_type,
            "endpoint_url": "https://nyaa.si",
            "api_key": None,
            "is_enabled": builtin_nyaa.is_enabled,
            "is_builtin": True
        }
    ]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM custom_providers ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    
    for r in rows:
        providers_list.append({
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "endpoint_url": r["endpoint_url"],
            "api_key": r["api_key"],
            "is_enabled": bool(r["is_enabled"]),
            "is_builtin": False
        })
        
    return providers_list

def get_active_provider_instances() -> List[BaseSearchProvider]:
    instances: List[BaseSearchProvider] = [
        RomMirrorSearchProvider(),
        ThePirateBaySearchProvider(),
        NyaaGamesSearchProvider()
    ]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM custom_providers WHERE is_enabled = 1")
    rows = cursor.fetchall()
    conn.close()
    
    for r in rows:
        if r["type"] == "torznab":
            instances.append(TorznabSearchProvider(
                provider_id=r["id"],
                name=r["name"],
                endpoint_url=r["endpoint_url"],
                api_key=r["api_key"] or "",
                is_enabled=True
            ))
            
    return instances

async def search_all_providers(query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
    active_instances = get_active_provider_instances()
    if not active_instances:
        return []

    tasks = [p.search(query, platform, limit=limit) for p in active_instances]
    results_lists = await asyncio.gather(*tasks, return_exceptions=True)

    combined = []
    for res in results_lists:
        if isinstance(res, list):
            combined.extend(res)
        elif isinstance(res, Exception):
            print(f"[Provider Query Exception]: {res}")

    return combined

def add_custom_provider(name: str, endpoint_url: str, api_key: str = "", provider_type: str = "torznab") -> Dict[str, Any]:
    provider_id = f"prov-{uuid.uuid4().hex[:8]}"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO custom_providers (id, name, type, endpoint_url, api_key, is_enabled)
    VALUES (?, ?, ?, ?, ?, 1)
    """, (provider_id, name.strip(), provider_type, endpoint_url.strip(), api_key.strip()))
    conn.commit()
    conn.close()
    return {
        "id": provider_id,
        "name": name.strip(),
        "type": provider_type,
        "endpoint_url": endpoint_url.strip(),
        "is_enabled": True,
        "is_builtin": False
    }

def delete_custom_provider(provider_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM custom_providers WHERE id = ?", (provider_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def toggle_custom_provider(provider_id: str) -> Optional[bool]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_enabled FROM custom_providers WHERE id = ?", (provider_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    new_state = 0 if row["is_enabled"] else 1
    cursor.execute("UPDATE custom_providers SET is_enabled = ? WHERE id = ?", (new_state, provider_id))
    conn.commit()
    conn.close()
    return bool(new_state)

# ----------------- Custom Search Templates -----------------

def get_search_templates() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM custom_search_templates ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_search_template(name: str, url_template: str, description: str = "") -> Dict[str, Any]:
    tpl_id = f"tpl-{uuid.uuid4().hex[:8]}"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO custom_search_templates (id, name, url_template, description, is_enabled)
    VALUES (?, ?, ?, ?, 1)
    """, (tpl_id, name.strip(), url_template.strip(), description.strip()))
    conn.commit()
    conn.close()
    return {
        "id": tpl_id,
        "name": name.strip(),
        "url_template": url_template.strip(),
        "description": description.strip(),
        "is_enabled": 1
    }

def delete_search_template(tpl_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM custom_search_templates WHERE id = ?", (tpl_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted
