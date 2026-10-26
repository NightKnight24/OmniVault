import sys
import os

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.scrapers.full_library_scraper import is_valid_candidate, SYSTEM_SOURCES
from app.services.mirror_resolver import R_ROMS_PLATFORM_COLLECTIONS

print("=== Starting Comprehensive Scrapers & Kodi Verification ===")

all_platforms = [
    "NES", "SNES", "N64", "GameCube", "Wii", "Switch",
    "GB", "GBC", "GBA", "NDS", "3DS",
    "Genesis", "SegaCD", "Saturn", "Dreamcast", "MasterSystem", "GameGear",
    "PS1", "PS2", "PS3", "PS4", "PSP", "PSVita",
    "Xbox", "Xbox360", "TG16", "NeoGeo", "Atari2600", "Atari7800", "Arcade"
]

print("\n--- 1. Testing Scraper Platform Collection Mappings ---")
for plat in all_platforms:
    # Check R_ROMS_PLATFORM_COLLECTIONS case-insensitively
    r_roms_colls = None
    for k, v in R_ROMS_PLATFORM_COLLECTIONS.items():
        if k.lower() == plat.lower():
            r_roms_colls = v
            break
    assert r_roms_colls is not None and len(r_roms_colls) > 0, f"Missing R_ROMS mapping for {plat}"

print(f"PASS: All {len(all_platforms)} platforms mapped in mirror_resolver with case-insensitivity.")

# Test 2: Verify is_valid_candidate for platform formats
print("\n--- 2. Testing Extension Validation Across Platform Classes ---")
test_cases = [
    ("Gran Turismo 4.iso", "PS2", True),
    ("Demon Souls.pkg", "PS3", True),
    ("Super Mario Odyssey.nsp", "Switch", True),
    ("Zelda BOTW.xci", "Switch", True),
    ("Pokemon X.cia", "3DS", True),
    ("Persona 4 Golden.vpk", "PSVita", True),
    ("Halo 2.iso", "Xbox", True),
    ("Metal Slug.zip", "Arcade", True),
    ("Sonic.md", "Genesis", True),
    ("Chrono Trigger.sfc", "SNES", True),
    ("Super Mario 64.z64", "N64", True),
    ("ReadMe.txt", "PS2", False),
    ("malware.exe", "Switch", False),
    ("cover.jpg", "PS3", False),
    ("nfo_file.nfo", "Xbox", False),
]

for filename, plat, expected in test_cases:
    result = is_valid_candidate(filename, plat)
    assert result == expected, f"Validation failure for {filename} ({plat}): expected {expected}, got {result}"
print(f"PASS: All {len(test_cases)} file candidate extension checks passed as expected.")

# Test 3: FastAPI TestClient API routes for Kodi Storefront
print("\n--- 3. Testing Storefront & Kodi API Queries ---")
client = TestClient(app)

# Health Check
r = client.get("/api/health")
assert r.status_code == 200
assert r.json().get("status") == "ok"
print("PASS: /api/health returned ok.")

# Total count & pagination
r = client.get("/api/games?page=1&limit=24")
assert r.status_code == 200
data = r.json()
total = data.get("total", 0)
assert total > 15000, f"Expected >15,000 games in catalog, got {total}"
print(f"PASS: Catalog contains {total} total titles.")

# Console Hub Filter queries for Kodi mode
for test_plat in ["SNES", "NES", "Genesis", "PS1", "GBA", "N64"]:
    r = client.get(f"/api/games?platform={test_plat}&page_size=80")
    assert r.status_code == 200
    res = r.json()
    games = res.get("games", [])
    assert len(games) > 0, f"Platform query for {test_plat} returned 0 games!"
    for item in games:
        assert item["platform"].lower() == test_plat.lower(), f"Item platform mismatch: {item['platform']} vs {test_plat}"
print("PASS: Kodi platform blade queries successfully filter and return console titles.")

# Storefront on-screen search test
search_queries = ["mario", "sonic", "zelda", "fantasy"]
for query in search_queries:
    r = client.get(f"/api/games?search={query}&page_size=20")
    assert r.status_code == 200
    games = r.json().get("games", [])
    assert len(games) > 0, f"Search for '{query}' returned no games!"
print(f"PASS: Live on-screen search queries ({', '.join(search_queries)}) return expected results.")

# Scraper Search Endpoint test across diverse platforms
print("\n--- 4. Testing /api/scrape/search Endpoint Handling ---")
for plat in ["SNES", "PS1", "PS2", "PS3", "Switch", "Arcade"]:
    payload = {"query": "test", "platform": plat}
    r = client.post("/api/scrape/search", json=payload)
    assert r.status_code == 200, f"Scrape search failed for platform {plat} with status {r.status_code}: {r.text}"
    scrape_res = r.json()
    assert "results" in scrape_res, f"Scrape response missing 'results' for {plat}"
print("PASS: /api/scrape/search correctly dispatches and responds for SNES, PS1, PS2, PS3, Switch, and Arcade.")

print("\n=== ALL AUDIT & INTEGRATION TESTS PASSED WITH ZERO ERRORS ===")
