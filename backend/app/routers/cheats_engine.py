import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Form, Request

def _parse_int(val: Any) -> int:
    if isinstance(val, int):
        return val
    s = str(val).strip()
    if s.startswith("$"):
        return int(s[1:], 16)
    if s.lower().startswith("0x"):
        return int(s, 16)
    try:
        return int(s, 10)
    except ValueError:
        return int(s, 16)

from ..services.save_hacker import (
    search_value_in_save,
    diff_save_files,
    safe_patch_save_file,
    revert_save_from_backup,
    list_save_backups
)
from ..services.retroarch_memory import (
    check_retroarch_status,
    scan_live_ram,
    poke_live_value,
    freeze_live_value,
    unfreeze_live_value
)
from ..services.rom_cheat_engine import (
    scan_rom_for_decrement_cheats,
    encode_nes_game_genie_6,
    encode_nes_game_genie_8,
    encode_snes_game_genie,
    encode_gb_game_genie,
    encode_genesis_game_genie,
    encode_action_replay
)

router = APIRouter(prefix="/api/cheats-engine", tags=["cheats-engine"])

# =========================================================================
# 1. Zero-Corruption Save File Diff & Editor
# =========================================================================

@router.post("/save/search")
async def search_save(
    file: Optional[UploadFile] = File(None),
    path: Optional[str] = Form(None),
    value: int = Form(...),
    max_results: int = Form(50)
):
    if file:
        content = await file.read()
    elif path and os.path.exists(path):
        content = Path(path).read_bytes()
    else:
        raise HTTPException(status_code=400, detail="Either a save file upload or valid file path is required")
        
    matches = search_value_in_save(content, value, max_results=max_results)
    return {
        "status": "success",
        "target_value": value,
        "count": len(matches),
        "matches": matches
    }

@router.post("/save/diff")
async def diff_saves(
    file_a: Optional[UploadFile] = File(None),
    file_b: Optional[UploadFile] = File(None),
    path_a: Optional[str] = Form(None),
    path_b: Optional[str] = Form(None),
    val_a: Optional[int] = Form(None),
    val_b: Optional[int] = Form(None)
):
    # Retrieve data A
    if file_a:
        data_a = await file_a.read()
    elif path_a and os.path.exists(path_a):
        data_a = Path(path_a).read_bytes()
    else:
        raise HTTPException(status_code=400, detail="Save file A is required")
        
    # Retrieve data B
    if file_b:
        data_b = await file_b.read()
    elif path_b and os.path.exists(path_b):
        data_b = Path(path_b).read_bytes()
    else:
        raise HTTPException(status_code=400, detail="Save file B is required")
        
    result = diff_save_files(data_a, data_b, val_a=val_a, val_b=val_b)
    return result

@router.post("/save/patch")
def patch_save(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    offset = payload.get("offset")
    new_value = payload.get("new_value")
    data_type = payload.get("data_type", "uint16_le")
    
    if not path or offset is None or new_value is None:
        raise HTTPException(status_code=400, detail="path, offset, and new_value are required")
        
    result = safe_patch_save_file(path, _parse_int(offset), _parse_int(new_value), data_type)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.get("/save/backups")
def get_backups(path: Optional[str] = None):
    if not path or not os.path.exists(path):
        return {"path": path, "backups": []}
    backups = list_save_backups(path)
    return {"path": path, "backups": backups}

@router.post("/save/revert")
def revert_save(payload: Dict[str, Any] = Body(...)):
    path = payload.get("path")
    backup_path = payload.get("backup_path")
    if not path or not backup_path:
        raise HTTPException(status_code=400, detail="path and backup_path are required")
    res = revert_save_from_backup(path, backup_path)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

# =========================================================================
# 2. RetroArch Live RAM Memory Bridge
# =========================================================================

@router.get("/retroarch/status")
def get_retroarch_status(host: str = "127.0.0.1", port: int = 55355):
    return check_retroarch_status(host, port)

@router.post("/retroarch/scan")
def scan_ram(payload: Dict[str, Any] = Body(...)):
    platform = payload.get("platform", "NES")
    value = payload.get("value")
    data_type = payload.get("data_type", "uint16_le")
    candidates = payload.get("candidates") # Optional list of address ints
    host = payload.get("host", "127.0.0.1")
    port = payload.get("port", 55355)
    
    if value is None:
        raise HTTPException(status_code=400, detail="Target value is required for RAM scan")
        
    result = scan_live_ram(
        platform=platform,
        target_value=_parse_int(value),
        data_type=data_type,
        candidates=candidates,
        host=host,
        port=port
    )
    return result

@router.post("/retroarch/poke")
def poke_ram(payload: Dict[str, Any] = Body(...)):
    address = payload.get("address")
    value = payload.get("value")
    data_type = payload.get("data_type", "uint16_le")
    host = payload.get("host", "127.0.0.1")
    port = payload.get("port", 55355)
    
    if address is None or value is None:
        raise HTTPException(status_code=400, detail="address and value are required")
        
    return poke_live_value(_parse_int(address), _parse_int(value), data_type, host, port)

@router.post("/retroarch/freeze")
def freeze_ram(payload: Dict[str, Any] = Body(...)):
    address = payload.get("address")
    value = payload.get("value")
    data_type = payload.get("data_type", "uint16_le")
    host = payload.get("host", "127.0.0.1")
    port = payload.get("port", 55355)
    
    if address is None or value is None:
        raise HTTPException(status_code=400, detail="address and value are required")
        
    return freeze_live_value(_parse_int(address), _parse_int(value), data_type, host, port)

@router.post("/retroarch/unfreeze")
def unfreeze_ram(payload: Dict[str, Any] = Body(...)):
    address = payload.get("address")
    host = payload.get("host", "127.0.0.1")
    port = payload.get("port", 55355)
    if address is None:
        raise HTTPException(status_code=400, detail="address is required")
    return unfreeze_live_value(_parse_int(address), host, port)

# =========================================================================
# 3. ROM Static Pattern Analyzer & Game Genie Generator
# =========================================================================

@router.post("/rom/analyze")
async def analyze_rom(
    request: Request,
    file: Optional[UploadFile] = File(None),
    path: Optional[str] = Form(None),
    platform: str = Form("NES")
):
    rom_bytes = None
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        json_path = body.get("path") or body.get("rom_path")
        platform = body.get("platform", platform)
        if json_path and os.path.exists(json_path):
            rom_bytes = Path(json_path).read_bytes()
    else:
        if file:
            rom_bytes = await file.read()
        elif path and os.path.exists(path):
            rom_bytes = Path(path).read_bytes()

    if not rom_bytes:
        raise HTTPException(status_code=400, detail="ROM file upload or valid path is required")
        
    cheats = scan_rom_for_decrement_cheats(rom_bytes, platform=platform)
    return {
        "status": "success",
        "platform": platform,
        "cheats_found": len(cheats),
        "cheats": cheats
    }

@router.post("/gamegenie/encode")
def encode_game_genie(payload: Dict[str, Any] = Body(...)):
    address = payload.get("address")
    value = payload.get("value")
    compare = payload.get("compare")
    platform = str(payload.get("platform", "NES")).upper()
    
    if address is None or value is None:
        raise HTTPException(status_code=400, detail="address and value are required")
        
    addr_int = _parse_int(address)
    val_int = _parse_int(value)
    cmp_int = _parse_int(compare) if compare is not None else None

    if platform in ("SNES", "SFC"):
        code = encode_snes_game_genie(addr_int, val_int)
    elif platform in ("GB", "GBC"):
        code = encode_gb_game_genie(addr_int, val_int, cmp_int)
    elif platform in ("GENESIS", "MEGADRIVE", "MD"):
        code = encode_genesis_game_genie(addr_int, val_int)
    elif platform == "NES":
        if cmp_int is not None:
            code = encode_nes_game_genie_8(addr_int, val_int, cmp_int)
        else:
            code = encode_nes_game_genie_6(addr_int, val_int)
    else:
        code = encode_action_replay(platform, addr_int, val_int)

    return {
        "platform": platform,
        "address": f"0x{addr_int:04X}",
        "value": f"0x{val_int:02X}",
        "code": code,
        "game_genie_code": code,
        "action_replay_code": encode_action_replay(platform, addr_int, val_int)
    }
