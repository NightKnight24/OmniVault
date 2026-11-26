import sqlite3
import sys
import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional

BUNDLE_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

def _resolve_writable_data_dir() -> Path:
    # Never write inside a signed macOS .app bundle (prevents macOS App Management / Provenance stalls & preserves Sealed Resources)
    if ".app/Contents/" in str(BUNDLE_DATA_DIR):
        app_support = Path.home() / "Library" / "Application Support" / "OmniVault" / "data"
        app_support.mkdir(parents=True, exist_ok=True)
        return app_support
    try:
        BUNDLE_DATA_DIR.mkdir(parents=True, exist_ok=True)
        probe = BUNDLE_DATA_DIR / ".write_probe"
        probe.write_text("ok")
        probe.unlink(missing_ok=True)
        return BUNDLE_DATA_DIR
    except OSError:
        fallback = Path.home() / "Library" / "Application Support" / "OmniVault" / "data"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback

DB_DIR = _resolve_writable_data_dir()
DB_PATH = DB_DIR / "vault.db"

def ensure_db_exists():
    """
    If vault.db does not exist or is empty, automatically restore from bundled vault.db
    or decompress vault.db.gz shipped in the repository.
    """
    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        import gzip, shutil
        bundled_db = BUNDLE_DATA_DIR / "vault.db"
        if bundled_db != DB_PATH and bundled_db.exists() and bundled_db.stat().st_size > 0:
            shutil.copy2(bundled_db, DB_PATH)
            return
        for gz_path in (DB_DIR / "vault.db.gz", BUNDLE_DATA_DIR / "vault.db.gz"):
            if gz_path.exists():
                print(f"-> [Database] Decompressing master catalog from {gz_path.name}...")
                with gzip.open(gz_path, "rb") as f_in:
                    with open(DB_PATH, "wb") as f_out:
                        shutil.copyfileobj(f_in, f_out)
                print(f"-> [Database] Master catalog ready ({DB_PATH.stat().st_size // (1024 * 1024)} MB).")
                break

def get_db_connection() -> sqlite3.Connection:
    ensure_db_exists()
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 60000;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    conn.execute("PRAGMA cache_size = -32768;")
    conn.execute("PRAGMA mmap_size = 268435456;")
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
    ensure_games_extended_columns(conn)
    
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

    # Cached Game Videos (Trailer & Gameplay YouTube IDs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS game_videos (
        game_id TEXT PRIMARY KEY,
        trailer_id TEXT,
        trailer_title TEXT,
        gameplay_id TEXT,
        gameplay_title TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
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
    # Custom Indexer & Search Providers (Torznab / JSON / RSS)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS custom_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'torznab',
        endpoint_url TEXT NOT NULL,
        api_key TEXT DEFAULT '',
        config_json TEXT DEFAULT '{}',
        is_enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Safe column migration for existing custom_providers tables
    cursor.execute("PRAGMA table_info(custom_providers)")
    prov_cols = {r[1] for r in cursor.fetchall()}
    if "config_json" not in prov_cols:
        cursor.execute("ALTER TABLE custom_providers ADD COLUMN config_json TEXT DEFAULT '{}'")

    # Custom BYOS Mirror & Scraper Sources (Zero hardcoded commercial/ROM sites)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS custom_mirror_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        adapter TEXT NOT NULL DEFAULT 'html_search',
        source_type TEXT DEFAULT 'User Mirror Source',
        description TEXT DEFAULT '',
        platforms TEXT DEFAULT '[]',
        search_template TEXT DEFAULT '',
        supports_direct_download INTEGER DEFAULT 0,
        config_json TEXT DEFAULT '{}',
        priority INTEGER DEFAULT 50,
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

    # Seed default sample template if table is empty
    cursor.execute("SELECT COUNT(*) FROM custom_search_templates")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO custom_search_templates (id, name, url_template, description, is_enabled)
        VALUES ('tpl-duckduckgo', 'DuckDuckGo Preservation Search', 'https://duckduckgo.com/?q={title}+{platform}+preservation', 'General web search shortcut', 1)
        """)

    # Seed single default open-preservation source (Internet Archive) once on initial setup/migration
    cursor.execute("SELECT value FROM settings WHERE key = 'default_archive_source_seeded'")
    if cursor.fetchone() is None:
        cursor.execute("""
        INSERT OR IGNORE INTO custom_mirror_sources (
            id, name, url, adapter, source_type, description, platforms,
            search_template, supports_direct_download, config_json, priority, is_enabled
        ) VALUES (
            'archive-org',
            'Internet Archive (Archive.org)',
            'https://archive.org/',
            'archive_org',
            'Open Preservation Library',
            'Default open-access preservation archive powered by the official Internet Archive public search & metadata API.',
            '["ALL"]',
            'https://archive.org/search.php?query={title}+{platform}',
            1,
            '{}',
            40,
            1
        )
        """)
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_archive_source_seeded', '1')")

    conn.commit()
    conn.close()


_EXTENDED_SCHEMA_READY_PATH: Optional[str] = None
_FTS5_AVAILABLE: Optional[bool] = None


def ensure_games_extended_columns(conn: Optional[sqlite3.Connection] = None, force: bool = False) -> None:
    global _EXTENDED_SCHEMA_READY_PATH, _FTS5_AVAILABLE
    db_key = str(DB_PATH)
    if not force and conn is None and _EXTENDED_SCHEMA_READY_PATH == db_key:
        return

    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cols = {r[1] for r in cursor.execute("PRAGMA table_info(games)").fetchall()}
        migrations = [
            ("genres_list", "TEXT DEFAULT ''"),
            ("esrb_rating", "TEXT DEFAULT ''"),
            ("players", "INTEGER DEFAULT 0"),
            ("coop", "TEXT DEFAULT ''"),
            ("release_date", "TEXT DEFAULT ''"),
            ("alternates", "TEXT DEFAULT ''"),
        ]
        for col_name, col_def in migrations:
            if col_name not in cols:
                cursor.execute(f"ALTER TABLE games ADD COLUMN {col_name} {col_def}")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_genre ON games(genre);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_rating ON games(rating DESC, rating_count DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_rating_full ON games(rating DESC, rating_count DESC, title ASC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform_rating ON games(platform, rating DESC, rating_count DESC, title ASC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform_title ON games(platform, title ASC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform_year ON games(platform, release_year DESC, title ASC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform_dev ON games(platform, developer);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform_pub ON games(platform, publisher);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_platform_esrb ON games(platform, esrb_rating);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_featured ON games(is_featured);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_year ON games(release_year DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_developer ON games(developer);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_publisher ON games(publisher);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_esrb ON games(esrb_rating);")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_genres (
            genre TEXT NOT NULL,
            game_id TEXT NOT NULL,
            PRIMARY KEY (genre, game_id)
        ) WITHOUT ROWID;
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_game_genres_game_id ON game_genres(game_id);")

        try:
            cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
                game_id UNINDEXED,
                title,
                alternates,
                developer,
                publisher,
                tokenize='unicode61 remove_diacritics 2'
            );
            """)
            _FTS5_AVAILABLE = True
        except Exception as fts_exc:
            _FTS5_AVAILABLE = False
            print(f"[Database FTS5 Fallback Note]: {fts_exc}")

        if own_conn:
            conn.commit()
        _EXTENDED_SCHEMA_READY_PATH = db_key
    finally:
        if own_conn and conn is not None:
            conn.close()


def rebuild_fast_catalog_indexes(conn: Optional[sqlite3.Connection] = None, force: bool = False) -> None:
    """Populates the normalized `game_genres` table and FTS5 `games_fts` index for sub-10ms filtering and search."""
    ensure_games_extended_columns(conn=conn, force=force)
    own_conn = conn is None
    if own_conn:
        conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM games")
        game_count = int(cursor.fetchone()[0] or 0)

        if not force:
            cursor.execute("SELECT value FROM settings WHERE key = 'fast_index_game_count'")
            row = cursor.fetchone()
            stored_count = int(row[0]) if row and str(row[0]).isdigit() else -1
            if stored_count == game_count:
                if game_count == 0:
                    return
                cursor.execute("SELECT 1 FROM game_genres LIMIT 1")
                has_gg = cursor.fetchone() is not None
                has_fts = True
                if _FTS5_AVAILABLE:
                    try:
                        cursor.execute("SELECT 1 FROM games_fts LIMIT 1")
                        has_fts = cursor.fetchone() is not None
                    except Exception:
                        has_fts = True
                if has_gg and has_fts:
                    return

        cursor.execute("DELETE FROM game_genres")
        if game_count > 0:
            cursor.execute("SELECT id, genre, genres_list FROM games")
            batch: List[tuple] = []
            for gid, raw_genre, raw_glist in cursor.fetchall():
                glist_str = str(raw_glist or "").strip()
                if glist_str:
                    tags = {t.strip() for t in glist_str.split("|") if t.strip()}
                elif raw_genre:
                    tags = {str(raw_genre).strip()}
                else:
                    tags = set()
                for tag in tags:
                    if tag and tag != "Uncategorized":
                        batch.append((tag, gid))
                if len(batch) >= 25000:
                    cursor.executemany(
                        "INSERT OR IGNORE INTO game_genres (genre, game_id) VALUES (?, ?)",
                        batch,
                    )
                    batch.clear()
            if batch:
                cursor.executemany(
                    "INSERT OR IGNORE INTO game_genres (genre, game_id) VALUES (?, ?)",
                    batch,
                )

        if _FTS5_AVAILABLE:
            try:
                cursor.execute("DELETE FROM games_fts")
                if game_count > 0:
                    cursor.execute("""
                    INSERT INTO games_fts(game_id, title, alternates, developer, publisher)
                    SELECT id, COALESCE(title, ''), COALESCE(alternates, ''), COALESCE(developer, ''), COALESCE(publisher, '')
                    FROM games
                    """)
            except Exception as fts_pop_exc:
                print(f"[Database FTS5 Populate Note]: {fts_pop_exc}")

        cursor.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('fast_index_game_count', ?)",
            (str(game_count),),
        )
        cursor.execute("ANALYZE;")
        if own_conn:
            conn.commit()
    finally:
        if own_conn and conn is not None:
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
    raw_genres = d.get("genres_list") or ""
    if raw_genres:
        parsed_genres = [g.strip() for g in str(raw_genres).split("|") if g.strip()]
    elif d.get("genre"):
        parsed_genres = [str(d["genre"]).strip()]
    else:
        parsed_genres = []
    d["genres"] = parsed_genres
    return d
