import React, { useState, useEffect } from 'react';
import { Play, Download, Star, Sparkles, Film, ArrowRight, Gamepad2 } from 'lucide-react';

const formatSize = (mb) => {
  if (!mb || mb <= 0) return 'ROM';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${Number(mb).toFixed(1)} MB`;
};

export default function HeroBanner({ game, onSelectGame, onQuickDownload }) {
  if (!game) return null;

  const getCover = () => {
    if (game.box_art_3d && !game.box_art_3d.includes('libretro-thumbnails/MAME')) return game.box_art_3d;
    if (game.box_art_2d && !game.box_art_2d.includes('libretro-thumbnails/MAME')) return game.box_art_2d;
    return `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`;
  };

  const getBackdrop = () => {
    if (game.backdrop) return game.backdrop;
    if (game.box_art_2d && !game.box_art_2d.includes('libretro-thumbnails/MAME')) return game.box_art_2d;
    return `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`;
  };

  const [backdropSrc, setBackdropSrc] = useState(getBackdrop);
  const [coverSrc, setCoverSrc] = useState(getCover);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setBackdropSrc(getBackdrop());
    setCoverSrc(getCover());
    setCoverFailed(false);
  }, [game?.id, game?.title, game?.platform]);

  const handleBackdropError = () => {
    const fallback = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`;
    if (backdropSrc !== fallback) {
      setBackdropSrc(fallback);
    }
  };

  const handleCoverError = () => {
    const fallback = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`;
    if (coverSrc !== fallback) {
      setCoverSrc(fallback);
    } else {
      setCoverFailed(true);
    }
  };

  return (
    <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-slate-900/60 shadow-2xl mb-8 group">
      {/* Background Cinematic Art with Gradients */}
      <div className="absolute inset-0 z-0">
        <img
          src={backdropSrc}
          alt={game.title}
          onError={handleBackdropError}
          className="w-full h-full object-cover object-center filter brightness-[0.45] contrast-125 scale-105 group-hover:scale-100 transition-transform duration-1000 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080c14] via-[#080c14]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080c14] via-[#080c14]/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 md:p-10 lg:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="max-w-2xl">
          {/* Featured Tag & Platform */}
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Featured Vault Classic
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs font-semibold">
              {game.platform}
            </span>
            {game.release_year ? (
              <span className="text-xs text-slate-400 font-medium">
                {game.release_year}
              </span>
            ) : null}
          </div>

          {/* Title */}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-wide mb-3 leading-tight drop-shadow-md">
            {game.title}
          </h1>

          {/* Rating & Genre */}
          <div className="flex items-center gap-4 mb-4 text-sm">
            {Number(game.rating) > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg text-amber-400 font-bold">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{Number(game.rating).toFixed(1)}</span>
                {game.rating_count ? (
                  <span className="text-xs text-amber-400/70 font-normal">({game.rating_count.toLocaleString()} ratings)</span>
                ) : null}
              </div>
            )}
            <span className="text-slate-300 font-medium">
              {game.genre}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 text-xs">
              {game.developer}
            </span>
          </div>

          {/* Synopsis Excerpt */}
          <p className="text-slate-300 text-sm md:text-base leading-relaxed line-clamp-3 mb-6 font-normal">
            {game.description}
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3.5">
            <button
              onClick={() => onSelectGame(game)}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-sm shadow-glow-cyan transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Film className="w-4 h-4 text-black" />
              <span>Watch Trailer & Details</span>
            </button>

            <button
              onClick={() => onQuickDownload(game)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-100 font-semibold text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Direct ROM Download ({formatSize(game.file_size_mb)})</span>
            </button>
          </div>
        </div>

        {/* 3D Box Art Preview */}
        <div className="hidden lg:block relative group-hover:rotate-1 transition-transform duration-500">
          <div className="w-56 h-72 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 transform -rotate-3 hover:rotate-0 transition-transform duration-300 bg-slate-800 flex items-center justify-center">
            {!coverFailed ? (
              <img
                src={coverSrc}
                alt={game.title}
                onError={handleCoverError}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-between p-4 bg-gradient-to-b from-slate-800 to-slate-950 text-center">
                <div className="px-2 py-0.5 rounded bg-cyan-900/50 text-cyan-300 border border-cyan-400/40 text-[10px] font-bold">
                  {game.platform}
                </div>
                <Gamepad2 className="w-12 h-12 text-slate-600" />
                <div className="text-xs font-bold text-white line-clamp-2">{game.title}</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
