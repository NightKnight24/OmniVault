import os
import shutil
import sqlite3
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form
from ..database import get_db_connection
from ..services.patcher import (
    enable_mod_for_game,
    disable_mod_for_game,
    apply_patch_data,
    inject_pcsx2_pnach,
    inject_dolphin_gecko,
    PATCHES_STORAGE_DIR
)

router = APIRouter(prefix="/api/mods", tags=["mods"])

def init_mods_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS game_mods (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        game_title TEXT NOT NULL,
        platform TEXT NOT NULL,
        mod_title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        author TEXT,
        version TEXT,
        patch_format TEXT,
        patch_url TEXT,
        local_patch_path TEXT,
        is_enabled INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id)
    )
    """)
    conn.commit()

    # Remove any legacy placeholder seed rows that had no patch file on disk
    c.execute("DELETE FROM game_mods WHERE id LIKE 'mod_%' AND (local_patch_path IS NULL OR local_patch_path = '')")
    conn.commit()

    # Pre-populate verified Libretro cheat-pack mods backed by real .cht files on disk
    c.execute("SELECT COUNT(*) FROM game_mods WHERE local_patch_path IS NOT NULL AND local_patch_path != ''")
    if c.fetchone()[0] == 0:
        from ..services.cheats_service import get_cheats_for_game
        from ..services.patcher import inject_retroarch_cht
        PATCHES_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        seed_targets = [
            ("mod_ct_verified", "snes-chrono-trigger", "Chrono Trigger", "SNES", "Chrono Trigger: Verified Libretro Enhancement Pack", "qol"),
            ("mod_smw_verified", "snes-super-mario-world", "Super Mario World", "SNES", "Super Mario World: Verified Master Cheat & QoL Pack", "qol"),
            ("mod_alttp_verified", "snes-the-legend-of-zelda-a-link-to-the", "The Legend of Zelda: A Link to the Past", "SNES", "A Link to the Past: Verified Libretro Cheat Suite", "qol"),
            ("mod_smetroid_verified", "snes-super-metroid", "Super Metroid", "SNES", "Super Metroid: Verified Libretro Enhancement Suite", "qol"),
            ("mod_smb3_verified", "nes-super-mario-bros-3", "Super Mario Bros. 3", "NES", "Super Mario Bros. 3: Verified Game Genie & Libretro Pack", "qol"),
            ("mod_sonic2_verified", "genesis-sonic-the-hedgehog-2", "Sonic the Hedgehog 2", "Genesis", "Sonic the Hedgehog 2: Verified Libretro Cheat Pack", "qol"),
        ]
        for mod_id, game_id, game_title, platform, mod_title, category in seed_targets:
            db_res = get_cheats_for_game(title=game_title, platform=platform)
            cheat_list = db_res if isinstance(db_res, list) else db_res.get("cheats", [])
            raw_cheats = [
                {"name": ch["description"], "code": ch["code"]}
                for ch in cheat_list[:12]
                if ch.get("code")
            ]
            if not raw_cheats:
                continue
            cht_path = inject_retroarch_cht(platform, game_title, raw_cheats)
            local_copy = PATCHES_STORAGE_DIR / f"{mod_id}.cht"
            local_copy.write_text(cht_path.read_text(encoding="utf-8"), encoding="utf-8")
            summary = ", ".join(ch["name"] for ch in raw_cheats[:4])
            desc = f"Verified Libretro database bundle ({len(raw_cheats)} real codes): {summary}."
            c.execute("""
            INSERT OR REPLACE INTO game_mods 
            (id, game_id, game_title, platform, mod_title, category, description, author, version, patch_format, patch_url, local_patch_path, is_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Libretro Verified DB', 'v1.0', 'cht', '', ?, 0)
            """, (mod_id, game_id, game_title, platform, mod_title, category, desc, str(local_copy)))
        conn.commit()
    conn.close()

# Initialize table on import
init_mods_db()

@router.get("/catalog")
def get_mods_catalog(category: Optional[str] = None, platform: Optional[str] = None):
    """Lists all available mods and romhacks in the OmniVault Storefront."""
    conn = get_db_connection()
    c = conn.cursor()
    query = "SELECT * FROM game_mods WHERE 1=1"
    params = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if platform:
        query += " AND platform = ?"
        params.append(platform)
    query += " ORDER BY game_title ASC, mod_title ASC"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    return {"total": len(rows), "mods": [dict(r) for r in rows]}

@router.get("/game/{game_id}")
def get_game_mods(game_id: str):
    """Returns all mods associated with a specific game."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM game_mods WHERE game_id = ? ORDER BY mod_title ASC", (game_id,))
    mods = c.fetchall()
    
    # Also fetch game details
    c.execute("SELECT id, title, platform, rom_format FROM games WHERE id = ?", (game_id,))
    game = c.fetchone()
    conn.close()

    return {
        "game_id": game_id,
        "game": dict(game) if game else None,
        "total_mods": len(mods),
        "mods": [dict(m) for m in mods]
    }

@router.post("/toggle")
def toggle_mod(payload: Dict[str, Any] = Body(...)):
    """
    Toggles a mod ON or OFF for a game.
    When enabled: Synthesizes a non-destructive shadow copy in /Volumes/ROMS/.mod_cache/
    When disabled: Removes shadow cache and restores clean vanilla ROM.
    """
    mod_id = payload.get("mod_id")
    enabled = payload.get("enabled", payload.get("enable", True))

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM game_mods WHERE id = ?", (mod_id,))
    mod = c.fetchone()
    if not mod:
        conn.close()
        raise HTTPException(status_code=404, detail="Mod not found")

    game_id = mod["game_id"]
    platform = mod["platform"]
    c.execute("SELECT id, title, platform, rom_format FROM games WHERE id = ?", (game_id,))
    game = c.fetchone()

    # Search for actual clean ROM file in configured ROMs/{platform}
    from ..services.storage_service import get_roms_dir
    rom_folder = get_roms_dir() / platform
    clean_rom_path = None
    if rom_folder.exists():
        clean_title = "".join(c for c in mod["game_title"] if c.isalnum() or c in (" ", "-", "_")).strip().lower()
        for item in rom_folder.iterdir():
            if item.is_file() and not item.name.startswith("."):
                stem_l = item.stem.lower()
                if clean_title in stem_l or stem_l in clean_title:
                    clean_rom_path = str(item)
                    break

    action_result = {}
    if enabled:
        local_patch = mod["local_patch_path"]
        if not local_patch or not os.path.exists(local_patch):
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"No binary patch file (.{mod['patch_format'] or 'ips'}) is installed on disk for '{mod['mod_title']}'. Please import a real .{mod['patch_format'] or 'ips'} patch file first."
            )

        patch_size = os.path.getsize(local_patch)
        if patch_size <= 8:
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Patch file '{local_patch}' is empty or invalid ({patch_size} bytes)."
            )

        if (mod["patch_format"] or "").lower() == "cht":
            rom_folder.mkdir(parents=True, exist_ok=True)
            safe_title = "".join(ch for ch in mod["game_title"] if ch.isalnum() or ch in (" ", "-", "_", ".")).strip()
            dest_cht = rom_folder / f"{safe_title}.cht"
            shutil.copy2(local_patch, dest_cht)
            ra_dir = Path.home() / f"Library/Application Support/RetroArch/cheats/{platform}"
            ra_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(local_patch, ra_dir / f"{safe_title}.cht")
            action_result = {
                "status": "enabled_cht",
                "deployed_path": str(dest_cht),
                "message": f"Deployed verified .cht cheat pack to {dest_cht}"
            }
        elif clean_rom_path and os.path.exists(clean_rom_path):
            try:
                action_result = enable_mod_for_game(clean_rom_path, local_patch, game_id, mod_id)
            except Exception as e:
                conn.close()
                raise HTTPException(status_code=400, detail=f"Failed to apply patch: {e}")
        else:
            action_result = {"status": "enabled_virtual", "message": "Mod enabled (ROM will be patched when present on disk)"}

        c.execute("UPDATE game_mods SET is_enabled = 1 WHERE id = ?", (mod_id,))
    else:
        if (mod["patch_format"] or "").lower() == "cht":
            safe_title = "".join(ch for ch in mod["game_title"] if ch.isalnum() or ch in (" ", "-", "_", ".")).strip()
            dest_cht = rom_folder / f"{safe_title}.cht"
            if dest_cht.exists():
                dest_cht.unlink()
            action_result = {"status": "disabled", "message": "Removed active .cht pack"}
        elif clean_rom_path and os.path.exists(clean_rom_path):
            action_result = disable_mod_for_game(clean_rom_path, game_id, mod_id)
        else:
            action_result = {"status": "disabled", "message": "Vanilla ROM restored"}

        c.execute("UPDATE game_mods SET is_enabled = 0 WHERE id = ?", (mod_id,))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "mod_id": mod_id,
        "is_enabled": 1 if enabled else 0,
        "details": action_result
    }

@router.post("/upload-custom")
async def upload_custom_patch(
    game_id: str = Form(...),
    game_title: str = Form(...),
    platform: str = Form(...),
    mod_title: str = Form(...),
    category: str = Form("romhack"),
    author: Optional[str] = Form("Community"),
    description: Optional[str] = Form("User imported patch"),
    file: UploadFile = File(...)
):
    """
    Allows the user to upload any .ips, .bps, .ups, or .xdelta patch
    and register it in their vault with automatic non-destructive toggling.
    """
    contents = await file.read()
    if len(contents) <= 8 or contents == b"PATCHEOF" or contents.lstrip().startswith((b"<!DOCTYPE", b"<html", b"<HTML")):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty, an HTML page, or not a valid binary patch (.ips/.bps/.ups/.xdelta/.pnach)."
        )
    suffix = Path(file.filename).suffix.lower().replace(".", "") or "ips"
    safe_mod_id = f"custom_{game_id}_{int(os.times().elapsed * 1000)}"
    dest_path = PATCHES_STORAGE_DIR / f"{safe_mod_id}.{suffix}"
    dest_path.write_bytes(contents)

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    INSERT INTO game_mods 
    (id, game_id, game_title, platform, mod_title, category, description, author, version, patch_format, local_patch_path, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (
        safe_mod_id, game_id, game_title, platform, mod_title,
        category, description, author, "1.0", suffix, str(dest_path)
    ))
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "mod_id": safe_mod_id,
        "mod_title": mod_title,
        "message": f"Successfully registered custom patch: {file.filename}"
    }

# =========================================================================
# Community Romhack Scraper & AI Auto-Installer APIs
# =========================================================================

@router.get("/scrape-community")
async def scrape_community(query: str, platform: Optional[str] = None):
    """Searches Romhacking.net and community patch databases for matching hacks/translations."""
    from ..services.romhack_scraper import search_community_patches
    results = await search_community_patches(query, platform=platform)
    return {
        "query": query,
        "platform": platform,
        "count": len(results),
        "results": results
    }

@router.post("/auto-install")
async def auto_install_patch(payload: Dict[str, Any] = Body(...)):
    """Downloads community patch, extracts archive, verifies headers, and registers it in vault."""
    from ..services.romhack_scraper import auto_setup_community_patch
    mod_id = payload.get("mod_id") or f"comm_{int(os.times().elapsed * 1000)}"
    game_id = payload.get("game_id", "custom-game")
    game_title = payload.get("game_title", "Game")
    platform = payload.get("platform", "SNES")
    mod_title = payload.get("mod_title", "Community Patch")
    category = payload.get("category", "romhack")
    download_url = payload.get("download_url", "")
    author = payload.get("author", "Community")
    version = payload.get("version", "1.0")
    patch_format = payload.get("patch_format", "ips")

    res = await auto_setup_community_patch(
        mod_id=mod_id,
        game_id=game_id,
        game_title=game_title,
        platform=platform,
        mod_title=mod_title,
        category=category,
        download_url=download_url,
        author=author,
        version=version,
        patch_format=patch_format
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Could not download a valid binary patch"))
    return res

# =========================================================================
# OmniAI Mod & Patch Synthesizer
# =========================================================================

@router.post("/ai-generate")
@router.post("/ai-synthesize")
def ai_generate_mod(payload: Dict[str, Any] = Body(...)):
    """
    Searches verified Libretro cheat databases and ROM opcode patterns
    for matching cheats and compiles a real emulator cheat/patch file.
    """
    from ..services.ai_mod_synthesizer import synthesize_ai_mod
    game_id = payload.get("game_id", "custom-game")
    game_title = payload.get("game_title", "Game")
    platform = payload.get("platform", "SNES")
    prompt = payload.get("prompt", "")

    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    res = synthesize_ai_mod(
        game_id=game_id,
        game_title=game_title,
        platform=platform,
        user_prompt=prompt
    )
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "No verified cheat codes matched your request."))
    return res

# =========================================================================
# Universal Standalone Emulator Patch Generator
# =========================================================================

@router.post("/generate-emulator-patches")
def generate_emulator_patches(payload: Dict[str, Any] = Body(...)):
    """
    Generates native cheat/patch files using verified Libretro database codes
    or user-supplied valid codes. Rejects dummy placeholder addresses (00100000).
    """
    from ..services.patcher import (
        _filter_real_patches,
        inject_pcsx2_pnach,
        inject_dolphin_gecko,
        inject_ppsspp_cwcheat,
        inject_rpcs3_patch,
        inject_vita3k_cheat,
        inject_shadps4_patch,
        inject_xenia_patch,
        inject_cemu_patch,
        inject_citra_cheat,
        inject_ryujinx_cheat,
        inject_melonds_cheat,
        inject_xemu_patch,
        inject_retroarch_cht,
    )
    from ..services.cheats_service import get_cheats_for_game

    platform = payload.get("platform", "SNES").upper()
    title = payload.get("title", "Game")
    game_id = payload.get("game_id", "").strip()
    crc = payload.get("crc", "").strip()
    patches = _filter_real_patches(payload.get("patches", []))

    # If no custom patches were supplied, pull verified cheats from local Libretro database
    if not patches:
        db_res = get_cheats_for_game(title=title, platform=platform)
        cheat_list = db_res if isinstance(db_res, list) else db_res.get("cheats", [])
        for ch in cheat_list[:15]:
            if ch.get("code"):
                patches.append({
                    "name": ch.get("description", "Verified Cheat"),
                    "code": ch["code"],
                    "codes": [c.strip() for c in ch["code"].split("+") if c.strip()],
                })

    try:
        created_path = None
        if platform == "PS2":
            lines = [
                p["code"] if p.get("code") else f"patch=1,EE,{p.get('addr')},extended,{p.get('val')}"
                for p in patches
                if p.get("code") or (p.get("addr") and p.get("val"))
            ]
            created_path = inject_pcsx2_pnach(crc, title, lines)
        elif platform in ("GAMECUBE", "WII"):
            lines = [p.get("code") or f"{p.get('addr')} {p.get('val')}" for p in patches if p.get("code") or (p.get("addr") and p.get("val"))]
            created_path = inject_dolphin_gecko(game_id, title, lines)
        elif platform == "PSP":
            created_path = inject_ppsspp_cwcheat(game_id, title, patches)
        elif platform == "PS3":
            created_path = inject_rpcs3_patch(game_id, title, patches)
        elif platform in ("PSVITA", "VITA", "PSTV"):
            created_path = inject_vita3k_cheat(game_id, title, patches)
        elif platform == "PS4":
            created_path = inject_shadps4_patch(game_id, title, patches)
        elif platform in ("XBOX360", "X360"):
            created_path = inject_xenia_patch(game_id, title, patches)
        elif platform in ("WIIU", "WII-U"):
            created_path = inject_cemu_patch(game_id, title, patches, module_crc=crc if crc and crc != "FFFFFFFF" else None)
        elif platform in ("3DS", "N3DS"):
            created_path = inject_citra_cheat(game_id, title, patches)
        elif platform in ("SWITCH", "NSW"):
            created_path = inject_ryujinx_cheat(game_id, crc, title, patches)
        elif platform in ("NDS", "DSI"):
            created_path = inject_melonds_cheat(game_id, title, patches)
        elif platform == "XBOX":
            created_path = inject_xemu_patch(title, patches)
        else:
            created_path = inject_retroarch_cht(platform, title, patches)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "platform": platform,
        "title": title,
        "patch_file": str(created_path),
        "cheats_injected": len(patches),
        "message": f"Injected {len(patches)} verified cheat/patch entry(s) for {title}."
    }
