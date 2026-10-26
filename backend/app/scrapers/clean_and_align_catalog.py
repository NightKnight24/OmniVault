#!/usr/bin/env python3
import os
import sys
import shutil
import sqlite3
import re
from pathlib import Path

PLATFORM_NAMES = {
    "Arcade": "Arcade Classics",
    "NES": "Nintendo Entertainment System",
    "SNES": "Super Nintendo",
    "N64": "Nintendo 64",
    "GameCube": "Nintendo GameCube",
    "Wii": "Nintendo Wii",
    "WiiU": "Nintendo Wii U",
    "Switch": "Nintendo Switch",
    "GB": "Game Boy",
    "GBC": "Game Boy Color",
    "GBA": "Game Boy Advance",
    "NDS": "Nintendo DS",
    "3DS": "Nintendo 3DS",
    "Genesis": "Sega Genesis",
    "MasterSystem": "Sega Master System",
    "GameGear": "Sega Game Gear",
    "Saturn": "Sega Saturn",
    "Dreamcast": "Sega Dreamcast",
    "SegaCD": "Sega CD",
    "PS1": "Sony PlayStation",
    "PS2": "Sony PlayStation 2",
    "PS3": "Sony PlayStation 3",
    "PS4": "Sony PlayStation 4",
    "PSP": "PlayStation Portable",
    "PSVita": "PlayStation Vita",
    "Xbox": "Microsoft Xbox",
    "Xbox360": "Xbox 360",
    "Atari2600": "Atari 2600",
    "Atari5200": "Atari 5200",
    "Atari7800": "Atari 7800",
    "NeoGeo": "Neo Geo AES/MVS",
    "TG16": "TurboGrafx-16",
    "C64": "Commodore 64",
    "WonderSwan": "WonderSwan",
    "WonderSwanColor": "WonderSwan Color"
}

def clean_database(db_path: Path):
    print(f"=== Cleaning and Aligning OmniVault Catalog in {db_path} ===")
    if not db_path.exists():
        print(f"Error: {db_path} does not exist!")
        return

    # Backup original
    backup_path = db_path.with_name("vault.db.bak")
    if not backup_path.exists():
        print(f"-> Creating safe backup at {backup_path}...")
        shutil.copy2(db_path, backup_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("SELECT count(*) FROM games")
    initial_count = cur.fetchone()[0]
    print(f"Initial game count: {initial_count:,}")

    # 1. Clean Arcade junk entries
    print("-> Identifying and purging non-game MAME raw ROM codes, BIOS dumps, and slot sets...")
    cur.execute("SELECT id, title FROM games WHERE platform = 'Arcade'")
    arcade_rows = cur.fetchall()
    junk_arcade_ids = []
    
    for gid, title in arcade_rows:
        # Short 8-char codes without spaces (e.g. 3b1, 3c505, 11beat)
        if len(title) <= 8 and ' ' not in title:
            junk_arcade_ids.append(gid)
            continue
        
        low = title.lower()
        # BIOS, hardware tests, slot machines, mahjong, poker
        if any(k in low for k in ['bios', 'device', 'sample', 'test', 'poker', 'mahjong', 'slot', 'cherry master', 'roulette', 'juke', 'laserdisc']):
            junk_arcade_ids.append(gid)
            continue

        letters = re.findall(r'[a-zA-Z]', title)
        if len(letters) < 3:
            junk_arcade_ids.append(gid)
            continue

        # Hardware part numbers like 3B2 300, 32X Scd, 24 150
        if re.match(r'^[0-9]+[A-Za-z0-9\s\-_]+$', title) and len(letters) <= 3:
            junk_arcade_ids.append(gid)
            continue

    if junk_arcade_ids:
        cur.executemany("DELETE FROM games WHERE id = ?", [(i,) for i in junk_arcade_ids])
        conn.commit()
        print(f"-> Purged {len(junk_arcade_ids):,} MAME junk rows from Arcade catalog.")

    # 2. Deduplicate titles within each platform
    print("-> Deduplicating multi-entries per platform (keeping best metadata)...")
    cur.execute("""
    DELETE FROM games WHERE id NOT IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY platform, LOWER(TRIM(title)) 
                ORDER BY 
                    CASE WHEN direct_download_url IS NOT NULL AND direct_download_url NOT LIKE '%archive.org%' THEN 1 ELSE 2 END,
                    CASE WHEN box_art_2d IS NOT NULL THEN 1 ELSE 2 END,
                    CASE WHEN rating > 0 THEN 1 ELSE 2 END,
                    id ASC
            ) as row_num
            FROM games
        ) WHERE row_num = 1
    )
    """)
    deduped = cur.rowcount
    conn.commit()
    print(f"-> Removed {deduped:,} duplicate game rows.")

    # 3. Clean out dead Archive.org URLs and fake BitTorrent magnet hashes
    print("-> Clearing non-working Archive.org URLs (allowing Torrentio on-demand resolver to fetch live mirrors)...")
    cur.execute("UPDATE games SET direct_download_url = NULL WHERE direct_download_url LIKE '%archive.org%'")
    cleaned_archive_urls = cur.rowcount
    conn.commit()
    print(f"-> Cleared {cleaned_archive_urls:,} dead Archive.org URLs.")

    print("-> Clearing synthetic fake BitTorrent magnet links...")
    cur.execute("UPDATE games SET magnet_uri = NULL WHERE magnet_uri LIKE 'magnet:?xt=urn:btih:%'")
    cleaned_magnets = cur.rowcount
    conn.commit()
    print(f"-> Cleared {cleaned_magnets:,} fake magnet hashes.")

    # 4. Standardize platform display names
    print("-> Standardizing platform display names across all consoles...")
    for plat_code, full_name in PLATFORM_NAMES.items():
        cur.execute("UPDATE games SET platform_name = ? WHERE platform = ?", (full_name, plat_code))
    conn.commit()

    # 5. Get final catalog stats
    cur.execute("SELECT count(*) FROM games")
    final_count = cur.fetchone()[0]
    print(f"\nFinal authentic game catalog count: {final_count:,} titles (Cleaned {initial_count - final_count:,} rows).")

    cur.execute("SELECT platform, platform_name, count(*) FROM games GROUP BY platform ORDER BY count(*) DESC LIMIT 15")
    print("\nTop 15 Authentic Consoles in OmniVault:")
    for row in cur.fetchall():
        print(f"  • {row[1]} ({row[0]}): {row[2]:,} games")

    # 6. VACUUM to shrink file size and re-index SQLite B-trees
    print("\n-> Running VACUUM to optimize database pages and indexing...")
    conn.execute("VACUUM")
    conn.close()
    print("-> Database optimization complete!")

if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/Volumes/ROMS/OmniVault-Source/backend/data/vault.db")
    clean_database(target)
