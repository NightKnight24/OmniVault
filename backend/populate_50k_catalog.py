import os
import re
import ssl
import json
import sqlite3
import hashlib
import urllib.request
import urllib.parse
from typing import Dict, Any, List

ctx = ssl._create_unverified_context()
DB_PATH = "/Volumes/ROMS/OmniVault-Source/backend/data/vault.db"

print("=== Starting 50,000+ Game Ingestion across All Platforms & Mirrors ===")

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.execute("SELECT COUNT(*) FROM games")
initial_count = c.fetchone()[0]
print(f"Current Vault Game Count: {initial_count}")

# Fetch existing IDs to avoid duplicates
c.execute("SELECT id FROM games")
existing_ids = set(r[0] for r in c.fetchall())

# Fetch Arcade driver-to-title map from FBNeo / MAME metadata
print("-> Loading Arcade 1G1R title mapping...")
arcade_title_map: Dict[str, Dict[str, Any]] = {}
try:
    url = "https://raw.githubusercontent.com/libretro/FBNeo/master/dats/FinalBurn%20Neo%20(ClrMame%20Pro%20XML%2C%20Arcade%20only).dat"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
        import xml.etree.ElementTree as ET
        tree = ET.parse(resp)
        root = tree.getroot()
        for g in root.findall("game"):
            name = g.attrib.get("name")
            desc = g.findtext("description")
            year = g.findtext("year")
            mfg = g.findtext("manufacturer")
            if name and desc:
                arcade_title_map[name.lower()] = {
                    "title": desc,
                    "year": int(year) if year and year.isdigit() else 1993,
                    "developer": mfg
                }
except Exception as e:
    print(f"   [Warning loading FBNeo DAT]: {e}")

print(f"   Mapped {len(arcade_title_map)} arcade titles.")

COLLECTIONS_TO_POPULATE = [
    {
        "platform": "Arcade",
        "platform_name": "Arcade Classics",
        "collection": "mame-merged",
        "repo": "MAME",
        "default_ext": ".zip",
        "default_year": 1993,
        "valid_exts": (".zip", ".7z")
    },
    {
        "platform": "Arcade",
        "platform_name": "Arcade Classics",
        "collection": "fbnarcade-fullnonmerged",
        "repo": "FBNeo_-_Arcade_Games",
        "default_ext": ".zip",
        "default_year": 1995,
        "valid_exts": (".zip", ".7z")
    },
    {
        "platform": "Arcade",
        "platform_name": "Arcade Classics",
        "collection": "MAME0.139RomCollectionByGhostware",
        "repo": "MAME",
        "default_ext": ".zip",
        "default_year": 1994,
        "valid_exts": (".zip", ".7z")
    },
    {
        "platform": "PS2",
        "platform_name": "Sony PlayStation 2",
        "collection": "RedumpSonyPS2NTSCU",
        "repo": "Sony_-_PlayStation_2",
        "default_ext": ".iso",
        "default_year": 2003,
        "valid_exts": (".7z", ".iso", ".zip")
    },
    {
        "platform": "PS2",
        "platform_name": "Sony PlayStation 2",
        "collection": "RedumpSonyPS2NTSCUPart2",
        "repo": "Sony_-_PlayStation_2",
        "default_ext": ".iso",
        "default_year": 2004,
        "valid_exts": (".7z", ".iso", ".zip")
    },
    {
        "platform": "PS2",
        "platform_name": "Sony PlayStation 2",
        "collection": "PS2CollectionPart1ByGhostware",
        "repo": "Sony_-_PlayStation_2",
        "default_ext": ".iso",
        "default_year": 2002,
        "valid_exts": (".7z", ".iso", ".zip")
    },
    {
        "platform": "3DS",
        "platform_name": "Nintendo 3DS",
        "collection": "3ds-main-encrypted",
        "repo": "Nintendo_-_Nintendo_3DS",
        "default_ext": ".cia",
        "default_year": 2013,
        "valid_exts": (".7z", ".cia", ".3ds", ".zip")
    },
    {
        "platform": "PSVita",
        "platform_name": "PlayStation Vita",
        "collection": "sony-playstation-vita-usa-full-set-nonpdrm-format",
        "repo": "Sony_-_PlayStation_Vita",
        "default_ext": ".vpk",
        "default_year": 2013,
        "valid_exts": (".zip", ".7z", ".vpk")
    },
    {
        "platform": "Wii",
        "platform_name": "Nintendo Wii",
        "collection": "Wii-p2-US-Arquivista",
        "repo": "Nintendo_-_Wii",
        "default_ext": ".rvz",
        "default_year": 2008,
        "valid_exts": (".rvz", ".iso", ".zip")
    },
    {
        "platform": "Wii",
        "platform_name": "Nintendo Wii",
        "collection": "Wii-p3-US-Arquivista",
        "repo": "Nintendo_-_Wii",
        "default_ext": ".rvz",
        "default_year": 2009,
        "valid_exts": (".rvz", ".iso", ".zip")
    },
    {
        "platform": "WonderSwan",
        "platform_name": "Bandai WonderSwan",
        "collection": "nointro.ws",
        "repo": "Bandai_-_WonderSwan",
        "default_ext": ".ws",
        "default_year": 1999,
        "valid_exts": (".zip", ".7z", ".ws")
    },
    {
        "platform": "WonderSwanColor",
        "platform_name": "Bandai WonderSwan Color",
        "collection": "nointro.wsc",
        "repo": "Bandai_-_WonderSwan_Color",
        "default_ext": ".wsc",
        "default_year": 2001,
        "valid_exts": (".zip", ".7z", ".wsc")
    },
    {
        "platform": "Atari5200",
        "platform_name": "Atari 5200",
        "collection": "nointro.atari-5200",
        "repo": "Atari_-_5200",
        "default_ext": ".a52",
        "default_year": 1983,
        "valid_exts": (".zip", ".7z", ".a52")
    },
    {
        "platform": "C64",
        "platform_name": "Commodore 64",
        "collection": "nointro.c64",
        "repo": "Commodore_-_64",
        "default_ext": ".d64",
        "default_year": 1985,
        "valid_exts": (".zip", ".7z", ".d64")
    }
]

total_added = 0

for source in COLLECTIONS_TO_POPULATE:
    collection = source["collection"]
    platform = source["platform"]
    platform_name = source["platform_name"]
    repo = source["repo"]
    default_ext = source["default_ext"]
    default_year = source["default_year"]
    valid_exts = source["valid_exts"]
    
    print(f"\n-> Fetching catalog from '{collection}' for {platform_name}...")
    url = f"https://archive.org/metadata/{collection}/files"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            files = data.get("result", [])
    except Exception as e:
        print(f"   [Error fetching {collection}]: {e}")
        continue
        
    print(f"   Retrieved {len(files)} files. Filtering valid 1G1R titles...")
    
    added_for_source = 0
    seen_source_titles = set()
    
    for f in files:
        fname = f.get("name", "")
        if fname.startswith(".") or fname.endswith((".xml", ".sqlite", ".torrent", ".txt", ".nfo", ".jpg", ".png", "_thumb.jpg")):
            continue
        if not fname.lower().endswith(valid_exts):
            continue
            
        # Clean title & stem
        raw_stem = os.path.splitext(fname.split("/")[-1])[0]
        
        # Determine clean game title & year
        dev = None
        if platform == "Arcade":
            lookup_key = raw_stem.lower()
            if lookup_key in arcade_title_map:
                info = arcade_title_map[lookup_key]
                title = info["title"]
                year = info["year"]
                dev = info["developer"]
            else:
                title = raw_stem.replace("_", " ").title()
                year = default_year
        else:
            stem_clean = re.sub(r"\[.*?\]", "", raw_stem)
            title = re.split(r"\(", stem_clean)[0].strip()
            if not title:
                title = raw_stem
            year_match = re.search(r"\((19\d\d|20[0-2]\d)\)", fname)
            year = int(year_match.group(1)) if year_match else default_year

        # 1G1R Deduplication: check if title already seen for this platform
        title_key = f"{platform}:{title}".lower()
        if title_key in seen_source_titles:
            continue
        seen_source_titles.add(title_key)
        
        clean_slug_name = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-")
        slug = f"{platform.lower()}-{clean_slug_name[:40]}"
        
        if slug in existing_ids:
            continue
            
        # Classify genre
        title_l = title.lower()
        if any(w in title_l for w in ["mario", "sonic", "crash", "rayman", "megaman", "castlevania"]):
            genre = "Platformer"
        elif any(w in title_l for w in ["kart", "racing", "speed", "gran turismo", "rally", "burnout"]):
            genre = "Racing"
        elif any(w in title_l for w in ["fighter", "street fighter", "tekken", "mortal kombat", "king of fighters", "fatal fury"]):
            genre = "Fighting"
        elif any(w in title_l for w in ["fantasy", "zelda", "dragon quest", "pokemon", "rpg", "persona", "chrono"]):
            genre = "RPG"
        elif any(w in title_l for w in ["fifa", "nba", "nfl", "soccer", "tennis", "golf", "hockey", "baseball"]):
            genre = "Sports"
        elif any(w in title_l for w in ["doom", "quake", "halo", "resident evil", "silent hill", "metal gear"]):
            genre = "Action"
        elif any(w in title_l for w in ["puzzle", "tetris", "puyo", "mahjong"]):
            genre = "Puzzle"
        else:
            genre = "Arcade" if platform == "Arcade" else "Action"
            
        # File size
        size_bytes = int(f.get("size", 0) or 0)
        size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0.0
        
        # Download and magnet URL (resolved dynamically via mirror_resolver / Torznab; never synthesize fake hashes)
        direct_url = None
        magnet_uri = None
        
        # Box art and screenshots
        quoted_box = urllib.parse.quote(raw_stem)
        box_art_2d = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{quoted_box}.png"
        snap = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Snaps/{quoted_box}.png"
        screenshots = json.dumps([snap, box_art_2d])
        
        ext = os.path.splitext(fname)[1] or default_ext
        clean_ext = ext.lstrip('.')
        description = f"{title} ({platform_name}) — Verified 1G1R preservation archive ({clean_ext.upper()}, {size_mb} MB)."
        
        quoted_search = urllib.parse.quote(f"{title} {platform_name} gameplay")
        trailer_url = f"https://www.youtube.com/embed?listType=search&list={quoted_search}&autoplay=0"
        
        c.execute("""
        INSERT OR REPLACE INTO games (
            id, title, slug, platform, platform_name, genre, release_year,
            developer, publisher, rating, rating_count, description,
            box_art_2d, box_art_3d, backdrop, trailer_url, screenshots,
            direct_download_url, magnet_uri, file_size_mb, rom_format, is_featured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            slug, title, slug, platform, platform_name,
            genre, year, dev, None,
            0.0, 0, description,
            box_art_2d, box_art_2d, snap, trailer_url, screenshots,
            direct_url, magnet_uri, size_mb, ext, 0
        ))
        
        existing_ids.add(slug)
        added_for_source += 1
        total_added += 1
        
        if added_for_source % 250 == 0:
            conn.commit()
            print(f"      ...indexed {added_for_source} games for {platform} ({collection})...")
            
    conn.commit()
    print(f"   ✓ Inserted {added_for_source} games from '{collection}' (Total in Vault: {len(existing_ids)})")

conn.close()

print("\n==================================================================")
print(f"   INGESTION COMPLETE! Added {total_added} 1G1R games.")
conn = sqlite3.connect(DB_PATH)
new_total = conn.cursor().execute("SELECT COUNT(*) FROM games").fetchone()[0]
conn.close()
print(f"   FINAL STOREFRONT VAULT GAME COUNT: {new_total}")
print("==================================================================")
