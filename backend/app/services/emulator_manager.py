import os
import sys
import json
import time
import shutil
import re
import asyncio
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx
from ..database import get_db_connection

def _resolve_initial_emulators_dir() -> Path:
    try:
        from .storage_service import get_emulators_dir
        return get_emulators_dir()
    except Exception:
        if sys.platform == "win32":
            p = Path("C:/OmniVault/Emulators")
        else:
            p = Path("/Volumes/ROMS/Emulators")
        p.mkdir(parents=True, exist_ok=True)
        return p

def _resolve_initial_bios_dir() -> Path:
    try:
        from .storage_service import get_bios_dir
        return get_bios_dir()
    except Exception:
        if sys.platform == "win32":
            p = Path("C:/OmniVault/BIOS")
        else:
            p = Path("/Volumes/ROMS/BIOS")
        p.mkdir(parents=True, exist_ok=True)
        return p

EMULATORS_DIR = _resolve_initial_emulators_dir()
BIOS_DIR = _resolve_initial_bios_dir()

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Catalog of all bundled native emulators
SUPPORTED_EMULATORS: Dict[str, Dict[str, Any]] = {
    "dolphin": {
        "id": "dolphin",
        "name": "Dolphin Engine",
        "consoles": ["GameCube", "Wii"],
        "app_name": "Dolphin.app",
        "win_app_name": "Dolphin.exe",
        "win_subfolder": "Dolphin-x64",
        "description": "Full-speed Metal/Vulkan hardware-accelerated GameCube & Wii emulator.",
        "install_method": "homebrew_or_direct",
        "cask_name": "dolphin",
        "direct_url": "https://dl.dolphin-emu.org/builds/dolphin-latest.dmg",
        "win_direct_url": "https://dl.dolphin-emu.org/builds/dolphin-latest-x64.7z",
        "config_type": "ini",
        "config_rel_path": "Dolphin/Config/Dolphin.ini",
        "supports_portable": True
    },
    "cemu": {
        "id": "cemu",
        "name": "Cemu",
        "consoles": ["WiiU"],
        "app_name": "Cemu.app",
        "win_app_name": "Cemu.exe",
        "win_subfolder": "Cemu",
        "description": "Nintendo Wii U hardware-accelerated Metal/Vulkan emulator.",
        "install_method": "homebrew_or_direct",
        "cask_name": "cemu",
        "github_repo": "cemu-project/Cemu",
        "asset_pattern": "macos",
        "asset_pattern_win": "windows-x64",
        "config_type": "xml",
        "config_rel_path": "Cemu/settings.xml",
        "supports_portable": True
    },
    "lime3ds": {
        "id": "lime3ds",
        "name": "Lime3DS / Azahar",
        "consoles": ["3DS"],
        "app_name": "Lime3DS.app",
        "win_app_name": "lime3ds.exe",
        "win_subfolder": "Lime3DS",
        "description": "High-performance stereoscopic Nintendo 3DS emulator with GPU shaders.",
        "install_method": "github_release",
        "github_repo": "Lime3DS/Lime3DS",
        "asset_pattern": "macos-arm64",
        "asset_pattern_win": "windows-msvc",
        "config_type": "ini",
        "config_rel_path": "Lime3DS/config.ini",
        "supports_portable": True
    },
    "vita3k": {
        "id": "vita3k",
        "name": "Vita3K",
        "consoles": ["PSVita", "PSTV"],
        "app_name": "Vita3K.app",
        "win_app_name": "Vita3K.exe",
        "win_subfolder": "Vita3K",
        "description": "PlayStation Vita & PSTV native hardware emulator.",
        "install_method": "github_release",
        "github_repo": "Vita3K/Vita3K",
        "asset_pattern": "macos-arm64",
        "asset_pattern_win": "windows",
        "config_type": "yml",
        "config_rel_path": "Vita3K/config.yml",
        "supports_portable": True
    },
    "pcsx2": {
        "id": "pcsx2",
        "name": "PCSX2",
        "consoles": ["PS2"],
        "app_name": "PCSX2.app",
        "win_app_name": "pcsx2-qt.exe",
        "win_subfolder": "PCSX2",
        "description": "The definitive PlayStation 2 emulator with hardware graphics rendering.",
        "install_method": "homebrew_or_direct",
        "cask_name": "pcsx2",
        "github_repo": "PCSX2/pcsx2",
        "asset_pattern": "macos",
        "asset_pattern_win": "windows-x64",
        "direct_url": "https://github.com/PCSX2/pcsx2/releases/latest",
        "config_type": "ini",
        "config_rel_path": "PCSX2/inis/PCSX2.ini",
        "supports_portable": True
    },
    "rpcs3": {
        "id": "rpcs3",
        "name": "RPCS3",
        "consoles": ["PS3"],
        "app_name": "RPCS3.app",
        "win_app_name": "rpcs3.exe",
        "win_subfolder": "RPCS3",
        "description": "PlayStation 3 Cell multi-threaded emulator with native Vulkan graphics.",
        "install_method": "homebrew_or_direct",
        "cask_name": "rpcs3",
        "github_repo": "RPCS3/rpcs3-binaries-mac",
        "win_github_repo": "RPCS3/rpcs3-binaries-win",
        "asset_pattern": "macos.7z",
        "asset_pattern_win": "win64",
        "config_type": "yml",
        "config_rel_path": "RPCS3/config.yml",
        "supports_portable": True
    },
    "ryujinx": {
        "id": "ryujinx",
        "name": "Ryujinx / Eden",
        "consoles": ["Switch"],
        "app_name": "Ryujinx.app",
        "win_app_name": "Ryujinx.exe",
        "win_subfolder": "Ryujinx",
        "description": "Full-speed Nintendo Switch emulator with modern graphics backend.",
        "install_method": "homebrew_or_direct",
        "cask_name": "ryujinx",
        "github_repo": "Ryubing/Ryujinx",
        "asset_pattern": "macos_universal",
        "asset_pattern_win": "win_x64",
        "config_type": "json",
        "config_rel_path": "Ryujinx/Config.json",
        "supports_portable": True
    },
    "xemu": {
        "id": "xemu",
        "name": "xemu",
        "consoles": ["Xbox"],
        "app_name": "xemu.app",
        "win_app_name": "xemu.exe",
        "win_subfolder": "xemu",
        "description": "Original Xbox emulator with hardware-accelerated NV2A graphics emulation.",
        "install_method": "homebrew_or_direct",
        "cask_name": "xemu",
        "github_repo": "xemu-project/xemu",
        "asset_pattern": "macos-universal.zip",
        "asset_pattern_win": "xemu-win-x86_64.zip",
        "config_type": "toml",
        "config_rel_path": "xemu/xemu.toml",
        "supports_portable": True
    },
    "xenia": {
        "id": "xenia",
        "name": "Xenia Canary",
        "consoles": ["Xbox360"],
        "app_name": "xenia.app",
        "win_app_name": "xenia_canary.exe",
        "win_subfolder": "Xenia",
        "description": "High-speed Xbox 360 emulator with DirectX 12 / Vulkan translation.",
        "install_method": "github_release",
        "github_repo": "xenia-canary/xenia-canary-releases",
        "asset_pattern": "macos",
        "asset_pattern_win": "release.zip",
        "config_type": "toml",
        "config_rel_path": "Xenia/xenia.config.toml",
        "supports_portable": True
    },
    "shadps4": {
        "id": "shadps4",
        "name": "shadPS4 (Experimental)",
        "consoles": ["PS4"],
        "app_name": "shadPS4.app",
        "win_app_name": "shadPS4.exe",
        "win_subfolder": "shadPS4",
        "description": "Early-stage experimental PlayStation 4 emulator with Vulkan rendering.",
        "install_method": "github_release",
        "github_repo": "shadps4-emu/shadPS4",
        "asset_pattern": "macos",
        "asset_pattern_win": "win64-qt",
        "config_type": "ini",
        "config_rel_path": "shadPS4/config.ini",
        "supports_portable": True
    },
    "melonds": {
        "id": "melonds",
        "name": "melonDS",
        "consoles": ["NDS", "DSi"],
        "app_name": "melonDS.app",
        "win_app_name": "melonDS.exe",
        "win_subfolder": "melonDS",
        "description": "Accurate Nintendo DS & DSi emulator with full DSiWare NAND & camera support.",
        "install_method": "github_release",
        "github_repo": "melonDS-emu/melonDS",
        "asset_pattern": "macOS-universal.zip",
        "asset_pattern_win": "windows-x86_64.zip",
        "config_type": "ini",
        "config_rel_path": "melonDS/melonDS.ini",
        "supports_portable": True
    },
    "ppsspp": {
        "id": "ppsspp",
        "name": "PPSSPP",
        "consoles": ["PSP"],
        "app_name": "PPSSPPSDL.app",
        "win_app_name": "PPSSPPWindows64.exe",
        "win_subfolder": "PPSSPP",
        "description": "Full-speed PlayStation Portable emulator with 4K resolution upscaling.",
        "install_method": "homebrew_or_direct",
        "cask_name": "ppsspp-emulator",
        "github_repo": "hrydgard/ppsspp",
        "asset_pattern_win": "Windows",
        "config_type": "ini",
        "config_rel_path": "PPSSPP/ppsspp.ini",
        "supports_portable": True
    },
    "duckstation": {
        "id": "duckstation",
        "name": "DuckStation",
        "consoles": ["PS1"],
        "app_name": "DuckStation.app",
        "win_app_name": "duckstation-qt-x64.exe",
        "win_subfolder": "DuckStation",
        "description": "High-performance Sony PlayStation 1 emulator with Vulkan / D3D upscaling.",
        "install_method": "github_release",
        "github_repo": "stenzek/duckstation",
        "asset_pattern": "macos",
        "asset_pattern_win": "windows-x64",
        "config_type": "ini",
        "config_rel_path": "DuckStation/settings.ini",
        "supports_portable": True
    },
    "retroarch": {
        "id": "retroarch",
        "name": "RetroArch",
        "consoles": [
            "NES", "SNES", "Genesis", "SegaCD", "MasterSystem", "GameGear",
            "GB", "GBC", "GBA", "N64", "PS1", "Saturn", "Dreamcast",
            "NeoGeo", "Arcade", "Atari2600", "Atari7800", "ColecoVision", "3DO", "TG16"
        ],
        "app_name": "RetroArch.app",
        "win_app_name": "retroarch.exe",
        "win_subfolder": "RetroArch",
        "description": "Universal multi-system emulation suite powering 20+ classic consoles.",
        "install_method": "homebrew_or_direct",
        "cask_name": "retroarch",
        "win_direct_url": "https://buildbot.libretro.com/stable/1.19.1/windows/x86_64/RetroArch.7z",
        "config_type": "cfg",
        "config_rel_path": "RetroArch/retroarch.cfg",
        "supports_portable": True
    }
}

class EmulatorManager:
    """
    Unified manager for bundled native emulators on /Volumes/ROMS.
    Handles detection, 1-click updates, config injection, and execution without leaving OmniVault.
    """

    def __init__(self):
        self.emulators_dir = EMULATORS_DIR
        self.bios_dir = BIOS_DIR
        self.active_session: Optional[Dict[str, Any]] = None

    def get_active_session(self) -> Optional[Dict[str, Any]]:
        """Returns the currently active native emulator session."""
        return self.active_session

    def get_emulator_path(self, emu_id: str) -> Optional[Path]:
        """Looks for the emulator (.app on macOS, .exe on Windows) inside Emulators directory or system paths."""
        emu = SUPPORTED_EMULATORS.get(emu_id)
        if not emu:
            return None

        if sys.platform == "win32":
            win_exe = emu.get("win_app_name", f"{emu_id}.exe")
            subfolder = emu.get("win_subfolder", emu_id)

            candidates = [
                self.emulators_dir / win_exe,
                self.emulators_dir / subfolder / win_exe,
                self.emulators_dir / emu_id / win_exe,
                Path("C:/OmniVault/Emulators") / win_exe,
                Path("C:/OmniVault/Emulators") / subfolder / win_exe,
                Path("C:/OmniVault/Emulators") / emu_id / win_exe,
                Path("C:/Program Files") / emu["name"] / win_exe,
                Path("C:/Program Files") / subfolder / win_exe,
                Path("C:/Program Files (x86)") / emu["name"] / win_exe,
                Path("C:/Program Files (x86)") / subfolder / win_exe,
                Path(os.environ.get("LOCALAPPDATA", r"C:\Users\Public\AppData\Local")) / "Programs" / subfolder / win_exe,
                Path(os.environ.get("LOCALAPPDATA", r"C:\Users\Public\AppData\Local")) / subfolder / win_exe,
                Path(os.environ.get("APPDATA", r"C:\Users\Public\AppData\Roaming")) / subfolder / win_exe,
            ]
            for c in candidates:
                if c.exists() and c.is_file():
                    return c

            # Check recursive search in emulators_dir
            if self.emulators_dir.exists():
                for p in self.emulators_dir.rglob("*.exe"):
                    p_name = p.name.lower()
                    if p_name == win_exe.lower() or p.stem.lower() == emu_id.lower():
                        return p

            # Check PATH
            which_p = shutil.which(win_exe) or shutil.which(f"{emu_id}.exe")
            if which_p:
                return Path(which_p)

            return None

        # 1. Check /Volumes/ROMS/Emulators (Primary self-contained location)
        primary = self.emulators_dir / emu["app_name"]
        if primary.exists():
            return primary

        # 2. Check /Applications
        system_app = Path("/Applications") / emu["app_name"]
        if system_app.exists():
            return system_app

        # 3. Check partial wildcard match (e.g. PCSX2-v2.x.app, azahar.app, citra.app, suyu.app, eden.app)
        def _match_app(app_path: Path) -> bool:
            name_l = app_path.name.lower()
            if emu_id in name_l or emu["app_name"].lower().replace(".app", "") in name_l:
                return True
            if emu_id == "lime3ds" and any(k in name_l for k in ["azahar", "lime", "citra"]):
                return True
            if emu_id == "ryujinx" and any(k in name_l for k in ["ryujinx", "suyu", "eden"]):
                return True
            if emu_id == "xenia" and any(k in name_l for k in ["xenia", "canary"]):
                return True
            if emu_id == "shadps4" and "shadps4" in name_l:
                return True
            return False

        for app in self.emulators_dir.glob("*.app"):
            if _match_app(app):
                return app
        for app in Path("/Applications").glob("*.app"):
            if _match_app(app):
                return app

        return None

    async def get_all_status(self) -> List[Dict[str, Any]]:
        """Returns the status, install paths, and versions of all supported emulators."""
        statuses = []
        for emu_id, info in SUPPORTED_EMULATORS.items():
            path = self.get_emulator_path(emu_id)
            is_installed = path is not None

            # Get local version from Info.plist on macOS or CLI on Windows
            local_ver = "Unknown"
            if is_installed and path:
                if sys.platform == "win32":
                    local_ver = "Installed"
                    try:
                        p = subprocess.run([str(path), "--version"], capture_output=True, text=True, timeout=1.5, check=False)
                        if p.returncode == 0 and p.stdout.strip():
                            local_ver = p.stdout.strip().split("\n")[0][:40]
                    except Exception:
                        pass
                else:
                    plist = path / "Contents" / "Info.plist"
                    if plist.exists():
                        try:
                            cmd = ["/usr/bin/defaults", "read", str(plist), "CFBundleShortVersionString"]
                            p = subprocess.run(cmd, capture_output=True, text=True, check=False)
                            if p.returncode == 0 and p.stdout.strip():
                                local_ver = p.stdout.strip()
                        except Exception:
                            pass

            statuses.append({
                "id": emu_id,
                "name": info["name"],
                "consoles": info["consoles"],
                "is_installed": is_installed,
                "path": str(path) if path else None,
                "version": local_ver if is_installed else "Not Installed",
                "description": info["description"],
                "install_method": info["install_method"]
            })
        return statuses

    async def _install_essential_retroarch_cores_windows(self, ra_dir: Path):
        """Pre-downloads essential RetroArch .dll cores on Windows for 1-click play."""
        cores_dir = ra_dir / "cores"
        cores_dir.mkdir(parents=True, exist_ok=True)
        essential_cores = [
            "snes9x_libretro.dll.zip",
            "fceumm_libretro.dll.zip",
            "mgba_libretro.dll.zip",
            "genesis_plus_gx_libretro.dll.zip",
            "gambatte_libretro.dll.zip",
            "mupen64plus_next_libretro.dll.zip",
            "pcsx_rearmed_libretro.dll.zip",
            "fbneo_libretro.dll.zip"
        ]
        win_7z = [r"C:\OmniVault\bin\7z.exe", r"C:\Windows\System32\7z.exe"]
        cmd_7z = next((c for c in win_7z if os.path.exists(c)), "7z")

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for core_zip in essential_cores:
                core_url = f"https://buildbot.libretro.com/nightly/windows/x86_64/latest/{core_zip}"
                try:
                    resp = await client.get(core_url)
                    if resp.status_code == 200:
                        tmp_p = cores_dir / core_zip
                        tmp_p.write_bytes(resp.content)
                        subprocess.run([cmd_7z, "x", "-y", f"-o{str(cores_dir)}", str(tmp_p)], capture_output=True, check=False)
                        if tmp_p.exists():
                            tmp_p.unlink()
                except Exception:
                    pass

    async def install_or_update(self, emu_id: str) -> Dict[str, Any]:
        """
        1-Click download and install of native emulator directly into Emulators directory.
        Uses portable Windows binaries and GitHub releases on Windows, Homebrew/GitHub on macOS.
        """
        emu = SUPPORTED_EMULATORS.get(emu_id)
        if not emu:
            raise ValueError(f"Unknown emulator ID: {emu_id}")

        print(f"[EmulatorManager] Starting installation/update of {emu['name']}...")

        # Windows Installation Pathway
        if sys.platform == "win32":
            self.emulators_dir.mkdir(parents=True, exist_ok=True)
            temp_dir = Path("C:/OmniVault/temp")
            temp_dir.mkdir(parents=True, exist_ok=True)

            win_7z = [
                r"C:\OmniVault\bin\7z.exe",
                r"C:\Windows\System32\7z.exe",
                r"C:\Program Files\Python312-arm64\Scripts\7z.exe"
            ]
            cmd_7z = next((c for c in win_7z if os.path.exists(c)), shutil.which("7z.exe") or "7z")

            # 1. Direct Windows URL (e.g. RetroArch or Dolphin)
            win_direct = emu.get("win_direct_url")
            if win_direct:
                filename = win_direct.split("/")[-1]
                temp_file = temp_dir / filename
                print(f"[EmulatorManager Windows] Downloading {filename} from {win_direct}...")
                async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                    async with client.stream("GET", win_direct) as stream:
                        with open(temp_file, "wb") as f:
                            async for chunk in stream.aiter_bytes(chunk_size=65536):
                                f.write(chunk)

                target_dir = self.emulators_dir / emu.get("win_subfolder", emu_id)
                target_dir.mkdir(parents=True, exist_ok=True)
                if filename.endswith((".7z", ".zip")):
                    subprocess.run([cmd_7z, "x", "-y", f"-o{str(target_dir)}", str(temp_file)], capture_output=True, check=False)
                if temp_file.exists():
                    temp_file.unlink()

                # If RetroArch, automatically pre-fetch essential libretro cores
                if emu_id == "retroarch":
                    await self._install_essential_retroarch_cores_windows(target_dir)

                installed_path = self.get_emulator_path(emu_id)
                if installed_path:
                    return {
                        "status": "success",
                        "message": f"{emu['name']} installed directly into {installed_path}",
                        "path": str(installed_path)
                    }

            # 2. Check GitHub Releases for Windows assets
            repo = emu.get("win_github_repo") or emu.get("github_repo")
            if repo:
                try:
                    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                        api_url = f"https://api.github.com/repos/{repo}/releases/latest"
                        resp = await client.get(api_url, headers={"User-Agent": USER_AGENT})
                        if resp.status_code == 200:
                            data = resp.json()
                            assets = data.get("assets", [])
                            win_pattern = emu.get("asset_pattern_win", "windows").lower()
                            matched_asset = None
                            for a in assets:
                                a_name = a["name"].lower()
                                if any(x in a_name for x in [".exe", ".zip", ".7z"]) and (win_pattern in a_name or "win64" in a_name or "x86_64" in a_name):
                                    matched_asset = a
                                    break
                            if matched_asset:
                                dl_url = matched_asset["browser_download_url"]
                                asset_name = matched_asset["name"]
                                temp_file = temp_dir / asset_name
                                print(f"[EmulatorManager Windows] Downloading {asset_name} from {dl_url}...")
                                async with client.stream("GET", dl_url) as stream:
                                    with open(temp_file, "wb") as f:
                                        async for chunk in stream.aiter_bytes(chunk_size=65536):
                                            f.write(chunk)

                                target_dir = self.emulators_dir / emu.get("win_subfolder", emu_id)
                                target_dir.mkdir(parents=True, exist_ok=True)
                                if asset_name.endswith((".zip", ".7z")):
                                    subprocess.run([cmd_7z, "x", "-y", f"-o{str(target_dir)}", str(temp_file)], capture_output=True, check=False)
                                elif asset_name.endswith(".exe"):
                                    shutil.copy(temp_file, target_dir / asset_name)
                                if temp_file.exists():
                                    temp_file.unlink()

                                installed_path = self.get_emulator_path(emu_id)
                                if installed_path:
                                    return {
                                        "status": "success",
                                        "message": f"{emu['name']} installed directly into {installed_path}",
                                        "path": str(installed_path)
                                    }
                except Exception as ge:
                    print(f"[EmulatorManager Windows GitHub Error]: {ge}")

            raise RuntimeError(f"Could not automatically install {emu['name']} on Windows. Please place {emu.get('win_app_name')} inside {self.emulators_dir}.")

        method = emu.get("install_method", "homebrew_or_direct")

        # A) Try Homebrew with --appdir=/Volumes/ROMS/Emulators
        if method == "homebrew_or_direct" and emu.get("cask_name"):
            brew_cmd = "/opt/homebrew/bin/brew"
            if os.path.exists(brew_cmd):
                try:
                    cask = emu["cask_name"]
                    cmd = [brew_cmd, "install", "--cask", f"--appdir={str(self.emulators_dir)}", cask]
                    print(f"[EmulatorManager] Running: {' '.join(cmd)}")
                    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
                    if res.returncode == 0:
                        installed_path = self.get_emulator_path(emu_id)
                        if installed_path:
                            # Strip quarantine to allow silent execution
                            subprocess.run(["/usr/bin/xattr", "-d", "-r", "com.apple.quarantine", str(installed_path)], check=False)
                            return {
                                "status": "success",
                                "message": f"{emu['name']} installed successfully to {installed_path}",
                                "path": str(installed_path)
                            }
                except Exception as be:
                    print(f"[EmulatorManager Brew Error]: {be}")

        # B) GitHub Releases Direct Universal/ARM64 Asset Extraction
        if emu.get("github_repo"):
            repo = emu["github_repo"]
            try:
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                    api_url = f"https://api.github.com/repos/{repo}/releases/latest"
                    resp = await client.get(api_url, headers={"User-Agent": USER_AGENT})
                    if resp.status_code == 200:
                        data = resp.json()
                        assets = data.get("assets", [])
                        pattern = emu.get("asset_pattern", "macos").lower()
                        matched_asset = None
                        for a in assets:
                            a_name = a["name"].lower()
                            if emu_id == "lime3ds" and "libretro" in a_name:
                                continue
                            if pattern in a_name:
                                matched_asset = a
                                break

                        if matched_asset:
                            dl_url = matched_asset["browser_download_url"]
                            asset_name = matched_asset["name"]
                            temp_file = Path("/tmp") / asset_name
                            print(f"[EmulatorManager] Downloading {asset_name} from {dl_url}...")

                            # Download to temp
                            async with client.stream("GET", dl_url) as stream:
                                with open(temp_file, "wb") as f:
                                    async for chunk in stream.aiter_bytes(chunk_size=65536):
                                        f.write(chunk)

                            # Extract
                            if asset_name.endswith(".zip"):
                                shutil.unpack_archive(temp_file, self.emulators_dir)
                            elif asset_name.endswith(".dmg"):
                                # Mount DMG and copy .app
                                mount_p = Path("/Volumes/EmuMount")
                                mount_cmd = ["/usr/bin/hdiutil", "attach", str(temp_file), "-nobrowse", "-readonly"]
                                subprocess.run(mount_cmd, capture_output=True, check=False)
                                for mounted in Path("/Volumes").iterdir():
                                    if mounted.is_dir() and any(a.suffix == ".app" for a in mounted.glob("*.app")):
                                        for app in mounted.glob("*.app"):
                                            dest_app = self.emulators_dir / app.name
                                            if dest_app.exists():
                                                shutil.rmtree(dest_app)
                                            shutil.copytree(app, dest_app)
                                        subprocess.run(["/usr/bin/hdiutil", "detach", str(mounted)], capture_output=True, check=False)
                                        break
                            elif asset_name.endswith(".7z"):
                                cmd_7z = "/opt/homebrew/bin/7z" if os.path.exists("/opt/homebrew/bin/7z") else "7z"
                                subprocess.run([cmd_7z, "x", "-y", f"-o{str(self.emulators_dir)}", str(temp_file)], capture_output=True, check=False)

                            if temp_file.exists():
                                temp_file.unlink()

                            installed_path = self.get_emulator_path(emu_id)
                            if installed_path:
                                subprocess.run(["/usr/bin/xattr", "-d", "-r", "com.apple.quarantine", str(installed_path)], check=False)
                                return {
                                    "status": "success",
                                    "message": f"{emu['name']} installed directly into {installed_path}",
                                    "path": str(installed_path)
                                }
            except Exception as ge:
                print(f"[EmulatorManager GitHub Release Error]: {ge}")

        raise RuntimeError(f"Could not automatically install {emu['name']}. Please ensure Homebrew or Internet access is available.")

    def _resolve_active_mod_rom(self, game_path: str) -> str:
        """If an enabled mod has a synthesized shadow ROM in /Volumes/ROMS/.mod_cache, return it."""
        try:
            rom_p = Path(game_path)
            from .storage_service import get_mod_cache_dir
            mod_cache = get_mod_cache_dir()
            if not mod_cache.exists():
                return game_path
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT id, game_id FROM game_mods WHERE is_enabled = 1")
            enabled_mods = c.fetchall()
            conn.close()
            for m in enabled_mods:
                candidate = mod_cache / f"{m['game_id']}_{m['id']}_{rom_p.stem}_patched{rom_p.suffix}"
                if candidate.exists() and candidate.stat().st_size > 0:
                    return str(candidate)
        except Exception:
            pass
        return game_path

    def launch_game(self, game_path: str, platform: str, force: bool = False) -> Dict[str, Any]:
        """
        Launches the ROM (or its active patched shadow ROM from .mod_cache) in the
        assigned native emulator after verifying required BIOS/keys and syncing configs.
        """
        if not os.path.exists(game_path):
            raise FileNotFoundError(f"ROM file not found on disk: {game_path}")

        # Sync any uploaded BIOS/firmware/keys into emulator directories before checking
        try:
            self._sync_bios_to_emulators()
        except Exception:
            pass

        # Pre-launch safeguard: verify required system BIOS / decryption keys if strictly needed
        if not force:
            bios_check = self.check_platform_bios_requirement(platform)
            if bios_check.get("required") and not bios_check.get("ready"):
                return {
                    "status": "bios_required",
                    "platform": platform,
                    "missing_bios": bios_check.get("item"),
                    "message": bios_check.get("message")
                }

        effective_rom_path = self._resolve_active_mod_rom(game_path)

        # Map platform to preferred native emulator
        target_emu_id = None
        for emu_id, info in SUPPORTED_EMULATORS.items():
            if platform in info["consoles"]:
                target_emu_id = emu_id
                break

        if sys.platform == "win32":
            if not target_emu_id:
                try:
                    os.startfile(effective_rom_path)
                except Exception:
                    subprocess.Popen(["cmd.exe", "/c", "start", "", effective_rom_path], shell=True)
                return {"status": "dispatched", "method": "system_open", "path": effective_rom_path}

            emu_path = self.get_emulator_path(target_emu_id)
            if not emu_path:
                try:
                    os.startfile(effective_rom_path)
                except Exception:
                    subprocess.Popen(["cmd.exe", "/c", "start", "", effective_rom_path], shell=True)
                return {
                    "status": "dispatched",
                    "method": "system_default",
                    "note": f"{SUPPORTED_EMULATORS[target_emu_id]['name']} is not installed in OmniVault. Used Windows default file association."
                }

            print(f"[EmulatorManager Windows] Launching '{os.path.basename(effective_rom_path)}' via {emu_path}...")

            # Sync unified display/audio/hotkey settings before launching
            try:
                self._sync_configs_to_disk(self.get_unified_settings())
            except Exception:
                pass

            launch_args: List[str] = [effective_rom_path]
            if target_emu_id == "dolphin":
                launch_args = ["-b", "-e", effective_rom_path]
            elif target_emu_id == "cemu":
                launch_args = ["-f", "-g", effective_rom_path]
            elif target_emu_id == "pcsx2":
                launch_args = ["-fullscreen", "-batch", effective_rom_path]
            elif target_emu_id == "rpcs3":
                launch_args = ["--no-gui", effective_rom_path]
            elif target_emu_id in ("ryujinx", "xenia", "ppsspp"):
                launch_args = ["--fullscreen", effective_rom_path]
            elif target_emu_id == "xemu":
                launch_args = ["-full-screen", "-dvd_path", effective_rom_path]
            elif target_emu_id in ("lime3ds", "melonds", "vita3k"):
                launch_args = ["-f", effective_rom_path]
            elif target_emu_id == "retroarch":
                core_ext = ".dll"
                core_map = {
                    "NES": f"fceumm_libretro{core_ext}",
                    "SNES": f"snes9x_libretro{core_ext}",
                    "Genesis": f"genesis_plus_gx_libretro{core_ext}",
                    "SegaCD": f"genesis_plus_gx_libretro{core_ext}",
                    "MasterSystem": f"genesis_plus_gx_libretro{core_ext}",
                    "GameGear": f"genesis_plus_gx_libretro{core_ext}",
                    "GB": f"gambatte_libretro{core_ext}",
                    "GBC": f"gambatte_libretro{core_ext}",
                    "GBA": f"mgba_libretro{core_ext}",
                    "N64": f"mupen64plus_next_libretro{core_ext}",
                    "PS1": f"pcsx_rearmed_libretro{core_ext}",
                    "Arcade": f"fbneo_libretro{core_ext}",
                    "NeoGeo": f"fbneo_libretro{core_ext}",
                    "Atari2600": f"stella2014_libretro{core_ext}",
                    "Atari7800": f"prosystem_libretro{core_ext}",
                    "Saturn": f"mednafen_saturn_libretro{core_ext}",
                    "Dreamcast": f"flycast_libretro{core_ext}",
                    "TG16": f"mednafen_pce_fast_libretro{core_ext}",
                    "3DO": f"opera_libretro{core_ext}",
                }
                core_name = core_map.get(platform, f"snes9x_libretro{core_ext}")
                core_candidates = [
                    emu_path.parent / "cores" / core_name,
                    self.emulators_dir / "cores" / core_name,
                    self.emulators_dir / "RetroArch" / "cores" / core_name,
                    Path("C:/OmniVault/Emulators/RetroArch/cores") / core_name,
                    Path("C:/OmniVault/Emulators/cores") / core_name,
                    Path(os.environ.get("APPDATA", "")) / "RetroArch" / "cores" / core_name,
                ]
                matched_core = next((c for c in core_candidates if c.exists()), None)
                if matched_core:
                    launch_args = ["-L", str(matched_core), "-f", effective_rom_path]
                else:
                    launch_args = ["-f", effective_rom_path]
            elif target_emu_id == "shadps4":
                launch_args = ["-g", effective_rom_path]

            subprocess.Popen([str(emu_path)] + launch_args, cwd=str(emu_path.parent))

            self.active_session = {
                "emu_id": target_emu_id,
                "emulator": SUPPORTED_EMULATORS[target_emu_id]["name"],
                "app_name": emu_path.name,
                "app_stem": emu_path.stem,
                "emulator_path": str(emu_path),
                "rom": os.path.basename(effective_rom_path),
                "rom_path": effective_rom_path,
                "platform": platform,
            }

            return {
                "status": "launched",
                "emulator": SUPPORTED_EMULATORS[target_emu_id]["name"],
                "emulator_path": str(emu_path),
                "rom": os.path.basename(effective_rom_path),
                "mod_active": effective_rom_path != game_path
            }

        if not target_emu_id:
            subprocess.run(["/usr/bin/open", effective_rom_path], check=False)
            return {"status": "dispatched", "method": "system_open", "path": effective_rom_path}

        emu_path = self.get_emulator_path(target_emu_id)
        if not emu_path:
            subprocess.run(["/usr/bin/open", effective_rom_path], check=False)
            return {
                "status": "dispatched",
                "method": "system_default",
                "note": f"{SUPPORTED_EMULATORS[target_emu_id]['name']} is not installed in OmniVault. Used system default."
            }

        print(f"[EmulatorManager] Launching '{os.path.basename(effective_rom_path)}' via {emu_path}...")

        # Sync unified display/audio/hotkey settings before launching
        try:
            self._sync_configs_to_disk(self.get_unified_settings())
        except Exception:
            pass

        # Build emulator-specific fullscreen direct-boot arguments so no desktop GUI menus appear
        launch_args: List[str] = [effective_rom_path]
        if target_emu_id == "dolphin":
            launch_args = ["-b", "-e", effective_rom_path]
        elif target_emu_id == "cemu":
            launch_args = ["-f", "-g", effective_rom_path]
        elif target_emu_id == "pcsx2":
            launch_args = ["-fullscreen", "-batch", effective_rom_path]
        elif target_emu_id == "rpcs3":
            launch_args = ["--no-gui", effective_rom_path]
        elif target_emu_id in ("ryujinx", "xenia", "ppsspp"):
            launch_args = ["--fullscreen", effective_rom_path]
        elif target_emu_id == "xemu":
            launch_args = ["-full-screen", "-dvd_path", effective_rom_path]
        elif target_emu_id in ("lime3ds", "melonds", "vita3k"):
            launch_args = ["-f", effective_rom_path]
        elif target_emu_id == "retroarch":
            core_map = {
                "NES": "fceumm_libretro.dylib",
                "SNES": "snes9x_libretro.dylib",
                "Genesis": "genesis_plus_gx_libretro.dylib",
                "SegaCD": "genesis_plus_gx_libretro.dylib",
                "MasterSystem": "genesis_plus_gx_libretro.dylib",
                "GameGear": "genesis_plus_gx_libretro.dylib",
                "GB": "gambatte_libretro.dylib",
                "GBC": "gambatte_libretro.dylib",
                "GBA": "mgba_libretro.dylib",
                "N64": "mupen64plus_next_libretro.dylib",
                "PS1": "pcsx_rearmed_libretro.dylib",
                "Arcade": "fbneo_libretro.dylib",
                "NeoGeo": "fbneo_libretro.dylib",
                "Atari2600": "stella2014_libretro.dylib",
                "Atari7800": "prosystem_libretro.dylib",
                "Saturn": "mednafen_saturn_libretro.dylib",
                "Dreamcast": "flycast_libretro.dylib",
                "TG16": "mednafen_pce_fast_libretro.dylib",
                "3DO": "opera_libretro.dylib",
            }
            core_name = core_map.get(platform, "snes9x_libretro.dylib")
            core_candidates = [
                Path("/Volumes/ROMS/Emulators/cores") / core_name,
                Path(os.path.expanduser("~/Library/Application Support/RetroArch/cores")) / core_name,
                Path("/Volumes/ROMS/Emulators/RetroArch.app/Contents/Resources/cores") / core_name
            ]
            matched_core = next((c for c in core_candidates if c.exists()), None)
            if matched_core:
                launch_args = ["-L", str(matched_core), "-f", effective_rom_path]
            else:
                launch_args = ["-f", effective_rom_path]
        elif target_emu_id == "shadps4":
            launch_args = ["-g", effective_rom_path]

        cmd = ["/usr/bin/open", "-a", str(emu_path), "--args"] + launch_args
        subprocess.run(cmd, check=False)

        self.active_session = {
            "emu_id": target_emu_id,
            "emulator": SUPPORTED_EMULATORS[target_emu_id]["name"],
            "app_name": emu_path.name,
            "app_stem": emu_path.stem,
            "emulator_path": str(emu_path),
            "rom": os.path.basename(effective_rom_path),
            "rom_path": effective_rom_path,
            "platform": platform,
        }

        return {
            "status": "launched",
            "emulator": SUPPORTED_EMULATORS[target_emu_id]["name"],
            "emulator_path": str(emu_path),
            "rom": os.path.basename(effective_rom_path),
            "mod_active": effective_rom_path != game_path
        }

    def _send_retroarch_udp(self, command: str) -> bool:
        """Sends a UDP network command (e.g. SAVE_STATE, LOAD_STATE, RESET, QUIT) to RetroArch on port 55355."""
        import socket
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(0.25)
            sock.sendto(f"{command.strip()}\n".encode("utf-8"), ("127.0.0.1", 55355))
            sock.close()
            return True
        except Exception:
            return False

    def control_active_emulator(self, action: str, value: Any = None) -> Dict[str, Any]:
        """
        Controls an active native emulator session (resume, quit, save_state, load_state, reset, volume)
        so the QuickMenuOverlay works across all standalone emulators.
        """
        action = (action or "").lower().strip()
        session = self.active_session

        if action == "volume" and value is not None:
            vol_int = max(0, min(100, int(value)))
            subprocess.run(
                ["/usr/bin/osascript", "-e", f"set volume output volume {vol_int}"],
                capture_output=True,
                check=False,
            )
            self.update_unified_settings({"emu_volume": str(vol_int)})
            return {"status": "ok", "action": "volume", "volume": vol_int}

        if action == "resume":
            if session and session.get("emulator_path"):
                subprocess.run(["/usr/bin/open", "-a", session["emulator_path"]], check=False)
                return {"status": "resumed", "emulator": session.get("emulator")}
            return {"status": "no_active_session"}

        if action == "quit":
            self._send_retroarch_udp("QUIT")
            if sys.platform == "win32":
                if session and session.get("app_name"):
                    subprocess.run(["taskkill", "/F", "/IM", session["app_name"]], capture_output=True, check=False)
                all_win_exes = [
                    "retroarch.exe", "Dolphin.exe", "Cemu.exe", "pcsx2-qt.exe", "pcsx2.exe",
                    "rpcs3.exe", "Ryujinx.exe", "lime3ds.exe", "citra-qt.exe", "Vita3K.exe",
                    "xemu.exe", "xenia.exe", "xenia_canary.exe", "shadps4.exe", "melonDS.exe",
                    "PPSSPPWindows64.exe", "duckstation-qt-x64.exe"
                ]
                for exe in all_win_exes:
                    subprocess.run(["taskkill", "/F", "/IM", exe], capture_output=True, check=False)
                self.active_session = None
                return {"status": "quit"}

            if session and session.get("app_stem"):
                try:
                    subprocess.run(
                        ["/usr/bin/osascript", "-e", f'tell application "{session["app_stem"]}" to quit'],
                        capture_output=True,
                        check=False,
                        timeout=1.0,
                    )
                except Exception:
                    pass

            # Terminate any running standalone emulator process
            all_emu_procs = [
                "RetroArch", "Dolphin", "Cemu", "PCSX2", "rpcs3", "RPCS3",
                "Ryujinx", "azahar", "Lime3DS", "Vita3K", "xemu", "xenia",
                "shadPS4", "shadps4", "shadps4-bin", "melonDS", "PPSSPPSDL"
            ]
            for proc in all_emu_procs:
                subprocess.run(["/usr/bin/killall", proc], capture_output=True, check=False)
                subprocess.run(["/usr/bin/pkill", "-9", "-f", proc], capture_output=True, check=False)

            self.active_session = None

            # Bring OmniVault back to the front
            try:
                subprocess.run(
                    ["/usr/bin/osascript", "-e", 'tell application "OmniVault" to activate'],
                    capture_output=True,
                    check=False,
                )
            except Exception:
                pass

            return {"status": "quit"}

        if action in ("save_state", "load_state", "reset"):
            ra_map = {
                "save_state": "SAVE_STATE",
                "load_state": "LOAD_STATE",
                "reset": "RESET",
            }
            self._send_retroarch_udp(ra_map[action])

            if session and session.get("emulator_path"):
                emu_id = session.get("emu_id", "")
                # Bring active native emulator forward briefly and dispatch its standard state hotkey
                # Keycodes on macOS: F1=122, F3=99, F5=96, F7=98, F9=101
                keycode = 96 if action == "save_state" else (98 if action == "load_state" else 101)
                if emu_id == "dolphin":
                    # Dolphin: Shift+F1 saves Slot 1, F1 loads Slot 1
                    script = (
                        f'tell application "{session["app_stem"]}" to activate\n'
                        'delay 0.15\n'
                        'tell application "System Events"\n'
                        + ('key code 122 using shift down\n' if action == "save_state" else 'key code 122\n')
                        + 'end tell'
                    )
                elif emu_id == "pcsx2":
                    # PCSX2: F1 saves state, F3 loads state
                    kc = 122 if action == "save_state" else 99
                    script = (
                        f'tell application "{session["app_stem"]}" to activate\n'
                        'delay 0.15\n'
                        f'tell application "System Events" to key code {kc}'
                    )
                else:
                    script = (
                        f'tell application "{session["app_stem"]}" to activate\n'
                        'delay 0.15\n'
                        f'tell application "System Events" to key code {keycode}'
                    )
                subprocess.run(["/usr/bin/osascript", "-e", script], capture_output=True, check=False)
            return {"status": "ok", "action": action, "emulator": session.get("emulator") if session else "RetroArch"}

        return {"status": "unknown_action", "action": action}

    def get_unified_settings(self) -> Dict[str, Any]:
        """Fetches unified display, audio, and BIOS settings from vault.db."""
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT key, value FROM settings WHERE key LIKE 'emu_%'")
        rows = c.fetchall()
        conn.close()

        defaults = {
            "emu_resolution_scale": "2x",  # 1x (Native), 2x (720p/1080p), 3x, 4x, 4k
            "emu_aspect_ratio": "16:9",   # 16:9, 4:3, Auto
            "emu_fullscreen": "true",
            "emu_vsync": "true",
            "emu_ai_upscaling_mode": "xbrz_6x",  # xbrz_6x, scalefx_ai, crt_royale, fsr_edge, native_crisp
            "emu_motion_smoothing": "true",     # 60/120 FPS motion interpolation
            "emu_runahead_lag": "true",          # Run-ahead 1-frame latency elimination
            "emu_volume": "85",
            "emu_audio_backend": "CoreAudio",
            "emu_audio_upscaling": "audiosr_48k", # audiosr_48k, sinc_resampler, msu1_lossless, hardware_dac
            "emu_audio_denoise": "true",
            "emu_bios_path": str(self.bios_dir),
            "emu_portable_mode": "true",
            "emu_auto_update": "true"
        }
        for r in rows:
            defaults[r["key"]] = r["value"]
        return defaults

    def update_unified_settings(self, new_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Saves unified settings to vault.db and propagates them to emulator config files."""
        conn = get_db_connection()
        c = conn.cursor()
        for k, v in new_settings.items():
            if k.startswith("emu_"):
                c.execute("""
                    INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """, (k, str(v)))
        conn.commit()
        conn.close()

        # Propagate to Dolphin, PCSX2, Lime3DS, etc.
        self._sync_configs_to_disk(new_settings)
        return {"status": "saved", "settings": new_settings}

    def open_folder(self, folder: str = "emulators") -> Dict[str, Any]:
        """Reveals the requested folder in macOS Finder."""
        from .storage_service import reveal_storage_path
        return reveal_storage_path(folder)

    def _upsert_ini_keys(self, file_path: Path, section: str, updates: Dict[str, Any]):
        """Non-destructively updates or appends INI/TOML section keys without wiping existing user settings."""
        import configparser
        parser = configparser.ConfigParser(interpolation=None)
        parser.optionxform = str  # Preserve case sensitivity
        if file_path.exists():
            try:
                parser.read(file_path, encoding="utf-8")
            except Exception:
                pass
        if not parser.has_section(section):
            parser.add_section(section)
        for k, v in updates.items():
            parser.set(section, str(k), str(v))
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            parser.write(f)

    def _upsert_kv_file(self, file_path: Path, updates: Dict[str, str], sep: str = " = "):
        """Non-destructively updates flat key-value files (such as retroarch.cfg)."""
        lines = []
        if file_path.exists():
            try:
                lines = file_path.read_text(encoding="utf-8").splitlines()
            except Exception:
                lines = []
        remaining = dict(updates)
        out_lines = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                out_lines.append(line)
                continue
            k = stripped.split("=", 1)[0].strip()
            if k in remaining:
                out_lines.append(f"{k}{sep}{remaining.pop(k)}")
            else:
                out_lines.append(line)
        for k, v in remaining.items():
            out_lines.append(f"{k}{sep}{v}")
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")

    def _sync_configs_to_disk(self, settings: Dict[str, Any]):
        """Non-destructively propagates unified settings into emulator configuration files."""
        res_scale = settings.get("emu_resolution_scale", "2x")
        is_fullscreen = settings.get("emu_fullscreen", "true") == "true"
        is_vsync = settings.get("emu_vsync", "true") == "true"
        runahead = settings.get("emu_runahead_lag", "true") == "true"
        upscale_mode = settings.get("emu_ai_upscaling_mode", "xbrz_6x")
        audio_upscale = settings.get("emu_audio_upscaling", "audiosr_48k")
        try:
            vol = int(str(settings.get("emu_volume", "85")).strip("'\" ") or 85)
        except Exception:
            vol = 85

        scale_int = 2
        if "1x" in res_scale: scale_int = 1
        elif "2x" in res_scale: scale_int = 2
        elif "3x" in res_scale: scale_int = 3
        elif "4x" in res_scale: scale_int = 4
        elif "4k" in res_scale: scale_int = 6

        # 0. RetroArch (retroarch.cfg) - Syncs runahead, vsync, fullscreen, resampler, smoothing, AI service, UDP control & BIOS system dir
        ra_cfg = Path.home() / "Library" / "Application Support" / "RetroArch" / "config" / "retroarch.cfg"
        try:
            self._upsert_kv_file(ra_cfg, {
                "system_directory": f'"{str(self.bios_dir)}"',
                "video_fullscreen": f'"{str(is_fullscreen).lower()}"',
                "video_vsync": f'"{str(is_vsync).lower()}"',
                "run_ahead_enabled": f'"{str(runahead).lower()}"',
                "run_ahead_frames": '"1"',
                "video_smooth": '"false"' if upscale_mode == "native_crisp" else '"true"',
                "audio_resampler": '"sinc"' if audio_upscale in ("audiosr_48k", "sinc_resampler") else '"nearest"',
                "audio_out_rate": '"48000"',
                "ai_service_enable": '"true"',
                "ai_service_url": '"http://127.0.0.1:19842/api/ai/retroarch-translate"',
                "ai_service_mode": '"0"',
                "network_cmd_enable": '"true"',
                "network_cmd_port": '"55355"',
            })
        except Exception:
            pass

        # 1. Dolphin GFX & Interface Config (non-destructive INI update)
        dolphin_dirs = [
            self.emulators_dir / "Dolphin.app" / "Contents" / "Resources" / "User" / "Config",
            Path.home() / "Library" / "Application Support" / "Dolphin" / "Config"
        ]
        for d_dir in dolphin_dirs:
            if d_dir.parent.exists():
                try:
                    self._upsert_ini_keys(d_dir / "GFX.ini", "Settings", {
                        "InternalResolution": scale_int,
                        "VSync": str(is_vsync).lower(),
                        "AspectRatio": 1 if settings.get("emu_aspect_ratio") == "16:9" else 2,
                    })
                    self._upsert_ini_keys(d_dir / "Dolphin.ini", "Display", {
                        "Fullscreen": "True" if is_fullscreen else "False",
                        "RenderToMain": "True",
                    })
                    self._upsert_ini_keys(d_dir / "Dolphin.ini", "Interface", {
                        "ConfirmStop": "False",
                    })
                except Exception:
                    pass

        # 2. PCSX2 & DuckStation Configs (non-destructive INI update)
        pcsx2_ini = Path.home() / "Library" / "Application Support" / "PCSX2" / "inis" / "PCSX2.ini"
        if pcsx2_ini.parent.exists():
            try:
                self._upsert_ini_keys(pcsx2_ini, "EmuCore/GS", {
                    "upscale_multiplier": scale_int,
                    "VsyncEnable": 1 if is_vsync else 0,
                    "AspectRatio": "16:9" if settings.get("emu_aspect_ratio") == "16:9" else "4:3",
                })
            except Exception:
                pass

        duck_ini = Path.home() / "Library" / "Application Support" / "DuckStation" / "settings.ini"
        if duck_ini.parent.exists():
            try:
                self._upsert_ini_keys(duck_ini, "GPU", {
                    "ResolutionScale": scale_int,
                    "VSync": str(is_vsync).lower(),
                })
            except Exception:
                pass

        # 3. melonDS Config
        melonds_ini = Path.home() / "Library" / "Application Support" / "melonDS" / "melonDS.ini"
        try:
            self._upsert_ini_keys(melonds_ini, "melonDS", {
                "DirectBoot": 1,
                "AudioVolume": vol,
                "3DInternalResolution": scale_int,
                "VSync": 1 if is_vsync else 0,
                "Fullscreen": 1 if is_fullscreen else 0,
            })
        except Exception:
            pass

        # 4. PPSSPP Config
        ppsspp_ini = Path.home() / ".config" / "ppsspp" / "PSP" / "SYSTEM" / "ppsspp.ini"
        try:
            self._upsert_ini_keys(ppsspp_ini, "Graphics", {
                "InternalResolution": scale_int,
                "FullScreen": str(is_fullscreen).lower(),
                "VSyncInterval": 1 if is_vsync else 0,
            })
        except Exception:
            pass

        # 5. Ryujinx Config (Switch) - already merges JSON dict
        ryu_dirs = [
            Path.home() / "Library" / "Application Support" / "Ryujinx",
            self.emulators_dir / "Ryujinx.app" / "Contents" / "Resources"
        ]
        for r_dir in ryu_dirs:
            if r_dir.exists():
                cfg_json = r_dir / "Config.json"
                try:
                    cur_data = {}
                    if cfg_json.exists():
                        try:
                            with open(cfg_json, "r") as f:
                                cur_data = json.load(f)
                        except Exception:
                            cur_data = {}
                    cur_data["res_scale"] = scale_int
                    cur_data["enable_vsync"] = is_vsync
                    cur_data["start_fullscreen"] = is_fullscreen
                    cur_data["audio_volume"] = vol / 100.0
                    with open(cfg_json, "w") as f:
                        json.dump(cur_data, f, indent=2)
                except Exception:
                    pass

        # 6. Synchronize Controller Autoconfigs across all native emulators
        try:
            self._sync_controller_configs()
        except Exception as ce:
            print(f"[Controller Sync Error]: {ce}")

    def _detect_connected_controllers(self) -> List[str]:
        """Scans macOS Bluetooth and USB busses for connected gamepads."""
        controllers = []
        try:
            out = subprocess.check_output(["/usr/sbin/system_profiler", "SPBluetoothDataType", "SPUSBDataType"], text=True, timeout=2.5)
            for line in out.splitlines():
                line_str = line.strip()
                if any(w in line_str for w in ("Controller:", "Gamepad", "DUALSHOCK", "DualSense", "Xbox", "Switch Pro", "8BitDo")):
                    clean_name = line_str.rstrip(":").strip()
                    if clean_name and clean_name not in ("Bluetooth Controller", "Controllers", "Minor Type: Gamepad", "Connected:") and clean_name not in controllers:
                        controllers.append(clean_name)
        except Exception:
            pass
        return controllers

    def _sync_controller_configs(self):
        """
        Automatically configures every supported native emulator with full gamepad bindings,
        proper controller profiles, and in-emulator Quick Menu hotkeys.
        """
        detected = self._detect_connected_controllers()
        app_support = Path.home() / "Library" / "Application Support"

        is_xbox = any("xbox" in c.lower() for c in detected)
        is_ps = any("dualshock" in c.lower() or "ps4" in c.lower() or "dualsense" in c.lower() or "ps5" in c.lower() for c in detected)
        is_switch = any("switch" in c.lower() for c in detected)

        # -------------------------------------------------------------
        # 0. RETROARCH (NES, SNES, Genesis, GBA, PS1, N64, Arcade, etc.)
        # -------------------------------------------------------------
        ra_dir = app_support / "RetroArch"
        ra_cfg = ra_dir / "config" / "retroarch.cfg"
        ra_autoconfig = ra_dir / "autoconfig"
        mfi_dir = ra_autoconfig / "mfi"
        mfi_dir.mkdir(parents=True, exist_ok=True)

        mfi_devices = [
            "MFi_Controller",
            "mFi Controller",
            "Extended Gamepad",
            "Xbox Wireless Controller",
            "DUALSHOCK 4 Wireless Controller",
            "DualSense Wireless Controller",
            "Wireless Controller",
            "My Ps4 Controller",
            "Nintendo Switch Pro Controller"
        ]
        for dev in detected:
            if dev not in mfi_devices:
                mfi_devices.append(dev)

        for dev_name in mfi_devices:
            safe_name = re.sub(r"[^a-zA-Z0-9_\- ]", "_", dev_name)
            cfg_path = mfi_dir / f"{safe_name}.cfg"
            cfg_content = f"""input_driver = "mfi"
input_device = "{dev_name}"
input_b_btn = "0"
input_y_btn = "1"
input_select_btn = "2"
input_start_btn = "3"
input_up_btn = "4"
input_down_btn = "5"
input_left_btn = "6"
input_right_btn = "7"
input_a_btn = "8"
input_x_btn = "9"
input_l_btn = "10"
input_r_btn = "11"
input_l3_btn = "14"
input_r3_btn = "15"
input_menu_toggle_btn = "16"
input_menu_toggle_gamepad_combo = "2"
input_l_x_plus_axis = "+0"
input_l_x_minus_axis = "-0"
input_l_y_plus_axis = "-1"
input_l_y_minus_axis = "+1"
input_r_x_plus_axis = "+2"
input_r_x_minus_axis = "-2"
input_r_y_plus_axis = "-3"
input_r_y_minus_axis = "+3"
input_l2_axis = "+4"
input_r2_axis = "+5"
input_b_btn_label = "A/Cross"
input_y_btn_label = "X/Square"
input_select_btn_label = "Select/Share"
input_start_btn_label = "Menu/Start"
input_up_btn_label = "D-Pad Up"
input_down_btn_label = "D-Pad Down"
input_left_btn_label = "D-Pad Left"
input_right_btn_label = "D-Pad Right"
input_a_btn_label = "B/Circle"
input_x_btn_label = "Y/Triangle"
input_l_btn_label = "L1"
input_r_btn_label = "R1"
input_l2_axis_label = "Left Trigger"
input_r2_axis_label = "Right Trigger"
input_l3_btn_label = "L3"
input_r3_btn_label = "R3"
input_menu_toggle_btn_label = "Guide/Home"
"""
            try:
                cfg_path.write_text(cfg_content, encoding="utf-8")
            except Exception:
                pass

        if ra_cfg.parent.exists():
            try:
                self._upsert_kv_file(ra_cfg, {
                    "input_autodetect_enable": '"true"',
                    "input_joypad_driver": '"mfi"',
                    "joypad_autoconfig_dir": f'"{str(ra_autoconfig)}"',
                    "input_menu_toggle_gamepad_combo": '"2"',  # L3 + R3 (universal Quick Menu combo)
                    "input_menu_toggle": '"f1"',
                    "input_enable_hotkey": '"nul"',
                    "input_enable_hotkey_btn": '"nul"',
                    "input_player1_b_btn": '"0"',
                    "input_player1_y_btn": '"1"',
                    "input_player1_select_btn": '"2"',
                    "input_player1_start_btn": '"3"',
                    "input_player1_up_btn": '"4"',
                    "input_player1_down_btn": '"5"',
                    "input_player1_left_btn": '"6"',
                    "input_player1_right_btn": '"7"',
                    "input_player1_a_btn": '"8"',
                    "input_player1_x_btn": '"9"',
                    "input_player1_l_btn": '"10"',
                    "input_player1_r_btn": '"11"',
                    "input_player1_l3_btn": '"14"',
                    "input_player1_r3_btn": '"15"',
                    "input_player1_menu_toggle_btn": '"16"',
                    "input_player1_l_x_plus_axis": '"+0"',
                    "input_player1_l_x_minus_axis": '"-0"',
                    "input_player1_l_y_plus_axis": '"-1"',
                    "input_player1_l_y_minus_axis": '"+1"',
                    "input_player1_r_x_plus_axis": '"+2"',
                    "input_player1_r_x_minus_axis": '"-2"',
                    "input_player1_r_y_plus_axis": '"-3"',
                    "input_player1_r_y_minus_axis": '"+3"',
                    "input_player1_l2_axis": '"+4"',
                    "input_player1_r2_axis": '"+5"',
                })
            except Exception:
                pass

        # -------------------------------------------------------------
        # 1. DOLPHIN (GameCube & Wii)
        # -------------------------------------------------------------
        dolphin_dirs = [
            self.emulators_dir / "Dolphin.app" / "Contents" / "Resources" / "User" / "Config",
            app_support / "Dolphin" / "Config"
        ]
        dolphin_target_dev = "SDL/0/GamePad"
        if is_xbox:
            dolphin_target_dev = "SDL/0/Xbox Wireless Controller"
        elif is_ps:
            dolphin_target_dev = "SDL/0/DUALSHOCK 4 Wireless Controller" if any("dualshock" in c.lower() for c in detected) else "SDL/0/Wireless Controller"

        for d_dir in dolphin_dirs:
            if d_dir.parent.exists():
                try:
                    d_dir.mkdir(parents=True, exist_ok=True)
                    gcpad_ini = d_dir / "GCPadNew.ini"
                    self._upsert_ini_keys(gcpad_ini, "GCPad1", {
                        "Device": dolphin_target_dev,
                        "Buttons/A": "`Button A` | `Button 0` | `X`",
                        "Buttons/B": "`Button B` | `Button 1` | `Z`",
                        "Buttons/X": "`Button X` | `Button 2` | `C`",
                        "Buttons/Y": "`Button Y` | `Button 3` | `S`",
                        "Buttons/Z": "`Shoulder R` | `Button 5` | `Button 10` | `D`",
                        "Buttons/Start": "`Start` | `Button 6` | `Return`",
                        "Main Stick/Up": "`Left Y+` | `Axis 1-` | `Up Arrow`",
                        "Main Stick/Down": "`Left Y-` | `Axis 1+` | `Down Arrow`",
                        "Main Stick/Left": "`Left X-` | `Axis 0-` | `Left Arrow`",
                        "Main Stick/Right": "`Left X+` | `Axis 0+` | `Right Arrow`",
                        "Main Stick/Calibration": "100.00",
                        "C-Stick/Up": "`Right Y+` | `Axis 3-` | `I`",
                        "C-Stick/Down": "`Right Y-` | `Axis 3+` | `K`",
                        "C-Stick/Left": "`Right X-` | `Axis 2-` | `J`",
                        "C-Stick/Right": "`Right X+` | `Axis 2+` | `L`",
                        "C-Stick/Calibration": "100.00",
                        "Triggers/L": "`Trigger L` | `Axis 4+` | `Q`",
                        "Triggers/R": "`Trigger R` | `Axis 5+` | `W`",
                        "Triggers/L-Analog": "`Trigger L` | `Axis 4+`",
                        "Triggers/R-Analog": "`Trigger R` | `Axis 5+`",
                        "D-Pad/Up": "`Pad N` | `Hat 0 N` | `T`",
                        "D-Pad/Down": "`Pad S` | `Hat 0 S` | `G`",
                        "D-Pad/Left": "`Pad W` | `Hat 0 W` | `F`",
                        "D-Pad/Right": "`Pad E` | `Hat 0 E` | `H`",
                        "Rumble/Motor": "`Motor L` | `Motor R`"
                    })

                    hotkeys_ini = d_dir / "Hotkeys.ini"
                    self._upsert_ini_keys(hotkeys_ini, "Hotkeys", {
                        "Device": dolphin_target_dev,
                        "General/Exit": "`F1` | `Button 5` | `Guide`",
                        "Emulation/Pause": "`F1` | `Button 5` | `Guide`",
                        "State/SaveState": "`F1`",
                        "State/LoadState": "`F3`"
                    })

                    prof_dir = d_dir / "Profiles" / "GCPad"
                    prof_dir.mkdir(parents=True, exist_ok=True)
                    (prof_dir / "OmniVault_Gamepad.ini").write_text(f"""[Profile]
Device = {dolphin_target_dev}
Buttons/A = `Button A` | `Button 0` | `X`
Buttons/B = `Button B` | `Button 1` | `Z`
Buttons/X = `Button X` | `Button 2` | `C`
Buttons/Y = `Button Y` | `Button 3` | `S`
Buttons/Z = `Shoulder R` | `Button 5` | `Button 10` | `D`
Buttons/Start = `Start` | `Button 6` | `Return`
Main Stick/Up = `Left Y+` | `Axis 1-`
Main Stick/Down = `Left Y-` | `Axis 1+`
Main Stick/Left = `Left X-` | `Axis 0-`
Main Stick/Right = `Left X+` | `Axis 0+`
Main Stick/Calibration = 100.00
C-Stick/Up = `Right Y+` | `Axis 3-`
C-Stick/Down = `Right Y-` | `Axis 3+`
C-Stick/Left = `Right X-` | `Axis 2-`
C-Stick/Right = `Right X+` | `Axis 2+`
C-Stick/Calibration = 100.00
Triggers/L = `Trigger L` | `Axis 4+`
Triggers/R = `Trigger R` | `Axis 5+`
D-Pad/Up = `Pad N` | `Hat 0 N`
D-Pad/Down = `Pad S` | `Hat 0 S`
D-Pad/Left = `Pad W` | `Hat 0 W`
D-Pad/Right = `Pad E` | `Hat 0 E`
Rumble/Motor = `Motor L` | `Motor R`
""", encoding="utf-8")
                except Exception:
                    pass

        # -------------------------------------------------------------
        # 2. PCSX2 (PS2)
        # -------------------------------------------------------------
        pcsx2_inis = app_support / "PCSX2" / "inis"
        try:
            pcsx2_inis.mkdir(parents=True, exist_ok=True)
            pcsx2_ini = pcsx2_inis / "PCSX2.ini"
            self._upsert_ini_keys(pcsx2_ini, "Pad1", {
                "Type": "DualShock2",
                "InvertLeftStick": "false",
                "InvertRightStick": "false",
                "Deadzone": "0.10",
                "Up": "SDL-0/DPadUp",
                "Right": "SDL-0/DPadRight",
                "Down": "SDL-0/DPadDown",
                "Left": "SDL-0/DPadLeft",
                "Triangle": "SDL-0/Y",
                "Circle": "SDL-0/B",
                "Cross": "SDL-0/A",
                "Square": "SDL-0/X",
                "Select": "SDL-0/Back",
                "Start": "SDL-0/Start",
                "L1": "SDL-0/LeftShoulder",
                "L2": "SDL-0/+LeftTrigger",
                "R1": "SDL-0/RightShoulder",
                "R2": "SDL-0/+RightTrigger",
                "L3": "SDL-0/LeftStick",
                "R3": "SDL-0/RightStick",
                "LUp": "SDL-0/-LeftY",
                "LRight": "SDL-0/+LeftX",
                "LDown": "SDL-0/+LeftY",
                "LLeft": "SDL-0/-LeftX",
                "RUp": "SDL-0/-RightY",
                "RRight": "SDL-0/+RightX",
                "RDown": "SDL-0/+RightY",
                "RLeft": "SDL-0/-RightX"
            })
            self._upsert_ini_keys(pcsx2_ini, "Hotkeys", {
                "TogglePause": "SDL-0/Guide",
                "SaveState": "F1",
                "LoadState": "F3"
            })
        except Exception:
            pass

        # -------------------------------------------------------------
        # 3. PPSSPP (PSP)
        # -------------------------------------------------------------
        ppsspp_sys = Path.home() / ".config" / "ppsspp" / "PSP" / "SYSTEM"
        try:
            ppsspp_sys.mkdir(parents=True, exist_ok=True)
            controls_ini = ppsspp_sys / "controls.ini"
            controls_content = """[ControlMapping]
Up = 1-19,10-19
Down = 1-20,10-20
Left = 1-21,10-21
Right = 1-22,10-22
Circle = 1-52,10-190
Cross = 1-54,10-189
Square = 1-29,10-191
Triangle = 1-47,10-188
Start = 1-62,10-197
Select = 1-66,10-196
L = 1-45,10-194
R = 1-51,10-195
An.Up = 1-37,10-4003
An.Down = 1-39,10-4002
An.Left = 1-38,10-4001
An.Right = 1-40,10-4000
Pause = 1-111,10-109,10-104,10-4034,10-198,10-110,10-199
Pause (no menu) = 1-138
SpeedToggle = 1-68
Rewind = 1-67
"""
            controls_ini.write_text(controls_content, encoding="utf-8")
        except Exception:
            pass

        # -------------------------------------------------------------
        # 4. RYUJINX (Switch)
        # -------------------------------------------------------------
        ryu_cfg = app_support / "Ryujinx" / "Config.json"
        if ryu_cfg.parent.exists():
            try:
                cur_data = {}
                if ryu_cfg.exists():
                    try:
                        with open(ryu_cfg, "r") as f:
                            cur_data = json.load(f)
                    except Exception:
                        cur_data = {}

                cur_data["input_config"] = [
                    {
                        "backend": "GamepadSDL2",
                        "id": "0",
                        "controller_type": "ProController",
                        "deadzone_left": 0.1,
                        "deadzone_right": 0.1,
                        "trigger_threshold": 0.5,
                        "left_joycon_stick": {
                            "joystick": "Left",
                            "invert_stick_x": False,
                            "invert_stick_y": False,
                            "rotate_90_cw": False
                        },
                        "right_joycon_stick": {
                            "joystick": "Right",
                            "invert_stick_x": False,
                            "invert_stick_y": False,
                            "rotate_90_cw": False
                        },
                        "left_joycon": {
                            "button_minus": "Minus",
                            "button_l": "LeftShoulder",
                            "button_zl": "LeftTrigger",
                            "button_sl": "Unbound",
                            "button_sr": "Unbound",
                            "dpad_up": "DpadUp",
                            "dpad_down": "DpadDown",
                            "dpad_left": "DpadLeft",
                            "dpad_right": "DpadRight",
                            "stick_button": "LeftStick"
                        },
                        "right_joycon": {
                            "button_plus": "Plus",
                            "button_r": "RightShoulder",
                            "button_zr": "RightTrigger",
                            "button_sl": "Unbound",
                            "button_sr": "Unbound",
                            "button_a": "A",
                            "button_b": "B",
                            "button_x": "X",
                            "button_y": "Y",
                            "stick_button": "RightStick"
                        },
                        "version": 1
                    }
                ]
                with open(ryu_cfg, "w") as f:
                    json.dump(cur_data, f, indent=2)
            except Exception:
                pass

        # -------------------------------------------------------------
        # 5. MELONDS (Nintendo DS)
        # -------------------------------------------------------------
        melonds_ini = app_support / "melonDS" / "melonDS.ini"
        try:
            self._upsert_ini_keys(melonds_ini, "melonDS", {
                "JoystickID": 0,
                "Joy_A": 0,
                "Joy_B": 1,
                "Joy_Select": 4,
                "Joy_Start": 6,
                "Joy_Right": 14,
                "Joy_Left": 13,
                "Joy_Up": 11,
                "Joy_Down": 12,
                "Joy_R": 10,
                "Joy_L": 9,
                "Joy_X": 2,
                "Joy_Y": 3
            })
        except Exception:
            pass

        # -------------------------------------------------------------
        # 6. RPCS3 (PS3)
        # -------------------------------------------------------------
        rpcs3_cfg_dir = app_support / "rpcs3" / "input_configs" / "global"
        try:
            rpcs3_cfg_dir.mkdir(parents=True, exist_ok=True)
            default_yml = rpcs3_cfg_dir / "Default.yml"
            default_yml.write_text("""Player 1 Input:
  Handler: SDL
  Device: "any"
  Config:
    Left Stick Left: "-LeftX"
    Left Stick Right: "+LeftX"
    Left Stick Down: "+LeftY"
    Left Stick Up: "-LeftY"
    Right Stick Left: "-RightX"
    Right Stick Right: "+RightX"
    Right Stick Down: "+RightY"
    Right Stick Up: "-RightY"
    D-Pad Up: "DpadUp"
    D-Pad Down: "DpadDown"
    D-Pad Left: "DpadLeft"
    D-Pad Right: "DpadRight"
    Cross: "A"
    Circle: "B"
    Square: "X"
    Triangle: "Y"
    Start: "Start"
    Select: "Back"
    PS: "Guide"
    L1: "LeftShoulder"
    R1: "RightShoulder"
    L2: "+LeftTrigger"
    R2: "+RightTrigger"
    L3: "LeftStick"
    R3: "RightStick"
""", encoding="utf-8")
        except Exception:
            pass

        # -------------------------------------------------------------
        # 7. AZAHAR / LIME3DS (3DS)
        # -------------------------------------------------------------
        azahar_ini = app_support / "Azahar" / "config" / "qt-config.ini"
        if azahar_ini.parent.exists():
            try:
                self._upsert_ini_keys(azahar_ini, "Controls", {
                    "profile": 0,
                    "profile_0\\name": "OmniVault Gamepad",
                    "profile_0\\button_a": '"engine:sdl,guid:0,port:0,button:0"',
                    "profile_0\\button_b": '"engine:sdl,guid:0,port:0,button:1"',
                    "profile_0\\button_x": '"engine:sdl,guid:0,port:0,button:2"',
                    "profile_0\\button_y": '"engine:sdl,guid:0,port:0,button:3"',
                    "profile_0\\button_l": '"engine:sdl,guid:0,port:0,button:9"',
                    "profile_0\\button_r": '"engine:sdl,guid:0,port:0,button:10"',
                    "profile_0\\button_zl": '"engine:sdl,guid:0,port:0,axis:4,direction:+"',
                    "profile_0\\button_zr": '"engine:sdl,guid:0,port:0,axis:5,direction:+"',
                    "profile_0\\button_start": '"engine:sdl,guid:0,port:0,button:6"',
                    "profile_0\\button_select": '"engine:sdl,guid:0,port:0,button:4"',
                    "profile_0\\button_home": '"engine:sdl,guid:0,port:0,button:5"',
                    "profile_0\\circle_pad": '"engine:sdl,guid:0,port:0,axis_x:0,axis_y:1"',
                    "profile_0\\c_stick": '"engine:sdl,guid:0,port:0,axis_x:2,axis_y:3"',
                    "profile_0\\dpad_up": '"engine:sdl,guid:0,port:0,button:11"',
                    "profile_0\\dpad_down": '"engine:sdl,guid:0,port:0,button:12"',
                    "profile_0\\dpad_left": '"engine:sdl,guid:0,port:0,button:13"',
                    "profile_0\\dpad_right": '"engine:sdl,guid:0,port:0,button:14"'
                })
            except Exception:
                pass

        # -------------------------------------------------------------
        # 8. XENIA CANARY (Xbox 360)
        # -------------------------------------------------------------
        xenia_dir = app_support / "Xenia"
        if xenia_dir.exists():
            try:
                xenia_cfg = xenia_dir / "xenia.config.toml"
                lines = xenia_cfg.read_text(encoding="utf-8").splitlines() if xenia_cfg.exists() else []
                content = "\n".join(lines)
                if "[HID]" not in content:
                    lines.append("\n[HID]\nhid = \"sdl\"\nguide_button = true")
                    xenia_cfg.write_text("\n".join(lines) + "\n", encoding="utf-8")
            except Exception:
                pass

        # -------------------------------------------------------------
        # 9. XEMU (Original Xbox)
        # -------------------------------------------------------------
        xemu_dir = app_support / "xemu" / "xemu"
        if xemu_dir.exists():
            try:
                xemu_cfg = xemu_dir / "xemu.toml"
                lines = xemu_cfg.read_text(encoding="utf-8").splitlines() if xemu_cfg.exists() else []
                content = "\n".join(lines)
                if "[input]" not in content:
                    lines.append("\n[input]\ncontroller_1_guid = \"\"")
                    xemu_cfg.write_text("\n".join(lines) + "\n", encoding="utf-8")
            except Exception:
                pass

        # -------------------------------------------------------------
        # 10. SHADPS4 (PS4)
        # -------------------------------------------------------------
        shadps4_dir = app_support / "shadPS4"
        if shadps4_dir.exists():
            try:
                shad_cfg = shadps4_dir / "config.json"
                data = {}
                if shad_cfg.exists():
                    try:
                        with open(shad_cfg, "r") as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                input_cfg = data.get("Input", {})
                input_cfg["use_unified_input_config"] = True
                input_cfg["motion_controls_enabled"] = True
                data["Input"] = input_cfg
                with open(shad_cfg, "w") as f:
                    json.dump(data, f, indent=2)
            except Exception:
                pass

        # -------------------------------------------------------------
        # 11. VITA3K (PS Vita)
        # -------------------------------------------------------------
        vita_dir = app_support / "Vita3K" / "Vita3K"
        if vita_dir.exists():
            try:
                vita_cfg = vita_dir / "config.yml"
                if not vita_cfg.exists():
                    vita_cfg.write_text("pref-path: \"\"\ncontroller-backend: sdl\n", encoding="utf-8")
            except Exception:
                pass

    def _sync_bios_to_emulators(self):
        """
        Automatically syncs BIOS, firmware, and decryption keys between /Volumes/ROMS/BIOS
        and each native emulator's macOS Application Support directory so users only ever
        have to drop files into the Setup Wizard once.
        """
        self.bios_dir.mkdir(parents=True, exist_ok=True)
        app_support = Path.home() / "Library" / "Application Support"
        pcsx2_bios_dir = app_support / "PCSX2" / "bios"
        ryu_sys_dir = app_support / "Ryujinx" / "system"
        ra_sys_dir = app_support / "RetroArch" / "system"
        melonds_dir = app_support / "melonDS"
        duck_bios_dir = app_support / "DuckStation" / "bios"
        xemu_dir = app_support / "xemu" / "xemu"

        # 1. Pull any existing BIOS/keys from emulator directories into /Volumes/ROMS/BIOS if not already there
        for ext_dir in (pcsx2_bios_dir, ryu_sys_dir, melonds_dir, duck_bios_dir):
            if ext_dir.exists():
                for f in ext_dir.iterdir():
                    if f.is_file() and not f.name.startswith("."):
                        dest = self.bios_dir / f.name
                        if not dest.exists():
                            try:
                                shutil.copy2(f, dest)
                            except Exception:
                                pass

        # 2. Propagate files from /Volumes/ROMS/BIOS into the respective emulator folders
        mcpx_file: Optional[Path] = None
        xbox_flash_file: Optional[Path] = None

        for f in self.bios_dir.iterdir():
            if not f.is_file() or f.name.startswith("."):
                continue
            low = f.name.lower()

            # Switch decryption keys -> Ryujinx/system
            if low in ("prod.keys", "title.keys"):
                try:
                    ryu_sys_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, ryu_sys_dir / f.name)
                except Exception:
                    pass

            # PS2 / PS1 BIOS -> PCSX2/bios, DuckStation/bios, RetroArch/system
            if "scph" in low or "ps2" in low or low in ("rom1.bin", "erom.bin", "ps1_rom.bin"):
                for target_dir in (pcsx2_bios_dir, duck_bios_dir, ra_sys_dir):
                    try:
                        target_dir.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(f, target_dir / f.name)
                    except Exception:
                        pass

            # NDS / DSi firmware -> melonDS & RetroArch/system
            if "bios7" in low or "bios9" in low or "firmware.bin" in low or "nand" in low:
                for target_dir in (melonds_dir, ra_sys_dir):
                    try:
                        target_dir.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(f, target_dir / f.name)
                    except Exception:
                        pass

            # Original Xbox -> xemu
            if "mcpx" in low:
                mcpx_file = f
            elif "complex" in low or "4627" in low or ("xbox" in low and low.endswith(".bin")):
                xbox_flash_file = f

            # Classic console BIOS (Sega CD, Saturn, Dreamcast, TG16, GBA, NeoGeo) -> RetroArch/system
            if any(k in low for k in ("syscard", "dc_boot", "dc_flash", "saturn", "sega_101", "mpr-", "bios_cd_", "gba_bios", "neogeo")):
                try:
                    ra_sys_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, ra_sys_dir / f.name)
                except Exception:
                    pass

        # Update PCSX2.ini [Folders] Bios path so PCSX2 also scans /Volumes/ROMS/BIOS directly
        pcsx2_ini = app_support / "PCSX2" / "inis" / "PCSX2.ini"
        if pcsx2_ini.parent.exists():
            try:
                self._upsert_ini_keys(pcsx2_ini, "Folders", {"Bios": str(self.bios_dir)})
            except Exception:
                pass

        # Update xemu.toml if Xbox bootrom/flashrom are present
        if mcpx_file or xbox_flash_file:
            try:
                xemu_dir.mkdir(parents=True, exist_ok=True)
                toml_path = xemu_dir / "xemu.toml"
                lines = toml_path.read_text(encoding="utf-8").splitlines() if toml_path.exists() else []
                if "[sys.files]" not in "\n".join(lines):
                    lines.append("\n[sys.files]")
                    if mcpx_file:
                        lines.append(f"bootrom_path = '{str(mcpx_file)}'")
                    if xbox_flash_file:
                        lines.append(f"flashrom_path = '{str(xbox_flash_file)}'")
                    toml_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            except Exception:
                pass

    def check_platform_bios_requirement(self, platform: str) -> Dict[str, Any]:
        """
        Checks if a platform strictly requires BIOS/firmware/keys to boot and whether they are ready.
        Prevents emulators from crashing or failing silently when required user files are missing.
        """
        status = self.scan_bios_status()
        items = status.get("items", {})
        app_support = Path.home() / "Library" / "Application Support"

        plat_map = {
            "PS2": "ps2_bios",
            "PS3": "ps3_firmware",
            "PSVita": "psvita_firmware",
            "PSTV": "psvita_firmware",
            "Switch": "switch_keys",
            "Xbox": "xbox_bios",
            "PS4": "ps4_firmware",
        }
        req_key = plat_map.get(platform)
        if not req_key or req_key not in items:
            return {"required": False, "ready": True, "platform": platform}

        item = items[req_key]
        is_ready = bool(item.get("present"))

        # Also check if firmware was already installed directly inside the emulator's internal storage
        if not is_ready:
            if req_key == "ps3_firmware":
                rpcs3_flash = app_support / "rpcs3" / "dev_flash" / "vsh"
                is_ready = rpcs3_flash.exists()
            elif req_key == "psvita_firmware":
                vita_os = app_support / "Vita3K" / "Vita3K" / "os0"
                is_ready = vita_os.exists()
            elif req_key == "switch_keys":
                ryu_keys = app_support / "Ryujinx" / "system" / "prod.keys"
                is_ready = ryu_keys.exists()
            elif req_key == "ps2_bios":
                pcsx2_bios = app_support / "PCSX2" / "bios"
                is_ready = pcsx2_bios.exists() and any(f.is_file() and not f.name.startswith(".") for f in pcsx2_bios.iterdir())

        return {
            "required": True,
            "ready": is_ready,
            "platform": platform,
            "item": item,
            "message": (
                f"{item['name']} is ready for {platform}."
                if is_ready
                else f"{platform} emulation requires {item['name']} ({item['target_spec']}). Drop this file in the First-Time Setup Wizard (Step 3: BIOS & Keys) or upload it below so {item['system']} can boot properly."
            ),
        }

    def scan_bios_status(self) -> Dict[str, Any]:
        """Inspects /Volumes/ROMS/BIOS (and synced emulator folders) for official system firmware and keys."""
        try:
            self._sync_bios_to_emulators()
        except Exception:
            pass
        bios_files = [f.name for f in self.bios_dir.iterdir() if f.is_file() and not f.name.startswith(".")]
        bios_files_lower = [f.lower() for f in bios_files]
        
        status = {
            "bios_directory": str(self.bios_dir),
            "files_found": len(bios_files),
            "items": {
                "ps2_bios": {
                    "id": "ps2_bios",
                    "name": "PlayStation 2 BIOS",
                    "system": "Sony PS2 (PCSX2)",
                    "present": any("scph" in b or "ps2" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "scph" in fl or "ps2" in fl],
                    "target_spec": "SCPH-39001.bin, SCPH-70012.bin, or SCPH-10000.bin",
                    "status_note": "Required for PCSX2 authentic boot"
                },
                "ps3_firmware": {
                    "id": "ps3_firmware",
                    "name": "PlayStation 3 Official Firmware (PUP)",
                    "system": "Sony PS3 (RPCS3)",
                    "present": any("ps3updat" in b or b.endswith(".pup") for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "ps3updat" in fl or fl.endswith(".pup")],
                    "target_spec": "PS3UPDAT.PUP (Sony Official Firmware)",
                    "status_note": "Required for RPCS3 Cell OS initialization"
                },
                "psvita_firmware": {
                    "id": "psvita_firmware",
                    "name": "PlayStation Vita System Firmware",
                    "system": "Sony PS Vita / PSTV (Vita3K)",
                    "present": any("psp2updat" in b or "vita" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "psp2updat" in fl or "vita" in fl],
                    "target_spec": "PSP2UPDAT.PUP & PSP2UPDAT_FONT.PUP",
                    "status_note": "Required for Vita3K LiveArea & OS fonts"
                },
                "switch_keys": {
                    "id": "switch_keys",
                    "name": "Nintendo Switch Decryption Keys",
                    "system": "Nintendo Switch",
                    "present": any("prod.keys" in b or "title.keys" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "prod.keys" in fl or "title.keys" in fl],
                    "target_spec": "prod.keys & title.keys",
                    "status_note": "Required for encrypted NSP & XCI decryption"
                },
                "dsi_nand": {
                    "id": "dsi_nand",
                    "name": "Nintendo DS & DSi ARM9/ARM7 Firmware",
                    "system": "Nintendo DS / DSi (melonDS)",
                    "present": any("bios7" in b or "bios9" in b or "firmware.bin" in b or "nand" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "bios7" in fl or "bios9" in fl or "firmware.bin" in fl or "nand" in fl],
                    "target_spec": "bios7.bin, bios9.bin, firmware.bin, dsi_nand.bin",
                    "status_note": "Required for DSiWare, Camera & WiFi emulation"
                },
                "xbox_bios": {
                    "id": "xbox_bios",
                    "name": "Original Xbox MCPX Boot ROM & Flash ROM",
                    "system": "Original Xbox (xemu)",
                    "present": any("mcpx" in b for b in bios_files_lower) and any("complex" in b or "4627" in b or "xbox" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "mcpx" in fl or "complex" in fl or "4627" in fl or "xbox" in fl],
                    "target_spec": "mcpx_1.0.bin & Complex_4627.bin (or bios.bin)",
                    "status_note": "Required for xemu to execute Xbox boot sequence"
                },
                "xbox360_nand": {
                    "id": "xbox360_nand",
                    "name": "Xbox 360 Dashboard & Media Assets",
                    "system": "Xbox 360 (Xenia)",
                    "present": any("360" in b or "xenia" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "360" in fl or "xenia" in fl],
                    "target_spec": "Optional system fonts & dashboard files",
                    "status_note": "Enhances dashboard and title compatibility in Xenia"
                },
                "switch_firmware": {
                    "id": "switch_firmware",
                    "name": "Nintendo Switch System Firmware (Registered)",
                    "system": "Nintendo Switch (Ryujinx)",
                    "present": any("firmware" in b or "switch_fw" in b or "registered" in b for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "firmware" in fl or "switch_fw" in fl or "registered" in fl],
                    "target_spec": "Firmware 17.x / 18.x NCA archive or Registered folder",
                    "status_note": "Required for Mii editor, system applets & high-compatibility titles"
                },
                "ps4_firmware": {
                    "id": "ps4_firmware",
                    "name": "PlayStation 4 System Recovery Firmware (PUP)",
                    "system": "Sony PS4 (shadPS4)",
                    "present": any("ps4" in b and (b.endswith(".pup") or "recovery" in b) for b in bios_files_lower),
                    "matched_files": [f for f, fl in zip(bios_files, bios_files_lower) if "ps4" in fl and (fl.endswith(".pup") or "recovery" in fl)],
                    "target_spec": "PS4UPDATE.PUP (System Recovery Software)",
                    "status_note": "Required for system libraries and modules on shadPS4"
                }
            }
        }
        return status

    def save_uploaded_bios(self, file_name: str, file_bytes: bytes) -> Dict[str, Any]:
        """Saves or extracts an uploaded BIOS/firmware file directly to /Volumes/ROMS/BIOS."""
        self.bios_dir.mkdir(parents=True, exist_ok=True)
        dest_path = self.bios_dir / file_name
        with open(dest_path, "wb") as f:
            f.write(file_bytes)

        # If it's a zip archive, unpack it automatically
        extracted_files = []
        if file_name.lower().endswith(".zip"):
            try:
                import zipfile
                with zipfile.ZipFile(dest_path, "r") as zf:
                    zf.extractall(self.bios_dir)
                    extracted_files = zf.namelist()
            except Exception as ze:
                print(f"[BIOS Zip Extract Error]: {ze}")

        status = self.scan_bios_status()
        return {
            "status": "success",
            "saved_file": file_name,
            "path": str(dest_path),
            "extracted_count": len(extracted_files),
            "bios_status": status
        }

    def get_setup_status(self) -> Dict[str, Any]:
        """Returns the initial setup / onboarding status of OmniVault."""
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT value FROM settings WHERE key = 'initial_setup_completed'")
        row = c.fetchone()
        conn.close()

        is_completed = (row["value"] == "true") if row else False

        # Disk usage of /Volumes/ROMS
        total_gb, free_gb, used_gb = 0, 0, 0
        try:
            total, used, free = shutil.disk_usage(str(self.emulators_dir))
            total_gb = round(total / (1024 ** 3), 1)
            free_gb = round(free / (1024 ** 3), 1)
            used_gb = round(used / (1024 ** 3), 1)
        except Exception:
            pass

        bios = self.scan_bios_status()
        installed_emus = [
            emu_id for emu_id in SUPPORTED_EMULATORS.keys()
            if self.get_emulator_path(emu_id) is not None
        ]

        from .storage_service import get_storage_config
        storage_cfg = get_storage_config()

        return {
            "initial_setup_completed": is_completed,
            "storage": {
                "base_dir": storage_cfg["directories"]["roms"]["path"],
                "roms_dir": storage_cfg["directories"]["roms"]["path"],
                "emulators_dir": storage_cfg["directories"]["emulators"]["path"],
                "bios_dir": storage_cfg["directories"]["bios"]["path"],
                "app_data_dir": storage_cfg["directories"]["app_data"]["path"],
                "total_gb": storage_cfg["directories"]["roms"]["total_gb"],
                "free_gb": storage_cfg["directories"]["roms"]["free_gb"],
                "used_gb": storage_cfg["directories"]["roms"]["used_gb"],
                "is_writable": storage_cfg["directories"]["roms"]["is_writable"],
                "mode": storage_cfg["mode"],
                "quick_defaults": storage_cfg["quick_defaults"],
                "detected_volumes": storage_cfg["detected_volumes"],
                "app_bundle": storage_cfg["app_bundle"],
                "directories": storage_cfg["directories"]
            },
            "installed_emulators": installed_emus,
            "total_supported_emulators": len(SUPPORTED_EMULATORS),
            "bios_summary": {
                "files_found": bios["files_found"],
                "ready_count": sum(1 for item in bios["items"].values() if item["present"]),
                "total_count": len(bios["items"])
            }
        }

    def complete_setup(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Saves user onboarding selections and marks initial setup as completed."""
        # Check if storage config updates were included
        if "storage" in payload and isinstance(payload["storage"], dict):
            from .storage_service import save_storage_config
            save_storage_config(payload["storage"])

        conn = get_db_connection()
        c = conn.cursor()
        c.execute("""
            INSERT INTO settings (key, value) VALUES ('initial_setup_completed', 'true')
            ON CONFLICT(key) DO UPDATE SET value = 'true'
        """)

        # Optional user initial choices
        for k in ["emu_resolution_scale", "emu_ai_upscaling_mode", "active_theme", "omnivault_ui_mode", "storage_setup_mode"]:
            if k in payload:
                c.execute("""
                    INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """, (k, str(payload[k])))

        conn.commit()
        conn.close()

        # Sync configs
        settings = self.get_unified_settings()
        self._sync_configs_to_disk(settings)

        return {"status": "success", "message": "Initial setup completed successfully!"}

emulator_manager = EmulatorManager()

