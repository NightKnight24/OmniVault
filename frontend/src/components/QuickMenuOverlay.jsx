import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Play, RotateCcw, Save, Download, Wand2, Sparkles, Languages,
  Tv, Volume2, VolumeX, Cpu, Sliders, ShieldCheck, Gamepad2,
  HardDrive, AlertTriangle, CheckCircle2, ChevronRight, RefreshCw, Eye,
  Trophy, Cloud, Plus, Clock, Users, Disc, Puzzle, Lock
} from 'lucide-react';
import { playClick, playVictorySound } from '../utils/soundEffects';
import ControllerGlyph from './ControllerGlyph';
import { gamepadService } from '../services/gamepadService';
import { 
  fetchEmulatorSettings, saveEmulatorSettings, 
  translateFrame, fetchGameAchievements, unlockAchievement,
  fetchSaveSnapshots, createSaveSnapshot, rollbackSaveSnapshot,
  fetchGameCheats, exportGameCheats, controlActiveEmulator,
  fetchActiveSession
} from '../services/api';

export default function QuickMenuOverlay({ 
  isOpen, 
  onClose, 
  activeGame, 
  onOpenCheatLab, 
  onOpenSettings,
  onOpenSetupWizard,
  onOpenCompressor,
  onOpenNetplay,
  onOpenModStore,
  onUnlockAchievement,
  onResetGame,
  onSaveState,
  onLoadState,
  onExitGame,
  onVolumeChange,
  onCheatsChange,
  isTranslating = false,
  onTriggerTranslation,
  voiceNarration = true,
  onToggleVoiceNarration
}) {
  const [activeTab, setActiveTab] = useState('resume'); // 'resume' | 'cheats' | 'trophies' | 'saves' | 'translate' | 'graphics'
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [resScale, setResScale] = useState('2x');
  const [crtScanlines, setCrtScanlines] = useState(false);
  const [aiUpscaling, setAiUpscaling] = useState(true);
  const [audioSr, setAudioSr] = useState(true);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [vsync, setVsync] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [quickToast, setQuickToast] = useState(null);
  const [localTranslating, setLocalTranslating] = useState(false);
  const [localVoiceNarration, setLocalVoiceNarration] = useState(voiceNarration);
  const [localSubtitle, setLocalSubtitle] = useState(null);

  // RetroAchievements state
  const [achievementsData, setAchievementsData] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);

  // Active Session & Game resolution
  const [sessionGame, setSessionGame] = useState(null);
  const effectiveGame = activeGame || sessionGame;

  // Time-Machine Saves state
  const [snapshots, setSnapshots] = useState([]);
  const [savesLoading, setSavesLoading] = useState(false);
  const [newCheckpointText, setNewCheckpointText] = useState('');

  // Quick Cheats Toggles (loaded from real Libretro cheat DB for activeGame)
  const [quickCheats, setQuickCheats] = useState([]);
  const [cheatsLoading, setCheatsLoading] = useState(false);
  const [resumeFocusIndex, setResumeFocusIndex] = useState(0);
  const triggerFocusedResumeRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      if (!activeGame) {
        fetchActiveSession().then(data => {
          if (data?.session) {
            setSessionGame({
              id: data.session.game_id || data.session.rom || 'active-rom',
              title: data.session.title || data.session.rom || 'Active Game',
              platform: data.session.platform || 'Retro'
            });
          }
        }).catch(() => {});
      }
    }
  }, [isOpen, activeGame]);

  useEffect(() => {
    if (isOpen && effectiveGame) {
      loadAchievements();
      loadSnapshots();
      loadGameCheats();
    }
  }, [isOpen, effectiveGame]);

  // Full Gamepad Living-Room Navigation (B to close/resume, L1/R1 to cycle tabs)
  useEffect(() => {
    if (!isOpen) return;

    const unsub = gamepadService.subscribeActions((action) => {
      if (action === 'TOGGLE_QUICK_MENU' || action === 'CANCEL') {
        handleResumeAndClose();
      } else if (action === 'NEXT_TAB') {
        playClick();
        const tabs = ['resume', 'cheats', 'trophies', 'saves', 'translate', 'graphics'];
        setActiveTab(prev => {
          const idx = tabs.indexOf(prev);
          return tabs[(idx + 1) % tabs.length];
        });
      } else if (action === 'PREV_TAB') {
        playClick();
        const tabs = ['resume', 'cheats', 'trophies', 'saves', 'translate', 'graphics'];
        setActiveTab(prev => {
          const idx = tabs.indexOf(prev);
          return tabs[(idx - 1 + tabs.length) % tabs.length];
        });
      } else if (action === 'NAV_DOWN') {
        playClick();
        setResumeFocusIndex(prev => Math.min(prev + 1, 4));
      } else if (action === 'NAV_UP') {
        playClick();
        setResumeFocusIndex(prev => Math.max(prev - 1, 0));
      } else if (action === 'CONFIRM') {
        triggerFocusedResumeRef.current?.();
      }
    });

    return unsub;
  }, [isOpen]);

  const loadGameCheats = async () => {
    if (!activeGame?.id) return;
    setCheatsLoading(true);
    try {
      const data = await fetchGameCheats(activeGame.id);
      const list = (data.cheats || []).slice(0, 12).map((c, idx) => ({
        id: `cheat_${idx}`,
        name: c.description || c.desc || `Cheat #${idx + 1}`,
        code: c.code || '',
        enabled: Boolean(c.enabled)
      }));
      setQuickCheats(list);
    } catch (e) {
      setQuickCheats([]);
    } finally {
      setCheatsLoading(false);
    }
  };

  const loadAchievements = async () => {
    if (!activeGame) return;
    setAchievementsLoading(true);
    try {
      const data = await fetchGameAchievements(activeGame.id);
      setAchievementsData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setAchievementsLoading(false);
    }
  };

  const loadSnapshots = async () => {
    if (!activeGame) return;
    setSavesLoading(true);
    try {
      const data = await fetchSaveSnapshots(activeGame.id);
      setSnapshots(data.snapshots || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSavesLoading(false);
    }
  };

  const handleCreateCheckpoint = async (e) => {
    e.preventDefault();
    if (!newCheckpointText.trim() || !activeGame) return;
    playClick();
    try {
      const res = await createSaveSnapshot({
        game_id: activeGame.id,
        label: newCheckpointText.trim()
      });
      playVictorySound();
      showToast(res.message);
      setNewCheckpointText('');
      loadSnapshots();
    } catch (e) {
      showToast('Checkpoint failed: ' + e.message);
    }
  };

  const handleRollbackCheckpoint = async (snap) => {
    if (!activeGame) return;
    playClick();
    try {
      const res = await rollbackSaveSnapshot({
        game_id: activeGame.id,
        snapshot_id: snap.id
      });
      playVictorySound();
      showToast(res.message);
      loadSnapshots();
    } catch (e) {
      showToast('Rollback failed: ' + e.message);
    }
  };

  const handleTriggerMockUnlock = async (trophy) => {
    playClick();
    try {
      const res = await unlockAchievement({
        game_id: activeGame?.id,
        achievement_id: trophy.id,
        title: trophy.title,
        points: trophy.points,
        badge: trophy.badge
      });
      if (onUnlockAchievement) {
        onUnlockAchievement(res);
      }
      showToast(`🏆 Unlocked: ${trophy.title} (+${trophy.points} PTS)`);
      // Update local unlocked state
      setAchievementsData(prev => {
        if (!prev) return prev;
        const updated = prev.achievements.map(a => a.id === trophy.id ? { ...a, unlocked: true } : a);
        return { ...prev, achievements: updated, unlocked_count: prev.unlocked_count + 1 };
      });
    } catch (e) {
      showToast('Unlock failed');
    }
  };

  const showToast = (msg) => {
    setQuickToast(msg);
    setTimeout(() => setQuickToast(null), 2500);
  };

  const loadSettings = async () => {
    try {
      const res = await fetchEmulatorSettings();
      if (res.settings) {
        if (res.settings.emu_resolution_scale) setResScale(res.settings.emu_resolution_scale);
        if (res.settings.emu_aspect_ratio) setAspectRatio(res.settings.emu_aspect_ratio);
        if (res.settings.emu_volume) setVolume(parseInt(res.settings.emu_volume) || 85);
        if (res.settings.emu_vsync) setVsync(res.settings.emu_vsync === 'true');
        if (res.settings.emu_ai_upscaling_mode) setAiUpscaling(res.settings.emu_ai_upscaling_mode !== 'none');
        if (res.settings.emu_audio_upscaling) setAudioSr(res.settings.emu_audio_upscaling === 'true');
      }
    } catch (e) {
      // ignore
    }
  };

  const handleApplyGraphics = async (newScale, newAspect, newVsync) => {
    playClick();
    const updated = {
      emu_resolution_scale: newScale || resScale,
      emu_aspect_ratio: newAspect || aspectRatio,
      emu_vsync: String(newVsync !== undefined ? newVsync : vsync),
      emu_volume: String(volume)
    };
    setSavingSettings(true);
    try {
      await saveEmulatorSettings(updated);
      showToast(`Applied ${updated.emu_resolution_scale} Internal Resolution`);
    } catch (e) {
      showToast('Could not save graphics setting');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleCheat = async (id) => {
    playClick();
    let updatedList = [];
    setQuickCheats(prev => {
      updatedList = prev.map(c => {
        if (c.id === id) {
          const next = !c.enabled;
          showToast(`${c.name} (${c.code}): ${next ? 'ENABLED' : 'DISABLED'}`);
          return { ...c, enabled: next };
        }
        return c;
      });
      if (onCheatsChange) {
        onCheatsChange(updatedList);
      }
      return updatedList;
    });
    if (effectiveGame?.id) {
      try {
        await exportGameCheats(effectiveGame.id);
      } catch (e) {
        // ignore
      }
    }
  };

  const resumeFocusIndexRef = useRef(0);
  useEffect(() => {
    resumeFocusIndexRef.current = resumeFocusIndex;
  }, [resumeFocusIndex]);

  const handleResumeAndClose = () => {
    playClick();
    try {
      window.webkit?.messageHandlers?.omnivault?.postMessage({ action: 'closeQuickMenu' });
    } catch (e) {}
    controlActiveEmulator('resume').catch(() => {});
    onClose();
  };

  const handleExitGame = () => {
    playClick();
    try {
      window.webkit?.messageHandlers?.omnivault?.postMessage({ action: 'quitGame' });
      window.webkit?.messageHandlers?.omnivault?.postMessage({ action: 'closeQuickMenu' });
    } catch (e) {}
    controlActiveEmulator('quit').catch(() => {});
    onClose();
    if (onExitGame) onExitGame();
  };

  const handleTriggerFocusedResumeOption = () => {
    const idx = resumeFocusIndexRef.current;
    if (idx === 0) {
      handleResumeAndClose();
    } else if (idx === 1) {
      playClick();
      if (onSaveState) onSaveState();
      else controlActiveEmulator('save_state').catch(() => {});
      showToast('Saved State (Slot 1)');
    } else if (idx === 2) {
      playClick();
      if (onLoadState) onLoadState();
      else controlActiveEmulator('load_state').catch(() => {});
      showToast('Loaded State (Slot 1)');
    } else if (idx === 3) {
      playClick();
      if (onResetGame) onResetGame();
      else controlActiveEmulator('reset').catch(() => {});
      showToast('Emulation Core Reset');
    } else if (idx === 4) {
      handleExitGame();
    }
  };
  triggerFocusedResumeRef.current = handleTriggerFocusedResumeOption;

  const handleDirectTranslate = async () => {
    playClick();
    if (onTriggerTranslation) {
      onTriggerTranslation();
      return;
    }
    try {
      setLocalTranslating(true);
      const effectiveVoice = onToggleVoiceNarration ? voiceNarration : localVoiceNarration;
      const res = await translateFrame(null, effectiveVoice);
      if (res.status === 'success' && res.translated_text) {
        setLocalSubtitle(res);
        showToast('Screen dialogue translated!');
        if (res.audio_base64 && effectiveVoice) {
          const audio = new Audio(`data:audio/wav;base64,${res.audio_base64}`);
          audio.play().catch(() => {});
        }
      } else {
        showToast('No foreign dialogue detected on screen');
      }
    } catch (e) {
      showToast(`Translation error: ${e.message}`);
    } finally {
      setLocalTranslating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Floating Status Toast */}
      {quickToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-cyan-500 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 animate-bounce">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* Slide-out Control Deck (Kodi / RetroArch 10-Foot Blade) */}
      <div className="w-full max-w-md h-full bg-[#070b14]/95 border-l border-cyan-500/30 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        
        {/* Header Bar */}
        <div className="p-5 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-black font-black shadow-glow-cyan">
              <Gamepad2 className="w-5 h-5 fill-black" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-black text-white text-base tracking-wide">OmniVault Quick Menu</span>
                <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 font-mono">
                  Guide / F1
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-[240px]">
                {effectiveGame ? `${effectiveGame.title} • ${effectiveGame.platform}` : 'Universal In-Game Overlay'}
              </p>
            </div>
          </div>

          <button
            onClick={handleResumeAndClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Resume Game (Guide / Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Pills Bar */}
        <div className="flex items-center gap-1 px-4 py-2.5 bg-slate-950/40 border-b border-white/10 overflow-x-auto scrollbar-none text-xs font-bold">
          <button
            onClick={() => setActiveTab('resume')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'resume' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            Controls
          </button>
          <button
            onClick={() => setActiveTab('trophies')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'trophies' ? 'bg-amber-500 text-black font-black shadow-glow-amber' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Trophies</span>
          </button>
          <button
            onClick={() => setActiveTab('saves')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'saves' ? 'bg-emerald-500 text-black font-black shadow-glow-emerald' : 'text-slate-400 hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Time-Machine</span>
          </button>
          <button
            onClick={() => setActiveTab('cheats')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'cheats' ? 'bg-emerald-500 text-black font-black shadow-glow-emerald' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>AI Cheats</span>
          </button>
          <button
            onClick={() => setActiveTab('translate')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'translate' ? 'bg-violet-500 text-white font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>AI Translation</span>
          </button>
          <button
            onClick={() => setActiveTab('graphics')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'graphics' ? 'bg-blue-500 text-white font-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Graphics
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          
          {/* TAB 1: GAME CONTROLS & RESUME */}
          {activeTab === 'resume' && (
            <div className="space-y-4">
              
              {/* Giant Resume Button */}
              <button
                onClick={handleResumeAndClose}
                onMouseEnter={() => setResumeFocusIndex(0)}
                className={`w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-black text-sm shadow-glow-emerald flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-98 ${
                  resumeFocusIndex === 0 ? 'ring-4 ring-white shadow-2xl scale-[1.02]' : ''
                }`}
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Resume Game (Guide Button / A)</span>
              </button>

              {/* State Management */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    playClick();
                    if (onSaveState) {
                      onSaveState();
                    } else {
                      controlActiveEmulator('save_state').catch(() => {});
                    }
                    showToast('Saved State (Slot 1)');
                  }}
                  onMouseEnter={() => setResumeFocusIndex(1)}
                  className={`p-3 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-left transition-all cursor-pointer ${
                    resumeFocusIndex === 1 ? 'ring-2 ring-cyan-400 border-cyan-400 bg-slate-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs mb-1">
                    <Save className="w-3.5 h-3.5" />
                    <span>Quick Save (F5)</span>
                  </div>
                  <div className="text-[10px] text-slate-500">Slot 1 • Instant Snapshot</div>
                </button>

                <button
                  onClick={() => {
                    playClick();
                    if (onLoadState) {
                      onLoadState();
                    } else {
                      controlActiveEmulator('load_state').catch(() => {});
                    }
                    showToast('Loaded State (Slot 1)');
                  }}
                  onMouseEnter={() => setResumeFocusIndex(2)}
                  className={`p-3 rounded-xl bg-slate-900 border border-white/10 hover:border-cyan-500/40 text-left transition-all cursor-pointer ${
                    resumeFocusIndex === 2 ? 'ring-2 ring-violet-400 border-violet-400 bg-slate-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-violet-400 font-bold text-xs mb-1">
                    <Download className="w-3.5 h-3.5" />
                    <span>Quick Load (F7)</span>
                  </div>
                  <div className="text-[10px] text-slate-500">Slot 1 • Restore State</div>
                </button>
              </div>

              {/* Reset Core */}
              <button
                onClick={() => {
                  playClick();
                  if (onResetGame) {
                    onResetGame();
                  } else {
                    controlActiveEmulator('reset').catch(() => {});
                  }
                  showToast('Emulation Core Reset');
                }}
                onMouseEnter={() => setResumeFocusIndex(3)}
                className={`w-full p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-left flex items-center justify-between transition-all cursor-pointer ${
                  resumeFocusIndex === 3 ? 'ring-2 ring-amber-400 border-amber-400 bg-slate-800' : ''
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-slate-300 font-bold">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restart / Reset Console</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">Soft Reboot</span>
              </button>

              {/* Master Volume Slider */}
              <div className="p-4 rounded-xl bg-slate-900 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    {volume === 0 || isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>Master Audio Volume</span>
                  </span>
                  <span className="font-mono text-emerald-400">{isMuted ? 'Muted' : `${volume}%`}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setVolume(v);
                    setIsMuted(v === 0);
                    if (onVolumeChange) onVolumeChange(v);
                    controlActiveEmulator('volume', v).catch(() => {});
                  }}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-950 rounded cursor-pointer"
                />
              </div>

              {/* Exit Game */}
              <button
                onClick={handleExitGame}
                onMouseEnter={() => setResumeFocusIndex(4)}
                className={`w-full py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  resumeFocusIndex === 4 ? 'ring-2 ring-rose-400 border-rose-500 bg-rose-900/80 scale-[1.01]' : ''
                }`}
              >
                <span>Exit Game to OmniVault Menu</span>
              </button>

            </div>
          )}

          {/* TAB 2: AI CHEATS & LIVE RAM SCANNER */}
          {activeTab === 'cheats' && (
            <div className="space-y-4">
              
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-slate-300">
                <Wand2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">AI Live Cheat Scanner:</strong>
                  Active codes are locked in memory without save-file corruption.
                </div>
              </div>

              {/* Quick Toggle Cheats List */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Verified Libretro Cheat Codes
                </h4>
                {cheatsLoading ? (
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-xs text-slate-400">
                    Loading verified cheat database...
                  </div>
                ) : quickCheats.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-xs text-slate-400">
                    No pre-indexed cheats found for this title. Open the full Cheat Lab below to scan ROM opcodes or encode Game Genie codes.
                  </div>
                ) : (
                  quickCheats.map(cheat => (
                    <div
                      key={cheat.id}
                      onClick={() => toggleCheat(cheat.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        cheat.enabled
                          ? 'bg-emerald-950/50 border-emerald-500/50 text-white shadow-sm'
                          : 'bg-slate-900/80 border-white/5 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <div className="pr-2">
                        <div className="text-xs font-bold">{cheat.name}</div>
                        {cheat.code && (
                          <div className="text-[10px] font-mono text-emerald-400/80 truncate max-w-[260px]">
                            {cheat.code}
                          </div>
                        )}
                      </div>
                      <div className={`w-8 h-4 rounded-full shrink-0 transition-colors relative ${cheat.enabled ? 'bg-emerald-400' : 'bg-slate-800'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-black transition-transform ${cheat.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Open Full Cheat Lab Button */}
              {onOpenCheatLab && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenCheatLab();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-glow-emerald cursor-pointer"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>Launch Deep Cheat Engineering Lab</span>
                </button>
              )}

              {/* Open Mods & Romhacks Storefront */}
              {onOpenModStore && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenModStore();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Puzzle className="w-4 h-4 text-purple-400" />
                  <span>Browse Mods & Romhacks Storefront</span>
                </button>
              )}

            </div>
          )}

          {/* TAB 3: AI TRANSLATION & NARATION */}
          {activeTab === 'translate' && (
            <div className="space-y-4">
              
              <div className="p-3.5 rounded-xl bg-violet-950/30 border border-violet-500/30 flex items-start gap-2.5 text-xs text-slate-300">
                <Languages className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Real-Time OCR & Audio Narration:</strong>
                  Translates foreign text directly on the emulator canvas or active display and synthesizes voice dialogue.
                </div>
              </div>

              {/* Instant Frame Translation Trigger */}
              <button
                onClick={handleDirectTranslate}
                disabled={isTranslating || localTranslating}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${(isTranslating || localTranslating) ? 'animate-spin' : ''}`} />
                <span>{(isTranslating || localTranslating) ? 'Analyzing Frame...' : 'Translate Current Screen Dialogue'}</span>
              </button>

              {localSubtitle && (
                <div className="p-3.5 rounded-xl bg-black/80 border border-cyan-500/40 text-xs space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Translated Dialogue</div>
                  <div className="text-white font-semibold">{localSubtitle.translated_text}</div>
                  {localSubtitle.original_text && (
                    <div className="text-[10px] font-mono text-slate-400">{localSubtitle.original_text}</div>
                  )}
                </div>
              )}

              {/* Voice Narration Toggle */}
              <div
                onClick={() => {
                  if (onToggleVoiceNarration) {
                    onToggleVoiceNarration(!voiceNarration);
                  } else {
                    const next = !localVoiceNarration;
                    setLocalVoiceNarration(next);
                    showToast(next ? 'Voice Narration Enabled' : 'Voice Narration Disabled');
                  }
                }}
                className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between cursor-pointer hover:border-violet-500/40 transition-all"
              >
                <div>
                  <div className="text-xs font-bold text-white">AI Voice Actor Narration</div>
                  <div className="text-[10px] text-slate-400">Speaks translated text aloud through your speakers</div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${(onToggleVoiceNarration ? voiceNarration : localVoiceNarration) ? 'bg-violet-500' : 'bg-slate-800'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${(onToggleVoiceNarration ? voiceNarration : localVoiceNarration) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: GRAPHICS & DISPLAY */}
          {activeTab === 'graphics' && (
            <div className="space-y-4">
              
              {/* Resolution Scaling */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Internal Resolution Multiplier
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['1x', '2x', '3x', '4x', '4k'].map(scale => (
                    <button
                      key={scale}
                      onClick={() => {
                        setResScale(scale);
                        handleApplyGraphics(scale, aspectRatio, vsync);
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        resScale === scale
                          ? 'bg-cyan-950 border-cyan-400 text-white shadow-glow-cyan'
                          : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {scale === '4k' ? '6x (4K)' : scale.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Aspect Ratio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['4:3', '16:9'].map(aspect => (
                    <button
                      key={aspect}
                      onClick={() => {
                        setAspectRatio(aspect);
                        handleApplyGraphics(resScale, aspect, vsync);
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        aspectRatio === aspect
                          ? 'bg-violet-950 border-violet-400 text-white'
                          : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {aspect === '4:3' ? '4:3 CRT Square' : '16:9 Modern Wide'}
                    </button>
                  ))}
                </div>
              </div>

              {/* VSync Toggle */}
              <div
                onClick={() => {
                  const next = !vsync;
                  setVsync(next);
                  handleApplyGraphics(resScale, aspectRatio, next);
                }}
                className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between cursor-pointer hover:border-cyan-500/40 transition-all"
              >
                <div>
                  <div className="text-xs font-bold text-white">V-Sync (Tear-Free 60Hz)</div>
                  <div className="text-[10px] text-slate-400">Locks framerate to display refresh</div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${vsync ? 'bg-cyan-500' : 'bg-slate-800'}`}>
                  <div className={`w-4 h-4 rounded-full bg-black transition-transform ${vsync ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>

              {/* AI Neural Edge Upscaling Toggle */}
              <div
                onClick={async () => {
                  const next = !aiUpscaling;
                  setAiUpscaling(next);
                  try {
                    await saveEmulatorSettings({ emu_ai_upscaling_mode: next ? 'xbrz' : 'none' });
                  } catch (e) {}
                  showToast(next ? 'Texture Filtering / Smoothing ACTIVE' : 'Smoothing DISABLED');
                }}
                className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between cursor-pointer hover:border-cyan-500/40 transition-all"
              >
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Bilinear / xBRZ Smoothing Filter</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Syncs video_smooth to RetroArch configuration</div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${aiUpscaling ? 'bg-cyan-500 shadow-glow-cyan' : 'bg-slate-800'}`}>
                  <div className={`w-4 h-4 rounded-full bg-black transition-transform ${aiUpscaling ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>

              {/* AI AudioSR 48kHz Toggle */}
              <div
                onClick={async () => {
                  const next = !audioSr;
                  setAudioSr(next);
                  try {
                    await saveEmulatorSettings({ emu_audio_upscaling: String(next) });
                  } catch (e) {}
                  showToast(next ? 'Sinc 48kHz Resampler ACTIVE' : 'Standard Audio Resampler');
                }}
                className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between cursor-pointer hover:border-emerald-500/40 transition-all"
              >
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Sinc High-Fidelity 48kHz Audio Resampler</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Syncs audio_resampler & 48kHz output to RetroArch</div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors relative ${audioSr ? 'bg-emerald-500 shadow-glow-emerald' : 'bg-slate-800'}`}>
                  <div className={`w-4 h-4 rounded-full bg-black transition-transform ${audioSr ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>

              {/* Open Master Settings Button */}
              {onOpenSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Open Master Emulator Settings</span>
                </button>
              )}

              {/* Run Initial Setup Wizard Button */}
              {onOpenSetupWizard && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenSetupWizard();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-950 to-blue-950 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 border border-cyan-500/30 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Run Initial Setup Wizard (BIOS & Keys)</span>
                </button>
              )}

              {/* Lossless ROM Compressor Button */}
              {onOpenCompressor && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenCompressor();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-white/10 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Disc className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Lossless ROM Compressor (CHD & RVZ)</span>
                </button>
              )}

              {/* OmniNet P2P Netplay Button */}
              {onOpenNetplay && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenNetplay();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-white/10 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  <span>OmniNet: P2P Multiplayer Lobbies</span>
                </button>
              )}

            </div>
          )}

          {/* TAB 5: RETROACHIEVEMENTS TROPHY CHECKLIST */}
          {activeTab === 'trophies' && (
            <div className="space-y-4">
              {achievementsData && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-yellow-950/20 to-slate-900 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-amber-400">Trophy Progress</div>
                    <div className="text-sm font-black text-white">
                      {achievementsData.unlocked_count} / {achievementsData.total_achievements} Unlocked ({achievementsData.completion_percentage}%)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Score</div>
                    <div className="text-sm font-mono font-bold text-amber-300">
                      {achievementsData.earned_points} / {achievementsData.total_points} PTS
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {achievementsLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Connecting to RetroAchievements...</div>
                ) : (!achievementsData?.achievements || achievementsData.achievements.length === 0) ? (
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 text-center space-y-3">
                    <Trophy className="w-6 h-6 text-amber-400 mx-auto opacity-80" />
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {achievementsData?.message || 'Connect your RetroAchievements account in Master Settings to track live trophies.'}
                    </p>
                    <button
                      onClick={() => handleTriggerMockUnlock({ id: 'test', title: 'Trophy Chime Audio Test', points: 25 })}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/40 font-bold text-xs transition-all cursor-pointer"
                    >
                      Test Trophy Chime & Banner
                    </button>
                  </div>
                ) : achievementsData?.achievements?.map((t) => (
                  <div
                    key={t.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                      t.unlocked ? 'bg-amber-950/20 border-amber-500/40 text-white' : 'bg-slate-900/80 border-white/10 text-slate-400 opacity-75'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-black border border-white/10 flex items-center justify-center flex-shrink-0">
                        {t.badge ? (
                          <img src={t.badge} alt="" className="w-full h-full object-cover rounded-xl" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <Trophy className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold text-white truncate">{t.title}</span>
                          <span className="text-[10px] font-mono px-1 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            +{t.points}P
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{t.description}</p>
                      </div>
                    </div>

                    {t.unlocked ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-800/40 shrink-0">
                        <CheckCircle2 className="w-3 h-3 text-amber-400" />
                        Unlocked
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-950/60 px-2 py-1 rounded-lg border border-white/5 shrink-0">
                        <Lock className="w-3 h-3 text-slate-500" />
                        Locked
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: OMNISYNC TIME-MACHINE SAVES */}
          {activeTab === 'saves' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateCheckpoint} className="flex gap-2">
                <input
                  type="text"
                  value={newCheckpointText}
                  onChange={(e) => setNewCheckpointText(e.target.value)}
                  placeholder="Record instant checkpoint label..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={!newCheckpointText.trim()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 text-black font-black text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Snapshot</span>
                </button>
              </form>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-400">Historical Checkpoints ({snapshots.length})</div>
                {savesLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading checkpoints...</div>
                ) : (
                  snapshots.map((s, idx) => (
                    <div
                      key={s.id || idx}
                      className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{s.label}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{s.timestamp}</span>
                          <span>•</span>
                          <span>{s.size_kb} KB</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRollbackCheckpoint(s)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-200 font-bold text-xs transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Rollback</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer Bar with Gamepad Navigation Helper */}
        <div className="p-3 bg-black/90 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Gamepad Active</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <ControllerGlyph button="A" size="sm" />
              <span>Select</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ControllerGlyph button="B" size="sm" />
              <span>Close</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
