import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, Search, Download, Compass, X, 
  HardDrive, ShoppingBag, Bot, Heart, Volume2, VolumeX, Sliders, Wrench, Globe, Tv,
  Palette, Disc, Users, Puzzle, ChevronDown, MessageSquare, AlertCircle, ExternalLink
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
  onOpenSettings,
  onOpenCheatLab,
  onOpenMirrors,
  onOpenAI,
  onOpenSetupWizard,
  onOpenThemeStudio,
  onOpenCompressor,
  onOpenNetplay,
  onOpenModStore,
  totalGames,
  soundEnabled = true,
  onToggleSound,
  isKodiMode = false,
  onToggleKodiMode
}) {
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsMenuRef = useRef(null);

  const handleNav = (view) => {
    playClick();
    onSelectView(view);
  };

  // Close tools dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target)) {
        setIsToolsOpen(false);
      }
    };
    if (isToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen]);

  return (
    <header className="sticky top-0 z-30 bg-[#080c14]/95 backdrop-blur-md border-b border-white/10 pl-20 pr-4 lg:pr-8 py-3 transition-all select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
        
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div 
            onClick={() => handleNav('store')}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-600/30 border border-cyan-400/40 p-1.5 flex items-center justify-center shadow-glow-cyan cursor-pointer hover:scale-105 transition-transform shrink-0"
          >
            <img src="/vault.svg" alt="OmniVault" className="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(0,210,255,0.8)]" />
          </div>
          <div className="cursor-pointer hidden sm:block" onClick={() => handleNav('store')}>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-200 to-violet-400">
                OMNIVAULT
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                Store
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {totalGames ? totalGames.toLocaleString() : '69,222'} Verified ROMs & AI Copilot
            </p>
          </div>
        </div>

        {/* View Navigation Tabs: Storefront | Downloaded Games | Favorites */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-white/10 shrink-0">
          <button
            onClick={() => handleNav('store')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'store'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Storefront</span>
          </button>

          <button
            onClick={() => handleNav('downloaded')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'downloaded'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-glow-cyan'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Downloaded</span>
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              currentView === 'favorites'
                ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${currentView === 'favorites' ? 'fill-white' : 'text-rose-400'}`} />
            <span className="hidden md:inline">Favorites</span>
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
          <div className="flex-1 min-w-[130px] max-w-xs relative hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={totalGames ? `Search ${totalGames.toLocaleString()} games...` : "Search games across all platforms..."}
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
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Chiptune Audio Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-xl border text-xs font-bold transition-all hover:scale-105 cursor-pointer shrink-0 ${
              soundEnabled
                ? 'bg-slate-800/90 border-slate-700 text-cyan-400'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? "Mute Retro Chiptune SFX" : "Enable Retro Chiptune SFX"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* OmniAI Assistant Button */}
          <button
            onClick={onOpenAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-sky-500/20 hover:from-cyan-500/30 hover:to-sky-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer shadow-sm group shrink-0"
            title="Ask OmniAI for recommendations, cheats & setup"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400 group-hover:animate-pulse" />
            <span className="hidden lg:inline">OmniAI</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          </button>

          {/* Online Scraper Button */}
          <button
            onClick={onOpenScraper}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/40 text-violet-300 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="Scrape Archive.org & online ROM sources for any game"
          >
            <Compass className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden lg:inline">Scraper</span>
          </button>

          {/* Kodi / 10-Foot Living Room Cinema Toggle */}
          <button
            onClick={onToggleKodiMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all hover:scale-[1.02] cursor-pointer shadow-sm shrink-0 ${
              isKodiMode
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black border-cyan-400 shadow-glow-cyan'
                : 'bg-indigo-950/40 hover:bg-indigo-900/60 border-indigo-500/30 text-indigo-300'
            }`}
            title="Toggle Kodi / XBMC 10-Foot Living Room Interface"
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{isKodiMode ? 'Cinema Mode' : 'Kodi Mode'}</span>
          </button>

          {/* Vault Tools & Labs Dropdown Menu */}
          <div className="relative shrink-0" ref={toolsMenuRef}>
            <button
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shadow-sm ${
                isToolsOpen
                  ? 'bg-cyan-500 text-black border-cyan-400 font-bold shadow-glow-cyan'
                  : 'bg-slate-800/90 hover:bg-slate-700/90 border-slate-700 text-slate-200'
              }`}
              title="Vault Tools, Settings, Emulators, Cheats & Modding"
            >
              <Wrench className={`w-3.5 h-3.5 ${isToolsOpen ? 'text-black' : 'text-cyan-400'}`} />
              <span className="hidden sm:inline">Tools</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isToolsOpen ? 'rotate-180 text-black' : 'text-slate-400'}`} />
            </button>

            {/* Dropdown Menu Popover */}
            {isToolsOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-[#0c1424] border border-white/15 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/10 mb-1 flex items-center justify-between">
                  <span>Vault Tools & Hubs</span>
                  <span className="text-cyan-400 font-mono">8 tools</span>
                </div>

                {/* 1. Unified Settings & Emulators */}
                <button
                  onClick={() => { setIsToolsOpen(false); onOpenSettings(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Sliders className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-white group-hover:text-amber-300">Settings & Emulators</div>
                    <div className="text-[10px] text-slate-400">Graphics, Audio, Controllers & BIOS</div>
                  </div>
                </button>

                {/* 2. Mods & Romhacks Storefront */}
                {onOpenModStore && (
                  <button
                    onClick={() => { setIsToolsOpen(false); onOpenModStore(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                      <Puzzle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-purple-300">Mods & Romhacks Hub</div>
                      <div className="text-[10px] text-slate-400">Libretro patches & community hacks</div>
                    </div>
                  </button>
                )}

                {/* 3. Cheat Engineering Lab */}
                <button
                  onClick={() => { setIsToolsOpen(false); onOpenCheatLab(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Wrench className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-white group-hover:text-emerald-300">Cheat Lab</div>
                    <div className="text-[10px] text-slate-400">Save diffing, Game Genie & RAM pokes</div>
                  </div>
                </button>

                {/* 4. ROM Mirrors Hub */}
                <button
                  onClick={() => { setIsToolsOpen(false); onOpenMirrors(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                >
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-white group-hover:text-cyan-300">ROM Mirrors</div>
                    <div className="text-[10px] text-slate-400">Multi-source mirrors & repositories</div>
                  </div>
                </button>

                {/* 5. Theme Studio */}
                {onOpenThemeStudio && (
                  <button
                    onClick={() => { setIsToolsOpen(false); onOpenThemeStudio(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center text-fuchsia-400 shrink-0">
                      <Palette className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-fuchsia-300">Theme Studio</div>
                      <div className="text-[10px] text-slate-400">Palettes, CRT glow & ambiance</div>
                    </div>
                  </button>
                )}

                {/* 6. ROM Compressor */}
                {onOpenCompressor && (
                  <button
                    onClick={() => { setIsToolsOpen(false); onOpenCompressor(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                      <Disc className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-sky-300">ROM Compressor</div>
                      <div className="text-[10px] text-slate-400">Lossless CHD & RVZ disc converter</div>
                    </div>
                  </button>
                )}

                {/* 7. OmniNet Netplay */}
                {onOpenNetplay && (
                  <button
                    onClick={() => { setIsToolsOpen(false); onOpenNetplay(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-indigo-300">OmniNet Netplay</div>
                      <div className="text-[10px] text-slate-400">P2P online multiplayer lobby</div>
                    </div>
                  </button>
                )}

                {/* 8. Setup Wizard */}
                {onOpenSetupWizard && (
                  <button
                    onClick={() => { setIsToolsOpen(false); onOpenSetupWizard(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group border-t border-white/5 mt-1 pt-2"
                  >
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-cyan-300">Setup Wizard</div>
                      <div className="text-[10px] text-slate-400">First-time BIOS & emulator checks</div>
                    </div>
                  </button>
                )}

                {/* 9. GitHub Community Discussions */}
                <a
                  href="https://github.com/NightKnight24/OmniVault/discussions"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsToolsOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group border-t border-white/5 mt-1 pt-2"
                >
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-white group-hover:text-purple-300 flex items-center gap-1.5">
                      <span>GitHub Discussions</span>
                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                    </div>
                    <div className="text-[10px] text-slate-400">Q&A, community sources & ideas</div>
                  </div>
                </a>

                {/* 10. Report an Issue */}
                <a
                  href="https://github.com/NightKnight24/OmniVault/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsToolsOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
                >
                  <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-white group-hover:text-rose-300 flex items-center gap-1.5">
                      <span>Report an Issue</span>
                      <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                    </div>
                    <div className="text-[10px] text-slate-400">Submit a bug report or request</div>
                  </div>
                </a>
              </div>
            )}
          </div>

          {/* Community & Live Network Badge */}
          <a
            href="https://github.com/NightKnight24/OmniVault/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/40 text-xs font-semibold text-slate-300 transition-all cursor-pointer group shrink-0"
            title="GitHub Community & Discussions"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-mono text-slate-300 group-hover:text-cyan-300">Community & Issues</span>
          </a>

          {/* Active Downloads Drawer Button */}
          <button
            onClick={onOpenDownloads}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-200 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer shrink-0"
            title="View Active Downloads"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Activity</span>
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
