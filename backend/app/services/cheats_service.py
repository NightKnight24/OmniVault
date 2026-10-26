import os
import re
import json
import difflib
import urllib.request
import urllib.parse
import ssl
from pathlib import Path
from typing import List, Dict, Any, Optional

INDEX_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "cheats_index.json"
if not INDEX_PATH.exists():
    INDEX_PATH = Path(__file__).resolve().parent.parent / "data" / "cheats_index.json"

LIBRETRO_CHEAT_SYSTEMS = {
    "SNES": "Nintendo - Super Nintendo Entertainment System",
    "NES": "Nintendo - Nintendo Entertainment System",
    "N64": "Nintendo - Nintendo 64",
    "GBA": "Nintendo - Game Boy Advance",
    "GB": "Nintendo - Game Boy",
    "GBC": "Nintendo - Game Boy Color",
    "Genesis": "Sega - Mega Drive - Genesis",
    "MasterSystem": "Sega - Master System - Mark III",
    "GameGear": "Sega - Game Gear",
    "PS1": "Sony - PlayStation",
    "PSP": "Sony - PlayStation Portable",
    "NDS": "Nintendo - Nintendo DS",
    "TG16": "NEC - PC Engine - TurboGrafx 16",
    "Atari2600": "Atari - 2600"
}

_CHEAT_CACHE: Dict[str, List[Dict[str, str]]] = {}
_INDEX_TREE: Optional[Dict[str, List[tuple]]] = None

def load_cheat_index() -> Dict[str, List[tuple]]:
    global _INDEX_TREE
    if _INDEX_TREE is not None:
        return _INDEX_TREE
        
    _INDEX_TREE = {}
    if INDEX_PATH.exists():
        try:
            with open(INDEX_PATH, "r", encoding="utf-8") as f:
                paths = json.load(f)
                for p in paths:
                    parts = p.split("/")
                    if len(parts) >= 3:
                        sys_name = parts[1]
                        fname = parts[2]
                        if sys_name not in _INDEX_TREE:
                            _INDEX_TREE[sys_name] = []
                        _INDEX_TREE[sys_name].append((fname, p))
            return _INDEX_TREE
        except Exception as e:
            print(f"[Cheats Index Load Error]: {e}")
            
    return _INDEX_TREE

def parse_cht_file(content: str) -> List[Dict[str, str]]:
    cheats = []
    lines = content.splitlines()
    cheat_map: Dict[int, Dict[str, str]] = {}
    
    desc_re = re.compile(r"^cheat(\d+)_desc\s*=\s*\"(.*)\"", re.IGNORECASE)
    code_re = re.compile(r"^cheat(\d+)_code\s*=\s*\"(.*)\"", re.IGNORECASE)
    
    for line in lines:
        line = line.strip()
        dm = desc_re.match(line)
        if dm:
            idx = int(dm.group(1))
            if idx not in cheat_map:
                cheat_map[idx] = {}
            cheat_map[idx]["description"] = dm.group(2)
            continue
        cm = code_re.match(line)
        if cm:
            idx = int(cm.group(1))
            if idx not in cheat_map:
                cheat_map[idx] = {}
            cheat_map[idx]["code"] = cm.group(2)
            
    for idx in sorted(cheat_map.keys()):
        item = cheat_map[idx]
        if "description" in item and "code" in item:
            cheats.append({
                "id": f"cheat-{idx}",
                "description": item["description"],
                "code": item["code"],
                "type": "Game Genie / Action Replay"
            })
            
    return cheats

def find_matching_cheat_path(title: str, sys_dir: str) -> Optional[str]:
    index = load_cheat_index()
    candidates = index.get(sys_dir, [])
    if not candidates:
        return None
        
    clean_title = re.sub(r"[^a-zA-Z0-9]+", " ", title).lower().strip()
    words = [w for w in clean_title.split() if w not in ("the", "a", "an", "of", "in", "and", "version", "edition")]
    
    best_candidate = None
    best_score = -1.0
    
    for fname, full_path in candidates:
        stem = fname[:-4] if fname.endswith(".cht") else fname
        c_clean = re.sub(r"[^a-zA-Z0-9]+", " ", stem).lower().strip()
        
        # All key words must be present in candidate
        if words and not all(w in c_clean for w in words):
            continue
            
        bonus = 0.0
        if any(r in fname for r in ["(USA)", "(USA,", "(World)", "(En,", "(En)", "(USA, Europe)"]):
            bonus += 0.25
        if any(t in fname for t in ["(Action Replay)", "(Game Genie)", "(GameShark)", "(Code Breaker)"]):
            bonus += 0.1
            
        ratio = difflib.SequenceMatcher(None, clean_title, c_clean).ratio() + bonus
        if ratio > best_score:
            best_score = ratio
            best_candidate = full_path
            
    return best_candidate

def get_cheats_for_game(title: str, platform: str) -> List[Dict[str, str]]:
    """
    Returns authentic, verified cheat codes from Libretro's database.
    If no verified codes exist, returns an empty list without fake fabrications.
    """
    cache_key = f"{platform}:{title}"
    if cache_key in _CHEAT_CACHE:
        return _CHEAT_CACHE[cache_key]

    sys_dir = LIBRETRO_CHEAT_SYSTEMS.get(platform)
    if not sys_dir:
        _CHEAT_CACHE[cache_key] = []
        return []

    target_path = find_matching_cheat_path(title, sys_dir)
    
    # Fallback to direct USA title path if index didn't match
    if not target_path:
        clean_title = re.sub(r"[^\w\s-]", "", title).strip()
        target_path = f"cht/{sys_dir}/{clean_title} (USA).cht"

    # URL encode path segments
    segments = target_path.split("/")
    encoded_url = "https://raw.githubusercontent.com/libretro/libretro-database/master/" + "/".join(urllib.parse.quote(s) for s in segments)
    
    ctx = ssl._create_unverified_context()
    try:
        req = urllib.request.Request(encoded_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=4.0) as resp:
            if resp.status == 200:
                content = resp.read().decode("utf-8", errors="ignore")
                cheats = parse_cht_file(content)
                if cheats:
                    _CHEAT_CACHE[cache_key] = cheats[:60] # Return up to 60 real codes
                    return _CHEAT_CACHE[cache_key]
    except Exception as e:
        pass
        
    _CHEAT_CACHE[cache_key] = []
    return []
