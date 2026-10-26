import io
import re
import zipfile
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

# Standard NES Game Genie Alphabet
NES_GG_ALPHABET = "APZLGITYEOXUKSVN"
NES_GG_MAP = {c: i for i, c in enumerate(NES_GG_ALPHABET)}

# Standard SNES Game Genie Alphabet
SNES_GG_ALPHABET = "DF4709156BC8A23E"
SNES_GG_MAP = {c: i for i, c in enumerate(SNES_GG_ALPHABET)}

# Standard Genesis / Mega Drive Game Genie Alphabet (32 chars)
GENESIS_GG_ALPHABET = "ABCDEFGHJKLMNPRSTVWXYZ0123456789"


def extract_rom_bytes_if_archived(rom_bytes: bytes) -> bytes:
    """
    If the provided ROM bytes are inside a .zip archive (starts with PK\\x03\\x04),
    automatically extracts the largest valid ROM binary inside the archive.
    """
    if len(rom_bytes) >= 4 and rom_bytes[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(io.BytesIO(rom_bytes), "r") as zf:
                rom_exts = (
                    ".nes", ".sfc", ".smc", ".gb", ".gbc", ".gba", ".nds",
                    ".md", ".gen", ".bin", ".z64", ".n64", ".v64", ".pce",
                    ".sms", ".gg", ".a26", ".a78", ".iso", ".pbp", ".elf"
                )
                candidates = [
                    info for info in zf.infolist()
                    if not info.is_dir() and not info.filename.startswith("__MACOSX")
                ]
                rom_candidates = [
                    info for info in candidates
                    if info.filename.lower().endswith(rom_exts)
                ]
                chosen = max(rom_candidates or candidates, key=lambda i: i.file_size, default=None)
                if chosen:
                    return zf.read(chosen.filename)
        except Exception:
            pass
    return rom_bytes


def encode_genesis_game_genie(address: int, value_16bit: int) -> str:
    """
    Encodes a 24-bit Motorola 68000 ROM address and 16-bit word value into an
    authentic 8-character Galoob Sega Genesis Game Genie code (XXXX-XXXX).
    """
    a = address & 0xFFFFFF
    d = value_16bit & 0xFFFF
    # Build 40-bit scrambled integer per Galoob Genesis specification
    bits = (
        ((d & 0x00FF) << 32)
        | (((d & 0xFF00) >> 8) << 24)
        | ((a & 0x00FF00) << 8)
        | ((a & 0x0000FF) << 8)
        | ((a & 0xFF0000) >> 16)
    )
    chars = []
    for shift in range(35, -1, -5):
        idx = (bits >> shift) & 0x1F
        chars.append(GENESIS_GG_ALPHABET[idx])
    return "".join(chars[:4]) + "-" + "".join(chars[4:])

def encode_nes_game_genie_6(address: int, value: int) -> str:
    """
    Encodes a 16-bit NES address ($8000-$FFFF) and replacement value (0x00-0xFF)
    into an authentic 6-character Galoob NES Game Genie code.
    """
    addr = address & 0x7FFF
    val = value & 0xFF

    n0 = (val & 0x07) | ((val >> 4) & 0x08)
    n1 = ((val >> 4) & 0x07) | ((addr >> 4) & 0x08)
    n2 = (addr >> 4) & 0x07
    n3 = ((addr >> 12) & 0x07) | (addr & 0x08)
    n4 = (addr & 0x07) | ((addr >> 8) & 0x08)
    n5 = ((addr >> 8) & 0x07) | (val & 0x08)

    return "".join(NES_GG_ALPHABET[n & 0x0F] for n in (n0, n1, n2, n3, n4, n5))


def encode_nes_game_genie_8(address: int, value: int, compare: int) -> str:
    """
    Encodes a 16-bit NES address ($8000-$FFFF), replacement value (0x00-0xFF),
    and compare byte (0x00-0xFF) into an authentic 8-character Galoob NES Game Genie code.
    Essential for banked NES ROMs so only the bank containing `compare` is patched.
    """
    addr = address & 0x7FFF
    val = value & 0xFF
    cmp = compare & 0xFF

    n0 = (val & 0x07) | ((val >> 4) & 0x08)
    n1 = ((val >> 4) & 0x07) | ((addr >> 4) & 0x08)
    n2 = ((addr >> 4) & 0x07) | 0x08
    n3 = ((addr >> 12) & 0x07) | (addr & 0x08)
    n4 = (addr & 0x07) | ((addr >> 8) & 0x08)
    n5 = ((addr >> 8) & 0x07) | (cmp & 0x08)
    n6 = (cmp & 0x07) | ((cmp >> 4) & 0x08)
    n7 = ((cmp >> 4) & 0x07) | (val & 0x08)

    return "".join(NES_GG_ALPHABET[n & 0x0F] for n in (n0, n1, n2, n3, n4, n5, n6, n7))


def decode_nes_game_genie_6(code: str) -> Optional[Tuple[int, int]]:
    """Decodes a 6- or 8-character Galoob NES Game Genie code into (address, value)."""
    clean = code.upper().replace("-", "").replace(" ", "").strip()
    if len(clean) not in (6, 8) or any(c not in NES_GG_MAP for c in clean):
        return None

    n = [NES_GG_MAP[c] for c in clean]
    address = 0x8000 | (
        ((n[3] & 0x07) << 12)
        | ((n[5] & 0x07) << 8)
        | ((n[4] & 0x08) << 8)
        | ((n[2] & 0x07) << 4)
        | ((n[1] & 0x08) << 4)
        | (n[4] & 0x07)
        | (n[3] & 0x08)
    )
    if len(clean) == 6:
        val = ((n[1] & 0x07) << 4) | ((n[0] & 0x08) << 4) | (n[0] & 0x07) | (n[5] & 0x08)
    else:
        val = ((n[1] & 0x07) << 4) | ((n[0] & 0x08) << 4) | (n[0] & 0x07) | (n[7] & 0x08)
    return address, val


def encode_gb_game_genie(address: int, value: int, compare: Optional[int] = None) -> str:
    """
    Encodes a Game Boy / Game Boy Color ROM address ($0000-$7FFF), replacement byte,
    and optional compare byte into an authentic Galoob Game Boy Game Genie code
    (6-digit 'XXX-XXX' or 9-digit 'XXX-XXX-XXX').
    """
    addr = address & 0x7FFF
    val = value & 0xFF
    addr_comp_hi = ((~addr) >> 12) & 0x0F
    part1 = f"{val:02X}{(addr >> 8) & 0x0F:01X}"
    part2 = f"{(addr >> 4) & 0x0F:01X}{addr & 0x0F:01X}{addr_comp_hi:01X}"
    if compare is None:
        return f"{part1}-{part2}"
    cmp = compare & 0xFF
    rotated = ((cmp >> 2) | ((cmp & 0x03) << 6)) & 0xFF
    obf = (rotated ^ 0xBA) & 0xFF
    hi = (obf >> 4) & 0x0F
    mid = (hi ^ 0x08) & 0x0F
    lo = obf & 0x0F
    return f"{part1}-{part2}-{hi:01X}{mid:01X}{lo:01X}"


def encode_snes_game_genie(address: int, value: int) -> str:
    """
    Encodes a 24-bit SNES address ($000000-$FFFFFF) and byte value (0x00-0xFF)
    using the authentic Galoob SNES Game Genie bit permutation algorithm into 'XXXX-XXXX'.
    """
    addr = address & 0xFFFFFF
    val = value & 0xFF

    n0 = (val & 0x3C) >> 2
    n1 = ((val & 0x03) << 2) | ((addr & 0xC00000) >> 22)
    n2 = (addr & 0x3C0000) >> 18
    n3 = (addr & 0x03C000) >> 14
    n4 = (addr & 0x003C00) >> 10
    n5 = (addr & 0x0003C0) >> 6
    n6 = (addr & 0x00003C) >> 2
    n7 = ((addr & 0x000003) << 2) | ((val & 0xC0) >> 6)

    nibbles = [n0, n1, n2, n3, n4, n5, n6, n7]
    chars = [SNES_GG_ALPHABET[n & 0x0F] for n in nibbles]
    return f"{chars[0]}{chars[1]}{chars[2]}{chars[3]}-{chars[4]}{chars[5]}{chars[6]}{chars[7]}"

def encode_action_replay(platform: str, address: int, value: int) -> str:
    """
    Encodes address and value into the universal Pro Action Replay / GameShark format
    natively supported by Snes9x, Genesis Plus GX, and RetroArch.
    """
    plat = platform.upper()
    if plat in ("SNES", "SFC"):
        return f"{address:06X}:{value:02X}"
    elif plat in ("GENESIS", "MEGADRIVE", "MD"):
        return f"{address:06X}:{value:04X}"
    elif plat in ("GB", "GBC"):
        return f"01{value:02X}{address & 0xFF:02X}{(address >> 8) & 0xFF:02X}"
    return f"{address:06X}:{value:02X}"

def scan_rom_for_decrement_cheats(rom_bytes: bytes, platform: str = "NES") -> List[Dict[str, Any]]:
    """
    Scans a ROM binary (automatically extracting .zip archives) for candidate instruction sequences
    that decrement counters (followed by a conditional branch or store) and generates
    instruction-length-safe patches across 6502, 65816, SM83/Z80, Motorola 68000, ARM/Thumb, and MIPS.
    """
    rom_bytes = extract_rom_bytes_if_archived(rom_bytes)
    cheats = []
    length = len(rom_bytes)
    plat = platform.upper()
    follow_opcodes_6502 = {0x10, 0x30, 0x50, 0x70, 0x90, 0xB0, 0xD0, 0xF0, 0x85, 0x8D, 0x60}

    if plat in ("NES", "ATARI2600", "ATARI7800"):
        header_offset = 16 if rom_bytes.startswith(b"NES\x1a") else 0
        # 1. SBC #$01 (0xE9 0x01) followed by STA ($85/$8D) -> patch operand (idx + 1) from 0x01 to 0x00
        idx = header_offset
        while (idx := rom_bytes.find(b"\xE9\x01", idx)) != -1:
            if idx + 2 < length and rom_bytes[idx + 2] in (0x85, 0x8D, 0x95, 0x99, 0x9D, 0x10, 0x90, 0xF0, 0xD0):
                patch_file_idx = idx + 1
                prg_addr = 0x8000 + ((patch_file_idx - header_offset) % 0x8000)
                gg_code = encode_nes_game_genie_8(prg_addr, 0x00, 0x01)
                cheats.append({
                    "rom_offset": patch_file_idx,
                    "hex_offset": f"0x{patch_file_idx:06X}",
                    "cpu_address": f"${prg_addr:04X}",
                    "type": "SBC #$01 -> SBC #$00 (Zero Subtract)",
                    "description": f"Changes SBC #$01 operand at ${prg_addr:04X} to #$00 (instruction-safe)",
                    "original_opcode": rom_bytes[idx:idx+2].hex().upper(),
                    "patch_opcode": "E900",
                    "game_genie_code": gg_code,
                    "action_replay_code": f"{prg_addr:04X}?01:00",
                    "effect": "Candidate: Prevent -1 Subtraction (Compare-Protected 8-Char Code)"
                })
                if len(cheats) >= 15:
                    return cheats
            idx += 2

        # 2. DEC $zp (0xC6 xx) followed by conditional branch or RTS -> change 0xC6 to 0xC5 (CMP $zp)
        idx = header_offset
        while (idx := rom_bytes.find(b"\xC6", idx)) != -1:
            if idx + 2 < length:
                zp_addr = rom_bytes[idx + 1]
                next_op = rom_bytes[idx + 2]
                if 0x04 <= zp_addr <= 0xFB and next_op in follow_opcodes_6502:
                    prg_addr = 0x8000 + ((idx - header_offset) % 0x8000)
                    gg_code = encode_nes_game_genie_8(prg_addr, 0xC5, 0xC6)
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"${prg_addr:04X}",
                        "type": f"DEC ${zp_addr:02X} -> CMP ${zp_addr:02X}",
                        "description": f"Replaces 2-byte DEC ${zp_addr:02X} with 2-byte CMP ${zp_addr:02X} (no crash)",
                        "original_opcode": rom_bytes[idx:idx+2].hex().upper(),
                        "patch_opcode": f"C5{zp_addr:02X}",
                        "game_genie_code": gg_code,
                        "action_replay_code": f"{prg_addr:04X}?C6:C5",
                        "effect": f"Candidate: Freeze Zero-Page Counter ${zp_addr:02X}"
                    })
                    if len(cheats) >= 15:
                        return cheats
            idx += 2

        # 3. DEC $xxxx (0xCE lo hi) targeting NES Internal RAM ($0000-$07FF) -> CMP $xxxx (0xCD lo hi)
        idx = header_offset
        while (idx := rom_bytes.find(b"\xCE", idx)) != -1:
            if idx + 3 < length:
                lo = rom_bytes[idx + 1]
                hi = rom_bytes[idx + 2]
                if 0x00 <= hi <= 0x07:
                    ram_addr = (hi << 8) | lo
                    prg_addr = 0x8000 + ((idx - header_offset) % 0x8000)
                    gg_code = encode_nes_game_genie_8(prg_addr, 0xCD, 0xCE)
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"${prg_addr:04X}",
                        "type": f"DEC ${ram_addr:04X} -> CMP ${ram_addr:04X}",
                        "description": f"Replaces 3-byte DEC ${ram_addr:04X} with 3-byte CMP ${ram_addr:04X} (instruction-safe)",
                        "original_opcode": rom_bytes[idx:idx+3].hex().upper(),
                        "patch_opcode": f"CD{lo:02X}{hi:02X}",
                        "game_genie_code": gg_code,
                        "action_replay_code": f"{prg_addr:04X}?CE:CD",
                        "effect": f"Candidate: Freeze RAM Counter at ${ram_addr:04X}"
                    })
                    if len(cheats) >= 15:
                        return cheats
            idx += 1

        # 4. DEX/DEY followed by STX/STY ($zp or $abs) -> NOP (0xEA)
        for dec_op, reg_name, store_ops in ((0xCA, "X", (0x86, 0x8E)), (0x88, "Y", (0x84, 0x8C))):
            idx = header_offset
            while (idx := rom_bytes.find(bytes([dec_op]), idx)) != -1:
                if idx + 2 < length and rom_bytes[idx + 1] in store_ops:
                    prg_addr = 0x8000 + ((idx - header_offset) % 0x8000)
                    gg_code = encode_nes_game_genie_8(prg_addr, 0xEA, dec_op)
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"${prg_addr:04X}",
                        "type": f"DE{reg_name}; ST{reg_name} -> NOP; ST{reg_name}",
                        "description": f"Replaces 1-byte DE{reg_name} before RAM store with 1-byte NOP (0xEA)",
                        "original_opcode": f"{dec_op:02X}",
                        "patch_opcode": "EA",
                        "game_genie_code": gg_code,
                        "action_replay_code": f"{prg_addr:04X}?{dec_op:02X}:EA",
                        "effect": f"Candidate: Prevent Register {reg_name} Decrement Before Store"
                    })
                    if len(cheats) >= 15:
                        return cheats
                idx += 1

    elif plat in ("SNES", "TG16"):
        header_offset = 512 if (length % 1024 == 512) else 0
        idx = header_offset
        while (idx := rom_bytes.find(b"\xE9\x01", idx)) != -1:
            if idx + 2 < length and rom_bytes[idx + 2] in (0x85, 0x8D, 0x8F, 0x10, 0x90, 0xF0, 0xD0):
                patch_file_idx = idx + 1
                rom_addr = 0x808000 + (patch_file_idx - header_offset)
                gg_code = encode_snes_game_genie(rom_addr, 0x00)
                cheats.append({
                    "rom_offset": patch_file_idx,
                    "hex_offset": f"0x{patch_file_idx:06X}",
                    "cpu_address": f"${rom_addr:06X}",
                    "type": "SBC #$01 -> SBC #$00 (Zero Subtract)",
                    "description": "Replaces 1-point subtraction operand with 0 (instruction-safe)",
                    "original_opcode": rom_bytes[idx:idx+2].hex().upper(),
                    "patch_opcode": "E900",
                    "game_genie_code": gg_code,
                    "action_replay_code": encode_action_replay("SNES", rom_addr, 0x00),
                    "effect": "Candidate: Prevent -1 Subtraction"
                })
                if len(cheats) >= 15:
                    return cheats
            idx += 2

        idx = header_offset
        while (idx := rom_bytes.find(b"\xC6", idx)) != -1:
            if idx + 2 < length:
                dp_addr = rom_bytes[idx + 1]
                next_op = rom_bytes[idx + 2]
                if 0x10 <= dp_addr <= 0xF0 and next_op in follow_opcodes_6502:
                    rom_addr = 0x808000 + (idx - header_offset)
                    gg_code = encode_snes_game_genie(rom_addr, 0xC5)
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"${rom_addr:06X}",
                        "type": f"DEC ${dp_addr:02X} -> CMP ${dp_addr:02X}",
                        "description": f"Replaces 2-byte DEC ${dp_addr:02X} with 2-byte CMP ${dp_addr:02X}",
                        "original_opcode": rom_bytes[idx:idx+2].hex().upper(),
                        "patch_opcode": f"C5{dp_addr:02X}",
                        "game_genie_code": gg_code,
                        "action_replay_code": encode_action_replay("SNES", rom_addr, 0xC5),
                        "effect": f"Candidate: Freeze Direct-Page Counter ${dp_addr:02X}"
                    })
                    if len(cheats) >= 15:
                        return cheats
            idx += 2

    elif plat in ("GB", "GBC", "MASTERSYSTEM", "GAMEGEAR"):
        start_offset = 0x0150 if length > 0x0150 else 0
        idx = start_offset
        while (idx := rom_bytes.find(b"\xD6\x01", idx)) != -1:
            if idx + 2 < length and rom_bytes[idx + 2] in (0x20, 0x28, 0x30, 0x38, 0x77, 0xEA, 0xFA):
                patch_file_idx = idx + 1
                bank_addr = patch_file_idx if patch_file_idx < 0x4000 else (0x4000 + (patch_file_idx % 0x4000))
                gg_code = encode_gb_game_genie(bank_addr, 0x00, 0x01)
                cheats.append({
                    "rom_offset": patch_file_idx,
                    "hex_offset": f"0x{patch_file_idx:06X}",
                    "cpu_address": f"${bank_addr:04X}",
                    "type": "SUB 1 -> SUB 0 (Zero Subtract)",
                    "description": "Changes immediate operand of SUB 1 to SUB 0",
                    "original_opcode": rom_bytes[idx:idx+2].hex().upper(),
                    "patch_opcode": "D600",
                    "game_genie_code": gg_code,
                    "action_replay_code": gg_code,
                    "effect": "Candidate: Prevent -1 Subtraction (9-Digit GB Game Genie)"
                })
                if len(cheats) >= 15:
                    return cheats
            idx += 2

        idx = start_offset
        while (idx := rom_bytes.find(b"\x35", idx)) != -1:
            if idx + 1 < length and rom_bytes[idx + 1] in (0x20, 0x28, 0xC8, 0xC0):
                bank_addr = idx if idx < 0x4000 else (0x4000 + (idx % 0x4000))
                gg_code = encode_gb_game_genie(bank_addr, 0x00, 0x35)
                cheats.append({
                    "rom_offset": idx,
                    "hex_offset": f"0x{idx:06X}",
                    "cpu_address": f"${bank_addr:04X}",
                    "type": "DEC (HL) -> NOP",
                    "description": "Replaces 1-byte DEC (HL) with 1-byte NOP (0x00)",
                    "original_opcode": "35",
                    "patch_opcode": "00",
                    "game_genie_code": gg_code,
                    "action_replay_code": gg_code,
                    "effect": "Candidate: Bypass Indirect Decrement (9-Digit GB Game Genie)"
                })
                if len(cheats) >= 15:
                    return cheats
            idx += 1

    elif plat in ("GENESIS", "SEGACD", "NEOGEO"):
        # Motorola 68000 (Big-Endian 16-bit aligned):
        # SUBQ.B #1, Dn (0x5300..0x5307) or SUBQ.W #1, Dn (0x5340..0x5347) -> NOP (0x4E71, 2 bytes)
        start_offset = 0x200 if length > 0x200 else 0
        for idx in range(start_offset, min(length - 4, 0x200000), 2):
            b0 = rom_bytes[idx]
            b1 = rom_bytes[idx + 1]
            if b0 == 0x53 and ((0x00 <= b1 <= 0x07) or (0x40 <= b1 <= 0x47)):
                next_hi = rom_bytes[idx + 2]
                # Followed by Bcc (0x60..0x6F) or MOVE to RAM
                if (0x60 <= next_hi <= 0x6F) or next_hi in (0x11, 0x13, 0x31, 0x33):
                    reg_num = b1 & 0x07
                    size_str = "W" if b1 >= 0x40 else "B"
                    gg_code = encode_genesis_game_genie(idx, 0x4E71)
                    ar_code = encode_action_replay("GENESIS", idx, 0x4E71)
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"${idx:06X}",
                        "type": f"M68K SUBQ.{size_str} #1, D{reg_num} -> NOP",
                        "description": f"Replaces 2-byte SUBQ.{size_str} #1, D{reg_num} at ${idx:06X} with 2-byte NOP (0x4E71)",
                        "original_opcode": f"{b0:02X}{b1:02X}",
                        "patch_opcode": "4E71",
                        "game_genie_code": gg_code,
                        "action_replay_code": ar_code,
                        "effect": f"Candidate: Prevent Register D{reg_num} Decrement (Genesis Game Genie)"
                    })
                    if len(cheats) >= 15:
                        return cheats

    elif plat in ("GBA", "NDS"):
        # ARM7TDMI Thumb (Little-Endian 16-bit aligned):
        # SUBS Rd, Rd, #1 is 0x3801..0x3F01 (bytes: 0x01, 0x38..0x3F)
        start_offset = 0x100 if length > 0x100 else 0
        for idx in range(start_offset, min(length - 4, 0x400000), 2):
            if rom_bytes[idx] == 0x01 and (0x38 <= rom_bytes[idx + 1] <= 0x3F):
                next_hi = rom_bytes[idx + 3]
                # Followed by STR/STRB/STRH (0x60..0x87) or Bcc (0xD0..0xDD)
                if (0x60 <= next_hi <= 0x87) or (0xD0 <= next_hi <= 0xDD):
                    rd = rom_bytes[idx + 1] - 0x38
                    gba_addr = 0x08000000 + idx
                    patched_word = (rom_bytes[idx + 1] << 8) | 0x00
                    cb_code = f"8{idx:07X} {patched_word:04X}"
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"0x{gba_addr:08X}",
                        "type": f"Thumb SUBS R{rd}, #1 -> SUBS R{rd}, #0",
                        "description": f"Changes Thumb SUBS R{rd}, #1 immediate operand to #0 (2-byte aligned)",
                        "original_opcode": f"{rom_bytes[idx+1]:02X}01",
                        "patch_opcode": f"{rom_bytes[idx+1]:02X}00",
                        "game_genie_code": cb_code,
                        "action_replay_code": cb_code,
                        "effect": f"Candidate: Prevent R{rd} Counter Decrement (CodeBreaker 16-Bit ROM Patch)"
                    })
                    if len(cheats) >= 15:
                        return cheats

    elif plat in ("N64", "PS1", "PS2", "PSP"):
        # MIPS ADDIU Rt, Rt, -1 (0x2442FFFF for v0, 0x2463FFFF for v1, 0x2508FFFF for t0)
        is_be = (plat == "N64")
        target_regs = [(2, "v0", 0x2442), (3, "v1", 0x2463), (8, "t0", 0x2508), (9, "t1", 0x2529)]
        scan_limit = min(length - 8, 0x400000)
        for idx in range(0, scan_limit, 4):
            word = int.from_bytes(rom_bytes[idx:idx+4], "big" if is_be else "little")
            for _, reg_name, prefix in target_regs:
                if word == ((prefix << 16) | 0xFFFF):
                    code_str = f"80{idx:06X} 0000" if not is_be else f"81{idx+2:06X} 0000"
                    cheats.append({
                        "rom_offset": idx,
                        "hex_offset": f"0x{idx:06X}",
                        "cpu_address": f"0x{idx:08X}",
                        "type": f"MIPS ADDIU ${reg_name}, ${reg_name}, -1 -> +0",
                        "description": f"Changes MIPS ADDIU ${reg_name}, -1 immediate to 0 (4-byte aligned)",
                        "original_opcode": f"{word:08X}",
                        "patch_opcode": f"{prefix:04X}0000",
                        "game_genie_code": code_str,
                        "action_replay_code": code_str,
                        "effect": f"Candidate: Prevent MIPS Register ${reg_name} Decrement"
                    })
                    if len(cheats) >= 15:
                        return cheats

    return cheats
