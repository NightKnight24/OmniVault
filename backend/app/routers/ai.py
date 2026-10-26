from fastapi import APIRouter, Body
from typing import Dict, Any, List, Optional
from ..services.ai_assistant import process_ai_chat, get_model_status, start_model_download_background

router = APIRouter(prefix="/api/ai", tags=["ai"])

@router.get("/status")
def model_status():
    return get_model_status()

@router.post("/download-model")
def trigger_model_download():
    start_model_download_background()
    return {"status": "started"}

@router.post("/chat")
def chat_with_assistant(payload: Dict[str, Any] = Body(...)):
    message = payload.get("message", "")
    history = payload.get("history", [])
    
    result = process_ai_chat(message, history)
    return result

@router.get("/suggestions")
def get_quick_suggestions():
    return {
        "suggestions": [
            "💎 Hidden Gems on Sega Saturn & Dreamcast",
            "⚔️ Best 90s Turn-Based RPGs",
            "👥 2-Player Co-op Beat 'em Ups",
            "🏎️ Fast-Paced Racing Classics",
            "🛡️ How to use Cheats in RetroArch on Mac",
            "👾 Best GBA Pokémon ROM Hacks"
        ]
    }
