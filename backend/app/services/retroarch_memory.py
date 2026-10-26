import socket
import struct
import time
import threading
from typing import Dict, Any, List, Optional, Tuple

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 55355

# Standard emulated RAM windows per retro console
PLATFORM_RAM_RANGES = {
    "NES": [(0x0000, 0x0800, "Internal RAM (2KB)")],
    "SNES": [(0x7E0000, 0x2000, "Low WRAM (8KB)"), (0x7E2000, 0xE000, "High WRAM (56KB)")],
    "GB": [(0xC000, 0x2000, "Work RAM (8KB)")],
    "GBC": [(0xC000, 0x2000, "Work RAM (8KB)")],
    "GBA": [(0x03000000, 0x8000, "Fast IWRAM (32KB)"), (0x02000000, 0x40000, "EWRAM (256KB)")],
    "Genesis": [(0xFF0000, 0x10000, "Main 68000 RAM (64KB)")],
    "PS1": [(0x80000000, 0x200000, "Main RAM (2MB)")],
    "N64": [(0x80000000, 0x400000, "RDRAM (4MB)")]
}

_FROZEN_ADDRESSES: Dict[Tuple[str, int, int], threading.Event] = {}

def send_udp_command(cmd: str, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT, timeout: float = 1.0) -> Optional[str]:
    """Sends a raw command string to RetroArch's UDP network socket and returns the response."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        data = cmd.strip() + "\n"
        sock.sendto(data.encode("utf-8"), (host, port))
        resp, _ = sock.recvfrom(65535)
        return resp.decode("utf-8", errors="ignore").strip()
    except (socket.timeout, ConnectionRefusedError, OSError):
        return None
    finally:
        sock.close()

def check_retroarch_status(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> Dict[str, Any]:
    """Checks if RetroArch is currently running with Network Commands enabled."""
    resp = send_udp_command("GET_STATUS", host, port, timeout=1.0)
    if resp and "GET_STATUS" in resp:
        parts = resp.split(" ", 2)
        status = parts[1] if len(parts) > 1 else "UNKNOWN"
        extra = parts[2] if len(parts) > 2 else ""
        return {
            "connected": True,
            "status": status,
            "details": extra,
            "message": "Connected to live RetroArch instance via local UDP socket."
        }
    return {
        "connected": False,
        "status": "DISCONNECTED",
        "message": (
            "Could not connect to RetroArch on UDP port 55355. "
            "To enable: In RetroArch, go to Settings → Network → Network Commands → Turn ON."
        )
    }

def read_core_memory(address: int, size: int, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> Optional[bytes]:
    """
    Reads a block of memory from RetroArch's running core.
    Chunked into 128-byte requests to prevent UDP datagram fragmentation.
    """
    chunk_size = 128
    result = bytearray()
    
    current_addr = address
    bytes_left = size
    
    while bytes_left > 0:
        to_read = min(bytes_left, chunk_size)
        cmd = f"READ_CORE_MEMORY {current_addr:X} {to_read}"
        resp = send_udp_command(cmd, host, port)
        if not resp or not resp.startswith("READ_CORE_MEMORY"):
            return None
            
        parts = resp.split()
        if len(parts) < 3:
            return None
            
        hex_data = parts[2]
        try:
            raw_chunk = bytes.fromhex(hex_data)
            result.extend(raw_chunk)
        except ValueError:
            return None
            
        current_addr += to_read
        bytes_left -= to_read
        
    return bytes(result)

def write_core_memory(address: int, data: bytes, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> bool:
    """Writes bytes directly into RetroArch core RAM at specified address."""
    hex_str = data.hex().upper()
    cmd = f"WRITE_CORE_MEMORY {address:X} {hex_str}"
    resp = send_udp_command(cmd, host, port)
    return bool(resp and resp.startswith("WRITE_CORE_MEMORY"))

def scan_live_ram(
    platform: str,
    target_value: int,
    data_type: str = "uint16_le",
    candidates: Optional[List[int]] = None,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT
) -> Dict[str, Any]:
    """
    Performs initial memory scan or iterative filtering on running RetroArch emulator RAM.
    """
    from .save_hacker import encode_typed_value, read_typed_value
    
    encoded = encode_typed_value(target_value, data_type)
    if not encoded:
        return {"status": "error", "message": f"Invalid value or data type: {data_type}"}
        
    val_len = len(encoded)
    new_matches = []
    
    if candidates is not None:
        # Refinement scan: only check previously isolated candidate addresses
        for addr in candidates:
            chunk = read_core_memory(addr, val_len, host, port)
            if chunk:
                read_val = read_typed_value(chunk, 0, data_type)
                if read_val == target_value:
                    new_matches.append(addr)
    else:
        # Initial scan: sweep across the platform's standard RAM window
        ranges = PLATFORM_RAM_RANGES.get(platform, [(0x0000, 0x1000, "Default RAM")])
        for base_addr, size, desc in ranges:
            # Read in 512-byte blocks
            block_size = 512
            for offset in range(0, size, block_size):
                read_sz = min(block_size, size - offset)
                mem = read_core_memory(base_addr + offset, read_sz, host, port)
                if not mem:
                    continue
                # Search for encoded bytes in block
                idx = 0
                while (idx := mem.find(encoded, idx)) != -1:
                    match_addr = base_addr + offset + idx
                    new_matches.append(match_addr)
                    idx += 1
                    if len(new_matches) >= 200:
                        break
                if len(new_matches) >= 200:
                    break

    formatted_matches = [{
        "address": a,
        "hex_address": f"0x{a:08X}",
        "value": target_value,
        "type": data_type
    } for a in new_matches[:100]]

    return {
        "status": "success",
        "matches_count": len(new_matches),
        "matches": formatted_matches,
        "is_refined": candidates is not None,
        "instructions": (
            "Found candidates! Change the value in-game (e.g. lose a life, spend 10 coins), "
            "then run a refinement scan with the new value to isolate the exact address."
            if len(new_matches) > 1 else
            "Isolated exact memory address! You can now freeze or poke this address directly."
            if len(new_matches) == 1 else
            "No matching addresses found. Make sure the value is exact or try 8-bit / BCD types."
        )
    }

def poke_live_value(
    address: int,
    value: int,
    data_type: str = "uint16_le",
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT
) -> Dict[str, Any]:
    """Pokes a new value into live RetroArch RAM."""
    from .save_hacker import encode_typed_value
    encoded = encode_typed_value(value, data_type)
    if not encoded:
        return {"status": "error", "message": "Failed to encode value"}
        
    ok = write_core_memory(address, encoded, host, port)
    if ok:
        return {
            "status": "success",
            "address": address,
            "hex_address": f"0x{address:08X}",
            "value": value,
            "data_type": data_type,
            "message": f"Successfully poked {value} into 0x{address:08X}"
        }
    return {"status": "error", "message": "Failed to write memory to RetroArch"}

def freeze_live_value(
    address: int,
    value: int,
    data_type: str = "uint16_le",
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT
) -> Dict[str, Any]:
    """
    Freezes a memory address at a given value (infinite health/lives)
    by overwriting it every 150ms in a background worker.
    """
    from .save_hacker import encode_typed_value
    encoded = encode_typed_value(value, data_type)
    if not encoded:
        return {"status": "error", "message": "Failed to encode value"}
        
    key = (host, port, address)
    if key in _FROZEN_ADDRESSES:
        _FROZEN_ADDRESSES[key].set() # Stop existing
        
    stop_event = threading.Event()
    _FROZEN_ADDRESSES[key] = stop_event
    
    def _freeze_loop():
        while not stop_event.is_set():
            write_core_memory(address, encoded, host, port)
            time.sleep(0.15)
            
    t = threading.Thread(target=_freeze_loop, daemon=True)
    t.start()
    
    return {
        "status": "frozen",
        "address": address,
        "hex_address": f"0x{address:08X}",
        "value": value,
        "message": f"Memory address 0x{address:08X} is now frozen at {value}. Loop running."
    }

def unfreeze_live_value(address: int, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> Dict[str, Any]:
    """Unfreezes a previously locked address."""
    key = (host, port, address)
    if key in _FROZEN_ADDRESSES:
        _FROZEN_ADDRESSES[key].set()
        del _FROZEN_ADDRESSES[key]
        return {"status": "unfrozen", "address": address, "hex_address": f"0x{address:08X}"}
    return {"status": "not_frozen", "address": address}
