import os
import re
import shutil
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
from ..database import get_db_connection

router = APIRouter(prefix="/api/compressor", tags=["compressor"])

from ..services.storage_service import get_roms_dir

# File extensions that can be losslessly compressed into CHD
CD_IMAGE_EXTS = {".bin", ".cue", ".iso", ".img", ".gdi"}
GC_WII_EXTS = {".iso", ".gcm", ".wbfs"}

def get_chdman_path() -> Optional[str]:
    """Finds installed chdman executable."""
    for candidate in ["/opt/homebrew/bin/chdman", "/usr/local/bin/chdman"]:
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return shutil.which("chdman")

def get_dolphintool_path() -> Optional[str]:
    """Finds installed DolphinTool executable for lossless GameCube/Wii RVZ compression."""
    candidates = [
        "/opt/homebrew/bin/DolphinTool",
        "/usr/local/bin/DolphinTool",
        "/Applications/Dolphin.app/Contents/MacOS/DolphinTool",
    ]
    for candidate in candidates:
        if os.path.exists(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return shutil.which("DolphinTool")

@router.get("/audit")
def audit_storage():
    """
    Audits /Volumes/ROMS for real uncompressed CD/DVD disc images (.iso, .bin/.cue, .gdi)
    that can be losslessly compressed into CHD format to reclaim drive space.
    """
    chdman_path = get_chdman_path()
    dolphintool_path = get_dolphintool_path()
    candidates = []
    total_current_mb = 0
    total_projected_mb = 0

    roms_base = get_roms_dir()
    if roms_base.exists() and roms_base.is_dir():
        disc_platforms = ["PS1", "PS2", "Saturn", "Dreamcast", "SegaCD", "TG16"]
        for plat in disc_platforms:
            plat_dir = roms_base / plat
            if not plat_dir.exists():
                continue
                
            for f in plat_dir.iterdir():
                if not f.is_file():
                    continue
                ext = f.suffix.lower()
                if ext in CD_IMAGE_EXTS:
                    # Skip .bin if companion .cue exists to prevent duplicate candidate
                    if ext == ".bin" and f.with_suffix(".cue").exists():
                        continue

                    stat = f.stat()
                    size_mb = round(stat.st_size / (1024 * 1024), 1)
                    if size_mb < 5.0:
                        continue

                    # Typical CD/DVD lossless compression achieves ~55-60% savings
                    compression_ratio = 0.42
                    projected_mb = round(size_mb * compression_ratio, 1)
                    saved_mb = round(size_mb - projected_mb, 1)

                    total_current_mb += size_mb
                    total_projected_mb += projected_mb

                    candidates.append({
                        "game_id": f"disc_{plat}_{f.stem[:12]}",
                        "title": f.stem.replace("_", " "),
                        "platform": plat,
                        "current_format": ext.upper().replace(".", "") or "ISO",
                        "target_format": "CHD (MAME / Chdman)",
                        "current_size_mb": size_mb,
                        "projected_size_mb": projected_mb,
                        "potential_savings_mb": saved_mb,
                        "file_path": str(f)
                    })

        # Also scan GameCube & Wii uncompressed disc images (.iso, .gcm, .wbfs) for RVZ
        if dolphintool_path:
            for plat in ["GameCube", "Wii"]:
                plat_dir = roms_base / plat
                if not plat_dir.exists():
                    continue
                for f in plat_dir.iterdir():
                    if not f.is_file():
                        continue
                    ext = f.suffix.lower()
                    if ext in GC_WII_EXTS:
                        stat = f.stat()
                        size_mb = round(stat.st_size / (1024 * 1024), 1)
                        if size_mb < 5.0:
                            continue
                        compression_ratio = 0.48
                        projected_mb = round(size_mb * compression_ratio, 1)
                        saved_mb = round(size_mb - projected_mb, 1)
                        total_current_mb += size_mb
                        total_projected_mb += projected_mb
                        candidates.append({
                            "game_id": f"disc_{plat}_{f.stem[:12]}",
                            "title": f.stem.replace("_", " "),
                            "platform": plat,
                            "current_format": ext.upper().replace(".", "") or "ISO",
                            "target_format": "RVZ (Dolphin Zstd)",
                            "current_size_mb": size_mb,
                            "projected_size_mb": projected_mb,
                            "potential_savings_mb": saved_mb,
                            "file_path": str(f)
                        })

    return {
        "status": "ready",
        "chdman_available": chdman_path is not None,
        "chdman_path": chdman_path,
        "dolphintool_available": dolphintool_path is not None,
        "dolphintool_path": dolphintool_path,
        "candidates_count": len(candidates),
        "total_current_gb": round(total_current_mb / 1024, 2),
        "total_projected_gb": round(total_projected_mb / 1024, 2),
        "total_potential_savings_gb": round((total_current_mb - total_projected_mb) / 1024, 2),
        "candidates": candidates,
        "message": "Found real disc candidates ready for compression." if candidates else "No uncompressed disc images (.iso, .cue, .gdi) found on /Volumes/ROMS. Download a PS1, PS2, Saturn, or Dreamcast disc game to compress it."
    }

@router.post("/convert")
def convert_rom(payload: Dict[str, Any] = Body(...)):
    """
    Executes real chdman lossless conversion on an uncompressed disc image.
    Verifies output file integrity and updates database records with real reclaimed space.
    """
    chdman = get_chdman_path()
    dolphintool = get_dolphintool_path()

    file_path = payload.get("file_path")
    game_id = payload.get("game_id")

    # If file_path not directly supplied, look up game in database
    target_path = None
    if file_path and os.path.exists(file_path):
        target_path = Path(file_path)
    elif game_id:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT id, title, platform, rom_format FROM games WHERE id = ?", (str(game_id),))
        game = c.fetchone()
        conn.close()
        if game:
            for ext in (CD_IMAGE_EXTS | GC_WII_EXTS):
                candidate = get_roms_dir() / game["platform"] / f"{game['title']}{ext}"
                if candidate.exists():
                    target_path = candidate
                    break

    if not target_path or not target_path.exists():
        raise HTTPException(status_code=404, detail="Source disc image file not found on disk")

    ext = target_path.suffix.lower()
    is_gc_wii = any(p in target_path.parts for p in ("GameCube", "Wii")) and ext in GC_WII_EXTS

    if is_gc_wii:
        if not dolphintool:
            raise HTTPException(
                status_code=500,
                detail="DolphinTool is required for GameCube/Wii RVZ compression and was not found."
            )
        out_path = target_path.with_suffix(".rvz")
        out_fmt = "rvz"
        cmd = [dolphintool, "convert", "-i", str(target_path), "-o", str(out_path), "-f", "rvz", "-b", "131072", "-c", "zstd", "-l", "5"]
    else:
        if not chdman:
            raise HTTPException(
                status_code=500,
                detail="chdman is not installed on this system. Install it via 'brew install rom-tools' to enable CHD compression."
            )
        out_path = target_path.with_suffix(".chd")
        out_fmt = "chd"
        cmd_type = "createcd"
        if "ps2" in str(target_path).lower() and ext == ".iso":
            cmd_type = "createdvd"
        cmd = [chdman, cmd_type, "-i", str(target_path), "-o", str(out_path), "-f"]
    
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0 or not out_path.exists():
            err_msg = proc.stderr.strip() or proc.stdout.strip() or f"Unknown {out_fmt.upper()} conversion error"
            raise HTTPException(status_code=500, detail=f"Compression failed: {err_msg}")

        old_size_bytes = target_path.stat().st_size
        new_size_bytes = out_path.stat().st_size

        old_size_mb = round(old_size_bytes / (1024 * 1024), 1)
        new_size_mb = round(new_size_bytes / (1024 * 1024), 1)
        reclaimed_mb = round(old_size_mb - new_size_mb, 1)

        delete_original = payload.get("delete_original", True)
        if delete_original and out_path.stat().st_size > 1024 * 100:
            try:
                target_path.unlink()
                if ext == ".cue":
                    bin_file = target_path.with_suffix(".bin")
                    if bin_file.exists():
                        bin_file.unlink()
            except Exception as del_err:
                print(f"[Compressor Cleanup Warning]: {del_err}")

        if game_id:
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("UPDATE games SET file_size_mb = ?, rom_format = ? WHERE id = ?", (new_size_mb, out_fmt, str(game_id)))
            conn.commit()
            conn.close()

        return {
            "status": "compressed",
            "game_id": game_id,
            "title": target_path.stem,
            "new_path": str(out_path),
            "original_size_mb": old_size_mb,
            "compressed_size_mb": new_size_mb,
            "reclaimed_mb": reclaimed_mb,
            "message": f"Successfully compressed '{target_path.stem}' to {out_fmt.upper()}! Reclaimed {reclaimed_mb} MB ({round((reclaimed_mb / old_size_mb)*100) if old_size_mb else 0}% savings)."
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Compression process failed: {str(e)}")

@router.post("/build-m3u")
def build_multi_disc_m3u(payload: Dict[str, Any] = Body(...)):
    """
    Merges multi-disc games (Disc 1, Disc 2, Disc 3) into a verified .m3u playlist file.
    """
    game_title = payload.get("title", "").strip()
    platform = payload.get("platform", "PS1")
    discs = payload.get("discs", [])

    if not game_title:
        raise HTTPException(status_code=400, detail="Game title is required")

    platform_dir = get_roms_dir() / platform
    platform_dir.mkdir(parents=True, exist_ok=True)

    safe_title = re.sub(r'[^a-zA-Z0-9\s-_]', '', game_title).strip()
    m3u_file = platform_dir / f"{safe_title}.m3u"

    if isinstance(discs, str):
        discs = [d.strip() for d in discs.split(",") if d.strip()]

    # Auto-discover real multi-disc files on disk if no explicit list was passed
    if not discs:
        title_key = safe_title.lower()
        discovered = []
        if platform_dir.exists():
            for f in sorted(platform_dir.iterdir()):
                if f.is_file() and f.suffix.lower() in {".chd", ".rvz", ".cue", ".iso", ".pbp", ".gdi"}:
                    if title_key and title_key in f.stem.lower():
                        discovered.append(f.name)
        discs = discovered

    # Verify every disc file physically exists on disk (no fabricated default filenames)
    verified_discs = []
    missing_discs = []
    for d in discs:
        d_path = Path(d) if os.path.isabs(d) else (platform_dir / d)
        if d_path.exists() and d_path.is_file():
            verified_discs.append(d_path.name if d_path.parent == platform_dir else str(d_path))
        else:
            missing_discs.append(d)

    if not verified_discs:
        detail_msg = (
            f"Disc file(s) not found in {platform_dir}: {', '.join(missing_discs)}"
            if missing_discs
            else f"No matching disc files (.chd, .cue, .iso, .rvz) for '{game_title}' found in {platform_dir}. Download the discs first."
        )
        raise HTTPException(status_code=400, detail=detail_msg)

    # Write verified M3U playlist file
    with open(m3u_file, "w", encoding="utf-8") as f:
        for d in verified_discs:
            f.write(f"{d}\n")

    return {
        "status": "created",
        "m3u_path": str(m3u_file),
        "discs_count": len(verified_discs),
        "discs": verified_discs,
        "message": f"Generated verified M3U Multi-Disc playlist for '{game_title}' with {len(verified_discs)} real disc(s)."
    }
