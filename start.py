#!/usr/bin/env python3
"""
WenShape 一键启动脚本
Starts both backend and frontend services
"""

import subprocess
import sys
import time
import os
import platform
import socket
from typing import Tuple

def _pick_free_port(host: str, preferred: int, max_tries: int = 30) -> int:
    preferred = int(preferred or 0)
    for port in range(max(preferred, 1), max(preferred, 1) + max_tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind((host, port))
                return port
        except OSError:
            continue
    return preferred or 0

def pick_ports() -> Tuple[int, int]:
    host = "127.0.0.1"
    backend_preferred = int(os.environ.get("WENSHAPE_BACKEND_PORT") or os.environ.get("PORT") or 8000)
    frontend_preferred = int(os.environ.get("WENSHAPE_FRONTEND_PORT") or os.environ.get("VITE_DEV_PORT") or 3000)
    backend_port = _pick_free_port(host, backend_preferred) or backend_preferred
    frontend_port = _pick_free_port(host, frontend_preferred) or frontend_preferred
    return backend_port, frontend_port

def check_python():
    """Check if Python 3.10+ is available"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 10):
        print("[ERROR] Python 3.10+ is required")
        return False
    print(f"[OK] Python {version.major}.{version.minor}.{version.micro}")
    return True

def check_node():
    """Check if Node.js 18+ is available"""
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        version_str = result.stdout.strip()
        # Parse version like "v22.19.0"
        version_parts = version_str.lstrip('v').split('.')
        major = int(version_parts[0])
        if major < 18:
            print(f"[ERROR] Node.js 18+ is required, found {version_str}")
            return False
        print(f"[OK] Node.js {version_str}")
        return True
    except FileNotFoundError:
        print("[ERROR] Node.js is not installed or not in PATH")
        return False

def start_backend(backend_port: int):
    """Start backend service"""
    print("\n[1/2] Starting backend service...")
    backend_dir = os.path.join(os.path.dirname(__file__), 'backend')
    env = dict(os.environ)
    env["PORT"] = str(backend_port)
    env["WENSHAPE_BACKEND_PORT"] = str(backend_port)
    env["WENSHAPE_AUTO_PORT"] = "1"

    if platform.system() == 'Windows':
        # Windows: start in new window
        subprocess.Popen(
            ['cmd', '/k', 'run.bat'],
            cwd=backend_dir,
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        # Unix: start in background
        subprocess.Popen(
            ['bash', 'run.sh'],
            cwd=backend_dir,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    print(f"  Backend: http://localhost:{backend_port}")
    time.sleep(3)  # Give backend time to start
    return backend_port

def start_frontend(backend_port: int, frontend_port: int):
    """Start frontend service"""
    print("[2/2] Starting frontend service...")
    frontend_dir = os.path.join(os.path.dirname(__file__), 'frontend')
    env = dict(os.environ)
    env["VITE_DEV_PORT"] = str(frontend_port)
    env["WENSHAPE_FRONTEND_PORT"] = str(frontend_port)
    env["VITE_BACKEND_PORT"] = str(backend_port)
    env["WENSHAPE_BACKEND_PORT"] = str(backend_port)
    env["VITE_BACKEND_URL"] = env.get("VITE_BACKEND_URL") or f"http://localhost:{backend_port}"

    if platform.system() == 'Windows':
        # Windows: start in new window
        subprocess.Popen(
            ['cmd', '/k', 'run.bat'],
            cwd=frontend_dir,
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        # Unix: start in background
        subprocess.Popen(
            ['bash', 'run.sh'],
            cwd=frontend_dir,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    print(f"  Frontend: http://localhost:{frontend_port}")
    return frontend_port

def main():
    print("=" * 50)
    print("  WenShape - Context-Aware Novel Writing System")
    print("=" * 50)
    print()

    # Check requirements
    print("Checking requirements...")
    if not check_python():
        sys.exit(1)
    if not check_node():
        sys.exit(1)

    print()

    # Start services
    try:
        backend_port, frontend_port = pick_ports()
        backend_port = start_backend(backend_port)
        frontend_port = start_frontend(backend_port, frontend_port)

        print()
        print("=" * 50)
        print("  Services started successfully!")
        print("=" * 50)
        print()
        print("Access URLs:")
        print(f"  Frontend:   http://localhost:{frontend_port}")
        print(f"  Backend:    http://localhost:{backend_port}")
        print(f"  API Docs:   http://localhost:{backend_port}/docs")
        print()
        print("Tip: Close the service windows to stop the services.")
        print()

        # Keep script running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")

    except Exception as e:
        print(f"[ERROR] Failed to start services: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
