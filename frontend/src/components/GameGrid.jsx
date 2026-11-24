import React from 'react';
import GameCard from './GameCard';
import Pagination from './Pagination';
import { SlidersHorizontal, Compass, RefreshCw, Database } from 'lucide-react';

export default function GameGrid({
  games,
  onSelectGame,
  onQuickDownload,
  onToggleFavorite,
  sort,
  setSort,
  searchTerm,
  selectedFamily = 'ALL',
  selectedPlatform = 'ALL',
  selectedGenre = 'ALL',
  selectedDeveloper = 'ALL',
  selectedPublisher = 'ALL',
  selectedPlayers = 'ALL',
  selectedEsrb = 'ALL',
  selectedDecade = 'ALL',
  onResetFilters,
  onRefreshView,
  onResyncCatalog,
  isResyncingCatalog = false,
  isLoading = false,
  onSyncPlatform,
  syncingPlatform = null,
  globalVaultTotal = 0,
  pagination,
}) {
  const hasActiveFilters =
    selectedFamily !== 'ALL' ||
    selectedPlatform !== 'ALL' ||
    selectedGenre !== 'ALL' ||
    selectedDeveloper !== 'ALL' ||
    selectedPublisher !== 'ALL' ||
    selectedPlayers !== 'ALL' ||
    selectedEsrb !== 'ALL' ||
    selectedDecade !== 'ALL' ||
    !!searchTerm;

  const familyLabels = {
    playstation: 'PlayStation',
    nintendo_home: 'Nintendo Home',
    nintendo_handheld: 'Nintendo Handheld',
    xbox: 'Xbox',
    pc_desktop: 'PC & Mac',
    sega: 'Sega',
    arcade_retro: 'Arcade & Retro',
    computers_mobile: 'Computers & Mobile',
  };

  return (
    <div className="space-y-6">
      {/* Header with Results Count, Refresh / Resync Controls & Sort Dropdown */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-display font-bold text-xl text-white tracking-wide">
              ROM Catalog
            </h2>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
              {hasActiveFilters && globalVaultTotal > 0
                ? `${pagination.total.toLocaleString()} of ${globalVaultTotal.toLocaleString()} titles`
                : `${pagination.total.toLocaleString()} total titles`}
            </span>
            {isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-cyan-400 font-mono">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Filtering...</span>
              </span>
            )}
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
                  Category: {selectedGenre}
                </span>
              )}
              {selectedDeveloper !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-sky-900/40 border border-sky-500/30 text-sky-300 text-xs font-semibold">
                  Developer: {selectedDeveloper}
                </span>
              )}
              {selectedPublisher !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
                  Publisher: {selectedPublisher}
                </span>
              )}
              {selectedPlayers !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  Players: {selectedPlayers === 'coop' ? 'Co-op' : selectedPlayers}
                </span>
              )}
              {selectedEsrb !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-900/40 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                  ESRB: {selectedEsrb}
                </span>
              )}
              {selectedDecade !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-950/60 border border-amber-500/30 text-amber-200 text-xs font-semibold">
                  Era: {selectedDecade}s
                </span>
              )}
              {searchTerm && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-800 border border-white/10 text-white text-xs font-semibold">
                  Search: &ldquo;{searchTerm}&rdquo;
                </span>
              )}
              <button
                type="button"
                onClick={onResetFilters}
                className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2 ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Refresh, Resync Catalog & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {onRefreshView && (
            <button
              type="button"
              onClick={onRefreshView}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh current catalog filter & counts"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}

          {onResyncCatalog && (
            <button
              type="button"
              onClick={onResyncCatalog}
              disabled={isResyncingCatalog}
              className="px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-xs font-bold text-sky-300 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
              title="Download & resync all games, categories, developers, publishers & box art from TheGamesDB (0 API quota)"
            >
              <Database className={`w-3.5 h-3.5 text-sky-400 ${isResyncingCatalog ? 'animate-bounce' : ''}`} />
              <span>{isResyncingCatalog ? 'Resyncing TheGamesDB...' : 'Resync Catalog'}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
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
              <option value="developer_asc">🏢 Developer (A to Z)</option>
              <option value="year_desc">📅 Release Year (Newest)</option>
              <option value="year_asc">📅 Release Year (Oldest)</option>
              <option value="size_desc">💾 File Size (Largest)</option>
              <option value="size_asc">💾 File Size (Smallest)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid of Games */}
      {games.length === 0 && !isLoading ? (
        <div className="py-20 text-center rounded-3xl border border-dashed border-white/10 bg-slate-900/40 p-8">
          <Compass className="w-12 h-12 mx-auto text-cyan-400 mb-3 opacity-60" />
          <h3 className="font-display font-bold text-white text-lg mb-1">
            No games found matching your current filter
          </h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-5">
            Try choosing a different category, developer, or console, resyncing the TheGamesDB catalog, or clearing active filters.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {selectedPlatform && selectedPlatform !== 'ALL' && !searchTerm && selectedGenre === 'ALL' && onSyncPlatform && (
              <button
                type="button"
                onClick={() => onSyncPlatform(selectedPlatform)}
                disabled={syncingPlatform === selectedPlatform}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-black font-bold text-xs shadow-glow-cyan transition-all hover:scale-105 cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingPlatform === selectedPlatform ? 'animate-spin' : ''}`} />
                <span>
                  {syncingPlatform === selectedPlatform
                    ? `Syncing ${selectedPlatform}...`
                    : `Sync ${selectedPlatform} Titles (TheGamesDB)`}
                </span>
              </button>
            )}
            {onResyncCatalog && (
              <button
                type="button"
                onClick={onResyncCatalog}
                disabled={isResyncingCatalog}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-500/40 text-sky-300 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{isResyncingCatalog ? 'Resyncing...' : 'Resync Full Catalog'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onResetFilters}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs shadow-glow-cyan transition-all hover:scale-105 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity duration-150 ${isLoading ? 'opacity-65' : 'opacity-100'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3.5 sm:gap-5">
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
        </div>
      )}
    </div>
  );
}
