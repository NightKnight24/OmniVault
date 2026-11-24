import React, { useRef, useState, useEffect } from 'react';
import { Tag, ChevronLeft, ChevronRight, Building2, Award, Users, Calendar } from 'lucide-react';

export default function GenreFilter({
  selectedGenre = 'ALL',
  onSelectGenre,
  genresData = [],
  catalogFilters = {},
  selectedDeveloper = 'ALL',
  onSelectDeveloper,
  selectedPublisher = 'ALL',
  onSelectPublisher,
  selectedPlayers = 'ALL',
  onSelectPlayers,
  selectedEsrb = 'ALL',
  onSelectEsrb,
  selectedDecade = 'ALL',
  onSelectDecade,
}) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
  }, [genresData]);

  const handleScroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
      setTimeout(checkScroll, 350);
    }
  };

  const developers = catalogFilters.developers || [];
  const publishers = catalogFilters.publishers || [];
  const esrbRatings = catalogFilters.esrb_ratings || [];
  const decades = catalogFilters.decades || [];
  const coopCount = catalogFilters.coop_count || 0;

  return (
    <div className="space-y-3 mb-6">
      {/* 1. Dynamic All-Genres & Categories Row (All 30 TheGamesDB Categories) */}
      <div className="relative group">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScroll(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-slate-900/95 border border-violet-500/40 text-violet-300 flex items-center justify-center shadow-lg hover:bg-slate-800 cursor-pointer"
            aria-label="Scroll genres left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none scroll-smooth px-0.5"
        >
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider pl-1 pr-2 shrink-0">
            <Tag className="w-3.5 h-3.5 text-violet-400" />
            <span>Category:</span>
          </div>

          <button
            type="button"
            onClick={() => onSelectGenre && onSelectGenre('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedGenre === 'ALL'
                ? 'bg-violet-600 text-white border-violet-400 shadow-glow-purple font-bold'
                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/5 hover:border-white/15'
            }`}
          >
            <span>All Categories</span>
          </button>

          {genresData.map((g) => {
            const isSelected = selectedGenre.toLowerCase() === g.name.toLowerCase();
            return (
              <button
                key={g.name}
                type="button"
                onClick={() => onSelectGenre && onSelectGenre(g.name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-violet-600 text-white border-violet-400 shadow-glow-purple font-bold'
                    : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-white/5 hover:border-white/15'
                }`}
              >
                <span>{g.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {g.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={() => handleScroll(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-slate-900/95 border border-violet-500/40 text-violet-300 flex items-center justify-center shadow-lg hover:bg-slate-800 cursor-pointer"
            aria-label="Scroll genres right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2. TheGamesDB Metadata Organizers Row (Developer, Publisher, Players/Co-op, ESRB, Era) */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {/* Developer Filter */}
        <div className="flex items-center gap-1.5 bg-slate-900/75 border border-white/10 rounded-xl px-2.5 py-1.5">
          <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <select
            value={selectedDeveloper}
            onChange={(e) => onSelectDeveloper && onSelectDeveloper(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none max-w-[175px] cursor-pointer"
            aria-label="Filter by Developer"
          >
            <option value="ALL" className="bg-slate-950">All Developers</option>
            {developers.map((d) => (
              <option key={d.name} value={d.name} className="bg-slate-950">
                {d.name} ({d.count.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        {/* Publisher Filter */}
        <div className="flex items-center gap-1.5 bg-slate-900/75 border border-white/10 rounded-xl px-2.5 py-1.5">
          <Award className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <select
            value={selectedPublisher}
            onChange={(e) => onSelectPublisher && onSelectPublisher(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none max-w-[175px] cursor-pointer"
            aria-label="Filter by Publisher"
          >
            <option value="ALL" className="bg-slate-950">All Publishers</option>
            {publishers.map((p) => (
              <option key={p.name} value={p.name} className="bg-slate-950">
                {p.name} ({p.count.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        {/* Players / Co-op Filter */}
        <div className="flex items-center gap-1.5 bg-slate-900/75 border border-white/10 rounded-xl px-2.5 py-1.5">
          <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <select
            value={selectedPlayers}
            onChange={(e) => onSelectPlayers && onSelectPlayers(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
            aria-label="Filter by Players or Co-op"
          >
            <option value="ALL" className="bg-slate-950">All Players</option>
            <option value="1" className="bg-slate-950">Single Player (1P)</option>
            <option value="2+" className="bg-slate-950">Multiplayer (2+ Players)</option>
            <option value="4+" className="bg-slate-950">Party / 4+ Players</option>
            <option value="coop" className="bg-slate-950">
              Co-op Supported{coopCount > 0 ? ` (${coopCount.toLocaleString()})` : ''}
            </option>
          </select>
        </div>

        {/* Age Rating (ESRB) Filter */}
        {esrbRatings.length > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-900/75 border border-white/10 rounded-xl px-2.5 py-1.5">
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">ESRB</span>
            <select
              value={selectedEsrb}
              onChange={(e) => onSelectEsrb && onSelectEsrb(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none max-w-[160px] cursor-pointer"
              aria-label="Filter by ESRB Rating"
            >
              <option value="ALL" className="bg-slate-950">All Age Ratings</option>
              {esrbRatings.map((r) => (
                <option key={r.name} value={r.name} className="bg-slate-950">
                  {r.name} ({r.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Release Era / Decade Filter */}
        {decades.length > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-900/75 border border-white/10 rounded-xl px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <select
              value={selectedDecade}
              onChange={(e) => onSelectDecade && onSelectDecade(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              aria-label="Filter by Release Era"
            >
              <option value="ALL" className="bg-slate-950">All Eras</option>
              {decades.map((dec) => (
                <option key={dec.decade} value={String(dec.decade)} className="bg-slate-950">
                  {dec.label} ({dec.count.toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
