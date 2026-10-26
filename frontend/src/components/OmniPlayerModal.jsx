import React, { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Save,
  Download,
  HelpCircle,
  X,
  Tv,
  Cpu,
  Gamepad2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Languages,
  Sliders,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';

import { OmniCoreEngine, SYSTEM_CORE_MAP } from '../emulator/OmniCoreEngine';
import { gamepadService } from '../services/gamepadService';
import QuickMenuOverlay from './QuickMenuOverlay';
import { 
  translateFrame, fetchEmulatorsStatus, installEmulator, 
  launchInNativeEmulator, fetchEmulatorSettings,
  checkPlatformBios, uploadBiosFile
} from '../services/api';

export default function OmniPlayerModal({ game, onClose, onOpenSettings, onOpenCheatLab, onOpenModStore }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);

  const platform = game.platform || 'NES';
  const systemInfo = SYSTEM_CORE_MAP[platform] || { core: "fceumm", name: "Generic Retro Core" };
  const isNativePlatform = Boolean(systemInfo.isNative);

  const [loading, setLoading] = useState(!isNativePlatform);
  const [loadingText, setLoadingText] = useState('Initializing OmniCore...');
  const [error, setError] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [crtFilter, setCrtFilter] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [activeCoreName, setActiveCoreName] = useState(systemInfo.name);
  const [coreType, setCoreType] = useState('wasm'); // 'wasm' | 'custom'
  const [toastMessage, setToastMessage] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [liveSubtitle, setLiveSubtitle] = useState(null);
  const [voiceNarration, setVoiceNarration] = useState(true);

  // Native Engine State
  const [nativeEmu, setNativeEmu] = useState(null);
  const [isInstallingEmu, setIsInstallingEmu] = useState(false);
  const [isLaunchingEmu, setIsLaunchingEmu] = useState(false);
  const [savedSettings, setSavedSettings] = useState(null);
  const [biosCheck, setBiosCheck] = useState(null);
  const [isUploadingBios, setIsUploadingBios] = useState(false);
  const biosInputRef = useRef(null);

  const hasCustomCore = SYSTEM_CORE_MAP[platform]?.hasCustomCore || false;


  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleLiveTranslate = async () => {
    try {
      setIsTranslating(true);
      let dataUrl = null;
      if (engineRef.current) {
        dataUrl = await engineRef.current.captureScreenshot();
      } else if (canvasRef.current) {
        dataUrl = canvasRef.current.toDataURL('image/png');
      }
      const res = await translateFrame(dataUrl, voiceNarration);
      if (res.status === 'success' && res.translated_text) {
        setLiveSubtitle(res);
        if (res.audio_base64 && voiceNarration) {
          const audio = new Audio(`data:audio/wav;base64,${res.audio_base64}`);
          audio.play().catch(() => {});
        }
      } else {
        showToast("No dialogue text detected on screen");
      }
    } catch (e) {
      showToast(`Translation error: ${e.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const loadNativeStatus = async () => {
    try {
      const [emuRes, setRes, biosRes] = await Promise.all([
        fetchEmulatorsStatus().catch(() => ({ emulators: [] })),
        fetchEmulatorSettings().catch(() => ({ settings: {} })),
        checkPlatformBios(platform).catch(() => ({ required: false, ready: true }))
      ]);
      const matched = (emuRes.emulators || []).find(e => e.id === systemInfo.nativeId);
      setNativeEmu(matched || null);
      setSavedSettings(setRes.settings || null);
      setBiosCheck(biosRes);
    } catch (e) {
      console.error('[loadNativeStatus error]:', e);
    }
  };

  const handleQuickBiosUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBios(true);
    try {
      await uploadBiosFile(file);
      showToast(`Uploaded & provisioned ${file.name}!`);
      await loadNativeStatus();
    } catch (err) {
      alert(`BIOS upload error: ${err.message}`);
    } finally {
      setIsUploadingBios(false);
    }
  };

  const handleLaunchNative = async (force = false) => {
    setIsLaunchingEmu(true);
    try {
      const res = await launchInNativeEmulator(game.path, platform, force);
      if (res.status === 'bios_required') {
        setBiosCheck({
          required: true,
          ready: false,
          platform,
          item: res.missing_bios,
          message: res.message,
        });
        showToast('Required system BIOS / keys missing — see prompt below');
        return;
      }
      showToast(`Dispatched to ${res.emulator || 'Native Mac Engine'}`);
    } catch (err) {
      alert(`Could not launch native emulator: ${err.message}`);
    } finally {
      setIsLaunchingEmu(false);
    }
  };

  const handleInstallNative = async () => {
    if (!systemInfo.nativeId) return;
    setIsInstallingEmu(true);
    try {
      const res = await installEmulator(systemInfo.nativeId);
      showToast(`${systemInfo.name} installed directly into /Volumes/ROMS/Emulators!`);
      await loadNativeStatus();
    } catch (err) {
      alert(`Installation error: ${err.message}`);
    } finally {
      setIsInstallingEmu(false);
    }
  };

  useEffect(() => {
    let unmounted = false;

    if (isNativePlatform) {
      setLoading(false);
      loadNativeStatus();
      return;
    }

    async function loadAndStartGame() {
      let timeoutId = null;
      let hardTimeoutId = null;
      try {
        setLoading(true);
        setLoadingText(`Fetching ${game.title || 'ROM'} binary...`);
        setError(null);

        // Soft timeout warning
        timeoutId = setTimeout(() => {
          if (!unmounted) {
            setLoadingText('WebAssembly core download is slow or blocked. You can launch in Standalone Emulator below:');
          }
        }, 3500);

        // Hard timeout fallback
        hardTimeoutId = setTimeout(() => {
          if (!unmounted && loading) {
            setError('WebAssembly engine timed out loading from external CDN. Click "Launch in Standalone Emulator" below for instant Metal hardware-accelerated play.');
            setLoading(false);
          }
        }, 7500);

        // 1. Fetch raw ROM bytes from backend endpoint
        const romUrl = `/api/downloads/rom-file?path=${encodeURIComponent(game.path)}`;
        const res = await fetch(romUrl);
        if (!res.ok) {
          throw new Error(`Failed to load ROM: Server returned HTTP ${res.status}`);
        }

        let arrayBuffer = await res.arrayBuffer();

        // 2. Unzip if needed for Custom NES core
        const isZip = game.filename?.toLowerCase().endsWith('.zip') || game.path?.toLowerCase().endsWith('.zip');
        if (isZip && coreType === 'custom') {
          setLoadingText('Extracting ROM from archive...');
          const zip = await JSZip.loadAsync(arrayBuffer);
          const firstRomName = Object.keys(zip.files).find((n) =>
            n.toLowerCase().endsWith('.nes')
          );
          if (firstRomName) {
            arrayBuffer = await zip.files[firstRomName].async('arraybuffer');
          }
        }

        if (unmounted) return;

        // 3. Initialize engine
        setLoadingText('Starting core engines & audio synthesizer...');
        if (!engineRef.current) {
          engineRef.current = new OmniCoreEngine();
        }

        const info = await engineRef.current.launch({
          canvas: canvasRef.current,
          romData: arrayBuffer,
          romFileName: game.filename || 'game.rom',
          platform: platform,
          preferCustom: coreType === 'custom',
        });

        if (unmounted) return;

        clearTimeout(timeoutId);
        clearTimeout(hardTimeoutId);
        setActiveCoreName(info.coreName);
        setLoading(false);
        showToast(`Running on ${info.coreName}`);
      } catch (err) {
        clearTimeout(timeoutId);
        clearTimeout(hardTimeoutId);
        console.error('[OmniPlayer Error]', err);
        if (!unmounted) {
          setError(err.message || 'Error launching emulator core');
          setLoading(false);
        }
      }
    }

    loadAndStartGame();

    return () => {
      unmounted = true;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [game.path, coreType, isNativePlatform]);


  // Subscribe to Gamepad PS Home / Xbox Guide / Select+Start & Global QuickMenu events
  useEffect(() => {
    const unsub = gamepadService.subscribeActions((action) => {
      if (action === 'TOGGLE_QUICK_MENU') {
        setIsQuickMenuOpen((prev) => !prev);
      }
    });
    const handleCustomToggle = () => {
      setIsQuickMenuOpen((prev) => !prev);
    };
    window.addEventListener('omnivault-toggle-quickmenu', handleCustomToggle);
    return () => {
      unsub();
      window.removeEventListener('omnivault-toggle-quickmenu', handleCustomToggle);
    };
  }, []);

  // Handle Hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F1' || e.code === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        setIsQuickMenuOpen((prev) => !prev);
        return;
      }

      // Don't intercept if modifier keys held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === 'Escape') {
        if (isQuickMenuOpen) {
          setIsQuickMenuOpen(false);
        } else {
          onClose();
        }
      } else if (e.code === 'Space' && !isQuickMenuOpen) {
        e.preventDefault();
        handleTogglePause();
      } else if (e.code === 'KeyF' && !isQuickMenuOpen) {
        handleToggleFullscreen();
      } else if (e.code === 'F5') {
        e.preventDefault();
        handleSaveState();
      } else if (e.code === 'F7') {
        e.preventDefault();
        handleLoadState();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isPaused, isQuickMenuOpen]);

  const handleTogglePause = () => {
    if (!engineRef.current) return;
    if (isPaused) {
      engineRef.current.resume();
      setIsPaused(false);
      showToast('Resumed');
    } else {
      engineRef.current.pause();
      setIsPaused(true);
      showToast('Paused');
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.reset();
      showToast('Game Reset');
    }
  };

  const handleSaveState = async () => {
    if (engineRef.current) {
      const res = await engineRef.current.saveState();
      if (res.success) {
        showToast('State Saved (Slot 1)');
      } else {
        showToast('Save state not supported by this core');
      }
    }
  };

  const handleLoadState = async () => {
    if (engineRef.current) {
      const res = await engineRef.current.loadState();
      if (res.success) {
        showToast('State Loaded');
      } else {
        showToast('No saved state found');
      }
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (engineRef.current) {
      engineRef.current.setVolume(val);
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (engineRef.current) engineRef.current.setVolume(volume || 0.8);
    } else {
      setIsMuted(true);
      if (engineRef.current) engineRef.current.setVolume(0);
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Exit fullscreen error:', err);
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md text-white select-none overflow-hidden"
    >
      {/* Top Bar Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-zinc-950/80 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              {game.title}
              <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {platform}
              </span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {activeCoreName || 'OmniCore Engine'}
              </span>
              <span>•</span>
              <span>{isPaused ? 'Paused' : '60 FPS'}</span>
            </div>
          </div>
        </div>

        {/* Core Switcher & Actions */}
        <div className="flex items-center gap-2.5">
          {!isNativePlatform && systemInfo.nativeId && (
            <button
              onClick={handleLaunchNative}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-cyan-500/40 text-cyan-300 text-xs font-semibold hover:bg-zinc-800 transition-colors cursor-pointer"
              title={`Launch in native ${systemInfo.name} on macOS`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Desktop Engine</span>
            </button>
          )}

          {hasCustomCore && (
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setCoreType('wasm')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  coreType === 'wasm'
                    ? 'bg-emerald-600 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                OmniRetro WASM
              </button>
              <button
                onClick={() => setCoreType('custom')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ${
                  coreType === 'custom'
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Built-From-Scratch
              </button>
            </div>
          )}

          <button
            onClick={() => setIsQuickMenuOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              isQuickMenuOpen
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900 border-cyan-500/40 text-cyan-300 hover:bg-zinc-800'
            }`}
            title="Open Universal Quick Menu (PS Home / Xbox Guide / F1)"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Quick Menu (F1)</span>
          </button>

          {game.path && (
            <button
              onClick={() => handleLaunchNative(false)}
              disabled={isLaunchingEmu}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-extrabold text-xs transition-all shadow-sm cursor-pointer"
              title="Launch in Hardware-Accelerated Standalone Emulator"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>{isLaunchingEmu ? 'Launching...' : '⚡ Standalone'}</span>
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Configure Graphics & Display"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
            </button>
          )}

          <button
            onClick={() => setShowControls(!showControls)}
            className={`p-2 rounded-lg border transition-colors ${
              showControls
                ? 'bg-zinc-800 border-zinc-600 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Controls & Keybindings"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Exit Game (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-zinc-950 to-black overflow-hidden">
        
        {/* NATIVE CONSOLE HARDWARE SCREEN */}
        {isNativePlatform ? (
          <div className="relative z-10 max-w-xl w-full p-8 rounded-3xl bg-[#0c1220]/90 border border-white/15 backdrop-blur-xl shadow-2xl flex flex-col items-center text-center animate-in fade-in duration-300">
            {/* Box Art */}
            <div className="relative mb-5">
              <div className="w-28 h-36 rounded-2xl bg-black border border-white/20 overflow-hidden shadow-2xl mx-auto flex items-center justify-center">
                {game.box_art_2d ? (
                  <img
                    src={game.box_art_2d}
                    alt={game.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(game.title)}&platform=${encodeURIComponent(platform || game.platform)}`; }}
                  />
                ) : (
                  <Gamepad2 className="w-12 h-12 text-slate-600" />
                )}
              </div>
              <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/50 text-[10px] font-bold text-cyan-300 uppercase tracking-wider font-mono shadow-md">
                {platform}
              </div>
            </div>

            <h2 className="text-2xl font-black text-white font-display mb-1">{game.title}</h2>
            <p className="text-xs text-slate-400 font-mono mb-5 truncate max-w-md">{game.filename || game.path}</p>

            {/* Designated Emulator Card */}
            <div className="w-full p-4 rounded-2xl bg-slate-900/90 border border-white/10 mb-6 text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Designated Native Engine</span>
                </div>
                {nativeEmu?.is_installed ? (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px] font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Ready (v{nativeEmu.version})</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 text-[11px] font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Not Installed</span>
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-300">
                <strong className="text-white">{systemInfo.name}</strong> — {nativeEmu?.description || 'Hardware-accelerated Metal/Vulkan emulation.'}
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Vault Location:</span>
                <span className="text-slate-200">{nativeEmu?.path || '/Volumes/ROMS/Emulators/'}</span>
              </div>

              {savedSettings && (
                <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-black/40 text-cyan-300 border border-white/5">
                    Scale: {savedSettings.emu_resolution_scale || '2x'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/40 text-cyan-300 border border-white/5">
                    V-Sync: {savedSettings.emu_vsync === 'true' ? 'Enabled' : 'Disabled'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/40 text-cyan-300 border border-white/5">
                    Aspect: {savedSettings.emu_aspect_ratio || '16:9'}
                  </span>
                </div>
              )}
            </div>

            {/* Safeguard Alert if Required BIOS / Firmware / Keys Are Missing */}
            {biosCheck?.required && !biosCheck?.ready && (
              <div className="w-full p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 mb-5 text-left space-y-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-100 leading-relaxed">
                    <span className="font-bold text-amber-300 block mb-0.5">
                      System Firmware / Decryption Keys Needed ({biosCheck.item?.name || platform})
                    </span>
                    <span>
                      {biosCheck.message || `Provide ${biosCheck.item?.target_spec || 'system BIOS'} so ${systemInfo.name} can boot without errors.`}
                    </span>
                  </div>
                </div>
                <input
                  ref={biosInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleQuickBiosUpload}
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => biosInputRef.current?.click()}
                    disabled={isUploadingBios}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-all cursor-pointer"
                  >
                    {isUploadingBios ? 'Provisioning...' : `Upload ${biosCheck.item?.target_spec?.split(' ')[0] || 'BIOS File'} Now`}
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('omnivault-open-setup-wizard', { detail: { step: 3 } }))}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/30 font-bold text-xs transition-all cursor-pointer"
                  >
                    Open Setup Wizard (BIOS & Keys)
                  </button>
                  <button
                    onClick={() => handleLaunchNative(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-transparent hover:bg-white/5 text-slate-400 hover:text-white text-[11px] font-semibold transition-all cursor-pointer ml-auto"
                  >
                    Launch Anyway
                  </button>
                </div>
              </div>
            )}

            {/* Launch / Install Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              {nativeEmu?.is_installed ? (
                <button
                  onClick={() => handleLaunchNative(false)}
                  disabled={isLaunchingEmu}
                  className="flex-1 w-full py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-black text-sm shadow-glow-emerald flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.02] active:scale-98"
                >
                  <Play className="w-4 h-4 fill-black" />
                  <span>{isLaunchingEmu ? 'Launching Engine...' : `Launch in ${systemInfo.name}`}</span>
                </button>
              ) : (
                <button
                  onClick={handleInstallNative}
                  disabled={isInstallingEmu}
                  className="flex-1 w-full py-3 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-sm shadow-glow-cyan flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isInstallingEmu ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Downloading & Installing to /Volumes/ROMS/Emulators...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Install {systemInfo.name} (1-Click)</span>
                    </>
                  )}
                </button>
              )}

              <button
            onClick={() => setIsQuickMenuOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
              isQuickMenuOpen
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-zinc-900 border-cyan-500/40 text-cyan-300 hover:bg-zinc-800'
            }`}
            title="Open Universal Quick Menu (PS Home / Xbox Guide / F1)"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Quick Menu (F1)</span>
          </button>

              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
                  title="Configure Graphics & Display"
                >
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Loading Spinner */}
            {loading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center gap-4">
                <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                <div>
                  <h3 className="text-base font-bold text-white mb-1">{loadingText}</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Initializing local audio synthesizer and core emulation buffers.
                  </p>
                </div>
                
                {game.path && (
                  <div className="pt-2 flex flex-col items-center gap-2">
                    <button
                      onClick={() => handleLaunchNative(false)}
                      disabled={isLaunchingEmu}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      <span>{isLaunchingEmu ? 'Launching Standalone Engine...' : `⚡ Launch in Standalone Emulator (${systemInfo.name})`}</span>
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Instant 60 FPS Metal hardware acceleration • No WebAssembly download
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-6 text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center">
                  <X className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-red-400">Emulator Engine Launch Error</h3>
                <p className="text-sm text-zinc-400 max-w-md">{error}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {game.path && (
                    <button
                      onClick={handleLaunchNative}
                      className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm transition-colors cursor-pointer"
                    >
                      Launch in Native Mac Emulator
                    </button>
                  )}
                  {hasCustomCore && (
                    <button
                      onClick={() => {
                        setError(null);
                        setCoreType(coreType === 'wasm' ? 'custom' : 'wasm');
                      }}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-medium text-sm transition-colors"
                    >
                      Try Alternative Engine
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-medium text-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Canvas Display */}
            <div className="relative max-w-full max-h-full flex items-center justify-center shadow-2xl rounded-lg overflow-hidden border border-zinc-800/60 bg-black">
              <canvas
                ref={canvasRef}
                className={`max-w-full max-h-[82vh] object-contain transition-all ${
                  crtFilter ? 'filter brightness-105 contrast-110' : ''
                }`}
                style={{ imageRendering: 'pixelated' }}
              />

              {/* CRT Scanline Overlay Effect */}
              {crtFilter && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-25"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 1px, transparent 1px, transparent 3px)',
                  }}
                />
              )}
            </div>
          </>
        )}


          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-zinc-900/90 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {toastMessage}
            </div>
          )}

          {/* Live AI Translated Subtitles Banner */}
          {liveSubtitle && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[90%] px-5 py-3 rounded-2xl bg-black/95 border border-cyan-500/50 text-white shadow-2xl backdrop-blur-md text-center animate-in fade-in">
              <div className="flex items-center justify-between gap-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Live Translation {voiceNarration && '• Audio Narration'}</span>
                </div>
                <button onClick={() => setLiveSubtitle(null)} className="text-slate-400 hover:text-white p-0.5">✕</button>
              </div>
              <p className="text-sm font-semibold leading-relaxed text-cyan-100">{liveSubtitle.translated_text}</p>
              {liveSubtitle.original_text && (
                <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">{liveSubtitle.original_text}</p>
              )}
            </div>
          )}

        {/* Controls Overlay Guide */}

        {showControls && (
          <div className="absolute top-6 right-6 z-30 w-80 bg-zinc-900/95 border border-zinc-800 rounded-xl p-5 shadow-2xl backdrop-blur-md text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
              <span className="font-bold text-zinc-200 text-sm flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-emerald-400" />
                Controller Guide
              </span>
              <button
                onClick={() => setShowControls(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-zinc-300">
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/40">
                <span className="text-zinc-400">D-Pad / Movement</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-200">
                  Arrow Keys / WASD
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/40">
                <span className="text-zinc-400">Action A</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-200">
                  Z / J
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/40">
                <span className="text-zinc-400">Action B</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-200">
                  X / K
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/40">
                <span className="text-zinc-400">Start</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-200">
                  Enter
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/40">
                <span className="text-zinc-400">Select</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-200">
                  Right Shift
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/40">
                <span className="text-zinc-400">Quick Save / Load</span>
                <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-200">
                  F5 / F7
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-zinc-400">Hardware Gamepad</span>
                <span className="text-emerald-400 font-medium">Plug & Play Auto-Mapped</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Control Bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-zinc-950/90 border-t border-zinc-800">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
            title="Reset Game"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            Reset
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          <button
            onClick={handleSaveState}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
            title="Quick Save State (F5)"
          >
            <Save className="w-3.5 h-3.5 text-indigo-400" />
            Save State
          </button>

          <button
            onClick={handleLoadState}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
            title="Quick Load State (F7)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Load State
          </button>

          <div className="h-4 w-px bg-zinc-800 mx-1" />

          {/* Live Translation Button */}
          <button
            onClick={handleLiveTranslate}
            disabled={isTranslating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/70 border border-cyan-500/40 text-xs font-bold text-cyan-300 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            title="Instant Live OCR Screen & Audio Translation"
          >
            {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{isTranslating ? 'Translating...' : 'AI Translate'}</span>
          </button>

          {/* Voice Narration Audio Toggle */}
          <button
            onClick={() => {
              const next = !voiceNarration;
              setVoiceNarration(next);
              showToast(next ? "Voice Narration Enabled" : "Voice Narration Disabled");
            }}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              voiceNarration
                ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
            title={voiceNarration ? "Voice Narration is ON (Reads dialogue aloud)" : "Voice Narration is OFF"}
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Audio & Display Shaders */}
        <div className="flex items-center gap-4">
          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMute}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* CRT Scanline Filter Toggle */}
          <button
            onClick={() => setCrtFilter(!crtFilter)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              crtFilter
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle CRT Scanline Simulation"
          >
            <Tv className="w-3.5 h-3.5" />
            CRT Filter
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Fullscreen (F)"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Embedded Universal Quick Menu Overlay (PS Home / Xbox Guide / F1) */}
      <QuickMenuOverlay
        isOpen={isQuickMenuOpen}
        onClose={() => setIsQuickMenuOpen(false)}
        activeGame={game}
        onSaveState={!isNativePlatform ? handleSaveState : undefined}
        onLoadState={!isNativePlatform ? handleLoadState : undefined}
        onResetGame={!isNativePlatform ? handleReset : undefined}
        onExitGame={onClose}
        onVolumeChange={(v) => {
          const norm = v / 100;
          setVolume(norm);
          setIsMuted(v === 0);
          if (engineRef.current) engineRef.current.setVolume(norm);
        }}
        onCheatsChange={(list) => {
          if (engineRef.current) engineRef.current.applyCheats(list);
        }}
        isTranslating={isTranslating}
        onTriggerTranslation={handleLiveTranslate}
        voiceNarration={voiceNarration}
        onToggleVoiceNarration={(next) => {
          setVoiceNarration(next);
          showToast(next ? 'Voice Narration Enabled' : 'Voice Narration Disabled');
        }}
        onOpenSettings={onOpenSettings}
        onOpenCheatLab={onOpenCheatLab}
        onOpenModStore={onOpenModStore}
      />
    </div>
  );
}
