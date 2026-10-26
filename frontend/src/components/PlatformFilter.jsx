import React, { useRef, useState, useEffect } from 'react';
import { Gamepad2, Layers, ChevronLeft, ChevronRight, Tv, Smartphone, Disc, Sparkles } from 'lucide-react';

export const FAMILIES = [
  { id: 'ALL', label: 'All Systems', badge: 'ALL', icon: Layers },
  { id: 'playstation', label: 'PlayStation', badge: 'SONY', icon: Disc, color: 'border-blue-500/40 text-blue-400 bg-blue-950/40' },
  { id: 'nintendo_home', label: 'Nintendo Home', badge: 'NIN-HOME', icon: Tv, color: 'border-red-500/40 text-red-400 bg-red-950/40' },
  { id: 'nintendo_handheld', label: 'Nintendo Handheld', badge: 'PORTABLE', icon: Smartphone, color: 'border-amber-500/40 text-amber-400 bg-amber-950/40' },
  { id: 'xbox', label: 'Xbox', badge: 'MICROSOFT', icon: Gamepad2, color: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/40' },
  { id: 'sega', label: 'Sega', badge: 'SEGA', icon: Sparkles, color: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/40' },
  { id: 'arcade_retro', label: 'Arcade & Retro', badge: 'RETRO', icon: Disc, color: 'border-purple-500/40 text-purple-400 bg-purple-950/40' },
];

export const ALL_PLATFORMS = [
  { id: 'Switch', label: 'Nintendo Switch', badge: 'NSW', family: 'nintendo_home' },
  { id: 'WiiU', label: 'Nintendo Wii U', badge: 'WIIU', family: 'nintendo_home' },
  { id: 'Wii', label: 'Nintendo Wii', badge: 'WII', family: 'nintendo_home' },
  { id: 'GameCube', label: 'GameCube', badge: 'GCN', family: 'nintendo_home' },
  { id: 'N64', label: 'Nintendo 64', badge: 'N64', family: 'nintendo_home' },
  { id: 'SNES', label: 'Super Nintendo', badge: 'SNES', family: 'nintendo_home' },
  { id: 'NES', label: 'NES 8-Bit', badge: 'NES', family: 'nintendo_home' },
  { id: '3DS', label: 'Nintendo 3DS', badge: '3DS', family: 'nintendo_handheld' },
  { id: 'NDS', label: 'Nintendo DS', badge: 'NDS', family: 'nintendo_handheld' },
  { id: 'GBA', label: 'Game Boy Advance', badge: 'GBA', family: 'nintendo_handheld' },
  { id: 'GBC', label: 'Game Boy Color', badge: 'GBC', family: 'nintendo_handheld' },
  { id: 'GB', label: 'Game Boy', badge: 'GB', family: 'nintendo_handheld' },
  { id: 'PS4', label: 'PlayStation 4', badge: 'PS4', family: 'playstation' },
  { id: 'PS3', label: 'PlayStation 3', badge: 'PS3', family: 'playstation' },
  { id: 'PS2', label: 'PlayStation 2', badge: 'PS2', family: 'playstation' },
  { id: 'PS1', label: 'PlayStation 1', badge: 'PS1', family: 'playstation' },
  { id: 'PSP', label: 'PlayStation Portable', badge: 'PSP', family: 'playstation' },
  { id: 'PSVita', label: 'PlayStation Vita', badge: 'PSV', family: 'playstation' },
  { id: 'Xbox360', label: 'Xbox 360', badge: 'X360', family: 'xbox' },
  { id: 'Xbox', label: 'Original Xbox', badge: 'XBOX', family: 'xbox' },
  { id: 'Dreamcast', label: 'Sega Dreamcast', badge: 'DC', family: 'sega' },
  { id: 'Saturn', label: 'Sega Saturn', badge: 'SAT', family: 'sega' },
  { id: 'SegaCD', label: 'Sega CD', badge: 'SCD', family: 'sega' },
  { id: 'Genesis', label: 'Sega Genesis', badge: 'GEN', family: 'sega' },
  { id: 'MasterSystem', label: 'Master System', badge: 'SMS', family: 'sega' },
  { id: 'GameGear', label: 'Game Gear', badge: 'GG', family: 'sega' },
  { id: 'Arcade', label: 'Arcade Classics', badge: 'ARC', family: 'arcade_retro' },
  { id: 'NeoGeo', label: 'Neo Geo AES/MVS', badge: 'NEO', family: 'arcade_retro' },
  { id: 'TG16', label: 'TurboGrafx-16', badge: 'TG16', family: 'arcade_retro' },
  { id: 'Atari2600', label: 'Atari 2600', badge: 'A26', family: 'arcade_retro' },
  { id: 'Atari5200', label: 'Atari 5200', badge: 'A52', family: 'arcade_retro' },
  { id: 'Atari7800', label: 'Atari 7800', badge: 'A78', family: 'arcade_retro' },
  { id: 'C64', label: 'Commodore 64', badge: 'C64', family: 'arcade_retro' },
  { id: 'WonderSwan', label: 'WonderSwan', badge: 'WS', family: 'arcade_retro' },
  { id: 'WonderSwanColor', label: 'WonderSwan Color', badge: 'WSC', family: 'arcade_retro' },
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
    return () => window.removeEventListener('resize', checkScroll);
  }, [platformsData, selectedFamily]);

  const handleScroll = (direction) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction * 350, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  const getPlatformCount = (id) => {
    if (id === 'ALL') return null;
    const p = platformsData.find(item => item.platform.toLowerCase() === id.toLowerCase());
    return p ? p.game_count : null;
  };

  const getFamilyCount = (famId) => {
    if (famId === 'ALL') {
      return platformsData.reduce((acc, p) => acc + (p.game_count || 0), 0);
    }
    const matchingPlats = ALL_PLATFORMS.filter(p => p.family === famId).map(p => p.id.toLowerCase());
    return platformsData
      .filter(p => matchingPlats.includes(p.platform.toLowerCase()))
      .reduce((acc, p) => acc + (p.game_count || 0), 0);
  };

  // Determine which consoles to display under current family
  const visiblePlatforms = selectedFamily === 'ALL'
    ? ALL_PLATFORMS
    : ALL_PLATFORMS.filter(p => p.family === selectedFamily);

  const currentFamilyObj = FAMILIES.find(f => f.id === selectedFamily) || FAMILIES[0];

  return (
    <div className="space-y-3 mb-6">
      {/* 1. Hardware Families Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FAMILIES.map((fam) => {
          const isSelected = selectedFamily === fam.id;
          const count = getFamilyCount(fam.id);
          const Icon = fam.icon || Gamepad2;

          return (
            <button
              key={fam.id}
              onClick={() => {
                if (onSelectFamily) onSelectFamily(fam.id);
                if (onSelectPlatform) onSelectPlatform('ALL');
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
