"""
WenShape FastAPI Application Entry Point
FastAPI 应用入口
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.utils.logger import get_logger
from app.routers import (
    projects_router,
    cards_router,
    canon_router,
    facts_router,
    drafts_router,
    session_router,
    config_router,
    proxy_router,
    text_chunks_router,
    evidence_router,
    bindings_router,
    memory_pack_router,
)
from app.routers.fanfiction import router as fanfiction_router
from app.routers.websocket import router as websocket_router
from app.routers.volumes import router as volumes_router

logger = get_logger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# Create FastAPI application / 创建 FastAPI 应用
app = FastAPI(
    title="WenShape API",
    description="Multi-Agent Novel Writing System / 多智能体小说写作系统",
    version="0.1.0",
    debug=settings.debug
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Global exception handler — prevents leaking internal details to clients
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return a safe 500 response."""
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# Configure CORS / 配置跨域
# Production-ready CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Dev: Vite dev server
        "http://localhost:8000",  # Prod: Packaged app
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        # Add your production domain here when deploying:
        # "https://yourdomain.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers / 注册路由
# Strategy: Dual Mount
# Mount at root "/" for Dev mode (where Vite proxy strips /api)
# Mount at "/api" for Prod/EXE mode (where frontend calls /api directly)
routers = [
    projects_router,
    cards_router,
    canon_router,
    facts_router,
    drafts_router,
    session_router,
    config_router,
    websocket_router,
    fanfiction_router,
    proxy_router,
    volumes_router,
    text_chunks_router,
    evidence_router,
    bindings_router,
    memory_pack_router,
]

for router in routers:
    app.include_router(router)                  # Dev: http://localhost:8000/projects
    app.include_router(router, prefix="/api")   # Prod: http://localhost:8000/api/projects





@app.get("/health")
async def health_check():
    """Health check endpoint / 健康检查"""
    from pathlib import Path
    data_dir = Path(settings.data_dir) if hasattr(settings, "data_dir") else Path("data")
    storage_ok = data_dir.exists() if data_dir else False

    return {
        "status": "ok",
        "version": app.version,
        "storage_accessible": storage_ok,
    }

@app.on_event("startup")
async def on_startup():
    """Startup event handler / 启动事件处理"""
    import sys
    import webbrowser
    import asyncio
    
    # Auto-open browser in a separate thread to not block startup
    # But webbrowser.open is usually fire-and-forget
    if getattr(sys, 'frozen', False):
        # Packaged mode: open a loopback URL (0.0.0.0 is only a bind address)
        url = f"http://127.0.0.1:{settings.port}"
        logger.info(f"Auto-opening browser at {url}")
        # Small delay to ensure server is ready
        async def open_browser():
            await asyncio.sleep(1.5)
            webbrowser.open(url)
        asyncio.create_task(open_browser())

# --- Static Files / SPA Support (Added for Packaging) ---
import sys
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

# Check where static files are located
if getattr(sys, 'frozen', False):
    # Running as PyInstaller Bundle
    base_path = getattr(sys, '_MEIPASS', Path(sys.executable).parent)
    static_dir = Path(base_path) / "static"
else:
    # Dev: Look for backend/static if it exists (for testing build script without freezing)
    static_dir = Path(__file__).parent.parent / "static"

if static_dir.exists():
    logger.info(f"Serving static files from: {static_dir}")
    
    # 1. Mount assets (css, js, images)
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")
    
    # 2. Serve Index at Root
    @app.get("/")
    async def serve_root():
        return FileResponse(static_dir / "index.html")

    # 3. Catch-all for SPA routes (Serve index.html)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Safety: If request asks for /api/..., and we reached here, it's a 404.
        # Don't return HTML, otherwise frontend crashes (SyntaxError).
        if full_path.startswith("api/") or full_path.startswith("api"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API Endpoint Not Found")

        # Check if file exists in static (e.g. favicon.ico)
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
            
        # Otherwise serve index.html for SPA routing
        return FileResponse(static_dir / "index.html")
else:
    logger.warning("Static directory not found. Running in API-only mode (Dev)")


if __name__ == "__main__":
    import uvicorn
    import multiprocessing
    import os
    import socket
    
    # Critical for Windows EXE to prevent infinite spawn loop
    multiprocessing.freeze_support()
    
    # Determine execution mode
    is_frozen = getattr(sys, 'frozen', False)

    # Packaged desktop app should bind to loopback by default to avoid confusing URLs (0.0.0.0)
    # and reduce unnecessary firewall prompts.
    bind_host = "127.0.0.1" if is_frozen else settings.host

    def _port_available(host: str, port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind((host, int(port)))
                return True
        except OSError:
            return False

    def _pick_port(host: str, preferred: int, max_tries: int = 20) -> int:
        base = int(preferred or 0)
        if base <= 0:
            return 8000
        for port in range(base, base + max_tries):
            if _port_available(host, port):
                return port
        return base

    auto_port = is_frozen or (str(os.getenv("WENSHAPE_AUTO_PORT", "")).strip().lower() in {"1", "true", "yes", "on"})
    host_for_check = bind_host
    chosen_port = settings.port
    if auto_port and not _port_available(host_for_check, chosen_port):
        new_port = _pick_port(host_for_check, chosen_port + 1)
        if new_port != chosen_port:
            logger.warning(f"Port {chosen_port} is in use. Switching to available port {new_port}.")
            chosen_port = new_port
            settings.port = chosen_port
    
    if is_frozen:
        # Prod/EXE: Run directly with app instance, NO RELOAD
        # Reloading in frozen mode causes infinite subprocess spawning
        logger.info("Running in Frozen (EXE) Mode")

        def _is_address_in_use(error: OSError) -> bool:
            # Windows: WinError 10048; Linux/macOS: errno 98/48
            winerror = getattr(error, "winerror", None)
            if winerror == 10048:
                return True
            if getattr(error, "errno", None) in {48, 98}:
                return True
            text = str(error).lower()
            return "address already in use" in text or "only one usage" in text

        attempt_port = chosen_port
        while True:
            try:
                settings.port = attempt_port
                uvicorn.run(
                    app,  # Pass app instance directly, not string
                    host=bind_host,
                    port=attempt_port,
                    reload=False,
                    log_level="info",
                )
                break
            except OSError as exc:
                if auto_port and _is_address_in_use(exc):
                    next_port = _pick_port(host_for_check, attempt_port + 1)
                    if next_port != attempt_port:
                        logger.warning(
                            "Port %s is in use. Switching to available port %s.",
                            attempt_port,
                            next_port,
                        )
                        attempt_port = next_port
                        continue

                # When launched by double-click, the console may close immediately.
                # Provide a clear error message instead of "flash exit".
                logger.error("Failed to start server on %s:%s: %s", bind_host, attempt_port, exc, exc_info=True)
                print("")
                print("========================================")
                print(" WenShape 启动失败 / Startup Failed")
                print("----------------------------------------")
                print(f"原因 / Reason: {exc}")
                print("建议 / Suggestion:")
                print("  1) 关闭占用端口的程序（常见：8000）。")
                print("  2) 重新运行后会自动尝试切换端口。")
                print("========================================")
                print("")
                try:
                    input("按回车键退出...")
                except Exception:
                    pass
                raise
    else:
        # Dev: Run with reload
        logger.info("Running in Dev Mode")
        uvicorn.run(
            "app.main:app",
            host=settings.host,
            port=chosen_port,
            reload=settings.debug
        )
