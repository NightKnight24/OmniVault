import React, { useState, useEffect } from 'react';
import { 
  FolderDown, Play, FolderOpen, Trash2, ShieldCheck, 
  Search, HardDrive, Gamepad2, Sparkles, AlertTriangle, Wand2, Terminal,
  Archive, CheckCircle2, RefreshCw, Eye
} from 'lucide-react';
import { fetchInstalledGames, launchInstalledGame, deleteInstalledGame, verifyChecksum, extractArchive, scanLocalCollection, launchInNativeEmulator } from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';
import OmniPlayerModal from './OmniPlayerModal';

export default function DownloadedGamesTab({ onSelectGame, onNavigateStore, onOpenSettings, onOpenCheatLab, onOpenModStore }) {

  const [playingGame, setPlayingGame] = useState(null);
  const [installedGames, setInstalledGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isScanningCollection, setIsScanningCollection] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPlat, setSelectedPlat] = useState('ALL');
  const [deletingPath, setDeletingPath] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [verifyingPath, setVerifyingPath] = useState(null);
  const [checksumResults, setChecksumResults] = useState({});
  const [extractingPath, setExtractingPath] = useState(null);

  const loadInstalled = async () => {
    setLoading(true);
    try {
      const res = await fetchInstalledGames();
      setInstalledGames(res.installed || []);
    } catch (err) {
      console.error('Failed to load installed games:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstalled();
  }, []);

  const showToast = (msg) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 3500);
  };

  const handleScanCollection = async () => {
    playClick();
    setIsScanningCollection(true);
    showToast("Scanning and scraping all ROM folders across /Volumes/ROMS...");
    try {
      const res = await scanLocalCollection();
      playVictorySound();
      showToast(res.message || `Scanned ${res.total_scanned} ROMs!`);
      loadInstalled();
    } catch (e) {
      alert(`Collection scan error: ${e.message}`);
    } finally {
      setIsScanningCollection(false);
    }
  };

  const handleLaunch = (item) => {
    playClick();
    setPlayingGame(item);
  };

  const handleNativePlay = async (item) => {
    playClick();
    if (onSelectGame) onSelectGame(item);
    try {
      showToast(`Launching ${item.title}...`);
      const res = await launchInNativeEmulator(item.path, item.platform);
      if (res.status === 'bios_required') {
        showToast(`Required BIOS missing: ${res.missing_bios || 'Check Settings'}`);
        setPlayingGame(item);
      } else {
        playVictorySound();
        showToast(`⚡ Dispatched to ${res.emulator || 'Standalone Emulator'}`);
      }
    } catch (err) {
      console.warn('Native launch note:', err);
      // Fallback to OmniPlayerModal if native launch had an error
      setPlayingGame(item);
    }
  };

  const handleReveal = (path) => {
    playClick();
    fetch('/api/downloads/open-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).catch(() => {});
  };

  const handleVerify = async (path, title) => {
    playClick();
    setVerifyingPath(path);
    try {
      const res = await verifyChecksum(path);
      setChecksumResults(prev => ({ ...prev, [path]: res }));
      playVictorySound();
      showToast(`Verified ${title}: CRC32 ${res.crc32}`);
    } catch (err) {
      showToast(`Checksum verification error: ${err.message}`);
    } finally {
      setVerifyingPath(null);
    }
  };

  const handleExtract = async (path, title) => {
    playClick();
    setExtractingPath(path);
    try {
      const res = await extractArchive(path);
      playVictorySound();
      showToast(`Successfully unpacked ${title} (${res.extracted_count} files)`);
      loadInstalled();
    } catch (err) {
      showToast(`Failed to extract archive: ${err.message}`);
    } finally {
      setExtractingPath(null);
    }
  };

  const handleConfirmDelete = async (path, title) => {
    playClick();
    try {
      await deleteInstalledGame(path);
      setDeletingPath(null);
      showToast(`Deleted "${title}" from /Volumes/ROMS`);
      loadInstalled();
    } catch (err) {
      showToast(`Failed to delete ROM: ${err.message}`);
    }
  };

  // Filtered games
  const filtered = installedGames.filter(g => {
    const matchPlat = selectedPlat === 'ALL' || g.platform.toLowerCase() === selectedPlat.toLowerCase();
    const matchSearch = !search || g.title.toLowerCase().includes(search.toLowerCase()) || g.filename.toLowerCase().includes(search.toLowerCase());
    return matchPlat && matchSearch;
  });

  // Calculate stats
  const totalSizeMb = installedGames.reduce((acc, g) => acc + (g.file_size_mb || 0), 0);
  const sizeString = totalSizeMb > 1024 ? `${(totalSizeMb / 1024).toFixed(2)} GB` : `${totalSizeMb.toFixed(1)} MB`;
  const platformsPresent = Array.from(new Set(installedGames.map(g => g.platform)));

  return (
    <div className="space-y-6">
      
      {/* Toast Alert */}
      {actionMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-xl bg-cyan-500 text-black font-bold text-sm shadow-glow-cyan animate-bounce flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Library Summary Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-cyan-950/60 via-slate-900 to-violet-950/60 border border-white/10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-md bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 text-xs font-bold uppercase tracking-wider">
                Local Drive Vault
              </span>
              <span className="text-xs text-slate-400 font-mono">
                /Volumes/ROMS
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white font-display">
              Downloaded Classic Games
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Your preserved offline collection directly accessible on your ROMs volume.
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-white/10 text-center min-w-[100px]">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Installed</span>
              <span className="text-xl font-black text-cyan-400 font-mono">{installedGames.length}</span>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-white/10 text-center min-w-[100px]">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Disk Used</span>
              <span className="text-xl font-black text-violet-400 font-mono">{sizeString}</span>
            </div>

            <div className="px-4 py-3 rounded-2xl bg-slate-900/90 border border-white/10 text-center min-w-[100px]">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Consoles</span>
              <span className="text-xl font-black text-emerald-400 font-mono">{platformsPresent.length}</span>
            </div>

            <button
              onClick={handleScanCollection}
              disabled={isScanningCollection}
              className="px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all shrink-0"
              title="Recursively scan all console directories in /Volumes/ROMS and scrape box arts, metadata, and trailers"
            >
              <RefreshCw className={`w-4 h-4 ${isScanningCollection ? 'animate-spin' : ''}`} />
              <span>{isScanningCollection ? 'Scanning ROMs...' : 'Scan & Scrape Collection'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="w-full sm:w-72 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search downloaded games..."
            className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Platform Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedPlat('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedPlat === 'ALL'
                ? 'bg-cyan-500 text-black border-cyan-400 font-bold'
                : 'bg-slate-900/80 text-slate-400 border-white/5 hover:text-white'
            }`}
          >
            All Consoles ({installedGames.length})
          </button>
          {platformsPresent.map(p => (
            <button
              key={p}
              onClick={() => setSelectedPlat(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedPlat === p
                  ? 'bg-cyan-500 text-black border-cyan-400 font-bold'
                  : 'bg-slate-900/80 text-slate-400 border-white/5 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Installed Games */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Scanning /Volumes/ROMS allocated directories...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center rounded-3xl border border-dashed border-white/10 p-8">
          <FolderDown className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">
            {installedGames.length === 0 ? 'No Games Downloaded Yet' : 'No Matching Downloaded Games Found'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
            {installedGames.length === 0
              ? 'Browse the Storefront, preview gameplay trailers, and download classic ROMs directly to your allocated console folders on /Volumes/ROMS.'
              : 'Try clearing your search query or selecting a different platform filter.'}
          </p>
          {installedGames.length === 0 && (
            <button
              onClick={onNavigateStore}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs transition-all shadow-glow-cyan"
            >
              Explore Storefront
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.path}
              className="group relative bg-slate-900/80 hover:bg-slate-800/90 border border-white/10 hover:border-cyan-500/40 rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-3.5 mb-3">
                  {/* Box Art */}
                  <div className="w-16 h-20 rounded-xl bg-black border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    <img
                      src={item.box_art_2d || `/api/covers/image?title=${encodeURIComponent(item.title)}&platform=${encodeURIComponent(item.platform)}`}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(item.title)}&platform=${encodeURIComponent(item.platform)}`; }}
                    />
                  </div>

                  {/* Title & Metadata */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                        {item.platform}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {item.file_size_mb} MB
                      </span>
                    </div>

                    <h4 
                      onClick={() => onSelectGame(item)}
                      className="font-bold text-sm text-white truncate hover:text-cyan-400 cursor-pointer transition-colors"
                      title={item.title}
                    >
                      {item.title}
                    </h4>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5" title={item.filename}>
                      {item.filename}
                    </p>
                  </div>
                </div>

                {/* Checksum Result if verified */}
                {checksumResults[item.path] && (
                  <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-[10px] text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>CRC32: {checksumResults[item.path].crc32}</span>
                    </div>
                    <span className="font-sans font-bold text-[9px] uppercase tracking-wider text-emerald-400">Verified Match</span>
                  </div>
                )}

                {/* Local Path Tag */}
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/5 text-[10px] font-mono text-slate-400 truncate mb-4">
                  <span className="truncate">{item.path}</span>
                  <button
                    onClick={() => handleReveal(item.path)}
                    className="ml-2 text-slate-400 hover:text-cyan-400 p-0.5"
                    title="Reveal in Finder"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Utility Row: Extract & Verify */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <button
                  onClick={() => handleVerify(item.path, item.title)}
                  disabled={verifyingPath === item.path}
                  className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-semibold transition-all"
                  title="Verify ROM Checksum (CRC32 / SHA1 against authentic dumps)"
                >
                  <ShieldCheck className={`w-3 h-3 ${verifyingPath === item.path ? 'animate-spin text-cyan-400' : 'text-emerald-400'}`} />
                  <span>{verifyingPath === item.path ? 'Verifying...' : 'Verify Hash'}</span>
                </button>

                {(item.filename.toLowerCase().endsWith('.zip') || item.filename.toLowerCase().endsWith('.7z')) && (
                  <button
                    onClick={() => handleExtract(item.path, item.title)}
                    disabled={extractingPath === item.path}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/40 text-amber-300 text-[10px] font-semibold transition-all"
                    title="Extract compressed ROM archive"
                  >
                    <Archive className={`w-3 h-3 ${extractingPath === item.path ? 'animate-spin' : 'text-amber-400'}`} />
                    <span>{extractingPath === item.path ? 'Unpacking...' : 'Extract ROM'}</span>
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2.5 border-t border-white/10">
                {deletingPath === item.path ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConfirmDelete(item.path, item.title)}
                      className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Delete</span>
                    </button>
                    <button
                      onClick={() => setDeletingPath(null)}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {/* Play / Launch: Primary is 1-Click Native Launch */}
                    <button
                      onClick={() => handleNativePlay(item)}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-bold text-xs transition-all shadow-sm cursor-pointer hover:scale-[1.02] active:scale-98"
                      title="1-Click Launch in Hardware-Accelerated Standalone Emulator"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      <span>Play</span>
                    </button>

                    {/* Cheats & Mods Modal */}
                    <button
                      onClick={() => onSelectGame(item)}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold text-xs transition-all cursor-pointer"
                      title="View Cheats, Patches & Mods"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Cheats</span>
                    </button>

                    {/* Delete ROM */}
                    <button
                      onClick={() => setDeletingPath(item.path)}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 font-semibold text-xs transition-all cursor-pointer"
                      title="Delete ROM from drive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* In-App Interactive Emulator Player Modal */}
      {playingGame && (
        <OmniPlayerModal
          game={playingGame}
          onClose={() => setPlayingGame(null)}
          onOpenSettings={onOpenSettings}
          onOpenCheatLab={onOpenCheatLab}
          onOpenModStore={onOpenModStore}
        />
      )}


    </div>
  );
}
