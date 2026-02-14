import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent


def run_command(args: list[str], cwd: Path | None = None) -> None:
    cwd = cwd or ROOT_DIR
    print(f"Running: {' '.join(args)} (cwd={cwd})")

    # On Windows, tools like npm are often distributed as .cmd files.
    # `CreateProcess` can't execute .cmd directly unless invoked via cmd.exe.
    if os.name == "nt":
        first = (args[0] or "").lower()
        if first.endswith(".cmd") or first.endswith(".bat"):
            # NOTE: cmd.exe quoting rules are tricky. The most reliable form is:
            #   cmd.exe /d /s /c ""C:\Path With Spaces\tool.cmd" arg1 arg2"
            # We therefore build a single command string and wrap it in quotes.
            command_str = subprocess.list2cmdline(args)
            args = ["cmd.exe", "/d", "/s", "/c", f"\"{command_str}\""]

    subprocess.check_call(args, cwd=str(cwd))


def resolve_tool(tool_name: str) -> str:
    """
    Resolve a CLI tool path for subprocess.

    On Windows, we try both the bare name and common wrappers (e.g. npm.cmd),
    and also fall back to a sibling of node.exe when PATH is polluted (e.g. some conda setups).
    """
    resolved = shutil.which(tool_name) or shutil.which(f"{tool_name}.cmd") or shutil.which(f"{tool_name}.exe")
    if resolved:
        return resolved

    if os.name == "nt":
        node_path = shutil.which("node") or shutil.which("node.exe")
        if node_path:
            candidate = Path(node_path).parent / f"{tool_name}.cmd"
            if candidate.exists():
                return str(candidate)

    raise FileNotFoundError(
        f"Required tool not found in PATH: {tool_name}. "
        f"Please install Node.js (includes npm) and restart your terminal."
    )


def resolve_npm_command() -> list[str]:
    """
    Resolve a runnable npm command for subprocess.

    Windows note:
    `npm` is commonly a .cmd wrapper. Invoking it via cmd.exe is fragile in some environments
    (stale drive working directory like `=F:` can cause `找不到网络路径` and run in the wrong cwd).
    To make packaging robust, prefer calling npm-cli.js via node.exe when available.
    """
    npm_path = resolve_tool("npm")
    if os.name != "nt":
        return [npm_path]

    npm_file = Path(npm_path)
    if npm_file.suffix.lower() in {".cmd", ".bat"}:
        node_path = resolve_tool("node")
        npm_cli = npm_file.parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
        if npm_cli.exists():
            return [node_path, str(npm_cli)]

    return [npm_path]


def build_frontend():
    print("--- Building Frontend ---")
    frontend_dir = ROOT_DIR / "frontend"
    if not frontend_dir.exists():
        print("Frontend directory not found!")
        sys.exit(1)

    npm_cmd = resolve_npm_command()
    
    # Install dependencies (prefer reproducible install when lockfile exists)
    if (frontend_dir / "package-lock.json").exists():
        try:
            run_command([*npm_cmd, "ci"], cwd=frontend_dir)
        except subprocess.CalledProcessError:
            print("[WARN] npm ci failed, falling back to npm install...")
            run_command([*npm_cmd, "install"], cwd=frontend_dir)
    else:
        run_command([*npm_cmd, "install"], cwd=frontend_dir)
    # Build
    run_command([*npm_cmd, "run", "build"], cwd=frontend_dir)

def prepare_backend_assets():
    print("--- Preparing Backend Assets ---")
    # Clean previous build
    backend_static = ROOT_DIR / "backend" / "static"
    if backend_static.exists():
        shutil.rmtree(backend_static)
        
    # Copy dist to backend/static
    frontend_dist = ROOT_DIR / "frontend" / "dist"
    if not frontend_dist.exists():
        print("Frontend build failed: dist not found")
        sys.exit(1)
        
    shutil.copytree(frontend_dist, backend_static)
    print(f"Copied frontend assets to {backend_static}")

def run_pyinstaller():
    print("--- Packaging with PyInstaller ---")

    # Ensure build dependencies are installed
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(ROOT_DIR / "backend" / "requirements.txt")])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Command arguments (note: app is a package under backend/; add backend/ to module search path)
    add_data = f"backend/static{os.pathsep}static"
    args: list[str] = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name", "WenShape",
        "--clean",
        "--noconfirm",
        "--paths",
        "backend",
        # Add backend/static directory to the bundle
        "--add-data",
        add_data,

        # 添加 config.yaml 到打包中（critical for frozen mode）
        "--add-data",
        f"backend/config.yaml{os.pathsep}.",

        # Hidden imports often missed by PyInstaller
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",

        # Entry point
        "backend/app/main.py",
    ]

    run_command(args, cwd=ROOT_DIR)
    
def finalize_package():
    print("--- Finalizing Package ---")
    dist_dir = ROOT_DIR / "dist" / "WenShape"
    if not dist_dir.exists():
        raise RuntimeError(f"PyInstaller output not found: {dist_dir}")

    # 1. Copy config.yaml (CRITICAL for EXE mode)
    # 注意：config.yaml 必须被打包，否则 EXE 版本会加载失败
    config_src = ROOT_DIR / "backend" / "config.yaml"
    if not config_src.exists():
        raise FileNotFoundError(f"config.yaml not found at: {config_src}")

    shutil.copy(config_src, dist_dir / "config.yaml")
    print(f"✓ Copied config.yaml to {dist_dir / 'config.yaml'}")

    # Verify config.yaml was actually copied
    if not (dist_dir / "config.yaml").exists():
        raise RuntimeError("Failed to copy config.yaml to dist directory")
    print(f"✓ Verified config.yaml exists in dist directory")

    # 2. Copy .env.example for safe configuration (prefer backend/.env.example)
    env_example_candidates = [
        ROOT_DIR / "backend" / ".env.example",
        ROOT_DIR / ".env.example",
    ]
    for env_example in env_example_candidates:
        if env_example.exists():
            shutil.copy(env_example, dist_dir / ".env.example")
            print(f"✓ Copied .env.example from: {env_example}")
            break

    # 3. Create a safe default .env for first run
    # Note: Do NOT set WENSHAPE_LLM_PROVIDER=mock here. Users configure LLM
    # profiles via the frontend UI; hardcoding mock makes those settings ignored.
    # The gateway already falls back to mock when no profiles are assigned.
    env_path = dist_dir / ".env"
    if not env_path.exists():
        env_path.write_text(
            "\n".join(
                [
                    "# Generated by build_release.py",
                    "# LLM providers are configured via the Settings page in the UI.",
                    # Desktop app: bind to loopback by default (safer + avoids confusing 0.0.0.0 URL).
                    "HOST=127.0.0.1",
                    "PORT=8000",
                    "DEBUG=False",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        print("✓ Created default .env")

    # Do NOT copy .env automatically to prevent secret leakage
    # env_src = Path("backend/.env")
    # if env_src.exists():
    #     shutil.copy(env_src, dist_dir / ".env")
    #     print("Copied .env")

    # 4. Create data folder
    (dist_dir / "data").mkdir(exist_ok=True)
    print(f"✓ Created data folder")

    print(f"\n✓ Build Complete! Output in: {dist_dir.absolute()}")

if __name__ == "__main__":
    os.chdir(str(ROOT_DIR))

    build_frontend()
    prepare_backend_assets()
    run_pyinstaller()
    finalize_package()
