import os
import random
import time
import socket
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, Any, List, Optional
from ..database import get_db_connection
from ..services.emulator_manager import emulator_manager

router = APIRouter(prefix="/api/netplay", tags=["netplay"])


def _try_launch_retroarch_netplay(args: List[str]) -> bool:
    """Attempts to launch RetroArch with the specified netplay CLI arguments."""
    from ..services.emulator_manager import emulator_manager
    app_path = emulator_manager.get_emulator_path("retroarch")
    if app_path and app_path.exists():
        try:
            if sys.platform == "win32":
                subprocess.Popen([str(app_path)] + args, cwd=str(app_path.parent))
            else:
                subprocess.Popen(["/usr/bin/open", "-a", str(app_path), "--args"] + args)
            return True
        except Exception:
            pass
    return False

# Genuine in-memory active local netplay lobbies created by users
ACTIVE_LOBBIES: List[Dict[str, Any]] = []

def get_local_ip() -> str:
    """Gets the machine's local LAN IP address for direct P2P connections."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@router.get("/lobbies")
def get_lobbies():
    """Returns active peer-to-peer couch netplay lobbies created by players."""
    # Prune lobbies older than 3 hours
    now = time.time()
    valid_lobbies = [l for l in ACTIVE_LOBBIES if now - l.get("created_timestamp", now) < 10800]
    ACTIVE_LOBBIES.clear()
    ACTIVE_LOBBIES.extend(valid_lobbies)

    return {
        "status": "online",
        "local_ip": get_local_ip(),
        "total_active_rooms": len(ACTIVE_LOBBIES),
        "lobbies": ACTIVE_LOBBIES,
        "message": "Active local network lobbies ready." if ACTIVE_LOBBIES else "No active netplay rooms found. Click 'Host Match' to start a session."
    }

@router.post("/create")
def create_lobby(payload: Dict[str, Any] = Body(...)):
    """
    Creates a genuine local netplay session.
    Configures official RetroArch Netplay flags (--host --port 55435).
    """
    title = payload.get("title", "Retro Classic").strip()
    platform = payload.get("platform", "Arcade")
    core = payload.get("core", "FB Neo")
    host = payload.get("host", "Player_1").strip() or "Player_1"
    max_players = int(payload.get("max_players", 4))
    spectators = bool(payload.get("spectators", True))

    code_suffix = f"{random.randint(1000, 9999)}"
    room_code = f"OMNI-{code_suffix}"
    local_ip = get_local_ip()

    lobby = {
        "code": room_code,
        "title": title,
        "platform": platform,
        "core": core,
        "host": host,
        "host_ip": local_ip,
        "port": 55435,
        "players": 1,
        "max_players": max_players,
        "spectators": spectators,
        "created_at": time.strftime("%H:%M"),
        "created_timestamp": time.time()
    }

    ACTIVE_LOBBIES.insert(0, lobby)
    ra_args = ["--host", "--port", "55435", "--nick", host]
    launched = _try_launch_retroarch_netplay(ra_args)

    return {
        "status": "created",
        "room_code": room_code,
        "host_ip": local_ip,
        "lobby": lobby,
        "retroarch_launched": launched,
        "retroarch_args": ra_args,
        "message": f"Netplay room {room_code} hosted on {local_ip}:55435. Share your IP and room code with players on your LAN."
    }

@router.post("/join")
def join_lobby(payload: Dict[str, Any] = Body(...)):
    """
    Connects a client player to an active netplay room.
    Returns official RetroArch Netplay connection flags (--connect <ip> --port 55435).
    """
    room_code = payload.get("room_code", "").upper().strip()
    nickname = payload.get("nickname", "Player_2").strip() or "Player_2"
    target_ip = payload.get("host_ip", "").strip()

    lobby = next((l for l in ACTIVE_LOBBIES if l["code"] == room_code), None)
    
    if not lobby and not target_ip:
        raise HTTPException(
            status_code=404,
            detail=f"Room '{room_code}' was not found. Ensure the host has created the room or provide the host's direct IP address."
        )

    connect_host = lobby["host_ip"] if lobby else target_ip
    connect_title = lobby["title"] if lobby else "RetroArch Netplay"
    connect_core = lobby.get("core", "Universal Retro Core") if lobby else "Universal Retro Core"

    if lobby and lobby["players"] < lobby["max_players"]:
        lobby["players"] += 1

    ra_args = ["--connect", connect_host, "--port", "55435", "--nick", nickname]
    launched = _try_launch_retroarch_netplay(ra_args)

    return {
        "status": "connected",
        "room_code": room_code,
        "game_title": connect_title,
        "core": connect_core,
        "host_ip": connect_host,
        "assigned_player_slot": f"Player {lobby['players']}" if lobby else "Player 2",
        "retroarch_launched": launched,
        "retroarch_args": ra_args,
        "message": f"Ready to join {connect_title} hosted at {connect_host}:55435!"
    }
