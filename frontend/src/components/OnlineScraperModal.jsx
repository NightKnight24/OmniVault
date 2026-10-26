import React, { useState } from 'react';
import { X, Search, Compass, Plus, Loader2, Check, Sparkles, Database, Sliders, Magnet } from 'lucide-react';
import { scrapeSearch, importScrapedGame } from '../services/api';

const SCRAPER_PLATFORMS = [
  { id: 'SNES', label: 'Super Nintendo (SNES)' },
  { id: 'NES', label: 'NES 8-Bit' },
  { id: 'N64', label: 'Nintendo 64 (N64)' },
  { id: 'GBA', label: 'Game Boy Advance (GBA)' },
  { id: 'GBC', label: 'Game Boy Color (GBC)' },
  { id: 'GB', label: 'Game Boy (GB)' },
  { id: 'NDS', label: 'Nintendo DS (NDS)' },
  { id: '3DS', label: 'Nintendo 3DS' },
  { id: 'GameCube', label: 'Nintendo GameCube' },
  { id: 'Wii', label: 'Nintendo Wii' },
  { id: 'Switch', label: 'Nintendo Switch' },
  { id: 'Genesis', label: 'Sega Genesis / Mega Drive' },
  { id: 'SegaCD', label: 'Sega CD' },
  { id: 'Saturn', label: 'Sega Saturn' },
  { id: 'Dreamcast', label: 'Sega Dreamcast' },
  { id: 'MasterSystem', label: 'Sega Master System' },
  { id: 'GameGear', label: 'Sega Game Gear' },
  { id: 'PS1', label: 'PlayStation 1 (PS1)' },
  { id: 'PS2', label: 'PlayStation 2 (PS2)' },
  { id: 'PS3', label: 'PlayStation 3 (PS3)' },
  { id: 'PS4', label: 'PlayStation 4 (PS4)' },
  { id: 'PSP', label: 'PlayStation Portable (PSP)' },
  { id: 'PSVita', label: 'PlayStation Vita' },
  { id: 'Xbox', label: 'Original Xbox' },
  { id: 'Xbox360', label: 'Xbox 360' },
  { id: 'TG16', label: 'TurboGrafx-16 (TG16)' },
  { id: 'NeoGeo', label: 'Neo Geo AES/MVS' },
  { id: 'Atari2600', label: 'Atari 2600' },
  { id: 'Atari7800', label: 'Atari 7800' },
  { id: 'Arcade', label: 'Arcade Classics (MAME)' },
];

export default function OnlineScraperModal({ isOpen, onClose, onGameImported, onOpenSettings }) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('SNES');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [importedIds, setImportedIds] = useState(new Set());
  const [searched, setSearched] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const data = await scrapeSearch(query, platform);
      setResults(data.results || []);
    } catch (err) {
      console.error(err);
      alert('Failed to search online sources. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (game) => {
    try {
      await importScrapedGame(game);
      setImportedIds(prev => new Set([...prev, game.id]));
      if (onGameImported) onGameImported(game);
    } catch (err) {
      console.error(err);
      alert('Could not import game to store catalog.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0c1220] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-600/30 text-violet-400 border border-violet-500/40">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-white text-lg">
                Scrape Online ROM Sources
              </h3>
              <p className="text-xs text-slate-400">
                Live search verified ROM mirrors, P2P torrents & Torznab indexers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition-colors"
                title="Configure Torznab Indexers & Custom Search Engines"
              >
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Indexers & Providers</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="p-5 border-b border-white/10 bg-slate-950/60 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter game title (e.g. EarthBound, Banjo Tooie, Spyro)..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              {SCRAPER_PLATFORMS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-all shadow-md whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scraping...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Results Viewport */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              <p className="text-sm font-medium">Searching verified ROM mirrors & torrent indexers...</p>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="py-16 text-center text-slate-500">
              <Database className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-sm font-medium">No online results found for "{query}"</p>
              <p className="text-xs text-slate-600 mt-1">Try a different title or platform</p>
            </div>
          )}

          {!loading && results.map((item) => {
            const isImported = importedIds.has(item.id);

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/5 hover:border-violet-500/40 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={item.box_art_2d || `/api/covers/image?title=${encodeURIComponent(item.title)}&platform=${encodeURIComponent(item.platform)}`}
                    alt={item.title}
                    className="w-12 h-16 rounded-lg object-cover bg-slate-950 border border-white/10 shrink-0"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `/api/covers/image?title=${encodeURIComponent(item.title)}&platform=${encodeURIComponent(item.platform)}`;
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-950/80 text-violet-300 border border-violet-800/60 uppercase">
                        {item.platform}
                      </span>
                      {item.source && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-white/10">
                          {item.source}
                        </span>
                      )}
                      {item.seeders !== null && item.seeders !== undefined && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                          ▲ {item.seeders} {item.seeders === 1 ? 'seed' : 'seeds'}
                        </span>
                      )}
                      {item.magnet_uri && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-950/60 text-red-400 border border-red-800/60 flex items-center gap-1">
                          <Magnet className="w-2.5 h-2.5" />
                          <span>Magnet</span>
                        </span>
                      )}
                      {item.release_year ? <span className="text-xs text-slate-400">{item.release_year}</span> : null}
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-[11px] text-cyan-400 font-mono">{item.file_size_mb} MB</span>
                    </div>
                    <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                    <p className="text-xs text-slate-400 truncate max-w-md">{item.description}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleImport(item)}
                  disabled={isImported}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                    isImported
                      ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/40 cursor-default'
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md hover:scale-105 active:scale-95'
                  }`}
                >
                  {isImported ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>In Vault Store</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to Store</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
