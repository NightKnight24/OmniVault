import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, CheckCircle2, AlertTriangle, AlertCircle, UploadCloud, 
  FolderOpen, HardDrive, Gamepad2, Tv, Sparkles, Sliders, 
  ArrowRight, ArrowLeft, RefreshCw, X, ShieldCheck, Cpu, 
  Download, Info, Zap, Monitor, ChevronRight, FileArchive, Layers,
  Database, Disc, Settings2, ExternalLink, Folder, CheckCheck
} from 'lucide-react';
import { 
  fetchSetupStatus, completeSetup, uploadBiosFile, fetchBiosStatus,
  fetchEmulatorsStatus, installEmulator, installAllEmulators,
  openEmulatorFolder, fetchStorageConfig, saveStorageConfig,
  applyQuickSetup, browseDirectory, revealStorageFolder
} from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';
import { useTheme } from '../context/ThemeContext';
import { gamepadService } from '../services/gamepadService';

export default function InitialSetupWizardModal({ isOpen, onClose, onFinish, initialStep = 1 }) {
  const [currentStep, setCurrentStep] = useState(initialStep || 1);
  const totalSteps = 6;
  const { toggleKodiMode, isKodiMode } = useTheme();

  useEffect(() => {
    if (initialStep) {
      setCurrentStep(initialStep);
    }
  }, [initialStep]);

  // Wizard state
  const [setupData, setSetupData] = useState(null);
  const [biosData, setBiosData] = useState(null);
  const [emulators, setEmulators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [controllerInfo, setControllerInfo] = useState({ connected: false, name: 'No Gamepad' });

  // Storage and folder customization state
  const [storageConfig, setStorageConfig] = useState(null);
  const [storageMode, setStorageMode] = useState('quick'); // 'quick' | 'custom'
  const [customPaths, setCustomPaths] = useState({
    dir_roms: '',
    dir_emulators: '',
    dir_bios: '',
    dir_app_data: ''
  });
  const [savingStorage, setSavingStorage] = useState(false);
  const [storageFeedback, setStorageFeedback] = useState(null);
  const [browsingField, setBrowsingField] = useState(null);
  const [hasAutoProvisioned, setHasAutoProvisioned] = useState(false);

  // User preference choices during wizard
  const [chosenResolution, setChosenResolution] = useState('2x');
  const [chosenUpscaler, setChosenUpscaler] = useState('xbrz_6x');
  const [chosenUiMode, setChosenUiMode] = useState(isKodiMode ? 'kodi' : 'desktop');

  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);

  // Auto-provision standalone emulators when entering Step 2 if any are missing
  useEffect(() => {
    if (currentStep === 2 && !hasAutoProvisioned && emulators.length > 0) {
      const missing = emulators.filter(e => !e.is_installed);
      if (missing.length > 0 && !isUpdatingAll) {
        setHasAutoProvisioned(true);
        handleInstallAll();
      }
    }
  }, [currentStep, emulators, hasAutoProvisioned, isUpdatingAll]);

  // Subscribe to gamepad
  useEffect(() => {
    const unsub = gamepadService.subscribe((info) => {
      setControllerInfo(info);
    });
    return unsub;
  }, []);

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [setupRes, biosRes, emuRes, storageRes] = await Promise.all([
        fetchSetupStatus().catch(() => null),
        fetchBiosStatus().catch(() => null),
        fetchEmulatorsStatus().catch(() => ({ emulators: [] })),
        fetchStorageConfig().catch(() => null)
      ]);
      setSetupData(setupRes);
      setBiosData(biosRes);
      setEmulators(emuRes.emulators || []);
      if (storageRes) {
        setStorageConfig(storageRes);
        setStorageMode(storageRes.mode || 'quick');
        setCustomPaths({
          dir_roms: storageRes.directories?.roms?.path || storageRes.quick_defaults?.dir_roms || '/Volumes/ROMS',
          dir_emulators: storageRes.directories?.emulators?.path || storageRes.quick_defaults?.dir_emulators || '/Volumes/ROMS/Emulators',
          dir_bios: storageRes.directories?.bios?.path || storageRes.quick_defaults?.dir_bios || '/Volumes/ROMS/BIOS',
          dir_app_data: storageRes.directories?.app_data?.path || storageRes.quick_defaults?.dir_app_data || '/Volumes/ROMS/OmniVault-Data'
        });
      }
    } catch (err) {
      console.error('[SetupWizard Load Error]:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFolder = async (fieldKey, currentPath) => {
    playClick();
    setBrowsingField(fieldKey);
    try {
      const res = await browseDirectory(currentPath);
      if (!res.canceled && res.path) {
        setCustomPaths(prev => ({
          ...prev,
          [fieldKey]: res.path
        }));
        playVictorySound();
      }
    } catch (err) {
      console.error('[Browse Error]:', err);
    } finally {
      setBrowsingField(null);
    }
  };

  const handleApplyQuickSetup = async () => {
    playClick();
    setSavingStorage(true);
    try {
      const res = await applyQuickSetup();
      playVictorySound();
      setStorageConfig(res.config);
      setStorageMode('quick');
      setCustomPaths({
        dir_roms: res.config.directories?.roms?.path || '',
        dir_emulators: res.config.directories?.emulators?.path || '',
        dir_bios: res.config.directories?.bios?.path || '',
        dir_app_data: res.config.directories?.app_data?.path || '',
      });
      setStorageFeedback('⚡ Quick Setup applied! All recommended folders are provisioned.');
      setTimeout(() => setStorageFeedback(null), 4000);
      const updatedSetup = await fetchSetupStatus();
      setSetupData(updatedSetup);
    } catch (err) {
      alert(`Could not apply quick setup: ${err.message}`);
    } finally {
      setSavingStorage(false);
    }
  };

  const handleSaveCustomStorage = async () => {
    playClick();
    setSavingStorage(true);
    try {
      const res = await saveStorageConfig({
        mode: 'custom',
        dir_roms: customPaths.dir_roms,
        dir_emulators: customPaths.dir_emulators,
        dir_bios: customPaths.dir_bios,
        dir_app_data: customPaths.dir_app_data,
      });
      playVictorySound();
      setStorageConfig(res.config);
      setStorageMode('custom');
      setStorageFeedback('✓ Custom directory locations saved and verified!');
      setTimeout(() => setStorageFeedback(null), 4000);
      const updatedSetup = await fetchSetupStatus();
      setSetupData(updatedSetup);
    } catch (err) {
      alert(`Failed to save custom paths: ${err.message}`);
    } finally {
      setSavingStorage(false);
    }
  };

  const handleSelectVolumePreset = (volPath) => {
    playClick();
    const isWin = volPath.includes('\\') || /^[A-Z]:/i.test(volPath);
    const sep = isWin ? '\\' : '/';
    const cleanVol = volPath.endsWith(sep) ? volPath.slice(0, -1) : volPath;
    setCustomPaths({
      dir_roms: volPath === '/Volumes/ROMS' ? '/Volumes/ROMS' : `${cleanVol}${sep}ROMs`,
      dir_emulators: `${cleanVol}${sep}Emulators`,
      dir_bios: `${cleanVol}${sep}BIOS`,
      dir_app_data: `${cleanVol}${sep}OmniVault-Data`,
    });
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Drag & Drop BIOS Files
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadSuccess(null);
    setUploadError(null);

    let uploadedCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await uploadBiosFile(file);
        uploadedCount++;
      }
      playVictorySound();
      setUploadSuccess(`Successfully imported ${uploadedCount} BIOS/firmware file(s)!`);
      // Refresh bios
      const updatedBios = await fetchBiosStatus();
      setBiosData(updatedBios);
      const updatedSetup = await fetchSetupStatus();
      setSetupData(updatedSetup);
    } catch (err) {
      setUploadError(err.message || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // 1-Click install emulator
  const handleInstallEmu = async (emuId, emuName) => {
    playClick();
    setInstallingId(emuId);
    try {
      await installEmulator(emuId);
      playVictorySound();
      const refreshed = await fetchEmulatorsStatus();
      setEmulators(refreshed.emulators || []);
      const updatedSetup = await fetchSetupStatus();
      setSetupData(updatedSetup);
    } catch (err) {
      alert(`Could not install ${emuName}: ${err.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  // 1-Click install all emulators
  const handleInstallAll = async () => {
    playClick();
    setIsUpdatingAll(true);
    try {
      await installAllEmulators();
      playVictorySound();
      const refreshed = await fetchEmulatorsStatus();
      setEmulators(refreshed.emulators || []);
      const updatedSetup = await fetchSetupStatus();
      setSetupData(updatedSetup);
    } catch (err) {
      alert(`Batch update encountered an issue: ${err.message}`);
    } finally {
      setIsUpdatingAll(false);
    }
  };

  // Complete wizard
  const handleFinishWizard = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    playVictorySound();
    try {
      localStorage.setItem('omnivault_initial_setup_completed', 'true');
      await completeSetup({
        emu_resolution_scale: chosenResolution,
        emu_ai_upscaling_mode: chosenUpscaler,
        omnivault_ui_mode: chosenUiMode,
        storage: {
          mode: storageMode,
          dir_roms: customPaths.dir_roms,
          dir_emulators: customPaths.dir_emulators,
          dir_bios: customPaths.dir_bios,
          dir_app_data: customPaths.dir_app_data,
        }
      });
      if (chosenUiMode === 'kodi' && !isKodiMode) {
        toggleKodiMode();
      } else if (chosenUiMode === 'desktop' && isKodiMode) {
        toggleKodiMode();
      }
    } catch (e) {
      console.warn('Could not complete setup via API:', e);
    } finally {
      setIsFinishing(false);
      if (onFinish) onFinish();
      onClose();
    }
  };

  const biosItems = biosData?.items ? Object.values(biosData.items) : [];
  const readyBiosCount = biosItems.filter(b => b.present).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 select-none">
      <div className="relative w-full max-w-4xl h-[88vh] max-h-[820px] bg-slate-950/95 border border-cyan-500/30 rounded-3xl shadow-[0_0_50px_rgba(0,210,255,0.25)] flex flex-col overflow-hidden text-slate-200">
        
        {/* TOP STATUS BAR & HEADER */}
        <div className="px-8 py-5 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/vault.svg" alt="OmniVault" className="w-9 h-9 object-contain drop-shadow-[0_0_12px_#00f0ff]" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-xl text-white tracking-wider">OMNIVAULT</span>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Initial Launch Setup
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Hardware & Emulator Provisioning Checklist • Step {currentStep} of {totalSteps}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Skip or Close Setup (Can be reopened anytime from Settings)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEPPER PROGRESS BAR */}
        <div className="px-8 py-3 bg-black/40 border-b border-white/5 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          {[
            { num: 1, label: '1. Storage' },
            { num: 2, label: '2. Emulators' },
            { num: 3, label: '3. BIOS & Keys' },
            { num: 4, label: '4. AI & Graphics' },
            { num: 5, label: '5. Controller & Mode' },
            { num: 6, label: '6. Ready' }
          ].map((s) => (
            <div 
              key={s.num}
              onClick={() => { playClick(); setCurrentStep(s.num); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                currentStep === s.num
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black shadow-glow-cyan scale-105'
                  : currentStep > s.num
                    ? 'bg-slate-900 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-900/50 text-slate-500 border border-white/5'
              }`}
            >
              {currentStep > s.num ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <span className="w-3.5 text-center">{s.num}</span>
              )}
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* MAIN BODY WORKSPACE (Step-dependent) */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          
          {/* STEP 1: STORAGE & DIRECTORY VERIFICATION */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              {/* TOP HERO & MODE TOGGLE */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-slate-900 border border-cyan-500/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <HardDrive className="w-8 h-8 text-cyan-400 shrink-0 mt-0.5 drop-shadow-[0_0_10px_#00f0ff]" />
                    <div>
                      <h2 className="text-lg font-black text-white flex items-center gap-2">
                        <span>Storage & Folder Architecture</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {storageMode === 'quick' ? '⚡ Quick Setup Active' : '🛠️ Custom Folders Active'}
                        </span>
                      </h2>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Choose where OmniVault stores your native Emulators, ROMs library, BIOS/Firmware keys, and Application Data (database, save snapshots, and cache).
                      </p>
                    </div>
                  </div>

                  {/* MODE SELECTOR PILL */}
                  <div className="flex items-center p-1 rounded-xl bg-black/60 border border-white/10 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setStorageMode('quick');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        storageMode === 'quick'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black shadow-glow-cyan'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Quick Setup</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setStorageMode('custom');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        storageMode === 'custom'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black shadow-glow-cyan'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Custom Folders</span>
                    </button>
                  </div>
                </div>

                {storageFeedback && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{storageFeedback}</span>
                  </div>
                )}
              </div>

              {/* VIEW A: QUICK SETUP MODE (PRE-PICKS ALL 4 LOCATIONS) */}
              {storageMode === 'quick' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span>RECOMMENDED AUTO-DETECTED PRESET:</span>
                      </div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {storageConfig?.quick_defaults?.preset_label || 'Auto-Detected Vault Storage'}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        All 4 core folders are pre-configured into a self-contained portable structure. Zero setup friction.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyQuickSetup}
                      disabled={savingStorage}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 shrink-0 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${savingStorage ? 'animate-spin' : ''}`} />
                      <span>{savingStorage ? 'Provisioning Folders...' : 'Apply Quick Setup Defaults'}</span>
                    </button>
                  </div>

                  {/* 4 PRE-PICKED LOCATIONS GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* 1. EMULATORS FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <Cpu className="w-4 h-4 text-cyan-400" />
                          <span>1. Native Emulators Folder</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Portable Sandbox
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate select-all">
                        {storageConfig?.directories?.emulators?.path || storageConfig?.quick_defaults?.dir_emulators || 'Emulators'}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Dolphin, PCSX2, Lime3DS, RPCS3, Vita3K, etc.</span>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('emulators')}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" /> Reveal
                        </button>
                      </div>
                    </div>

                    {/* 2. ROMS FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <Disc className="w-4 h-4 text-emerald-400" />
                          <span>2. ROMs & Games Library</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {storageConfig?.directories?.roms?.free_gb || 0} GB Free
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate select-all">
                        {storageConfig?.directories?.roms?.path || storageConfig?.quick_defaults?.dir_roms || 'ROMs'}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Organized per-platform (SNES, PS1, PS2, N64...)</span>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('roms')}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" /> Reveal
                        </button>
                      </div>
                    </div>

                    {/* 3. BIOS & FIRMWARE FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <ShieldCheck className="w-4 h-4 text-amber-400" />
                          <span>3. BIOS & Firmware Folder</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                          Auto-Sync Active
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate select-all">
                        {storageConfig?.directories?.bios?.path || storageConfig?.quick_defaults?.dir_bios || 'BIOS'}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>PS2 BIOS, PS3 PUP, Switch keys, firmware</span>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('bios')}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" /> Reveal
                        </button>
                      </div>
                    </div>

                    {/* 4. APP DATA & DATABASE FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <Database className="w-4 h-4 text-violet-400" />
                          <span>4. OmniVault Data & App Storage</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950 text-violet-400 border border-violet-800">
                          73,906 Games DB
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate select-all">
                        {storageConfig?.directories?.app_data?.path || storageConfig?.quick_defaults?.dir_app_data || 'OmniVault-Data'}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>vault.db, save backups, mod cache, patches</span>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('app_data')}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" /> Reveal
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-400">
                      Need custom folder locations on an external SSD or custom drive?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setStorageMode('custom');
                      }}
                      className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Customize Each Folder Location →
                    </button>
                  </div>
                </div>
              )}

              {/* VIEW B: CUSTOM FOLDER LOCATIONS MODE */}
              {storageMode === 'custom' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* VOLUME QUICK-PRESETS BAR */}
                  {storageConfig?.detected_volumes && storageConfig.detected_volumes.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/10 space-y-2">
                      <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Quick Drive Selector (Click to set base volume for all folders):</span>
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {storageConfig.detected_volumes.map((vol) => (
                          <button
                            key={vol.path}
                            type="button"
                            onClick={() => handleSelectVolumePreset(vol.path)}
                            className="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/50 text-xs font-mono font-bold text-slate-200 hover:text-cyan-300 flex items-center gap-2 transition-all cursor-pointer"
                          >
                            <span>{vol.is_portable ? '💾' : '💻'} {vol.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400">
                              {vol.free_gb} GB Free
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4 INDEPENDENT CUSTOM PATH PICKERS */}
                  <div className="space-y-3">
                    {/* 1. EMULATORS FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-400" />
                          <span>1. Native Emulators Folder</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Where standalone emulator apps & portable data reside
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customPaths.dir_emulators}
                          onChange={(e) => setCustomPaths({ ...customPaths, dir_emulators: e.target.value })}
                          placeholder={storageConfig?.quick_defaults?.dir_emulators || "/Volumes/ROMS/Emulators"}
                          className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleBrowseFolder('dir_emulators', customPaths.dir_emulators)}
                          disabled={browsingField === 'dir_emulators'}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                          <span>{browsingField === 'dir_emulators' ? 'Selecting...' : 'Browse...'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('emulators', customPaths.dir_emulators)}
                          className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                          title="Reveal Folder"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 2. ROMS FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Disc className="w-4 h-4 text-emerald-400" />
                          <span>2. ROMs & Games Library Folder</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Where downloaded games, 1G1R ROMs, and discs are stored
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customPaths.dir_roms}
                          onChange={(e) => setCustomPaths({ ...customPaths, dir_roms: e.target.value })}
                          placeholder={storageConfig?.quick_defaults?.dir_roms || "/Volumes/ROMS"}
                          className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleBrowseFolder('dir_roms', customPaths.dir_roms)}
                          disabled={browsingField === 'dir_roms'}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                          <span>{browsingField === 'dir_roms' ? 'Selecting...' : 'Browse...'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('roms', customPaths.dir_roms)}
                          className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                          title="Reveal Folder"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 3. BIOS & FIRMWARE FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-amber-400" />
                          <span>3. BIOS & System Firmware Folder</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Where official BIOS files, Switch keys, and firmware are scanned
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customPaths.dir_bios}
                          onChange={(e) => setCustomPaths({ ...customPaths, dir_bios: e.target.value })}
                          placeholder={storageConfig?.quick_defaults?.dir_bios || "/Volumes/ROMS/BIOS"}
                          className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleBrowseFolder('dir_bios', customPaths.dir_bios)}
                          disabled={browsingField === 'dir_bios'}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 border border-amber-500/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                          <span>{browsingField === 'dir_bios' ? 'Selecting...' : 'Browse...'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('bios', customPaths.dir_bios)}
                          className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                          title="Reveal Folder"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 4. APP DATA & STORAGE FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Database className="w-4 h-4 text-violet-400" />
                          <span>4. OmniVault Data & App Storage Folder</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Where database (vault.db), save snapshots, and cache are saved
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customPaths.dir_app_data}
                          onChange={(e) => setCustomPaths({ ...customPaths, dir_app_data: e.target.value })}
                          placeholder={storageConfig?.quick_defaults?.dir_app_data || "/Volumes/ROMS/OmniVault-Data"}
                          className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleBrowseFolder('dir_app_data', customPaths.dir_app_data)}
                          disabled={browsingField === 'dir_app_data'}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-violet-300 border border-violet-500/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                          <span>{browsingField === 'dir_app_data' ? 'Selecting...' : 'Browse...'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('app_data', customPaths.dir_app_data)}
                          className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                          title="Reveal Folder"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CURRENT APP BUNDLE LOCATION */}
                  <div className="p-3.5 rounded-xl bg-slate-900/50 border border-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <img src="/vault.svg" alt="App" className="w-5 h-5 object-contain" />
                      <div>
                        <div className="text-xs font-bold text-slate-200">
                          OmniVault Application Directory
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate max-w-md">
                          {storageConfig?.app_bundle?.path || 'OmniVault Application'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => revealStorageFolder('app_bundle')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-white/10 cursor-pointer shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>Reveal App Folder</span>
                    </button>
                  </div>

                  {/* SAVE CUSTOM PATHS BUTTON */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={handleApplyQuickSetup}
                      className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Zap className="w-3 h-3 text-cyan-400" />
                      <span>Reset to Quick Setup Defaults</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveCustomStorage}
                      disabled={savingStorage}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs shadow-glow-emerald flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <CheckCheck className={`w-4 h-4 ${savingStorage ? 'animate-spin' : ''}`} />
                      <span>{savingStorage ? 'Saving & Verifying...' : 'Save & Provision Custom Directories'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CORE EMULATORS PROVISIONING */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-white">Integrated Native Emulator Engines</h2>
                  <p className="text-xs text-slate-400">
                    High-performance hardware emulators built into OmniVault. 1-click batch install or update directly into {storageConfig?.directories?.emulators?.path || 'Emulators'}.
                  </p>
                </div>

                <button
                  onClick={handleInstallAll}
                  disabled={isUpdatingAll}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs shadow-glow-emerald flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${isUpdatingAll ? 'animate-bounce' : ''}`} />
                  <span>{isUpdatingAll ? 'Installing All...' : 'Install / Update All Engines'}</span>
                </button>
              </div>

              {isUpdatingAll && (
                <div className="p-3.5 rounded-xl bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-2 animate-pulse">
                  <Zap className="w-4 h-4 text-cyan-400 shrink-0 animate-bounce" />
                  <span>⚡ Auto-Provisioning & Verifying Standalone Emulators into {storageConfig?.directories?.emulators?.path || 'Emulators'}...</span>
                </div>
              )}

              {!isUpdatingAll && emulators.length > 0 && emulators.every(e => e.is_installed) && (
                <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>⚡ All {emulators.length} Standalone Hardware Emulators are Verified & Ready in {storageConfig?.directories?.emulators?.path || 'Emulators'} (Dolphin, Cemu, Lime3DS, Vita3K, PCSX2, RPCS3, Ryujinx, xemu, xenia, shadPS4, melonDS, PPSSPP, RetroArch).</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                {emulators.map((emu) => (
                  <div 
                    key={emu.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/30 flex items-center justify-between transition-all"
                  >
                    <div className="space-y-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{emu.name}</span>
                        {emu.is_installed ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Ready
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-white/5">
                            Not Installed
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1">{emu.description}</p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {emu.consoles.map(c => (
                          <span key={c} className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 text-cyan-300 border border-cyan-900">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleInstallEmu(emu.id, emu.name)}
                      disabled={installingId === emu.id || isUpdatingAll}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                        emu.is_installed
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-black font-black shadow-glow-cyan'
                      }`}
                    >
                      {installingId === emu.id ? 'Installing...' : emu.is_installed ? 'Update' : 'Install'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: REQUIRED BIOS & KEYS CHECKLIST + DRAG & DROP DROPZONE */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                      <span>Required BIOS & System Firmware</span>
                    </h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Certain systems (PS2, PS3, Original Xbox, Switch, Vita) require official system firmware, decryption keys, or BIOS images to boot. Drag and drop your files directly into the box below!
                    </p>
                  </div>

                  <div className="px-3 py-1.5 rounded-full bg-slate-900 border border-white/10 text-xs font-mono font-bold">
                    <span className="text-emerald-400">{readyBiosCount}</span> / {biosItems.length} Systems Ready
                  </div>
                </div>
              </div>

              {/* INTERACTIVE DRAG & DROP UPLOAD DROPZONE */}
              <div 
                ref={dropzoneRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/15 hover:bg-cyan-950/25 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  multiple 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e.target.files)} 
                />
                
                <UploadCloud className="w-10 h-10 text-cyan-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <h3 className="text-sm font-black text-white">
                  {uploading ? 'Processing & Extracting Firmware...' : 'Drag & Drop BIOS Files or ZIP Archives Here'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
                  Drop `.bin`, `.pup`, `prod.keys`, `.keys`, or `.zip` packs here. OmniVault automatically places or extracts them into {storageConfig?.directories?.bios?.path || 'BIOS folder'}.
                </p>

                <div className="flex items-center justify-center gap-3 mt-3">
                  <span className="px-3 py-1 rounded-lg bg-cyan-900/60 text-cyan-300 text-xs font-bold border border-cyan-700">
                    Browse Files...
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEmulatorFolder('bios');
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-white/10 flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Open BIOS Folder</span>
                  </button>
                </div>

                {uploadSuccess && (
                  <div className="mt-3 text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> {uploadSuccess}
                  </div>
                )}
                {uploadError && (
                  <div className="mt-3 text-xs font-bold text-rose-400 flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> {uploadError}
                  </div>
                )}
              </div>

              {/* BIOS ITEMS REQUIREMENT BREAKDOWN */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {biosItems.map((item) => (
                  <div 
                    key={item.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      item.present 
                        ? 'bg-emerald-950/20 border-emerald-500/30' 
                        : 'bg-slate-900/80 border-white/10'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{item.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-slate-300 border border-white/5">
                          {item.system}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Target: <code className="text-cyan-300 font-mono">{item.target_spec}</code>
                      </p>
                      <p className="text-[10px] text-slate-500">{item.status_note}</p>
                    </div>

                    <div>
                      {item.present ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" /> Present
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-950/70 text-amber-400 border border-amber-800/80 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" /> Missing
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: GRAPHICS & AI UPSCALING */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <span>Display Quality & AI Neural Upscaling</span>
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Select your default visual enhancements. These will automatically synchronize into Dolphin, RPCS3, Ryujinx, PCSX2, xemu, and melonDS.
                </p>
              </div>

              {/* Resolution Multiplier */}
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-slate-400 uppercase">Default Internal Resolution</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: '1x', label: '1x Native', desc: 'Original classic pixel clarity' },
                    { id: '2x', label: '2x (720p/1080p)', desc: 'Balanced HD performance' },
                    { id: '3x', label: '3x (1440p 2K)', desc: 'High density Apple Retina' },
                    { id: '4x', label: '4x (4K Ultra HD)', desc: 'Maximum crisp detail' }
                  ].map((res) => (
                    <div 
                      key={res.id}
                      onClick={() => { playClick(); setChosenResolution(res.id); }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        chosenResolution === res.id
                          ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-glow-cyan'
                          : 'bg-slate-900/80 border-white/10 hover:border-white/20 text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-sm">{res.label}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{res.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Upscaling Shader Engine */}
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-slate-400 uppercase">AI Neural Upscaler & Post-Processing</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { id: 'xbrz_6x', name: 'xBRZ 6x Neural Vector', desc: 'Mathematical curved vector interpolation with zero blockiness or pixel blur.' },
                    { id: 'scalefx_ai', name: 'ScaleFX AI Edge Reconstruction', desc: 'Multi-pass directional edge filtering and procedural anti-aliasing.' },
                    { id: 'crt_royale', name: 'CRT Royale Studio (Scanlines & Phosphors)', desc: 'Sub-pixel triad aperture grille simulation with authentic vintage glass glow.' },
                    { id: 'fsr_edge', name: 'AMD FidelityFX Super Resolution (FSR)', desc: 'Spatial sharpening and edge adaptive enhancement for 3D polygonal geometry.' }
                  ].map((up) => (
                    <div 
                      key={up.id}
                      onClick={() => { playClick(); setChosenUpscaler(up.id); }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        chosenUpscaler === up.id
                          ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-glow-cyan'
                          : 'bg-slate-900/80 border-white/10 hover:border-white/20 text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-sm">{up.name}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{up.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: CONTROLLER & EXPERIENCE MODE */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-emerald-400" />
                  <span>Gamepad Detection & Initial Experience Mode</span>
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  OmniVault features zero-configuration gamepad auto-detection and two distinct UI presentations.
                </p>
              </div>

              {/* Gamepad Status Banner */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${controllerInfo.connected ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Gamepad2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{controllerInfo.connected ? controllerInfo.name : 'No Gamepad Detected'}</span>
                      <span className={`w-2 h-2 rounded-full ${controllerInfo.connected ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {controllerInfo.connected 
                        ? 'DualSense / Xbox / Switch Pro profile automatically mapped! [PS / Xbox Guide / F1] opens Quick Menu.' 
                        : 'Connect any USB or Bluetooth gamepad at any time. It will auto-detect instantly.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Experience Mode Choice */}
              <div className="space-y-2">
                <label className="text-xs font-bold font-mono text-slate-400 uppercase">Select Default Experience Mode</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div 
                    onClick={() => { playClick(); setChosenUiMode('kodi'); }}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      chosenUiMode === 'kodi'
                        ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-glow-cyan'
                        : 'bg-slate-900/80 border-white/10 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-base mb-1">
                      <Tv className="w-5 h-5" />
                      <span>Kodi / XBMC 10-Foot Cinema Mode</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Optimized for living room TVs and gamepad navigation. Features horizontal coverflow carousels, dynamic fan-art backdrops, and an instant Guide Quick Menu.
                    </p>
                  </div>

                  <div 
                    onClick={() => { playClick(); setChosenUiMode('desktop'); }}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                      chosenUiMode === 'desktop'
                        ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-glow-cyan'
                        : 'bg-slate-900/80 border-white/10 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-base mb-1">
                      <Monitor className="w-5 h-5" />
                      <span>Classic Desktop Storefront</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Optimized for keyboard and mouse browsing with multi-column game grids, granular genre dropdowns, and fast search pagination.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: READY TO PLAY (CONFIRMATION & ENTER) */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-fadeIn text-center py-6">
              <div className="w-20 h-20 rounded-full bg-cyan-950/80 border border-cyan-400 flex items-center justify-center mx-auto shadow-glow-cyan">
                <Sparkles className="w-10 h-10 text-cyan-300 animate-pulse" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-white">OmniVault is Ready to Launch!</h2>
                <p className="text-sm text-slate-300 mt-2 max-w-lg mx-auto">
                  Your self-contained emulation vault is prepared. You can jump directly into thousands of preserved classic titles or scrape any game anytime from the in-app mirrors.
                </p>
              </div>

              <div className="max-w-md mx-auto p-4 rounded-2xl bg-slate-900/80 border border-white/10 text-left space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Vault Location:</span>
                  <span className="font-mono font-bold text-emerald-400">{storageConfig?.directories?.roms?.path || storageConfig?.quick_defaults?.dir_roms || 'Configured ROMs Volume'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Native Engines:</span>
                  <span className="font-mono font-bold text-cyan-400">{emulators.length > 0 ? `${emulators.length} Hardware Emulators` : '14 Bundled Emulators'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Firmware Verified:</span>
                  <span className="font-mono font-bold text-amber-400">{readyBiosCount} System Key Sets</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Resolution & AI:</span>
                  <span className="font-mono font-bold text-slate-200">{chosenResolution} • {chosenUpscaler}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Initial Experience:</span>
                  <span className="font-mono font-bold text-cyan-300">{chosenUiMode === 'kodi' ? 'Kodi 10-Foot' : 'Desktop UI'}</span>
                </div>
              </div>

              <button
                onClick={handleFinishWizard}
                disabled={isFinishing}
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 hover:from-emerald-300 hover:to-blue-400 text-black font-black text-base shadow-glow-cyan hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-3 disabled:opacity-50"
              >
                {isFinishing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Launching OmniVault...</span>
                  </>
                ) : (
                  <>
                    <span>Enter OmniVault</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}

        </div>

        {/* BOTTOM NAVIGATION FOOTER */}
        <div className="px-8 py-4 border-t border-white/10 bg-slate-900/60 flex items-center justify-between">
          <button
            onClick={() => {
              playClick();
              setCurrentStep(s => Math.max(1, s - 1));
            }}
            disabled={currentStep === 1}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <span className="text-xs font-mono text-slate-500">
            Step {currentStep} of {totalSteps}
          </span>

          {currentStep < totalSteps ? (
            <button
              onClick={() => {
                playClick();
                setCurrentStep(s => Math.min(totalSteps, s + 1));
              }}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 cursor-pointer"
            >
              <span>Next Step</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinishWizard}
              disabled={isFinishing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-black text-xs shadow-glow-emerald flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isFinishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Finishing...</span>
                </>
              ) : (
                <>
                  <span>Finish & Launch</span>
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
