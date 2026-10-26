import os
import sys
import sqlite3
import urllib.request
import ssl
from pathlib import Path

ctx = ssl._create_unverified_context()

VERIFIED_CATALOG_UPDATES = [
    # ==================== NINTENDO 64 ====================
    {
        "title_match": "Super Mario 64",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Super%20Mario%2064%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 6.26,
        "is_featured": 1
    },
    {
        "title_match": "Mario Kart 64",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Mario%20Kart%2064%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 9.5,
        "is_featured": 1
    },
    {
        "title_match": "Legend of Zelda, The - Ocarina of Time",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Legend%20of%20Zelda%2C%20The%20-%20Ocarina%20of%20Time%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 26.99,
        "is_featured": 1
    },
    {
        "title_match": "GoldenEye",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/007%20-%20GoldenEye%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 10.83,
        "is_featured": 0
    },
    {
        "title_match": "Super Smash Bros",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Super%20Smash%20Bros.%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 12.4,
        "is_featured": 0
    },
    {
        "title_match": "Star Fox 64",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Star%20Fox%2064%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 9.1,
        "is_featured": 0
    },
    {
        "title_match": "Majora",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Legend%20of%20Zelda%2C%20The%20-%20Majora's%20Mask%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 27.5,
        "is_featured": 0
    },
    {
        "title_match": "Banjo-Kazooie",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Banjo-Kazooie%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 14.2,
        "is_featured": 0
    },
    {
        "title_match": "Banjo-Tooie",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Banjo-Tooie%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 28.1,
        "is_featured": 0
    },
    {
        "title_match": "Diddy Kong Racing",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Diddy%20Kong%20Racing%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 10.5,
        "is_featured": 0
    },
    {
        "title_match": "Donkey Kong 64",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Donkey%20Kong%2064%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 23.4,
        "is_featured": 0
    },
    {
        "title_match": "Perfect Dark",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Perfect%20Dark%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 26.1,
        "is_featured": 0
    },
    {
        "title_match": "Paper Mario",
        "platform": "N64",
        "url": "https://downloads.consoleroms.com/roms/Paper%20Mario%20%28USA%29.zip",
        "format": ".z64",
        "size_mb": 35.2,
        "is_featured": 0
    },

    # ==================== PLAYSTATION 1 ====================
    {
        "title_match": "Final Fantasy VII",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Final%20Fantasy%20VII%20%5BNTSC-U%5D%20%5BDisc1of3%5D%20%5BSCUS-94163%5D.rar",
        "format": ".rar",
        "size_mb": 490.0,
        "is_featured": 1
    },
    {
        "title_match": "Final Fantasy VIII",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Final%20Fantasy%20VIII%20%28E%29%20%28Disc%201%29%20%5BSLES-02080%5D.7z",
        "format": ".7z",
        "size_mb": 465.0,
        "is_featured": 1
    },
    {
        "title_match": "Metal Gear Solid - VR Missions",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Metal%20Gear%20Solid%20-%20VR%20Missions%20%5BNTSC-U%5D%20%5BSLUS-00957%5D.rar",
        "format": ".rar",
        "size_mb": 280.0,
        "is_featured": 1
    },
    {
        "title_match": "Metal Gear Solid",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Metal%20Gear%20Solid%20%28E%29%20%28Disc%201%29%20%5BSLES-01370%5D.7z",
        "format": ".7z",
        "size_mb": 353.3,
        "is_featured": 0
    },
    {
        "title_match": "Castlevania - Symphony of the Night",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Castlevania%20-%20Symphony%20of%20the%20Night%20%5BNTSC-U%5D%20%5BSLUS-00067%5D.rar",
        "format": ".rar",
        "size_mb": 350.0,
        "is_featured": 0
    },
    {
        "title_match": "Crash Bandicoot",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Crash%20Bandicoot%20%5BNTSC-U%5D%20%5BSCUS-94900%5D.rar",
        "format": ".rar",
        "size_mb": 449.2,
        "is_featured": 0
    },
    {
        "title_match": "Spyro the Dragon",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Spyro%20the%20Dragon%20%28E%29%20%5BSCES-01438%5D.7z",
        "format": ".7z",
        "size_mb": 340.0,
        "is_featured": 0
    },
    {
        "title_match": "Tekken 3",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Tekken%203%20%28E%29%20%5BSCES-01237%5D.rar",
        "format": ".rar",
        "size_mb": 450.0,
        "is_featured": 0
    },
    {
        "title_match": "Silent Hill",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Silent%20Hill%20%28U%29%20%5BSLUS-00707%5D.rar",
        "format": ".rar",
        "size_mb": 300.0,
        "is_featured": 0
    },
    {
        "title_match": "Resident Evil 2",
        "platform": "PS1",
        "url": "https://downloads.consoleroms.com/roms/Resident_Evil_2%28E%29%28Disc_2%29%28Claire%29%5BSLES-10972%5D.rar",
        "format": ".rar",
        "size_mb": 380.0,
        "is_featured": 0
    },

    # ==================== PLAYSTATION 2 ====================
    {
        "title_match": "Shadow of the Colossus",
        "platform": "PS2",
        "url": "https://downloads.consoleroms.com/roms/Shadow%20of%20the%20Colossus%20%28USA%29.7z",
        "format": ".7z",
        "size_mb": 702.0,
        "is_featured": 1
    },
    {
        "title_match": "Final Fantasy X",
        "platform": "PS2",
        "url": "https://downloads.consoleroms.com/roms/Final%20Fantasy%20X%20%28USA%29.7z",
        "format": ".7z",
        "size_mb": 3450.0,
        "is_featured": 1
    },
    {
        "title_match": "God of War",
        "platform": "PS2",
        "url": "https://downloads.consoleroms.com/roms/God%20of%20War%20%28USA%29.7z",
        "format": ".7z",
        "size_mb": 6800.0,
        "is_featured": 1
    },
    {
        "title_match": "God of War II",
        "platform": "PS2",
        "url": "https://downloads.consoleroms.com/roms/God%20of%20War%20II%20%28USA%29.7z",
        "format": ".7z",
        "size_mb": 6900.0,
        "is_featured": 0
    },
    {
        "title_match": "Kingdom Hearts",
        "platform": "PS2",
        "url": "https://downloads.consoleroms.com/roms/Kingdom%20Hearts%20%28USA%29.7z",
        "format": ".7z",
        "size_mb": 2600.0,
        "is_featured": 0
    },

    # ==================== NINTENDO SWITCH ====================
    {
        "title_match": "Mario Kart 8 Deluxe",
        "platform": "Switch",
        "url": "https://archive.org/download/mario-kart-8-deluxe_202511/Mario%20Kart%208%20Deluxe.nsp",
        "format": ".nsp",
        "size_mb": 7268.0,
        "is_featured": 1
    },
    {
        "title_match": "The Legend of Zelda: Breath of the Wild",
        "platform": "Switch",
        "url": "https://archive.org/download/pixels-rom-archive/Breathofthewild-v181.nsp",
        "format": ".nsp",
        "size_mb": 990.0,
        "is_featured": 1
    },
    {
        "title_match": "Super Smash Bros. Ultimate",
        "platform": "Switch",
        "url": "https://archive.org/download/super-smash-bros-ultimate-01006-a-800016-e-800v-1966080-usnsw-2u.com/Super%20Smash%20Bros%20Ultimate%20%5B01006A800016E800%5D%5Bv1966080%5D%5BUS%5D%28nsw2u.com%29.nsp",
        "format": ".nsp",
        "size_mb": 3931.0,
        "is_featured": 1
    },
    {
        "title_match": "Super Mario Odyssey",
        "platform": "Switch",
        "url": "https://archive.org/download/00_20260703/SUPER%20MARIO%20ODYSSEY%20%5B0100000000010800%5D%5Bv262144%5D%5BUpdate%5D.nsp",
        "format": ".nsp",
        "size_mb": 397.0,
        "is_featured": 1
    }
]

def update_database(db_path: Path):
    if not db_path.exists():
        print(f"Skipping {db_path} (does not exist)")
        return

    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    updated = 0

    for item in VERIFIED_CATALOG_UPDATES:
        c.execute("""
            SELECT id, title FROM games 
            WHERE platform = ? AND (title LIKE ? OR title LIKE ?)
            LIMIT 1
        """, (item["platform"], f"%{item['title_match']}%", item["title_match"]))
        row = c.fetchone()
        if row:
            gid, gtitle = row
            c.execute("""
                UPDATE games SET 
                    direct_download_url = ?,
                    file_size_mb = ?,
                    rom_format = ?,
                    is_featured = ?
                WHERE id = ?
            """, (item["url"], item["size_mb"], item["format"], item["is_featured"], gid))
            print(f"[{item['platform']}] Updated '{gtitle}' (id: {gid}) -> {item['url'][:55]}...")
            updated += 1
        else:
            print(f"[{item['platform']}] Game '{item['title_match']}' not found in database")

    conn.commit()
    conn.close()
    print(f"-> Successfully updated {updated} games in {db_path}!\n")

if __name__ == "__main__":
    targets = [
        Path("/Volumes/ROMS/OmniVault-Source/backend/data/vault.db"),
        Path("/Volumes/ROMS/OmniVault.app/Contents/Resources/backend/data/vault.db")
    ]
    for t in targets:
        update_database(t)
