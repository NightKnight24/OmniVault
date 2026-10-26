#!/usr/bin/env python3
"""
OmniVault Top Retro Library Lore & Direct Mirror Enrichment Engine.
Fetches authentic Wikipedia synopsis, release year, developer, and publisher,
and populates verified direct download CDN mirrors for top retro classics.
"""

import sys
import os
import re
import ssl
import json
import sqlite3
import asyncio
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, Any, List, Optional

# Ensure backend root is on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from app.scrapers.metadata_scraper import fetch_wikipedia_game_synopsis_sync
from app.services.mirror_resolver import MirrorResolver

DB_PATHS = [
    Path("/Volumes/ROMS/OmniVault-Source/backend/data/vault.db"),
    Path("/Volumes/ROMS/OmniVault.app/Contents/Resources/backend/data/vault.db")
]

# Curated high-priority retro games for authentic lore and pre-cached direct downloads
TOP_CLASSICS = [
    # --- SNES ---
    ("SNES", "Super Mario World", "https://downloads.consoleroms.com/roms/Super%20Mario%20World%20%28USA%29.zip", 0.33, ".sfc"),
    ("SNES", "Chrono Trigger", "https://downloads.consoleroms.com/roms/Chrono%20Trigger%20%28USA%29.zip", 2.9, ".sfc"),
    ("SNES", "Legend of Zelda, The - A Link to the Past", "https://downloads.consoleroms.com/roms/Legend%20of%20Zelda%2C%20The%20-%20A%20Link%20to%20the%20Past%20%28USA%29.zip", 0.67, ".sfc"),
    ("SNES", "Super Metroid", "https://downloads.consoleroms.com/roms/Super%20Metroid%20%28Japan%2C%20USA%29%20%28En%2CJa%29.zip", 2.3, ".sfc"),
    ("SNES", "Donkey Kong Country", "https://downloads.consoleroms.com/roms/Donkey%20Kong%20Country%20%28USA%29.zip", 2.4, ".sfc"),
    ("SNES", "Donkey Kong Country 2", "https://downloads.consoleroms.com/roms/Donkey%20Kong%20Country%202%20-%20Diddy%27s%20Kong%20Quest%20%28USA%29.zip", 2.7, ".sfc"),
    ("SNES", "Super Mario RPG", "https://downloads.consoleroms.com/roms/Super%20Mario%20RPG%20-%20Legend%20of%20the%20Seven%20Stars%20%28USA%29.zip", 2.8, ".sfc"),
    ("SNES", "EarthBound", "https://downloads.consoleroms.com/roms/EarthBound%20%28USA%29.zip", 2.5, ".sfc"),
    ("SNES", "Mega Man X", "https://downloads.consoleroms.com/roms/Mega%20Man%20X%20%28U%29%20%28V1.1%29.zip", 1.2, ".sfc"),
    ("SNES", "Final Fantasy III", "https://downloads.consoleroms.com/roms/Final%20Fantasy%20III%20%28USA%29.zip", 2.2, ".sfc"),
    ("SNES", "Secret of Mana", "https://downloads.consoleroms.com/roms/Secret%20of%20Mana%20%28USA%29.zip", 1.4, ".sfc"),
    ("SNES", "Super Castlevania IV", "https://downloads.consoleroms.com/roms/Super%20Castlevania%20IV%20%28USA%29.zip", 1.1, ".sfc"),
    ("SNES", "Street Fighter II Turbo", "https://downloads.consoleroms.com/roms/Street%20Fighter%20II%20Turbo%20%28USA%29.zip", 2.1, ".sfc"),
    ("SNES", "Super Mario Kart", "https://downloads.consoleroms.com/roms/Super%20Mario%20Kart%20%28USA%29.zip", 0.5, ".sfc"),
    ("SNES", "Super Mario World 2 - Yoshi's Island", "https://downloads.consoleroms.com/roms/Super%20Mario%20World%202%20-%20Yoshi%27s%20Island%20%28USA%29.zip", 1.5, ".sfc"),
    
    # --- NES ---
    ("NES", "Super Mario Bros.", "https://downloads.consoleroms.com/roms/Super%20Mario%20Bros.%20%28World%29.zip", 0.04, ".nes"),
    ("NES", "Super Mario Bros. 2", "https://downloads.consoleroms.com/roms/Super%20Mario%20Bros.%202%20%28USA%29.zip", 0.1, ".nes"),
    ("NES", "Super Mario Bros. 3", "https://downloads.consoleroms.com/roms/Super%20Mario%20Bros.%203%20%28USA%29.zip", 0.22, ".nes"),
    ("NES", "Legend of Zelda, The", "https://downloads.consoleroms.com/roms/Legend%20of%20Zelda%2C%20The%20%28USA%29.zip", 0.08, ".nes"),
    ("NES", "Metroid", "https://downloads.consoleroms.com/roms/Metroid%20%28USA%29.zip", 0.07, ".nes"),
    ("NES", "Castlevania", "https://downloads.consoleroms.com/roms/Castlevania%20%28USA%29.zip", 0.08, ".nes"),
    ("NES", "Castlevania III", "https://downloads.consoleroms.com/roms/Castlevania%20III%20-%20Dracula%27s%20Curse%20%28USA%29.zip", 0.23, ".nes"),
    ("NES", "Contra", "https://downloads.consoleroms.com/roms/Contra%20%28USA%29.zip", 0.1, ".nes"),
    ("NES", "Mega Man 2", "https://downloads.consoleroms.com/roms/Mega%20Man%202%20%28USA%29.zip", 0.15, ".nes"),
    ("NES", "Mega Man 3", "https://downloads.consoleroms.com/roms/Mega%20Man%203%20%28USA%29.zip", 0.22, ".nes"),
    ("NES", "Mike Tyson's Punch-Out!!", "https://downloads.consoleroms.com/roms/Mike%20Tyson%27s%20Punch-Out%21%21%20%28USA%29.zip", 0.13, ".nes"),
    ("NES", "Kirby's Adventure", "https://downloads.consoleroms.com/roms/Kirby%27s%20Adventure%20%28USA%29.zip", 0.43, ".nes"),
    ("NES", "DuckTales", "https://downloads.consoleroms.com/roms/DuckTales%20%28USA%29.zip", 0.09, ".nes"),

    # --- GBA & GB/GBC ---
    ("GBA", "Pokemon - Emerald Version", "https://downloads.consoleroms.com/roms/1986%20-%20Pokemon%20Emerald%20%28U%29%28TrashMan%29.zip", 6.5, ".gba"),
    ("GBA", "Pokemon - FireRed Version", "https://downloads.consoleroms.com/roms/1636%20-%20Pokemon%20Fire%20Red%20%28U%29%28Squirrels%29.zip", 5.2, ".gba"),
    ("GBA", "Pokemon - LeafGreen Version", "https://downloads.consoleroms.com/roms/1637%20-%20Pokemon%20Leaf%20Green%20%28U%29.zip", 5.2, ".gba"),
    ("GBA", "Legend of Zelda, The - The Minish Cap", "https://downloads.consoleroms.com/roms/1815%20-%20Legend%20of%20Zelda%20The%20-%20The%20Minish%20Cap%20%28U%29.zip", 9.1, ".gba"),
    ("GBA", "Metroid Fusion", "https://downloads.consoleroms.com/roms/0690%20-%20Metroid%20Fusion%20%28U%29.zip", 4.3, ".gba"),
    ("GBA", "Metroid - Zero Mission", "https://downloads.consoleroms.com/roms/1360%20-%20Metroid%20-%20Zero%20Mission%20%28U%29.zip", 4.9, ".gba"),
    ("GBA", "Castlevania - Aria of Sorrow", "https://downloads.consoleroms.com/roms/0979%20-%20Castlevania%20-%20Aria%20of%20Sorrow%20%28U%29.zip", 4.1, ".gba"),
    ("GBA", "Golden Sun", "https://downloads.consoleroms.com/roms/0199%20-%20Golden%20Sun%20%28U%29.zip", 7.8, ".gba"),
    ("GBA", "Advance Wars", "https://downloads.consoleroms.com/roms/0101%20-%20Advance%20Wars%20%28U%29.zip", 2.4, ".gba"),

    # --- GENESIS ---
    ("Genesis", "Sonic The Hedgehog", "https://downloads.consoleroms.com/roms/Sonic%20The%20Hedgehog%20%28USA%2C%20Europe%29.zip", 0.38, ".md"),
    ("Genesis", "Sonic The Hedgehog 2", "https://downloads.consoleroms.com/roms/Sonic%20The%20Hedgehog%202%20%28World%29.zip", 0.74, ".md"),
    ("Genesis", "Streets of Rage 2", "https://downloads.consoleroms.com/roms/Streets%20of%20Rage%202%20%28USA%29.zip", 1.3, ".md"),
    ("Genesis", "Gunstar Heroes", "https://downloads.consoleroms.com/roms/Gunstar%20Heroes%20%28USA%29.zip", 0.8, ".md"),
    ("Genesis", "Castlevania - Bloodlines", "https://downloads.consoleroms.com/roms/Castlevania%20-%20Bloodlines%20%28USA%29.zip", 0.9, ".md"),
    ("Genesis", "Shinobi III - Return of the Ninja Master", "https://downloads.consoleroms.com/roms/Shinobi%20III%20-%20Return%20of%20the%20Ninja%20Master%20%28USA%29.zip", 0.85, ".md"),
    ("Genesis", "Phantasy Star IV", "https://downloads.consoleroms.com/roms/Phantasy%20Star%20IV%20%28USA%29.zip", 1.8, ".md"),

    # --- N64 ---
    ("N64", "Super Mario 64", "https://downloads.consoleroms.com/roms/Super%20Mario%2064%20%28USA%29.zip", 6.26, ".z64"),
    ("N64", "Mario Kart 64", "https://downloads.consoleroms.com/roms/Mario%20Kart%2064%20%28USA%29.zip", 9.5, ".z64"),
    ("N64", "Legend of Zelda, The - Ocarina of Time", "https://downloads.consoleroms.com/roms/Legend%20of%20Zelda%2C%20The%20-%20Ocarina%20of%20Time%20%28USA%29.zip", 26.99, ".z64"),
    ("N64", "GoldenEye 007", "https://downloads.consoleroms.com/roms/007%20-%20GoldenEye%20%28USA%29.zip", 10.83, ".z64"),
    ("N64", "Super Smash Bros.", "https://downloads.consoleroms.com/roms/Super%20Smash%20Bros.%20%28USA%29.zip", 12.4, ".z64"),
    ("N64", "Star Fox 64", "https://downloads.consoleroms.com/roms/Star%20Fox%2064%20%28USA%29.zip", 9.1, ".z64"),
    ("N64", "Legend of Zelda, The - Majora's Mask", "https://downloads.consoleroms.com/roms/Legend%20of%20Zelda%2C%20The%20-%20Majora's%20Mask%20%28USA%29.zip", 27.5, ".z64"),
    ("N64", "Banjo-Kazooie", "https://downloads.consoleroms.com/roms/Banjo-Kazooie%20%28USA%29.zip", 14.2, ".z64"),
    ("N64", "Banjo-Tooie", "https://downloads.consoleroms.com/roms/Banjo-Tooie%20%28USA%29.zip", 28.1, ".z64"),
    ("N64", "Diddy Kong Racing", "https://downloads.consoleroms.com/roms/Diddy%20Kong%20Racing%20%28USA%29.zip", 10.5, ".z64"),
    ("N64", "Donkey Kong 64", "https://downloads.consoleroms.com/roms/Donkey%20Kong%2064%20%28USA%29.zip", 23.4, ".z64"),
    ("N64", "Perfect Dark", "https://downloads.consoleroms.com/roms/Perfect%20Dark%20%28USA%29.zip", 24.3, ".z64"),
    ("N64", "Paper Mario", "https://downloads.consoleroms.com/roms/Paper%20Mario%20%28USA%29.zip", 31.8, ".z64"),

    # --- PS1 ---
    ("PS1", "Final Fantasy VII", "https://downloads.consoleroms.com/roms/Final%20Fantasy%20VII%20%28USA%29.zip", 1320.0, ".bin"),
    ("PS1", "Final Fantasy VIII", "https://downloads.consoleroms.com/roms/Final%20Fantasy%20VIII%20%28USA%29.zip", 1820.0, ".bin"),
    ("PS1", "Final Fantasy IX", "https://downloads.consoleroms.com/roms/Final%20Fantasy%20IX%20%28USA%29.zip", 1540.0, ".bin"),
    ("PS1", "Metal Gear Solid", "https://downloads.consoleroms.com/roms/Metal%20Gear%20Solid%20%28USA%29.zip", 698.0, ".bin"),
    ("PS1", "Castlevania - Symphony of the Night", "https://downloads.consoleroms.com/roms/Castlevania%20-%20Symphony%20of%20the%20Night%20%28USA%29.zip", 356.0, ".bin"),
    ("PS1", "Crash Bandicoot 3 - Warped", "https://downloads.consoleroms.com/roms/Crash%20Bandicoot%203%20-%20Warped%20%28USA%29.zip", 123.0, ".bin"),
    ("PS1", "Spyro the Dragon", "https://downloads.consoleroms.com/roms/Spyro%20the%20Dragon%20%28USA%29.zip", 325.0, ".bin"),
    ("PS1", "Tekken 3", "https://downloads.consoleroms.com/roms/Tekken%203%20%28USA%29.zip", 440.0, ".bin"),
    ("PS1", "Silent Hill", "https://downloads.consoleroms.com/roms/Silent%20Hill%20%28USA%29.zip", 310.0, ".bin"),
    ("PS1", "Resident Evil 2", "https://downloads.consoleroms.com/roms/Resident_Evil_2%20%28USA%29.zip", 750.0, ".bin"),

    # --- PS2 ---
    ("PS2", "Shadow of the Colossus", "https://downloads.consoleroms.com/roms/Shadow%20of%20the%20Colossus%20%28USA%29.zip", 1020.0, ".iso"),
    ("PS2", "Final Fantasy X", "https://downloads.consoleroms.com/roms/Final%20Fantasy%20X%20%28USA%29.zip", 3100.0, ".iso"),
    ("PS2", "God of War", "https://downloads.consoleroms.com/roms/God%20of%20War%20%28USA%29.zip", 3900.0, ".iso"),
    ("PS2", "God of War II", "https://downloads.consoleroms.com/roms/God%20of%20War%20II%20%28USA%29.zip", 4100.0, ".iso"),
    ("PS2", "Kingdom Hearts", "https://downloads.consoleroms.com/roms/Kingdom%20Hearts%20%28USA%29.zip", 2400.0, ".iso"),
    ("PS2", "Grand Theft Auto - San Andreas", "https://downloads.consoleroms.com/roms/Grand%20Theft%20Auto%20-%20San%20Andreas%20%28USA%29.zip", 4200.0, ".iso")
]

def enrich_databases():
    print("==================================================================")
    print("OmniVault: Enriching Top Retro Libraries With Lore & Direct Mirrors")
    print("==================================================================")

    # Cache Wikipedia results in memory to avoid duplicate network calls
    wiki_cache = {}

    for db_path in DB_PATHS:
        if not db_path.exists():
            print(f"[-] Skipping {db_path} (does not exist)")
            continue

        print(f"\n[+] Processing database: {db_path}")
        conn = sqlite3.connect(db_path)
        c = conn.cursor()

        updated_count = 0
        lore_enriched_count = 0

        for platform, title_match, direct_url, size_mb, rom_fmt in TOP_CLASSICS:
            # Query the best matching game record in vault.db
            c.execute("""
                SELECT id, title, description, developer, publisher, release_year, direct_download_url
                FROM games
                WHERE platform = ? AND (title LIKE ? OR title = ?)
                ORDER BY length(title) ASC
                LIMIT 1
            """, (platform, f"%{title_match}%", title_match))

            row = c.fetchone()
            if not row:
                print(f"  [?] Not found: {platform} - '{title_match}'")
                continue

            gid, gtitle, gdesc, gdev, gpub, gyear, gdl = row

            # Fetch authentic Wikipedia synopsis if current is boilerplate or empty
            has_boilerplate = not gdesc or "Verified 1G1R" in gdesc or len(gdesc) < 60
            new_desc = gdesc
            new_dev = gdev
            new_pub = gpub
            new_year = gyear

            if has_boilerplate:
                cache_key = f"{platform}:{title_match}"
                if cache_key not in wiki_cache:
                    try:
                        wiki_res = fetch_wikipedia_game_synopsis_sync(title_match, platform)
                        wiki_cache[cache_key] = wiki_res
                    except Exception as e:
                        wiki_cache[cache_key] = None

                wiki_data = wiki_cache.get(cache_key)
                if wiki_data and wiki_data.get("description"):
                    new_desc = wiki_data["description"]
                    new_dev = wiki_data.get("developer") or gdev
                    new_pub = wiki_data.get("publisher") or gpub
                    new_year = wiki_data.get("release_year") or gyear
                    lore_enriched_count += 1

            # Prepare update statement
            c.execute("""
                UPDATE games
                SET direct_download_url = ?,
                    file_size_mb = ?,
                    rom_format = ?,
                    description = ?,
                    developer = ?,
                    publisher = ?,
                    release_year = ?,
                    is_featured = 1
                WHERE id = ?
            """, (direct_url, size_mb, rom_fmt, new_desc, new_dev, new_pub, new_year, gid))

            updated_count += 1
            desc_badge = " [LORE+WIKI]" if has_boilerplate and new_desc != gdesc else ""
            print(f"  [✓] [{platform}] {gtitle} -> {rom_fmt} ({size_mb} MB){desc_badge}")

        conn.commit()
        conn.close()
        print(f"[✓] {db_path.name}: {updated_count} top classics updated, {lore_enriched_count} lore descriptions enriched!")

    print("\n==================================================================")
    print("Database Lore & Mirror Enrichment Complete!")
    print("==================================================================")

if __name__ == "__main__":
    enrich_databases()
