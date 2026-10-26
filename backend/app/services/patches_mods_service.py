import urllib.parse
from typing import List, Dict, Any

def get_patches_and_mods_for_game(title: str, platform: str) -> Dict[str, List[Dict[str, Any]]]:
    quoted = urllib.parse.quote(title)
    
    # Community Patches & Enhancements
    patches = [
        {
            "id": "patch-trans",
            "name": f"Romhacking.net Translation Registry for {title}",
            "category": "Translation",
            "description": f"Query community translations of dialogue, menus, and text into English and other languages for {title}.",
            "format": "BPS / IPS / XDelta",
            "author": "Romhacking.net Community",
            "source_url": f"https://www.romhacking.net/?page=translations&title={quoted}"
        },
        {
            "id": "patch-bugfix",
            "name": f"Romhacking.net Bugfix & Performance Hacks for {title}",
            "category": "Enhancement",
            "description": f"Community patches fixing original slowdown, uncapping framerates, and restoring unreleased content for {title}.",
            "format": "BPS / IPS",
            "author": "Retro Preservation Community",
            "source_url": f"https://www.romhacking.net/?page=hacks&title={quoted}"
        },
        {
            "id": "patch-wide",
            "name": f"GitHub 16:9 Widescreen & 60 FPS Patches",
            "category": "Display",
            "description": f"Open-source widescreen geometry hacks, Gecko codes, and ultra-wide patches matching {title}.",
            "format": "Gecko Code / Widescreen Patch",
            "author": "Widescreen Gaming Community",
            "source_url": f"https://github.com/search?q={quoted}+widescreen+patch&type=repositories"
        }
    ]
    
    # Add MSU-1 only for SNES games where MSU-1 audio is actually supported
    if platform.upper() == "SNES":
        patches.append({
            "id": "patch-audio",
            "name": f"Zeldix MSU-1 CD-Quality Orchestral Audio for {title}",
            "category": "Audio Overhaul",
            "description": f"High-fidelity uncompressed CD-quality orchestral soundtracks and FMV audio tracks for {title}.",
            "format": "MSU-1 / PCM",
            "author": "Zeldix MSU Community",
            "source_url": f"https://www.zeldix.net/search?keywords={quoted}"
        })

    # Community ROM Hacks & Expansions
    mods = [
        {
            "id": "mod-hacks",
            "name": f"Romhacking.net ROM Hacks & Total Conversions for {title}",
            "category": "ROM Hack",
            "description": f"Community-authored levels, custom sprites, revamped map layouts, and fan storylines for {title}.",
            "version": "Live Directory",
            "difficulty": "Varies by Author",
            "author": "Romhacking.net Community",
            "source_url": f"https://www.romhacking.net/?page=hacks&title={quoted}"
        },
        {
            "id": "mod-randomizer",
            "name": f"GitHub Open-Source Randomizer Projects for {title}",
            "category": "Randomizer",
            "description": f"Speedrunning and logic-randomizer projects shuffling item locations, encounters, and dungeons for {title}.",
            "version": "Live Repositories",
            "difficulty": "Customizable Logic",
            "author": "Open-Source Speedrun Community",
            "source_url": f"https://github.com/search?q={quoted}+randomizer&type=repositories"
        }
    ]

    return {
        "patches": patches,
        "mods": mods
    }
