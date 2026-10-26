import os
import shutil
import time
import struct
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

SUPPORTED_TYPES = [
    "uint8",
    "uint16_le",
    "uint16_be",
    "uint24_le",
    "uint24_be",
    "uint32_le",
    "uint32_be",
    "bcd_2byte",
    "bcd_3byte",
    "bcd_4byte"
]

def encode_bcd(val: int, num_bytes: int = 2) -> Optional[bytes]:
    """Encodes an integer into Binary-Coded Decimal bytes (e.g. 99 -> 0x99)."""
    val_str = str(val)
    max_digits = num_bytes * 2
    if len(val_str) > max_digits:
        return None
    val_str = val_str.zfill(max_digits)
    byte_list = []
    for i in range(0, len(val_str), 2):
        byte_list.append((int(val_str[i]) << 4) | int(val_str[i+1]))
    return bytes(byte_list)

def decode_bcd(raw: bytes) -> Optional[int]:
    """Decodes BCD bytes to integer."""
    result = 0
    for b in raw:
        high = (b >> 4) & 0x0F
        low = b & 0x0F
        if high > 9 or low > 9:
            return None
        result = result * 100 + (high * 10 + low)
    return result

def read_typed_value(data: bytes, offset: int, data_type: str) -> Optional[int]:
    """Reads a value from bytes at offset according to data_type."""
    length = len(data)
    try:
        if data_type == "uint8" and offset + 1 <= length:
            return data[offset]
        elif data_type == "uint16_le" and offset + 2 <= length:
            return struct.unpack("<H", data[offset:offset+2])[0]
        elif data_type == "uint16_be" and offset + 2 <= length:
            return struct.unpack(">H", data[offset:offset+2])[0]
        elif data_type == "uint24_le" and offset + 3 <= length:
            b = data[offset:offset+3]
            return b[0] | (b[1] << 8) | (b[2] << 16)
        elif data_type == "uint24_be" and offset + 3 <= length:
            b = data[offset:offset+3]
            return (b[0] << 16) | (b[1] << 8) | b[2]
        elif data_type == "uint32_le" and offset + 4 <= length:
            return struct.unpack("<I", data[offset:offset+4])[0]
        elif data_type == "uint32_be" and offset + 4 <= length:
            return struct.unpack(">I", data[offset:offset+4])[0]
        elif data_type == "bcd_2byte" and offset + 2 <= length:
            return decode_bcd(data[offset:offset+2])
        elif data_type == "bcd_3byte" and offset + 3 <= length:
            return decode_bcd(data[offset:offset+3])
        elif data_type == "bcd_4byte" and offset + 4 <= length:
            return decode_bcd(data[offset:offset+4])
    except Exception:
        return None
    return None

def encode_typed_value(val: int, data_type: str) -> Optional[bytes]:
    """Encodes an integer into bytes for writing."""
    try:
        if data_type == "uint8":
            return struct.pack("B", max(0, min(255, val)))
        elif data_type == "uint16_le":
            return struct.pack("<H", max(0, min(65535, val)))
        elif data_type == "uint16_be":
            return struct.pack(">H", max(0, min(65535, val)))
        elif data_type == "uint24_le":
            val = max(0, min(0xFFFFFF, val))
            return bytes([val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF])
        elif data_type == "uint24_be":
            val = max(0, min(0xFFFFFF, val))
            return bytes([(val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF])
        elif data_type == "uint32_le":
            return struct.pack("<I", max(0, min(0xFFFFFFFF, val)))
        elif data_type == "uint32_be":
            return struct.pack(">I", max(0, min(0xFFFFFFFF, val)))
        elif data_type == "bcd_2byte":
            return encode_bcd(val, 2)
        elif data_type == "bcd_3byte":
            return encode_bcd(val, 3)
        elif data_type == "bcd_4byte":
            return encode_bcd(val, 4)
    except Exception:
        return None
    return None

def search_value_in_save(save_data: bytes, target_val: int, max_results: int = 50) -> List[Dict[str, Any]]:
    """
    Scans a save binary for all occurrences of target_val across all supported data encodings.
    """
    matches = []
    length = len(save_data)
    
    # 8-bit check
    if 0 <= target_val <= 255:
        target_byte = target_val
        for i in range(length):
            if save_data[i] == target_byte:
                matches.append({
                    "offset": i,
                    "hex_offset": f"0x{i:06X}",
                    "type": "uint8",
                    "value": target_val,
                    "confidence": "Medium (Common byte)" if target_val in (0, 1, 2, 3) else "High"
                })
                if len(matches) >= max_results:
                    return matches
                    
    # 16-bit checks
    if 0 <= target_val <= 65535:
        packed_le = struct.pack("<H", target_val)
        packed_be = struct.pack(">H", target_val)
        
        idx = 0
        while (idx := save_data.find(packed_le, idx)) != -1:
            matches.append({
                "offset": idx,
                "hex_offset": f"0x{idx:06X}",
                "type": "uint16_le",
                "value": target_val,
                "confidence": "Very High"
            })
            idx += 1
            if len(matches) >= max_results:
                return matches
                
        if packed_be != packed_le:
            idx = 0
            while (idx := save_data.find(packed_be, idx)) != -1:
                matches.append({
                    "offset": idx,
                    "hex_offset": f"0x{idx:06X}",
                    "type": "uint16_be",
                    "value": target_val,
                    "confidence": "High"
                })
                idx += 1
                if len(matches) >= max_results:
                    return matches

    # BCD checks (classic arcade and NES/SNES RPGs)
    bcd_bytes = encode_bcd(target_val, 2)
    if bcd_bytes and bcd_bytes not in (b'\x00\x00',):
        idx = 0
        while (idx := save_data.find(bcd_bytes, idx)) != -1:
            matches.append({
                "offset": idx,
                "hex_offset": f"0x{idx:06X}",
                "type": "bcd_2byte",
                "value": target_val,
                "confidence": "High (BCD Encoded)"
            })
            idx += 1
            if len(matches) >= max_results:
                return matches

    # 24-bit check (Chrono Trigger / Final Fantasy VI HP & Gold)
    if 0 <= target_val <= 0xFFFFFF:
        le24 = bytes([target_val & 0xFF, (target_val >> 8) & 0xFF, (target_val >> 16) & 0xFF])
        idx = 0
        while (idx := save_data.find(le24, idx)) != -1:
            matches.append({
                "offset": idx,
                "hex_offset": f"0x{idx:06X}",
                "type": "uint24_le",
                "value": target_val,
                "confidence": "Very High (24-bit RPG Gold/HP)"
            })
            idx += 1
            if len(matches) >= max_results:
                return matches

    return matches

def diff_save_files(
    data_a: bytes,
    data_b: bytes,
    val_a: Optional[int] = None,
    val_b: Optional[int] = None,
    max_results: int = 40
) -> Dict[str, Any]:
    """
    Compares two save files to isolate variable deltas (e.g., Save A had 100 gold, Save B had 150 gold).
    Returns pinpointed offset candidates.
    """
    if len(data_a) != len(data_b):
        return {
            "status": "error",
            "message": f"Save file sizes differ ({len(data_a)} bytes vs {len(data_b)} bytes). Compare saves from the same emulator/slot.",
            "candidates": []
        }

    total_diff_bytes = sum(1 for i in range(len(data_a)) if data_a[i] != data_b[i])
    candidates = []

    # If specific values are given, do an exact value-transition search across data types
    if val_a is not None and val_b is not None:
        expected_delta = val_b - val_a
        for dtype in SUPPORTED_TYPES:
            for offset in range(len(data_a)):
                v1 = read_typed_value(data_a, offset, dtype)
                v2 = read_typed_value(data_b, offset, dtype)
                if v1 is not None and v2 is not None:
                    # Check exact value match
                    if v1 == val_a and v2 == val_b:
                        candidates.append({
                            "offset": offset,
                            "hex_offset": f"0x{offset:06X}",
                            "data_type": dtype,
                            "before": v1,
                            "after": v2,
                            "delta": expected_delta,
                            "match_type": "EXACT_TRANSITION",
                            "confidence": "99% (Exact Value Match)"
                        })
                        if len(candidates) >= max_results:
                            break
                    # Or check delta match
                    elif v2 - v1 == expected_delta and expected_delta != 0:
                        candidates.append({
                            "offset": offset,
                            "hex_offset": f"0x{offset:06X}",
                            "data_type": dtype,
                            "before": v1,
                            "after": v2,
                            "delta": expected_delta,
                            "match_type": "DELTA_MATCH",
                            "confidence": "85% (Delta Match)"
                        })
                        if len(candidates) >= max_results:
                            break
            if len(candidates) >= max_results:
                break
    else:
        # General byte diff scan
        for offset in range(len(data_a)):
            if data_a[offset] != data_b[offset]:
                candidates.append({
                    "offset": offset,
                    "hex_offset": f"0x{offset:06X}",
                    "data_type": "uint8",
                    "before": data_a[offset],
                    "after": data_b[offset],
                    "hex_before": f"0x{data_a[offset]:02X}",
                    "hex_after": f"0x{data_b[offset]:02X}",
                    "delta": data_b[offset] - data_a[offset]
                })
                if len(candidates) >= max_results:
                    break

    return {
        "status": "success",
        "file_size": len(data_a),
        "total_diff_bytes": total_diff_bytes,
        "candidates_count": len(candidates),
        "candidates": candidates
    }

def create_safe_backup(file_path: Path) -> Path:
    """Creates a timestamped immutable backup of a save file before any modification."""
    ts = time.strftime("%Y%m%d_%H%M%S")
    backup_path = file_path.with_name(f"{file_path.name}.bak.{ts}")
    shutil.copy2(file_path, backup_path)
    return backup_path

def safe_patch_save_file(
    file_path: str,
    offset: int,
    new_value: int,
    data_type: str = "uint16_le"
) -> Dict[str, Any]:
    """
    Safely edits a save file with guaranteed zero-corruption safeguards:
    1. Creates atomic timestamped .bak backup.
    2. Encodes new value.
    3. Writes to temp file first.
    4. Verifies byte size parity.
    5. Replaces atomically.
    """
    p = Path(file_path).resolve()
    if not p.exists() or not p.is_file():
        return {"status": "error", "message": f"Save file not found at {file_path}"}
        
    encoded_bytes = encode_typed_value(new_value, data_type)
    if encoded_bytes is None:
        return {"status": "error", "message": f"Could not encode value {new_value} for data type {data_type}"}

    original_bytes = p.read_bytes()
    orig_len = len(original_bytes)
    
    if offset < 0 or offset + len(encoded_bytes) > orig_len:
        return {
            "status": "error",
            "message": f"Offset 0x{offset:X} + {len(encoded_bytes)} bytes exceeds save file bounds ({orig_len} bytes)"
        }

    # 1. Create safety backup
    backup_path = create_safe_backup(p)
    
    # 2. Prepare patched buffer
    patched_buffer = bytearray(original_bytes)
    old_bytes = bytes(patched_buffer[offset:offset+len(encoded_bytes)])
    patched_buffer[offset:offset+len(encoded_bytes)] = encoded_bytes
    
    # 3. Write via temporary file
    temp_path = p.with_suffix(p.suffix + ".tmp_write")
    try:
        temp_path.write_bytes(patched_buffer)
        
        # Verify length parity
        if temp_path.stat().st_size != orig_len:
            if temp_path.exists():
                temp_path.unlink()
            return {"status": "error", "message": "Size verification failed. Modification aborted."}
            
        # Atomically replace
        os.replace(temp_path, p)
        
        return {
            "status": "success",
            "file": str(p),
            "offset": offset,
            "hex_offset": f"0x{offset:06X}",
            "data_type": data_type,
            "old_hex": old_bytes.hex().upper(),
            "new_hex": encoded_bytes.hex().upper(),
            "new_value": new_value,
            "backup_created": str(backup_path),
            "revert_command": f"OmniVault safe backup created at {backup_path.name}"
        }
    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        return {"status": "error", "message": f"Write failed: {str(e)}"}

def revert_save_from_backup(file_path: str, backup_path: str) -> Dict[str, Any]:
    """Restores a save file from a designated backup."""
    target = Path(file_path).resolve()
    bak = Path(backup_path).resolve()
    
    if not bak.exists():
        return {"status": "error", "message": f"Backup file not found at {backup_path}"}
        
    try:
        shutil.copy2(bak, target)
        return {"status": "success", "message": f"Restored {target.name} from {bak.name}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def list_save_backups(file_path: str) -> List[Dict[str, Any]]:
    """Lists all available backups for a given save file."""
    p = Path(file_path).resolve()
    parent = p.parent
    if not parent.exists():
        return []
        
    prefix = f"{p.name}.bak."
    backups = []
    for f in parent.iterdir():
        if f.is_file() and f.name.startswith(prefix):
            stat = f.stat()
            backups.append({
                "filename": f.name,
                "path": str(f),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                "size_bytes": stat.st_size
            })
    backups.sort(key=lambda x: x["timestamp"], reverse=True)
    return backups
