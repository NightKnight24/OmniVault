import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import PlatformFilter from './components/PlatformFilter';
import GenreFilter from './components/GenreFilter';
import GameGrid from './components/GameGrid';
import GameDetailModal from './components/GameDetailModal';
import DownloadDrawer from './components/DownloadDrawer';
import OnlineScraperModal from './components/OnlineScraperModal';
import DownloadedGamesTab from './components/DownloadedGamesTab';
import AIAssistantDrawer from './components/AIAssistantDrawer';
import ProvidersSettingsModal from './components/ProvidersSettingsModal';
import CheatLabModal from './components/CheatLabModal';
import MirrorsHubModal from './components/MirrorsHubModal';
import KodiBigPictureView from './components/KodiBigPictureView';
import QuickMenuOverlay from './components/QuickMenuOverlay';
import InitialSetupWizardModal from './components/InitialSetupWizardModal';
import AchievementToast from './components/AchievementToast';
import RomCompressorModal from './components/RomCompressorModal';
import NetplayLobbyModal from './components/NetplayLobbyModal';
import ThemeStudioModal from './components/ThemeStudioModal';
import SaveTimeMachineModal from './components/SaveTimeMachineModal';
import ModStoreModal from './components/ModStoreModal';
import { useTheme } from './context/ThemeContext';
import { gamepadService } from './services/gamepadService';
import { 
  fetchGames, fetchPlatforms, fetchGenres, fetchDownloads, 
  fetchInstalledGames, startDownload, toggleFavorite, fetchFavoritesCount,
  fetchSetupStatus, importAndDownloadMirror
} from './services/api';
import { isSoundEnabled, setSoundEnabled } from './utils/soundEffects';
import { Radio, Download, Sparkles, AlertCircle, Bot, Heart } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('store'); // 'store', 'downloaded', 'favorites'
  const [games, setGames] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [genres, setGenres] = useState([]);
  const [installedCount, setInstalledCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());
  
  // Filtering & Pagination State
  const [selectedFamily, setSelectedFamily] = useState('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [selectedGenre, setSelectedGenre] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState('rating_desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [totalPages, setTotalPages] = useState(1);
  const [totalGamesCount, setTotalGamesCount] = useState(0);
  const [globalVaultTotal, setGlobalVaultTotal] = useState(67594);
  
  // Modals & Drawers
  const [selectedGame, setSelectedGame] = useState(null);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [isScraperOpen, setIsScraperOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCheatLabOpen, setIsCheatLabOpen] = useState(false);
  const [isMirrorsOpen, setIsMirrorsOpen] = useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [setupWizardStep, setSetupWizardStep] = useState(1);
  const [isThemeStudioOpen, setIsThemeStudioOpen] = useState(false);
  const [isCompressorOpen, setIsCompressorOpen] = useState(false);
  const [isNetplayOpen, setIsNetplayOpen] = useState(false);
  const [isSaveTimeMachineOpen, setIsSaveTimeMachineOpen] = useState(false);
  const [isModStoreOpen, setIsModStoreOpen] = useState(false);
  const [unlockedAchievementToast, setUnlockedAchievementToast] = useState(null);
  
  // 10-Foot Living Room / Kodi Mode from ThemeContext
  const { isKodiMode, toggleKodiMode } = useTheme();

  // Downloads State
  const [downloads, setDownloads] = useState([]);
  const [notification, setNotification] = useState(null);

  // Global Gamepad Action Listener & Keyboard Shortcuts (PS Button, Xbox Guide, F1, Esc)
  useEffect(() => {
    const unsub = gamepadService.subscribeActions((action) => {
      if (action === 'TOGGLE_QUICK_MENU') {
        setIsQuickMenuOpen(prev => !prev);
      } else if (action === 'TOGGLE_MODE') {
        toggleKodiMode();
      }
    });
    return unsub;
  }, [toggleKodiMode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsQuickMenuOpen(prev => !prev);
      }
    };
    const handleCustomToggle = () => {
      setIsQuickMenuOpen(prev => !prev);
    };
    const handleOpenSetupWizard = (e) => {
      setSetupWizardStep(e?.detail?.step || 1);
      setIsSetupWizardOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('omnivault-toggle-quickmenu', handleCustomToggle);
    window.addEventListener('omnivault-open-setup-wizard', handleOpenSetupWizard);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('omnivault-toggle-quickmenu', handleCustomToggle);
      window.removeEventListener('omnivault-open-setup-wizard', handleOpenSetupWizard);
    };
  }, []);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundEnabledState(next);
  };

  const loadFavorites = async () => {
    try {
      const res = await fetchFavoritesCount();
      setFavoritesCount(res.favorites_count || 0);
    } catch (e) {
      // ignore
    }
  };

  const handleToggleFavorite = async (game) => {
    try {
      const res = await toggleFavorite(game.id);
      setGames(prev => prev.map(g => g.id === game.id ? { ...g, is_favorite: res.is_favorite ? 1 : 0 } : g));
      setFavoritesCount(res.total_favorites);
      if (selectedGame && selectedGame.id === game.id) {
        setSelectedGame(prev => ({ ...prev, is_favorite: res.is_favorite ? 1 : 0 }));
      }
      if (currentView === 'favorites' && !res.is_favorite) {
        // If un-favoriting while viewing favorites tab, reload list
        loadGames();
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const loadGames = useCallback(async () => {
    try {
      const data = await fetchGames({
        platform: selectedPlatform,
        family: selectedFamily,
        genre: selectedGenre,
        search: searchTerm,
        sort: sort,
        page: page,
        pageSize: pageSize,
        favorites_only: currentView === 'favorites',
      });
      setGames(data.games || []);
      setTotalPages(data.total_pages || 1);
      setTotalGamesCount(data.total || 0);
    } catch (err) {
      console.error('Failed to load games:', err);
    }
  }, [selectedFamily, selectedPlatform, selectedGenre, searchTerm, sort, page, pageSize, currentView]);

  const loadPlatforms = async () => {
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
  };

  const loadGenres = useCallback(async () => {
    try {
      const data = await fetchGenres(selectedPlatform, selectedFamily);
      setGenres(data || []);
    } catch (err) {
      console.error('Failed to load genres:', err);
    }
  }, [selectedPlatform, selectedFamily]);

  const loadDownloads = async () => {
    try {
      const data = await fetchDownloads();
      setDownloads(data.downloads || []);
    } catch (err) {
      console.error('Failed to load downloads:', err);
    }
  };

  const loadInstalledCount = async () => {
    try {
      const res = await fetchInstalledGames();
      setInstalledCount((res.installed || []).length);
    } catch (err) {
      // ignore
    }
  };

  // Family and Platform selections
  const handleFamilySelect = (fam) => {
    setSelectedFamily(fam);
    setSelectedPlatform('ALL');
    setSelectedGenre('ALL');
    setPage(1);
  };

  const handlePlatformSelect = (plat) => {
    setSelectedPlatform(plat);
    setSelectedGenre('ALL');
    setPage(1);
  };

  const handleGenreSelect = (genre) => {
    setSelectedGenre(genre);
    setPage(1);
  };

  const handleSearchChange = (term) => {
    setSearchTerm(term);
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
    setSearchTerm('');
    setPage(1);
  };

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  useEffect(() => {
    loadPlatforms();
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
  }, []);

  useEffect(() => {
    loadGenres();
  }, [loadGenres]);

  const activeDownloads = downloads.filter(d => d.status === 'downloading' || d.status === 'queued' || d.status === 'resolving_mirror');

  // Polling for live download progress: fast (1.2s) when downloads are active or drawer is open
  useEffect(() => {
    const pollInterval = (activeDownloads.length > 0 || isDownloadsOpen) ? 1200 : 3000;
    const interval = setInterval(() => {
      loadDownloads();
    }, pollInterval);
    return () => clearInterval(interval);
  }, [activeDownloads.length, isDownloadsOpen]);

  // Installed count polling (low-frequency 15s to guarantee zero WKWebView freezing)
  useEffect(() => {
    const interval = setInterval(() => {
      loadInstalledCount();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStartDownload = async (game, type = 'direct', directUrl = null, filename = null, sourceName = null) => {
    try {
      let res;
      if (directUrl) {
        res = await importAndDownloadMirror({
          title: game.title,
          platform: game.platform,
          direct_url: directUrl,
          filename: filename || `${game.title}.zip`,
          source_name: sourceName || 'Direct Mirror'
        });
      } else {
        res = await startDownload(game.id, type, directUrl, filename);
      }
      
      if (res.status === 'magnet_dispatched') {
        showNotification(`Magnet link launched for ${game.title}`);
      } else if (res.status === 'browser_dispatched') {
        showNotification(`🌐 Opened browser download mirror for ${game.title}`);
      } else {
        showNotification(`⚡ Download queued: ${game.title} (${(sourceName || type).toUpperCase()})`);
        setIsDownloadsOpen(true);
      }
      await loadDownloads();
    } catch (err) {
      console.error(err);
      showNotification(`Failed to start download: ${err.message}`, true);
    }
  };

  const showNotification = (msg, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleGameImported = (importedGame) => {
    loadGames();
    loadPlatforms();
    loadGenres();
    setSelectedGame(importedGame);
    showNotification(`Added ${importedGame.title} to storefront!`);
  };

  // Featured classic game for Hero Banner
  const featuredGame = games.find(g => g.is_featured === 1) || games[0];

  // Get current download state for modal
  const currentModalDownload = selectedGame 
    ? downloads.find(d => d.game_id === selectedGame.id) 
    : null;

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black overflow-x-hidden">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-200 ${
          notification.isError 
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200 shadow-glow-cyan'
        }`}>
          <Download className="w-4 h-4" />
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
        }}
        installedCount={installedCount}
        favoritesCount={favoritesCount}
        activeDownloadsCount={activeDownloads.length}
        onOpenDownloads={() => setIsDownloadsOpen(true)}
        onOpenScraper={() => setIsScraperOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCheatLab={() => setIsCheatLabOpen(true)}
        onOpenMirrors={() => setIsMirrorsOpen(true)}
        onOpenAI={() => setIsAIOpen(true)}
        totalGames={globalVaultTotal}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        isKodiMode={isKodiMode}
        onToggleKodiMode={toggleKodiMode}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
        onOpenThemeStudio={() => setIsThemeStudioOpen(true)}
        onOpenCompressor={() => setIsCompressorOpen(true)}
        onOpenNetplay={() => setIsNetplayOpen(true)}
        onOpenModStore={() => setIsModStoreOpen(true)}
      />

      {/* 10-Foot Kodi Living Room Cinema View OR Classic Storefront */}
      {isKodiMode ? (
        <KodiBigPictureView
          games={games}
          platforms={platforms}
          installedCount={installedCount}
          favoritesCount={favoritesCount}
          totalGames={globalVaultTotal}
          onSelectGame={(g) => setSelectedGame(g)}
          onStartDownload={handleStartDownload}
          onToggleFavorite={handleToggleFavorite}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenCheatLab={() => setIsCheatLabOpen(true)}
          onOpenMirrors={() => setIsMirrorsOpen(true)}
          onToggleKodiMode={toggleKodiMode}
          onOpenQuickMenu={() => setIsQuickMenuOpen(true)}
          onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
          onOpenThemeStudio={() => setIsThemeStudioOpen(true)}
          onOpenCompressor={() => setIsCompressorOpen(true)}
          onOpenNetplay={() => setIsNetplayOpen(true)}
          onOpenModStore={() => setIsModStoreOpen(true)}
          onOpenScraper={() => setIsScraperOpen(true)}
        />
      ) : (
        <>
          {/* Main Container */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8">
        
        {/* VIEW 1: STOREFRONT */}
        {currentView === 'store' && (
          <div>
            {/* Featured Hero Banner */}
            {!searchTerm && selectedPlatform === 'ALL' && selectedGenre === 'ALL' && page === 1 && featuredGame && (
              <HeroBanner
                game={featuredGame}
                onSelectGame={(g) => setSelectedGame(g)}
                onQuickDownload={(g) => handleStartDownload(g, 'direct')}
              />
            )}

            {/* 1. CONSOLE FILTER TABS & HARDWARE FAMILIES */}
            <PlatformFilter
              selectedFamily={selectedFamily}
              onSelectFamily={handleFamilySelect}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={handlePlatformSelect}
              platformsData={platforms}
            />

            {/* 2. GENRE FILTER PILLS */}
            <GenreFilter
              selectedGenre={selectedGenre}
              onSelectGenre={handleGenreSelect}
              genresData={genres}
            />

            {/* 3. STOREFRONT GAME GRID WITH PAGINATION */}
            <GameGrid
              games={games}
              onSelectGame={(g) => setSelectedGame(g)}
              onQuickDownload={(g) => handleStartDownload(g, 'direct')}
              onToggleFavorite={handleToggleFavorite}
              sort={sort}
              setSort={handleSortChange}
              onOpenScraper={() => setIsScraperOpen(true)}
              searchTerm={searchTerm}
              selectedFamily={selectedFamily}
              selectedPlatform={selectedPlatform}
              selectedGenre={selectedGenre}
              onResetFilters={handleResetFilters}
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

        {/* VIEW 2: DOWNLOADED GAMES TAB */}
        {currentView === 'downloaded' && (
          <DownloadedGamesTab
            onSelectGame={(g) => setSelectedGame(g)}
            onNavigateStore={() => setCurrentView('store')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenCheatLab={() => setIsCheatLabOpen(true)}
            onOpenModStore={() => setIsModStoreOpen(true)}
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
                  <h2 className="font-display font-bold text-xl text-white">Your Saved Favorites</h2>
                  <p className="text-xs text-slate-400">Personal backlog and must-play titles bookmarked from the catalog.</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/40">
                {favoritesCount} saved
              </span>
            </div>

            <GameGrid
              games={games}
              onSelectGame={(g) => setSelectedGame(g)}
              onQuickDownload={(g) => handleStartDownload(g, 'direct')}
              onToggleFavorite={handleToggleFavorite}
              sort={sort}
              setSort={handleSortChange}
              onOpenScraper={() => setIsScraperOpen(true)}
              searchTerm={searchTerm}
              selectedPlatform={selectedPlatform}
              selectedGenre={selectedGenre}
              onResetFilters={handleResetFilters}
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

          {/* FLOATING OMNIAI TRIGGER ORB (Bottom Right) */}
          <button
            onClick={() => setIsAIOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-600 text-black font-extrabold text-xs shadow-glow-cyan hover:scale-105 active:scale-95 transition-all cursor-pointer group"
            title="Open OmniAI Copilot"
          >
            <div className="relative">
              <Bot className="w-5 h-5 text-black group-hover:rotate-12 transition-transform" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-black flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-ping" />
              </span>
            </div>
            <span className="tracking-wider uppercase text-[11px]">Ask OmniAI</span>
          </button>

          {/* Footer */}
          <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-500">
            <p className="flex items-center justify-center gap-1.5 mb-1 text-slate-400">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-display font-semibold text-slate-300">OmniVault Classic Storefront</span>
              <span>• {totalGamesCount > 0 ? `${totalGamesCount.toLocaleString()} Preserved Titles` : 'Preserved Classic Game Vault'}</span>
            </p>
            <p>Offline ROM vault, OmniAI Copilot, cheats engine, translation patches, and ROM hacks.</p>
          </footer>
        </>
      )}

      {/* GAME DETAIL POPUP MODAL */}
      <GameDetailModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onStartDownload={handleStartDownload}
        onToggleFavorite={handleToggleFavorite}
        downloadState={currentModalDownload}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCheatLab={() => setIsCheatLabOpen(true)}
        onOpenModStore={() => setIsModStoreOpen(true)}
      />

      {/* ADVANCED CHEAT ENGINEERING LAB MODAL */}
      <CheatLabModal
        isOpen={isCheatLabOpen}
        onClose={() => setIsCheatLabOpen(false)}
        selectedGame={selectedGame}
      />

      {/* ROM SCRAPER & MIRRORS NETWORK MODAL */}
      <MirrorsHubModal
        isOpen={isMirrorsOpen}
        onClose={() => setIsMirrorsOpen(false)}
        onDownloadQueued={loadDownloads}
      />

      {/* DOWNLOADS ACTIVITY DRAWER */}
      <DownloadDrawer
        isOpen={isDownloadsOpen}
        onClose={() => setIsDownloadsOpen(false)}
        downloads={downloads}
        onRefresh={loadDownloads}
      />

      {/* ONLINE SCRAPER MODAL */}
      <OnlineScraperModal
        isOpen={isScraperOpen}
        onClose={() => setIsScraperOpen(false)}
        onGameImported={handleGameImported}
        onOpenSettings={() => {
          setIsScraperOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      {/* SEARCH PROVIDERS & INDEXERS SETTINGS MODAL */}
      <ProvidersSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
      />

      {/* OMNIAI COPILOT ASSISTANT DRAWER */}
      <AIAssistantDrawer
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        totalGames={globalVaultTotal || totalGamesCount}
        onSelectGame={(g) => {
          setSelectedGame(g);
          setIsAIOpen(false);
        }}
        onQuickDownload={(g) => handleStartDownload(g, 'direct')}
      />

      {/* UNIVERSAL IN-GAME & IN-APP QUICK MENU OVERLAY */}
      <QuickMenuOverlay
        isOpen={isQuickMenuOpen}
        onClose={() => setIsQuickMenuOpen(false)}
        activeGame={selectedGame}
        onExitGame={() => {
          setIsQuickMenuOpen(false);
          setSelectedGame(null);
        }}
        onUnlockAchievement={(ach) => setUnlockedAchievementToast(ach)}
        onOpenCompressor={() => {
          setIsQuickMenuOpen(false);
          setIsCompressorOpen(true);
        }}
        onOpenNetplay={() => {
          setIsQuickMenuOpen(false);
          setIsNetplayOpen(true);
        }}
        onOpenCheatLab={() => {
          setIsQuickMenuOpen(false);
          setIsCheatLabOpen(true);
        }}
        onOpenSettings={() => {
          setIsQuickMenuOpen(false);
          setIsSettingsOpen(true);
        }}
        onOpenSetupWizard={() => {
          setIsQuickMenuOpen(false);
          setSetupWizardStep(1);
          setIsSetupWizardOpen(true);
        }}
        onOpenModStore={() => {
          setIsQuickMenuOpen(false);
          setIsModStoreOpen(true);
        }}
      />

      {/* INITIAL LAUNCH / HARDWARE PROVISIONING SETUP WIZARD */}
      <InitialSetupWizardModal
        isOpen={isSetupWizardOpen}
        initialStep={setupWizardStep}
        onClose={() => setIsSetupWizardOpen(false)}
        onFinish={() => {
          loadGames();
          loadPlatforms();
        }}
      />

      {/* HOLOGRAPHIC TROPHY UNLOCK TOAST */}
      <AchievementToast
        achievement={unlockedAchievementToast}
        onClose={() => setUnlockedAchievementToast(null)}
        onViewDetails={() => setIsQuickMenuOpen(true)}
      />

      {/* THEME STUDIO & AMBIENCE GENERATOR MODAL */}
      <ThemeStudioModal
        isOpen={isThemeStudioOpen}
        onClose={() => setIsThemeStudioOpen(false)}
      />

      {/* LOSSLESS ROM COMPRESSOR & MULTI-DISC M3U MODAL */}
      <RomCompressorModal
        isOpen={isCompressorOpen}
        onClose={() => setIsCompressorOpen(false)}
      />

      {/* OMNINET COUCH P2P NETPLAY MODAL */}
      <NetplayLobbyModal
        isOpen={isNetplayOpen}
        onClose={() => setIsNetplayOpen(false)}
      />

      {/* OMNISYNC TIME-MACHINE SAVE MODAL */}
      <SaveTimeMachineModal
        isOpen={isSaveTimeMachineOpen}
        onClose={() => setIsSaveTimeMachineOpen(false)}
        game={selectedGame}
      />

      {/* MODS, ROMHACKS & ENHANCEMENTS STOREFRONT */}
      <ModStoreModal
        isOpen={isModStoreOpen}
        onClose={() => setIsModStoreOpen(false)}
        selectedGame={selectedGame}
      />

    </div>
  );
}
