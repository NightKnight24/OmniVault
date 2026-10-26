import React, { useEffect, useRef, useState } from 'react';
import { 
  X, Star, Download, Film, Image as ImageIcon, Copy, Check, 
  ExternalLink, Gamepad2, Calendar, Building, Sparkles, Magnet,
  Play, Volume2, ShieldCheck, Wand2, FileCode, Wrench, Globe,
  ArrowUpRight, Share2, Save, Heart, Sliders, CheckCircle2, AlertCircle, Zap, RefreshCw,
  Trophy, RotateCcw, Clock, Plus, MessageSquare, Edit3, Send, Disc
} from 'lucide-react';
import PhysicalMedia3D from './PhysicalMedia3D';
import { 
  fetchGameById, fetchGameCheats, fetchGamePatchesAndMods, exportGameCheats, 
  fetchSearchTemplates, rateGame, findWorkingMirror, importAndDownloadMirror,
  fetchGameAchievements, fetchSaveSnapshots, createSaveSnapshot, rollbackSaveSnapshot,
  getGameMirrors, fetchGameVideo, fetchGameReviews, submitGameReview, scanGameAchievements
} from '../services/api';
import { playClick, playFavoriteSound, playCoin, playVictorySound } from '../utils/soundEffects';
import OmniPlayerModal from './OmniPlayerModal';

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
  downloadState,
  initialTab = 'overview',
  onOpenSettings,
  onOpenCheatLab,
  onOpenModStore
}) {
  const dialogRef = useRef(null);
  const getCleanVideoQuery = (rawTitle, rawPlatform, mode) => {
    if (!rawTitle) return '';
    let t = rawTitle;
    t = t.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    if (t.includes(', The')) {
      t = 'The ' + t.replace(', The', '');
    } else if (t.includes(', A')) {
      t = 'A ' + t.replace(', A', '');
    }
    const platMap = {
      'PS1': 'PlayStation',
      'PS2': 'PS2',
      'PS3': 'PS3',
      'PS4': 'PS4',
      'PSP': 'PSP',
      'PSVita': 'PS Vita',
      'Xbox360': 'Xbox 360',
      'Xbox': 'Xbox',
      'WiiU': 'Wii U',
      'Switch': 'Nintendo Switch',
      'GameCube': 'GameCube',
      'N64': 'Nintendo 64',
      'SNES': 'Super Nintendo',
      'NES': 'NES',
      'Genesis': 'Sega Genesis',
      'Dreamcast': 'Dreamcast',
      'Saturn': 'Sega Saturn',
      '3DS': 'Nintendo 3DS',
      'NDS': 'Nintendo DS',
      'GBA': 'Game Boy Advance',
      'GBC': 'Game Boy Color',
      'GB': 'Game Boy'
    };
    const pName = platMap[rawPlatform] || rawPlatform || '';
    if (mode === 'gameplay') {
      return `${t} ${pName} 60fps gameplay longplay`.trim();
    } else {
      return `${t} ${pName} official launch trailer`.trim();
    }
  };

  const [modalTab, setModalTab] = useState(initialTab); // 'overview', 'cheats', 'patches', 'mods', 'sources'
  const [activeMediaTab, setActiveMediaTab] = useState('trailer'); // 'trailer', 'boxart', 'screenshots'
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [videoMode, setVideoMode] = useState('gameplay'); // 'gameplay' | 'trailer'
  const [videoEmbedUrl, setVideoEmbedUrl] = useState(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  const handlePlayVideo = async (mode) => {
    setVideoMode(mode);
    setIsPlayingVideo(true);
    setLoadingVideo(true);
    try {
      const res = await fetchGameVideo(game.id, mode);
      if (res?.embed_url) {
        setVideoEmbedUrl(res.embed_url);
      }
    } catch (err) {
      console.error("Failed to load video:", err);
    } finally {
      setLoadingVideo(false);
    }
  };
  const [copiedMagnet, setCopiedMagnet] = useState(false);
  const [copiedCheatId, setCopiedCheatId] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  const [currentUserRating, setCurrentUserRating] = useState(null);
  const [enrichedDescription, setEnrichedDescription] = useState(null);
  
  // Cheats & Patches State
  const [cheats, setCheats] = useState([]);
  const [patches, setPatches] = useState([]);
  const [mods, setMods] = useState([]);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [loadingExtras, setLoadingExtras] = useState(false);

  // RetroAchievements & Time-Machine State
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [isScanningSaves, setIsScanningSaves] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [newSnapshotLabel, setNewSnapshotLabel] = useState('');
  const [detailToast, setDetailToast] = useState(null);

  // Community Written Reviews State
  const [reviewsData, setReviewsData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewAuthor, setNewReviewAuthor] = useState('Vault Explorer');
  const [newReviewText, setNewReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (game?.id) {
      setEnrichedDescription(null);
      fetchGameById(game.id)
        .then(detail => {
          if (detail && detail.description) {
            setEnrichedDescription(detail.description);
          }
        })
        .catch(console.error);

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

  useEffect(() => {
    if (game && modalTab === 'trophies' && !achievements) {
      setAchievementsLoading(true);
      fetchGameAchievements(game.id)
        .then(data => setAchievements(data))
        .catch(console.error)
        .finally(() => setAchievementsLoading(false));
    }
    if (game && modalTab === 'saves' && snapshots.length === 0) {
      setSnapshotsLoading(true);
      fetchSaveSnapshots(game.id)
        .then(data => setSnapshots(data.snapshots || []))
        .catch(console.error)
        .finally(() => setSnapshotsLoading(false));
    }
  }, [game, modalTab]);

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
        setDetailToast({ title: 'Review Saved', message: 'Your review and rating were saved to the vault.' });
      }
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleScanAchievements = async () => {
    if (!game) return;
    setIsScanningSaves(true);
    playClick();
    try {
      const res = await scanGameAchievements(game.id);
      const updated = await fetchGameAchievements(game.id);
      setAchievements(updated);
      if (res?.should_chime) {
        playVictorySound();
      } else {
        playCoin();
      }
      setDetailToast({
        title: 'Save Data Scanned',
        message: res.message || `Scanned ${res.active_saves_found || 0} save files. Progress is up to date.`
      });
    } catch (err) {
      console.error('Failed to scan achievements:', err);
    } finally {
      setIsScanningSaves(false);
    }
  };

  // Live Mirror & Torrentio Resolution State
  const [checkingMirror, setCheckingMirror] = useState(false);
  const [liveMirror, setLiveMirror] = useState(null);
  const [mirrorError, setMirrorError] = useState(null);
  const [romMirrors, setRomMirrors] = useState([]);
  const [loadingMirrors, setLoadingMirrors] = useState(false);

  const handleDownloadMirror = async (mirror) => {
    if (!mirror || !game) return;
    playClick();
    if (onStartDownload) {
      onStartDownload(game, 'direct', mirror.direct_url, mirror.filename, mirror.source_name);
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

  const handleDownloadFromLiveMirror = async () => {
    if (!liveMirror || !game) return;
    playClick();
    if (onStartDownload) {
      onStartDownload(game, 'direct', liveMirror.direct_url, liveMirror.filename, liveMirror.source_name);
    }
    onClose();
  };

  // Synchronize modal state with dialog element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (game && !dialog.open) {
      dialog.showModal();
      setModalTab(initialTab);
      setActiveMediaTab('trailer');
      setSelectedScreenshot(0);
      setIsPlayingVideo(false);
      setVideoMode('gameplay');
      setVideoEmbedUrl(null);
      setLoadingVideo(false);
      setExportMessage(null);
      setCurrentUserRating(game.user_rating || null);
      setEnrichedDescription(game.description || null);

      // Load enriched metadata/synopsis, cheats, patches, mods, and custom search templates
      setLoadingExtras(true);
      Promise.all([
        fetchGameById(game.id).catch(() => null),
        fetchGameCheats(game.id).catch(() => ({ cheats: [] })),
        fetchGamePatchesAndMods(game.id).catch(() => ({ patches: [], mods: [] })),
        fetchSearchTemplates().catch(() => ({ templates: [] }))
      ]).then(([fullGame, cheatsRes, extrasRes, templatesRes]) => {
        if (fullGame?.description) {
          setEnrichedDescription(fullGame.description);
        }
        setCheats(cheatsRes.cheats || []);
        setPatches(extrasRes.patches || []);
        setMods(extrasRes.mods || []);
        setCustomTemplates(templatesRes.templates || []);
      }).finally(() => {
        setLoadingExtras(false);
      });

      // Live ROM Mirrors & P2P Aggregator
      setRomMirrors([]);
      setLoadingMirrors(true);
      getGameMirrors(game.id)
        .then(res => {
          const list = res?.mirrors || res?.streams;
          if (list) {
            setRomMirrors(list);
            if (list.length > 0 && !liveMirror) {
              setLiveMirror(list[0]);
            }
          }
        })
        .catch(err => {
          console.error("ROM mirrors discovery error:", err);
        })
        .finally(() => {
          setLoadingMirrors(false);
        });

    } else if (!game && dialog.open) {
      dialog.close();
    }

    // Modern Web Guidance: Light-dismiss fallback
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

  const handleCopyCheat = (cheat) => {
    navigator.clipboard.writeText(cheat.code);
    setCopiedCheatId(cheat.id);
    setTimeout(() => setCopiedCheatId(null), 2000);
  };

  const handleExportCheats = async () => {
    try {
      const res = await exportGameCheats(game.id);
      setExportMessage(res.message);
      setTimeout(() => setExportMessage(null), 3500);
    } catch (err) {
      alert(`Could not export cheats: ${err.message}`);
    }
  };

  const handleRate = async (score) => {
    playFavoriteSound();
    setCurrentUserRating(score);
    try {
      await rateGame(game.id, score);
    } catch (err) {
      console.error("Failed to save rating:", err);
    }
  };

  const screenshots = game.screenshots || [];
  const isDownloading = downloadState && downloadState.status === 'downloading';
  const isCompleted = (downloadState && downloadState.status === 'completed') || Boolean(game.path);

  // Alternative Sites Search Links
  const quotedTitle = encodeURIComponent(game.title);
  const altSources = [
    { name: "BlueRoms (Direct CDN)", url: `https://www.blueroms.ws/${game.platform.toLowerCase()}`, desc: "Direct high-speed CDN for 3DS, Vita, PSP, NDS, PS1-4, Xbox, Nintendo" },
    { name: "ConsoleRoms (Direct CDN)", url: `https://www.consoleroms.com/search?search_term_string=${quotedTitle}`, desc: "Clean console ROMs directory with direct Cloudflare CDN downloads" },
    { name: "DLPSGame (PKG Mirror)", url: `https://dlpsgame.com/?s=${quotedTitle}`, desc: "Dedicated high-speed 1fichier & MediaFire mirror for PS4 & PS3 PKGs" },
    { name: "RomsGames", url: `https://www.romsgames.net/search/?q=${quotedTitle}`, desc: "Verified retro ROM portal & preservation releases" },
    { name: "RomsFun", url: `https://romsfun.com/?s=${quotedTitle}`, desc: "Multi-region versions (USA, Europe, Japan, Revision 1)" },
    { name: "RomsLab", url: `https://romslab.com/?s=${quotedTitle}`, desc: "Modern switch, handheld & retro releases" },
    { name: "Ziperto", url: `https://www.ziperto.com/?s=${quotedTitle}`, desc: "Specialized 3DS (CIA), Switch (NSP) & Vita (VPK) archive" },
    { name: "Vimm's Lair", url: `https://vimm.net/vault/?p=list&q=${quotedTitle}`, desc: "Classic The Vault preservation archive" }
  ];

  return (
    <dialog
      ref={dialogRef}
      id="gameDetailModal"
      closedby="any"
      aria-labelledby="gameModalTitle"
      className="m-auto bg-transparent p-0 max-w-4xl w-[94vw] rounded-3xl outline-none shadow-2xl backdrop:bg-black/80 backdrop:backdrop-blur-md"
    >
      <div className="relative bg-[#0d1322] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header Bar with Navigation Tabs and Close Button */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-3 bg-slate-950/90 z-20">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setModalTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'overview'
                  ? 'bg-cyan-500 text-black shadow-glow-cyan'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setModalTab('cheats')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'cheats'
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Cheats ({cheats.length})</span>
            </button>

            <button
              onClick={() => setModalTab('patches')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'patches'
                  ? 'bg-violet-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Patches ({patches.length})</span>
            </button>

            <button
              onClick={() => setModalTab('mods')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'mods'
                  ? 'bg-emerald-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Mods ({mods.length})</span>
            </button>

            <button
              onClick={() => setModalTab('sources')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'sources'
                  ? 'bg-sky-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Web Sources</span>
            </button>

            <button
              onClick={() => setModalTab('trophies')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'trophies'
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Trophies</span>
            </button>

            <button
              onClick={() => setModalTab('saves')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modalTab === 'saves'
                  ? 'bg-emerald-400 text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Time-Machine</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/20 flex items-center justify-center transition-all hover:scale-110"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="overflow-y-auto overscroll-contain flex-1">
          
          {/* TAB 1: OVERVIEW */}
          {modalTab === 'overview' && (
            <div>
              {/* MEDIA SECTION: Video Trailer, Gameplay & Gallery Tabs */}
              <div className="relative bg-slate-950 border-b border-white/10">
                
                {/* Media Switcher */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 p-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/15">
                  <button
                    onClick={() => setActiveMediaTab('trailer')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMediaTab === 'trailer'
                        ? 'bg-cyan-500 text-black shadow-glow-cyan'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Gamepad2 className="w-3.5 h-3.5" />
                    <span>Gameplay & Trailer</span>
                  </button>

                  <button
                    onClick={() => setActiveMediaTab('boxart')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMediaTab === 'boxart'
                        ? 'bg-cyan-500 text-black shadow-glow-cyan'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Box Art</span>
                  </button>

                  <button
                    onClick={() => setActiveMediaTab('physical3d')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeMediaTab === 'physical3d'
                        ? 'bg-cyan-500 text-black shadow-glow-cyan'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Disc className="w-3.5 h-3.5" />
                    <span>3D Cart / Disc</span>
                  </button>

                  {screenshots.length > 0 && (
                    <button
                      onClick={() => setActiveMediaTab('screenshots')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        activeMediaTab === 'screenshots'
                          ? 'bg-cyan-500 text-black shadow-glow-cyan'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Screenshots ({screenshots.length})</span>
                    </button>
                  )}
                </div>

                {/* Viewport */}
                <div className="aspect-video w-full max-h-[460px] bg-black flex items-center justify-center overflow-hidden relative">
                  {activeMediaTab === 'trailer' && (
                    isPlayingVideo ? (
                      <div className="w-full h-full relative bg-black flex flex-col">
                        <div className="px-4 py-2 bg-slate-900 border-b border-white/10 flex items-center justify-between text-xs z-20">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePlayVideo('gameplay')}
                              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                                videoMode === 'gameplay' 
                                  ? 'bg-cyan-500 text-black shadow-glow-cyan' 
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              🎮 60FPS Gameplay Showcase
                            </button>
                            <button
                              onClick={() => handlePlayVideo('trailer')}
                              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                                videoMode === 'trailer' 
                                  ? 'bg-cyan-500 text-black shadow-glow-cyan' 
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              🎬 Official Trailer
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setIsPlayingVideo(false);
                              setVideoEmbedUrl(null);
                            }}
                            className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
                          >
                            ✕ Close Player
                          </button>
                        </div>
                        {loadingVideo ? (
                          <div className="w-full flex-1 flex flex-col items-center justify-center bg-black gap-3">
                            <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                            <span className="text-xs text-slate-300 font-medium">
                              Resolving verified {videoMode === 'gameplay' ? '60FPS gameplay showcase' : 'official trailer'}...
                            </span>
                          </div>
                        ) : videoEmbedUrl ? (
                          <iframe
                            src={videoEmbedUrl}
                            title={`${game.title} Internal Video Showcase`}
                            className="w-full flex-1 border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            referrerPolicy="no-referrer-when-downgrade"
                            allowFullScreen
                          />
                        ) : (
                          <div className="w-full flex-1 flex flex-col items-center justify-center bg-black gap-2">
                            <span className="text-xs text-slate-400">Video showcase could not be loaded</span>
                            <button
                              onClick={() => handlePlayVideo(videoMode)}
                              className="text-xs text-cyan-400 hover:underline"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-full relative flex items-center justify-center overflow-hidden bg-gradient-to-t from-slate-950 via-slate-900 to-black">
                        {/* High-res in-game backdrop with blur */}
                        <img
                          src={game.backdrop || (game.box_art_2d && !game.box_art_2d.includes('libretro-thumbnails/MAME') ? game.box_art_2d : `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`)}
                          alt={`${game.title} Gameplay Showcase`}
                          className="absolute inset-0 w-full h-full object-cover opacity-35 blur-sm scale-105"
                          onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b101b] via-[#0b101b]/70 to-transparent" />

                        {/* Interactive Gameplay Showcase Controls */}
                        <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-lg">
                          <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center mb-4 shadow-glow-cyan backdrop-blur-md">
                            <Gamepad2 className="w-8 h-8 text-cyan-400" />
                          </div>
                          <h3 className="font-display font-black text-xl text-white mb-2 tracking-tight drop-shadow-md">
                            {game.title}
                          </h3>
                          <p className="text-xs text-slate-300 mb-6 font-medium max-w-md">
                            Experience in-app 60 FPS gameplay, speedruns, and official game trailers directly inside OmniVault.
                          </p>

                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                              onClick={() => handlePlayVideo('gameplay')}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan hover:scale-105 transition-all cursor-pointer"
                            >
                              <Play className="w-4 h-4 fill-black text-black" />
                              <span>Play 60FPS Gameplay</span>
                            </button>

                            <button
                              onClick={() => handlePlayVideo('trailer')}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-bold text-xs hover:scale-105 transition-all cursor-pointer"
                            >
                              <Film className="w-4 h-4 text-cyan-400" />
                              <span>Play Official Trailer</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {activeMediaTab === 'boxart' && (
                    <div className="w-full h-full p-8 flex items-center justify-center gap-8 bg-gradient-to-b from-slate-900 to-black">
                      <div className="text-center">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
                          Official 2D Cover Art
                        </span>
                        <img
                          src={game.box_art_2d && !game.box_art_2d.includes('libretro-thumbnails') && !['Switch', 'Xbox360', 'PS3', 'PS4', 'PSVita', '3DS', 'Xbox', 'WiiU', 'Arcade', 'Saturn', 'Dreamcast', 'Wii'].includes(game.platform) ? game.box_art_2d : `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`}
                          alt={`${game.title} 2D Box Art`}
                          className="max-h-72 rounded-xl shadow-2xl border border-white/20 object-contain hover:scale-105 transition-transform"
                          onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(game.platform)}`; }}
                        />
                      </div>
                    </div>
                  )}

                  {activeMediaTab === 'screenshots' && (
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
                            className={`w-14 h-9 rounded-lg overflow-hidden border-2 transition-all ${
                              selectedScreenshot === idx ? 'border-cyan-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={s} alt="thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeMediaTab === 'physical3d' && (
                    <div className="w-full h-full">
                      <PhysicalMedia3D game={game} />
                    </div>
                  )}
                </div>

              </div>

              {/* DETAILS & CONTENT SECTION */}
              <div className="p-6 md:p-8">
                
                {/* Title & Badges */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-cyan-900/50 text-cyan-300 border border-cyan-500/40 text-xs font-bold uppercase tracking-wider">
                        {game.platform}
                      </span>
                      {game.release_year ? (
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {game.release_year}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <Building className="w-3.5 h-3.5 text-slate-500" />
                        {game.developer || game.publisher}
                      </span>
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
                          title={game.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                        >
                          <Heart className={`w-4 h-4 ${game.is_favorite ? 'fill-white' : ''}`} />
                        </button>
                      )}
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
                    Game Overview & Lore
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

                {isCompleted && (
                  <div className="my-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-emerald-300 text-sm font-semibold">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <div>
                        <div className="font-bold">ROM Ready on Local Drive</div>
                        <div className="text-xs text-emerald-400/80 font-mono">
                          {game.path || `/Volumes/ROMS/${game.platform}/`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPlayer(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-bold text-xs shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      <span>Play in OmniVault</span>
                    </button>
                  </div>
                )}

                {/* DOWNLOAD SOURCES ACTION BAR */}
                <div className="pt-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3.5">
                    Download Sources & BitTorrent Magnet
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    
                    {/* Direct ROM Download / Torrentio Source Button */}
                    <button
                      onClick={() => {
                        if (romMirrors.length > 0) {
                          handleDownloadMirror(romMirrors[0]);
                        } else {
                          onStartDownload(game, 'direct');
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
                            {romMirrors.length > 0 ? `Download ROM (${romMirrors[0].source_name})` : 'Download ROM File'}
                          </div>
                          <div className="text-[11px] text-black/80 font-semibold">
                            {romMirrors.length > 0 
                              ? `${romMirrors[0].quality} • ${romMirrors[0].file_size_mb > 0 ? formatModalSize(romMirrors[0].file_size_mb) : 'Full Speed CDN'}`
                              : (loadingMirrors ? 'Resolving download mirrors...' : `Direct Preservation CDN • ${formatModalSize(game.file_size_mb)}`)}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs bg-black/20 px-2 py-1 rounded-md uppercase font-mono">
                        {romMirrors[0]?.format || game.rom_format}
                      </span>
                    </button>

                    {/* Authentic P2P Magnet Button (If Available) */}
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-cyan-300">
                          Verified ROM Mirrors & Torrents
                        </h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                          {romMirrors.length} Download Sources
                        </span>
                      </div>
                      {loadingMirrors && (
                        <div className="flex items-center gap-1.5 text-[11px] text-cyan-400 font-mono">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Searching verified ROM mirrors...</span>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Multi-source ROM discovery: Aggregates verified game dumps and torrents from ConsoleRoms CDN, RomsFast high-speed servers, RomsLab Switch NSPs, and configured P2P indexers.
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
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {mirror.quality} • {mirror.source_name}
                            </div>
                          </div>

                          <button
                            onClick={() => handleDownloadMirror(mirror)}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs flex items-center gap-1.5 transition-all shadow-glow-cyan shrink-0 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-black" />
                            <span>Download ROM</span>
                          </button>
                        </div>
                      ))}

                      {romMirrors.length === 0 && !loadingMirrors && (
                        <div className="p-3 text-center rounded-xl bg-slate-950/40 border border-white/5 text-xs text-slate-400">
                          No direct ROM mirrors responded for this exact game title. Use the web search helpers below or attach a custom source.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WEB SEARCH & COMMUNITY SOURCE HELPERS */}
                  <div className="mt-4 p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                          Community Source & Web Lookups
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Bring Your Own Source
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Need a specific revision or community dump? Jump directly to verified preservation queries on the web:
                    </p>
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {(game.web_search_helpers || [
                        { name: "Internet Archive", url: `https://archive.org/search.php?query=${encodeURIComponent(game.title + ' ' + (game.platform_name || game.platform))}` },
                        { name: "DuckDuckGo", url: `https://duckduckgo.com/?q=${encodeURIComponent(game.title + ' ' + (game.platform_name || game.platform) + ' preservation archive')}` },
                        { name: "Vimm's Lair", url: `https://vimm.net/vault/?p=list&q=${encodeURIComponent(game.title)}` },
                        { name: "RomsFun", url: `https://romsfun.com/?s=${encodeURIComponent(game.title)}` }
                      ]).map((helper, idx) => helper && helper.url ? (
                        <a
                          key={idx}
                          href={helper.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-cyan-300 text-xs font-semibold border border-white/10 transition-colors"
                        >
                          <span>{helper.name}</span>
                          <ArrowUpRight className="w-3 h-3 text-slate-400" />
                        </a>
                      ) : null)}
                    </div>
                  </div>
                </div>

                {/* COMMUNITY PLAYER REVIEWS & WRITE A REVIEW SECTION */}
                <div className="pt-8 border-t border-white/10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-cyan-400" />
                        <span>Player Reviews & Community Lore</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {reviewsData?.total_reviews || reviews.length} Reviews
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Authentic player impressions, 60 FPS emulation tuning, soundtrack analysis, and gameplay lore.
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

                  {/* Interactive Write Review Form */}
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
                        placeholder="Share your thoughts on gameplay mechanics, OST, difficulty, and emulator performance..."
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

                  {/* Reviews List */}
                  <div className="space-y-3">
                    {loadingReviews ? (
                      <div className="py-8 text-center text-xs text-slate-400">Loading community reviews...</div>
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
                                  {r.verified_player && (
                                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                                      Verified Player
                                    </span>
                                  )}
                                  {r.is_user && (
                                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500">{r.created_at || 'Preservation Vault'}</div>
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
                        No written reviews yet. Be the first to share your thoughts on this classic!
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: CHEATS */}
          {modalTab === 'cheats' && (
            <div className="p-6 md:p-8 space-y-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-amber-400" />
                    <span>Cheat Codes for {game.title}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verified Game Genie, Action Replay, and GameShark codes from the Libretro preservation database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenCheatLab?.(game)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs transition-all cursor-pointer shadow-md"
                    title="Open Cheat Engineering Lab for Save Diffing, RAM Scanning & ROM Analysis"
                  >
                    <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cheat Lab</span>
                  </button>

                  <button
                    onClick={handleExportCheats}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all cursor-pointer shadow-md"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Export .cht to ROM Folder</span>
                  </button>
                </div>
              </div>

              {exportMessage && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{exportMessage}</span>
                </div>
              )}

              {loadingExtras ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Loading verified cheat codes...
                </div>
              ) : cheats.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  No cheat codes found for this title.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {cheats.map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 flex items-center justify-between gap-3 hover:border-amber-400/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 block mb-0.5">
                          {c.type}
                        </span>
                        <div className="text-xs font-bold text-white truncate" title={c.description}>
                          {c.description}
                        </div>
                        <div className="font-mono text-[11px] text-cyan-300 bg-black/40 px-2 py-0.5 rounded mt-1.5 inline-block">
                          {c.code}
                        </div>
                      </div>

                      <button
                        onClick={() => handleCopyCheat(c)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-amber-400 hover:text-black text-slate-300 transition-colors flex-shrink-0 cursor-pointer"
                        title="Copy cheat code"
                      >
                        {copiedCheatId === c.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* TAB 3: PATCHES */}
          {modalTab === 'patches' && (
            <div className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-violet-400" />
                  <span>Patches & Translations for {game.title}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Community English translations, MSU-1 audio overhauls, FastROM performance accelerators, and bugfix restorations.
                </p>
              </div>

              <div className="space-y-3.5">
                {patches.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 hover:border-violet-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-950 text-violet-300 border border-violet-800">
                          {p.category}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Format: {p.format}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          by {p.author}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        {p.name}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {p.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-semibold whitespace-nowrap self-start sm:self-center">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      <span>Built-in Patch</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: MODS & ROM HACKS */}
          {modalTab === 'mods' && (
            <div className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-emerald-400" />
                  <span>ROM Hacks & Community Mods for {game.title}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Overhaul mods, quality-of-life rebalances, randomizer builds, and fan expansions with brand-new content.
                </p>
              </div>

              <div className="space-y-3.5">
                {mods.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 hover:border-emerald-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {m.category}
                        </span>
                        <span className="text-[11px] text-emerald-400 font-mono">
                          {m.version}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Difficulty: {m.difficulty}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        {m.name}
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {m.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold whitespace-nowrap self-start sm:self-center">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Built-in Mod</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: WEB SOURCES */}
          {modalTab === 'sources' && (
            <div className="p-6 md:p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-400" />
                  <span>Alternative Web & Community Sources</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct 1-click search shortcuts to explore this title across the top ROM preservation directories and communities.
                </p>
              </div>

              {/* Live Direct Mirror Failover Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-blue-950/30 border border-cyan-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      <span>Live Direct Mirror Failover</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Instantly test BlueRoms, r-roms, and mirror servers to find an active, verified direct ROM mirror.
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
                        {liveMirror.filename || game.title} • HTTP 200 Mirror Verified
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {altSources.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={handleScanMirrors}
                    className="p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 hover:border-cyan-400/40 transition-all flex items-center justify-between group text-left cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-cyan-300 flex items-center gap-1.5">
                        <span>{s.name}</span>
                        <Zap className="w-3 h-3 text-cyan-400" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {s.desc}
                      </p>
                    </div>
                    <RefreshCw className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 flex-shrink-0" />
                  </button>
                ))}
              </div>

              {/* Custom Search Templates (User Configured) */}
              {customTemplates && customTemplates.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>User-Configured Search Engines</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {customTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={handleScanMirrors}
                        className="p-4 rounded-2xl bg-amber-950/20 hover:bg-amber-950/30 border border-amber-500/30 hover:border-amber-400/60 transition-all flex items-center justify-between group text-left cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200 flex items-center gap-1.5">
                            <span>{tpl.name}</span>
                            <Sparkles className="w-3 h-3 text-amber-400/60" />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1 truncate max-w-[220px]">
                            {tpl.description || 'Internal ROM search provider'}
                          </p>
                        </div>
                        <RefreshCw className="w-4 h-4 text-amber-400 group-hover:text-amber-300 flex-shrink-0" />
                      </button>
                    ))}
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
                    Connect custom indexers (Prowlarr, Jackett) or add search templates for any website.
                  </p>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow shrink-0"
                  >
                    Manage Providers
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: UNIVERSAL TROPHIES & RETROACHIEVEMENTS */}
          {modalTab === 'trophies' && (
            <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-slate-900 border border-amber-500/40 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shadow-md">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{achievements?.system_type === 'retroachievements' ? 'RetroAchievements Online' : 'Universal Trophy Engine'}</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700/60 font-black">
                        {achievements?.system_type === 'retroachievements' ? 'Cloud Verified' : 'Save-Data Auto-Tracker'}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {achievements?.message || 'Trophies synchronize automatically with your emulator save files (.srm, .sav, .state) and Time-Machine snapshots.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t lg:border-t-0 lg:border-l border-white/10 pt-3 lg:pt-0 lg:pl-4">
                  {achievements && (
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Unlocked</div>
                        <div className="text-base font-black text-amber-300 font-mono">
                          {achievements.unlocked_count}/{achievements.total_achievements} ({achievements.completion_percentage}%)
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Total Points</div>
                        <div className="text-base font-black text-white font-mono">
                          {achievements.earned_points}/{achievements.total_points} PTS
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleScanAchievements}
                    disabled={isScanningSaves}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black font-black text-xs shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
                    title="Scan RetroArch, Dolphin, PCSX2, RPCS3, and local directories for save progress"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningSaves ? 'animate-spin' : ''}`} />
                    <span>{isScanningSaves ? 'Scanning Save Data...' : 'Scan Save Data for Progress'}</span>
                  </button>
                </div>
              </div>

              {/* Completion Progress Bar */}
              {achievements && achievements.total_achievements > 0 && (
                <div className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">Trophy Completion Progress</span>
                    <span className="text-amber-400 font-mono font-bold">{achievements.completion_percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-white/5">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-yellow-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${achievements.completion_percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {achievementsLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading trophies and inspecting save state registers...</div>
              ) : achievements?.achievements?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {achievements.achievements.map((a) => (
                    <div
                      key={a.id}
                      className={`p-4 rounded-2xl border flex items-center justify-between gap-3.5 transition-all ${
                        a.unlocked 
                          ? 'bg-amber-950/20 border-amber-500/50 text-white shadow-md' 
                          : 'bg-slate-900/60 border-white/10 text-slate-400 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner border ${
                          a.tier === 'platinum' ? 'bg-sky-950/60 border-sky-400/60 text-sky-300' :
                          a.tier === 'gold' ? 'bg-yellow-950/60 border-yellow-400/60 text-yellow-400' :
                          a.tier === 'silver' ? 'bg-slate-800 border-slate-400 text-slate-200' :
                          'bg-amber-950/60 border-amber-600/60 text-amber-500'
                        }`}>
                          <Trophy className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <span className="text-xs font-black text-white truncate">{a.title}</span>
                            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                              a.tier === 'platinum' ? 'bg-sky-950 text-sky-300 border border-sky-700' :
                              a.tier === 'gold' ? 'bg-yellow-950 text-yellow-300 border border-yellow-700' :
                              a.tier === 'silver' ? 'bg-slate-800 text-slate-300 border border-slate-600' :
                              'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {a.tier || 'Trophy'}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/60 text-amber-300 border border-white/10">
                              +{a.points}P
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-snug">{a.description}</p>
                          {a.unlocked ? (
                            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Unlocked {a.date_earned ? String(a.date_earned).slice(0, 10) : 'Active'}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-1">
                              <span>Locked • Play game or create saves to unlock</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">No trophies registered for this title yet.</div>
              )}
            </div>
          )}

          {/* TAB 7: OMNISYNC TIME-MACHINE SAVES */}
          {modalTab === 'saves' && (
            <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-200">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-slate-900 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-400 shadow-md">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>OmniSync: Time-Machine Checkpoints</span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-black">
                        100% Reversible
                      </span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Rolling backup history for battery saves (.sav/.srm) and save states. Safety backup created before every rollback.
                    </p>
                  </div>
                </div>

                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newSnapshotLabel.trim()) return;
                    try {
                      await createSaveSnapshot({ game_id: game.id, label: newSnapshotLabel.trim() });
                      playVictorySound();
                      setNewSnapshotLabel('');
                      const data = await fetchSaveSnapshots(game.id);
                      setSnapshots(data.snapshots || []);
                    } catch (err) {
                      alert('Failed to create snapshot');
                    }
                  }} 
                  className="flex gap-2 w-full sm:w-auto"
                >
                  <input
                    type="text"
                    value={newSnapshotLabel}
                    onChange={(e) => setNewSnapshotLabel(e.target.value)}
                    placeholder="New checkpoint label..."
                    className="px-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!newSnapshotLabel.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-black font-black text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Snapshot</span>
                  </button>
                </form>
              </div>

              {snapshotsLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading historical save states...</div>
              ) : snapshots.length > 0 ? (
                <div className="space-y-2.5">
                  {snapshots.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-emerald-500/40 flex items-center justify-between gap-4 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.2 rounded text-[9px] font-bold uppercase font-mono ${
                            s.is_auto ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {s.is_auto ? 'Auto Checkpoint' : 'Manual Save'}
                          </span>
                          <span className="text-xs font-black text-white truncate">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {s.timestamp}
                          </span>
                          <span>•</span>
                          <span className="font-mono">{s.size_kb} KB</span>
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          playClick();
                          try {
                            const res = await rollbackSaveSnapshot({ game_id: game.id, snapshot_id: s.id });
                            playVictorySound();
                            alert(res.message);
                            const data = await fetchSaveSnapshots(game.id);
                            setSnapshots(data.snapshots || []);
                          } catch (err) {
                            alert('Rollback failed: ' + err.message);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rollback</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400">No historical checkpoints recorded yet.</div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* In-App Interactive Emulator Player Modal */}
      {showPlayer && (
        <OmniPlayerModal
          game={{
            ...game,
            path: game.path || (downloadState && downloadState.destination_path) || `/Volumes/ROMS/${game.platform}/${game.title}.${game.rom_format || 'zip'}`,
          }}
          onClose={() => setShowPlayer(false)}
          onOpenSettings={onOpenSettings}
          onOpenCheatLab={onOpenCheatLab}
          onOpenModStore={onOpenModStore}
        />
      )}
    </dialog>
  );
}
