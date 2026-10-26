import os
import re
import json
import base64
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

OCR_BINARY = Path(__file__).resolve().parent / "macos_ocr"

def extract_text_from_image(image_bytes: bytes) -> Dict[str, Any]:
    """
    Runs Apple Vision Framework OCR via the native macos_ocr binary.
    Extracts Japanese (and English) text and pixel/normalized bounding boxes.
    """
    if not OCR_BINARY.exists():
        return {"error": "OCR binary not found", "text": "", "boxes": []}
        
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp.flush()
        tmp_path = tmp.name
        
    try:
        proc = subprocess.run([str(OCR_BINARY), tmp_path], capture_output=True, text=True, timeout=5.0)
        if proc.returncode == 0 and proc.stdout.strip():
            data = json.loads(proc.stdout)
            return {
                "text": data.get("text", "").strip(),
                "boxes": data.get("boxes", [])
            }
        return {"text": "", "boxes": []}
    except Exception as e:
        return {"error": str(e), "text": "", "boxes": []}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def translate_japanese_to_english(japanese_text: str) -> str:
    """
    Translates Japanese dialogue to natural English using the local embedded LLM.
    """
    if not japanese_text.strip():
        return ""
        
    from .ai_assistant import get_local_llm
    llm = get_local_llm()
    if llm is None:
        return f"[Translation Offline] {japanese_text}"
        
    prompt = (
        "Translate the following retro video game Japanese text accurately into natural, idiomatic English. "
        "Do not include any explanations, Romaji, notes, or quotes. Output ONLY the clean English dialogue:\n\n"
        f"Japanese: {japanese_text}\n"
        "English:"
    )
    
    try:
        completion = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": "You are a professional Japanese to English retro game localizer. Output only the translated English sentence."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150,
            temperature=0.3,
            stop=["\n\n", "Japanese:", "<|im_end|>"]
        )
        translated = completion["choices"][0]["message"]["content"].strip()
        # Clean up any surrounding quotes or prefixes
        translated = re.sub(r'^(English:|"|\')', '', translated).rstrip('"\'').strip()
        return translated if translated else japanese_text
    except Exception as e:
        print(f"[Translation Error]: {e}")
        return japanese_text

def synthesize_speech_wav(english_text: str, voice: str = "Samantha") -> Optional[bytes]:
    """
    Synthesizes natural English speech using macOS native voice synthesis (say)
    and converts to 16-bit PCM WAV via afconvert.
    """
    clean_text = english_text.replace('"', '').replace("'", "").strip()
    if not clean_text:
        return None
        
    with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as tmp_aiff:
        aiff_path = tmp_aiff.name
    wav_path = aiff_path.replace(".aiff", ".wav")
    
    try:
        # 1. Synthesize AIFF audio via macOS 'say'
        subprocess.run(["say", "-v", voice, "-o", aiff_path, clean_text], check=True, timeout=5.0)
        
        # 2. Convert to standard 16-bit 22kHz PCM WAV via macOS 'afconvert'
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@22050", aiff_path, wav_path], check=True, timeout=5.0)
        
        if os.path.exists(wav_path):
            return Path(wav_path).read_bytes()
        return None
    except Exception as e:
        print(f"[TTS Synthesis Error]: {e}")
        return None
    finally:
        if os.path.exists(aiff_path):
            os.remove(aiff_path)
        if os.path.exists(wav_path):
            os.remove(wav_path)

def process_live_frame_translation(image_bytes: bytes, voice_enabled: bool = False) -> Dict[str, Any]:
    """
    Full translation pipeline:
    1. OCR Japanese characters.
    2. Translate to English with local LLM.
    3. Synthesize speech audio if requested.
    """
    ocr_result = extract_text_from_image(image_bytes)
    raw_text = ocr_result.get("text", "")
    boxes = ocr_result.get("boxes", [])
    
    if not raw_text:
        return {
            "status": "no_text",
            "original_text": "",
            "translated_text": "",
            "audio_base64": None,
            "boxes": []
        }
        
    translated = translate_japanese_to_english(raw_text)
    
    audio_b64 = None
    if voice_enabled and translated:
        wav_bytes = synthesize_speech_wav(translated)
        if wav_bytes:
            audio_b64 = base64.b64encode(wav_bytes).decode("utf-8")
            
    return {
        "status": "success",
        "original_text": raw_text,
        "translated_text": translated,
        "audio_base64": audio_b64,
        "boxes": boxes
    }
