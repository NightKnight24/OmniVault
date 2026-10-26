import json
import uuid
import re
import hashlib
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
from ..database import get_db_connection

router = APIRouter(prefix="/api/themes", tags=["themes"])

@router.get("")
def list_themes():
    """Returns all available Kodi, console, and AI-generated themes."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM themes ORDER BY is_builtin DESC, created_at ASC")
    rows = c.fetchall()
    conn.close()

    themes = []
    for r in rows:
        t_data = {}
        try:
            t_data = json.loads(r["theme_data"])
        except Exception:
            pass
        themes.append({
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "is_builtin": bool(r["is_builtin"]),
            "is_active": bool(r["is_active"]),
            "theme_data": t_data,
            "created_at": r["created_at"]
        })
    return {"themes": themes}

@router.post("")
def save_theme(payload: Dict[str, Any] = Body(...)):
    """Saves a custom theme or AI-generated theme into the database."""
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Theme name is required")

    theme_id = payload.get("id") or f"custom_{uuid.uuid4().hex[:8]}"
    description = payload.get("description", "Custom user-crafted theme")
    theme_data = payload.get("theme_data", {})
    if isinstance(theme_data, dict):
        theme_data_str = json.dumps(theme_data)
    else:
        theme_data_str = str(theme_data)

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO themes (id, name, description, is_builtin, is_active, theme_data)
        VALUES (?, ?, ?, 0, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            theme_data = excluded.theme_data
    """, (theme_id, name, description, theme_data_str))
    conn.commit()
    conn.close()

    return {"status": "saved", "id": theme_id, "name": name}

@router.post("/{theme_id}/activate")
def activate_theme(theme_id: str):
    """Sets the active theme in the database and settings."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("UPDATE themes SET is_active = 0")
    c.execute("UPDATE themes SET is_active = 1 WHERE id = ?", (theme_id,))
    c.execute("""
        INSERT INTO settings (key, value) VALUES ('active_theme', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    """, (theme_id,))
    conn.commit()
    conn.close()
    return {"status": "activated", "theme_id": theme_id}

@router.delete("/{theme_id}")
def delete_theme(theme_id: str):
    """Deletes a custom user theme (built-ins are protected)."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT is_builtin FROM themes WHERE id = ?", (theme_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Theme not found")
    if row["is_builtin"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete built-in preservation themes")

    c.execute("DELETE FROM themes WHERE id = ?", (theme_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "theme_id": theme_id}

@router.post("/generate-ai")
def generate_ai_theme(payload: Dict[str, Any] = Body(...)):
    """
    Theme Studio Palette Generator:
    Leverages embedded local LLM when available, with algorithmic color harmony fallback.
    Calculates balanced high-contrast UI themes for Kodi Big Picture and desktop modes.
    """
    prompt = payload.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required for Theme Generation")

    # 1. Try real Local LLM generation if available
    from ..services.ai_assistant import get_local_llm
    llm = get_local_llm()
    if llm is not None:
        try:
            llm_prompt = (
                "You are a color theory and UI theme generator. Given a theme mood, generate a JSON object with: "
                "name (short string), accent (hex), accentSecondary (hex), bgBase (dark hex), bgCard (dark hex), bgHover (dark hex). "
                f"Theme mood: {prompt}\nJSON:"
            )
            completion = llm.create_chat_completion(
                messages=[
                    {"role": "system", "content": "Output only valid JSON with keys: name, accent, accentSecondary, bgBase, bgCard, bgHover. Do not include markdown or explanations."},
                    {"role": "user", "content": llm_prompt}
                ],
                max_tokens=150,
                temperature=0.4
            )
            content = completion["choices"][0]["message"]["content"].strip()
            # Extract json
            m = re.search(r"\{.*\}", content, re.DOTALL)
            if m:
                d = json.loads(m.group(0))
                def _norm_hex(val: Any, default: str) -> str:
                    if not isinstance(val, str):
                        return default
                    s = val.strip().lstrip("#")
                    if re.fullmatch(r"[0-9a-fA-F]{6}", s):
                        return f"#{s.lower()}"
                    if re.fullmatch(r"[0-9a-fA-F]{3}", s):
                        return "#" + "".join(ch * 2 for ch in s.lower())
                    return default

                acc = _norm_hex(d.get("accent"), "#38bdf8")
                acc_sec = _norm_hex(d.get("accentSecondary"), "#818cf8")
                bg_base = _norm_hex(d.get("bgBase"), "#090d16")
                bg_card = _norm_hex(d.get("bgCard"), "#131b2e")
                bg_hover = _norm_hex(d.get("bgHover"), "#1e2942")

                theme_obj = {
                    "id": f"ai_theme_{uuid.uuid4().hex[:6]}",
                    "name": d.get("name", f"Theme: {prompt.capitalize()[:20]}"),
                    "description": f"Neural AI palette synthesized from: \"{prompt}\"",
                    "is_builtin": False,
                    "is_active": True,
                    "theme_data": {
                        "accent": acc,
                        "accentSecondary": acc_sec,
                        "glow": f"{acc}80",
                        "bgBase": bg_base,
                        "bgCard": bg_card,
                        "bgCardHover": bg_hover,
                        "border": "rgba(255, 255, 255, 0.15)",
                        "textPrimary": "#ffffff",
                        "textMuted": "#94a3b8",
                        "fontFamily": "Inter, sans-serif",
                        "mode": "hybrid"
                    }
                }
                return {"status": "generated", "engine": "local_llm", "theme": theme_obj}
        except Exception as ex:
            print(f"[Theme LLM Note]: {ex}")

    # 2. Algorithmic Color Harmony Fallback
    p_lower = prompt.lower()
    h = int(hashlib.md5(prompt.encode()).hexdigest()[:8], 16)

    # 1. Color archetypes based on keywords
    if any(k in p_lower for k in ["vaporwave", "synthwave", "80s", "outrun", "neon pink"]):
        accent = "#f43f5e"
        accent_sec = "#06b6d4"
        bg_base = "#0b0618"
        bg_card = "#140a2c"
        bg_hover = "#201046"
        glow = "rgba(244, 63, 94, 0.55)"
        font = "Chakra Petch, sans-serif"
        name = f"Synthwave '{prompt[:20]}'"
    elif any(k in p_lower for k in ["zelda", "hyrule", "emerald", "gold", "forest", "link"]):
        accent = "#eab308"
        accent_sec = "#10b981"
        bg_base = "#050f09"
        bg_card = "#0b1c13"
        bg_hover = "#122c1e"
        glow = "rgba(234, 179, 8, 0.5)"
        font = "Inter, sans-serif"
        name = f"Hyrule Gold '{prompt[:20]}'"
    elif any(k in p_lower for k in ["matrix", "terminal", "hacker", "pipboy", "green phosphor"]):
        accent = "#22c55e"
        accent_sec = "#4ade80"
        bg_base = "#030804"
        bg_card = "#07140a"
        bg_hover = "#0d2613"
        glow = "rgba(34, 197, 94, 0.6)"
        font = "Chakra Petch, monospace"
        name = f"Matrix Terminal '{prompt[:20]}'"
    elif any(k in p_lower for k in ["gameboy", "dmg", "monochrome", "retro lcd"]):
        accent = "#84cc16"
        accent_sec = "#65a30d"
        bg_base = "#0c1208"
        bg_card = "#162010"
        bg_hover = "#202e18"
        glow = "rgba(132, 204, 22, 0.45)"
        font = "Chakra Petch, monospace"
        name = f"DMG Monochrome '{prompt[:20]}'"
    elif any(k in p_lower for k in ["metroid", "dark space", "samus", "lava", "red"]):
        accent = "#ef4444"
        accent_sec = "#f97316"
        bg_base = "#0d0407"
        bg_card = "#1a080f"
        bg_hover = "#2c0e1a"
        glow = "rgba(239, 68, 68, 0.5)"
        font = "Chakra Petch, sans-serif"
        name = f"Metroid Core '{prompt[:20]}'"
    elif any(k in p_lower for k in ["cyberpunk", "tokyo", "laser", "purple", "violet"]):
        accent = "#a855f7"
        accent_sec = "#06b6d4"
        bg_base = "#090514"
        bg_card = "#120a28"
        bg_hover = "#1c103c"
        glow = "rgba(168, 85, 247, 0.55)"
        font = "Chakra Petch, sans-serif"
        name = f"Neo-Tokyo '{prompt[:20]}'"
    elif any(k in p_lower for k in ["kodi", "xbmc", "estuary", "cinema", "couch"]):
        accent = "#0284c7"
        accent_sec = "#38bdf8"
        bg_base = "#040914"
        bg_card = "#0a1324"
        bg_hover = "#11203b"
        glow = "rgba(56, 189, 248, 0.5)"
        font = "Inter, sans-serif"
        name = f"Kodi Living Room '{prompt[:20]}'"
    else:
        # Algorithmic hue generation from hash
        hue = h % 360
        sec_hue = (hue + 45) % 360
        accent = f"hsl({hue}, 90%, 55%)"
        accent_sec = f"hsl({sec_hue}, 90%, 60%)"
        bg_base = f"hsl({hue}, 40%, 4%)"
        bg_card = f"hsl({hue}, 35%, 8%)"
        bg_hover = f"hsl({hue}, 35%, 13%)"
        glow = f"hsla({hue}, 90%, 55%, 0.5)"
        font = "Inter, sans-serif"
        name = f"AI Palette: {prompt.capitalize()[:25]}"

    generated = {
        "id": f"ai_theme_{uuid.uuid4().hex[:6]}",
        "name": name,
        "description": f"AI-generated palette synthesized from: \"{prompt}\"",
        "is_builtin": False,
        "is_active": True,
        "theme_data": {
            "accent": accent,
            "accentSecondary": accent_sec,
            "glow": glow,
            "bgBase": bg_base,
            "bgCard": bg_card,
            "bgCardHover": bg_hover,
            "border": f"rgba(255, 255, 255, 0.15)",
            "textPrimary": "#ffffff",
            "textMuted": "#94a3b8",
            "fontFamily": font,
            "mode": "hybrid"
        }
    }

    return {"status": "generated", "theme": generated}
