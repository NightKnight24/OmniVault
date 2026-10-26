#!/usr/bin/env python3
import sys
import os
import time
import subprocess
import webbrowser
import threading
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
VENV_BIN = BACKEND_DIR / ".venv" / "bin"
PYTHON_BIN = VENV_BIN / "python"
UVICORN_BIN = VENV_BIN / "uvicorn"

def main():
    print("==================================================")
    print("   🎮 OMNIVAULT • Classic ROM Store & Scraper")
    print("==================================================")
    
    # 1. Ensure backend virtualenv exists
    if not PYTHON_BIN.exists():
        print("-> Setting up Python environment...")
        subprocess.run(["uv", "venv"], cwd=BACKEND_DIR, check=True)
        subprocess.run(["uv", "pip", "install", "fastapi", "uvicorn[standard]", "httpx", "pydantic", "python-multipart"], cwd=BACKEND_DIR, check=True)

    # 2. Check if frontend dist exists, if not build it
    dist_dir = ROOT_DIR / "frontend" / "dist"
    if not dist_dir.exists():
        print("-> Building frontend assets...")
        subprocess.run(["npm", "run", "build"], cwd=ROOT_DIR / "frontend", check=True)

    # 3. Start server in background
    port = 8000
    server_cmd = [
        str(UVICORN_BIN),
        "app.main:app",
        "--host", "127.0.0.1",
        "--port", str(port),
        "--log-level", "warning"
    ]
    
    print(f"-> Starting OmniVault Server at http://127.0.0.1:{port} ...")
    server_proc = subprocess.Popen(server_cmd, cwd=BACKEND_DIR)

    # 4. Wait for server to become responsive
    time.sleep(1.2)

    url = f"http://127.0.0.1:{port}"
    print(f"-> Opening OmniVault Storefront: {url}")
    webbrowser.open(url)

    print("\n[OmniVault Running] Press Ctrl+C in this terminal to stop.")
    try:
        server_proc.wait()
    except KeyboardInterrupt:
        print("\n-> Shutting down OmniVault...")
        server_proc.terminate()
        server_proc.wait()
        print("-> Clean exit.")

if __name__ == "__main__":
    main()
