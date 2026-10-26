import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Gamepad2, Play, Heart, Wand2, Sliders, Globe, HardDrive, 
  Search, Star, Sparkles, Tv, Download, Clock, Monitor, ChevronRight, X,
  Palette, Disc, Users, Puzzle, ShoppingBag, Compass
} from 'lucide-react';
import { playClick, playFavoriteSound } from '../utils/soundEffects';
import ControllerGlyph from './ControllerGlyph';
import { useTheme } from '../context/ThemeContext';
import { gamepadService } from '../services/gamepadService';
import { fetchGames, fetchInstalledGames } from '../services/api';

const CONSOLE_LIST = [
  'ALL', 'NES', 'SNES', 'N64', 'GameCube', 'Wii', 'Switch',
  'GB', 'GBC', 'GBA', 'NDS', '3DS', 'Genesis', 'SegaCD',
  'Saturn', 'Dreamcast', 'MasterSystem', 'GameGear', 'PS1',
  'PS2', 'PS3', 'PS4', 'PSP', 'PSVita', 'Xbox', 'Xbox360',
  'TG16', 'NeoGeo', 'Atari2600', 'Atari7800', 'Arcade'
];

export default function KodiBigPictureView({
  games = [],
  platforms = [],
  installedCount = 0,
  favoritesCount = 0,
  totalGames = 15789,
  onSelectGame,
  onStartDownload,
  onToggleFavorite,
  onOpenSettings,
  onOpenCheatLab,
  onOpenMirrors,
  onToggleKodiMode,
  onOpenQuickMenu,
  onOpenSetupWizard,
  onOpenThemeStudio,
  onOpenCompressor,
  onOpenNetplay,
  onOpenModStore,
  onOpenScraper
}) {
  const { currentAmbiance, activePlatform, setActivePlatform } = useTheme();

  // Active Category: 'storefront' | 'spotlight' | 'consoles' | 'downloaded' | 'favorites'
  const [activeCategory, setActiveCategory] = useState('storefront');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const [controllerInfo, setControllerInfo] = useState({ connected: false, name: 'No Gamepad' });
  
  // Live Storefront State inside Kodi Mode
  const [kodiSearch, setKodiSearch] = useState('');
  const [liveGames, setLiveGames] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [totalFoundCount, setTotalFoundCount] = useState(totalGames || 15789);
  const [installedGameIds, setInstalledGameIds] = useState(new Set());
  
  const carouselRef = useRef(null);
  const searchInputRef = useRef(null);

  // Load live games for the active Kodi category and search filters
  const loadKodiGames = useCallback(async () => {
    setLiveLoading(true);
    try {
      if (activeCategory === 'downloaded') {
        const res = await fetchInstalledGames();
        const list = res.installed || [];
        setLiveGames(list);
        setTotalFoundCount(list.length);
        setInstalledGameIds(new Set(list.map(g => g.id)));
      } else if (activeCategory === 'favorites') {
        const res = await fetchGames({ favorites_only: true, pageSize: 80 });
        const list = res.games || [];
        setLiveGames(list);
        setTotalFoundCount(list.length);
      } else if (activeCategory === 'spotlight') {
        const res = await fetchGames({ featured_only: true, pageSize: 40 });
        const list = res.games || [];
        setLiveGames(list);
        setTotalFoundCount(list.length);
      } else {
        // 'storefront' or 'consoles'
        const plat = activeCategory === 'consoles' && activePlatform !== 'ALL' ? activePlatform : undefined;
        const res = await fetchGames({
          platform: plat,
          search: kodiSearch.trim() || undefined,
          pageSize: 80,
          sort: 'rating_desc'
        });
        const list = res.games || [];
        setLiveGames(list);
        setTotalFoundCount(res.total || list.length);
      }
    } catch (err) {
      console.error('Kodi Big Picture live fetch error:', err);
    } finally {
      setLiveLoading(false);
    }
  }, [activeCategory, activePlatform, kodiSearch]);

  useEffect(() => {
    loadKodiGames();
    setFocusedIndex(0);
  }, [loadKodiGames]);

  // Load installed game IDs to know which games have "Play" vs "Download"
  useEffect(() => {
    fetchInstalledGames()
      .then(res => {
        const ids = new Set((res.installed || []).map(g => g.id));
        setInstalledGameIds(ids);
      })
      .catch(() => {});
  }, []);

  const displayGames = liveGames;
  const focusedGame = displayGames[focusedIndex] || displayGames[0] || null;
  const isFocusedInstalled = focusedGame ? (installedGameIds.has(focusedGame.id) || focusedGame.direct_download_url?.startsWith('file://')) : false;

  // Digital Clock Updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to Gamepad Connections
  useEffect(() => {
    const unsub = gamepadService.subscribe((info) => {
      setControllerInfo(info);
    });
    return unsub;
  }, []);

  // Spatial Navigation via Gamepad Actions
  useEffect(() => {
    const handleGamepadAction = (action) => {
      if (action === 'NAV_RIGHT') {
        playClick();
        setFocusedIndex(i => Math.min(displayGames.length - 1, i + 1));
      } else if (action === 'NAV_LEFT') {
        playClick();
        setFocusedIndex(i => Math.max(0, i - 1));
      } else if (action === 'NAV_UP') {
        playClick();
        cycleCategory(-1);
      } else if (action === 'NAV_DOWN') {
        playClick();
        cycleCategory(1);
      } else if (action === 'CONFIRM') {
        if (focusedGame) {
          playClick();
          if (isFocusedInstalled) {
            onSelectGame(focusedGame);
          } else {
            onStartDownload(focusedGame, 'direct');
          }
        }
      } else if (action === 'FAVORITE') {
        if (focusedGame) {
          playFavoriteSound();
          onToggleFavorite(focusedGame);
        }
      } else if (action === 'DETAILS') {
        if (focusedGame) {
          playClick();
          onSelectGame(focusedGame);
        }
      } else if (action === 'PREV_TAB') {
        cycleCategory(-1);
      } else if (action === 'NEXT_TAB') {
        cycleCategory(1);
      } else if (action === 'TOGGLE_MODE') {
        onToggleKodiMode();
      } else if (action === 'TOGGLE_QUICK_MENU') {
        onOpenQuickMenu();
      }
    };

    const unsub = gamepadService.subscribeActions(handleGamepadAction);
    return unsub;
  }, [displayGames, focusedIndex, focusedGame, activeCategory, isFocusedInstalled]);

  // Keyboard navigation fallback
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        playClick();
        setFocusedIndex(i => Math.min(displayGames.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playClick();
        setFocusedIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cycleCategory(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        cycleCategory(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedGame) {
          if (isFocusedInstalled) onSelectGame(focusedGame);
          else onStartDownload(focusedGame, 'direct');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (focusedGame) onToggleFavorite(focusedGame);
      } else if (e.key === 's' || e.key === 'S') {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
        }
      } else if (e.key === 'F1' || e.key === '`') {
        e.preventDefault();
        onOpenQuickMenu();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        onToggleKodiMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayGames, focusedIndex, focusedGame, activeCategory, isFocusedInstalled]);

  const categories = [
    { id: 'storefront', label: 'Storefront Catalog', count: totalGames || 15789, icon: ShoppingBag },
    { id: 'spotlight', label: 'Spotlight Classics', count: 40, icon: Sparkles },
    { id: 'consoles', label: 'Console Hub', count: platforms.length || 27, icon: Tv },
    { id: 'downloaded', label: 'Downloaded ROMs', count: installedCount, icon: HardDrive },
    { id: 'favorites', label: 'Favorites', count: favoritesCount, icon: Heart },
    { id: 'scraper', label: 'Online Scraper', icon: Compass },
    { id: 'mods', label: 'Mods & Romhacks', icon: Puzzle },
    { id: 'themes', label: 'Theme Studio', icon: Palette },
    { id: 'compressor', label: 'Lossless CHD/RVZ', icon: Disc },
    { id: 'netplay', label: 'P2P Netplay', icon: Users },
    { id: 'cheatlab', label: 'Cheat Lab', icon: Wand2 },
    { id: 'settings', label: 'Master Settings', icon: Sliders },
  ];

  const cycleCategory = (delta) => {
    playClick();
    const currIdx = categories.findIndex(c => c.id === activeCategory);
    let nextIdx = (currIdx + delta + categories.length) % categories.length;
    const nextCat = categories[nextIdx];
    handleCategoryClick(nextCat.id);
  };

  const handleCategoryClick = (catId) => {
    if (catId === 'scraper') {
      if (onOpenScraper) onOpenScraper();
      return;
    }
    if (catId === 'mods' && onOpenModStore) { onOpenModStore(); return; }
    if (catId === 'themes' && onOpenThemeStudio) { onOpenThemeStudio(); return; }
    if (catId === 'compressor' && onOpenCompressor) { onOpenCompressor(); return; }
    if (catId === 'netplay' && onOpenNetplay) { onOpenNetplay(); return; }
    if (catId === 'cheatlab') { onOpenCheatLab(); return; }
    if (catId === 'settings') { onOpenSettings(); return; }

    setActiveCategory(catId);
    setFocusedIndex(0);
  };

  // Auto-scroll focused card into center
  useEffect(() => {
    if (carouselRef.current) {
      const card = carouselRef.current.children[focusedIndex];
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [focusedIndex]);

  return (
    <div 
      className="relative w-full h-screen overflow-hidden flex flex-col select-none transition-colors duration-700"
      style={{
        background: `radial-gradient(circle at 65% 30%, ${currentAmbiance.glow.replace('0.5', '0.25')}, #05070f 65%)`
      }}
    >
      
      {/* Dynamic Background Fan Art Stage */}
      {focusedGame?.backdrop && (
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-700 opacity-25 filter blur-sm scale-105"
          style={{ backgroundImage: `url(${focusedGame.backdrop})` }}
        />
      )}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#05070f] via-[#05070f]/80 to-transparent" />
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-[#05070f] via-[#05070f]/60 to-transparent" />

      {/* TOP STATUS BAR (Kodi / XBMC 10-Foot Style) */}
      <div className="relative z-10 px-8 py-4 flex items-center justify-between border-b border-white/10 bg-black/50 backdrop-blur-md gap-4">
        
        {/* Brand Icon & Name */}
        <div className="flex items-center gap-3 shrink-0">
          <img src="/vault.svg" alt="OmniVault Logo" className="w-9 h-9 object-contain drop-shadow-[0_0_12px_#00f0ff]" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl text-white tracking-wider">OMNIVAULT</span>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                10-Foot Cinema
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Living Room Edition • {(totalGames || 15789).toLocaleString()} Titles
            </p>
          </div>
        </div>

        {/* Center Live Storefront Search Bar */}
        <div className="flex-1 max-w-md mx-4">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-white/15 rounded-2xl px-3.5 py-2 shadow-inner focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/30 transition-all">
            <Search className="w-4 h-4 text-cyan-400 shrink-0" />
            <input 
              ref={searchInputRef}
              type="text"
              value={kodiSearch}
              onChange={(e) => {
                setKodiSearch(e.target.value);
                setActiveCategory('storefront');
                setFocusedIndex(0);
              }}
              placeholder={totalGames ? `Search all ${totalGames.toLocaleString()} ROMs in Storefront...` : "Search all ROMs in Storefront..."}
              className="bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none w-full font-sans"
            />
            {kodiSearch && (
              <button 
                onClick={() => setKodiSearch('')} 
                className="p-0.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Info: Controller Status, Scraper, Clock & Mode Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          
          {/* Online Scraper Button */}
          {onOpenScraper && (
            <button
              onClick={onOpenScraper}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 border border-violet-500/40 text-xs font-bold transition-all cursor-pointer shadow-sm"
              title="Search and scrape Archive.org for any ROM"
            >
              <Compass className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">Scraper</span>
            </button>
          )}

          {/* Quick Menu Button */}
          <div 
            onClick={onOpenQuickMenu}
            className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-bold cursor-pointer transition-all shadow-glow-cyan"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>[F1 / Guide]</span>
          </div>

          {/* Gamepad Connection Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${controllerInfo.connected ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
            <span className="text-slate-300 hidden sm:inline">{controllerInfo.connected ? controllerInfo.name.split(' ')[0] : 'Gamepad Ready'}</span>
          </div>

          {/* Clock */}
          <div className="flex items-center gap-1.5 text-xs font-black font-mono text-white px-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{currentTime}</span>
          </div>

          {/* Desktop Mode Toggle Button */}
          <button
            onClick={onToggleKodiMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15 text-xs font-bold transition-all cursor-pointer shadow-sm"
            title="Switch back to Classic Desktop Storefront (Tab / Select)"
          >
            <Monitor className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Desktop UI</span>
          </button>

        </div>

      </div>

      {/* MAIN 10-FOOT INTERFACE BODY */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        
        {/* LEFT BLADE CATEGORY RAIL (Kodi Estuary Style) */}
        <div className="w-64 bg-slate-950/80 border-r border-white/10 backdrop-blur-xl p-5 flex flex-col justify-between overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-3 mb-2 font-mono">
              Storefront Categories
            </div>

            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-bold text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-glow-cyan'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-slate-400'}`} />
                    <span>{cat.label}</span>
                  </div>
                  {cat.count !== undefined && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-black/30 text-black font-extrabold' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {cat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* All 27 Consoles Quick Selector in Left Blade */}
          <div className="pt-4 border-t border-white/10 mt-4">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-2 mb-2 font-mono flex items-center justify-between">
              <span>Console Hub (27)</span>
              <span className="text-cyan-400 font-bold">{activePlatform}</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 pr-1">
              {CONSOLE_LIST.map(plat => (
                <button
                  key={plat}
                  onClick={() => {
                    playClick();
                    setActivePlatform(plat);
                    setActiveCategory('consoles');
                    setFocusedIndex(0);
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                    activePlatform === plat && activeCategory === 'consoles'
                      ? 'bg-cyan-500 text-black shadow-sm font-extrabold'
                      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {plat}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT CINEMATIC HERO & COVERFLOW STAGE */}
        <div className="flex-1 flex flex-col justify-between p-8 overflow-hidden">
          
          {/* CINEMATIC HERO STAGE (Focused Game Showcase) */}
          {focusedGame ? (
            <div className="flex items-start gap-8 max-w-5xl animate-in fade-in duration-300">
              
              {/* 3D Box Art Artwork */}
              <div 
                className="w-44 h-60 rounded-3xl bg-black border-2 overflow-hidden shadow-2xl shrink-0 transition-all duration-300 transform group"
                style={{ borderColor: currentAmbiance.accent, boxShadow: `0 0 35px ${currentAmbiance.glow}` }}
              >
                {focusedGame.box_art_2d ? (
                  <img
                    src={focusedGame.box_art_2d}
                    alt={focusedGame.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(focusedGame.title)}&platform=${encodeURIComponent(focusedGame.platform)}`; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900">
                    <Gamepad2 className="w-16 h-16 text-slate-600" />
                  </div>
                )}
              </div>

              {/* Title & Metadata Details */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2.5">
                  <span 
                    className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider font-mono shadow-md text-white"
                    style={{ backgroundColor: currentAmbiance.primary }}
                  >
                    {focusedGame.platform}
                  </span>
                  {Number(focusedGame.rating) > 0 && (
                    <div className="flex items-center gap-1 text-amber-400 text-xs font-bold font-mono bg-slate-900/80 px-2.5 py-1 rounded-full border border-white/10">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span>{Number(focusedGame.rating).toFixed(1)}</span>
                    </div>
                  )}
                  {focusedGame.release_year && (
                    <span className="text-xs text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded-full border border-white/10">
                      {focusedGame.release_year}
                    </span>
                  )}
                  {focusedGame.file_size_mb ? (
                    <span className="text-xs text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded-full border border-white/10">
                      {focusedGame.file_size_mb} MB
                    </span>
                  ) : null}
                  {isFocusedInstalled && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Installed
                    </span>
                  )}
                </div>

                <h1 className="font-display font-black text-3xl md:text-5xl text-white tracking-tight leading-none drop-shadow-lg">
                  {focusedGame.title}
                </h1>

                <p className="text-sm text-slate-300 max-w-2xl line-clamp-3 leading-relaxed">
                  {focusedGame.description || 'Preserved classic video game ready for instant in-app emulation, live AI translation, and cheat engineering.'}
                </p>

                {/* Direct Action Buttons: Play if installed, Download if Storefront */}
                <div className="flex items-center gap-3 pt-2">
                  {isFocusedInstalled ? (
                    <button
                      onClick={() => {
                        playClick();
                        onSelectGame(focusedGame);
                      }}
                      className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-black text-sm shadow-glow-emerald flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      <span>Play Game [A]</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        playClick();
                        onStartDownload(focusedGame, 'direct');
                      }}
                      className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-sm shadow-glow-cyan flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Download className="w-4 h-4 text-black" />
                      <span>Download ROM ({focusedGame.file_size_mb || 0} MB) [A]</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      playClick();
                      onSelectGame(focusedGame);
                    }}
                    className="px-4 py-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-slate-200 text-xs font-bold transition-all cursor-pointer"
                  >
                    <span>Details & Trailers</span>
                  </button>

                  <button
                    onClick={() => {
                      playFavoriteSound();
                      onToggleFavorite(focusedGame);
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      focusedGame.is_favorite
                        ? 'bg-rose-950/80 border-rose-500 text-rose-400 shadow-md'
                        : 'bg-slate-900/80 border-white/15 text-slate-400 hover:text-white'
                    }`}
                    title="Toggle Favorite [X]"
                  >
                    <Heart className={`w-4 h-4 ${focusedGame.is_favorite ? 'fill-rose-500' : ''}`} />
                  </button>

                  <button
                    onClick={() => {
                      playClick();
                      onOpenCheatLab();
                    }}
                    className="px-4 py-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-slate-300 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
                    title="Cheat Engineering Lab [Y]"
                  >
                    <Wand2 className="w-4 h-4 text-amber-400" />
                    <span>Cheats & Mods [Y]</span>
                  </button>
                </div>

              </div>

            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 font-mono">
              {liveLoading ? 'Loading Storefront ROMs...' : 'No games match your search or filter. Try another console or query.'}
            </div>
          )}

          {/* HORIZONTAL 10-FOOT COVERFLOW CAROUSEL */}
          <div className="pt-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-3 px-1">
              <span>
                {activeCategory === 'consoles' ? `${activePlatform} Catalog` : (activeCategory === 'downloaded' ? 'Installed Games' : 'Storefront Catalog')} ({totalFoundCount.toLocaleString()} Titles)
              </span>
              <span className="font-mono text-cyan-400">
                {displayGames.length > 0 ? `Card ${focusedIndex + 1} of ${displayGames.length}` : '0 Titles'}
              </span>
            </div>

            <div 
              ref={carouselRef}
              className="flex items-center gap-5 overflow-x-auto pb-6 pt-2 px-4 scrollbar-none scroll-smooth"
            >
              {displayGames.map((game, idx) => {
                const isFocused = idx === focusedIndex;
                const isDownloaded = installedGameIds.has(game.id) || game.direct_download_url?.startsWith('file://');
                return (
                  <div
                    key={game.id || idx}
                    onClick={() => {
                      playClick();
                      setFocusedIndex(idx);
                      if (isDownloaded) {
                        onSelectGame(game);
                      } else {
                        onStartDownload(game, 'direct');
                      }
                    }}
                    className={`relative shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
                      isFocused
                        ? 'w-44 h-60 -translate-y-2 scale-110 shadow-2xl z-20 ring-4 ring-cyan-400 ring-offset-4 ring-offset-black'
                        : 'w-36 h-48 opacity-65 hover:opacity-90 hover:scale-102 z-10'
                    }`}
                  >
                    {/* Box Art Thumbnail */}
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                      {game.box_art_2d ? (
                        <img
                          src={game.box_art_2d}
                          alt={game.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`; }}
                        />
                      ) : (
                        <Gamepad2 className="w-10 h-10 text-slate-600" />
                      )}
                    </div>

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-cyan-300 font-mono w-max">
                          {game.platform}
                        </span>
                        {isDownloaded && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400" title="Downloaded" />
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-white truncate drop-shadow">
                        {game.title}
                      </h4>
                    </div>

                    {/* Active Focus Pill */}
                    {isFocused && (
                      <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-cyan-400 shadow-glow-cyan animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* BOTTOM CONTROLLER NAVIGATION LEGEND */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5 text-slate-200">
                <ControllerGlyph button="A" size="sm" />
                <span>{isFocusedInstalled ? 'Play Game' : 'Download ROM'}</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-200">
                <ControllerGlyph button="X" size="sm" />
                <span>Favorite</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-200">
                <ControllerGlyph button="Y" size="sm" />
                <span>Cheats</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-bold">D-Pad / Sticks</span>
                <span>Browse</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-200">
                <ControllerGlyph button="Guide" size="sm" />
                <span>Quick Menu</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-slate-300 text-[10px]">
                [Select / Tab] Switch to Desktop UI
              </span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
