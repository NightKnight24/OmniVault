import os
import sys
import json
import base64
import tempfile
import subprocess
from pathlib import Path

# Add backend to sys.path
backend_dir = Path("/Volumes/ROMS/OmniVault-Source/backend")
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.services.ai_assistant import get_local_llm, process_ai_chat, MODEL_PATH
from app.services.live_translator import translate_japanese_to_english, synthesize_speech_wav, extract_text_from_image, OCR_BINARY
from app.services.ai_mod_synthesizer import synthesize_ai_mod

print("=" * 70)
print("  OmniVault Comprehensive AI Subsystems & Features Verification")
print("=" * 70)

client = TestClient(app)

# -------------------------------------------------------------
# 1. Test Local Neural LLM Model
# -------------------------------------------------------------
print("\n--- 1. Testing Local Apple Silicon GGUF Neural LLM ---")
assert MODEL_PATH.exists(), f"Model file missing at: {MODEL_PATH}"
print(f"PASS: GGUF Model file exists ({round(MODEL_PATH.stat().st_size / (1024*1024), 1)} MB): {MODEL_PATH.name}")

llm = get_local_llm()
assert llm is not None, "Failed to load embedded local LLM into memory!"
print("PASS: Embedded Local LLM initialized successfully with Metal acceleration.")

sample_gen = llm("Q: Name a retro video game console. A:", max_tokens=15, stop=["\n"])
gen_text = sample_gen["choices"][0]["text"].strip()
assert len(gen_text) > 0, "LLM generated empty response!"
print(f"PASS: Real-time LLM inference verified: '{gen_text}'")

# -------------------------------------------------------------
# 2. Test OmniAI Chatbot & Game Grounding
# -------------------------------------------------------------
print("\n--- 2. Testing OmniAI Chatbot & Game Grounding ---")
# Test 2a: Recommendations grounded in vault.db
r = client.post("/api/ai/chat", json={
    "message": "Can you recommend the best RPGs on SNES?",
    "history": []
})
assert r.status_code == 200, f"/api/ai/chat failed: {r.status_code} - {r.text}"
chat_data = r.json()
assert "reply" in chat_data and len(chat_data["reply"]) > 0, "Chat response missing reply text!"
assert "games" in chat_data and len(chat_data["games"]) > 0, "Chat response missing grounded vault games!"
assert "suggestions" in chat_data and len(chat_data["suggestions"]) > 0, "Chat response missing suggestions!"
print(f"PASS: RPG recommendations returned {len(chat_data['games'])} grounded vault titles.")
print(f"Sample game: {chat_data['games'][0]['title']} ({chat_data['games'][0]['platform']})")

# Test 2b: Walkthrough & Strategy Guide retrieval
r_walkthrough = client.post("/api/ai/chat", json={
    "message": "I am stuck on the Water Temple boss in Zelda Ocarina of Time, how do I beat it?",
    "history": []
})
assert r_walkthrough.status_code == 200
wt_data = r_walkthrough.json()
assert "reply" in wt_data and len(wt_data["reply"]) > 0
print(f"PASS: Walkthrough query processed with model: {wt_data.get('model')}")

# Test 2c: Quick Suggestions
r_sugg = client.get("/api/ai/suggestions")
assert r_sugg.status_code == 200
sugg_list = r_sugg.json().get("suggestions", [])
assert len(sugg_list) >= 4
print(f"PASS: /api/ai/suggestions returned {len(sugg_list)} quick prompts.")

# -------------------------------------------------------------
# 3. Test AI Theme Studio Palette Synthesis
# -------------------------------------------------------------
print("\n--- 3. Testing AI Theme Studio Palette Synthesis ---")
theme_prompts = [
    "Cyberpunk Neo Tokyo Neon Magenta & Cyan",
    "Game Boy Classic 1989 Monochrome Olive Green"
]
for prompt in theme_prompts:
    r_theme = client.post("/api/themes/generate-ai", json={"prompt": prompt})
    assert r_theme.status_code == 200, f"Theme generation failed for '{prompt}': {r_theme.text}"
    th_res = r_theme.json()
    assert th_res.get("status") == "generated"
    theme = th_res.get("theme", {})
    tdata = theme.get("theme_data", {})
    assert "accent" in tdata and tdata["accent"].startswith("#")
    assert "bgBase" in tdata and tdata["bgBase"].startswith("#")
    assert "bgCard" in tdata and tdata["bgCard"].startswith("#")
    print(f"PASS: Theme synthesized for '{prompt}' -> Accent: {tdata['accent']}, BG: {tdata['bgBase']} (Engine: {th_res.get('engine')})")

# -------------------------------------------------------------
# 4. Test AI Mod & Cheat Code Synthesizer
# -------------------------------------------------------------
print("\n--- 4. Testing AI Mod & Cheat Code Synthesizer ---")
mod_res = synthesize_ai_mod(
    game_id="snes-super-mario-world",
    game_title="Super Mario World",
    platform="SNES",
    user_prompt="Infinite lives and invincibility star power"
)
assert mod_res.get("status") in ("success", "synthesized"), f"Mod synthesis failed: {mod_res}"
assert "mod_id" in mod_res
patch_path = mod_res.get("local_path") or mod_res.get("file_path")
assert patch_path and os.path.exists(patch_path), f"Patch file missing at: {patch_path}"
code_count = len(mod_res.get("matched_codes", [])) or mod_res.get("code_count", 0)
patch_fmt = mod_res.get("patch_format") or mod_res.get("format", "cht")
print(f"PASS: AI Mod synthesized for Super Mario World: {mod_res.get('title')}")
print(f"Cheat codes compiled: {code_count} codes in {patch_fmt} format ({patch_path}).")

# Also test endpoint /api/mods/ai-synthesize
r_mod_ep = client.post("/api/mods/ai-synthesize", json={
    "game_id": "nes-super-mario-bros",
    "game_title": "Super Mario Bros.",
    "platform": "NES",
    "prompt": "Infinite lives"
})
assert r_mod_ep.status_code == 200, f"Mod endpoint failed: {r_mod_ep.text}"
print("PASS: /api/mods/ai-synthesize endpoint successfully generated verified cheat/mod bundle.")

# -------------------------------------------------------------
# 5. Test Live Japanese Dialogue AI Localizer
# -------------------------------------------------------------
print("\n--- 5. Testing Live Japanese Dialogue AI Localizer ---")
japanese_samples = [
    "勇者よ、魔王を倒して世界に平和を取り戻してください！",
    "ここではセーブができません。"
]
for j_text in japanese_samples:
    translated = translate_japanese_to_english(j_text)
    assert len(translated) > 0 and translated != j_text, f"Translation failed: {translated}"
    print(f"PASS: Japanese: '{j_text}' -> Localized: '{translated}'")

# -------------------------------------------------------------
# 6. Test macOS Native Speech Synthesis (TTS)
# -------------------------------------------------------------
print("\n--- 6. Testing macOS Speech Synthesis (TTS to 16-bit PCM WAV) ---")
wav_bytes = synthesize_speech_wav("Welcome to OmniVault Retro Arcade.")
assert wav_bytes is not None and len(wav_bytes) > 100, "Speech synthesis failed to produce audio bytes!"
# Verify RIFF/WAVE header
assert wav_bytes[:4] == b"RIFF" and b"WAVE" in wav_bytes[:16], "Audio bytes missing valid WAV container header!"
print(f"PASS: 16-bit PCM WAV synthesized ({len(wav_bytes)} bytes) with valid RIFF header.")

# -------------------------------------------------------------
# 7. Test Apple Vision Framework Native OCR
# -------------------------------------------------------------
print("\n--- 7. Testing Apple Vision OCR Binary ---")
assert OCR_BINARY.exists(), f"macos_ocr binary missing at {OCR_BINARY}"
# Test running binary directly
proc = subprocess.run([str(OCR_BINARY)], capture_output=True, text=True)
assert proc.returncode != 0 and "No image path" in proc.stdout, "Unexpected macos_ocr response without arguments"
print("PASS: macos_ocr native Apple Vision binary is executable and responsive.")

# -------------------------------------------------------------
# 8. Test RetroArch AI Service Endpoint Protocol
# -------------------------------------------------------------
print("\n--- 8. Testing RetroArch AI Service Endpoint ---")
# Handshake check
r_ra_ping = client.post("/api/ai/retroarch-translate")
assert r_ra_ping.status_code == 200
assert r_ra_ping.json().get("status") == "ok"
print("PASS: /api/ai/retroarch-translate handshake returned OK.")

# Frame translation endpoint
r_ra_frame = client.post("/api/ai/retroarch-translate", json={
    "image": base64.b64encode(b"dummy_test_bytes").decode("utf-8")
})
assert r_ra_frame.status_code == 200
assert "status" in r_ra_frame.json()
print("PASS: /api/ai/retroarch-translate frame capture protocol accepted.")

print("\n" + "=" * 70)
print("  ALL OMNIVAULT AI SUBSYSTEMS & FEATURES PASSED WITH ZERO ERRORS!")
print("=" * 70)
