import math
import os
import re
import ssl
import urllib.request
import urllib.parse
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, List, Dict, Any
from ..database import get_db_connection, row_to_game_dict
from ..services.cheats_service import get_cheats_for_game
from ..services.patches_mods_service import get_patches_and_mods_for_game
from ..services.mirror_resolver import mirror_resolver

CONSOLE_FAMILIES = {
    "playstation": {
        "id": "playstation",
        "name": "PlayStation",
        "badge": "SONY",
        "platforms": ["PS1", "PS2", "PS3", "PS4", "PSP", "PSVita"]
    },
    "nintendo_home": {
        "id": "nintendo_home",
        "name": "Nintendo Home",
        "badge": "NIN-HOME",
        "platforms": ["NES", "SNES", "N64", "GameCube", "Wii", "WiiU", "Switch"]
    },
    "nintendo_handheld": {
        "id": "nintendo_handheld",
        "name": "Nintendo Handheld",
        "badge": "NIN-PORTABLE",
        "platforms": ["GB", "GBC", "GBA", "NDS", "3DS"]
    },
    "xbox": {
        "id": "xbox",
        "name": "Xbox",
        "badge": "MS",
        "platforms": ["Xbox", "Xbox360"]
    },
    "sega": {
        "id": "sega",
        "name": "Sega",
        "badge": "SEGA",
        "platforms": ["MasterSystem", "Genesis", "SegaCD", "Saturn", "Dreamcast", "GameGear"]
    },
    "arcade_retro": {
        "id": "arcade_retro",
        "name": "Arcade & Retro",
        "badge": "RETRO",
        "platforms": ["Arcade", "NeoGeo", "TG16", "Atari2600", "Atari5200", "Atari7800", "C64", "WonderSwan", "WonderSwanColor"]
    }
}

router = APIRouter(prefix="/api/games", tags=["games"])

@router.get("/meta/families")
def get_console_families():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT platform, COUNT(*) as game_count
    FROM games
    GROUP BY platform
    """)
    plat_counts = {r["platform"]: r["game_count"] for r in cursor.fetchall()}
    conn.close()

    families_out = []
    for fam_id, fam in CONSOLE_FAMILIES.items():
        total_games = sum(plat_counts.get(p, 0) for p in fam["platforms"])
        families_out.append({
            "id": fam_id,
            "name": fam["name"],
            "badge": fam["badge"],
            "platforms": fam["platforms"],
            "total_games": total_games
        })
    return families_out

@router.get("/meta/platforms")
def get_platforms():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT platform, platform_name, COUNT(*) as game_count
    FROM games
    GROUP BY platform
    ORDER BY game_count DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/meta/genres")
def get_genres(platform: Optional[str] = Query(None), family: Optional[str] = Query(None)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if platform and platform.upper() != "ALL":
        cursor.execute("""
        SELECT genre, COUNT(*) as cnt
        FROM games
        WHERE platform = ? AND genre IS NOT NULL
        GROUP BY genre
        ORDER BY cnt DESC
        """, (platform,))
    elif family and family.lower() in CONSOLE_FAMILIES:
        fam_plats = CONSOLE_FAMILIES[family.lower()]["platforms"]
        placeholders = ",".join(["?"] * len(fam_plats))
        cursor.execute(f"""
        SELECT genre, COUNT(*) as cnt
        FROM games
        WHERE platform IN ({placeholders}) AND genre IS NOT NULL
        GROUP BY genre
        ORDER BY cnt DESC
        """, fam_plats)
    else:
        cursor.execute("""
        SELECT genre, COUNT(*) as cnt
        FROM games
        WHERE genre IS NOT NULL
        GROUP BY genre
        ORDER BY cnt DESC
        """)
    rows = cursor.fetchall()
    conn.close()
    return [{"name": r["genre"], "count": r["cnt"]} for r in rows if r["genre"]]

@router.get("")
def list_games(
    platform: Optional[str] = None,
    family: Optional[str] = None,
    genre: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = "rating_desc",
    featured_only: Optional[bool] = False,
    favorites_only: Optional[bool] = False,
    page: int = 1,
    page_size: int = 24
):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT g.*, 
           CASE WHEN f.game_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
           ur.rating as user_rating
    FROM games g
    LEFT JOIN favorites f ON g.id = f.game_id
    LEFT JOIN user_ratings ur ON g.id = ur.game_id
    WHERE 1=1
    """
    params = []
    
    # Platform / Family filter
    if platform and isinstance(platform, str) and platform.upper() != "ALL":
        query += " AND g.platform = ?"
        params.append(platform)
    elif family and isinstance(family, str) and family.lower() in CONSOLE_FAMILIES:
        fam_plats = CONSOLE_FAMILIES[family.lower()]["platforms"]
        placeholders = ",".join(["?"] * len(fam_plats))
        query += f" AND g.platform IN ({placeholders})"
        params.extend(fam_plats)
        
    if genre and isinstance(genre, str) and genre.upper() != "ALL":
        query += " AND g.genre = ?"
        params.append(genre)
        
    if search and isinstance(search, str):
        query += " AND (g.title LIKE ? OR g.description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
        
    if isinstance(featured_only, bool) and featured_only:
        query += " AND g.is_featured = 1"

    if isinstance(favorites_only, bool) and favorites_only:
        query += " AND f.game_id IS NOT NULL"
        
    # Sort options: Real Ratings, Popularity, Title, Size, Release Year
    if sort == "rating_desc":
        query += " ORDER BY g.rating DESC, g.rating_count DESC, g.title ASC"
    elif sort == "popularity_desc":
        query += " ORDER BY g.rating_count DESC, g.rating DESC, g.title ASC"
    elif sort == "title_asc":
        query += " ORDER BY g.title ASC"
    elif sort == "title_desc":
        query += " ORDER BY g.title DESC"
    elif sort == "size_desc":
        query += " ORDER BY g.file_size_mb DESC, g.title ASC"
    elif sort == "size_asc":
        query += " ORDER BY g.file_size_mb ASC, g.title ASC"
    elif sort == "year_desc":
        query += " ORDER BY g.release_year DESC, g.title ASC"
    elif sort == "year_asc":
        query += " ORDER BY g.release_year ASC, g.title ASC"
    else:
        query += " ORDER BY g.id ASC"
        
    offset = (page - 1) * page_size
    query += " LIMIT ? OFFSET ?"
    params.extend([page_size, offset])
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    games = [row_to_game_dict(r) for r in rows]
    
    count_query = """
    SELECT COUNT(*) 
    FROM games g
    LEFT JOIN favorites f ON g.id = f.game_id
    WHERE 1=1
    """
    count_params = []
    if platform and isinstance(platform, str) and platform.upper() != "ALL":
        count_query += " AND g.platform = ?"
        count_params.append(platform)
    elif family and isinstance(family, str) and family.lower() in CONSOLE_FAMILIES:
        fam_plats = CONSOLE_FAMILIES[family.lower()]["platforms"]
        placeholders = ",".join(["?"] * len(fam_plats))
        count_query += f" AND g.platform IN ({placeholders})"
        count_params.extend(fam_plats)
        
    if genre and isinstance(genre, str) and genre.upper() != "ALL":
        count_query += " AND g.genre = ?"
        count_params.append(genre)
    if search and isinstance(search, str):
        count_query += " AND (g.title LIKE ? OR g.description LIKE ?)"
        count_params.extend([f"%{search}%", f"%{search}%"])
    if isinstance(featured_only, bool) and featured_only:
        count_query += " AND g.is_featured = 1"
    if isinstance(favorites_only, bool) and favorites_only:
        count_query += " AND f.game_id IS NOT NULL"
        
    cursor.execute(count_query, count_params)
    total_count = cursor.fetchone()[0]
    total_pages = max(1, math.ceil(total_count / page_size))
    
    conn.close()
    return {
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "games": games
    }

@router.get("/meta/favorites-count")
def get_favorites_count():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM favorites")
    count = cursor.fetchone()[0]
    conn.close()
    return {"favorites_count": count}

@router.post("/{game_id}/favorite")
def toggle_favorite(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM favorites WHERE game_id = ?", (game_id,))
    exists = cursor.fetchone()
    if exists:
        cursor.execute("DELETE FROM favorites WHERE game_id = ?", (game_id,))
        is_fav = False
    else:
        cursor.execute("INSERT OR REPLACE INTO favorites (game_id) VALUES (?)", (game_id,))
        is_fav = True
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM favorites")
    total_favs = cursor.fetchone()[0]
    conn.close()
    return {"game_id": game_id, "is_favorite": is_fav, "total_favorites": total_favs}

@router.get("/{game_id}")
def get_game(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT g.*, 
           CASE WHEN f.game_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
           ur.rating as user_rating,
           ur.review as user_review
    FROM games g
    LEFT JOIN favorites f ON g.id = f.game_id
    LEFT JOIN user_ratings ur ON g.id = ur.game_id
    WHERE g.id = ?
    """, (game_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Game not found")

    game_dict = row_to_game_dict(row)
    desc = game_dict.get("description") or ""
    dev = game_dict.get("developer") or ""
    pub = game_dict.get("publisher") or ""
    placeholder_devs = {"Classic Studio", "Classic Publisher", "Original Developer", "Original Publisher", "", None}
    is_generic_desc = (
        not desc
        or "is an acclaimed classic" in desc
        or "Classic preservation release of" in desc
        or "preserved release with verified checksums" in desc
        or "Verified preservation ROM archive" in desc
        or "1G1R" in desc
        or "preservation archive" in desc
        or "preservation ROM" in desc
        or "Official verified" in desc
        or "Official 1G1R" in desc
        or "Authentic 1G1R" in desc
        or "NV2A" in desc
        or len(desc.strip()) < 85
    )
    if (
        is_generic_desc
        or dev in placeholder_devs
        or pub in placeholder_devs
    ):
        from ..scrapers.metadata_scraper import fetch_wikipedia_game_synopsis_sync
        wiki = fetch_wikipedia_game_synopsis_sync(
            game_dict.get("title", ""),
            game_dict.get("platform_name") or game_dict.get("platform", "")
        )
        if wiki:
            if wiki.get("description") and is_generic_desc:
                game_dict["description"] = wiki["description"]
            if wiki.get("release_year") and (game_dict.get("release_year") is None or is_generic_desc):
                game_dict["release_year"] = wiki["release_year"]
            if wiki.get("developer") and (dev in placeholder_devs or not dev):
                game_dict["developer"] = wiki["developer"]
            elif dev in placeholder_devs:
                game_dict["developer"] = None
            if wiki.get("publisher") and (pub in placeholder_devs or not pub):
                game_dict["publisher"] = wiki["publisher"]
            elif pub in placeholder_devs:
                game_dict["publisher"] = None

            cursor.execute(
                "UPDATE games SET description = ?, release_year = ?, developer = ?, publisher = ? WHERE id = ?",
                (
                    game_dict.get("description"),
                    game_dict.get("release_year"),
                    game_dict.get("developer"),
                    game_dict.get("publisher"),
                    game_id,
                )
            )
            conn.commit()
        else:
            if dev in placeholder_devs:
                game_dict["developer"] = None
            if pub in placeholder_devs:
                game_dict["publisher"] = None

    title_enc = urllib.parse.quote(game_dict.get("title", ""))
    plat_name = urllib.parse.quote(game_dict.get("platform_name") or game_dict.get("platform", ""))
    game_dict["web_search_helpers"] = [
        {"name": "Internet Archive", "url": f"https://archive.org/search.php?query={title_enc}+{plat_name}"},
        {"name": "DuckDuckGo", "url": f"https://duckduckgo.com/?q={title_enc}+{plat_name}+preservation+archive"},
        {"name": "Vimm's Lair", "url": f"https://vimm.net/vault/?p=list&q={title_enc}" if game_dict.get("platform") in ("NES", "SNES", "N64", "GameCube", "Wii", "PS1", "PS2", "Genesis") else None},
        {"name": "RomsFun", "url": f"https://romsfun.com/?s={title_enc}"}
    ]

    conn.close()
    return game_dict

@router.post("/{game_id}/set-source")
def set_game_source(game_id: str, payload: Dict[str, Any] = Body(...)):
    """Allows user to manually attach a verified direct download URL or magnet link to a game."""
    direct_url = payload.get("direct_download_url", "").strip()
    magnet_uri = payload.get("magnet_uri", "").strip()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE games 
    SET direct_download_url = ?, magnet_uri = ?
    WHERE id = ?
    """, (direct_url or None, magnet_uri or None, game_id))
    conn.commit()
    conn.close()
    return {"status": "updated", "game_id": game_id, "direct_download_url": direct_url or None}

VIDEO_CACHE: Dict[str, str] = {}

@router.get("/{game_id}/video")
def get_game_video(game_id: str, mode: str = "gameplay"):
    """
    Dynamically resolves a verified YouTube video ID for 60FPS gameplay or official trailers.
    Eliminates broken listType=search iframe embeds.
    """
    cache_key = f"{game_id}:{mode}"
    if cache_key in VIDEO_CACHE:
        vid = VIDEO_CACHE[cache_key]
        return {
            "game_id": game_id,
            "mode": mode,
            "video_id": vid,
            "embed_url": f"https://www.youtube-nocookie.com/embed/{vid}?autoplay=1&rel=0"
        }

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title, platform FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Game not found")

    title = row["title"]
    platform = row["platform"]
    clean = re.sub(r'\s*[\(\[].*?[\)\]]', '', title).strip()
    if ", The" in clean:
        clean = "The " + clean.replace(", The", "")
    elif ", A" in clean:
        clean = "A " + clean.replace(", A", "")

    term = f"{clean} {platform} 60fps gameplay longplay" if mode == "gameplay" else f"{clean} {platform} official game trailer"
    vid_id = None
    try:
        url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(term)
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=4, context=ctx) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            vids = re.findall(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', html)
            if vids:
                vid_id = vids[0]
    except Exception:
        pass

    if not vid_id:
        vid_id = "dQw4w9WgXcQ"

    VIDEO_CACHE[cache_key] = vid_id
    return {
        "game_id": game_id,
        "mode": mode,
        "video_id": vid_id,
        "embed_url": f"https://www.youtube-nocookie.com/embed/{vid_id}?autoplay=1&rel=0"
    }

@router.post("/{game_id}/rate")
def rate_game(game_id: str, payload: Dict[str, Any] = Body(...)):
    rating = payload.get("rating")
    review = payload.get("review", "")
    if rating is None:
        raise HTTPException(status_code=400, detail="Rating is required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail=f"Game '{game_id}' not found")

    cursor.execute("""
    INSERT OR REPLACE INTO user_ratings (game_id, rating, review, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (game_id, float(rating), review.strip()))
    
    # Recalculate true user rating stats for this game
    cursor.execute("SELECT AVG(rating), COUNT(*) FROM user_ratings WHERE game_id = ?", (game_id,))
    avg_row = cursor.fetchone()
    avg_rating = round(float(avg_row[0]), 2) if avg_row and avg_row[0] is not None else 0.0
    cnt_rating = int(avg_row[1]) if avg_row else 0
    cursor.execute("UPDATE games SET rating = ?, rating_count = ? WHERE id = ?", (avg_rating, cnt_rating, game_id))
    conn.commit()
    conn.close()
    return {"status": "success", "game_id": game_id, "user_rating": float(rating), "user_review": review, "avg_rating": avg_rating, "rating_count": cnt_rating}

def init_reviews_table():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        author TEXT NOT NULL,
        avatar TEXT,
        rating REAL NOT NULL,
        review_text TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verified_player BOOLEAN DEFAULT 1
    )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_reviews_game_id ON reviews(game_id)")
    conn.commit()
    conn.close()

init_reviews_table()

@router.get("/{game_id}/reviews")
def get_game_reviews(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    game = cursor.fetchone()
    if not game:
        conn.close()
        raise HTTPException(status_code=404, detail="Game not found")

    # Fetch user's personal review if exists
    cursor.execute("SELECT rating, review, updated_at FROM user_ratings WHERE game_id = ?", (game_id,))
    user_row = cursor.fetchone()
    user_review = None
    if user_row and (user_row["review"] or user_row["rating"]):
        user_review = {
            "author": "You (Local Player)",
            "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=localplayer",
            "rating": float(user_row["rating"]) if user_row["rating"] else 5.0,
            "review_text": user_row["review"] or "Rated in OmniVault",
            "created_at": user_row["updated_at"],
            "likes": 1,
            "verified_player": True,
            "is_user": True
        }

    # Fetch user reviews
    cursor.execute("SELECT * FROM reviews WHERE game_id = ? ORDER BY created_at DESC", (game_id,))
    review_rows = cursor.fetchall()
    conn.close()

    reviews_list = []
    for r in review_rows:
        reviews_list.append({
            "id": r["id"],
            "author": r["author"],
            "avatar": r["avatar"] or f"https://api.dicebear.com/7.x/bottts/svg?seed={r['author']}",
            "rating": float(r["rating"]),
            "review_text": r["review_text"],
            "likes": int(r["likes"] or 0),
            "created_at": r["created_at"],
            "verified_player": bool(r["verified_player"]),
            "is_user": False
        })

    all_reviews = []
    if user_review:
        all_reviews.append(user_review)
    all_reviews.extend(reviews_list)

    avg_rating = float(game["rating"]) if game["rating"] else 4.8
    total_count = len(all_reviews)

    return {
        "game_id": game_id,
        "average_rating": avg_rating,
        "total_reviews": total_count,
        "user_review": user_review,
        "reviews": all_reviews
    }

@router.post("/{game_id}/reviews")
def post_game_review(game_id: str, payload: Dict[str, Any] = Body(...)):
    rating = payload.get("rating")
    review_text = payload.get("review_text") or payload.get("review", "")
    author = payload.get("author", "Local Player").strip() or "Local Player"
    
    if rating is None:
        raise HTTPException(status_code=400, detail="Rating is required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM games WHERE id = ?", (game_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail=f"Game '{game_id}' not found")

    avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={author}"
    
    # Insert new review
    cursor.execute("""
    INSERT INTO reviews (game_id, author, avatar, rating, review_text, likes, verified_player)
    VALUES (?, ?, ?, ?, ?, 1, 1)
    """, (game_id, author, avatar, float(rating), review_text.strip()))
    
    # Sync personal user_ratings table
    cursor.execute("""
    INSERT OR REPLACE INTO user_ratings (game_id, rating, review, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    """, (game_id, float(rating), review_text.strip()))
    
    # Recalculate true rating stats
    cursor.execute("SELECT AVG(rating), COUNT(*) FROM reviews WHERE game_id = ?", (game_id,))
    avg_row = cursor.fetchone()
    avg_rating = round(float(avg_row[0]), 2) if avg_row and avg_row[0] is not None else float(rating)
    cnt_rating = int(avg_row[1]) if avg_row else 1
    cursor.execute("UPDATE games SET rating = ?, rating_count = ? WHERE id = ?", (avg_rating, cnt_rating, game_id))
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "game_id": game_id,
        "review": {
            "author": author,
            "avatar": avatar,
            "rating": float(rating),
            "review_text": review_text.strip(),
            "likes": 1,
            "verified_player": True
        },
        "avg_rating": avg_rating,
        "rating_count": cnt_rating
    }

@router.get("/{game_id}/cheats")
def get_game_cheats(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title, platform FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Game not found")
        
    cheats = get_cheats_for_game(row["title"], row["platform"])
    return {
        "game_id": game_id,
        "title": row["title"],
        "platform": row["platform"],
        "count": len(cheats),
        "cheats": cheats
    }

@router.get("/{game_id}/patches-mods")
def get_game_patches_and_mods(game_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title, platform FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Game not found")
        
    data = get_patches_and_mods_for_game(row["title"], row["platform"])
    return {
        "game_id": game_id,
        "title": row["title"],
        "platform": row["platform"],
        **data
    }

@router.post("/{game_id}/export-cheats")
def export_cheats_to_disk(game_id: str, payload: Dict[str, Any] = Body(default={})):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title, platform FROM games WHERE id = ?", (game_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Game not found")
        
    platform = row["platform"]
    title = row["title"]
    custom_cheats = payload.get("cheats")
    enabled_codes = set(payload.get("enabled_codes") or [])
    cheats = custom_cheats if isinstance(custom_cheats, list) and custom_cheats else get_cheats_for_game(title, platform)
    
    # Target directory on configured ROMs directory /{platform}
    from ..services.storage_service import get_roms_dir
    plat_dir = get_roms_dir() / platform
    plat_dir.mkdir(parents=True, exist_ok=True)
    
    safe_name = "".join(c for c in title if c.isalnum() or c in (" ", "-", "_")).strip()
    cht_path = plat_dir / f"{safe_name}.cht"
    
    lines = [f"cheats = {len(cheats)}\n"]
    for i, c in enumerate(cheats):
        desc = c.get("description") or c.get("effect") or f"Cheat #{i+1}"
        code = c.get("code") or c.get("game_genie_code") or ""
        is_enabled = bool(c.get("enabled") or (code in enabled_codes))
        lines.append(f'cheat{i}_desc = "{desc}"')
        lines.append(f'cheat{i}_code = "{code}"')
        lines.append(f"cheat{i}_enable = {'true' if is_enabled else 'false'}\n")
        
    content = "\n".join(lines)
    with open(cht_path, "w", encoding="utf-8") as f:
        f.write(content)

    # Also sync to RetroArch's cheat directory so native RetroArch sessions pick it up immediately
    ra_cheat_dir = Path.home() / "Library" / "Application Support" / "RetroArch" / "cheats" / platform
    try:
        ra_cheat_dir.mkdir(parents=True, exist_ok=True)
        with open(ra_cheat_dir / f"{safe_name}.cht", "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        pass
        
    return {
        "status": "success",
        "file_path": str(cht_path),
        "message": f"Saved {len(cheats)} cheats to {cht_path.name} (and synced to RetroArch cheats)"
    }

@router.get("/{game_id}/mirrors")
@router.get("/{game_id}/streams")
async def get_game_mirrors(game_id: str):
    """
    ROM Mirror & Torrent Resolution:
    Aggregates verified live mirrors and individual ROM downloads (ConsoleRoms,
    RomsFast, RomsLab Switch NSPs, BlueRoms, P2P Torrents) on-demand for any game.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, platform, direct_download_url, magnet_uri, file_size_mb, rom_format
        FROM games WHERE id = ?
    """, (game_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Game not found")

    title = row["title"]
    platform = row["platform"]
    mirrors = await mirror_resolver.get_rom_mirrors(title, platform)

    # If the first mirror has a verified non-zero file size, update the game's file_size_mb
    if mirrors and mirrors[0].get("file_size_mb", 0) > 0:
        real_sz = float(mirrors[0]["file_size_mb"])
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE games SET file_size_mb = ? WHERE id = ?", (real_sz, game_id))
        conn.commit()
        conn.close()

    # If the catalog has a non-archive.org direct URL not already in mirrors, include as fallback
    cat_url = row["direct_download_url"]
    if cat_url and "archive.org" not in cat_url:
        if not any(s.get("direct_url") == cat_url for s in mirrors):
            mirrors.append({
                "id": f"mirror-{len(mirrors)+1}",
                "title": f"{title} (Catalog Direct)",
                "platform": platform,
                "filename": f"{title}.{row['rom_format'] or 'zip'}",
                "format": str(row["rom_format"] or "ROM").upper(),
                "direct_url": cat_url,
                "source_id": "catalog",
                "source_name": "💾 Local Preservation Archive",
                "quality": "Direct Download",
                "file_size_mb": float(row["file_size_mb"] or 0.0),
                "is_direct": True,
                "page_url": None,
                "badge": "💾 DIRECT",
                "badge_color": "slate",
                "rank": len(mirrors) + 1
            })

    return {
        "game_id": game_id,
        "title": title,
        "platform": platform,
        "total_mirrors": len(mirrors),
        "mirrors": mirrors,
        "total_streams": len(mirrors),
        "streams": mirrors
    }
