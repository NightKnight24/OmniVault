import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import init_db, get_db_connection, ensure_games_extended_columns, rebuild_fast_catalog_indexes, DB_PATH
from .scrapers.catalog_builder import populate_master_catalog
from .services.cloud_storage_service import _get_icloud_real_quota_gb
from .routers import games, scrape, downloads, providers, mirrors, compressor, storage, covers

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    init_db()
    # Populate comprehensive retro catalog across platforms and genres
    populate_master_catalog(DB_PATH)
    # Build composite SQLite indexes, normalized genre lookup, FTS5 search index & warm caches asynchronously
    ensure_games_extended_columns()
    rebuild_fast_catalog_indexes()
    _get_icloud_real_quota_gb(force_refresh=False)
    downloads._trigger_installed_refresh_bg()
    yield

app = FastAPI(
    title="OmniVault API",
    description="ROM Finder, Metadata Catalog & Download Manager",
    version="2.1.5",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_api_caching(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/covers/image"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response

app.include_router(games.router)
app.include_router(scrape.router)
app.include_router(downloads.router)
app.include_router(providers.router)
app.include_router(mirrors.router)
app.include_router(compressor.router)
app.include_router(storage.router)
app.include_router(covers.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "OmniVault"}

@app.get("/api/settings")
def get_settings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

# Mount frontend build if available for single-command desktop serving
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"API endpoint '/{full_path}' not found")
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")
