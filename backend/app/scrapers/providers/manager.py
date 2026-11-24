import asyncio
import json
import uuid
from typing import Any, Dict, List, Optional

from ...database import get_db_connection
from .base import BaseSearchProvider
from .json_torrent_provider import JsonTorrentApiProvider
from .rss_torrent_provider import RssTorrentFeedProvider
from .torznab_provider import TorznabSearchProvider

SUPPORTED_PROVIDER_TYPES = ("torznab", "json_torrent_api", "rss_torrent_feed")


def _parse_config(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def get_all_providers() -> List[Dict[str, Any]]:
    """Returns all user-configured BYOS search indexers & torrent feeds."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM custom_providers ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()

    providers_list: List[Dict[str, Any]] = []
    for r in rows:
        cfg_raw = r["config_json"] if "config_json" in r.keys() else "{}"
        providers_list.append({
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "endpoint_url": r["endpoint_url"],
            "api_key": r["api_key"],
            "config": _parse_config(cfg_raw),
            "is_enabled": bool(r["is_enabled"]),
            "is_builtin": False,
        })
    return providers_list


def build_provider_instance(
    provider_id: str,
    name: str,
    provider_type: str,
    endpoint_url: str,
    api_key: str = "",
    config: Optional[Dict[str, Any]] = None,
    is_enabled: bool = True,
) -> BaseSearchProvider:
    ptype = (provider_type or "torznab").strip()
    cfg = config if isinstance(config, dict) else {}
    if ptype == "json_torrent_api":
        return JsonTorrentApiProvider(
            provider_id=provider_id,
            name=name,
            endpoint_url=endpoint_url,
            config=cfg,
            is_enabled=is_enabled,
        )
    if ptype == "rss_torrent_feed":
        return RssTorrentFeedProvider(
            provider_id=provider_id,
            name=name,
            endpoint_url=endpoint_url,
            config=cfg,
            is_enabled=is_enabled,
        )
    return TorznabSearchProvider(
        provider_id=provider_id,
        name=name,
        endpoint_url=endpoint_url,
        api_key=api_key or "",
        is_enabled=is_enabled,
    )


def get_active_provider_instances() -> List[BaseSearchProvider]:
    instances: List[BaseSearchProvider] = []

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM custom_providers WHERE is_enabled = 1 ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()

    for r in rows:
        ptype = (r["type"] or "torznab").strip()
        cfg = _parse_config(r["config_json"] if "config_json" in r.keys() else "{}")
        instances.append(
            build_provider_instance(
                provider_id=r["id"],
                name=r["name"],
                provider_type=ptype,
                endpoint_url=r["endpoint_url"],
                api_key=r["api_key"] or "",
                config=cfg,
                is_enabled=True,
            )
        )

    return instances


async def search_all_providers(query: str, platform: str, limit: int = 15) -> List[Dict[str, Any]]:
    active_instances = get_active_provider_instances()
    if not active_instances:
        return []

    tasks = [p.search(query, platform, limit=limit) for p in active_instances]
    results_lists = await asyncio.gather(*tasks, return_exceptions=True)

    combined: List[Dict[str, Any]] = []
    for res in results_lists:
        if isinstance(res, list):
            combined.extend(res)
        elif isinstance(res, Exception):
            print(f"[Provider Query Exception]: {res}")

    return combined


def add_custom_provider(
    name: str,
    endpoint_url: str,
    api_key: str = "",
    provider_type: str = "torznab",
    config: Optional[Dict[str, Any]] = None,
    provider_id: Optional[str] = None,
    is_enabled: bool = True,
) -> Dict[str, Any]:
    ptype = (provider_type or "torznab").strip()
    if ptype not in SUPPORTED_PROVIDER_TYPES:
        raise ValueError(f"Unsupported provider type '{ptype}'. Must be one of: {', '.join(SUPPORTED_PROVIDER_TYPES)}")

    cleaned_url = endpoint_url.strip()
    cleaned_name = name.strip()
    cleaned_key = (api_key or "").strip()
    cfg_dict = config if isinstance(config, dict) else {}
    cfg_str = json.dumps(cfg_dict)
    enabled_int = 1 if is_enabled else 0

    conn = get_db_connection()
    cursor = conn.cursor()

    existing_id = None
    if provider_id:
        cursor.execute("SELECT id FROM custom_providers WHERE id = ?", (provider_id.strip(),))
        row = cursor.fetchone()
        if row:
            existing_id = row["id"]

    if not existing_id:
        cursor.execute(
            "SELECT id FROM custom_providers WHERE type = ? AND endpoint_url = ?",
            (ptype, cleaned_url),
        )
        row = cursor.fetchone()
        if row:
            existing_id = row["id"]

    final_id = (provider_id.strip() if provider_id else None) or existing_id or f"prov-{uuid.uuid4().hex[:8]}"

    if existing_id:
        cursor.execute(
            """
            UPDATE custom_providers
            SET name = ?, type = ?, endpoint_url = ?, api_key = ?, config_json = ?, is_enabled = ?
            WHERE id = ?
            """,
            (cleaned_name, ptype, cleaned_url, cleaned_key, cfg_str, enabled_int, existing_id),
        )
        final_id = existing_id
    else:
        cursor.execute(
            """
            INSERT INTO custom_providers (id, name, type, endpoint_url, api_key, config_json, is_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (final_id, cleaned_name, ptype, cleaned_url, cleaned_key, cfg_str, enabled_int),
        )

    conn.commit()
    conn.close()
    return {
        "id": final_id,
        "name": cleaned_name,
        "type": ptype,
        "endpoint_url": cleaned_url,
        "config": cfg_dict,
        "is_enabled": bool(enabled_int),
        "is_builtin": False,
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


def add_search_template(
    name: str,
    url_template: str,
    description: str = "",
    template_id: Optional[str] = None,
    is_enabled: bool = True,
) -> Dict[str, Any]:
    cleaned_name = name.strip()
    cleaned_tpl = url_template.strip()
    cleaned_desc = (description or "").strip()
    enabled_int = 1 if is_enabled else 0

    conn = get_db_connection()
    cursor = conn.cursor()

    existing_id = None
    if template_id:
        cursor.execute("SELECT id FROM custom_search_templates WHERE id = ?", (template_id.strip(),))
        row = cursor.fetchone()
        if row:
            existing_id = row["id"]
    if not existing_id:
        cursor.execute("SELECT id FROM custom_search_templates WHERE url_template = ?", (cleaned_tpl,))
        row = cursor.fetchone()
        if row:
            existing_id = row["id"]

    final_id = (template_id.strip() if template_id else None) or existing_id or f"tpl-{uuid.uuid4().hex[:8]}"
    if existing_id:
        cursor.execute(
            """
            UPDATE custom_search_templates
            SET name = ?, url_template = ?, description = ?, is_enabled = ?
            WHERE id = ?
            """,
            (cleaned_name, cleaned_tpl, cleaned_desc, enabled_int, existing_id),
        )
        final_id = existing_id
    else:
        cursor.execute(
            """
            INSERT INTO custom_search_templates (id, name, url_template, description, is_enabled)
            VALUES (?, ?, ?, ?, ?)
            """,
            (final_id, cleaned_name, cleaned_tpl, cleaned_desc, enabled_int),
        )

    conn.commit()
    conn.close()
    return {
        "id": final_id,
        "name": cleaned_name,
        "url_template": cleaned_tpl,
        "description": cleaned_desc,
        "is_enabled": enabled_int,
    }


def delete_search_template(tpl_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM custom_search_templates WHERE id = ?", (tpl_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted
