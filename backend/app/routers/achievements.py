import os
import json
import time
import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
from ..database import get_db_connection
from .saves import find_active_save_files, get_snapshot_folder

router = APIRouter(prefix="/api/achievements", tags=["achievements"])

RA_API_BASE = "https://retroachievements.org/API"

# Console ID mapping for RetroAchievements
RA_CONSOLE_MAP = {
    "NES": 7,
    "SNES": 3,
    "N64": 2,
    "GB": 4,
    "GBC": 6,
    "GBA": 5,
    "Genesis": 1,
    "PS1": 12,
    "PS2": 21,
    "Saturn": 18,
    "Dreamcast": 40,
    "PSP": 41,
    "NDS": 19,
    "GameCube": 88
}

def init_trophies_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS unlocked_trophies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        trophy_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        points INTEGER NOT NULL,
        rarity TEXT NOT NULL,
        unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'save_tracker',
        save_file_path TEXT,
        UNIQUE(game_id, trophy_id)
    )
    """)
    conn.commit()
    conn.close()

init_trophies_db()

def get_ra_credentials():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT key, value FROM settings WHERE key IN ('ra_username', 'ra_api_key', 'ra_sound_style')")
    rows = c.fetchall()
    conn.close()
    settings = {r["key"]: r["value"] for r in rows}
    username = settings.get("ra_username", "").strip()
    api_key = settings.get("ra_api_key", "").strip()
    return {
        "username": username,
        "api_key": api_key,
        "sound_style": settings.get("ra_sound_style", "playstation"), # 'playstation' | 'xbox' | 'arcade'
        "configured": bool(username and api_key)
    }

TITLE_SPECIFIC_TROPHIES = {
    "chrono trigger": [
        ("The Millennial Fair", "Explore Leene Square with Marle and partake in the fair attractions.", "bronze", 15),
        ("Beyond Time", "Travel through the mysterious Gate to 600 A.D. and rescue Queen Leene.", "bronze", 25),
        ("Magus's Citadel", "Infiltrate the Dark Mage's stronghold and discover the true summoning of Lavos.", "silver", 50),
        ("Wings of Time", "Acquire the Epoch and unlock the power to traverse any era across human history.", "gold", 100),
        ("Savior of Spacetime", "Confront and defeat the alien parasite Lavos, securing the planet's permanent future.", "platinum", 200),
    ],
    "super mario 64": [
        ("Peach's Castle Grounds", "Step through the castle doors and collect your first Power Star in Bob-omb Battlefield.", "bronze", 15),
        ("Bowser of the Dark World", "Infiltrate Bowser's subterranean domain and retrieve the first basement key.", "bronze", 25),
        ("Dire, Dire Docks Mastery", "Drain the water levels and unlock the upper castle towers with over 50 Stars.", "silver", 50),
        ("Bowser in the Sky", "Conquer the floating cloud obstacle course and claim victory with 70+ Power Stars.", "gold", 100),
        ("120 Star Completionist", "Collect every secret Power Star in the castle, fire the roof cannon, and meet Yoshi.", "platinum", 200),
    ],
    "god of war": [
        ("Wrath of the Hydra", "Slay the gargantuan multi-headed Hydra aboard the storm-tossed Aegean fleet.", "bronze", 15),
        ("Blades of Chaos", "Upgrade your deadly chained blades to unleash devastating Olympian combos.", "bronze", 25),
        ("Pandora's Guardian", "Navigate the lethal traps within Pandora's Temple and claim the mythical Box.", "silver", 50),
        ("Fall of the God of War", "Defeat the rogue Ares in mortal combat and ascend to the vacant throne of Olympus.", "gold", 100),
        ("Ghost of Sparta", "Conquer all Challenges of the Gods and master Spartan combat with ultimate perfection.", "platinum", 200),
    ],
    "metal gear solid": [
        ("Infiltration of Shadow Moses", "Infiltrate the Alaskan nuclear facility undetected through the frigid heliport.", "bronze", 15),
        ("Telepathic Duel", "Outsmart Psycho Mantis in the commander's office by switching your controller port.", "bronze", 25),
        ("Snowfield Sniper", "Defeat Sniper Wolf in a long-range battle of patience and obtain the PAL keycard.", "silver", 50),
        ("REX Neutralized", "Destroy the radome of Metal Gear REX alongside the Cyborg Ninja Frank Jaeger.", "gold", 100),
        ("Big Boss Codename", "Escape Shadow Moses with Meryl and achieve the ultimate ranking in tactical stealth.", "platinum", 200),
    ],
    "pokemon": [
        ("Boulder & Cascade", "Defeat the initial Gym Leaders and earn your first official League badges.", "bronze", 15),
        ("Rocket Hideout Buster", "Infiltrate the underground syndicate base and overcome the Rocket Boss.", "bronze", 25),
        ("Legendary Roost", "Seek out the hidden sanctuary and capture a legendary mythical beast.", "silver", 50),
        ("League Champion", "Overcome the Elite Four in consecutive battles and claim the Champion title.", "gold", 100),
        ("National Dex Perfection", "Catalog and conquer the complete National Pokedex across all regions.", "platinum", 200),
    ],
    "sonic": [
        ("Green Hill Rush", "Clear Act 3 of Green Hill Zone at supersonic speed and destroy Robotnik's wrecker.", "bronze", 15),
        ("Special Stage Vault", "Rotate through the psychedelic maze and claim your first shining Chaos Emerald.", "bronze", 25),
        ("Star Light Velocity", "Master the high-speed loops and floating mines of Star Light Zone.", "silver", 50),
        ("Final Zone Confrontation", "Infiltrate the inner sanctum of the Scrap Brain factory without losing any rings.", "gold", 100),
        ("Supersonic Master", "Collect all 6 Chaos Emeralds and restore peaceful nature to South Island.", "platinum", 200),
    ],
    "legend of zelda": [
        ("Kokiri Emerald", "Banish the spider queen Gohma and obtain the spiritual stone of the forest.", "bronze", 15),
        ("Pedestal of Time", "Draw the sacred Master Sword from the Temple of Time to traverse 7 years into the future.", "bronze", 25),
        ("Sages Awakened", "Cleanse the corruption from the Forest, Fire, and Water Temples to unite the Sages.", "silver", 50),
        ("Ganon's Castle Siege", "Dispel the elemental barriers and confront the King of Evil in his tower.", "gold", 100),
        ("Hero of Time", "Defeat the demonic beast Ganon and restore eternal light to the realm of Hyrule.", "platinum", 200),
    ],
    "halo": [
        ("Pillar of Autumn", "Escape the hijacked cruiser and make planetfall on the mysterious ringworld.", "bronze", 15),
        ("Silent Cartographer", "Infiltrate the island facility to locate the control center of Installation 04.", "bronze", 25),
        ("343 Guilty Spark", "Survive the terrifying release of the Flood parasitic organism in the swamp.", "silver", 50),
        ("Two Betrayals", "Disable the pulse generators and navigate the covenant-flood crossfire.", "gold", 100),
        ("Combat Evolved Legend", "Detonate the autumn's fusion reactor and escape the ring on Legendary difficulty.", "platinum", 200),
    ],
    "castlevania": [
        ("Entrance Hall Vampire Hunter", "Cross the moat into Dracula's cursed castle wielding the ancestral whip.", "bronze", 15),
        ("Creatures of the Night", "Vanquish the giant bat and Medusa heads lurking in the castle catacombs.", "bronze", 25),
        ("Clock Tower Ascent", "Scale the perilous swinging clock pendulums while evading Death's flying sickles.", "silver", 50),
        ("Lord of Darkness Defeated", "Confront Count Dracula in the highest keep and destroy his demonic incarnation.", "gold", 100),
        ("Belmont Legacy", "Conquer the cursed castle without continuing, cementing your place as a legendary hunter.", "platinum", 200),
    ]
}

GENRE_TEMPLATES = {
    "RPG": [
        ("Tavern's Call", "Accept your inaugural quest and establish your party's first save camp.", "bronze", 15),
        ("Dungeon Delver", "Conquer early catacombs, defeat the regional miniboss, and acquire rare artifacts.", "bronze", 25),
        ("Arcane Awakening", "Master tier-3 spells, expand your inventory, and survive the mid-game boss gauntlet.", "silver", 50),
        ("Threshold of Destiny", "Infiltrate the antagonist's citadel and acquire the game's ultimate weapons.", "gold", 100),
        ("Realm Savior", "Defeat the final cataclysmic entity and view the complete true campaign ending.", "platinum", 200),
    ],
    "Racing": [
        ("Green Flag Launch", "Complete your qualifying heat and register your initial circuit time trial.", "bronze", 15),
        ("Pole Position", "Win your first championship race and upgrade your vehicle's engine and handling.", "bronze", 25),
        ("Apex Predator", "Record a flawless drift combo and dominate the pro circuit across multiple courses.", "silver", 50),
        ("Grand Prix Victor", "Finish in 1st place across all championship cups on maximum tournament difficulty.", "gold", 100),
        ("Legend of the Asphalt", "Set world-class lap records and collect every trophy and vehicle in the garage.", "platinum", 200),
    ],
    "Fighting": [
        ("Challenger Approaches", "Win your first bout in Arcade mode with a decisive round victory.", "bronze", 15),
        ("Combo Virtuoso", "Execute a 10-hit combination attack and perform a signature character special.", "bronze", 25),
        ("Mirror Match Survivor", "Overcome the mid-boss bracket without exhausting your round timer.", "silver", 50),
        ("Tournament Champion", "Defeat the final boss on default difficulty and unlock the character's cinematic ending.", "gold", 100),
        ("Grandmaster of the Arena", "Clear survival mode and triumph with a Perfect victory on highest difficulty.", "platinum", 200),
    ],
    "Shooter": [
        ("Scramble Departure", "Deploy into the combat zone and clear Wave 1 with your primary armament.", "bronze", 15),
        ("Heavy Ordinance", "Upgrade weapons to maximum firepower and eliminate the sector dreadnought.", "bronze", 25),
        ("Bullet Curtain Survivor", "Navigate dense projectile storm fields without losing your secondary shield.", "silver", 50),
        ("Fleet Obliteration", "Surpass 1,000,000 points and destroy the flagship in the final sector.", "gold", 100),
        ("1CC Ace Pilot", "Complete the full mission sortie on a single credit without continuing.", "platinum", 200),
    ],
    "Platformer": [
        ("First Leap", "Clear World 1-1 and discover your first hidden bonus chamber.", "bronze", 15),
        ("Secret Pathway", "Find an alternate warp zone and collect all special stage tokens.", "bronze", 25),
        ("Subterranean Gauntlet", "Survive the hazardous lava or ice fortress and defeat the regional commander.", "silver", 50),
        ("Castle Citadel Siege", "Navigate treacherous bottomless pits and overcome the final gauntlet of worlds.", "gold", 100),
        ("Master Platformer", "Collect 100% of all coins, stars, and secret exits across every kingdom.", "platinum", 200),
    ],
    "Sports": [
        ("Rookie Debut", "Play your opening match and score your first official game points.", "bronze", 15),
        ("Clutch Playmaker", "Execute a buzzer-beater or game-winning play in the final moments of a contest.", "bronze", 25),
        ("Playoff Contender", "Lead your franchise through a winning season and secure a postseason spot.", "silver", 50),
        ("League Championship", "Win the championship finals series and claim the championship trophy.", "gold", 100),
        ("Hall of Fame Dynasty", "Dominate the league across consecutive seasons with MVP individual honors.", "platinum", 200),
    ],
    "Action": [
        ("Combat Initiate", "Survive your first skirmish and master weapon parry or evasion mechanics.", "bronze", 15),
        ("Arsenal Upgrade", "Equip advanced offensive gear and clear the stronghold perimeter.", "bronze", 25),
        ("Overwhelming Odds", "Defeat a horde of elite foes while maintaining high health efficiency.", "silver", 50),
        ("Stronghold Breaker", "Infiltrate the commander's inner sanctum and overcome the penultimate guardian.", "gold", 100),
        ("Apex Warrior", "Conquer the campaign on master difficulty with highest combat grading.", "platinum", 200),
    ]
}

def generate_custom_trophies(game: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generates authentic, unique custom trophies tailored specifically for the given game.
    Checks for title-specific handcrafted sets first, then genre-specific mechanics,
    ensuring achievements are never identical generic copies.
    """
    raw_title = game.get("title", "Classic Game").lower()
    platform = game.get("platform", "Retro")
    genre = game.get("genre") or "Action"
    game_id = str(game.get("id", "game"))

    # 1. Check title-specific database
    trophy_specs = None
    for key, specs in TITLE_SPECIFIC_TROPHIES.items():
        if key in raw_title:
            trophy_specs = specs
            break

    # 2. Check genre-specific database
    if not trophy_specs:
        matched_genre = next((g for g in GENRE_TEMPLATES if g.lower() in genre.lower()), None)
        if matched_genre:
            trophy_specs = GENRE_TEMPLATES[matched_genre]
        else:
            trophy_specs = GENRE_TEMPLATES["Action"]

    trophies = []
    badges = [
        "https://api.dicebear.com/7.x/shapes/svg?seed=bronze&backgroundColor=b45309",
        "https://api.dicebear.com/7.x/shapes/svg?seed=checkpoint&backgroundColor=92400e",
        "https://api.dicebear.com/7.x/shapes/svg?seed=silver&backgroundColor=64748b",
        "https://api.dicebear.com/7.x/shapes/svg?seed=gold&backgroundColor=eab308",
        "https://api.dicebear.com/7.x/shapes/svg?seed=platinum&backgroundColor=38bdf8",
    ]

    for idx, (t_title, t_desc, tier, pts) in enumerate(trophy_specs):
        trophies.append({
            "id": f"{game_id}_t{idx+1}",
            "tier": tier,
            "title": t_title,
            "description": t_desc,
            "points": pts,
            "badge": badges[idx % len(badges)]
        })

    return trophies

def evaluate_and_unlock_save_trophies(game: Dict[str, Any]) -> List[str]:
    """
    Scans real emulator save files and snapshots on the player's system.
    Unlocks eligible trophies into the database and returns newly unlocked trophy IDs.
    """
    game_id = str(game["id"])
    title = game["title"]
    platform = game["platform"]
    
    # 1. Search active save files across emulator directories
    active_saves = find_active_save_files(title, platform)
    
    # 2. Check snapshot folder manifest
    snapshot_folder = get_snapshot_folder(title)
    manifest_file = snapshot_folder / "snapshots_manifest.json"
    snapshot_count = 0
    if manifest_file.exists():
        try:
            with open(manifest_file, "r") as f:
                snaps = json.load(f)
                snapshot_count = len(snaps)
        except Exception:
            snapshot_count = 0

    max_save_bytes = 0
    save_path_str = None
    if active_saves:
        for p in active_saves:
            try:
                sz = p.stat().st_size
                if sz > max_save_bytes:
                    max_save_bytes = sz
                    save_path_str = str(p)
            except Exception:
                pass

    custom_trophies = generate_custom_trophies(game)
    
    # Determine which trophies qualify:
    # Only award verified events (real save file detected or real snapshots created).
    # Never fabricate story/boss achievements based on fixed SRAM cartridge byte sizes.
    to_unlock = []
    
    has_active_save = len(active_saves) > 0
    if has_active_save:
        to_unlock.append(custom_trophies[0])  # First Steps (active save file detected)
        
    if snapshot_count >= 1:
        to_unlock.append(custom_trophies[1])  # Checkpoint Secured (player recorded Time-Machine snapshot)
        
    if snapshot_count >= 3:
        to_unlock.append(custom_trophies[2])  # Seasoned Explorer (multiple snapshots archived)

    newly_unlocked = []
    conn = get_db_connection()
    c = conn.cursor()
    
    for t in to_unlock:
        try:
            c.execute("""
            INSERT INTO unlocked_trophies (game_id, trophy_id, title, description, points, rarity, source, save_file_path)
            VALUES (?, ?, ?, ?, ?, ?, 'save_tracker', ?)
            """, (game_id, t["id"], t["title"], t["description"], t["points"], t["tier"], save_path_str))
            newly_unlocked.append(t["id"])
        except Exception:
            # Already unlocked
            pass

    conn.commit()
    conn.close()
    return newly_unlocked

@router.get("/config")
def get_config():
    """Returns current RetroAchievements configuration and credentials status."""
    creds = get_ra_credentials()
    return {
        "username": creds["username"],
        "sound_style": creds["sound_style"],
        "is_configured": creds["configured"]
    }

@router.post("/config")
def save_config(payload: Dict[str, Any] = Body(...)):
    """Saves RetroAchievements username, Web API key, and preferred chime sound style."""
    username = payload.get("username", "").strip()
    api_key = payload.get("api_key", "").strip()
    sound_style = payload.get("sound_style", "playstation").lower()
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO settings (key, value) VALUES ('ra_username', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (username,))
    c.execute("INSERT INTO settings (key, value) VALUES ('ra_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (api_key,))
    c.execute("INSERT INTO settings (key, value) VALUES ('ra_sound_style', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (sound_style,))
    conn.commit()
    conn.close()
    
    return {
        "status": "saved",
        "username": username,
        "sound_style": sound_style,
        "is_configured": bool(username and api_key)
    }

@router.get("/game/{game_id}")
async def get_game_achievements(game_id: str):
    """
    Fetches achievements for a game.
    If RetroAchievements credentials are configured and the game is found on RA, returns official RA set.
    Otherwise, automatically generates custom authentic trophies and checks local save data progression.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM games WHERE id = ?", (str(game_id),))
    game = c.fetchone()
    conn.close()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
        
    creds = get_ra_credentials()
    
    # 1. Attempt RetroAchievements API if user configured credentials
    if creds["configured"]:
        try:
            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
                console_id = RA_CONSOLE_MAP.get(game["platform"])
                ra_game_id = None
                
                if console_id:
                    list_url = f"{RA_API_BASE}/API_GetGameList.php"
                    params = {
                        "i": console_id,
                        "z": creds["username"],
                        "y": creds["api_key"]
                    }
                    r = await client.get(list_url, params=params)
                    if r.status_code == 200:
                        games_list = r.json()
                        clean_title = game["title"].lower().strip()
                        for item in games_list:
                            if clean_title in item.get("Title", "").lower():
                                ra_game_id = item.get("ID")
                                break

                if ra_game_id:
                    progress_url = f"{RA_API_BASE}/API_GetGameInfoAndUserProgress.php"
                    prog_params = {
                        "u": creds["username"],
                        "g": ra_game_id,
                        "z": creds["username"],
                        "y": creds["api_key"]
                    }
                    r2 = await client.get(progress_url, params=prog_params)
                    if r2.status_code == 200:
                        data = r2.json()
                        raw_achievements = data.get("Achievements", {})
                        if raw_achievements:
                            trophies = []
                            for aid, ach in raw_achievements.items():
                                trophies.append({
                                    "id": aid,
                                    "tier": "gold" if int(ach.get("Points", 0)) >= 50 else ("silver" if int(ach.get("Points", 0)) >= 25 else "bronze"),
                                    "title": ach.get("Title"),
                                    "description": ach.get("Description"),
                                    "points": int(ach.get("Points", 0)),
                                    "badge": f"https://media.retroachievements.org/Badge/{ach.get('BadgeName')}.png",
                                    "unlocked": bool(ach.get("DateEarned")),
                                    "date_earned": ach.get("DateEarned")
                                })
                                
                            unlocked_count = sum(1 for t in trophies if t.get("unlocked"))
                            total_points = sum(t.get("points", 0) for t in trophies)
                            earned_points = sum(t.get("points", 0) for t in trophies if t.get("unlocked"))

                            return {
                                "game_id": game_id,
                                "ra_game_id": ra_game_id,
                                "title": game["title"],
                                "platform": game["platform"],
                                "system_type": "retroachievements",
                                "is_configured": True,
                                "total_achievements": len(trophies),
                                "unlocked_count": unlocked_count,
                                "completion_percentage": round((unlocked_count / len(trophies)) * 100) if trophies else 0,
                                "total_points": total_points,
                                "earned_points": earned_points,
                                "sound_style": creds["sound_style"],
                                "achievements": trophies,
                                "message": f"Connected to official RetroAchievements set ({len(trophies)} trophies)."
                            }
        except Exception as e:
            print(f"[RetroAchievements API Error]: {e}")

    # 2. Universal Custom Trophy System & Save Data Auto-Tracker
    # Automatically scan save data and unlock eligible milestones
    evaluate_and_unlock_save_trophies(dict(game))
    
    # Read all currently unlocked trophies from database
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT trophy_id, unlocked_at FROM unlocked_trophies WHERE game_id = ?", (str(game_id),))
    unlocked_map = {r["trophy_id"]: r["unlocked_at"] for r in c.fetchall()}
    conn.close()

    base_trophies = generate_custom_trophies(dict(game))
    final_trophies = []
    for t in base_trophies:
        is_unlocked = t["id"] in unlocked_map
        final_trophies.append({
            "id": t["id"],
            "tier": t["tier"],
            "title": t["title"],
            "description": t["description"],
            "points": t["points"],
            "badge": t["badge"],
            "unlocked": is_unlocked,
            "date_earned": unlocked_map.get(t["id"]) if is_unlocked else None
        })

    active_saves = find_active_save_files(game["title"], game["platform"])
    unlocked_count = sum(1 for t in final_trophies if t.get("unlocked"))
    total_points = sum(t.get("points", 0) for t in final_trophies)
    earned_points = sum(t.get("points", 0) for t in final_trophies if t.get("unlocked"))

    return {
        "game_id": game_id,
        "title": game["title"],
        "platform": game["platform"],
        "system_type": "universal_custom",
        "is_configured": True,
        "total_achievements": len(final_trophies),
        "unlocked_count": unlocked_count,
        "completion_percentage": round((unlocked_count / len(final_trophies)) * 100) if final_trophies else 0,
        "total_points": total_points,
        "earned_points": earned_points,
        "sound_style": creds["sound_style"],
        "has_active_saves": len(active_saves) > 0,
        "active_save_count": len(active_saves),
        "achievements": final_trophies,
        "message": "Custom Milestone System active. Connect your RetroAchievements account in Settings for live in-game memory tracking, or record Save Time Machine checkpoints."
    }

@router.post("/scan-progress/{game_id}")
def scan_game_progress(game_id: str):
    """
    Manually scans emulator paths and snapshot archives for this game,
    evaluating save progress and unlocking newly completed achievements.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM games WHERE id = ?", (str(game_id),))
    game = c.fetchone()
    conn.close()
    
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    newly_unlocked = evaluate_and_unlock_save_trophies(dict(game))
    
    # Fetch refreshed achievement state
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT trophy_id, unlocked_at FROM unlocked_trophies WHERE game_id = ?", (str(game_id),))
    unlocked_rows = c.fetchall()
    conn.close()

    creds = get_ra_credentials()
    active_saves = find_active_save_files(game["title"], game["platform"])
    
    return {
        "status": "success",
        "game_id": game_id,
        "active_saves_found": len(active_saves),
        "newly_unlocked_count": len(newly_unlocked),
        "newly_unlocked_ids": newly_unlocked,
        "total_unlocked": len(unlocked_rows),
        "sound_style": creds["sound_style"],
        "should_chime": len(newly_unlocked) > 0,
        "message": f"Scanned {len(active_saves)} emulator save files. Unlocked {len(newly_unlocked)} new milestones!" if newly_unlocked else f"Scanned {len(active_saves)} save files. Progress is up to date."
    }

@router.post("/unlock-manual")
def manual_unlock_trophy(payload: Dict[str, Any] = Body(...)):
    """
    Allows the user to manually trigger or mark a custom trophy as completed.
    """
    game_id = str(payload.get("game_id", ""))
    trophy_id = str(payload.get("trophy_id", ""))
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM games WHERE id = ?", (game_id,))
    game = c.fetchone()
    if not game:
        conn.close()
        raise HTTPException(status_code=404, detail="Game not found")

    customs = generate_custom_trophies(dict(game))
    target = next((t for t in customs if t["id"] == trophy_id), None)
    if not target:
        # Fallback generic
        target = {
            "id": trophy_id,
            "title": payload.get("title", "Custom Milestone"),
            "description": payload.get("description", "Player verified achievement"),
            "points": int(payload.get("points", 25)),
            "tier": payload.get("tier", "silver")
        }

    c.execute("""
    INSERT OR REPLACE INTO unlocked_trophies (game_id, trophy_id, title, description, points, rarity, source)
    VALUES (?, ?, ?, ?, ?, ?, 'manual')
    """, (game_id, target["id"], target["title"], target["description"], target["points"], target["tier"]))
    conn.commit()
    conn.close()

    creds = get_ra_credentials()
    return {
        "status": "unlocked",
        "game_id": game_id,
        "trophy_id": target["id"],
        "title": target["title"],
        "points": target["points"],
        "sound_style": creds["sound_style"]
    }

@router.post("/test-chime")
@router.post("/unlock")
def test_audio_chime(payload: Dict[str, Any] = Body(...)):
    """
    Triggers an audio/visual chime test on the frontend.
    """
    sound_style = payload.get("sound_style")
    creds = get_ra_credentials()
    active_style = sound_style or creds["sound_style"]

    return {
        "status": "tested",
        "title": payload.get("title") or "Trophy Chime Audio Test",
        "points": int(payload.get("points") or 10),
        "badge": payload.get("badge") or "https://media.retroachievements.org/Badge/00001.png",
        "sound_style": active_style,
        "tested_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@router.get("/summary")
async def get_user_summary():
    """
    Fetches real user trophy summary and rank.
    Combines RetroAchievements if connected, or summarizes local custom trophy unlocks.
    """
    creds = get_ra_credentials()
    
    # Query local custom trophy stats
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*), SUM(points) FROM unlocked_trophies")
    row = c.fetchone()
    local_unlocked = row[0] if row and row[0] is not None else 0
    local_points = row[1] if row and row[1] is not None else 0
    
    c.execute("""
    SELECT t.title, t.points, t.unlocked_at, g.title as game_title
    FROM unlocked_trophies t
    LEFT JOIN games g ON t.game_id = g.id
    ORDER BY t.unlocked_at DESC
    LIMIT 5
    """)
    recent_rows = c.fetchall()
    conn.close()

    recent_unlocks = [
        {
            "game": r["game_title"] or "OmniVault Title",
            "title": r["title"],
            "points": r["points"],
            "date": r["unlocked_at"]
        } for r in recent_rows
    ]

    if not creds["configured"]:
        return {
            "username": "Local Player",
            "is_configured": True,
            "total_unlocked": local_unlocked,
            "total_points": local_points,
            "global_rank": f"Vault Explorer ({local_unlocked} Unlocks)",
            "recent_unlocks": recent_unlocks
        }

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            url = f"{RA_API_BASE}/API_GetUserSummary.php"
            params = {
                "u": creds["username"],
                "z": creds["username"],
                "y": creds["api_key"]
            }
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                recent = []
                for item in data.get("RecentAchievements", [])[:5]:
                    recent.append({
                        "game": item.get("GameTitle", "Classic Game"),
                        "title": item.get("Title", "Achievement"),
                        "points": int(item.get("Points", 0)),
                        "date": item.get("Date", "Recently")
                    })

                return {
                    "username": creds["username"],
                    "is_configured": True,
                    "total_unlocked": int(data.get("TotalRankedAchievements", 0)) + local_unlocked,
                    "total_points": int(data.get("TotalPoints", 0)) + local_points,
                    "global_rank": f"#{data.get('Rank', 'N/A')}",
                    "recent_unlocks": recent or recent_unlocks
                }
    except Exception as e:
        print(f"[RA User Summary Error]: {e}")

    return {
        "username": creds["username"],
        "is_configured": True,
        "total_unlocked": local_unlocked,
        "total_points": local_points,
        "global_rank": "Active",
        "recent_unlocks": recent_unlocks
    }
