import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Gamepad2, Layers, ChevronLeft, ChevronRight, Tv, Smartphone, Disc, Sparkles, Monitor, Cpu } from 'lucide-react';

export const FAMILIES = [
  { id: 'ALL', label: 'All Systems', badge: 'ALL', icon: Layers },
  { id: 'playstation', label: 'PlayStation', badge: 'SONY', icon: Disc, color: 'border-blue-500/40 text-blue-400 bg-blue-950/40' },
  { id: 'nintendo_home', label: 'Nintendo Home', badge: 'NIN-HOME', icon: Tv, color: 'border-red-500/40 text-red-400 bg-red-950/40' },
  { id: 'nintendo_handheld', label: 'Nintendo Handheld', badge: 'PORTABLE', icon: Smartphone, color: 'border-amber-500/40 text-amber-400 bg-amber-950/40' },
  { id: 'xbox', label: 'Xbox', badge: 'MICROSOFT', icon: Gamepad2, color: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/40' },
  { id: 'pc_desktop', label: 'PC & Mac', badge: 'PC / MAC', icon: Monitor, color: 'border-sky-500/40 text-sky-300 bg-sky-950/40' },
  { id: 'sega', label: 'Sega', badge: 'SEGA', icon: Sparkles, color: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/40' },
  { id: 'arcade_retro', label: 'Arcade & Retro', badge: 'RETRO', icon: Disc, color: 'border-purple-500/40 text-purple-400 bg-purple-950/40' },
  { id: 'computers_mobile', label: 'Computers & Mobile', badge: 'COMP / MOB', icon: Cpu, color: 'border-indigo-500/40 text-indigo-300 bg-indigo-950/40' },
];

export const ALL_PLATFORMS = [
  { id: 'Switch2', label: 'Nintendo Switch 2', badge: 'NSW2', family: 'nintendo_home' },
  { id: 'Switch', label: 'Nintendo Switch', badge: 'NSW', family: 'nintendo_home' },
  { id: 'WiiU', label: 'Nintendo Wii U', badge: 'WIIU', family: 'nintendo_home' },
  { id: 'Wii', label: 'Nintendo Wii', badge: 'WII', family: 'nintendo_home' },
  { id: 'GameCube', label: 'GameCube', badge: 'GCN', family: 'nintendo_home' },
  { id: 'N64', label: 'Nintendo 64', badge: 'N64', family: 'nintendo_home' },
  { id: 'SNES', label: 'Super Nintendo', badge: 'SNES', family: 'nintendo_home' },
  { id: 'NES', label: 'NES 8-Bit', badge: 'NES', family: 'nintendo_home' },
  { id: 'FDS', label: 'Famicom Disk System', badge: 'FDS', family: 'nintendo_home' },
  { id: '3DS', label: 'Nintendo 3DS', badge: '3DS', family: 'nintendo_handheld' },
  { id: 'NDS', label: 'Nintendo DS', badge: 'NDS', family: 'nintendo_handheld' },
  { id: 'GBA', label: 'Game Boy Advance', badge: 'GBA', family: 'nintendo_handheld' },
  { id: 'GBC', label: 'Game Boy Color', badge: 'GBC', family: 'nintendo_handheld' },
  { id: 'GB', label: 'Game Boy', badge: 'GB', family: 'nintendo_handheld' },
  { id: 'VirtualBoy', label: 'Virtual Boy', badge: 'VB', family: 'nintendo_handheld' },
  { id: 'GameAndWatch', label: 'Game & Watch', badge: 'G&W', family: 'nintendo_handheld' },
  { id: 'PokemonMini', label: 'Pokémon Mini', badge: 'PMINI', family: 'nintendo_handheld' },
  { id: 'PS5', label: 'PlayStation 5', badge: 'PS5', family: 'playstation' },
  { id: 'PS4', label: 'PlayStation 4', badge: 'PS4', family: 'playstation' },
  { id: 'PS3', label: 'PlayStation 3', badge: 'PS3', family: 'playstation' },
  { id: 'PS2', label: 'PlayStation 2', badge: 'PS2', family: 'playstation' },
  { id: 'PS1', label: 'PlayStation 1', badge: 'PS1', family: 'playstation' },
  { id: 'PSP', label: 'PlayStation Portable', badge: 'PSP', family: 'playstation' },
  { id: 'PSVita', label: 'PlayStation Vita', badge: 'PSV', family: 'playstation' },
  { id: 'XboxSeriesX', label: 'Xbox Series X/S', badge: 'XSX', family: 'xbox' },
  { id: 'XboxOne', label: 'Xbox One', badge: 'XONE', family: 'xbox' },
  { id: 'Xbox360', label: 'Xbox 360', badge: 'X360', family: 'xbox' },
  { id: 'Xbox', label: 'Original Xbox', badge: 'XBOX', family: 'xbox' },
  { id: 'Windows', label: 'Windows (PC)', badge: 'WIN', family: 'pc_desktop' },
  { id: 'macOS', label: 'macOS', badge: 'MAC', family: 'pc_desktop' },
  { id: 'Dreamcast', label: 'Sega Dreamcast', badge: 'DC', family: 'sega' },
  { id: 'Saturn', label: 'Sega Saturn', badge: 'SAT', family: 'sega' },
  { id: 'SegaCD', label: 'Sega CD', badge: 'SCD', family: 'sega' },
  { id: 'Sega32X', label: 'Sega 32X', badge: '32X', family: 'sega' },
  { id: 'Genesis', label: 'Sega Genesis / MD', badge: 'GEN', family: 'sega' },
  { id: 'MasterSystem', label: 'Master System', badge: 'SMS', family: 'sega' },
  { id: 'GameGear', label: 'Game Gear', badge: 'GG', family: 'sega' },
  { id: 'SG1000', label: 'Sega SG-1000', badge: 'SG1K', family: 'sega' },
  { id: 'SegaPico', label: 'Sega Pico', badge: 'PICO', family: 'sega' },
  { id: 'Arcade', label: 'Arcade Classics', badge: 'ARC', family: 'arcade_retro' },
  { id: 'NeoGeo', label: 'Neo Geo AES/MVS', badge: 'NEO', family: 'arcade_retro' },
  { id: 'NeoGeoCD', label: 'Neo Geo CD', badge: 'NGCD', family: 'arcade_retro' },
  { id: 'NGPC', label: 'Neo Geo Pocket Color', badge: 'NGPC', family: 'arcade_retro' },
  { id: 'NGP', label: 'Neo Geo Pocket', badge: 'NGP', family: 'arcade_retro' },
  { id: 'TG16', label: 'TurboGrafx-16', badge: 'TG16', family: 'arcade_retro' },
  { id: 'TGCD', label: 'TurboGrafx-CD', badge: 'TGCD', family: 'arcade_retro' },
  { id: 'PCFX', label: 'NEC PC-FX', badge: 'PCFX', family: 'arcade_retro' },
  { id: '3DO', label: '3DO', badge: '3DO', family: 'arcade_retro' },
  { id: 'Jaguar', label: 'Atari Jaguar', badge: 'JAG', family: 'arcade_retro' },
  { id: 'JaguarCD', label: 'Atari Jaguar CD', badge: 'JCD', family: 'arcade_retro' },
  { id: 'Lynx', label: 'Atari Lynx', badge: 'LYNX', family: 'arcade_retro' },
  { id: 'Atari2600', label: 'Atari 2600', badge: 'A26', family: 'arcade_retro' },
  { id: 'Atari5200', label: 'Atari 5200', badge: 'A52', family: 'arcade_retro' },
  { id: 'Atari7800', label: 'Atari 7800', badge: 'A78', family: 'arcade_retro' },
  { id: 'ColecoVision', label: 'ColecoVision', badge: 'COL', family: 'arcade_retro' },
  { id: 'Intellivision', label: 'Intellivision', badge: 'INTV', family: 'arcade_retro' },
  { id: 'Vectrex', label: 'Vectrex', badge: 'VEC', family: 'arcade_retro' },
  { id: 'CDi', label: 'Philips CD-i', badge: 'CDI', family: 'arcade_retro' },
  { id: 'WonderSwan', label: 'WonderSwan', badge: 'WS', family: 'arcade_retro' },
  { id: 'WonderSwanColor', label: 'WonderSwan Color', badge: 'WSC', family: 'arcade_retro' },
  { id: 'Playdate', label: 'Playdate', badge: 'PD', family: 'arcade_retro' },
  { id: 'Evercade', label: 'Evercade', badge: 'EVR', family: 'arcade_retro' },
  { id: 'C64', label: 'Commodore 64', badge: 'C64', family: 'computers_mobile' },
  { id: 'Amiga', label: 'Commodore Amiga', badge: 'AMI', family: 'computers_mobile' },
  { id: 'AmigaCD32', label: 'Amiga CD32', badge: 'CD32', family: 'computers_mobile' },
  { id: 'ZXSpectrum', label: 'ZX Spectrum', badge: 'ZX', family: 'computers_mobile' },
  { id: 'AmstradCPC', label: 'Amstrad CPC', badge: 'CPC', family: 'computers_mobile' },
  { id: 'MSX', label: 'MSX', badge: 'MSX', family: 'computers_mobile' },
  { id: 'AtariST', label: 'Atari ST', badge: 'AST', family: 'computers_mobile' },
  { id: 'Atari800', label: 'Atari 800', badge: 'A800', family: 'computers_mobile' },
  { id: 'AppleII', label: 'Apple II', badge: 'APL2', family: 'computers_mobile' },
  { id: 'PC98', label: 'NEC PC-98', badge: 'PC98', family: 'computers_mobile' },
  { id: 'PC88', label: 'NEC PC-88', badge: 'PC88', family: 'computers_mobile' },
  { id: 'X68000', label: 'Sharp X68000', badge: 'X68K', family: 'computers_mobile' },
  { id: 'FMTowns', label: 'FM Towns', badge: 'FMT', family: 'computers_mobile' },
  { id: 'Android', label: 'Android', badge: 'AND', family: 'computers_mobile' },
  { id: 'iOS', label: 'iOS', badge: 'IOS', family: 'computers_mobile' },
  { id: 'OculusQuest', label: 'Meta Quest', badge: 'VR', family: 'computers_mobile' },
];

export default function PlatformFilter({ 
  selectedFamily = 'ALL',
  onSelectFamily,
  selectedPlatform = 'ALL', 
  onSelectPlatform, 
  platformsData = [] 
}) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 8);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 8);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    let observer = null;
    if (scrollRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => checkScroll());
      observer.observe(scrollRef.current);
    }
    return () => {
      window.removeEventListener('resize', checkScroll);
      if (observer) observer.disconnect();
    };
  }, [platformsData, selectedFamily]);

  const handleScroll = (direction) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction * 350, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  const mergedPlatforms = useMemo(() => {
    const knownMap = new Map(ALL_PLATFORMS.map((p) => [p.id.toLowerCase(), p]));
    const extras = [];
    for (const item of platformsData) {
      if (!item?.platform) continue;
      const key = item.platform.toLowerCase();
      if (!knownMap.has(key)) {
        extras.push({
          id: item.platform,
          label: item.platform_name || item.platform,
          badge: item.platform.slice(0, 4).toUpperCase(),
          family: item.family || 'computers_mobile',
        });
      }
    }
    return [...ALL_PLATFORMS, ...extras];
  }, [platformsData]);

  const getPlatformCount = (id) => {
    if (id === 'ALL') return null;
    const p = platformsData.find(item => item.platform && item.platform.toLowerCase() === id.toLowerCase());
    return p ? p.game_count : null;
  };

  const getFamilyCount = (famId) => {
    if (famId === 'ALL') {
      return platformsData.reduce((acc, p) => acc + (p.game_count || 0), 0);
    }
    const matchingPlats = new Set(
      mergedPlatforms.filter(p => p.family === famId).map(p => p.id.toLowerCase())
    );
    return platformsData
      .filter(p => p.platform && (matchingPlats.has(p.platform.toLowerCase()) || p.family === famId))
      .reduce((acc, p) => acc + (p.game_count || 0), 0);
  };

  // Determine which consoles to display under current family (hide 0-count obscure systems unless selected)
  const visiblePlatforms = useMemo(() => {
    const base = selectedFamily === 'ALL'
      ? mergedPlatforms
      : mergedPlatforms.filter(p => p.family === selectedFamily);
    if (platformsData.length === 0) return base;
    return base.filter((p) => {
      if (selectedPlatform === p.id) return true;
      const cnt = getPlatformCount(p.id);
      return cnt !== null && cnt > 0;
    });
  }, [mergedPlatforms, platformsData, selectedFamily, selectedPlatform]);

  const currentFamilyObj = FAMILIES.find(f => f.id === selectedFamily) || FAMILIES[0];

  return (
    <div className="space-y-3 mb-5">
      {/* 1. Hardware Families Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FAMILIES.map((fam) => {
          const isSelected = selectedFamily === fam.id;
          const count = getFamilyCount(fam.id);
          const Icon = fam.icon || Gamepad2;
          if (fam.id !== 'ALL' && platformsData.length > 0 && count === 0 && !isSelected) return null;

          return (
            <button
              key={fam.id}
              onClick={() => {
                if (onSelectFamily) onSelectFamily(fam.id);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border cursor-pointer shrink-0 ${
                isSelected
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black border-cyan-400 font-bold shadow-glow-cyan scale-105'
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-white/10 hover:border-white/20'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-black' : 'text-slate-400'}`} />
              <span>{fam.label}</span>
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  isSelected ? 'bg-black/25 text-black font-black' : 'bg-slate-800 text-slate-400'
                }`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Platform / Consoles Row with Left/Right Scroll Controls */}
      <div className="relative group">
        {canScrollLeft && (
          <button
            onClick={() => handleScroll(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/95 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-lg hover:scale-110 hover:bg-slate-800 transition-all cursor-pointer backdrop-blur-md"
            title="Scroll Left"
            aria-label="Scroll left through consoles"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-1 w-12 bg-gradient-to-r from-[#080c14] to-transparent pointer-events-none z-10" />
        )}

        <div 
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent scroll-smooth px-1"
        >
          {/* "All" button within current family */}
          <button
            onClick={() => onSelectPlatform('ALL')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border cursor-pointer shrink-0 ${
              selectedPlatform === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-bold shadow-sm'
                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 border-white/5 hover:border-white/10'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All {selectedFamily === 'ALL' ? 'Consoles' : currentFamilyObj.label}</span>
          </button>

          {/* Individual Console Pills */}
          {visiblePlatforms.map((plat) => {
            const isSelected = selectedPlatform === plat.id;
            const count = getPlatformCount(plat.id);

            return (
              <button
                key={plat.id}
                onClick={() => onSelectPlatform(plat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-cyan-500 text-black border-cyan-400 font-bold shadow-glow-cyan'
                    : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/10 hover:border-white/20'
                }`}
              >
                <span className="font-mono text-[10px] opacity-75 font-bold uppercase">{plat.badge}</span>
                <span>{plat.label}</span>
                {count !== null && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isSelected ? 'bg-black/25 text-black font-black' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-1 w-12 bg-gradient-to-l from-[#080c14] to-transparent pointer-events-none z-10" />
        )}

        {canScrollRight && (
          <button
            onClick={() => handleScroll(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/95 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-lg hover:scale-110 hover:bg-slate-800 transition-all cursor-pointer backdrop-blur-md"
            title="Scroll Right"
            aria-label="Scroll right through consoles"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
