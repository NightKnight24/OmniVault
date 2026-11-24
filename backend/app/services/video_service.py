import asyncio
import json
import re
import urllib.parse
from typing import Any, Dict, List, Optional

import httpx

from ..database import get_db_connection

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_YT_ID_PATTERNS = (
    re.compile(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:embed/|v/|shorts/|watch\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})"),
    re.compile(r"^([a-zA-Z0-9_-]{11})$"),
)

_inflight_videos: Dict[str, asyncio.Task] = {}


def extract_youtube_id(raw: Optional[str]) -> Optional[str]:
    """Extracts a validated 11-character YouTube video ID from URLs or IDs (ignoring listType=search)."""
    val = (raw or "").strip()
    if not val or "listType=search" in val:
        return None
    for pat in _YT_ID_PATTERNS:
        m = pat.search(val)
        if m:
            return m.group(1)
    return None


def build_video_entry(video_id: Optional[str], title: str = "") -> Optional[Dict[str, str]]:
    vid = extract_youtube_id(video_id)
    if not vid:
        return None
    return {
        "video_id": vid,
        "title": title or "YouTube Video",
        "embed_url": f"https://www.youtube-nocookie.com/embed/{vid}?rel=0&modestbranding=1",
        "watch_url": f"https://www.youtube.com/watch?v={vid}",
        "thumbnail_url": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
    }


def _extract_renderers_from_initial_data(html: str, limit: int) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen = set()
    m = re.search(r"var ytInitialData\s*=\s*(\{.*?\});</script>", html, re.S)
    if m:
        try:
            data = json.loads(m.group(1))
            stack: List[Any] = [data]
            while stack and len(out) < limit:
                node = stack.pop()
                if isinstance(node, dict):
                    vr = node.get("videoRenderer")
                    if isinstance(vr, dict):
                        vid = vr.get("videoId")
                        if vid and len(vid) == 11 and vid not in seen:
                            runs = (vr.get("title") or {}).get("runs") or []
                            vtitle = "".join(r.get("text", "") for r in runs if isinstance(r, dict)).strip()
                            seen.add(vid)
                            out.append({"video_id": vid, "title": vtitle or "Gameplay / Trailer"})
                            if len(out) >= limit:
                                break
                    for v in reversed(list(node.values())):
                        if isinstance(v, (dict, list)):
                            stack.append(v)
                elif isinstance(node, list):
                    for item in reversed(node):
                        if isinstance(item, (dict, list)):
                            stack.append(item)
            if out:
                return out
        except Exception:
            pass

    for match in re.finditer(r'"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"', html):
        vid = match.group(1)
        if vid not in seen:
            seen.add(vid)
            out.append({"video_id": vid, "title": "YouTube Video"})
            if len(out) >= limit:
                break
    return out


async def _search_youtube_videos(query: str, limit: int = 4) -> List[Dict[str, str]]:
    q = (query or "").strip()
    if not q:
        return []
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}"
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True, verify=False) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return []
            return _extract_renderers_from_initial_data(resp.text, limit=limit)
    except Exception as exc:
        print(f"[VideoService YouTube search error for '{q}']: {exc}")
        return []


def _ensure_game_videos_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS game_videos (
            game_id TEXT PRIMARY KEY,
            trailer_id TEXT,
            trailer_title TEXT,
            gameplay_id TEXT,
            gameplay_title TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


async def _resolve_uncached(
    game_id: str,
    title: str,
    platform: str,
    platform_name: str = "",
    existing_trailer_url: Optional[str] = None,
) -> Dict[str, Any]:
    # 1. Read cache briefly and close before HTTP awaits
    conn = get_db_connection()
    cur = conn.cursor()
    _ensure_game_videos_table(cur)
    conn.commit()
    cur.execute("SELECT * FROM game_videos WHERE game_id = ?", (game_id,))
    cached_row = cur.fetchone()
    conn.close()

    if cached_row and cached_row["trailer_id"] and cached_row["gameplay_id"]:
        return {
            "game_id": game_id,
            "trailer": build_video_entry(cached_row["trailer_id"], cached_row["trailer_title"] or f"{title} Trailer"),
            "gameplay": build_video_entry(cached_row["gameplay_id"], cached_row["gameplay_title"] or f"{title} Gameplay"),
            "cached": True,
        }

    trailer_id = (cached_row["trailer_id"] if cached_row else None) or extract_youtube_id(existing_trailer_url)
    trailer_title = (cached_row["trailer_title"] if cached_row else None) or f"{title} Official Trailer"
    gameplay_id = cached_row["gameplay_id"] if cached_row else None
    gameplay_title = (cached_row["gameplay_title"] if cached_row else None) or f"{title} Gameplay"

    clean_t = re.sub(r"\s*[\(\[].*?[\)\]]", "", (title or "").strip()).strip() or (title or "").strip()
    plat_label = (platform_name or platform or "").strip()

    tasks: List[Any] = []
    search_trailer = not bool(trailer_id)
    if search_trailer:
        tasks.append(_search_youtube_videos(f"{clean_t} {plat_label} official trailer", limit=4))
    tasks.append(_search_youtube_videos(f"{clean_t} {plat_label} gameplay", limit=5))

    search_results = await asyncio.gather(*tasks, return_exceptions=True)

    trailer_candidates: List[Dict[str, str]] = []
    gameplay_candidates: List[Dict[str, str]] = []
    if search_trailer:
        if isinstance(search_results[0], list):
            trailer_candidates = search_results[0]
        if len(search_results) > 1 and isinstance(search_results[1], list):
            gameplay_candidates = search_results[1]
    else:
        if isinstance(search_results[0], list):
            gameplay_candidates = search_results[0]

    if not trailer_id:
        if trailer_candidates:
            trailer_id = trailer_candidates[0]["video_id"]
            trailer_title = trailer_candidates[0]["title"]
        elif gameplay_candidates:
            trailer_id = gameplay_candidates[0]["video_id"]
            trailer_title = gameplay_candidates[0]["title"]

    if not gameplay_id and gameplay_candidates:
        distinct = [v for v in gameplay_candidates if v["video_id"] != trailer_id]
        chosen = distinct[0] if distinct else gameplay_candidates[0]
        gameplay_id = chosen["video_id"]
        gameplay_title = chosen["title"]

    if trailer_id or gameplay_id:
        conn = get_db_connection()
        cur = conn.cursor()
        _ensure_game_videos_table(cur)
        cur.execute(
            """
            INSERT INTO game_videos (game_id, trailer_id, trailer_title, gameplay_id, gameplay_title, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(game_id) DO UPDATE SET
                trailer_id = COALESCE(excluded.trailer_id, game_videos.trailer_id),
                trailer_title = COALESCE(excluded.trailer_title, game_videos.trailer_title),
                gameplay_id = COALESCE(excluded.gameplay_id, game_videos.gameplay_id),
                gameplay_title = COALESCE(excluded.gameplay_title, game_videos.gameplay_title),
                updated_at = CURRENT_TIMESTAMP
            """,
            (game_id, trailer_id, trailer_title, gameplay_id, gameplay_title),
        )
        if trailer_id:
            embed_url = f"https://www.youtube-nocookie.com/embed/{trailer_id}?rel=0&modestbranding=1"
            cur.execute("UPDATE games SET trailer_url = ? WHERE id = ?", (embed_url, game_id))
        conn.commit()
        conn.close()

    return {
        "game_id": game_id,
        "trailer": build_video_entry(trailer_id, trailer_title),
        "gameplay": build_video_entry(gameplay_id, gameplay_title),
        "cached": False,
    }


async def resolve_game_videos(
    game_id: str,
    title: str,
    platform: str,
    platform_name: str = "",
    existing_trailer_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Resolves, caches, and returns inline YouTube trailer and gameplay videos for a catalog title."""
    existing_task = _inflight_videos.get(game_id)
    if existing_task and not existing_task.done():
        return await existing_task

    async def _runner() -> Dict[str, Any]:
        try:
            return await _resolve_uncached(
                game_id=game_id,
                title=title,
                platform=platform,
                platform_name=platform_name,
                existing_trailer_url=existing_trailer_url,
            )
        finally:
            _inflight_videos.pop(game_id, None)

    task = asyncio.create_task(_runner())
    _inflight_videos[game_id] = task
    return await task
