import React from 'react';
import GameCard from './GameCard';
import Pagination from './Pagination';
import { Sparkles, SlidersHorizontal, Compass, X } from 'lucide-react';

export default function GameGrid({ 
  games, 
  onSelectGame, 
  onQuickDownload, 
  onToggleFavorite,
  sort, 
  setSort, 
  onOpenScraper,
  searchTerm,
  selectedFamily = 'ALL',
  selectedPlatform,
  selectedGenre,
  onResetFilters,
  pagination
}) {
  const hasActiveFilters = selectedFamily !== 'ALL' || selectedPlatform !== 'ALL' || selectedGenre !== 'ALL' || !!searchTerm;

  const familyLabels = {
    playstation: 'PlayStation',
    nintendo_home: 'Nintendo Home',
    nintendo_handheld: 'Nintendo Handheld',
    xbox: 'Xbox',
    sega: 'Sega',
    arcade_retro: 'Arcade & Retro',
  };

  return (
    <div className="space-y-6">
      
      {/* Header with Results Count & Sort Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display font-bold text-xl text-white tracking-wide">
              Storefront Catalog
            </h2>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
              {pagination.total.toLocaleString()} total
            </span>
          </div>

          {/* Active Filter Badges */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-slate-400">Filters:</span>
              {selectedFamily !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-900/40 border border-blue-500/30 text-blue-300 text-xs font-semibold">
                  Family: {familyLabels[selectedFamily] || selectedFamily}
                </span>
              )}
              {selectedPlatform !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-cyan-900/40 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                  Console: {selectedPlatform}
                </span>
              )}
              {selectedGenre !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-violet-900/40 border border-violet-500/30 text-violet-300 text-xs font-semibold">
                  Genre: {selectedGenre}
                </span>
              )}
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-800 border border-white/10 text-white text-xs font-semibold">
                  Search: "{searchTerm}"
                </span>
              )}
              <button
                onClick={onResetFilters}
                className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
          >
            <option value="rating_desc">★ Top Rated</option>
            <option value="popularity_desc">🔥 Most Popular</option>
            <option value="title_asc">🔤 Title (A to Z)</option>
            <option value="title_desc">🔤 Title (Z to A)</option>
            <option value="size_desc">💾 File Size (Largest)</option>
            <option value="size_asc">💾 File Size (Smallest)</option>
            <option value="year_desc">📅 Release Year (Newest)</option>
            <option value="year_asc">📅 Release Year (Oldest)</option>
          </select>
        </div>
      </div>

      {/* Grid of Games */}
      {games.length === 0 ? (
        <div className="py-20 text-center rounded-3xl border border-dashed border-white/10 bg-slate-900/40 p-8">
          <Compass className="w-12 h-12 mx-auto text-cyan-400 mb-3 opacity-60" />
          <h3 className="font-display font-bold text-white text-lg mb-1">
            No games found matching your current filter
          </h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-5">
            Try choosing a different genre or console, or clear your search query to see the verified library.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onResetFilters}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs shadow-glow-cyan transition-all hover:scale-105 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-6 gap-6">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onSelect={onSelectGame}
                onQuickDownload={onQuickDownload}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </>
      )}

    </div>
  );
}
