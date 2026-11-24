import React from 'react';
import {
  Search, Download, Compass, X,
  HardDrive, Library, Heart, Volume2, VolumeX, Sliders, Globe, Disc
} from 'lucide-react';
import { playClick } from '../utils/soundEffects';

export default function Navbar({
  searchTerm,
  setSearchTerm,
  currentView = 'store',
  onSelectView,
  installedCount = 0,
  favoritesCount = 0,
  activeDownloadsCount = 0,
  onOpenDownloads,
  onOpenScraper,
  onOpenMirrors,
  onOpenCompressor,
  onOpenSettings,
  totalGames,
  activeSourcesCount = 0,
  soundEnabled = true,
  onToggleSound
}) {
  const handleNav = (view) => {
    playClick();
    onSelectView(view);
  };

  return (
    <header
      data-window-drag="true"
      className="sticky top-0 z-30 bg-[#080c14]/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-5 lg:px-8 py-2.5 transition-all select-none"
    >
      <div
        data-window-drag="true"
        className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-3"
      >
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            onClick={() => handleNav('store')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-600/30 border border-cyan-400/40 p-1.5 flex items-center justify-center shadow-glow-cyan cursor-pointer hover:scale-105 transition-transform shrink-0"
          >
            <img src="/vault.svg" alt="OmniVault" className="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(0,210,255,0.8)]" />
          </div>
          <div className="cursor-pointer hidden md:block" onClick={() => handleNav('store')}>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg lg:text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-200 to-violet-400">
                OMNIVAULT
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                Finder
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden xl:block">
              {totalGames > 0 ? `${totalGames.toLocaleString()} Catalog Titles` : 'Loading Catalog'} •{' '}
              {activeSourcesCount > 0
                ? `${activeSourcesCount} BYOS ${activeSourcesCount === 1 ? 'Source' : 'Sources'}`
                : 'BYOS Ready'}
            </p>
          </div>
        </div>

        {/* View Navigation Tabs: Catalog | Downloaded | Favorites */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 shrink-0">
          <button
            onClick={() => handleNav('store')}
            title="Catalog Finder"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'store'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Catalog</span>
          </button>

          <button
            onClick={() => handleNav('downloaded')}
            title="Downloaded ROMs"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'downloaded'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Downloaded</span>
            {installedCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                currentView === 'downloaded' ? 'bg-black/30 text-black font-extrabold' : 'bg-slate-800 text-cyan-400'
              }`}>
                {installedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNav('favorites')}
            title="Saved Favorites"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'favorites'
                ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${currentView === 'favorites' ? 'fill-white' : 'text-rose-400'}`} />
            <span className="hidden lg:inline">Favorites</span>
            {favoritesCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                currentView === 'favorites' ? 'bg-white/30 text-white font-extrabold' : 'bg-slate-800 text-rose-400'
              }`}>
                {favoritesCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        {currentView !== 'downloaded' && (
          <div className="order-last w-full md:order-none md:w-auto md:flex-1 md:min-w-[150px] md:max-w-xs relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={totalGames ? `Search ${totalGames.toLocaleString()} titles...` : 'Search ROM catalog...'}
              className="w-full bg-slate-900/90 border border-slate-700/60 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto md:ml-0">

          {/* Live Search / Scraper Button */}
          <button
            onClick={() => { playClick(); onOpenScraper(); }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="Live search online ROM mirrors, indexers & torrents"
          >
            <Compass className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden xl:inline">Live Search</span>
          </button>

          {/* Mirrors Network Hub */}
          <button
            onClick={() => { playClick(); onOpenMirrors(); }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="Browse Mirror Network & Source Health"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">Mirrors</span>
          </button>

          {/* ROM Compressor & M3U Utilities */}
          <button
            onClick={() => { playClick(); onOpenCompressor(); }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="Lossless CHD / RVZ Compressor & Multi-Disc M3U Builder"
          >
            <Disc className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden 2xl:inline">Compressor</span>
          </button>

          {/* Settings (Storage, Indexers & Search Templates) */}
          <button
            onClick={() => { playClick(); onOpenSettings(); }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-200 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="Storage Paths, Indexers & Search Templates"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* UI Sound Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-xl border text-xs font-bold transition-all hover:scale-105 cursor-pointer shrink-0 ${
              soundEnabled
                ? 'bg-slate-800/90 border-slate-700 text-cyan-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Mute UI SFX' : 'Enable UI SFX'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Active Downloads Drawer Button */}
          <button
            onClick={() => { playClick(); onOpenDownloads(); }}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-200 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="View Active Downloads"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Downloads</span>
            {activeDownloadsCount > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
