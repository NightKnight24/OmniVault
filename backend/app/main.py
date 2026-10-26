import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import init_db, get_db_connection, DB_PATH
from .scrapers.catalog_builder import populate_master_catalog
from .routers import games, scrape, downloads, ai, providers, cheats_engine, translation, mirrors, emulators, themes, achievements, saves, compressor, netplay, mods, storage, covers

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema
    init_db()
    # Populate comprehensive retro catalog across platforms and genres
    populate_master_catalog(DB_PATH)
    yield

app = FastAPI(
    title="OmniVault API",
    description="Classic ROM Storefront & Scraper Backend",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(scrape.router)
app.include_router(downloads.router)
app.include_router(ai.router)
app.include_router(providers.router)
app.include_router(cheats_engine.router)
app.include_router(translation.router)
app.include_router(mirrors.router)
app.include_router(emulators.router)
app.include_router(themes.router)
app.include_router(achievements.router)
app.include_router(saves.router)
app.include_router(compressor.router)
app.include_router(netplay.router)
app.include_router(mods.router)
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
