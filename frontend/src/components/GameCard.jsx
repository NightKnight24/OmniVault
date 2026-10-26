import React, { useState, useEffect } from 'react';
import { Star, Download, Film, Sparkles, Heart, Gamepad2 } from 'lucide-react';
import { playClick, playCoin, playFavoriteSound } from '../utils/soundEffects';

const PLATFORM_COLORS = {
  SNES: 'bg-purple-900/40 text-purple-300 border-purple-500/40',
  N64: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/40',
  PS1: 'bg-blue-900/40 text-blue-300 border-blue-500/40',
  PS2: 'bg-indigo-900/40 text-indigo-300 border-indigo-500/40',
  PS3: 'bg-sky-900/40 text-sky-300 border-sky-500/40',
  PS4: 'bg-blue-950/60 text-blue-200 border-blue-400/40',
  Switch: 'bg-red-900/40 text-red-300 border-red-500/40',
  GBA: 'bg-amber-900/40 text-amber-300 border-amber-500/40',
  Genesis: 'bg-red-900/40 text-red-300 border-red-500/40',
  NES: 'bg-rose-900/40 text-rose-300 border-rose-500/40',
  Arcade: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/40',
};

const PLATFORM_GRADIENTS = {
  SNES: 'from-purple-950 via-slate-900 to-indigo-950',
  N64: 'from-emerald-950 via-slate-900 to-teal-950',
  PS1: 'from-slate-900 via-blue-950 to-slate-950',
  PS2: 'from-blue-950 via-slate-900 to-indigo-950',
  PS3: 'from-slate-950 via-sky-950 to-slate-900',
  PS4: 'from-blue-950 via-slate-950 to-blue-900',
  Switch: 'from-red-950 via-slate-900 to-rose-950',
  GBA: 'from-amber-950 via-slate-900 to-orange-950',
  Genesis: 'from-red-950 via-slate-900 to-zinc-950',
  NES: 'from-rose-950 via-slate-900 to-stone-950',
  Arcade: 'from-amber-950 via-slate-900 to-yellow-950',
};

const MODERN_PLATFORMS = ['Switch', 'Xbox360', 'PS3', 'PS4', 'PSVita', '3DS', 'Xbox', 'WiiU', 'Arcade', 'Wii', 'Saturn', 'Dreamcast'];

const formatSize = (mb) => {
  if (!mb || mb <= 0) return 'ROM';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${Number(mb).toFixed(1)} MB`;
};

export default function GameCard({ game, onSelect, onQuickDownload, onToggleFavorite }) {
  const badgeColor = PLATFORM_COLORS[game.platform] || 'bg-cyan-900/40 text-cyan-300 border-cyan-500/40';
  const platformGradient = PLATFORM_GRADIENTS[game.platform] || 'from-slate-950 via-slate-900 to-cyan-950';

  const isModern = MODERN_PLATFORMS.includes(game.platform);
  
  // Universal high-performance cover resolver
  const getInitialCover = () => {
    if (game.box_art_2d && !game.box_art_2d.includes('githubusercontent.com/libretro')) {
      return game.box_art_2d;
    }
    const fb = game.box_art_2d ? `&fallback_url=${encodeURIComponent(game.box_art_2d)}` : '';
    return `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}${fb}`;
  };

  const [imgSrc, setImgSrc] = useState(getInitialCover);
  const [useProceduralCover, setUseProceduralCover] = useState(false);

  useEffect(() => {
    setImgSrc(getInitialCover());
    setUseProceduralCover(false);
  }, [game?.id, game?.box_art_2d, game?.title, game?.platform]);

  const handleCardClick = () => {
    playClick();
    onSelect(game);
  };

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    playFavoriteSound();
    if (onToggleFavorite) onToggleFavorite(game);
  };

  const handleDownloadClick = (e) => {
    e.stopPropagation();
    playCoin();
    onQuickDownload(game);
  };

  const handleImageError = () => {
    if (!imgSrc || !imgSrc.includes('/api/covers/image')) {
      // Direct jump to Covers API which resolves Wikipedia official art and caches locally
      setImgSrc(`/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`);
    } else {
      setUseProceduralCover(true);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="group relative flex flex-col bg-slate-900/80 hover:bg-slate-800/90 rounded-2xl border border-white/10 hover:border-cyan-500/50 p-3 transition-all duration-300 hover:shadow-glow-cyan hover:-translate-y-1.5 cursor-pointer"
    >
      {/* Box Art Container with Aspect Ratio */}
      <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-slate-950 mb-3 border border-white/5 shadow-md">
        {!useProceduralCover && imgSrc ? (
          <img
            src={imgSrc}
            alt={game.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={handleImageError}
          />
        ) : (
          /* Procedural Authentic Physical Case Cover */
          <div className={`w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br ${platformGradient} border border-white/10 relative overflow-hidden group-hover:scale-105 transition-transform duration-500`}>
            {/* Holographic background line accent */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-black/40 pointer-events-none" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Top case header */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 drop-shadow">
                {game.platform_name || game.platform}
              </span>
              <Gamepad2 className="w-4 h-4 text-slate-400 opacity-60" />
            </div>

            {/* Middle: Game Title Artwork Display */}
            <div className="relative z-10 my-auto text-center px-1">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                <Sparkles className="w-5 h-5 text-cyan-400" />
              </div>
              <h4 className="font-display font-black text-sm text-white line-clamp-3 leading-snug tracking-tight drop-shadow-md">
                {game.title}
              </h4>
              {game.developer && (
                <p className="text-[10px] font-semibold text-slate-400 mt-1 line-clamp-1">
                  {game.developer}
                </p>
              )}
            </div>

            {/* Bottom case footer */}
            <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-slate-400 font-semibold">
              <span>{game.genre || 'Classic'}</span>
              <span>{game.release_year || 'Preserved'}</span>
            </div>
          </div>
        )}

        {/* Hover Overlay with Trailer Icon */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Film className="w-6 h-6 ml-0.5" />
          </div>
        </div>

        {/* Platform Badge (Top Left) */}
        <div className="absolute top-2.5 left-2.5">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border backdrop-blur-md shadow ${badgeColor}`}>
            {game.platform}
          </span>
        </div>

        {/* Heart Favorite Button (Top Right) */}
        <button
          onClick={handleFavoriteClick}
          className={`absolute top-2.5 right-2.5 p-1.5 rounded-full backdrop-blur-md border transition-all hover:scale-110 shadow z-10 ${
            game.is_favorite 
              ? 'bg-rose-500/90 text-white border-rose-400' 
              : 'bg-black/60 text-slate-400 border-white/10 hover:text-rose-400'
          }`}
          title={game.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Heart className={`w-3.5 h-3.5 ${game.is_favorite ? 'fill-white' : ''}`} />
        </button>

        {/* Rating Badge (Bottom Right of Image) */}
        {Number(game.rating) > 0 && (
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-amber-400 text-xs font-bold shadow">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{Number(game.rating).toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-medium">{game.genre}</span>
            <span>{game.release_year || ''}</span>
          </div>

          <h3 className="font-display font-bold text-white text-base group-hover:text-cyan-400 transition-colors line-clamp-1 mb-1">
            {game.title}
          </h3>

          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
            {game.description}
          </p>
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
          <span className="text-[11px] font-semibold text-slate-400">
            {formatSize(game.file_size_mb)} • {game.rom_format || 'ROM'}
          </span>

          <button
            onClick={handleDownloadClick}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-black text-cyan-400 border border-slate-700 transition-all hover:scale-110 cursor-pointer"
            title="Download ROM"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
