import os
import re
import json
import ssl
import sqlite3
import hashlib
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Any, List, Optional

SYSTEM_SOURCES = {
    "SNES": {
        "collection": "nointro-snes",
        "platform_name": "Super Nintendo",
        "repo": "Nintendo_-_Super_Nintendo_Entertainment_System",
        "default_ext": ".sfc",
        "default_year": 1993,
    },
    "NES": {
        "collection": "ef_nintendo_entertainment_-system_-no-intro_2024-04-23",
        "platform_name": "Nintendo Entertainment System",
        "repo": "Nintendo_-_Nintendo_Entertainment_System",
        "default_ext": ".nes",
        "default_year": 1988,
    },
    "N64": {
        "collection": "No-Intro_N64_Collection",
        "platform_name": "Nintendo 64",
        "repo": "Nintendo_-_Nintendo_64",
        "default_ext": ".z64",
        "default_year": 1998,
    },
    "GBA": {
        "collection": "recalbox-nointro-gba-1g1r-retroninjasamurai",
        "platform_name": "Game Boy Advance",
        "repo": "Nintendo_-_Game_Boy_Advance",
        "default_ext": ".gba",
        "default_year": 2003,
    },
    "Genesis": {
        "collection": "nointro.md",
        "platform_name": "Sega Genesis",
        "repo": "Sega_-_Mega_Drive_-_Genesis",
        "default_ext": ".md",
        "default_year": 1992,
    },
    "PS1": {
        "collection": "sony-playstation-usa-translations-1g1r-chd-perfect-collection_202310",
        "platform_name": "Sony PlayStation",
        "repo": "Sony_-_PlayStation",
        "default_ext": ".chd",
        "default_year": 1998,
    },
    "GB": {
        "collection": "No-Intro_GB",
        "platform_name": "Game Boy",
        "repo": "Nintendo_-_Game_Boy",
        "default_ext": ".gb",
        "default_year": 1990,
    },
    "GBC": {
        "collection": "No-Intro_GBC",
        "platform_name": "Game Boy Color",
        "repo": "Nintendo_-_Game_Boy_Color",
        "default_ext": ".gbc",
        "default_year": 1999,
    },
    "NDS": {
        "collection": "2024-nintendo-ds-hearto-1g1r-collection",
        "platform_name": "Nintendo DS",
        "repo": "Nintendo_-_Nintendo_DS",
        "default_ext": ".nds",
        "default_year": 2006,
    },
    "GameCube": {
        "collection": "GamecubeCollectionByGhostware",
        "platform_name": "Nintendo GameCube",
        "repo": "Nintendo_-_GameCube",
        "default_ext": ".iso",
        "default_year": 2002,
    },
    "Wii": {
        "collection": "Wii_ISO",
        "platform_name": "Nintendo Wii",
        "repo": "Nintendo_-_Wii",
        "default_ext": ".iso",
        "default_year": 2008,
    },
    "PSP": {
        "collection": "rr-sony-playstation-portable",
        "platform_name": "Sony PSP",
        "repo": "Sony_-_PlayStation_Portable",
        "default_ext": ".7z",
        "default_year": 2006,
    },
    "Dreamcast": {
        "collection": "DreamcastSelfBoot",
        "platform_name": "Sega Dreamcast",
        "repo": "Sega_-_Dreamcast",
        "default_ext": ".zip",
        "default_year": 2000,
    },
    "Saturn": {
        "collection": "SSCHD-Arquivista",
        "platform_name": "Sega Saturn",
        "repo": "Sega_-_Saturn",
        "default_ext": ".chd",
        "default_year": 1996,
    },
    "SegaCD": {
        "collection": "redump.sega_megacd-segacd",
        "platform_name": "Sega CD",
        "repo": "Sega_-_Mega_CD_-_Sega_CD",
        "default_ext": ".zip",
        "default_year": 1993,
    },
    "TG16": {
        "collection": "nointro.tg-16",
        "platform_name": "TurboGrafx-16",
        "repo": "NEC_-_PC_Engine_-_TurboGrafx_16",
        "default_ext": ".pce",
        "default_year": 1989,
    },
    "MasterSystem": {
        "collection": "nointro.ms-mkiii",
        "platform_name": "Sega Master System",
        "repo": "Sega_-_Master_System_-_Mark_III",
        "default_ext": ".sms",
        "default_year": 1987,
    },
    "GameGear": {
        "collection": "nointro.gg",
        "platform_name": "Sega Game Gear",
        "repo": "Sega_-_Game_Gear",
        "default_ext": ".gg",
        "default_year": 1991,
    },
    "Atari2600": {
        "collection": "nointro.atari-2600",
        "platform_name": "Atari 2600",
        "repo": "Atari_-_2600",
        "default_ext": ".a26",
        "default_year": 1982,
    },
    "Atari7800": {
        "collection": "atari-7800-roms-ultra",
        "platform_name": "Atari 7800",
        "repo": "Atari_-_7800",
        "default_ext": ".a78",
        "default_year": 1986,
    },
    "NeoGeo": {
        "collection": "neogeoaesmvscomplete",
        "platform_name": "Neo Geo",
        "repo": "SNK_-_Neo_Geo",
        "default_ext": ".zip",
        "default_year": 1993,
    }
}

NEOGEO_MAP = {
    "2020bb": "2020 Super Baseball",
    "3countb": "3 Count Bout",
    "alpham2": "Alpha Mission II",
    "androdun": "Andro Dunos",
    "aodk": "Aggressors of Dark Kombat",
    "aof": "Art of Fighting",
    "aof2": "Art of Fighting 2",
    "aof3": "Art of Fighting 3: The Path of the Warrior",
    "b2b": "Bang Bang Busters",
    "bakatono": "Bakatonosama Mahjong Manyuki",
    "bjourney": "Blue's Journey",
    "blazstar": "Blazing Star",
    "breakers": "Breakers",
    "breakrev": "Breakers Revenge",
    "bstars": "Baseball Stars Professional",
    "bstars2": "Baseball Stars 2",
    "burningf": "Burning Fight",
    "crsword": "Crossed Swords",
    "cyberlip": "Cyber-Lip",
    "doubledr": "Double Dragon (Neo Geo)",
    "eightman": "Eight Man",
    "fatfury1": "Fatal Fury: King of Fighters",
    "fatfury2": "Fatal Fury 2",
    "fatfury3": "Fatal Fury 3: Road to the Final Victory",
    "fatfursp": "Fatal Fury Special",
    "fbfrenzy": "Football Frenzy",
    "fightfev": "Fight Fever",
    "galaxyfg": "Galaxy Fight: Universal Warrior",
    "ganryu": "Ganryu",
    "garou": "Garou: Mark of the Wolves",
    "ghostlp": "Ghostlop",
    "gowcaizr": "Voltage Fighter Gowcaizer",
    "gpilots": "Ghost Pilots",
    "gururin": "Gururin",
    "ironclad": "Ironclad",
    "jockeygp": "Jockey Grand Prix",
    "joyjoy": "Puzzled",
    "karnovr": "Karnov's Revenge",
    "kizuna": "Kizuna Encounter: Super Tag Battle",
    "kof94": "The King of Fighters '94",
    "kof95": "The King of Fighters '95",
    "kof96": "The King of Fighters '96",
    "kof97": "The King of Fighters '97",
    "kof98": "The King of Fighters '98: The Slugfest",
    "kof99": "The King of Fighters '99: Millennium Battle",
    "kof2000": "The King of Fighters 2000",
    "kof2001": "The King of Fighters 2001",
    "kof2002": "The King of Fighters 2002: Challenge to Ultimate Battle",
    "kof2003": "The King of Fighters 2003",
    "kotm": "King of the Monsters",
    "kotm2": "King of the Monsters 2: The Next Dimension",
    "lastblad": "The Last Blade",
    "lastbld2": "The Last Blade 2",
    "lastres": "Last Resort",
    "lbowling": "League Bowling",
    "legendos": "Legend of Success Joe",
    "magdrop2": "Magical Drop II",
    "magdrop3": "Magical Drop III",
    "maglord": "Magician Lord",
    "matrim": "Shin Gouketsuji Ichizoku: Toukon - Matrimelee",
    "miexchng": "Money Idol Exchanger",
    "mslug": "Metal Slug: Super Vehicle-001",
    "mslug2": "Metal Slug 2: Super Vehicle-001/II",
    "mslug3": "Metal Slug 3",
    "mslug4": "Metal Slug 4",
    "mslug5": "Metal Slug 5",
    "mslugx": "Metal Slug X: Super Vehicle-001",
    "mutnat": "Mutation Nation",
    "nam1975": "NAM-1975",
    "ncombat": "Ninja Combat",
    "ncommand": "Ninja Commando",
    "neobomba": "Neo Bomberman",
    "neocup98": "Neo Geo Cup '98: The Road to the Victory",
    "neodrift": "Neo Drift Out: New Technology",
    "neomrdo": "Neo Mr. Do!",
    "ninjamas": "Ninja Master's: Haoh Ninpo Cho",
    "overtop": "Over Top",
    "panicbom": "Panic Bomber: Bomberman",
    "pbobbl2n": "Puzzle Bobble 2",
    "pbobblen": "Puzzle Bobble",
    "popbounc": "Pop 'n Bounce",
    "preisl2": "Prehistoric Isle 2",
    "pulstar": "Pulstar",
    "puzzledp": "Puzzle De Pon!",
    "quizkof": "Quiz King of Fighters",
    "ragnagrd": "Ragnagard",
    "rbff1": "Real Bout Fatal Fury",
    "rbff2": "Real Bout Fatal Fury 2: The Newcomers",
    "rbffspec": "Real Bout Fatal Fury Special",
    "ridhero": "Riding Hero",
    "roboarmy": "Robo Army",
    "samsho": "Samurai Shodown",
    "samsho2": "Samurai Shodown II",
    "samsho3": "Samurai Shodown III: Blades of Blood",
    "samsho4": "Samurai Shodown IV: Amakusa's Revenge",
    "samsho5": "Samurai Shodown V",
    "samsh5sp": "Samurai Shodown V Special",
    "savagere": "Savage Reign",
    "sdodgeb": "Super Dodge Ball (Neo Geo)",
    "sengoku": "Sengoku",
    "sengoku2": "Sengoku 2",
    "sengoku3": "Sengoku 3",
    "shocktr2": "Shock Troopers: 2nd Squad",
    "shocktro": "Shock Troopers",
    "socbrawl": "Soccer Brawl",
    "sonicwi2": "Aero Fighters 2 (Sonic Wings 2)",
    "sonicwi3": "Aero Fighters 3 (Sonic Wings 3)",
    "spinmast": "Spinmaster",
    "ssideki": "Super Sidekicks",
    "ssideki2": "Super Sidekicks 2: The World Championship",
    "ssideki3": "Super Sidekicks 3: The Next Glory",
    "ssideki4": "The Ultimate 11: SNK Football Championship",
    "stakwin": "Stakes Winner",
    "stakwin2": "Stakes Winner 2",
    "strhoop": "Street Hoop",
    "superspy": "The Super Spy",
    "svc": "SNK vs. Capcom: SVC Chaos",
    "tehpohl": "Tehkan World Cup",
    "topbladv": "Top Blade V",
    "tophuntr": "Top Hunter: Roddy & Cathy",
    "tpgolf": "Top Player's Golf",
    "trally": "Thrash Rally",
    "turfmast": "Neo Turf Masters",
    "twinspri": "Twinkle Star Sprites",
    "viewpoin": "Viewpoint",
    "wakuwak7": "Waku Waku 7",
    "wh1": "World Heroes",
    "wh2": "World Heroes 2",
    "wh2j": "World Heroes 2 Jet",
    "whp": "World Heroes Perfect",
    "wjammers": "Windjammers",
    "zedblade": "Zed Blade",
    "zupapa": "ZuPaPa!"
}

DEFAULT_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.dler.org:6969/announce"
]

def make_magnet_link(title: str, platform: str) -> Optional[str]:
    # Do not fabricate false BitTorrent hashes
    return None

def classify_genre(name: str) -> str:
    low = name.lower()
    if any(k in low for k in ["tetris", "puzzle", "puyo", "columns", "bust-a-move", "dr. mario", "lumines", "lemmings", "brain age", "picross"]):
        return "Puzzle"
    if any(k in low for k in ["resident evil", "silent hill", "dino crisis", "alone in the dark", "parasite eve", "clock tower", "nightmare creatures", "evil dead", "fear effect"]):
        return "Survival Horror"
    if any(k in low for k in ["kart", "gran turismo", "f-zero", "ridge racer", "need for speed", "wipeout", "burnout", "rally", "racing", "formula", "nascar", "outrun", "road rash", "top gear", "test drive", "driver", "micro machines", "wave race", "snowboard", "extreme-g"]):
        return "Racing"
    if any(k in low for k in ["fifa", "nba", "nfl", "nhl", "madden", "baseball", "football", "soccer", "tennis", "golf", "tony hawk", "pro skater", "olympic", "bowling", "pga", "mlb", "blades of steel"]):
        return "Sports"
    if any(k in low for k in ["street fighter", "mortal kombat", "tekken", "killer instinct", "smash bros", "fatal fury", "king of fighters", "samurai shodown", "virtua fighter", "bloody roar", "soul blade", "soulcalibur", "dead or alive", "rival schools", "guilty gear", "darkstalkers", "wrestle", "wwf", "wwe", "wcw", "punch-out", "brawler", "double dragon", "boxing"]):
        return "Fighting"
    if any(k in low for k in ["fantasy", "dragon", "chrono", "zelda", "mana", "quest", "rpg", "tactics", "tales of", "star ocean", "breath of fire", "shin megami", "persona", "valkyrie", "suikoden", "xeno", "lufia", "earthbound", "mother", "pokemon", "pokémon", "golden sun", "fire emblem", "dungeon", "ogre battle", "shadowrun", "ys "]):
        return "RPG"
    if any(k in low for k in ["mario", "sonic", "donkey kong", "crash", "spyro", "rayman", "banjo", "kirby", "wario", "yoshi", "mega man", "earthworm", "aladdin", "lion king", "castlevania", "ghouls", "conker", "ape escape", "klonoa", "pitfall", "bonk", "bubsy", "gex", "croc", "ducktales", "spyro", "pac-man"]):
        return "Platformer"
    if any(k in low for k in ["contra", "metal slug", "gradius", "star fox", "goldeneye", "perfect dark", "doom", "quake", "duke nukem", "turok", "r-type", "raiden", "1942", "1943", "time crisis", "thunder force", "space invaders", "galaga", "medal of honor", "sniper", "shmup", "gun"]):
        return "Shooter"
    if any(k in low for k in ["advance wars", "front mission", "civilization", "populous", "simcity", "nobunaga", "warcraft", "command & conquer"]):
        return "Strategy"
    return "Action-Adventure"

def clean_game_title(raw_name: str, platform: str) -> str:
    name = raw_name.split("/")[-1]
    stem = re.sub(r"\.(zip|7z|sfc|smc|z64|nes|gba|chd|iso|rvz|gcm|cso|cdi|gdi|pce|sms|gg|a26|a78|gb|gbc|nds|bin)$", "", name, flags=re.I)
    
    if platform == "NeoGeo":
        return NEOGEO_MAP.get(stem.lower(), stem.replace("_", " ").title())
        
    stem = re.sub(r"\[.*?\]", "", stem)
    base = re.split(r"\(", stem)[0].strip()
    return base if base else stem

def is_valid_candidate(fname: str, platform: str) -> bool:
    if fname.startswith(".") or any(bad in fname for bad in ["[b]", "[a]", "(Test Program)", "BIOS/"]):
        return False
        
    p = platform.upper() if platform else ""
    if p in ("GAMECUBE", "GCN"):
        return fname.lower().endswith((".iso", ".gcm", ".rvz", ".zip", ".7z")) and "/" not in fname
    elif p == "WII":
        return fname.lower().endswith((".iso", ".wbfs", ".rvz", ".zip", ".7z"))
    elif p == "PSP":
        return fname.lower().endswith((".7z", ".zip", ".cso", ".iso", ".chd", ".pbp"))
    elif p in ("DREAMCAST", "DC"):
        return fname.lower().endswith((".zip", ".cdi", ".gdi", ".chd", ".7z"))
    elif p in ("SATURN", "SAT"):
        return fname.lower().endswith((".chd", ".iso", ".bin", ".zip", ".7z", ".cue"))
    elif p in ("SEGACD", "SCD"):
        return fname.lower().endswith((".zip", ".chd", ".7z", ".iso", ".bin", ".cue"))
    elif p == "NDS":
        return fname.lower().endswith((".zip", ".7z", ".nds"))
    elif p in ("3DS", "N3DS"):
        return fname.lower().endswith((".cia", ".3ds", ".cci", ".zip", ".7z"))
    elif p in ("PS2", "PLAYSTATION2"):
        return fname.lower().endswith((".chd", ".iso", ".cso", ".bin", ".zip", ".7z"))
    elif p in ("PS3", "PLAYSTATION3"):
        return fname.lower().endswith((".pkg", ".iso", ".zip", ".7z", ".tar", ".rap"))
    elif p in ("PS4", "PLAYSTATION4"):
        return fname.lower().endswith((".pkg", ".iso", ".zip", ".7z"))
    elif p in ("PSVITA", "PSV"):
        return fname.lower().endswith((".vpk", ".zip", ".7z"))
    elif p in ("SWITCH", "NSW"):
        return fname.lower().endswith((".nsp", ".xci", ".nsz", ".zip", ".7z"))
    elif p in ("XBOX", "XBOX360"):
        return fname.lower().endswith((".iso", ".xbe", ".god", ".xex", ".chd", ".zip", ".7z"))
    elif p in ("NEOGEO", "NEO", "ARCADE", "MAME"):
        return fname.lower().endswith((".zip", ".7z", ".chd", ".neo"))
    elif p == "ATARI7800":
        return fname.lower().endswith((".a78", ".bin", ".7z", ".zip"))
    elif p in ("GB", "GBC", "TG16", "MASTERSYSTEM", "GAMEGEAR", "ATARI2600", "SNES", "N64", "GBA", "GENESIS", "MEGADRIVE", "NES", "PS1"):
        return fname.lower().endswith((".zip", ".7z", ".sfc", ".smc", ".z64", ".n64", ".v64", ".nes", ".gba", ".chd", ".gb", ".gbc", ".pce", ".sms", ".gg", ".a26", ".md", ".gen", ".smd", ".bin", ".cue", ".iso", ".pbp"))
        
    # Universal fallback for any custom, regional, or unmapped platform
    valid_exts = (
        ".zip", ".7z", ".iso", ".chd", ".bin", ".rom", ".nes", ".sfc", ".smc",
        ".gba", ".gbc", ".gb", ".z64", ".n64", ".v64", ".nsp", ".xci", ".nsz",
        ".cia", ".3ds", ".cci", ".vpk", ".pkg", ".rvz", ".wbfs", ".gcm", ".cdi",
        ".gdi", ".pce", ".sms", ".gg", ".a26", ".a78", ".md", ".gen", ".smd",
        ".cso", ".pbp", ".xbe", ".god", ".xex", ".neo"
    )
    return fname.lower().endswith(valid_exts)

def scrape_and_populate_full_library(db_path: Path, max_per_system: Optional[int] = None, target_platforms: Optional[List[str]] = None) -> Dict[str, int]:
    """
    Scrapes the UNLIMITED complete library across all consoles from Archive.org preservation archives.
    Extracts every clean 1G1R title without limiting or truncating the catalog.
    """
    ctx = ssl._create_unverified_context()
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    platforms_to_scrape = target_platforms if target_platforms else list(SYSTEM_SOURCES.keys())
    
    stats = {}
    print("================================================================")
    print(f"   STARTING UNLIMITED ONLINE ROM COLLECTION SCRAPER")
    print(f"   Targeting Complete Catalogs for {len(platforms_to_scrape)} Consoles")
    print("================================================================")

    for platform in platforms_to_scrape:
        if platform not in SYSTEM_SOURCES:
            continue
            
        info = SYSTEM_SOURCES[platform]
        collection = info["collection"]
        repo = info["repo"]
        platform_name = info["platform_name"]
        default_ext = info["default_ext"]
        default_year = info["default_year"]
        
        print(f"\n-> Fetching COMPLETE online library for {platform_name} ({platform}) from '{collection}'...")
        url = f"https://archive.org/metadata/{collection}/files"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
        
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                data = json.loads(resp.read().decode())
                all_files = data.get("result", [])
        except Exception as e:
            print(f"   [Error fetching {collection}]: {e}")
            continue

        # Fetch existing IDs in database to skip duplicates without re-inserting
        cursor.execute("SELECT id FROM games WHERE platform = ?", (platform,))
        existing_ids = set(r[0] for r in cursor.fetchall())
        print(f"   Existing games in vault for {platform}: {len(existing_ids)}")

        valid_files = []
        seen_titles = set()
        
        for f in all_files:
            fname = f.get("name", "")
            if is_valid_candidate(fname, platform):
                title = clean_game_title(fname, platform)
                if not title or title.lower() in seen_titles:
                    continue
                seen_titles.add(title.lower())
                valid_files.append((fname, f, title))
                
                if max_per_system and len(valid_files) >= max_per_system:
                    break

        print(f"   Found {len(valid_files)} total available games for {platform}!")
        inserted_for_sys = 0

        for raw_fname, file_info, title in valid_files:
            clean_stem = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-")
            slug = f"{platform.lower()}-{clean_stem[:35]}"
            
            if slug in existing_ids:
                continue

            genre = classify_genre(title)
            
            # File size
            size_bytes = int(file_info.get("size", 0) or 0)
            size_mb = round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0.0
            
            # Box Art and Screenshots
            stem = re.sub(r"\.(zip|7z|sfc|smc|z64|nes|gba|chd|iso|rvz|gcm|cso|cdi|gdi|pce|sms|gg|a26|a78|gb|gbc|nds|bin)$", "", raw_fname.split("/")[-1], flags=re.I)
            if platform in ("GameCube", "Wii"):
                box_query = f"{title} (USA)"
            elif platform == "NeoGeo":
                box_query = f"{title}"
            else:
                box_query = stem
                
            quoted_box = urllib.parse.quote(box_query)
            box_art_2d = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{quoted_box}.png"
            snap = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Snaps/{quoted_box}.png"
            
            # Direct Download & Magnet Link
            quoted_download_path = urllib.parse.quote(raw_fname)
            direct_url = f"https://archive.org/download/{collection}/{quoted_download_path}"
            magnet_uri = make_magnet_link(title, platform)
            
            # YouTube Trailer Embed
            quoted_search = urllib.parse.quote(f"{title} {platform_name} gameplay trailer")
            trailer_url = f"https://www.youtube.com/embed?listType=search&list={quoted_search}&autoplay=0"
            
            # Extracted format
            ext = os.path.splitext(raw_fname)[1] or default_ext
            clean_ext = ext.lstrip('.')
            
            # Rating initialization (unrated until rated by user)
            rating = 0.0
            rating_count = 0
            
            # Release year extraction from archive filename or title if present
            year_match = re.search(r"\((19\d\d|20[0-2]\d)\)", raw_fname) or re.search(r"\((19\d\d|20[0-2]\d)\)", title)
            clean_year = int(year_match.group(1)) if year_match else None
            
            screenshots = json.dumps([snap, box_art_2d])
            description = f"{title} ({platform_name}) — Verified preservation ROM archive ({clean_ext}, {size_mb} MB)."

            cursor.execute("""
            INSERT OR REPLACE INTO games (
                id, title, slug, platform, platform_name, genre, release_year,
                developer, publisher, rating, rating_count, description,
                box_art_2d, box_art_3d, backdrop, trailer_url, screenshots,
                direct_download_url, magnet_uri, file_size_mb, rom_format, is_featured
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                slug, title, slug, platform, platform_name,
                genre, clean_year, None, None,
                rating, rating_count, description,
                box_art_2d, box_art_2d, snap, trailer_url, screenshots,
                direct_url, magnet_uri, size_mb, ext, 0
            ))
            inserted_for_sys += 1
            existing_ids.add(slug)
            
            if inserted_for_sys % 100 == 0:
                conn.commit()
                print(f"      ...indexed {inserted_for_sys} / {len(valid_files)} games for {platform}...")

        stats[platform] = inserted_for_sys
        print(f"   ✓ Inserted {inserted_for_sys} new games into database for {platform} (Total: {len(existing_ids)})!")
        conn.commit()

    conn.close()
    print("================================================================")
    print("   UNLIMITED ROM COLLECTION SCRAPER COMPLETE!")
    print(f"   Total new games added to vault: {sum(stats.values())}")
    print("================================================================")
    return stats

if __name__ == "__main__":
    import sys
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Volumes/ROMS/OmniVault-Source/backend/data/vault.db")
    # No limit - scrape 100% of all games!
    scrape_and_populate_full_library(target, max_per_system=None)
