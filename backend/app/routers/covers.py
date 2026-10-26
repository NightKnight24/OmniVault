import ssl
import html
import urllib.parse
import httpx
import re
import os
import hashlib
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException, Response, Request
from fastapi.responses import FileResponse, Response
from typing import Optional, Dict, Any
from ..database import get_db_connection

router = APIRouter(prefix="/api/covers", tags=["Covers"])

WIKIPEDIA_USER_AGENT = "OmniVaultRetroPreservation/2.0 (https://omnivault.org; contact@omnivault.org) python-urllib/3.14"

TITLE_ALIASES = {
    "god of war - koutan no kokuin": "God of War: Chains of Olympus",
    "god of war koutan no kokuin": "God of War: Chains of Olympus",
    "zelda no densetsu - kamigami no triforce": "The Legend of Zelda: A Link to the Past",
    "dairantou smash bros. for nintendo 3ds": "Super Smash Bros. for Nintendo 3DS",
    "dairantou smash bros": "Super Smash Bros.",
    "sonic cd": "Sonic CD",
    "biohazard": "Resident Evil",
    "rockman": "Mega Man",
    "pocket monsters": "Pokemon",
    "akumajou dracula": "Castlevania",
    "seiken densetsu": "Secret of Mana"
}

# Local filesystem covers cache for instant retrieval & offline availability
COVERS_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "covers_cache"
COVERS_CACHE_DIR.mkdir(parents=True, exist_ok=True)

def generate_procedural_cover_svg(title: str, platform: str) -> str:
    safe_title = html.escape(title[:45])
    safe_plat = html.escape((platform or "ROM").upper())
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#080c14" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>
  <rect width="400" height="560" rx="16" fill="url(#bg)" stroke="#334155" stroke-width="4" />
  <rect x="0" y="0" width="400" height="44" rx="16" fill="url(#accent)" />
  <rect x="0" y="20" width="400" height="24" fill="url(#accent)" />
  <text x="20" y="28" font-family="sans-serif" font-weight="900" font-size="14" fill="#000" letter-spacing="2">{safe_plat}</text>
  <text x="380" y="28" font-family="sans-serif" font-weight="bold" font-size="12" fill="#000" text-anchor="end">OFFICIAL PRESERVATION</text>
  
  <circle cx="200" cy="240" r="70" fill="#1e293b" stroke="#06b6d4" stroke-width="3" stroke-dasharray="6 4" />
  <polygon points="185,200 230,240 185,280" fill="#06b6d4" />
  
  <text x="200" y="370" font-family="sans-serif" font-weight="900" font-size="20" fill="#ffffff" text-anchor="middle">{safe_title}</text>
  <text x="200" y="405" font-family="sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">VERIFIED 1G1R ARCHIVE</text>
  
  <rect x="30" y="510" width="340" height="2" fill="#334155" />
  <text x="200" y="535" font-family="sans-serif" font-weight="bold" font-size="10" fill="#64748b" text-anchor="middle" letter-spacing="1">OMNIVAULT DIGITAL ARCHIVE</text>
</svg>'''

# Initialize cached_covers table
def init_covers_table():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS cached_covers (
        title_key TEXT PRIMARY KEY,
        platform TEXT,
        cover_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    conn.close()

init_covers_table()

def get_unscaled_cover_url(thumb_url: str) -> str:
    if not thumb_url:
        return thumb_url
    m = re.match(r"(https://upload\.wikimedia\.org/wikipedia/[^/]+)/thumb/([0-9a-f]/[0-9a-f]{2}/[^/]+)/.*", thumb_url)
    if m:
        return f"{m.group(1)}/{m.group(2)}?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled"
    return thumb_url

def clean_title_for_lookup(title: str) -> tuple:
    t = title.strip()
    # Normalize "Legend of Zelda, The" -> "The Legend of Zelda"
    t = re.sub(r"^(.*?),\s*The\b(.*)$", r"The \1\2", t, flags=re.I)
    t = re.sub(r"^(.*?),\s*A\b(.*)$", r"A \1\2", t, flags=re.I)
    # Strip region / dump tags: (USA), [!], etc.
    t = re.sub(r"\s*[\(\[].*?[\)\]]", "", t).strip()
    if " - " in t:
        t = t.replace(" - ", ": ")
        
    t_lower = t.lower()
    for alias_key, alias_val in TITLE_ALIASES.items():
        if alias_key in t_lower:
            t = alias_val
            break
            
    clean_no_pub = re.sub(r"^(Disney's|Tom Clancy's|LEGO)\s+", "", t, flags=re.I).strip()
    return t, clean_no_pub

@router.get("")
async def get_game_cover(title: str = Query(...), platform: Optional[str] = Query(None)) -> Dict[str, Any]:
    """
    Resolves high-resolution official cover art via cached database and Wikipedia REST & OpenSearch APIs.
    """
    clean_t, clean_no_pub = clean_title_for_lookup(title)
    if not clean_t:
        clean_t = title.strip()
        clean_no_pub = clean_t

    cache_key = f"{clean_t.lower()}_{platform.lower() if platform else ''}"

    # 1. Check local SQLite cache
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT cover_url FROM cached_covers WHERE title_key = ?", (cache_key,))
    row = c.fetchone()
    if row and row["cover_url"]:
        conn.close()
        return {"cover_url": row["cover_url"], "cached": True}

    headers = {"User-Agent": WIKIPEDIA_USER_AGENT}
    candidates = [
        clean_t,
        f"{clean_t} (video game)",
        clean_no_pub if clean_no_pub != clean_t else None,
        f"{clean_no_pub} (video game)" if clean_no_pub != clean_t else None,
        f"{clean_t} (2005 video game)" if "god of war" in clean_t.lower() else None,
        f"{clean_t} ({platform} game)" if platform else None,
        f"{clean_t} (arcade game)" if platform and platform.lower() == "arcade" else None,
    ]

    cover_url = None
    async with httpx.AsyncClient(verify=False, timeout=6.0) as client:
        # Tier 1: Exact Wikipedia REST API page summaries
        for cand in candidates:
            if not cand:
                continue
            enc = urllib.parse.quote(cand.replace(" ", "_"))
            api_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{enc}"
            try:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("type") == "disambiguation":
                        continue
                    img = data.get("thumbnail", {}).get("source") or data.get("originalimage", {}).get("source")
                    if img and not img.lower().endswith(".svg"):
                        cover_url = get_unscaled_cover_url(img)
                        break
            except Exception:
                continue

        # Tier 2: Wikipedia OpenSearch fallback
        if not cover_url:
            for search_term in [clean_t, clean_no_pub]:
                if not search_term:
                    continue
                try:
                    op_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={urllib.parse.quote(search_term)}&limit=5&namespace=0&format=json"
                    resp = await client.get(op_url, headers=headers)
                    if resp.status_code == 200:
                        titles = resp.json()[1]
                        for item_title in titles:
                            enc = urllib.parse.quote(item_title.replace(" ", "_"))
                            sr = await client.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{enc}", headers=headers)
                            if sr.status_code == 200:
                                data = sr.json()
                                if data.get("type") == "disambiguation":
                                    continue
                                img = data.get("thumbnail", {}).get("source") or data.get("originalimage", {}).get("source")
                                if img and not img.lower().endswith(".svg"):
                                    cover_url = get_unscaled_cover_url(img)
                                    break
                    if cover_url:
                        break
                except Exception:
                    pass

    # 3. Store in SQLite cache
    if cover_url:
        c.execute("""
        INSERT OR REPLACE INTO cached_covers (title_key, platform, cover_url)
        VALUES (?, ?, ?)
        """, (cache_key, platform, cover_url))
        conn.commit()

    conn.close()

    if not cover_url:
        return {"cover_url": None, "found": False}

    return {"cover_url": cover_url, "found": True}

@router.api_route("/image", methods=["GET", "HEAD"])
async def get_cover_image(
    request: Request,
    title: str = Query(...),
    platform: Optional[str] = Query(None),
    fallback_url: Optional[str] = Query(None)
):
    """
    High-performance Universal Cover Art Streamer:
    1. Checks local disk cache (<1ms response).
    2. If missing, resolves high-res official artwork via Wikipedia OpenSearch.
    3. If Wikipedia is unavailable, tries secondary fallback URL.
    4. Caches bytes on disk so subsequent requests are instant & offline.
    5. Guaranteed fallback: Returns high-res procedural physical case SVG (Never 404s!).
    Handles both GET and HEAD requests.
    """
    clean_t, _ = clean_title_for_lookup(title)
    cache_key = f"{clean_t.lower()}_{platform.lower() if platform else ''}"
    file_hash = hashlib.md5(cache_key.encode()).hexdigest()
    
    # 1. Check disk cache
    for ext, mime in [(".jpg", "image/jpeg"), (".png", "image/png"), (".webp", "image/webp")]:
        cached_file = COVERS_CACHE_DIR / f"{file_hash}{ext}"
        if cached_file.exists() and cached_file.stat().st_size > 500:
            if request.method == "HEAD":
                return Response(status_code=200, media_type=mime, headers={"Cache-Control": "public, max-age=604800", "Content-Length": str(cached_file.stat().st_size)})
            return FileResponse(cached_file, media_type=mime, headers={"Cache-Control": "public, max-age=604800"})

    # 2. Resolve via Wikipedia OpenSearch + Summaries
    data = await get_game_cover(title=title, platform=platform)
    cover_url = data.get("cover_url")
    
    # 3. If Wikipedia cover found, cache and serve
    if cover_url:
        try:
            headers = {"User-Agent": WIKIPEDIA_USER_AGENT}
            async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                resp = await client.get(cover_url, headers=headers)
                if resp.status_code == 200 and len(resp.content) > 500:
                    content_type = resp.headers.get("content-type", "image/jpeg").lower()
                    ext = ".png" if "png" in content_type else (".webp" if "webp" in content_type else ".jpg")
                    save_path = COVERS_CACHE_DIR / f"{file_hash}{ext}"
                    save_path.write_bytes(resp.content)
                    if request.method == "HEAD":
                        return Response(status_code=200, media_type=content_type, headers={"Cache-Control": "public, max-age=604800", "Content-Length": str(len(resp.content))})
                    return FileResponse(save_path, media_type=content_type, headers={"Cache-Control": "public, max-age=604800"})
        except Exception as e:
            print(f"[Cover Art Cache Error for {title}]: {e}")

    # 4. If Wikipedia had no image, try secondary fallback URL
    if fallback_url and fallback_url.startswith("http"):
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, verify=False) as client:
                f_resp = await client.get(fallback_url, headers={"User-Agent": WIKIPEDIA_USER_AGENT})
                if f_resp.status_code == 200 and len(f_resp.content) > 500:
                    c_type = f_resp.headers.get("content-type", "image/png").lower()
                    ext = ".jpg" if "jpeg" in c_type or "jpg" in c_type else ".png"
                    save_path = COVERS_CACHE_DIR / f"{file_hash}{ext}"
                    save_path.write_bytes(f_resp.content)
                    if request.method == "HEAD":
                        return Response(status_code=200, media_type=c_type, headers={"Cache-Control": "public, max-age=604800", "Content-Length": str(len(f_resp.content))})
                    return FileResponse(save_path, media_type=c_type, headers={"Cache-Control": "public, max-age=604800"})
        except Exception:
            pass

    # 5. Guaranteed fallback: Return high-res procedural physical case SVG (Never 404s!)
    svg = generate_procedural_cover_svg(title, platform or "ROM")
    if request.method == "HEAD":
        return Response(status_code=200, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400", "Content-Length": str(len(svg))})
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})
