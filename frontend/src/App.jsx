import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import PlatformFilter from './components/PlatformFilter';
import GenreFilter from './components/GenreFilter';
import GameGrid from './components/GameGrid';
import GameDetailModal from './components/GameDetailModal';
import DownloadDrawer from './components/DownloadDrawer';
import OnlineScraperModal from './components/OnlineScraperModal';
import DownloadedGamesTab from './components/DownloadedGamesTab';
import ProvidersSettingsModal from './components/ProvidersSettingsModal';
import MirrorsHubModal from './components/MirrorsHubModal';
import InitialSetupWizardModal from './components/InitialSetupWizardModal';
import RomCompressorModal from './components/RomCompressorModal';
import {
  fetchGames, fetchPlatforms, fetchGenres, fetchCatalogFilters, fetchDownloads,
  fetchInstalledGames, startDownload, toggleFavorite, fetchFavoritesCount,
  fetchSetupStatus, importAndDownloadMirror, fetchMirrorSources, fetchProviders,
  syncTheGamesDbPlatform, syncAllTheGamesDbPlatforms
} from './services/api';
import { isSoundEnabled, setSoundEnabled, playVictorySound } from './utils/soundEffects';
import { Radio, Download, Heart, RefreshCw } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('store'); // 'store', 'downloaded', 'favorites'
  const [games, setGames] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [genres, setGenres] = useState([]);
  const [catalogFilters, setCatalogFilters] = useState({});
  const [installedCount, setInstalledCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());

  // Filtering, Organizing & Pagination State
  const [selectedFamily, setSelectedFamily] = useState('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [selectedDeveloper, setSelectedDeveloper] = useState('ALL');
  const [selectedPublisher, setSelectedPublisher] = useState('ALL');
  const [selectedPlayers, setSelectedPlayers] = useState('ALL');
  const [selectedEsrb, setSelectedEsrb] = useState('ALL');
  const [selectedDecade, setSelectedDecade] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('rating_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [totalPages, setTotalPages] = useState(1);
  const [totalGamesCount, setTotalGamesCount] = useState(0);
  const [globalVaultTotal, setGlobalVaultTotal] = useState(0);
  const [activeSourcesCount, setActiveSourcesCount] = useState(0);
  const [sourcesVersion, setSourcesVersion] = useState(0);
  const [syncingPlatform, setSyncingPlatform] = useState(null);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isResyncingCatalog, setIsResyncingCatalog] = useState(false);

  // Modals & Drawers
  const [selectedGame, setSelectedGame] = useState(null);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [isScraperOpen, setIsScraperOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMirrorsOpen, setIsMirrorsOpen] = useState(false);
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [isCompressorOpen, setIsCompressorOpen] = useState(false);

  // Downloads State
  const [downloads, setDownloads] = useState([]);
  const [queueStatus, setQueueStatus] = useState(null);
  const [notification, setNotification] = useState(null);

  // Request cancellation & ordering guards
  const gamesAbortRef = useRef(null);
  const gamesReqSeqRef = useRef(0);
  const facetsAbortRef = useRef(null);
  const facetsReqSeqRef = useRef(0);
  const prevDownloadsRef = useRef([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 100);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const handleOpenSetupWizard = () => {
      setIsSetupWizardOpen(true);
    };
    window.addEventListener('omnivault-open-setup-wizard', handleOpenSetupWizard);
    return () => {
      window.removeEventListener('omnivault-open-setup-wizard', handleOpenSetupWizard);
    };
  }, []);

  const showNotification = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 4500);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundEnabledState(next);
  };

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetchFavoritesCount();
      setFavoritesCount(res.favorites_count || 0);
    } catch {
      // ignore
    }
  }, []);

  const loadGames = useCallback(async () => {
    if (gamesAbortRef.current) {
      gamesAbortRef.current.abort();
    }
    const controller = new AbortController();
    gamesAbortRef.current = controller;
    const reqId = ++gamesReqSeqRef.current;
    setIsLoadingGames(true);

    try {
      const data = await fetchGames(
        {
          platform: selectedPlatform,
          family: selectedFamily,
          genre: selectedGenre,
          developer: selectedDeveloper,
          publisher: selectedPublisher,
          players: selectedPlayers,
          esrb: selectedEsrb,
          decade: selectedDecade !== 'ALL' ? Number(selectedDecade) : undefined,
          search: debouncedSearch,
          sort: sort,
          page: page,
          pageSize: pageSize,
          favorites_only: currentView === 'favorites',
        },
        controller.signal
      );
      if (reqId !== gamesReqSeqRef.current) return;
      setGames(data.games || []);
      setTotalPages(data.total_pages || 1);
      setTotalGamesCount(data.total || 0);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to load games:', err);
    } finally {
      if (reqId === gamesReqSeqRef.current) {
        setIsLoadingGames(false);
      }
    }
  }, [
    selectedFamily,
    selectedPlatform,
    selectedGenre,
    selectedDeveloper,
    selectedPublisher,
    selectedPlayers,
    selectedEsrb,
    selectedDecade,
    debouncedSearch,
    sort,
    page,
    pageSize,
    currentView,
  ]);

  const loadPlatforms = useCallback(async () => {
    try {
      const data = await fetchPlatforms();
      setPlatforms(data || []);
      const sum = (data || []).reduce((acc, p) => acc + (p.game_count || 0), 0);
      if (sum > 0) {
        setGlobalVaultTotal(sum);
      }
    } catch (err) {
      console.error('Failed to load platforms:', err);
    }
  }, []);

  const loadActiveSourcesCount = useCallback(async () => {
    try {
      const [mirRes, provRes] = await Promise.all([
        fetchMirrorSources(false).catch(() => ({ sources: [] })),
        fetchProviders().catch(() => ({ providers: [] })),
      ]);
      const enabledMirrors = (mirRes.sources || []).filter(s => s.is_enabled).length;
      const enabledProviders = (provRes.providers || []).filter(p => p.is_enabled).length;
      setActiveSourcesCount(enabledMirrors + enabledProviders);
    } catch {
      // ignore
    }
  }, []);

  const loadGenresAndFacets = useCallback(async () => {
    if (facetsAbortRef.current) {
      facetsAbortRef.current.abort();
    }
    const controller = new AbortController();
    facetsAbortRef.current = controller;
    const reqId = ++facetsReqSeqRef.current;
    try {
      const [genresRes, filtersRes] = await Promise.all([
        fetchGenres(selectedPlatform, selectedFamily, controller.signal),
        fetchCatalogFilters(selectedPlatform, selectedFamily, controller.signal),
      ]);
      if (reqId !== facetsReqSeqRef.current) return;
      setGenres(genresRes || []);
      setCatalogFilters(filtersRes || {});
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to load genres & filter facets:', err);
    }
  }, [selectedPlatform, selectedFamily]);

  const loadDownloads = useCallback(async () => {
    try {
      const data = await fetchDownloads();
      const nextList = data.downloads || [];
      const prevCompleted = new Set(
        (prevDownloadsRef.current || []).filter(d => d.status === 'completed').map(d => d.id)
      );
      const hasNewlyCompleted = nextList.some(d => d.status === 'completed' && !prevCompleted.has(d.id));
      prevDownloadsRef.current = nextList;
      setDownloads(nextList);
      if (data.queue) setQueueStatus(data.queue);
      if (hasNewlyCompleted && prevCompleted.size > 0) {
        loadInstalledCount(true);
      }
    } catch (err) {
      console.error('Failed to load downloads:', err);
    }
  }, [loadInstalledCount]);

  const loadInstalledCount = useCallback(async (forceRefresh = false) => {
    try {
      const res = await fetchInstalledGames(forceRefresh);
      setInstalledCount((res.installed || []).length);
    } catch {
      // ignore
    }
  }, []);

  const handleToggleFavorite = async (game) => {
    try {
      const res = await toggleFavorite(game.id);
      setGames(prev => prev.map(g => g.id === game.id ? { ...g, is_favorite: res.is_favorite ? 1 : 0 } : g));
      setFavoritesCount(res.total_favorites);
      if (selectedGame && selectedGame.id === game.id) {
        setSelectedGame(prev => ({ ...prev, is_favorite: res.is_favorite ? 1 : 0 }));
      }
      if (currentView === 'favorites' && !res.is_favorite) {
        loadGames();
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleFamilySelect = (fam) => {
    setSelectedFamily(fam);
    setSelectedPlatform('ALL');
    setSelectedGenre('ALL');
    setSelectedDeveloper('ALL');
    setSelectedPublisher('ALL');
    setPage(1);
  };

  const handlePlatformSelect = (plat) => {
    setSelectedPlatform(plat);
    setSelectedGenre('ALL');
    setSelectedDeveloper('ALL');
    setSelectedPublisher('ALL');
    setPage(1);
  };

  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
    setPage(1);
  };

  const handleSearchChange = (term) => {
    setSearchTerm(term);
    if (!term) setDebouncedSearch('');
    setPage(1);
  };

  const handleSortChange = (newSort) => {
    setSort(newSort);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedFamily('ALL');
    setSelectedPlatform('ALL');
    setSelectedGenre('ALL');
    setSelectedDeveloper('ALL');
    setSelectedPublisher('ALL');
    setSelectedPlayers('ALL');
    setSelectedEsrb('ALL');
    setSelectedDecade('ALL');
    setSearchTerm('');
    setDebouncedSearch('');
    setPage(1);
  };

  const handleRefreshCatalogView = useCallback(async () => {
    await Promise.all([
      loadPlatforms(),
      loadGenresAndFacets(),
      loadGames(),
      loadFavorites(),
      loadInstalledCount(true),
    ]);
    showNotification('Catalog view & filters refreshed!');
  }, [loadPlatforms, loadGenresAndFacets, loadGames, loadFavorites, loadInstalledCount]);

  const handleResyncFullCatalog = async () => {
    if (isResyncingCatalog) return;
    setIsResyncingCatalog(true);
    showNotification('Downloading & syncing full TheGamesDB catalog (all systems, categories, studios & box art)...');
    try {
      const res = await syncAllTheGamesDbPlatforms('all', 1, true);
      await Promise.all([loadPlatforms(), loadGenresAndFacets(), loadGames()]);
      playVictorySound();
      showNotification(
        `Catalog resynced: ${(res.total_catalog_games || 0).toLocaleString()} titles (+${(res.total_imported || 0).toLocaleString()} new, ${(res.total_updated || 0).toLocaleString()} enriched, 0 API quota used)!`
      );
    } catch (err) {
      console.error('Full catalog resync error:', err);
      showNotification(`Catalog resync failed: ${err.message}`, true);
    } finally {
      setIsResyncingCatalog(false);
    }
  };

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    loadPlatforms();
    loadActiveSourcesCount();
    loadDownloads();
    loadInstalledCount();
    loadFavorites();

    const checkInitialSetup = async () => {
      try {
        const res = await fetchSetupStatus();
        if (res && !res.initial_setup_completed) {
          localStorage.removeItem('omnivault_initial_setup_completed');
          setIsSetupWizardOpen(true);
        } else if (res && res.initial_setup_completed) {
          localStorage.setItem('omnivault_initial_setup_completed', 'true');
        }
      } catch (e) {
        console.warn('Initial setup check note:', e);
      }
    };
    checkInitialSetup();
  }, [loadDownloads, loadPlatforms, loadActiveSourcesCount, loadInstalledCount, loadFavorites]);

  useEffect(() => {
    loadGenresAndFacets();
  }, [loadGenresAndFacets]);

  const activeDownloads = downloads.filter(
    d => d.status === 'downloading' || d.status === 'queued' || d.status === 'resolving_mirror'
  );

  useEffect(() => {
    const pollInterval = (activeDownloads.length > 0 || isDownloadsOpen) ? 1200 : 8000;
    const interval = setInterval(() => {
      loadDownloads();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [activeDownloads.length, isDownloadsOpen, loadDownloads]);

  const handleStartDownload = async (
    game,
    type = 'direct',
    directUrl = null,
    filename = null,
    sourceName = null,
    destinationTarget = null
  ) => {
    try {
      let res;
      if (directUrl) {
        res = await importAndDownloadMirror({
          game_id: game.id,
          title: game.title,
          platform: game.platform,
          direct_url: directUrl,
          filename: filename || `${game.title}.zip`,
          source_name: sourceName || 'Direct Mirror',
          destination_target: destinationTarget,
        });
        loadPlatforms();
      } else {
        res = await startDownload(game.id, type, directUrl, filename, destinationTarget);
      }

      if (res.status === 'magnet_dispatched') {
        showNotification(`Magnet link launched for ${game.title}`);
      } else if (res.status === 'browser_dispatched') {
        showNotification(`Opened browser download mirror for ${game.title}`);
      } else {
        const qPos = res?.queue_position || res?.download?.queue_position;
        const destLabel = res?.destination_label || res?.download?.destination_label;
        const destSuffix = destLabel && destLabel !== 'Local Drive' ? ` → ${destLabel}` : '';
        showNotification(
          qPos && qPos > 1
            ? `Added to sequential queue (#${qPos}): ${game.title}${destSuffix}`
            : `Download started: ${game.title} (${(sourceName || type).toUpperCase()})${destSuffix}`
        );
        setIsDownloadsOpen(true);
      }
      await loadDownloads();
    } catch (err) {
      console.error(err);
      showNotification(`Failed to start download: ${err.message}`, true);
    }
  };

  const handleGameImported = (importedGame) => {
    loadGames();
    loadPlatforms();
    loadGenresAndFacets();
    setSelectedGame(importedGame);
    showNotification(`Added ${importedGame.title} to catalog!`);
  };

  const handleQuickSyncPlatform = async (platform) => {
    if (!platform || platform === 'ALL' || syncingPlatform) return;
    setSyncingPlatform(platform);
    try {
      const res = await syncTheGamesDbPlatform(platform, 3, 1);
      await Promise.all([loadPlatforms(), loadGenresAndFacets(), loadGames()]);
      const count = (res?.imported || 0) + (res?.updated || 0);
      showNotification(`Synced ${count} ${platform} titles from TheGamesDB`);
    } catch (err) {
      console.error('Quick platform sync error:', err);
      showNotification(`Failed to sync ${platform}: ${err.message}`, true);
    } finally {
      setSyncingPlatform(null);
    }
  };

  const noFiltersActive =
    !searchTerm &&
    selectedFamily === 'ALL' &&
    selectedPlatform === 'ALL' &&
    selectedGenre === 'ALL' &&
    selectedDeveloper === 'ALL' &&
    selectedPublisher === 'ALL' &&
    selectedPlayers === 'ALL' &&
    selectedEsrb === 'ALL' &&
    selectedDecade === 'ALL';

  const featuredGame = games.find(g => g.is_featured === 1) || games[0];
  const currentModalDownload = selectedGame
    ? downloads.find(d => d.game_id === selectedGame.id)
    : null;

  return (
    <div className="min-h-dvh w-full bg-[#080c14] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black overflow-x-clip">

      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-200 max-w-md ${
          notification.isError
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200 shadow-glow-cyan'
        }`}>
          {isResyncingCatalog ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
          <span className="text-xs font-bold">{notification.msg}</span>
        </div>
      )}

      {/* Navigation Bar */}
      <Navbar
        searchTerm={searchTerm}
        setSearchTerm={handleSearchChange}
        currentView={currentView}
        onSelectView={(v) => {
          setCurrentView(v);
          setPage(1);
          if (v === 'downloaded') loadInstalledCount(true);
        }}
        installedCount={installedCount}
        favoritesCount={favoritesCount}
        activeDownloadsCount={activeDownloads.length}
        onOpenDownloads={() => setIsDownloadsOpen(true)}
        onOpenScraper={() => setIsScraperOpen(true)}
        onOpenMirrors={() => setIsMirrorsOpen(true)}
        onOpenCompressor={() => setIsCompressorOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        totalGames={globalVaultTotal}
        activeSourcesCount={activeSourcesCount}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-5 lg:px-8 py-4 sm:py-6 lg:py-8 min-w-0">

        {/* VIEW 1: CATALOG FINDER */}
        {currentView === 'store' && (
          <div>
            {noFiltersActive && page === 1 && featuredGame && (
              <HeroBanner
                game={featuredGame}
                onSelectGame={(g) => setSelectedGame(g)}
                onQuickDownload={(g) => handleStartDownload(g, 'direct')}
              />
            )}

            <PlatformFilter
              selectedFamily={selectedFamily}
              onSelectFamily={handleFamilySelect}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={handlePlatformSelect}
              platformsData={platforms}
            />

            <GenreFilter
              selectedGenre={selectedGenre}
              onSelectGenre={handleGenreSelect}
              genresData={genres}
              catalogFilters={catalogFilters}
              selectedDeveloper={selectedDeveloper}
              onSelectDeveloper={(v) => { setSelectedDeveloper(v); setPage(1); }}
              selectedPublisher={selectedPublisher}
              onSelectPublisher={(v) => { setSelectedPublisher(v); setPage(1); }}
              selectedPlayers={selectedPlayers}
              onSelectPlayers={(v) => { setSelectedPlayers(v); setPage(1); }}
              selectedEsrb={selectedEsrb}
              onSelectEsrb={(v) => { setSelectedEsrb(v); setPage(1); }}
              selectedDecade={selectedDecade}
              onSelectDecade={(v) => { setSelectedDecade(v); setPage(1); }}
            />

            <GameGrid
              games={games}
              onSelectGame={(g) => setSelectedGame(g)}
              onQuickDownload={(g) => handleStartDownload(g, 'direct')}
              onToggleFavorite={handleToggleFavorite}
              sort={sort}
              setSort={handleSortChange}
              searchTerm={searchTerm}
              selectedFamily={selectedFamily}
              selectedPlatform={selectedPlatform}
              selectedGenre={selectedGenre}
              selectedDeveloper={selectedDeveloper}
              selectedPublisher={selectedPublisher}
              selectedPlayers={selectedPlayers}
              selectedEsrb={selectedEsrb}
              selectedDecade={selectedDecade}
              onResetFilters={handleResetFilters}
              onRefreshView={handleRefreshCatalogView}
              onResyncCatalog={handleResyncFullCatalog}
              isResyncingCatalog={isResyncingCatalog}
              isLoading={isLoadingGames}
              onSyncPlatform={handleQuickSyncPlatform}
              syncingPlatform={syncingPlatform}
              globalVaultTotal={globalVaultTotal}
              pagination={{
                page: page,
                totalPages: totalPages,
                total: totalGamesCount,
                pageSize: pageSize,
                onPageChange: (newPage) => {
                  setPage(newPage);
                  window.scrollTo({ top: 320, behavior: 'smooth' });
                },
                onPageSizeChange: (newSize) => {
                  setPageSize(newSize);
                  setPage(1);
                }
              }}
            />
          </div>
        )}

        {/* VIEW 2: DOWNLOADED FILES TAB */}
        {currentView === 'downloaded' && (
          <DownloadedGamesTab
            onSelectGame={(g) => setSelectedGame(g)}
            onNavigateStore={() => setCurrentView('store')}
            onOpenCompressor={() => setIsCompressorOpen(true)}
          />
        )}

        {/* VIEW 3: FAVORITES TAB */}
        {currentView === 'favorites' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
                  <Heart className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-xl text-white">Saved Favorites</h2>
                  <p className="text-xs text-slate-400">Personal download wishlist and bookmarked titles from the catalog.</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/40">
                {favoritesCount} saved
              </span>
            </div>

            <PlatformFilter
              selectedFamily={selectedFamily}
              onSelectFamily={handleFamilySelect}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={handlePlatformSelect}
              platformsData={platforms}
            />

            <GenreFilter
              selectedGenre={selectedGenre}
              onSelectGenre={handleGenreSelect}
              genresData={genres}
              catalogFilters={catalogFilters}
              selectedDeveloper={selectedDeveloper}
              onSelectDeveloper={(v) => { setSelectedDeveloper(v); setPage(1); }}
              selectedPublisher={selectedPublisher}
              onSelectPublisher={(v) => { setSelectedPublisher(v); setPage(1); }}
              selectedPlayers={selectedPlayers}
              onSelectPlayers={(v) => { setSelectedPlayers(v); setPage(1); }}
              selectedEsrb={selectedEsrb}
              onSelectEsrb={(v) => { setSelectedEsrb(v); setPage(1); }}
              selectedDecade={selectedDecade}
              onSelectDecade={(v) => { setSelectedDecade(v); setPage(1); }}
            />

            <GameGrid
              games={games}
              onSelectGame={(g) => setSelectedGame(g)}
              onQuickDownload={(g) => handleStartDownload(g, 'direct')}
              onToggleFavorite={handleToggleFavorite}
              sort={sort}
              setSort={handleSortChange}
              searchTerm={searchTerm}
              selectedFamily={selectedFamily}
              selectedPlatform={selectedPlatform}
              selectedGenre={selectedGenre}
              selectedDeveloper={selectedDeveloper}
              selectedPublisher={selectedPublisher}
              selectedPlayers={selectedPlayers}
              selectedEsrb={selectedEsrb}
              selectedDecade={selectedDecade}
              onResetFilters={handleResetFilters}
              onRefreshView={handleRefreshCatalogView}
              isLoading={isLoadingGames}
              globalVaultTotal={favoritesCount}
              pagination={{
                page: page,
                totalPages: totalPages,
                total: totalGamesCount,
                pageSize: pageSize,
                onPageChange: (newPage) => {
                  setPage(newPage);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                },
                onPageSizeChange: (newSize) => {
                  setPageSize(newSize);
                  setPage(1);
                }
              }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
        <p className="flex items-center justify-center gap-1.5 mb-1 text-slate-400">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-display font-semibold text-slate-300">OmniVault • ROM Finder &amp; Download Manager</span>
          <span>• {(globalVaultTotal || totalGamesCount) > 0 ? `${(globalVaultTotal || totalGamesCount).toLocaleString()} Catalog Titles` : 'Multi-Source ROM Finder'}</span>
        </p>
        <p>Catalog search, inline trailers &amp; gameplay, Real-Debrid unlock, direct Cloud Drive streaming, sequential queue &amp; CHD/RVZ compression.</p>
      </footer>

      {/* GAME DETAIL & DOWNLOAD SOURCES MODAL */}
      <GameDetailModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onStartDownload={handleStartDownload}
        onToggleFavorite={handleToggleFavorite}
        onGameUpdated={(updated) => {
          setSelectedGame(updated);
          loadGames();
        }}
        downloadState={currentModalDownload}
        onOpenSettings={() => setIsSettingsOpen(true)}
        sourcesVersion={sourcesVersion}
      />

      {/* ROM SCRAPER & MIRRORS NETWORK MODAL */}
      <MirrorsHubModal
        isOpen={isMirrorsOpen}
        onClose={() => setIsMirrorsOpen(false)}
        onDownloadQueued={loadDownloads}
        onOpenSettings={() => {
          setIsMirrorsOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* DOWNLOADS ACTIVITY DRAWER */}
      <DownloadDrawer
        isOpen={isDownloadsOpen}
        onClose={() => setIsDownloadsOpen(false)}
        downloads={downloads}
        queueStatus={queueStatus}
        onRefresh={loadDownloads}
      />

      {/* LIVE ONLINE FINDER / SCRAPER MODAL */}
      <OnlineScraperModal
        isOpen={isScraperOpen}
        onClose={() => setIsScraperOpen(false)}
        onGameImported={handleGameImported}
        onStartDownload={handleStartDownload}
        onOpenSettings={() => {
          setIsScraperOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* STORAGE, PROVIDERS & SEARCH TEMPLATES SETTINGS MODAL */}
      <ProvidersSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
        totalGames={globalVaultTotal || totalGamesCount}
        onSourcesChanged={() => {
          loadActiveSourcesCount();
          setSourcesVersion(v => v + 1);
        }}
        onCatalogUpdated={() => {
          loadPlatforms();
          loadGenresAndFacets();
          loadGames();
        }}
      />

      {/* INITIAL SETUP WIZARD MODAL */}
      <InitialSetupWizardModal
        isOpen={isSetupWizardOpen}
        totalGames={globalVaultTotal || totalGamesCount}
        onClose={() => setIsSetupWizardOpen(false)}
        onFinish={() => {
          loadGames();
          loadPlatforms();
          loadInstalledCount(true);
        }}
      />

      {/* LOSSLESS ROM COMPRESSOR & MULTI-DISC M3U MODAL */}
      <RomCompressorModal
        isOpen={isCompressorOpen}
        onClose={() => setIsCompressorOpen(false)}
      />

    </div>
  );
}
