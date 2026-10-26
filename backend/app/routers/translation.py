import base64
import json
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Body, Request, UploadFile, File, Form, Response
from fastapi.responses import Response

from ..services.live_translator import (
    process_live_frame_translation,
    translate_japanese_to_english,
    synthesize_speech_wav
)

router = APIRouter(prefix="/api/ai", tags=["ai-translation"])

@router.post("/retroarch-translate")
async def retroarch_ai_service(request: Request):
    """
    Official RetroArch AI Service endpoint.
    RetroArch captures frame buffer upon hotkey press and posts to this URL.
    Returns visual subtitle overlay and/or audio stream according to RetroArch spec.
    """
    content_type = request.headers.get("content-type", "")
    image_bytes = None
    
    if "application/json" in content_type:
        try:
            body = await request.json()
            b64_str = body.get("image") or body.get("data")
            if b64_str:
                if "," in b64_str:
                    b64_str = b64_str.split(",", 1)[1]
                image_bytes = base64.b64decode(b64_str)
        except Exception:
            pass
    elif "multipart/form-data" in content_type:
        form = await request.form()
        uploaded = form.get("file") or form.get("image")
        if uploaded and hasattr(uploaded, "read"):
            image_bytes = await uploaded.read()
    else:
        # Raw binary body
        raw_body = await request.body()
        if raw_body and len(raw_body) > 100:
            image_bytes = raw_body

    if not image_bytes:
        # RetroArch ping/handshake check
        return {"status": "ok", "service": "OmniVault Live Translation AI"}

    result = process_live_frame_translation(image_bytes, voice_enabled=True)
    translated_text = result.get("translated_text", "")
    
    # Check if RetroArch requested speech audio mode
    mode = request.query_params.get("mode", "0")
    if mode == "1" and result.get("audio_base64"):
        wav_bytes = base64.b64decode(result["audio_base64"])
        return Response(content=wav_bytes, media_type="audio/wav")

    # RetroArch standard subtitle overlay format
    # Coordinates normalized or fixed to bottom dialog zone
    subtitles = []
    if translated_text:
        subtitles.append({
            "text": translated_text,
            "x": 30,
            "y": 180,
            "w": 260,
            "h": 40
        })

    return {
        "status": "success",
        "subtitles": subtitles,
        "translated_text": translated_text,
        "original_text": result.get("original_text", ""),
        "audio_base64": result.get("audio_base64")
    }

@router.post("/translate-frame")
async def translate_frame(
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    voice: bool = Form(False)
):
    """
    Translates a frame captured from OmniVault's Web Player, any screenshot,
    or automatically captures the active macOS display when running a native emulator.
    """
    image_bytes = None
    if file:
        image_bytes = await file.read()
    elif image_base64:
        clean_b64 = image_base64
        if "," in clean_b64:
            clean_b64 = clean_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(clean_b64)
    else:
        # Native emulator fallback: capture active macOS screen silently
        import subprocess
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            snap_path = tmp.name
        try:
            subprocess.run(["/usr/sbin/screencapture", "-x", snap_path], check=False, timeout=4.0)
            if os.path.exists(snap_path) and os.path.getsize(snap_path) > 0:
                image_bytes = Path(snap_path).read_bytes()
        finally:
            if os.path.exists(snap_path):
                os.remove(snap_path)
        
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file or base64 data is required")
        
    result = process_live_frame_translation(image_bytes, voice_enabled=voice)
    return result

@router.post("/speak")
def speak_text(payload: Dict[str, Any] = Body(...)):
    """
    Converts English text into 16-bit PCM WAV audio for in-game narration.
    """
    text = payload.get("text", "").strip()
    voice = payload.get("voice", "Samantha")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
        
    wav_bytes = synthesize_speech_wav(text, voice=voice)
    if not wav_bytes:
        raise HTTPException(status_code=500, detail="Voice synthesis failed")
        
    return Response(content=wav_bytes, media_type="audio/wav")

@router.get("/retroarch-config")
def get_retroarch_ai_config():
    """
    Provides copy-paste configuration for retroarch.cfg.
    """
    return {
        "title": "RetroArch AI Service Setup",
        "config_lines": [
            'ai_service_enable = "true"',
            'ai_service_url = "http://127.0.0.1:19842/api/ai/retroarch-translate"',
            'ai_service_mode = "0"  # 0 = Visual Subtitle Overlay, 1 = Audio Speech Narrator',
            'ai_service_pause = "true"  # Automatically pauses game while translating'
        ],
        "instructions": (
            "1. In RetroArch, go to Settings → AI Service → Enable.\n"
            "2. Set AI Service URL to: http://127.0.0.1:19842/api/ai/retroarch-translate\n"
            "3. In Settings → Input → Hotkeys, bind 'AI Service' to a controller button (e.g. L3 or R3).\n"
            "4. Start any Japanese game and press your hotkey when text appears!"
        )
    }
