import React from 'react';
import { Tag, Sparkles } from 'lucide-react';

const GENRE_PRESETS = [
  "ALL",
  "RPG",
  "Platformer",
  "Action-Adventure",
  "Fighting",
  "Shooter",
  "Racing",
  "Survival Horror",
  "Sports",
  "Strategy"
];

export default function GenreFilter({ selectedGenre, onSelectGenre, genresData = [] }) {
  const getCount = (name) => {
    if (name === "ALL") return null;
    const found = genresData.find(g => g.name.toLowerCase() === name.toLowerCase());
    return found ? found.count : null;
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-6">
      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider pl-1 pr-2 shrink-0">
        <Tag className="w-3.5 h-3.5 text-violet-400" />
        <span>Genre:</span>
      </div>

      {GENRE_PRESETS.map((genre) => {
        const isSelected = selectedGenre === genre;
        const count = getCount(genre);

        // Hide preset if not available in current console context unless it is ALL
        if (genre !== "ALL" && count === 0) return null;

        return (
          <button
            key={genre}
            onClick={() => onSelectGenre(genre)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border flex items-center gap-1.5 ${
              isSelected
                ? 'bg-violet-600 text-white border-violet-400 shadow-glow-purple scale-105 font-bold'
                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/5 hover:border-white/15'
            }`}
          >
            <span>{genre === "ALL" ? "All Genres" : genre}</span>
            {count !== null && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isSelected ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
