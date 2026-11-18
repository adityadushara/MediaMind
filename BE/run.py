#!/usr/bin/env python3
"""
MediaMind — Backend & Unified Development Runner
================================================
Starts the MediaMind backend services (FastAPI API server and Background Worker)
in a single command. Can optionally also launch the frontend Next.js dev server.

Usage (from inside BE/ folder or project root):
    python run.py                   # Run backend (FastAPI + Worker)
    python run.py --frontend        # Run full stack (FastAPI + Worker + FE Next.js)
    python run.py --api-only        # Run API server only
    python run.py --worker-only     # Run Background Worker only
    python run.py --port 8000       # Custom API port
"""

import argparse
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

# Resolve base directories
BE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BE_DIR.parent
FE_DIR = ROOT_DIR / "FE"
if not FE_DIR.is_dir() and (ROOT_DIR / "frontend").is_dir():
    FE_DIR = ROOT_DIR / "frontend"


def find_python_executable(be_path: Path) -> str:
    """Find the virtualenv Python executable if available, else current sys.executable."""
    win_venv = be_path / "venv" / "Scripts" / "python.exe"
    if win_venv.is_file():
        return str(win_venv)

    posix_venv = be_path / "venv" / "bin" / "python"
    if posix_venv.is_file():
        return str(posix_venv)

    return sys.executable


processes = []
shutting_down = False


def kill_process_tree(proc: subprocess.Popen):
    """Cleanly terminate a process and any child processes it spawned."""
    if proc.poll() is not None:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            proc.terminate()
            proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def shutdown_all(signum=None, frame=None):
    """Handle graceful shutdown of all started processes."""
    global shutting_down
    if shutting_down:
        return
    shutting_down = True
    print("\n🛑 Stopping MediaMind backend services...")
    for name, proc in reversed(processes):
        print(f"   Stopping {name} (PID: {proc.pid})...")
        kill_process_tree(proc)
    print("✨ All services stopped cleanly.")
    sys.exit(0)


def stream_output(proc: subprocess.Popen, prefix: str):
    """Stream process stdout/stderr with an identifiable prefix."""
    try:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            print(f"{prefix} {line.rstrip()}", flush=True)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(
        description="MediaMind Backend Runner",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    default_host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
    default_port = int(os.environ.get("PORT", 8000))

    parser.add_argument(
        "--host",
        type=str,
        default=default_host,
        help="Host address for FastAPI server",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=default_port,
        help="Port for FastAPI server",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Disable auto-reload on code change for FastAPI",
    )
    parser.add_argument(
        "--frontend",
        "-f",
        action="store_true",
        help="Also launch the Next.js frontend development server",
    )
    parser.add_argument(
        "--api-only",
        action="store_true",
        help="Run only the FastAPI backend server (no worker)",
    )
    parser.add_argument(
        "--worker-only",
        action="store_true",
        help="Run only the background processing worker (no API)",
    )

    args = parser.parse_args()

    # Register signal handlers
    signal.signal(signal.SIGINT, shutdown_all)
    signal.signal(signal.SIGTERM, shutdown_all)

    python_exe = find_python_executable(BE_DIR)

    # Set up child environment
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    print("=" * 64)
    print("🚀  MediaMind Backend Runner")
    print(f"📁  BE Directory:  {BE_DIR}")
    print(f"🐍  Python Binary: {python_exe}")
    print("=" * 64)

    # 1. Start FastAPI API Server
    if not args.worker_only:
        uvicorn_cmd = [
            python_exe,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            args.host,
            "--port",
            str(args.port),
        ]
        if not args.no_reload:
            uvicorn_cmd.append("--reload")

        api_proc = subprocess.Popen(
            uvicorn_cmd,
            cwd=str(BE_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        processes.append(("FastAPI Server", api_proc))
        threading.Thread(
            target=stream_output,
            args=(api_proc, "[API]   "),
            daemon=True,
        ).start()
        print(f"✅  FastAPI Server started -> http://{args.host}:{args.port}")
        print(f"📖  API Swagger Docs       -> http://{args.host}:{args.port}/docs")

    # 2. Start Background Worker
    if not args.api_only:
        worker_cmd = [python_exe, "-m", "app.worker.runner"]
        worker_proc = subprocess.Popen(
            worker_cmd,
            cwd=str(BE_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        processes.append(("Worker", worker_proc))
        threading.Thread(
            target=stream_output,
            args=(worker_proc, "[WORKER]"),
            daemon=True,
        ).start()
        print("✅  Background Worker started (watching job queue)")

    # 3. Optional: Start Frontend Next.js Dev Server
    if args.frontend:
        if not FE_DIR.is_dir():
            print(f"⚠️  Frontend directory not found at {FE_DIR}. Skipping.")
        else:
            use_pnpm = (FE_DIR / "pnpm-lock.yaml").is_file()
            if use_pnpm and sys.platform == "win32":
                fe_bin = "pnpm.cmd"
            elif use_pnpm:
                fe_bin = "pnpm"
            elif sys.platform == "win32":
                fe_bin = "npm.cmd"
            else:
                fe_bin = "npm"

            fe_cmd = [fe_bin, "run", "dev"]
            fe_proc = subprocess.Popen(
                fe_cmd,
                cwd=str(FE_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace",
            )
            processes.append(("Frontend (Next.js)", fe_proc))
            threading.Thread(
                target=stream_output,
                args=(fe_proc, "[FE]    "),
                daemon=True,
            ).start()
            print("✅  Frontend Dev Server starting -> http://localhost:3000")

    print("=" * 64)
    print("Press Ctrl+C at any time to stop services.")
    print("=" * 64 + "\n", flush=True)

    try:
        while True:
            time.sleep(1)
            for name, proc in processes:
                code = proc.poll()
                if code is not None and not shutting_down:
                    print(f"\n⚠️  {name} exited unexpectedly with code {code}.")
                    shutdown_all()
    except KeyboardInterrupt:
        shutdown_all()


if __name__ == "__main__":
    main()
