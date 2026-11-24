import React, { useEffect, useRef, useState } from 'react';
import {
  X, Star, Download, Image as ImageIcon, Copy, Check,
  Calendar, Building, Sparkles, Magnet, FolderOpen,
  ShieldCheck, Globe, Heart, Sliders,
  CheckCircle2, AlertCircle, Zap, RefreshCw, MessageSquare,
  Edit3, Send, Link as LinkIcon, Play, Film, Lock, Unlock, Search, Cloud, HardDrive
} from 'lucide-react';
import {
  fetchGameById, fetchSearchTemplates, rateGame, findWorkingMirror,
  getGameMirrors, getGameVideos, fetchGameReviews, submitGameReview,
  setGameSource, revealLocalPath, enrichGameTheGamesDb, fetchCloudTargets
} from '../services/api';
import { playClick, playFavoriteSound, playCoin } from '../utils/soundEffects';

const formatModalSize = (mb) => {
  if (!mb || mb <= 0) return 'Verified ROM';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${Number(mb).toFixed(1)} MB`;
};

export default function GameDetailModal({
  game,
  onClose,
  onStartDownload,
  onToggleFavorite,
  onGameUpdated,
  downloadState,
  initialTab = 'overview',
  onOpenSettings,
  sourcesVersion = 0
}) {
  const dialogRef = useRef(null);

  const [modalTab, setModalTab] = useState(initialTab); // 'overview', 'sources'
  const [activeMediaTab, setActiveMediaTab] = useState('boxart'); // 'boxart', 'screenshots'
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [copiedMagnet, setCopiedMagnet] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [currentUserRating, setCurrentUserRating] = useState(null);
  const [enrichedDescription, setEnrichedDescription] = useState(null);
  const [webHelpers, setWebHelpers] = useState([]);
  const [refreshingMeta, setRefreshingMeta] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);

  // Custom Source URL Attachment State
  const [customDirectUrl, setCustomDirectUrl] = useState('');
  const [customMagnetUri, setCustomMagnetUri] = useState('');
  const [savingCustomSource, setSavingCustomSource] = useState(false);
  const [sourceSavedMsg, setSourceSavedMsg] = useState(null);

  // Community Written Reviews State
  const [reviewsData, setReviewsData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewAuthor, setNewReviewAuthor] = useState('Vault Explorer');
  const [newReviewText, setNewReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Live Mirror & Torrent Resolution State
  const [checkingMirror, setCheckingMirror] = useState(false);
  const [liveMirror, setLiveMirror] = useState(null);
  const [mirrorError, setMirrorError] = useState(null);
  const [romMirrors, setRomMirrors] = useState([]);
  const [loadingMirrors, setLoadingMirrors] = useState(false);
  const [realdebridActive, setRealdebridActive] = useState(false);
  const [rdUnlockedCount, setRdUnlockedCount] = useState(0);

  // Trailer & Gameplay Videos State
  const [gameVideos, setGameVideos] = useState({ trailer: null, gameplay: null });
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [copiedVideoUrl, setCopiedVideoUrl] = useState(false);

  // Per-Source In-App Community Scraping State
  const [scrapingSourceId, setScrapingSourceId] = useState(null);
  const [selectedCommunitySource, setSelectedCommunitySource] = useState(null);
  const [communitySourceMirrors, setCommunitySourceMirrors] = useState([]);
  const [communitySourceError, setCommunitySourceError] = useState(null);
  const [copiedHelperKey, setCopiedHelperKey] = useState(null);

  // Destination Target State (Local Drive, iCloud Drive, Google Drive, OneDrive)
  const [cloudTargetsInfo, setCloudTargetsInfo] = useState({ default_target: 'local', targets: [] });
  const [selectedCloudTarget, setSelectedCloudTarget] = useState('local');

  useEffect(() => {
    if (game?.id) {
      setEnrichedDescription(null);
      setWebHelpers(game.web_search_helpers || []);
      setCustomDirectUrl(game.direct_download_url || '');
      setCustomMagnetUri(game.magnet_uri || '');
      setSourceSavedMsg(null);
      setLiveMirror(null);
      setMirrorError(null);
      setGameVideos({ trailer: null, gameplay: null });
      setLoadingVideos(true);
      setCopiedVideoUrl(false);
      setScrapingSourceId(null);
      setSelectedCommunitySource(null);
      setCommunitySourceMirrors([]);
      setCommunitySourceError(null);
      setCopiedHelperKey(null);

      fetchGameById(game.id)
        .then(detail => {
          if (detail) {
            if (detail.description) setEnrichedDescription(detail.description);
            if (detail.web_search_helpers) setWebHelpers(detail.web_search_helpers);
            if (detail.direct_download_url !== undefined) setCustomDirectUrl(detail.direct_download_url || '');
            if (detail.magnet_uri !== undefined) setCustomMagnetUri(detail.magnet_uri || '');
          }
        })
        .catch(console.error);

      getGameVideos(game.id)
        .then(res => {
          if (res) {
            setGameVideos({
              trailer: res.trailer || null,
              gameplay: res.gameplay || null,
            });
          }
        })
        .catch(console.error)
        .finally(() => setLoadingVideos(false));

      setLoadingReviews(true);
      fetchGameReviews(game.id)
        .then(data => {
          setReviewsData(data);
          setReviews(data.reviews || []);
        })
        .catch(console.error)
        .finally(() => setLoadingReviews(false));
    }
  }, [game?.id]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!newReviewText.trim() || !game) return;
    setSubmittingReview(true);
    try {
      const res = await submitGameReview(game.id, {
        rating: newReviewRating,
        review_text: newReviewText.trim(),
        author: newReviewAuthor.trim() || 'Vault Explorer'
      });
      if (res?.status === 'success') {
        playCoin();
        setCurrentUserRating(newReviewRating);
        setShowWriteReview(false);
        setNewReviewText('');
        const updated = await fetchGameReviews(game.id);
        setReviewsData(updated);
        setReviews(updated.reviews || []);
      }
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDownloadMirror = (mirror) => {
    if (!mirror || !game) return;
    playClick();
    if (onStartDownload) {
      onStartDownload(
        game,
        'direct',
        mirror.direct_url,
        mirror.filename,
        mirror.source_name,
        selectedCloudTarget
      );
    }
    onClose();
  };

  const handleScanMirrors = async () => {
    if (!game) return;
    setCheckingMirror(true);
    setMirrorError(null);
    setLiveMirror(null);
    try {
      const res = await findWorkingMirror(game.title, game.platform);
      if (res.status === 'found' && res.mirror) {
        setLiveMirror(res.mirror);
      } else {
        setMirrorError('All direct mirrors checked. No active direct ROM mirror found.');
      }
    } catch (err) {
      setMirrorError(err.message || 'Error scanning mirrors');
    } finally {
      setCheckingMirror(false);
    }
  };

  const handleDownloadFromLiveMirror = () => {
    if (!liveMirror || !game) return;
    playClick();
    if (onStartDownload) {
      onStartDownload(
        game,
        'direct',
        liveMirror.direct_url,
        liveMirror.filename,
        liveMirror.source_name,
        selectedCloudTarget
      );
    }
    onClose();
  };

  const handleRefreshTheGamesDb = async () => {
    if (!game) return;
    playClick();
    setRefreshingMeta(true);
    try {
      const res = await enrichGameTheGamesDb(game.id);
      if (res?.enriched && res.game) {
        if (res.game.description) setEnrichedDescription(res.game.description);
        if (onGameUpdated) {
          onGameUpdated({
            ...game,
            ...res.game,
            web_search_helpers: webHelpers.length > 0 ? webHelpers : game.web_search_helpers,
          });
        }
      }
    } catch (err) {
      console.error('Failed to refresh metadata from TheGamesDB:', err);
    } finally {
      setRefreshingMeta(false);
    }
  };

  const handleSaveCustomSource = async (e, startImmediate = false) => {
    if (e) e.preventDefault();
    if (!game) return;
    setSavingCustomSource(true);
    setSourceSavedMsg(null);
    try {
      const res = await setGameSource(game.id, {
        direct_download_url: customDirectUrl.trim(),
        magnet_uri: customMagnetUri.trim()
      });
      const updatedGame = {
        ...game,
        direct_download_url: res.direct_download_url || null,
        magnet_uri: res.magnet_uri || null
      };
      if (onGameUpdated) onGameUpdated(updatedGame);
      setSourceSavedMsg('Custom source link saved to catalog!');

      if (startImmediate && (customDirectUrl.trim() || customMagnetUri.trim())) {
        const target = customDirectUrl.trim() || customMagnetUri.trim();
        const type = target.startsWith('magnet:') || target.endsWith('.torrent') ? 'magnet' : 'direct';
        if (onStartDownload) {
          onStartDownload(updatedGame, type, target, null, 'Custom Source', selectedCloudTarget);
        }
        onClose();
      }
    } catch (err) {
      alert(`Failed to save custom source: ${err.message}`);
    } finally {
      setSavingCustomSource(false);
    }
  };

  useEffect(() => {
    if (!game?.id) return;
    let cancelled = false;
    fetchCloudTargets()
      .then((res) => {
        if (cancelled || !res) return;
        setCloudTargetsInfo(res);
        setSelectedCloudTarget(res.default_target || 'local');
      })
      .catch(() => {});
    setRomMirrors([]);
    setLoadingMirrors(true);
    getGameMirrors(game.id)
      .then(res => {
        if (cancelled) return;
        setRealdebridActive(Boolean(res?.realdebrid_active));
        setRdUnlockedCount(Number(res?.realdebrid_unlocked_count || 0));
        const list = res?.mirrors || res?.streams || [];
        setRomMirrors(list);
        if (list.length > 0) {
          setLiveMirror(list[0]);
        }
      })
      .catch(err => {
        if (!cancelled) console.error('ROM mirrors discovery error:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingMirrors(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game?.id, sourcesVersion]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (game && !dialog.open) {
      dialog.showModal();
      setModalTab(initialTab === 'sources' ? 'sources' : 'overview');
      setActiveMediaTab('boxart');
      setSelectedScreenshot(0);
      setCurrentUserRating(game.user_rating || null);
      setEnrichedDescription(game.description || null);

      fetchSearchTemplates()
        .then(res => setCustomTemplates(res.templates || []))
        .catch(() => setCustomTemplates([]));
    } else if (!game && dialog.open) {
      dialog.close();
    }

    const handleBackdropClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInsideContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (!isInsideContent) {
        onClose();
      }
    };

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', handleBackdropClick);
    }

    const handleNativeClose = () => {
      onClose();
    };
    dialog.addEventListener('close', handleNativeClose);

    return () => {
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
      dialog.removeEventListener('close', handleNativeClose);
    };
  }, [game, onClose, initialTab]);

  if (!game) return <dialog ref={dialogRef} className="hidden" />;

  const handleCopyMagnet = () => {
    if (game.magnet_uri) {
      navigator.clipboard.writeText(game.magnet_uri);
      setCopiedMagnet(true);
      setTimeout(() => setCopiedMagnet(false), 2500);
    }
  };

  const resolvedLocalPath = game.path || (downloadState && downloadState.destination_path) || '';

  const handleCopyPath = () => {
    if (resolvedLocalPath) {
      navigator.clipboard.writeText(resolvedLocalPath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleRevealInFinder = () => {
    playClick();
    if (resolvedLocalPath) {
      revealLocalPath(resolvedLocalPath).catch(() => {});
    }
  };

  const handleRate = async (score) => {
    playFavoriteSound();
    setCurrentUserRating(score);
    try {
      await rateGame(game.id, score);
    } catch (err) {
      console.error('Failed to save rating:', err);
    }
  };

  const handleScrapeCommunitySource = async (helper) => {
    if (!game || !helper) return;
    playClick();

    if (helper.can_scrape === false || !helper.source_id) {
      const targetUrl = helper.url || '';
      if (targetUrl) {
        navigator.clipboard?.writeText(targetUrl).catch(() => {});
        const key = helper.source_id || helper.name;
        setCopiedHelperKey(key);
        setTimeout(() => setCopiedHelperKey(null), 2200);
      }
      return;
    }

    setScrapingSourceId(helper.source_id);
    setSelectedCommunitySource(helper);
    setCommunitySourceError(null);
    setCommunitySourceMirrors([]);

    try {
      const res = await getGameMirrors(game.id, helper.source_id);
      if (res?.realdebrid_active !== undefined) {
        setRealdebridActive(Boolean(res.realdebrid_active));
      }
      const list = res?.mirrors || res?.streams || [];
      setCommunitySourceMirrors(list);

      if (list.length > 0) {
        setRomMirrors((prev) => {
          const seen = new Set(prev.map((m) => m.direct_url));
          const merged = [...prev];
          for (const item of list) {
            if (item?.direct_url && !seen.has(item.direct_url)) {
              merged.push(item);
              seen.add(item.direct_url);
            }
          }
          if (merged.length > 0 && !liveMirror) {
            setLiveMirror(merged[0]);
          }
          return merged;
        });
      }
    } catch (err) {
      setCommunitySourceError(err.message || `Failed to scrape ${helper.name}`);
    } finally {
      setScrapingSourceId(null);
    }
  };

  const handleCopyHelperUrl = (key, targetUrl) => {
    if (!targetUrl) return;
    playClick();
    navigator.clipboard?.writeText(targetUrl).catch(() => {});
    setCopiedHelperKey(key);
    setTimeout(() => setCopiedHelperKey(null), 2200);
  };

  const screenshots = game.screenshots || [];
  const isDownloading = downloadState && downloadState.status === 'downloading';
  const isCompleted = (downloadState && downloadState.status === 'completed') || Boolean(game.path);

  const quotedTitle = encodeURIComponent(game.title);
  const quotedPlatform = encodeURIComponent(game.platform_name || game.platform || '');
  const activeHelpers = (webHelpers && webHelpers.length > 0)
    ? webHelpers
    : [
        {
          source_id: 'archive-org',
          name: 'Internet Archive (Archive.org)',
          adapter: 'archive_org',
          can_scrape: true,
          supports_direct_download: true,
          url: 'https://archive.org',
          description: 'Public archival collections on Archive.org',
        },
      ];

  const resolveTemplateUrl = (tplStr) => {
    return (tplStr || '')
      .replace(/\{title\}/g, quotedTitle)
      .replace(/\{platform\}/g, quotedPlatform);
  };

  const coverUrl = (
    game.box_art_2d
    && !game.box_art_2d.includes('libretro-thumbnails')
    && (
      game.box_art_2d.includes('thegamesdb.net')
      || !['Switch', 'Switch2', 'Xbox360', 'PS3', 'PS4', 'PS5', 'PSVita', '3DS', 'Xbox', 'WiiU', 'Windows', 'macOS', 'Arcade', 'Saturn', 'Dreamcast', 'Wii'].includes(game.platform)
    )
  )
    ? game.box_art_2d
    : `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`;

  return (
    <dialog
      ref={dialogRef}
      id="gameDetailModal"
      closedby="any"
      aria-labelledby="gameModalTitle"
      className="m-auto bg-transparent p-0 max-w-4xl w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-1.5rem)] rounded-3xl outline-none shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-md"
    >
      <div className="relative bg-[#0d1322] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-1.5rem)]">

        {/* Header Bar with 2 Focused Tabs & Close Button */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 sm:px-6 py-3 bg-slate-950/90 z-20 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0">
            <button
              onClick={() => setModalTab('overview')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'overview'
                  ? 'bg-cyan-500 text-black shadow-glow-cyan'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Overview & Downloads</span>
            </button>

            <button
              onClick={() => setModalTab('sources')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'sources'
                  ? 'bg-sky-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Web Sources & Custom Link</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/20 flex items-center justify-center transition-all hover:scale-110 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="overflow-y-auto overscroll-contain flex-1">

          {/* TAB 1: OVERVIEW & DOWNLOADS */}
          {modalTab === 'overview' && (
            <div>
              {/* BOX ART, TRAILER, GAMEPLAY & SCREENSHOT SHOWCASE */}
              <div className="relative bg-slate-950 border-b border-white/10">
                <div className="px-4 py-2 bg-slate-950/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      onClick={() => setActiveMediaTab('boxart')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeMediaTab === 'boxart'
                          ? 'bg-cyan-500 text-black shadow-glow-cyan'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Box Art</span>
                    </button>

                    <button
                      onClick={() => setActiveMediaTab('trailer')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeMediaTab === 'trailer'
                          ? 'bg-rose-500 text-white shadow-md'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Trailer</span>
                    </button>

                    <button
                      onClick={() => setActiveMediaTab('gameplay')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeMediaTab === 'gameplay'
                          ? 'bg-emerald-500 text-black shadow-md'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Gameplay</span>
                    </button>

                    {screenshots.length > 0 && (
                      <button
                        onClick={() => setActiveMediaTab('screenshots')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeMediaTab === 'screenshots'
                            ? 'bg-cyan-500 text-black shadow-glow-cyan'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Screenshots ({screenshots.length})</span>
                      </button>
                    )}
                  </div>

                  {(activeMediaTab === 'trailer' || activeMediaTab === 'gameplay') && (() => {
                    const activeVid = activeMediaTab === 'trailer' ? gameVideos.trailer : gameVideos.gameplay;
                    if (!activeVid) return null;
                    return (
                      <div className="flex items-center gap-2 min-w-0 max-w-sm">
                        <span className="text-[11px] text-slate-400 truncate">{activeVid.title}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeVid.watch_url) {
                              navigator.clipboard?.writeText(activeVid.watch_url).catch(() => {});
                              setCopiedVideoUrl(true);
                              setTimeout(() => setCopiedVideoUrl(false), 2000);
                            }
                          }}
                          className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {copiedVideoUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedVideoUrl ? 'Copied' : 'Copy Link'}</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                <div className="h-72 sm:h-80 w-full bg-black flex items-center justify-center overflow-hidden relative">
                  {activeMediaTab === 'boxart' && (
                    <div className="w-full h-full relative flex items-center justify-center p-6 overflow-hidden">
                      <img
                        src={game.backdrop || coverUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110"
                        onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0d1322] via-black/50 to-black/70" />
                      <img
                        src={coverUrl}
                        alt={`${game.title} Box Art`}
                        className="relative z-10 max-h-60 sm:max-h-68 rounded-xl shadow-2xl border border-white/20 object-contain hover:scale-105 transition-transform"
                        onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`; }}
                      />
                    </div>
                  )}

                  {(activeMediaTab === 'trailer' || activeMediaTab === 'gameplay') && (() => {
                    const activeVid = activeMediaTab === 'trailer' ? gameVideos.trailer : gameVideos.gameplay;
                    if (loadingVideos && !activeVid) {
                      return (
                        <div className="flex flex-col items-center gap-2 text-xs text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                          <span>Loading {activeMediaTab} video...</span>
                        </div>
                      );
                    }
                    if (activeVid?.embed_url) {
                      return (
                        <iframe
                          key={activeVid.embed_url}
                          src={activeVid.embed_url}
                          title={activeVid.title || `${game.title} ${activeMediaTab}`}
                          referrerPolicy="strict-origin-when-cross-origin"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      );
                    }
                    const fallbackYt = `https://www.youtube.com/results?search_query=${quotedTitle}+${quotedPlatform}+${activeMediaTab}`;
                    return (
                      <div className="text-center space-y-2.5 p-6">
                        <Film className="w-8 h-8 text-slate-500 mx-auto" />
                        <p className="text-xs text-slate-400">No direct video embed resolved for this title.</p>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(fallbackYt).catch(() => {});
                            setCopiedVideoUrl(true);
                            setTimeout(() => setCopiedVideoUrl(false), 2000);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-white/10 cursor-pointer"
                        >
                          {copiedVideoUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedVideoUrl ? 'YouTube Query Copied' : 'Copy YouTube Search Link'}</span>
                        </button>
                      </div>
                    );
                  })()}

                  {activeMediaTab === 'screenshots' && screenshots.length > 0 && (
                    <div className="w-full h-full relative flex items-center justify-center bg-black">
                      <img
                        src={screenshots[selectedScreenshot] || screenshots[0]}
                        alt={`${game.title} Screenshot`}
                        className="max-h-full max-w-full object-contain"
                      />
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10">
                        {screenshots.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedScreenshot(idx)}
                            className={`w-14 h-9 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                              selectedScreenshot === idx ? 'border-cyan-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={s} alt="thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DETAILS & CONTENT SECTION */}
              <div className="p-6 md:p-8">

                {/* Title & Badges */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md bg-cyan-900/50 text-cyan-300 border border-cyan-500/40 text-xs font-bold uppercase tracking-wider">
                        {game.platform}
                      </span>
                      {game.release_year ? (
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {game.release_year}
                        </span>
                      ) : null}
                      {(game.developer || game.publisher) && (
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-500" />
                          {game.developer || game.publisher}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <h2 id="gameModalTitle" className="font-display text-2xl md:text-3xl font-black text-white tracking-wide">
                        {game.title}
                      </h2>
                      {onToggleFavorite && (
                        <button
                          onClick={() => {
                            playFavoriteSound();
                            onToggleFavorite(game);
                          }}
                          className={`p-2 rounded-xl border transition-all hover:scale-110 shadow cursor-pointer ${
                            game.is_favorite
                              ? 'bg-rose-500 text-white border-rose-400'
                              : 'bg-slate-800 text-slate-400 border-white/10 hover:text-rose-400'
                          }`}
                          title={game.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                        >
                          <Heart className={`w-4 h-4 ${game.is_favorite ? 'fill-white' : ''}`} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleRefreshTheGamesDb}
                        disabled={refreshingMeta}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/60 border border-sky-500/30 text-sky-300 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                        title="Fetch latest cover art & synopsis from TheGamesDB"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshingMeta ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">{refreshingMeta ? 'Refreshing...' : 'Refresh Art'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Rating Display */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-1 text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const displayScore = currentUserRating !== null ? currentUserRating : (game.rating > 0 ? Math.round(game.rating) : 0);
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleRate(star)}
                              className="p-0.5 hover:scale-125 transition-transform cursor-pointer"
                              title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  star <= displayScore
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-600'
                                }`}
                              />
                            </button>
                          );
                        })}
                        <span className="font-bold text-base text-white ml-1.5">
                          {currentUserRating !== null
                            ? currentUserRating.toFixed(1)
                            : (game.rating > 0 ? Number(game.rating).toFixed(1) : '—')}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {currentUserRating !== null
                          ? 'Your Personal Rating (Saved)'
                          : (game.rating_count > 0 ? `${game.rating_count.toLocaleString()} user reviews` : 'Unrated')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="py-6 border-b border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2.5">
                    Game Overview & Metadata
                  </h4>
                  <p className="text-slate-200 text-sm md:text-base leading-relaxed whitespace-pre-line font-normal">
                    {enrichedDescription || game.description}
                  </p>
                </div>

                {/* Live Download Status if Active */}
                {isDownloading && (
                  <div className="my-6 p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        Downloading {game.title}...
                      </span>
                      <span className="text-cyan-400 font-mono font-bold">
                        {downloadState.progress.toFixed(1)}% • {downloadState.speed} (ETA: {downloadState.eta})
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${downloadState.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Completed Local File Banner */}
                {isCompleted && (
                  <div className="my-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-emerald-300 text-sm font-semibold min-w-0">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold">ROM Saved on Local Drive</div>
                        <div className="text-xs text-emerald-400/80 font-mono truncate">
                          {resolvedLocalPath || `/Volumes/ROMS/${game.platform}/`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {resolvedLocalPath && (
                        <button
                          onClick={handleCopyPath}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold text-xs transition-all cursor-pointer"
                          title="Copy local file path"
                        >
                          {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedPath ? 'Copied' : 'Copy Path'}</span>
                        </button>
                      )}
                      <button
                        onClick={handleRevealInFinder}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-bold text-xs shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span>Reveal in Finder</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* DOWNLOAD SOURCES ACTION BAR */}
                <div className="pt-6 space-y-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Download Sources & BitTorrent Magnet
                    </h4>
                  </div>

                  {/* SAVE STRAIGHT TO: LOCAL DRIVE / ICLOUD / GOOGLE DRIVE / ONEDRIVE */}
                  <div className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5 text-sky-400" />
                      <span>Save Straight To:</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { id: 'local', label: 'Local Drive', available: true, mode: 'local' },
                        ...(cloudTargetsInfo.targets || []).map((t) => ({
                          id: t.id,
                          label: t.name,
                          available: Boolean(t.available),
                          mode: t.mode,
                        })),
                      ].map((opt) => {
                        const active = selectedCloudTarget === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              playClick();
                              if (!opt.available && onOpenSettings) {
                                onClose();
                                onOpenSettings();
                              } else {
                                setSelectedCloudTarget(opt.id);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                              active
                                ? 'bg-sky-500/20 text-sky-200 border-sky-400/60 shadow-sm'
                                : opt.available
                                ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-white/10'
                                : 'bg-slate-950/60 text-slate-500 border-white/5 hover:text-slate-300'
                            }`}
                          >
                            {opt.id === 'local' ? (
                              <HardDrive className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <Cloud className={`w-3 h-3 ${opt.available ? 'text-sky-400' : 'text-slate-500'}`} />
                            )}
                            <span>{opt.label}</span>
                            {opt.id !== 'local' && !opt.available && (
                              <span className="text-[9px] font-mono text-amber-400">+ Setup</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {(() => {
                      const readyMirror = romMirrors.find((m) => m.is_downloadable !== false && !m.requires_realdebrid);
                      const fallbackLocked = !readyMirror ? romMirrors[0] : null;
                      if (fallbackLocked && fallbackLocked.requires_realdebrid && !realdebridActive) {
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              playClick();
                              if (onOpenSettings) {
                                onClose();
                                onOpenSettings();
                              }
                            }}
                            className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold transition-all shadow-lg hover:scale-[1.02] active:scale-98 cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
                                <Lock className="w-5 h-5 text-black" />
                              </div>
                              <div className="text-left">
                                <div className="text-sm font-black tracking-wide">
                                  Unlock Hoster ({fallbackLocked.source_name})
                                </div>
                                <div className="text-[11px] text-black/80 font-semibold">
                                  Add a Real-Debrid token in Settings to download
                                </div>
                              </div>
                            </div>
                            <span className="text-xs bg-black/20 px-2 py-1 rounded-md uppercase font-mono">
                              RD
                            </span>
                          </button>
                        );
                      }
                      const primaryMirror = readyMirror || romMirrors[0];
                      return (
                        <button
                          onClick={() => {
                            if (primaryMirror) {
                              handleDownloadMirror(primaryMirror);
                            } else {
                              onStartDownload(game, 'direct', null, null, null, selectedCloudTarget);
                            }
                          }}
                          className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold transition-all shadow-glow-cyan hover:scale-[1.02] active:scale-98 cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
                              <Download className="w-5 h-5 text-black" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-black tracking-wide">
                                {primaryMirror ? `Download ROM (${primaryMirror.source_name})` : 'Download ROM File'}
                              </div>
                              <div className="text-[11px] text-black/80 font-semibold">
                                {primaryMirror
                                  ? `${primaryMirror.quality} • ${primaryMirror.file_size_mb > 0 ? formatModalSize(primaryMirror.file_size_mb) : 'Ready In-App'}`
                                  : (loadingMirrors ? 'Resolving exact-game mirrors...' : `Direct Preservation CDN • ${formatModalSize(game.file_size_mb)}`)}
                              </div>
                            </div>
                          </div>
                          <span className="text-xs bg-black/20 px-2 py-1 rounded-md uppercase font-mono">
                            {primaryMirror?.format || game.rom_format || 'ROM'}
                          </span>
                        </button>
                      );
                    })()}

                    {game.magnet_uri && (
                      <a
                        href={game.magnet_uri}
                        onClick={(e) => {
                          e.preventDefault();
                          handleCopyMagnet();
                        }}
                        className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 hover:border-violet-500/50 text-white font-semibold transition-all hover:scale-[1.02] active:scale-98 group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <Magnet className="w-5 h-5 text-violet-400" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-slate-100 group-hover:text-violet-300 transition-colors">
                              P2P Magnet Link
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {copiedMagnet ? 'Magnet Copied to Clipboard!' : 'BitTorrent P2P Network'}
                            </div>
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-800 text-slate-400 group-hover:text-violet-300">
                          {copiedMagnet ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </div>
                      </a>
                    )}
                  </div>

                  {/* VERIFIED ROM DOWNLOAD SOURCES & MIRRORS CARD */}
                  <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 border border-cyan-500/30 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">
                          Verified ROM Mirrors &amp; Torrents
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                          {romMirrors.length} Download Sources
                        </span>
                        {realdebridActive ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <Unlock className="w-3 h-3" />
                            <span>{rdUnlockedCount > 0 ? `Real-Debrid Unlocked (${rdUnlockedCount})` : 'Real-Debrid Active'}</span>
                          </span>
                        ) : (romMirrors.some(m => m.requires_realdebrid) && onOpenSettings && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenSettings();
                            }}
                            className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Lock className="w-3 h-3" />
                            <span>Unlock Hosters with Real-Debrid</span>
                          </button>
                        ))}
                      </div>
                      {loadingMirrors && (
                        <div className="flex items-center gap-1.5 text-[11px] text-cyan-400 font-mono">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Searching verified ROM mirrors...</span>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Multi-source ROM discovery: Ranked by Real-Debrid priority (when enabled), measured CDN speed, and live torrent seeds/peers.
                    </p>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-cyan-900">
                      {romMirrors.map((mirror, idx) => (
                        <div
                          key={mirror.id || idx}
                          className="p-3 rounded-xl bg-slate-950/70 border border-white/5 hover:border-cyan-500/40 flex items-center justify-between gap-3 transition-all group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                mirror.badge_color === 'purple' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                                mirror.badge_color === 'cyan' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                                mirror.badge_color === 'amber' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                                'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}>
                                {mirror.badge || mirror.source_name}
                              </span>
                              <span className="text-xs font-bold text-white truncate max-w-xs">
                                {mirror.title}
                              </span>
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-black/60 text-slate-300">
                                {mirror.format}
                              </span>
                              {mirror.file_size_mb > 0 && (
                                <span className="text-[10px] font-mono text-emerald-400">
                                  {formatModalSize(mirror.file_size_mb)}
                                </span>
                              )}
                              {mirror.speed_mbps > 0 && (
                                <span
                                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-700/60"
                                  title={mirror.latency_ms < 9999 ? `Measured HTTP speed (${mirror.latency_ms}ms latency)` : 'Measured HTTP speed'}
                                >
                                  ⚡ {Number(mirror.speed_mbps).toFixed(1)} MB/s
                                </span>
                              )}
                              {mirror.is_realdebrid && !(mirror.speed_mbps > 0) && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-700/60">
                                  RD High-Speed
                                </span>
                              )}
                              {(mirror.seeders > 0 || mirror.peers > 0) && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-700/60">
                                  ▲ {mirror.seeders || 0}S • {mirror.peers || mirror.seeders || 0}P
                                </span>
                              )}
                              {mirror.requires_realdebrid && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-700/60 flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>RD Required</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {mirror.quality} • {mirror.source_name}
                            </div>
                          </div>

                          {mirror.requires_realdebrid && !realdebridActive ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (onOpenSettings) {
                                  onClose();
                                  onOpenSettings();
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Unlock RD</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDownloadMirror(mirror)}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs flex items-center gap-1.5 transition-all shadow-glow-cyan shrink-0 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-black" />
                              <span>Download ROM</span>
                            </button>
                          )}
                        </div>
                      ))}

                      {romMirrors.length === 0 && !loadingMirrors && (
                        <div className="p-3 text-center rounded-xl bg-slate-950/40 border border-white/5 text-xs text-slate-400">
                          No direct downloadable ROM mirrors matched this exact game title yet. Click any source below to scrape directly in-app or attach a custom URL in the Web Sources tab.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* IN-APP COMMUNITY SOURCE SCRAPERS (ZERO EXTERNAL REDIRECTS) */}
                  <div className="mt-4 p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                          In-App Community Source Scrapers
                        </h4>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        Direct In-App Scrape &amp; Download
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Click any configured source to scrape exact matches for <span className="text-slate-200 font-semibold">{game.title}</span> and queue downloads directly inside OmniVault:
                    </p>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {activeHelpers.map((helper, idx) => {
                        if (!helper || !helper.name) return null;
                        const key = helper.source_id || helper.name || idx;
                        const isScraping = Boolean(helper.source_id && scrapingSourceId === helper.source_id);
                        const isSelected = Boolean(selectedCommunitySource && (selectedCommunitySource.source_id || selectedCommunitySource.name) === (helper.source_id || helper.name));
                        const cachedCount = helper.source_id ? romMirrors.filter((m) => m.source_id === helper.source_id).length : 0;
                        const isCopied = copiedHelperKey === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleScrapeCommunitySource(helper)}
                            disabled={isScraping}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-60 ${
                              isSelected
                                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-cyan-300 border-white/10'
                            }`}
                          >
                            {isScraping ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                            ) : helper.can_scrape === false ? (
                              isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />
                            ) : (
                              <Search className="w-3 h-3 text-cyan-400" />
                            )}
                            <span>{isCopied ? `${helper.name} (Copied URL)` : helper.name}</span>
                            {cachedCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[10px] font-mono">
                                {cachedCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline Results from Clicked Community Source */}
                    {selectedCommunitySource && (
                      <div className="mt-2 p-3.5 rounded-xl bg-slate-950/70 border border-cyan-500/30 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-cyan-400" />
                            <span>
                              {scrapingSourceId === selectedCommunitySource.source_id
                                ? `Scraping ${selectedCommunitySource.name} for "${game.title}"...`
                                : `${selectedCommunitySource.name}: ${communitySourceMirrors.length} exact match${communitySourceMirrors.length === 1 ? '' : 'es'}`}
                            </span>
                          </div>
                          {(() => {
                            const bestDirect = communitySourceMirrors.find((m) => m.is_downloadable !== false && !m.requires_realdebrid);
                            if (!bestDirect) return null;
                            return (
                              <button
                                type="button"
                                onClick={() => handleDownloadMirror(bestDirect)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download Best Match</span>
                              </button>
                            );
                          })()}
                        </div>

                        {communitySourceError && (
                          <div className="text-xs text-rose-300 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>{communitySourceError}</span>
                          </div>
                        )}

                        {!scrapingSourceId && !communitySourceError && communitySourceMirrors.length === 0 && (
                          <div className="text-xs text-slate-400">
                            No exact downloadable ROM for <span className="text-slate-200 font-semibold">{game.title}</span> ({game.platform}) was returned by {selectedCommunitySource.name}.
                          </div>
                        )}

                        {communitySourceMirrors.length > 0 && (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {communitySourceMirrors.map((cm, cIdx) => (
                              <div
                                key={cm.id || cm.direct_url || cIdx}
                                className="p-2.5 rounded-lg bg-slate-900/90 border border-white/10 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-white truncate">{cm.title}</div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {cm.format} • {cm.quality}{cm.file_size_mb > 0 ? ` • ${formatModalSize(cm.file_size_mb)}` : ''}
                                  </div>
                                </div>
                                {cm.requires_realdebrid && !realdebridActive ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onOpenSettings) {
                                        onClose();
                                        onOpenSettings();
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                                  >
                                    <Lock className="w-3 h-3" />
                                    <span>Unlock RD</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadMirror(cm)}
                                    className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download ROM</span>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* COMMUNITY REVIEWS & NOTES SECTION */}
                <div className="pt-8 border-t border-white/10 mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-cyan-400" />
                        <span>Community Notes & Reviews</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {reviewsData?.total_reviews || reviews.length} Reviews
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Catalog notes, dump revision feedback, and community ratings.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowWriteReview(!showWriteReview)}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all self-start sm:self-auto cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{showWriteReview ? 'Cancel Review' : 'Write a Review'}</span>
                    </button>
                  </div>

                  {showWriteReview && (
                    <form onSubmit={handleSubmitReview} className="mb-6 p-4 rounded-2xl bg-slate-900 border border-cyan-500/40 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 font-semibold">Your Rating:</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setNewReviewRating(star)}
                                className="p-1 hover:scale-125 transition-transform cursor-pointer"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    star <= newReviewRating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-600'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                          <span className="text-xs font-bold text-amber-300 ml-1">{newReviewRating}.0 / 5.0</span>
                        </div>

                        <input
                          type="text"
                          value={newReviewAuthor}
                          onChange={(e) => setNewReviewAuthor(e.target.value)}
                          placeholder="Display Name (e.g. VaultExplorer)"
                          className="px-3 py-1.5 text-xs rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                          maxLength={30}
                        />
                      </div>

                      <textarea
                        value={newReviewText}
                        onChange={(e) => setNewReviewText(e.target.value)}
                        placeholder="Share notes about this title, recommended revisions, or soundtrack/gameplay highlights..."
                        rows={3}
                        className="w-full p-3 text-xs rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 leading-relaxed resize-none"
                        required
                      />

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowWriteReview(false)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingReview}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-bold shadow-glow-cyan cursor-pointer"
                        >
                          {submittingReview ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          <span>{submittingReview ? 'Posting...' : 'Post Review'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3">
                    {loadingReviews ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading reviews...</div>
                    ) : reviews.length > 0 ? (
                      reviews.map((r, idx) => (
                        <div
                          key={r.id || idx}
                          className={`p-4 rounded-2xl border transition-all ${
                            r.is_user
                              ? 'bg-cyan-950/20 border-cyan-500/40 shadow-sm'
                              : 'bg-slate-900/60 border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={r.avatar}
                                alt={r.author}
                                className="w-7 h-7 rounded-full bg-slate-800 border border-white/10"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white">{r.author}</span>
                                  {r.is_user && (
                                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500">{r.created_at || 'Catalog'}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-amber-400 text-xs font-bold">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              <span>{Number(r.rating).toFixed(1)}</span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed font-normal whitespace-pre-line pl-9">
                            {r.review_text}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No reviews yet. Be the first to add a note for this title!
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: WEB SOURCES & CUSTOM LINK */}
          {modalTab === 'sources' && (
            <div className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-400" />
                  <span>Web Sources & Custom Download Link</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scan live direct mirrors, open external archive searches, or attach a custom download URL / magnet link for this title.
                </p>
              </div>

              {/* Live Direct Mirror Failover Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-blue-950/30 border border-cyan-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span>Live Direct Mirror Scan</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Test configured mirror directories to locate an active HTTP 200/206 direct ROM download stream.
                    </p>
                  </div>
                  <button
                    onClick={handleScanMirrors}
                    disabled={checkingMirror}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-950/50 disabled:opacity-50 flex-shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingMirror ? 'animate-spin' : ''}`} />
                    {checkingMirror ? 'Testing Mirrors...' : 'Scan Direct Mirrors'}
                  </button>
                </div>

                {liveMirror && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Verified Live Mirror: {liveMirror.source_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5 truncate max-w-md">
                        {liveMirror.filename || game.title}
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadFromLiveMirror}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download via Mirror
                    </button>
                  </div>
                )}

                {mirrorError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{mirrorError}</span>
                  </div>
                )}
              </div>

              {/* Attach Custom Direct URL or Magnet URI */}
              <form
                onSubmit={(e) => handleSaveCustomSource(e, false)}
                className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-cyan-400" />
                    <span>Attach Custom Direct URL or Magnet URI</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">Saved to Catalog Entry</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">
                      Direct Archive / ISO / ROM URL
                    </label>
                    <input
                      type="text"
                      value={customDirectUrl}
                      onChange={(e) => setCustomDirectUrl(e.target.value)}
                      placeholder="https://example.com/roms/game.zip"
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">
                      BitTorrent Magnet URI
                    </label>
                    <input
                      type="text"
                      value={customMagnetUri}
                      onChange={(e) => setCustomMagnetUri(e.target.value)}
                      placeholder="magnet:?xt=urn:btih:..."
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400 font-mono"
                    />
                  </div>
                </div>

                {sourceSavedMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{sourceSavedMsg}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={savingCustomSource}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {savingCustomSource ? 'Saving...' : 'Save Link'}
                  </button>
                  <button
                    type="button"
                    disabled={savingCustomSource || (!customDirectUrl.trim() && !customMagnetUri.trim())}
                    onClick={() => handleSaveCustomSource(null, true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-black flex items-center gap-1.5 shadow-glow-cyan transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save & Download Now</span>
                  </button>
                </div>
              </form>

              {/* In-App Community Scrapers & Directories */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Configured Community Sources (In-App Direct Scrape)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeHelpers.map((s, idx) => {
                    const key = s.source_id || s.name || idx;
                    const isScraping = Boolean(s.source_id && scrapingSourceId === s.source_id);
                    const isCopied = copiedHelperKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (s.can_scrape === false) {
                            handleCopyHelperUrl(key, s.url);
                          } else {
                            handleScrapeCommunitySource(s).then(() => setModalTab('overview'));
                          }
                        }}
                        disabled={isScraping}
                        className="p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 hover:border-cyan-400/40 transition-all flex items-center justify-between group text-left cursor-pointer disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white group-hover:text-cyan-300 flex items-center gap-1.5">
                            <span>{s.name}</span>
                            {isScraping ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            ) : s.can_scrape === false ? (
                              isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <Search className="w-3.5 h-3.5 text-cyan-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 truncate">
                            {s.can_scrape === false
                              ? (isCopied ? 'URL copied to clipboard' : 'Click to copy directory URL')
                              : (s.description || 'Scrape & download directly in OmniVault')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Search Templates (User Configured) */}
              {customTemplates && customTemplates.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>User-Configured Search Templates (Copy Query URL)</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {customTemplates.map((tpl) => {
                      const tKey = `tpl-${tpl.id}`;
                      const isCopied = copiedHelperKey === tKey;
                      const resolvedUrl = resolveTemplateUrl(tpl.url_template);
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleCopyHelperUrl(tKey, resolvedUrl)}
                          className="p-4 rounded-2xl bg-amber-950/20 hover:bg-amber-950/30 border border-amber-500/30 hover:border-amber-400/60 transition-all flex items-center justify-between group text-left cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200 flex items-center gap-1.5">
                              <span>{tpl.name}</span>
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[240px]">
                              {isCopied ? 'Query URL copied to clipboard' : (tpl.description || tpl.url_template)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Provider Config Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-950/40 to-slate-900 border border-violet-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-violet-400" />
                    <span>Configure Search Engines & Torznab Feeds</span>
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Connect custom indexers (Prowlarr, Jackett) or add custom search templates.
                  </p>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow shrink-0 cursor-pointer"
                  >
                    Manage Providers
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </dialog>
  );
}
