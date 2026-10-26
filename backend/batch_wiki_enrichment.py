#!/usr/bin/env python3
"""
OmniVault Batch Retro Lore Enrichment Pipeline.
Asynchronously enriches hundreds of iconic classic games with authentic Wikipedia
game summaries, release dates, developers, and publishers.
"""

import os
import sys
import re
import json
import sqlite3
import asyncio
import urllib.parse
from pathlib import Path
from typing import Dict, Any, Optional, List
import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from app.scrapers.metadata_scraper import fetch_wikipedia_game_synopsis_sync

DB_PATHS = [
    Path("/Volumes/ROMS/OmniVault-Source/backend/data/vault.db"),
    Path("/Volumes/ROMS/OmniVault.app/Contents/Resources/backend/data/vault.db")
]

USER_AGENT = "OmniVaultRetroPreservation/2.0 (https://omnivault.org; contact@omnivault.org)"

async def fetch_wikipedia_async(client: httpx.AsyncClient, title: str, platform: str) -> Optional[Dict[str, Any]]:
    raw_clean = re.sub(r"\[.*?\]", "", re.split(r"\(", title)[0]).strip()
    raw_clean = raw_clean.replace("_", " ").replace("-", " ").strip()
    if not raw_clean or len(raw_clean) < 2:
        return None

    # Strip publisher prefixes
    no_prefix = re.sub(r"^(Disney's|Tom Clancy's|Sid Meier's|LEGO)\s+", "", raw_clean, flags=re.I).strip()

    candidates = [
        f"{raw_clean} (video game)",
        f"{raw_clean} ({platform} video game)",
        raw_clean,
    ]
    if no_prefix and no_prefix != raw_clean:
        candidates.extend([
            f"{no_prefix} (video game)",
            f"{no_prefix} ({platform} video game)",
            no_prefix
        ])

    queries = [
        f"{raw_clean} {platform} video game",
        f"{raw_clean} video game",
    ]

    for q in queries:
        try:
            search_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={urllib.parse.quote(q)}&limit=3&namespace=0&format=json"
            resp = await client.get(search_url, timeout=3.5)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) >= 2 and data[1]:
                    for item in data[1]:
                        if item not in candidates:
                            candidates.append(item)
        except Exception:
            pass

    for page_title in candidates[:5]:
        try:
            encoded_page = urllib.parse.quote(page_title.replace(" ", "_"))
            summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded_page}"
            resp = await client.get(summary_url, timeout=3.5)
            if resp.status_code == 200:
                info = resp.json()
                extract = (info.get("extract") or "").strip()
                if not extract or info.get("type") == "disambiguation" or "may refer to:" in extract or len(extract) < 50:
                    continue
                # Must be video game / media related
                if not any(w in extract.lower() for w in ["game", "play", "nintendo", "sega", "playstation", "xbox", "arcade", "series", "released", "developed", "published"]):
                    continue

                year_match = re.search(r"\b(19[789]\d|20[012]\d)\b", extract[:350])
                year = int(year_match.group(1)) if year_match else None
                dev_match = re.search(r"developed by ([A-Z][A-Za-z0-9\s&\-\.']+?)(?:\s+and published|\s+and released|\s+while\b|\s+for\b|\s+on\b|\s+in\b|,|\.)", extract[:450])
                pub_match = re.search(r"published by ([A-Z][A-Za-z0-9\s&\-\.']+?)(?:\s+and\b|\s+while\b|\s+for\b|\s+on\b|\s+in\b|,|\.)", extract[:450])
                both_match = re.search(r"developed and published by ([A-Z][A-Za-z0-9\s&\-\.']+?)(?:\s+and\b|\s+while\b|\s+for\b|\s+on\b|\s+in\b|,|\.)", extract[:450])
                dev = both_match.group(1).strip() if both_match else (dev_match.group(1).strip() if dev_match else None)
                pub = both_match.group(1).strip() if both_match else (pub_match.group(1).strip() if pub_match else None)
                return {
                    "description": extract,
                    "release_year": year,
                    "developer": dev,
                    "publisher": pub,
                }
        except Exception:
            continue
    return None

async def process_batch():
    primary_db = DB_PATHS[0]
    if not primary_db.exists():
        print(f"Error: {primary_db} not found!")
        return

    conn = sqlite3.connect(primary_db)
    c = conn.cursor()

    # Select candidates across classic retro systems that have boilerplate description
    c.execute("""
        SELECT id, platform, title, developer, publisher, release_year
        FROM games
        WHERE description LIKE '%Verified 1G1R%'
          AND platform IN ('SNES', 'N64', 'NES', 'GBA', 'Genesis', 'PS1', 'PS2')
          AND (
            title LIKE '%Mario%' OR title LIKE '%Zelda%' OR title LIKE '%Metroid%' OR
            title LIKE '%Castlevania%' OR title LIKE '%Pokemon%' OR title LIKE '%Mega Man%' OR
            title LIKE '%Sonic%' OR title LIKE '%Final Fantasy%' OR title LIKE '%Dragon Quest%' OR
            title LIKE '%Street Fighter%' OR title LIKE '%Resident Evil%' OR title LIKE '%Silent Hill%' OR
            title LIKE '%Crash%' OR title LIKE '%Spyro%' OR title LIKE '%Tekken%' OR
            title LIKE '%Donkey Kong%' OR title LIKE '%Kirby%' OR title LIKE '%Star Fox%' OR
            title LIKE '%F-Zero%' OR title LIKE '%Contra%' OR title LIKE '%Chrono%'
          )
        ORDER BY platform, title
        LIMIT 200
    """)
    rows = c.fetchall()
    conn.close()

    print(f"[*] Found {len(rows)} iconic retro candidates to enrich with authentic lore...")

    semaphore = asyncio.Semaphore(5)
    headers = {"User-Agent": USER_AGENT}
    results = []

    async with httpx.AsyncClient(headers=headers, follow_redirects=True, verify=False) as client:
        async def worker(row):
            gid, plat, title, dev, pub, year = row
            async with semaphore:
                try:
                    await asyncio.sleep(0.08)
                    res = await fetch_wikipedia_async(client, title, plat)
                    if res and res.get("description"):
                        return (gid, plat, title, res["description"], res.get("developer") or dev, res.get("publisher") or pub, res.get("release_year") or year)
                except Exception as e:
                    pass
                return None

        tasks = [worker(row) for row in rows]
        completed = await asyncio.gather(*tasks)
        results = [r for r in completed if r is not None]

    print(f"[+] Successfully extracted authentic Wikipedia lore for {len(results)} of {len(rows)} games!")

    # Write to all databases
    for db_path in DB_PATHS:
        if not db_path.exists():
            continue
        c_conn = sqlite3.connect(db_path)
        cur = c_conn.cursor()
        for gid, plat, title, desc, dev, pub, year in results:
            cur.execute("""
                UPDATE games
                SET description = ?,
                    developer = ?,
                    publisher = ?,
                    release_year = ?
                WHERE id = ?
            """, (desc, dev, pub, year, gid))
        c_conn.commit()
        c_conn.close()
        print(f"[✓] Successfully committed {len(results)} enriched lore updates to {db_path.name}!")

if __name__ == "__main__":
    asyncio.run(process_batch())
