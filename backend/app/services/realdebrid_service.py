import asyncio
import json
import time
import urllib.parse
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx
from ..database import get_db_connection

RD_API_BASE = "https://api.real-debrid.com/rest/1.0"

DEBRID_HOSTER_DOMAINS = (
    "1fichier.com",
    "mega.nz",
    "mega.co.nz",
    "megaup.net",
    "mediafire.com",
    "datanodes.to",
    "rapidgator.net",
    "rg.to",
    "turbobit.net",
    "nitroflare.com",
    "pixeldrain.com",
    "gofile.io",
    "qiwi.gg",
    "katfile.com",
    "ddownload.com",
    "usersdrive.com",
    "send.cm",
)

_NON_GAME_EXTENSIONS = (
    ".txt", ".nfo", ".url", ".jpg", ".jpeg", ".png", ".gif", ".sfv", ".md5", ".srt", ".sub",
)

_NON_FILE_HOSTER_DOMAINS = (
    "youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com",
    "dailymotion.com", "twitch.tv", "tiktok.com", "soundcloud.com",
    "spotify.com", "mixcloud.com", "twitter.com", "x.com", "t.co",
    "instagram.com", "facebook.com", "fb.com", "fb.watch", "reddit.com",
    "redd.it", "imgur.com", "discord.com", "discord.gg", "t.me",
    "telegram.me", "telegram.org", "vk.com", "ok.ru", "bilibili.com",
    "nicovideo.jp", "pornhub.com", "xvideos.com", "patreon.com",
    "ko-fi.com", "paypal.com", "steampowered.com", "steamcommunity.com",
    "epicgames.com", "gog.com", "playstation.com", "nintendo.com",
    "xbox.com", "apple.com", "google.com", "wikipedia.org",
    "github.com", "wordpress.org", "wordpress.com", "gravatar.com",
)


def _is_blocked_non_file_domain(host: str) -> bool:
    clean = (host or "").strip().lower().lstrip(".")
    if not clean:
        return False
    return any(clean == b or clean.endswith(f".{b}") for b in _NON_FILE_HOSTER_DOMAINS)


_LIVE_RD_DOMAINS: Set[str] = set()
_LIVE_RD_DOMAINS_TS: float = 0.0
_DB_DOMAINS_LOADED: bool = False


def _load_cached_domains_from_db() -> Set[str]:
    global _LIVE_RD_DOMAINS, _DB_DOMAINS_LOADED
    if _DB_DOMAINS_LOADED:
        return _LIVE_RD_DOMAINS
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT value FROM settings WHERE key = 'realdebrid_supported_domains'")
        row = c.fetchone()
        conn.close()
        if row and row["value"]:
            parsed = json.loads(row["value"])
            if isinstance(parsed, list):
                _LIVE_RD_DOMAINS.update(
                    str(d).strip().lower().lstrip(".")
                    for d in parsed
                    if str(d).strip() and not _is_blocked_non_file_domain(str(d))
                )
    except Exception:
        pass
    _DB_DOMAINS_LOADED = True
    return _LIVE_RD_DOMAINS


def get_supported_hoster_domains() -> Set[str]:
    """Returns union of built-in debrid hoster domains and live file-hoster domains synced from Real-Debrid."""
    cached = _load_cached_domains_from_db()
    combined = set(DEBRID_HOSTER_DOMAINS) | cached
    return {d for d in combined if not _is_blocked_non_file_domain(d)}


def is_hoster_url(url: str) -> bool:
    host = (urllib.parse.urlparse(url or "").netloc or "").lower().split(":")[0]
    if not host or _is_blocked_non_file_domain(host):
        return False
    domains = get_supported_hoster_domains()
    return any(host == dom or host.endswith(f".{dom}") for dom in domains)


async def refresh_supported_hoster_domains(api_key: Optional[str] = None) -> List[str]:
    """Fetches Real-Debrid's official live supported hoster domain list (~280+ hosters), excluding video/social sites."""
    global _LIVE_RD_DOMAINS, _LIVE_RD_DOMAINS_TS, _DB_DOMAINS_LOADED
    headers = {"User-Agent": "OmniVault/2.0"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key.strip()}"
    try:
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            resp = await client.get(f"{RD_API_BASE}/hosts/domains", headers=headers)
            if resp.status_code == 200:
                raw = resp.json()
                if isinstance(raw, list):
                    cleaned = sorted({
                        str(d).strip().lower().lstrip(".")
                        for d in raw
                        if str(d).strip() and not _is_blocked_non_file_domain(str(d))
                    })
                    if cleaned:
                        _LIVE_RD_DOMAINS = set(cleaned)
                        _LIVE_RD_DOMAINS_TS = time.monotonic()
                        _DB_DOMAINS_LOADED = True
                        conn = get_db_connection()
                        c = conn.cursor()
                        c.execute(
                            """
                            INSERT INTO settings (key, value) VALUES ('realdebrid_supported_domains', ?)
                            ON CONFLICT(key) DO UPDATE SET value = excluded.value
                            """,
                            (json.dumps(cleaned),),
                        )
                        conn.commit()
                        conn.close()
                        return cleaned
    except Exception as exc:
        print(f"[Real-Debrid Domains Sync Note]: {exc}")
    return sorted(get_supported_hoster_domains())


def _get_rd_credentials() -> Dict[str, Any]:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT key, value FROM settings WHERE key IN "
        "('realdebrid_api_key', 'realdebrid_enabled', 'realdebrid_verified', "
        "'realdebrid_username', 'realdebrid_account_type', 'realdebrid_days_left')"
    )
    rows = {r["key"]: r["value"] for r in c.fetchall()}
    conn.close()
    api_key = (rows.get("realdebrid_api_key") or "").strip()
    enabled = rows.get("realdebrid_enabled", "true").lower() == "true"
    verified = bool(api_key) and rows.get("realdebrid_verified", "false").lower() == "true"
    try:
        days_left = float(rows.get("realdebrid_days_left") or 0)
    except (TypeError, ValueError):
        days_left = 0.0
    return {
        "api_key": api_key,
        "enabled": enabled and bool(api_key),
        "verified": verified,
        "username": rows.get("realdebrid_username") or "",
        "account_type": rows.get("realdebrid_account_type") or "",
        "days_left": days_left,
    }


def is_realdebrid_active() -> bool:
    return _get_rd_credentials()["enabled"]


def get_realdebrid_config() -> Dict[str, Any]:
    creds = _get_rd_credentials()
    raw_key = creds["api_key"]
    masked = ""
    if raw_key:
        masked = f"{raw_key[:4]}••••••••{raw_key[-4:]}" if len(raw_key) > 8 else "••••••••"
    return {
        "enabled": creds["enabled"],
        "has_key": bool(raw_key),
        "masked_key": masked,
        "verified": creds["verified"],
        "username": creds["username"],
        "account_type": creds["account_type"],
        "days_left": creds["days_left"],
        "supported_hosts_count": len(get_supported_hoster_domains()),
    }


def _upsert_rd_settings(pairs: Dict[str, str]) -> None:
    conn = get_db_connection()
    c = conn.cursor()
    for k, v in pairs.items():
        c.execute(
            """
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (k, str(v)),
        )
    conn.commit()
    conn.close()


def save_realdebrid_config(api_key: Optional[str] = None, enabled: Optional[bool] = None) -> Dict[str, Any]:
    pairs: Dict[str, str] = {}
    if api_key is not None:
        pairs["realdebrid_api_key"] = api_key.strip()
        if not api_key.strip():
            pairs["realdebrid_verified"] = "false"
    if enabled is not None:
        pairs["realdebrid_enabled"] = "true" if enabled else "false"
    if pairs:
        _upsert_rd_settings(pairs)
    return get_realdebrid_config()


async def test_realdebrid_key(api_key: Optional[str] = None) -> Dict[str, Any]:
    key = (api_key or "").strip() or _get_rd_credentials()["api_key"]
    if not key:
        return {"status": "error", "verified": False, "message": "No Real-Debrid API token provided."}

    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            resp = await client.get(
                f"{RD_API_BASE}/user",
                headers={"Authorization": f"Bearer {key}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                username = data.get("username", "User")
                acct_type = data.get("type", "free")
                premium_secs = int(data.get("premium", 0) or 0)
                days_left = round(premium_secs / 86400, 1) if premium_secs > 0 else 0.0
                is_premium = acct_type.lower() == "premium" or premium_secs > 0
                domains = await refresh_supported_hoster_domains(key)
                return {
                    "status": "ok",
                    "verified": True,
                    "username": username,
                    "account_type": acct_type,
                    "is_premium": is_premium,
                    "days_left": days_left,
                    "supported_hosts_count": len(domains),
                    "message": (
                        f"Verified {username} ({acct_type.upper()}"
                        f"{f', {days_left}d remaining' if days_left > 0 else ''}) • {len(domains)} hosters unlocked"
                    ),
                }
            elif resp.status_code == 401:
                return {"status": "error", "verified": False, "message": "Invalid or expired Real-Debrid API token (HTTP 401)."}
            else:
                return {"status": "error", "verified": False, "message": f"Real-Debrid returned HTTP {resp.status_code}."}
    except Exception as e:
        return {"status": "error", "verified": False, "message": f"Connection failed: {str(e)}"}


async def verify_and_save_realdebrid_config(
    api_key: Optional[str] = None,
    enabled: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Validates the provided or saved Real-Debrid token against /rest/1.0/user before unlocking.
    Syncs supported hoster domains (~282+) upon successful validation.
    """
    existing = _get_rd_credentials()
    new_key = (api_key or "").strip() if api_key is not None else None

    if enabled is False and not new_key:
        _upsert_rd_settings({"realdebrid_enabled": "false"})
        return {
            "status": "ok",
            "verified": existing["verified"],
            "message": "Real-Debrid disabled.",
            "config": get_realdebrid_config(),
        }

    effective_key = new_key if new_key is not None else existing["api_key"]
    if not effective_key:
        if enabled is False:
            _upsert_rd_settings({"realdebrid_enabled": "false"})
            return {
                "status": "ok",
                "verified": False,
                "message": "Real-Debrid disabled.",
                "config": get_realdebrid_config(),
            }
        return {
            "status": "error",
            "verified": False,
            "message": "Please enter a valid Real-Debrid API token.",
            "config": get_realdebrid_config(),
        }

    test_res = await test_realdebrid_key(effective_key)
    if test_res.get("status") != "ok":
        return {
            "status": "error",
            "verified": False,
            "message": test_res.get("message", "Invalid Real-Debrid API token."),
            "config": get_realdebrid_config(),
        }

    enable_val = "false" if enabled is False else "true"
    _upsert_rd_settings({
        "realdebrid_api_key": effective_key,
        "realdebrid_enabled": enable_val,
        "realdebrid_verified": "true",
        "realdebrid_username": str(test_res.get("username") or ""),
        "realdebrid_account_type": str(test_res.get("account_type") or ""),
        "realdebrid_days_left": str(test_res.get("days_left") or 0),
    })
    return {
        "status": "ok",
        "verified": True,
        "message": test_res["message"],
        "config": get_realdebrid_config(),
    }


_RD_CHECK_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_RD_CHECK_CACHE_TTL = 300.0
_RD_DEAD_ERROR_CODES = {16, 19, 24, 30, 35}


async def check_hoster_link(url: str) -> Dict[str, Any]:
    """
    Lightweight pre-check against Real-Debrid /unrestrict/check (with 5-min cache)
    to detect offline/dead hoster files before showing or queueing them.
    """
    clean_url = (url or "").strip()
    if not clean_url:
        return {"status": "unknown"}

    now = time.monotonic()
    cached = _RD_CHECK_CACHE.get(clean_url)
    if cached and (now - cached[0]) < _RD_CHECK_CACHE_TTL:
        return dict(cached[1])

    creds = _get_rd_credentials()
    if not creds["enabled"]:
        return {"status": "unknown"}
    key = creds["api_key"]

    res_out: Dict[str, Any] = {"status": "unknown"}
    should_cache = False
    try:
        async with httpx.AsyncClient(timeout=3.0, verify=False) as client:
            resp = await client.post(
                f"{RD_API_BASE}/unrestrict/check",
                headers={"Authorization": f"Bearer {key}"},
                data={"link": clean_url},
            )
            if resp.status_code == 200:
                data = resp.json() if resp.content else {}
                if int(data.get("supported", 1) or 0) == 0:
                    res_out = {"status": "dead", "reason": "unsupported_hoster"}
                else:
                    res_out = {
                        "status": "ok",
                        "filename": str(data.get("filename") or "").strip(),
                        "filesize": int(data.get("filesize") or 0),
                        "host": str(data.get("host") or "").strip(),
                    }
                should_cache = True
            elif resp.status_code in (400, 404, 410, 503):
                reason = f"http_{resp.status_code}"
                try:
                    err_body = resp.json()
                    reason = str(err_body.get("error") or reason)
                    err_code = err_body.get("error_code")
                    if err_code is not None and int(err_code) in _RD_DEAD_ERROR_CODES:
                        reason = str(err_body.get("error") or f"error_code_{err_code}")
                except Exception:
                    pass
                res_out = {"status": "dead", "reason": reason}
                should_cache = True
            else:
                try:
                    err_body = resp.json()
                    err_code = err_body.get("error_code")
                    if err_code is not None and int(err_code) in _RD_DEAD_ERROR_CODES:
                        res_out = {"status": "dead", "reason": str(err_body.get("error") or f"error_code_{err_code}")}
                        should_cache = True
                except Exception:
                    pass
    except Exception:
        return {"status": "unknown"}

    if should_cache:
        _RD_CHECK_CACHE[clean_url] = (now, res_out)
    return dict(res_out)


async def unrestrict_link(url: str) -> Optional[Dict[str, Any]]:
    creds = _get_rd_credentials()
    if not creds["enabled"]:
        return None
    key = creds["api_key"]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{RD_API_BASE}/unrestrict/link",
                headers={"Authorization": f"Bearer {key}"},
                data={"link": url},
            )
            if resp.status_code == 200:
                data = resp.json()
                dl_url = data.get("download")
                if dl_url:
                    return {
                        "download": dl_url,
                        "filename": data.get("filename"),
                        "filesize": int(data.get("filesize") or 0),
                    }
    except Exception as e:
        print(f"[Real-Debrid Unrestrict Error]: {e}")
    return None


async def resolve_magnet(magnet_uri: str, poll_timeout: float = 20.0) -> Optional[Dict[str, Any]]:
    creds = _get_rd_credentials()
    if not creds["enabled"] or not magnet_uri.startswith("magnet:"):
        return None
    key = creds["api_key"]
    headers = {"Authorization": f"Bearer {key}"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            add_resp = await client.post(
                f"{RD_API_BASE}/torrents/addMagnet",
                headers=headers,
                data={"magnet": magnet_uri},
            )
            if add_resp.status_code not in (200, 201):
                return None
            torrent_id = add_resp.json().get("id")
            if not torrent_id:
                return None

            # Select all files so cached torrents immediately populate links
            await client.post(
                f"{RD_API_BASE}/torrents/selectFiles/{torrent_id}",
                headers=headers,
                data={"files": "all"},
            )

            elapsed = 0.0
            step = 1.5
            while elapsed < poll_timeout:
                info_resp = await client.get(
                    f"{RD_API_BASE}/torrents/info/{torrent_id}",
                    headers=headers,
                )
                if info_resp.status_code == 200:
                    info = info_resp.json()
                    status = info.get("status", "")
                    links = info.get("links") or []
                    if status == "downloaded" and links:
                        candidate_links = list(links)
                        if len(links) > 1:
                            selected_files = [
                                f for f in (info.get("files") or []) if int(f.get("selected") or 0) == 1
                            ]
                            if len(selected_files) == len(links):
                                paired = [
                                    (
                                        not str(f.get("path", "")).lower().endswith(_NON_GAME_EXTENSIONS),
                                        int(f.get("bytes") or 0),
                                        links[idx],
                                    )
                                    for idx, f in enumerate(selected_files)
                                ]
                                paired.sort(key=lambda item: (item[0], item[1]), reverse=True)
                                candidate_links = [item[2] for item in paired]

                        for link in candidate_links[:4]:
                            unrestricted = await unrestrict_link(link)
                            if unrestricted:
                                return unrestricted
                        break
                    if status in ("magnet_error", "error", "virus", "dead"):
                        break
                await asyncio.sleep(step)
                elapsed += step

            # Clean up uncached torrent so user's RD slot isn't left hanging; caller falls back to aria2c
            try:
                await client.delete(f"{RD_API_BASE}/torrents/delete/{torrent_id}", headers=headers)
            except Exception:
                pass
    except Exception as e:
        print(f"[Real-Debrid Magnet Error]: {e}")
    return None
