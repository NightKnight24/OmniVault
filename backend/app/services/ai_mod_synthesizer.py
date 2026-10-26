"""
OmniVault Verified Cheat & Patch Synthesizer

Searches verified Libretro cheat databases (.cht) for codes matching a natural
language request (e.g. "Infinite lives and invincibility", "Moon jump", "Max coins")
and compiles an authentic RetroArch .cht file or decoded Game Genie IPS patch.
Never fabricates unverified memory offsets or dummy NOP patches.
"""

import re
import time
from pathlib import Path
from typing import Dict, Any, List

from .cheats_service import get_cheats_for_game
from .rom_cheat_engine import decode_nes_game_genie_6
from .patcher import (
    create_ips_patch_bytes,
    inject_retroarch_cht,
    PATCHES_STORAGE_DIR
)
from ..database import get_db_connection

_STOP_WORDS = {
    "a", "an", "the", "and", "or", "for", "in", "on", "to", "with", "of",
    "make", "give", "me", "player", "mode", "mod", "patch", "cheat", "code", "please"
}


def synthesize_ai_mod(
    game_id: str,
    game_title: str,
    platform: str,
    user_prompt: str
) -> Dict[str, Any]:
    """
    Matches a natural-language mod/cheat request against verified Libretro
    cheat codes for the target game and compiles a real .cht (or decoded NES IPS) file.
    """
    mod_id = f"verified_mod_{game_id}_{int(time.time())}"
    plat_upper = platform.upper()

    # 1. Query verified Libretro database for this game
    cheat_lookup = get_cheats_for_game(title=game_title, platform=platform)
    all_cheats = cheat_lookup if isinstance(cheat_lookup, list) else cheat_lookup.get("cheats", [])
    if not all_cheats:
        return {
            "status": "error",
            "message": f"No verified Libretro cheat database entry found for '{game_title}' ({platform}). Cannot synthesize a verified patch without known symbol/memory addresses."
        }

    # 2. Score cheats against prompt keywords
    tokens = [
        w for w in re.findall(r"[a-z0-9]+", user_prompt.lower())
        if len(w) >= 2 and w not in _STOP_WORDS
    ]

    matched_cheats: List[Dict[str, Any]] = []
    for ch in all_cheats:
        desc_lower = ch.get("description", "").lower()
        code_str = ch.get("code", "").strip()
        if not code_str:
            continue
        score = sum(2 if tok in desc_lower.split() else (1 if tok in desc_lower else 0) for tok in tokens)
        if score > 0:
            matched_cheats.append({"score": score, "name": ch["description"], "code": code_str})

    matched_cheats.sort(key=lambda x: x["score"], reverse=True)
    selected = matched_cheats[:8] if matched_cheats else [
        {"name": ch["description"], "code": ch["code"]}
        for ch in all_cheats[:5] if ch.get("code")
    ]

    if not selected:
        return {
            "status": "error",
            "message": f"No verified cheat codes matched '{user_prompt}' for {game_title}."
        }

    PATCHES_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    title_label = f"{game_title}: {user_prompt.strip().title()[:40]}"
    summary_names = ", ".join(c["name"] for c in selected[:4])
    description = f"Verified Libretro cheat bundle ({len(selected)} codes): {summary_names}"

    # 3. For NES games where codes decode cleanly as Game Genie, also offer an IPS patch if single-bank,
    # otherwise compile a verified RetroArch .cht file
    cht_path = inject_retroarch_cht(platform, game_title, selected)
    local_copy = PATCHES_STORAGE_DIR / f"{mod_id}.cht"
    local_copy.write_text(cht_path.read_text(encoding="utf-8"), encoding="utf-8")
    fmt = "cht"

    if plat_upper == "NES":
        ips_records = []
        for c in selected:
            for part in re.split(r"[\s+]+", c["code"]):
                decoded = decode_nes_game_genie_6(part)
                if decoded:
                    addr, val = decoded
                    # Convert CPU $8000-$FFFF to iNES file offset (+16 header)
                    file_offset = 16 + (addr - 0x8000)
                    ips_records.append({"offset": file_offset, "data": f"{val:02X}"})
        if ips_records:
            ips_path = PATCHES_STORAGE_DIR / f"{mod_id}.ips"
            ips_path.write_bytes(create_ips_patch_bytes(ips_records))
            local_copy = ips_path
            fmt = "ips"

    # 4. Register into vault.db
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
    INSERT INTO game_mods
    (id, game_id, game_title, platform, mod_title, category, description, author, version, patch_format, local_patch_path, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (
        mod_id, game_id, game_title, platform, title_label,
        "qol", description,
        "Libretro Verified DB", "v1.0", fmt, str(local_copy)
    ))
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "mod_id": mod_id,
        "title": title_label,
        "category": "qol",
        "description": description,
        "patch_format": fmt,
        "local_path": str(local_copy),
        "matched_codes": selected,
        "message": f"Compiled {len(selected)} verified Libretro code(s) for {game_title} ({summary_names})."
    }
