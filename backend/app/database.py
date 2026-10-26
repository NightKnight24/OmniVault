import sqlite3
import sys
import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional

DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "vault.db"

def ensure_db_exists():
    """
    If vault.db does not exist, automatically decompress vault.db.gz
    shipped in the repository.
    """
    if not DB_PATH.exists():
        gz_path = DB_DIR / "vault.db.gz"
        if gz_path.exists():
            import gzip, shutil
            print(f"-> [Database] Decompressing master catalog from {gz_path.name}...")
            with gzip.open(gz_path, "rb") as f_in:
                with open(DB_PATH, "wb") as f_out:
                    shutil.copyfileobj(f_in, f_out)
            print(f"-> [Database] Master catalog ready ({DB_PATH.stat().st_size // (1024 * 1024)} MB).")

def get_db_connection() -> sqlite3.Connection:
    ensure_db_exists()
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 60000;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    
    # Games table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT,
        platform TEXT NOT NULL,
        platform_name TEXT,
        genre TEXT,
        release_year INTEGER,
        developer TEXT,
        publisher TEXT,
        rating REAL DEFAULT 0.0,
        rating_count INTEGER DEFAULT 0,
        description TEXT,
        box_art_2d TEXT,
        box_art_3d TEXT,
        backdrop TEXT,
        trailer_url TEXT,
        screenshots TEXT, -- JSON array of URLs
        direct_download_url TEXT,
        magnet_uri TEXT,
        file_size_mb REAL DEFAULT 0.0,
        rom_format TEXT,
        is_featured INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Indices for high performance queries across tens of thousands of ROMs
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_genre ON games(genre);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_rating ON games(rating DESC);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_featured ON games(is_featured);")
    
    # Downloads table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        game_title TEXT NOT NULL,
        platform TEXT NOT NULL,
        filename TEXT NOT NULL,
        download_type TEXT DEFAULT 'direct',
        source_url TEXT,
        status TEXT DEFAULT 'queued', -- queued, downloading, paused, completed, error
        progress REAL DEFAULT 0.0,
        downloaded_bytes INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        speed TEXT DEFAULT '0 MB/s',
        eta TEXT DEFAULT '--',
        destination_path TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);")
    
    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Favorites table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS favorites (
        game_id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_favorites_game_id ON favorites(game_id);")

    # User Ratings & Reviews table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_ratings (
        game_id TEXT PRIMARY KEY,
        rating REAL NOT NULL,
        review TEXT DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_ratings_game_id ON user_ratings(game_id);")
    
    # Default settings
    if sys.platform == "win32":
        default_downloads_dir = "C:\\OmniVault\\ROMs"
    else:
        default_downloads_dir = "/Volumes/ROMS" if Path("/Volumes/ROMS").exists() else str(Path.home() / "Downloads" / "OmniVault")
    cursor.execute("""
    INSERT OR REPLACE INTO settings (key, value) VALUES ('download_dir', ?)
    """, (default_downloads_dir,))
    cursor.execute("""
    INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_extract', 'true')
    """)
    # Custom Indexer & Search Providers (Torznab / Newznab, etc.)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS custom_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'torznab',
        endpoint_url TEXT NOT NULL,
        api_key TEXT DEFAULT '',
        is_enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Custom Web Search URL Templates
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS custom_search_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url_template TEXT NOT NULL,
        description TEXT DEFAULT '',
        is_enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Themes table for Kodi / XBMC hybrid themes and AI generated palettes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_builtin INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 0,
        theme_data TEXT NOT NULL, -- JSON with colors, glows, backgrounds, font
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Seed default sample template if table is empty
    cursor.execute("SELECT COUNT(*) FROM custom_search_templates")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO custom_search_templates (id, name, url_template, description, is_enabled)
        VALUES ('tpl-duckduckgo', 'DuckDuckGo Preservation Search', 'https://duckduckgo.com/?q={title}+{platform}+preservation', 'General web search shortcut', 1)
        """)

    # Seed built-in themes
    cursor.execute("SELECT COUNT(*) FROM themes WHERE is_builtin = 1")
    if cursor.fetchone()[0] == 0:
        builtin_themes = [
            {
                "id": "kodi_hybrid",
                "name": "Kodi / XBMC Estuary Hybrid",
                "description": "Living-room 10-foot media center theme with deep navy, neon cyan, and cinematic charcoal.",
                "is_builtin": 1,
                "is_active": 1,
                "theme_data": json.dumps({
                    "id": "kodi_hybrid",
                    "accent": "#00d2ff",
                    "accentSecondary": "#0ea5e9",
                    "glow": "rgba(0, 210, 255, 0.45)",
                    "bgBase": "#070c16",
                    "bgCard": "#0c1527",
                    "bgCardHover": "#14223c",
                    "border": "rgba(0, 210, 255, 0.2)",
                    "textPrimary": "#f8fafc",
                    "textMuted": "#94a3b8",
                    "mode": "kodi",
                    "fontFamily": "Inter, sans-serif"
                })
            },
            {
                "id": "playstation_flow",
                "name": "PlayStation 5 Quantum Flow",
                "description": "Sony PlayStation universe aesthetic with cosmic midnight, quantum royal blue, and laser cyan highlights.",
                "is_builtin": 1,
                "is_active": 0,
                "theme_data": json.dumps({
                    "id": "playstation_flow",
                    "accent": "#0070d1",
                    "accentSecondary": "#00f0ff",
                    "glow": "rgba(0, 112, 209, 0.5)",
                    "bgBase": "#030814",
                    "bgCard": "#071228",
                    "bgCardHover": "#0d1f42",
                    "border": "rgba(0, 112, 209, 0.3)",
                    "textPrimary": "#ffffff",
                    "textMuted": "#8ea6c8",
                    "mode": "playstation",
                    "fontFamily": "Inter, sans-serif"
                })
            },
            {
                "id": "nintendo_horizon",
                "name": "Nintendo Horizon Hybrid",
                "description": "Switch Horizon living-room aesthetic with matte slate, signature scarlet red, and Joy-Con neon cyan.",
                "is_builtin": 1,
                "is_active": 0,
                "theme_data": json.dumps({
                    "id": "nintendo_horizon",
                    "accent": "#e60012",
                    "accentSecondary": "#00c3e3",
                    "glow": "rgba(230, 0, 18, 0.45)",
                    "bgBase": "#0b0d11",
                    "bgCard": "#14171e",
                    "bgCardHover": "#1d222c",
                    "border": "rgba(230, 0, 18, 0.25)",
                    "textPrimary": "#ffffff",
                    "textMuted": "#9ba3af",
                    "mode": "nintendo",
                    "fontFamily": "Inter, sans-serif"
                })
            },
            {
                "id": "xbox_velocity",
                "name": "Xbox Velocity Matrix",
                "description": "Carbon gunmetal, Matrix acid emerald green, and high-velocity digital accents.",
                "is_builtin": 1,
                "is_active": 0,
                "theme_data": json.dumps({
                    "id": "xbox_velocity",
                    "accent": "#107c10",
                    "accentSecondary": "#2fe70e",
                    "glow": "rgba(16, 124, 16, 0.5)",
                    "bgBase": "#080c09",
                    "bgCard": "#0f1811",
                    "bgCardHover": "#17261a",
                    "border": "rgba(16, 124, 16, 0.3)",
                    "textPrimary": "#f0fdf4",
                    "textMuted": "#86efac",
                    "mode": "xbox",
                    "fontFamily": "Inter, sans-serif"
                })
            },
            {
                "id": "sega_dreamcast",
                "name": "Sega 128-Bit Dream",
                "description": "Classic Sega heritage with Sonic royal blue, Dreamcast spiral orange, and crisp white geometry.",
                "is_builtin": 1,
                "is_active": 0,
                "theme_data": json.dumps({
                    "id": "sega_dreamcast",
                    "accent": "#ff6600",
                    "accentSecondary": "#0060a9",
                    "glow": "rgba(255, 102, 0, 0.45)",
                    "bgBase": "#060a12",
                    "bgCard": "#0c1524",
                    "bgCardHover": "#142138",
                    "border": "rgba(255, 102, 0, 0.25)",
                    "textPrimary": "#ffffff",
                    "textMuted": "#93c5fd",
                    "mode": "sega",
                    "fontFamily": "Inter, sans-serif"
                })
            },
            {
                "id": "cyberpunk_neo",
                "name": "Cyberpunk Neo-Vault",
                "description": "Ultra-vibrant synthwave aesthetic with hot magenta, laser cyan, and deep violet darkness.",
                "is_builtin": 1,
                "is_active": 0,
                "theme_data": json.dumps({
                    "id": "cyberpunk_neo",
                    "accent": "#ec4899",
                    "accentSecondary": "#06b6d4",
                    "glow": "rgba(236, 72, 153, 0.5)",
                    "bgBase": "#090514",
                    "bgCard": "#130a24",
                    "bgCardHover": "#1e1038",
                    "border": "rgba(236, 72, 153, 0.3)",
                    "textPrimary": "#fdf2f8",
                    "textMuted": "#f472b6",
                    "mode": "cyberpunk",
                    "fontFamily": "Chakra Petch, sans-serif"
                })
            },
            {
                "id": "crt_amber_arcade",
                "name": "Retro CRT Amber Arcade",
                "description": "Warm retro CRT phosphor amber, arcade cabinet obsidian, and nostalgic phosphor glow.",
                "is_builtin": 1,
                "is_active": 0,
                "theme_data": json.dumps({
                    "id": "crt_amber_arcade",
                    "accent": "#f59e0b",
                    "accentSecondary": "#fbbf24",
                    "glow": "rgba(245, 158, 11, 0.45)",
                    "bgBase": "#0a0804",
                    "bgCard": "#161208",
                    "bgCardHover": "#221c0e",
                    "border": "rgba(245, 158, 11, 0.25)",
                    "textPrimary": "#fffbeb",
                    "textMuted": "#fcd34d",
                    "mode": "retro_crt",
                    "fontFamily": "Chakra Petch, monospace"
                })
            }
        ]
        for t in builtin_themes:
            cursor.execute("""
            INSERT INTO themes (id, name, description, is_builtin, is_active, theme_data)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (t["id"], t["name"], t["description"], t["is_builtin"], t["is_active"], t["theme_data"]))
    
    conn.commit()
    conn.close()


def row_to_game_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if not row:
        return {}
    d = dict(row)
    if "screenshots" in d and d["screenshots"]:
        try:
            d["screenshots"] = json.loads(d["screenshots"])
        except Exception:
            d["screenshots"] = []
    else:
        d["screenshots"] = []
    return d
