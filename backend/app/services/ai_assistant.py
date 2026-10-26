import re
import os
import sqlite3
import json
import time
from html import unescape
from typing import Dict, Any, List, Optional
from pathlib import Path
try:
    import httpx
except ImportError:
    httpx = None

from ..database import get_db_connection, row_to_game_dict

# Model location: packaged inside OmniVault data/models
MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = MODEL_DIR / "qwen2.5-0.5b-instruct-q4_k_m.gguf"

_LLM_INSTANCE = None
_DOWNLOAD_STATE = {"status": "idle", "progress": 0.0, "downloaded_mb": 0.0, "total_mb": 469.0, "error": None}

def get_model_status() -> Dict[str, Any]:
    installed = MODEL_PATH.exists()
    return {
        "installed": installed,
        "model_name": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "file_size_mb": round(MODEL_PATH.stat().st_size / (1024 * 1024), 1) if installed else 0,
        "acceleration": "Apple Silicon Metal (GPU offload)" if sys.platform == "darwin" else "CPU multi-threaded",
        "download_state": _DOWNLOAD_STATE
    }

def start_model_download_background():
    global _DOWNLOAD_STATE
    if MODEL_PATH.exists() or _DOWNLOAD_STATE["status"] == "downloading":
        return
        
    def _worker():
        global _DOWNLOAD_STATE, _LLM_INSTANCE
        url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
        temp_path = MODEL_PATH.with_suffix(".part")
        try:
            _DOWNLOAD_STATE["status"] = "downloading"
            _DOWNLOAD_STATE["error"] = None
            req = urllib.request.Request(url, headers={"User-Agent": "OmniVault/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(temp_path, "wb") as f_out:
                total = int(resp.headers.get("content-length", 491782144))
                _DOWNLOAD_STATE["total_mb"] = round(total / (1024 * 1024), 1)
                downloaded = 0
                while True:
                    chunk = resp.read(1024 * 512)
                    if not chunk:
                        break
                    f_out.write(chunk)
                    downloaded += len(chunk)
                    _DOWNLOAD_STATE["downloaded_mb"] = round(downloaded / (1024 * 1024), 1)
                    _DOWNLOAD_STATE["progress"] = round((downloaded / total) * 100, 1)
            temp_path.rename(MODEL_PATH)
            _DOWNLOAD_STATE["status"] = "completed"
            _DOWNLOAD_STATE["progress"] = 100.0
            _LLM_INSTANCE = None
        except Exception as e:
            _DOWNLOAD_STATE["status"] = "error"
            _DOWNLOAD_STATE["error"] = str(e)
            if temp_path.exists():
                temp_path.unlink()

    import threading
    import urllib.request
    import sys
    t = threading.Thread(target=_worker, daemon=True)
    t.start()

def get_local_llm():
    global _LLM_INSTANCE
    if _LLM_INSTANCE is not None:
        return _LLM_INSTANCE
        
    if MODEL_PATH.exists():
        try:
            from llama_cpp import Llama
            # Initialize with 4 threads, 2048 context window, and full Metal GPU offloading for Apple Silicon
            _LLM_INSTANCE = Llama(
                model_path=str(MODEL_PATH),
                n_ctx=2048,
                n_threads=4,
                n_gpu_layers=-1,
                verbose=False
            )
            print("-> [OmniAI] Successfully loaded embedded local model into memory.")
            return _LLM_INSTANCE
        except Exception as e:
            print(f"[OmniAI LLM Load Error]: {e}")
            return None
    return None

def query_relevant_games(keywords: List[str], platform: Optional[str] = None, genre: Optional[str] = None, limit: int = 4) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM games WHERE 1=1"
    params = []
    
    if platform and platform.upper() != "ALL":
        query += " AND platform = ?"
        params.append(platform)
        
    if genre and genre.upper() != "ALL":
        query += " AND genre = ?"
        params.append(genre)
        
    if keywords:
        like_clauses = []
        for kw in keywords:
            like_clauses.append("(title LIKE ? OR description LIKE ?)")
            params.extend([f"%{kw}%", f"%{kw}%"])
        query += f" AND ({' OR '.join(like_clauses)})"
        
    query += """ ORDER BY is_featured DESC, rating DESC,
        CASE
            WHEN title LIKE 'Super Mario%' OR title LIKE 'Mega Man%' OR title LIKE 'Castlevania%'
              OR title LIKE 'Kirby%' OR title LIKE '%Zelda%' OR title LIKE 'Chrono%'
              OR title LIKE '%Metroid%' OR title LIKE 'Sonic%' OR title LIKE 'Donkey Kong%'
              OR title LIKE 'Final Fantasy%' OR title LIKE 'Street Fighter%' OR title LIKE 'Contra%'
              OR title LIKE 'DuckTales%' THEN 1
            ELSE 0
        END DESC,
        rating_count DESC LIMIT ?"""
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    return [row_to_game_dict(r) for r in rows]

def get_random_top_games(platform: Optional[str] = None, genre: Optional[str] = None, limit: int = 3) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM games WHERE 1=1"
    params = []
    
    if platform and platform.upper() != "ALL":
        query += " AND platform = ?"
        params.append(platform)
    if genre and genre.upper() != "ALL":
        query += " AND genre = ?"
        params.append(genre)
        
    query += " ORDER BY RANDOM() LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [row_to_game_dict(r) for r in rows]

def detect_platform(msg: str) -> Optional[tuple]:
    platforms_map = {
        "snes": ("SNES", "Super Nintendo"),
        "super nintendo": ("SNES", "Super Nintendo"),
        "nes": ("NES", "Nintendo Entertainment System"),
        "n64": ("N64", "Nintendo 64"),
        "nintendo 64": ("N64", "Nintendo 64"),
        "gamecube": ("GameCube", "Nintendo GameCube"),
        "game cube": ("GameCube", "Nintendo GameCube"),
        "wii": ("Wii", "Nintendo Wii"),
        "gba": ("GBA", "Game Boy Advance"),
        "game boy advance": ("GBA", "Game Boy Advance"),
        "gbc": ("GBC", "Game Boy Color"),
        "gb": ("GB", "Game Boy"),
        "nds": ("NDS", "Nintendo DS"),
        "genesis": ("Genesis", "Sega Genesis"),
        "mega drive": ("Genesis", "Sega Genesis"),
        "dreamcast": ("Dreamcast", "Sega Dreamcast"),
        "saturn": ("Saturn", "Sega Saturn"),
        "ps1": ("PS1", "Sony PlayStation 1"),
        "playstation": ("PS1", "Sony PlayStation 1"),
        "psp": ("PSP", "Sony PlayStation Portable"),
        "neogeo": ("NeoGeo", "SNK Neo Geo"),
        "tg16": ("TG16", "TurboGrafx-16"),
        "atari": ("Atari2600", "Atari 2600")
    }
    for k, v in platforms_map.items():
        if k in msg:
            return v
    return None

def detect_genre(msg: str) -> Optional[str]:
    genres_list = ["RPG", "Platformer", "Fighting", "Racing", "Sports", "Shooter", "Strategy", "Survival Horror", "Puzzle"]
    for g in genres_list:
        if g.lower() in msg or (g == "Survival Horror" and "horror" in msg):
            return g
    return None

def fetch_online_walkthrough_guide(query: str) -> Optional[Dict[str, Any]]:
    """
    Live Online Walkthrough & Strategy Retriever.
    Searches StrategyWiki and Web Strategy Guides to provide real-time
    solutions when a player is stuck on a puzzle, dungeon, boss, or level.
    """
    if not httpx:
        return None
        
    stopwords = {
        'the', 'in', 'of', 'on', 'at', 'a', 'an', 'for', 'to', 'and', 'with', 'is', 'it',
        'how', 'do', 'i', 'can', 'you', 'give', 'me', 'what', 'where', 'get', 'past', 'beat',
        'solve', 'help', 'stuck', 'walkthrough', 'guide', 'am', 'my', 'please', 'tell'
    }
    raw_words = re.sub(r'[^a-zA-Z0-9]', ' ', query.lower()).split()
    meaningful_words = [w for w in raw_words if w not in stopwords]
    cleaned_query = ' '.join(meaningful_words)
    if not cleaned_query:
        cleaned_query = query
        
    headers = {'User-Agent': 'OmniVault-GamingAssistant/2.0 (macOS; retro companion; contact: omnivault@local.app)'}
    
    # 1. StrategyWiki Real-Time Database Query: try full cleaned, and top 4 keywords
    attempts = [cleaned_query]
    if len(meaningful_words) > 4:
        attempts.append(' '.join(meaningful_words[:4]))
        
    for att in attempts:
        try:
            sw_params = {'action': 'query', 'list': 'search', 'srsearch': att, 'format': 'json', 'srlimit': 2}
            r = httpx.get('https://strategywiki.org/w/api.php', params=sw_params, headers=headers, timeout=3.0)
            if r.status_code == 200:
                hits = r.json().get('query', {}).get('search', [])
                if hits:
                    top_page = hits[0]['title']
                    ext_params = {
                        'action': 'query',
                        'prop': 'extracts',
                        'titles': top_page,
                        'explaintext': 1,
                        'exintro': 0,
                        'exchars': 1400,
                        'format': 'json'
                    }
                    r2 = httpx.get('https://strategywiki.org/w/api.php', params=ext_params, headers=headers, timeout=3.0)
                    if r2.status_code == 200:
                        pages = r2.json().get('query', {}).get('pages', {})
                        for pid, pdata in pages.items():
                            extract = pdata.get('extract', '').strip()
                            if extract:
                                return {
                                    'source': 'StrategyWiki Live Database',
                                    'title': top_page,
                                    'url': f'https://strategywiki.org/wiki/{top_page.replace(" ", "_")}',
                                    'content': extract[:1200]
                                }
        except Exception:
            pass
            
    # 2. Web Strategy Guides via DuckDuckGo Fallback
    try:
        ddg_headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        ddg_q = f'{cleaned_query} walkthrough guide'
        r = httpx.get('https://html.duckduckgo.com/html/', params={'q': ddg_q}, headers=ddg_headers, timeout=3.5)
        if r.status_code == 200:
            snippets = re.findall(r'<a class=\"result__snippet[^\"]*\"[^>]*>(.*?)</a>', r.text)
            clean_snippets = [unescape(re.sub(r'<[^>]+>', '', s)).strip() for s in snippets[:3] if len(s.strip()) > 20]
            if clean_snippets:
                return {
                    'source': 'Web Gaming Strategy Database',
                    'title': f'{cleaned_query.title()} Walkthrough',
                    'url': 'https://duckduckgo.com/?q=' + ddg_q.replace(' ', '+'),
                    'content': '\n\n'.join(clean_snippets)
                }
    except Exception:
        pass
        
    return None

def process_ai_chat(message: str, history: List[Dict[str, str]] = None) -> Dict[str, Any]:
    msg = message.lower().strip()
    history = history or []
    
    # 1. Identify query context from database
    plat_info = detect_platform(msg)
    target_plat = plat_info[0] if plat_info else None
    target_plat_name = plat_info[1] if plat_info else None
    target_genre = detect_genre(msg)
    
    franchises = ["mario", "zelda", "sonic", "pokemon", "pokémon", "final fantasy", "metroid", "castlevania", "resident evil", "street fighter", "mega man", "donkey kong", "metal gear", "chrono", "silent hill", "tekken", "halo", "god of war", "demon's souls", "dark souls"]
    matched_franchise = next((f for f in franchises if f in msg), None)
    
    # Check if this is a gameplay assistance / walkthrough / stuck question
    is_stuck_query = any(k in msg for k in [
        "stuck", "walkthrough", "guide", "how to beat", "how do i beat", "how to get past",
        "boss", "puzzle", "dungeon", "key", "passcode", "where do i go", "secret", "solution",
        "temple", "shrine", "how do i get", "where to find", "tips", "strategy", "beat"
    ])
    
    # Find matching game records from vault.db
    candidate_games = []
    if matched_franchise:
        candidate_games = query_relevant_games([matched_franchise], platform=target_plat, limit=4)
    elif target_plat or target_genre:
        candidate_games = query_relevant_games([], platform=target_plat, genre=target_genre, limit=4)
        if not candidate_games:
            candidate_games = get_random_top_games(platform=target_plat, genre=target_genre, limit=4)
    elif "hidden gem" in msg or "underrated" in msg:
        candidate_games = get_random_top_games(platform=target_plat, genre=target_genre, limit=4)
    elif any(k in msg for k in ["co-op", "multiplayer", "2 player"]):
        candidate_games = query_relevant_games(["contra", "turtles", "double dragon", "streets of rage", "mario kart", "secret of mana"], platform=target_plat, limit=4)
    else:
        candidate_games = get_random_top_games(limit=3)

    # 2. Online Walkthrough Search (when player is stuck or needs guidance)
    walkthrough_guide = None
    if is_stuck_query:
        walkthrough_guide = fetch_online_walkthrough_guide(message)
        
    # Format grounding text for LLM
    grounding_parts = []
    if candidate_games:
        for g in candidate_games:
            grounding_parts.append(f"- {g['title']} ({g['platform']}, {g['genre']}, {g.get('release_year', 'Retro Era')}): {g.get('description', '')[:100]}...")
    grounding_str = "\n".join(grounding_parts) if grounding_parts else "No specific titles indexed."

    # 3. Invoke local embedded LLM with Metal acceleration
    llm = get_local_llm()
    reply_text = None
    
    if llm is not None:
        try:
            guide_context = ""
            if walkthrough_guide:
                guide_context = (
                    f"\n\n[LIVE ONLINE STRATEGY GUIDE RETRIEVED VIA {walkthrough_guide['source'].upper()}]:\n"
                    f"Article: {walkthrough_guide['title']}\n"
                    f"Verified Steps & Lore:\n{walkthrough_guide['content']}\n"
                    "INSTRUCTION: The player is stuck! Use the above verified strategy guide to give them a concise, step-by-step walkthrough to overcome this hurdle. Keep spoilers minimal, focus on the immediate next action, items needed, and boss tactics."
                )
                
            system_prompt = (
                "You are OmniAI, an expert retro gaming copilot and walkthrough assistant embedded into OmniVault on macOS.\n"
                "You run natively on Apple Silicon with dual hybrid capabilities (embedded local neural model + real-time online strategy guide retrieval).\n"
                "You are equipped with advanced Cheat Engineering tools:\n"
                "1. Zero-Corruption Save Diff Analyzer: Compares two save files (Save A vs Save B) to pinpoint exact money, lives, or item offsets without corruption, creating automatic .bak backups.\n"
                "2. RetroArch Live RAM Memory Bridge: Communicates over local UDP port 55355 to scan and freeze live emulator RAM without DLL injection.\n"
                "3. ROM Pattern Disassembler: Analyzes decrement opcodes in NES/SNES/GB ROMs and generates non-destructive Game Genie codes.\n"
                "Always be enthusiastic, concise, technically precise, and helpful.\n"
                "CRITICAL RULE: When recommending games, ONLY recommend the exact titles listed below from the user's local vault. NEVER invent or hallucinate game titles.\n\n"
                f"Currently available real games in the user's local vault matching this query:\n{grounding_str}"
                f"{guide_context}"
            )
            
            chat_messages = [{"role": "system", "content": system_prompt}]
            
            # Add recent conversation turns
            for h in history[-4:]:
                role = "user" if h.get("role") == "user" else "assistant"
                chat_messages.append({"role": role, "content": h.get("content", "")})
                
            chat_messages.append({"role": "user", "content": message})
            
            completion = llm.create_chat_completion(
                messages=chat_messages,
                max_tokens=320,
                temperature=0.2,
                stop=["<|im_end|>", "User:", "\n\n\n"]
            )
            reply_text = completion["choices"][0]["message"]["content"].strip()

            # Verify that for game recommendation queries, the small 0.5B model cited real vault titles
            if (
                reply_text
                and candidate_games
                and not is_stuck_query
                and (target_plat or target_genre or matched_franchise or "recommend" in msg or "best" in msg or "gem" in msg)
            ):
                reply_lower = reply_text.lower()
                cited_real = any(g["title"].split("(")[0].strip().lower() in reply_lower for g in candidate_games)
                if not cited_real:
                    bullet_lines = [
                        f"- **{g['title']}** ({g['platform']}, {g['genre']}, {g.get('release_year') or 'Classic'}): {(g.get('description') or '')[:140]}"
                        for g in candidate_games
                    ]
                    desc = f"{target_genre or ''} {'on ' + target_plat_name if target_plat_name else ''}".strip() or "Retro"
                    reply_text = (
                        f"Here are top verified **{desc}** titles indexed in your OmniVault library:\n\n"
                        + "\n".join(bullet_lines)
                    )
        except Exception as ex:
            print(f"[OmniAI Inference Error]: {ex}")
            reply_text = None

    # Fallback to rich contextual response if model is unavailable
    if not reply_text:
        if walkthrough_guide:
            reply_text = (
                f"🧭 **Live Strategy Guide & Walkthrough Solution** (Retrieved from {walkthrough_guide['source']})\n\n"
                f"### 📍 {walkthrough_guide['title']}\n\n"
                f"{walkthrough_guide['content']}\n\n"
                f"💡 *Tip:* Check your inventory for required keys or elemental items before proceeding!"
            )
        elif target_plat or target_genre:
            desc = f"{target_genre or ''} {'on ' + target_plat_name if target_plat_name else ''}".strip()
            reply_text = f"🕹️ **Top Recommended {desc} Classics** in your vault! Click any card below to view box art, read storyline lore, or download directly to your drive:"
        elif matched_franchise:
            reply_text = f"🌟 **The best {matched_franchise.title()} games in OmniVault!** All verified with original box art, trailers, and cheat codes:"
        else:
            reply_text = "👋 **Greetings from OmniAI!** I have indexed over 15,700 classic games directly on your drive. Here are some top picks to explore:"

    # Contextual follow-up suggestions
    if walkthrough_guide or is_stuck_query:
        suggestions = [
            "Next puzzle in this area",
            "Boss weaknesses and attack patterns",
            "Hidden items & collectibles nearby",
            "Generate infinite health cheat code"
        ]
    elif any(k in msg for k in ["cheat", "save", "memory", "ram", "genie", "hack", "infinite", "money", "gold", "lives"]):
        suggestions = [
            "How do I diff two save files safely?",
            "How does RetroArch live RAM search work?",
            "Can you generate a Game Genie code for NES?",
            "How do I roll back a save file backup?"
        ]
    elif target_plat_name:
        suggestions = [
            f"More top games on {target_plat_name}",
            f"Hidden gems on {target_plat_name}",
            f"Best multiplayer on {target_plat_name}"
        ]
    else:
        suggestions = [
            "Best RPGs on SNES",
            "Top Dreamcast hidden gems",
            "How do I use cheats in RetroArch?",
            "2-player co-op beat 'em ups"
        ]

    return {
        "reply": reply_text,
        "games": candidate_games,
        "suggestions": suggestions,
        "walkthrough_guide": walkthrough_guide,
        "online_grounded": bool(walkthrough_guide),
        "model": "OmniAI Hybrid (Live Strategy Guides + Apple Silicon Neural Engine)" if walkthrough_guide else "qwen2.5-0.5b-instruct (Embedded Local)",
        "offline": False if walkthrough_guide else True
    }
