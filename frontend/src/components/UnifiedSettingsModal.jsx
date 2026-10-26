import React, { useState, useEffect } from 'react';
import { 
  X, Sliders, Radio, Plus, Trash2, Check, AlertCircle, 
  ExternalLink, Globe, Key, Link as LinkIcon, RefreshCw,
  Power, ShieldCheck, HelpCircle, Server, Cpu, Tv, Volume2,
  FolderOpen, Download, CheckCircle2, AlertTriangle, Save,
  Sparkles, Layers, Monitor, HardDrive, Gamepad2, Palette, Wand2,
  CheckSquare, ArrowRight, RotateCcw, Zap, FastForward,
  Database, Disc, CheckCheck
} from 'lucide-react';
import { 
  fetchProviders, addProvider, deleteProvider, toggleProvider, testProviderConnection,
  fetchSearchTemplates, addSearchTemplate, deleteSearchTemplate,
  fetchEmulatorsStatus, installEmulator, installAllEmulators,
  fetchEmulatorSettings, saveEmulatorSettings, fetchBiosStatus,
  openEmulatorFolder, generateAITheme, saveTheme, deleteTheme,
  fetchStorageConfig, saveStorageConfig, applyQuickSetup,
  browseDirectory, revealStorageFolder
} from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';
import { useTheme } from '../context/ThemeContext';
import { gamepadService, DEFAULT_MAPPING } from '../services/gamepadService';

export default function UnifiedSettingsModal({ isOpen, onClose, onOpenSetupWizard }) {
  // Tab state: 'emulators' | 'graphics' | 'audio' | 'bios' | 'storage' | 'themes' | 'controller' | 'torznab' | 'templates'
  const [activeTab, setActiveTab] = useState('emulators');
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Theme Context & AI Theme Studio State
  const { currentTheme, themesList, selectTheme, loadThemes, isKodiMode, toggleKodiMode } = useTheme();
  const [aiThemePrompt, setAiThemePrompt] = useState('');
  const [isGeneratingTheme, setIsGeneratingTheme] = useState(false);
  const [previewTheme, setPreviewTheme] = useState(null);

  // Gamepad & Remapping State
  const [gamepadInfo, setGamepadInfo] = useState({ connected: false, name: 'No Gamepad', mapping: DEFAULT_MAPPING });
  const [remappingAction, setRemappingAction] = useState(null);

  // 1. Emulators State
  const [emulators, setEmulators] = useState([]);
  const [installingId, setInstallingId] = useState(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  // 2. Settings State (Graphics & Audio)
  const [settings, setSettings] = useState({
    emu_resolution_scale: '2x',
    emu_aspect_ratio: '16:9',
    emu_fullscreen: 'true',
    emu_vsync: 'true',
    emu_ai_upscaling_mode: 'xbrz_6x',
    emu_motion_smoothing: 'true',
    emu_runahead_lag: 'true',
    emu_shader_filter: 'none',
    emu_volume: '85',
    emu_audio_backend: 'CoreAudio',
    emu_audio_upscaling: 'audiosr_48k',
    emu_audio_denoise: 'true',
    emu_portable_mode: 'true',
    emu_auto_update: 'true'
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // 3. BIOS State
  const [biosData, setBiosData] = useState(null);
  const [scanningBios, setScanningBios] = useState(false);

  // 4. Providers & Templates State
  const [providers, setProviders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [provName, setProvName] = useState('');
  const [provUrl, setProvUrl] = useState('');
  const [provKey, setProvKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [formError, setFormError] = useState(null);

  // New Template Form State
  const [tplName, setTplName] = useState('');
  const [tplUrl, setTplUrl] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplError, setTplError] = useState(null);

  // Storage & Directory Architecture State
  const [storageConfig, setStorageConfig] = useState(null);
  const [storageMode, setStorageMode] = useState('quick'); // 'quick' | 'custom'
  const [customPaths, setCustomPaths] = useState({
    dir_roms: '/Volumes/ROMS',
    dir_emulators: '/Volumes/ROMS/Emulators',
    dir_bios: '/Volumes/ROMS/BIOS',
    dir_app_data: '/Volumes/ROMS/OmniVault-Data'
  });
  const [savingStorage, setSavingStorage] = useState(false);
  const [browsingField, setBrowsingField] = useState(null);

  useEffect(() => {
    const unsub = gamepadService.subscribe((info) => {
      setGamepadInfo(info);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAllData();
    }
  }, [isOpen]);

  const showToast = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [emuRes, setRes, biosRes, provRes, tplRes, storageRes] = await Promise.all([
        fetchEmulatorsStatus().catch(() => ({ emulators: [] })),
        fetchEmulatorSettings().catch(() => ({ settings: {} })),
        fetchBiosStatus().catch(() => null),
        fetchProviders().catch(() => ({ providers: [] })),
        fetchSearchTemplates().catch(() => ({ templates: [] })),
        fetchStorageConfig().catch(() => null)
      ]);

      setEmulators(emuRes.emulators || []);
      if (setRes.settings && Object.keys(setRes.settings).length > 0) {
        setSettings(prev => ({ ...prev, ...setRes.settings }));
      }
      setBiosData(biosRes);
      setProviders(provRes.providers || []);
      setTemplates(tplRes.templates || []);
      if (storageRes) {
        setStorageConfig(storageRes);
        setStorageMode(storageRes.mode || 'quick');
        setCustomPaths({
          dir_roms: storageRes.directories?.roms?.path || '/Volumes/ROMS',
          dir_emulators: storageRes.directories?.emulators?.path || '/Volumes/ROMS/Emulators',
          dir_bios: storageRes.directories?.bios?.path || '/Volumes/ROMS/BIOS',
          dir_app_data: storageRes.directories?.app_data?.path || '/Volumes/ROMS/OmniVault-Data'
        });
      }
    } catch (err) {
      console.error('[UnifiedSettingsModal Error]:', err);
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
        showToast(`Selected folder: ${res.path}`);
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
      showToast('⚡ Quick Setup applied! All folders provisioned.');
      const refreshedEmus = await fetchEmulatorsStatus().catch(() => ({ emulators: [] }));
      setEmulators(refreshedEmus.emulators || []);
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
      showToast('✓ Custom directory paths saved and verified!');
      const refreshedEmus = await fetchEmulatorsStatus().catch(() => ({ emulators: [] }));
      setEmulators(refreshedEmus.emulators || []);
    } catch (err) {
      alert(`Failed to save custom paths: ${err.message}`);
    } finally {
      setSavingStorage(false);
    }
  };

  const handleSelectVolumePreset = (volPath) => {
    playClick();
    setCustomPaths({
      dir_roms: volPath === '/Volumes/ROMS' ? '/Volumes/ROMS' : `${volPath}/ROMs`,
      dir_emulators: `${volPath}/Emulators`,
      dir_bios: `${volPath}/BIOS`,
      dir_app_data: `${volPath}/OmniVault-Data`,
    });
    showToast(`Base drive set to: ${volPath}`);
  };

  const handleInstallEmulator = async (emuId, emuName) => {
    playClick();
    setInstallingId(emuId);
    try {
      const res = await installEmulator(emuId);
      playVictorySound();
      showToast(`${emuName}: ${res.message || 'Installed successfully!'}`);
      const refreshed = await fetchEmulatorsStatus();
      setEmulators(refreshed.emulators || []);
    } catch (err) {
      alert(`Installation error for ${emuName}: ${err.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUpdateAll = async () => {
    playClick();
    setIsUpdatingAll(true);
    try {
      const res = await installAllEmulators();
      playVictorySound();
      showToast(`Batch update completed! Installed ${res.installed?.length || 0} engines.`);
      const refreshed = await fetchEmulatorsStatus();
      setEmulators(refreshed.emulators || []);
    } catch (err) {
      alert(`Batch update encountered an issue: ${err.message}`);
    } finally {
      setIsUpdatingAll(false);
    }
  };

  const handleSaveSettings = async () => {
    playClick();
    setSavingSettings(true);
    try {
      await saveEmulatorSettings(settings);
      playVictorySound();
      showToast('Settings saved & applied to emulator config files!');
    } catch (err) {
      alert(`Could not save settings: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRefreshBios = async () => {
    playClick();
    setScanningBios(true);
    try {
      const res = await fetchBiosStatus();
      setBiosData(res);
      showToast(`Audited ${res.files_found} firmware files in /Volumes/ROMS/BIOS`);
    } catch (err) {
      alert(`Error scanning BIOS folder: ${err.message}`);
    } finally {
      setScanningBios(false);
    }
  };

  const handleOpenFolder = async (folder) => {
    playClick();
    try {
      await openEmulatorFolder(folder);
      showToast(`Opened ${folder === 'emulators' ? '/Volumes/ROMS/Emulators' : '/Volumes/ROMS/BIOS'} in Finder`);
    } catch (err) {
      alert(`Could not open folder: ${err.message}`);
    }
  };

  // Provider Actions
  const handleTestConnection = async () => {
    if (!provUrl.trim()) {
      setFormError('Please enter a Torznab Endpoint URL first');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setFormError(null);
    try {
      const res = await testProviderConnection({
        name: provName || 'Test Provider',
        endpoint_url: provUrl.trim(),
        api_key: provKey.trim()
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ status: 'error', message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleAddProvider = async (e) => {
    e.preventDefault();
    if (!provName.trim() || !provUrl.trim()) {
      setFormError('Name and Endpoint URL are required');
      return;
    }
    try {
      await addProvider({
        name: provName.trim(),
        endpoint_url: provUrl.trim(),
        api_key: provKey.trim(),
        type: 'torznab'
      });
      setProvName('');
      setProvUrl('');
      setProvKey('');
      setTestResult(null);
      setFormError(null);
      const res = await fetchProviders();
      setProviders(res.providers || []);
      showToast('Provider added successfully!');
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleDeleteProvider = async (id) => {
    try {
      await deleteProvider(id);
      setProviders(prev => prev.filter(p => p.id !== id));
      showToast('Provider removed');
    } catch (err) {
      alert(`Could not delete provider: ${err.message}`);
    }
  };

  const handleToggleProvider = async (id) => {
    try {
      const res = await toggleProvider(id);
      setProviders(prev => prev.map(p => p.id === id ? { ...p, is_enabled: res.is_enabled } : p));
    } catch (err) {
      alert(`Could not toggle provider: ${err.message}`);
    }
  };

  const handleAddTemplate = async (e) => {
    e.preventDefault();
    if (!tplName.trim() || !tplUrl.trim()) {
      setTplError('Name and URL Template are required');
      return;
    }
    if (!tplUrl.includes('{title}')) {
      setTplError("URL Template must include '{title}' variable placeholder");
      return;
    }
    try {
      await addSearchTemplate({
        name: tplName.trim(),
        url_template: tplUrl.trim(),
        description: tplDesc.trim()
      });
      setTplName('');
      setTplUrl('');
      setTplDesc('');
      setTplError(null);
      const res = await fetchSearchTemplates();
      setTemplates(res.templates || []);
      showToast('Template added!');
    } catch (err) {
      setTplError(err.message);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await deleteSearchTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      showToast('Template removed');
    } catch (err) {
      alert(`Could not delete template: ${err.message}`);
    }
  };

  const BUTTON_NAMES = {
    0: 'A / ✕ (Cross)',
    1: 'B / ○ (Circle)',
    2: 'X / □ (Square)',
    3: 'Y / △ (Triangle)',
    4: 'L1 / LB',
    5: 'R1 / RB',
    6: 'L2 / LT',
    7: 'R2 / RT',
    8: 'Select / Share / Back',
    9: 'Start / Menu / Options',
    10: 'L3 (Left Stick Click)',
    11: 'R3 (Right Stick Click)',
    12: 'D-Pad Up',
    13: 'D-Pad Down',
    14: 'D-Pad Left',
    15: 'D-Pad Right',
    16: 'PS Home / Xbox Guide / Switch Home'
  };

  const handleGenerateAI = async (e) => {
    if (e) e.preventDefault();
    if (!aiThemePrompt.trim()) return;
    setIsGeneratingTheme(true);
    try {
      const res = await generateAITheme(aiThemePrompt.trim());
      setPreviewTheme(res.theme);
      showToast(`AI Theme "${res.theme.name}" synthesized!`);
    } catch (err) {
      alert(`AI Theme generation failed: ${err.message}`);
    } finally {
      setIsGeneratingTheme(false);
    }
  };

  const handleApplySaveAITheme = async () => {
    if (!previewTheme) return;
    try {
      await saveTheme(previewTheme);
      await loadThemes();
      selectTheme(previewTheme.id);
      playVictorySound();
      showToast(`Activated and saved "${previewTheme.name}"`);
      setPreviewTheme(null);
      setAiThemePrompt('');
    } catch (err) {
      alert(`Could not save theme: ${err.message}`);
    }
  };

  const handleDeleteCustomTheme = async (themeId) => {
    try {
      await deleteTheme(themeId);
      await loadThemes();
      showToast('Theme removed');
    } catch (err) {
      alert(`Could not delete theme: ${err.message}`);
    }
  };

  const handleStartRemapping = (actionKey) => {
    setRemappingAction(actionKey);
    gamepadService.startListeningForRemap(actionKey, (btnIdx) => {
      setRemappingAction(null);
      playClick();
      showToast(`Mapped ${actionKey} to Button ${btnIdx} (${BUTTON_NAMES[btnIdx] || 'Btn ' + btnIdx})`);
    });
  };

  const handleCancelRemapping = () => {
    gamepadService.cancelListeningForRemap();
    setRemappingAction(null);
  };

  const handleResetMapping = () => {
    gamepadService.resetMapping();
    playClick();
    showToast('Reset gamepad to standard factory layout');
  };

  const handleToggleTurboGlobal = () => {
    const current = gamepadInfo.turbo || { enabled: false, rateHz: 20, buttons: {} };
    const updated = { ...current, enabled: !current.enabled };
    gamepadService.saveTurboConfig(updated);
    playClick();
    showToast(updated.enabled ? '⚡ Turbo Mode Enabled' : 'Turbo Mode Disabled');
  };

  const handleSetTurboRate = (rateHz) => {
    const current = gamepadInfo.turbo || { enabled: false, rateHz: 20, buttons: {} };
    const updated = { ...current, rateHz };
    gamepadService.saveTurboConfig(updated);
    playClick();
    showToast(`Turbo pulse set to ${rateHz} Hz`);
  };

  const handleToggleTurboButton = (btnKey) => {
    const current = gamepadInfo.turbo || { enabled: false, rateHz: 20, buttons: {} };
    const updatedButtons = { ...current.buttons, [btnKey]: !current.buttons?.[btnKey] };
    const updated = { ...current, buttons: updatedButtons };
    gamepadService.saveTurboConfig(updated);
    playClick();
  };

  const handleTestMacro = (macro) => {
    playClick();
    gamepadService.executeMacro(macro);
    showToast(`Executed Macro: ${macro.name}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#0c1220] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Floating Notification */}
        {feedbackMsg && (
          <div className="absolute top-4 right-16 z-50 px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs shadow-glow-cyan flex items-center gap-2 animate-bounce">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-black text-white text-lg flex items-center gap-2">
                <span>Unified Emulator & Vault Settings</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Self-Contained
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Manage emulators on /Volumes/ROMS, graphics scaling, audio, BIOS, and search providers without leaving OmniVault.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSetupWizard && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSetupWizard();
                }}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Launch Initial Setup Wizard"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Run Setup Wizard</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 px-6 pt-3 bg-slate-950/60 border-b border-white/10 overflow-x-auto scrollbar-none">
          
          <button
            onClick={() => setActiveTab('emulators')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'emulators'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Emulators & Engines ({emulators.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('graphics')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'graphics'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4 text-violet-400" />
            <span>Graphics & Display</span>
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'audio'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-4 h-4 text-emerald-400" />
            <span>Audio & System</span>
          </button>

          <button
            onClick={() => setActiveTab('bios')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'bios'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>BIOS & Firmware Vault</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'storage'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span>Storage & Paths</span>
          </button>

          <button
            onClick={() => setActiveTab('themes')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'themes'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4 text-pink-400" />
            <span>AI Themes & Kodi UI</span>
          </button>

          <button
            onClick={() => setActiveTab('controller')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'controller'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4 text-emerald-400" />
            <span>Gamepad & Remapping</span>
          </button>

          <button
            onClick={() => setActiveTab('torznab')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'torznab'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span>Torznab Providers</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4 text-rose-400" />
            <span>Search Templates</span>
          </button>

        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto overscroll-contain flex-1 space-y-6">

          {/* ========================================================================= */}
          {/* TAB 1: EMULATORS & ENGINES */}
          {/* ========================================================================= */}
          {activeTab === 'emulators' && (
            <div className="space-y-6">
              
              {/* Top Action Bar */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/50 via-slate-900 to-slate-950 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">Self-Contained Portable Directory</span>
                    <span className="text-[10px] font-mono bg-cyan-900/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/40">
                      /Volumes/ROMS/Emulators
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    All emulators are housed exclusively on your ROMs drive — zero system pollution.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpenFolder('emulators')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold transition-all cursor-pointer"
                    title="Open /Volumes/ROMS/Emulators in Finder"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Open Folder</span>
                  </button>

                  <button
                    onClick={handleUpdateAll}
                    disabled={isUpdatingAll}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs transition-all shadow-glow-cyan cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingAll ? 'animate-spin' : ''}`} />
                    <span>{isUpdatingAll ? 'Updating All...' : 'Update All Emulators'}</span>
                  </button>
                </div>
              </div>

              {/* Emulators Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {emulators.map((emu) => {
                  const isInstalling = installingId === emu.id;
                  return (
                    <div
                      key={emu.id}
                      className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 transition-all flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h4 className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{emu.name}</span>
                              {emu.is_installed ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>v{emu.version || 'Installed'}</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-white/5">
                                  Not Installed
                                </span>
                              )}
                            </h4>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                              {emu.description}
                            </p>
                          </div>
                        </div>

                        {/* Supported Consoles Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(emu.consoles || []).map((c) => (
                            <span
                              key={c}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 font-mono"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Location & Action */}
                      <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                        <div className="text-[10px] font-mono text-slate-500 truncate max-w-[200px]" title={emu.path || '/Volumes/ROMS/Emulators'}>
                          {emu.path ? emu.path.split('/').pop() : 'Direct 1-Click Install'}
                        </div>

                        <button
                          onClick={() => handleInstallEmulator(emu.id, emu.name)}
                          disabled={isInstalling || isUpdatingAll}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                            emu.is_installed
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 hover:border-cyan-500/40'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-glow-emerald'
                          }`}
                        >
                          {isInstalling ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                              <span>Installing...</span>
                            </>
                          ) : emu.is_installed ? (
                            <>
                              <RefreshCw className="w-3 h-3 text-cyan-400" />
                              <span>Update</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              <span>Install (1-Click)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: UNIFIED GRAPHICS & DISPLAY */}
          {/* ========================================================================= */}
          {activeTab === 'graphics' && (
            <div className="space-y-6">
              
              <div className="p-4 rounded-2xl bg-violet-950/30 border border-violet-500/30 flex items-start gap-3">
                <Tv className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-slate-300">
                  <strong className="text-white block mb-0.5">Unified Hardware Rendering Engine:</strong>
                  Changes configured here automatically propagate to all native emulator config files (Dolphin GFX.ini, Vita3K config.yml, PCSX2.ini, melonDS.ini, and PPSSPP). You never need to edit configuration files manually.
                </div>
              </div>

              {/* Resolution Scaling */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Internal 3D Rendering Resolution Scale</span>
                  <span className="text-cyan-400 font-mono lowercase font-bold">{settings.emu_resolution_scale}</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {[
                    { val: '1x', label: '1x Native', desc: 'Authentic retro resolution' },
                    { val: '2x', label: '2x (720p)', desc: 'Crisp high-definition' },
                    { val: '3x', label: '3x (1080p)', desc: 'Retina / Full HD (Recommended)' },
                    { val: '4x', label: '4x (1440p)', desc: 'Quad HD 2K clarity' },
                    { val: '4k', label: '6x (4K UHD)', desc: 'Ultra-crisp Studio Display' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, emu_resolution_scale: opt.val }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.emu_resolution_scale === opt.val
                          ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-glow-cyan'
                          : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Aspect Ratio</span>
                  <span className="text-cyan-400 font-mono font-bold">{settings.emu_aspect_ratio}</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: 'Auto', label: 'Auto (Core Default)', desc: 'Game native aspect' },
                    { val: '4:3', label: '4:3 Standard CRT', desc: 'Classic square retro tube' },
                    { val: '16:9', label: '16:9 Widescreen', desc: 'Modern monitor widescreen' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, emu_aspect_ratio: opt.val }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.emu_aspect_ratio === opt.val
                          ? 'bg-violet-950/80 border-violet-400 text-white shadow-sm'
                          : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles (VSync, Fullscreen, Shaders) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs">V-Sync (Vertical Synchronization)</h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Locks frame rate to 60/120Hz display refresh to eliminate screen tearing.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, emu_vsync: s.emu_vsync === 'true' ? 'false' : 'true' }))}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.emu_vsync === 'true' ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.emu_vsync === 'true' ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs">Fullscreen on Launch</h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Automatically launch games in borderless fullscreen mode.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, emu_fullscreen: s.emu_fullscreen === 'true' ? 'false' : 'true' }))}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.emu_fullscreen === 'true' ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.emu_fullscreen === 'true' ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

              </div>

              {/* AI Neural Super-Resolution & De-Pixelizer */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>AI Neural Super-Resolution & De-Pixelizer</span>
                  </label>
                  <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                    Real-Time Edge Smoothing
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Eliminates jagged, blocky square pixels on modern 4K/OLED screens by interpolating vectors, neural textures, or authentic CRT phosphors.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {[
                    { val: 'xbrz_6x', label: 'xBRZ 6x Vector Smoothing', desc: 'Rounds pixel stairs into smooth, high-definition curves' },
                    { val: 'scalefx_ai', label: 'ScaleFX Neural Super-Res', desc: 'Neural edge-detection for hand-drawn sprite clarity' },
                    { val: 'crt_royale', label: 'Studio CRT-Royale Phosphor', desc: 'Aperture grille, scanlines, bloom & glass curvature' },
                    { val: 'fsr_edge', label: 'AMD FSR + 16x Anisotropic', desc: 'High-frequency edge clarity & oblique texture sharpening' },
                    { val: 'native_crisp', label: 'Raw 1x Pixel Matrix', desc: 'Unfiltered authentic retro square pixels' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, emu_ai_upscaling_mode: opt.val }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.emu_ai_upscaling_mode === opt.val
                          ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-glow-cyan'
                          : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        {settings.emu_ai_upscaling_mode === opt.val && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />}
                        <span>{opt.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Motion Smoothing & Latency Optimization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Motion Smoothing (60/120 FPS Interpolation)</span>
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Synthesizes intermediate frames to eliminate retro 20/30 FPS motion judder.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, emu_motion_smoothing: s.emu_motion_smoothing === 'true' ? 'false' : 'true' }))}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.emu_motion_smoothing === 'true' ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.emu_motion_smoothing === 'true' ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Run-Ahead 1-Frame Latency Elimination</span>
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">Strikes hardware input lag for instantaneous controller responsiveness.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, emu_runahead_lag: s.emu_runahead_lag === 'true' ? 'false' : 'true' }))}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.emu_runahead_lag === 'true' ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.emu_runahead_lag === 'true' ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>

              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-bold text-xs transition-all shadow-glow-emerald cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Writing Configs...' : 'Apply Graphics Settings'}</span>
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: AUDIO & SYSTEM */}
          {/* ========================================================================= */}
          {activeTab === 'audio' && (
            <div className="space-y-6">

              {/* Volume Slider */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span>Master Emulator Output Volume</span>
                  </label>
                  <span className="text-emerald-400 font-mono font-bold">{settings.emu_volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.emu_volume}
                  onChange={(e) => setSettings(s => ({ ...s, emu_volume: e.target.value }))}
                  className="w-full accent-emerald-400 h-2 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>

              {/* Audio Backend */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Audio Output Backend
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: 'CoreAudio', label: 'CoreAudio (Native Apple Silicon)', desc: 'Lowest latency & jitter-free' },
                    { val: 'SDL', label: 'SDL Audio', desc: 'Universal cross-platform' },
                    { val: 'OpenAL', label: 'OpenAL 3D', desc: 'Positional spatial audio' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, emu_audio_backend: opt.val }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.emu_audio_backend === opt.val
                          ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-sm'
                          : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Audio Super-Resolution & Bandwidth Extension (AudioSR) */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>AI Audio Super-Resolution & High-Definition Bandwidth Extension</span>
                  </label>
                  <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    AudioSR Neural Model
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Retro sound chips (NES, SNES, Genesis, PS1) were clamped to 8-bit/16-bit at 22kHz-32kHz, cutting off high frequencies. AI AudioSR synthesizes missing high-frequency harmonics (8kHz–24kHz) for modern studio-grade acoustics.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { val: 'audiosr_48k', label: 'AudioSR 48kHz Neural Bandwidth Extension', desc: 'Synthesizes missing high harmonics for crystal studio clarity & shimmering highs' },
                    { val: 'sinc_resampler', label: 'Hermite / Sinc Multi-Tap Resampler', desc: 'Replaces staircase digital audio waves with smooth analog curves, ending aliasing clicks' },
                    { val: 'msu1_lossless', label: 'MSU-1 Lossless CD Symphonic Audio', desc: 'Injects live uncompressed orchestral & acoustic studio recordings into 16-bit games' },
                    { val: 'hardware_dac', label: 'Authentic 8-Bit DAC Emulation', desc: 'Preserves raw vintage hardware characteristics and authentic chip warmth' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, emu_audio_upscaling: opt.val }))}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.emu_audio_upscaling === opt.val
                          ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-glow-emerald'
                          : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        {settings.emu_audio_upscaling === opt.val && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        <span>{opt.label}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Audio De-Noising & DAC De-Quantization */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>AI Audio De-Noising & DAC De-Quantization</span>
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Filters out electrical tape hiss, low-frequency hum, and 8-bit quantization crackle from vintage sound chips.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, emu_audio_denoise: s.emu_audio_denoise === 'true' ? 'false' : 'true' }))}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    settings.emu_audio_denoise === 'true' ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.emu_audio_denoise === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Portable Mode Card */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-white text-xs flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                    <span>Strict Portable Vault Mode</span>
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Forces all emulator save states, memory cards, and shaders to be written exclusively to /Volumes/ROMS.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-800">
                  Always Active
                </span>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-bold text-xs transition-all shadow-glow-emerald cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingSettings ? 'Saving...' : 'Save System Settings'}</span>
                </button>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: BIOS & FIRMWARE VAULT */}
          {/* ========================================================================= */}
          {activeTab === 'bios' && (
            <div className="space-y-6">

              {/* Header Card */}
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-white text-sm">System BIOS & Firmware Repository</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Monitors <span className="font-mono text-amber-300">/Volumes/ROMS/BIOS</span> for genuine console boot ROMs and encryption keys.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpenFolder('bios')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-semibold transition-all cursor-pointer"
                    title="Open /Volumes/ROMS/BIOS in Finder"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Open BIOS Folder</span>
                  </button>

                  <button
                    onClick={handleRefreshBios}
                    disabled={scanningBios}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${scanningBios ? 'animate-spin' : ''}`} />
                    <span>Audit Folder</span>
                  </button>
                </div>
              </div>

              {/* BIOS Items Cards */}
              <div className="space-y-3">
                {biosData && biosData.items && Object.entries(biosData.items).map(([key, item]) => {
                  const isPresent = item.present;
                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isPresent
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-slate-900/60 border-white/10'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-sm">{item.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5">
                            {item.system}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {item.status_note} • Target: <span className="font-mono text-slate-300">{item.target_spec}</span>
                        </p>
                        {isPresent && item.matched_files?.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Matched: {item.matched_files.join(', ')}</span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0">
                        {isPresent ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Verified Present</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenFolder('bios')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-600/40 text-xs font-bold transition-all cursor-pointer"
                            title="Drop files into /Volumes/ROMS/BIOS"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Drop in /BIOS</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: STORAGE & DIRECTORY ARCHITECTURE */}
          {/* ========================================================================= */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              {/* TOP HERO & MODE SELECTOR */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/20 to-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <HardDrive className="w-8 h-8 text-emerald-400 shrink-0 mt-0.5 drop-shadow-[0_0_10px_#10b981]" />
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <span>OmniVault Storage & Folder Architecture</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {storageMode === 'quick' ? '⚡ Quick Setup Active' : '🛠️ Custom Paths Active'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Configure where native Emulators, ROMs library, BIOS/Firmware, and Application Data are stored on your Mac or external SSD.
                    </p>
                  </div>
                </div>

                <div className="flex items-center p-1 rounded-xl bg-black/60 border border-white/10 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setStorageMode('quick');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      storageMode === 'quick'
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-black font-black shadow-glow-emerald'
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
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-black font-black shadow-glow-emerald'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Custom Folders</span>
                  </button>
                </div>
              </div>

              {/* QUICK SETUP MODE VIEW */}
              {storageMode === 'quick' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                        <Zap className="w-3.5 h-3.5" />
                        <span>DETECTED OPTIMAL DRIVE PRESET:</span>
                      </div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {storageConfig?.quick_defaults?.preset_label || 'Portable Drive (/Volumes/ROMS)'}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pre-configures all 4 core locations into a clean, portable structure. Zero setup friction.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyQuickSetup}
                      disabled={savingStorage}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 shrink-0 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${savingStorage ? 'animate-spin' : ''}`} />
                      <span>{savingStorage ? 'Provisioning...' : 'Re-apply Quick Setup Defaults'}</span>
                    </button>
                  </div>

                  {/* 4 PRE-PICKED LOCATIONS */}
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
                        {storageConfig?.directories?.emulators?.path || '/Volumes/ROMS/Emulators'}
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
                        {storageConfig?.directories?.roms?.path || '/Volumes/ROMS'}
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
                          <span>3. BIOS & System Firmware Folder</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                          Auto-Sync Active
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate select-all">
                        {storageConfig?.directories?.bios?.path || '/Volumes/ROMS/BIOS'}
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
                        {storageConfig?.directories?.app_data?.path || '/Volumes/ROMS/OmniVault-Data'}
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
                      Want to customize folder paths individually across multiple drives?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setStorageMode('custom');
                      }}
                      className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                    >
                      Switch to Custom Folder Setup →
                    </button>
                  </div>
                </div>
              )}

              {/* CUSTOM FOLDERS MODE VIEW */}
              {storageMode === 'custom' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* DETECTED VOLUMES QUICK-BAR */}
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

                  {/* 4 EDITABLE PATH INPUTS WITH NATIVE FINDER CHOOSER */}
                  <div className="space-y-3">
                    {/* 1. EMULATORS FOLDER */}
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-400" />
                          <span>1. Native Emulators Folder</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Where standalone macOS emulator apps & portable data reside
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customPaths.dir_emulators}
                          onChange={(e) => setCustomPaths({ ...customPaths, dir_emulators: e.target.value })}
                          placeholder="/Volumes/ROMS/Emulators"
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
                          title="Reveal in Finder"
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
                          placeholder="/Volumes/ROMS"
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
                          title="Reveal in Finder"
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
                          placeholder="/Volumes/ROMS/BIOS"
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
                          title="Reveal in Finder"
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
                          placeholder="/Volumes/ROMS/OmniVault-Data"
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
                          title="Reveal in Finder"
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
                          OmniVault macOS Application Bundle
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate max-w-md">
                          {storageConfig?.app_bundle?.path || '/Volumes/ROMS/OmniVault.app'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => revealStorageFolder('app_bundle')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 border border-white/10 cursor-pointer shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>Reveal App in Finder</span>
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
          {activeTab === 'torznab' && (
            <div className="space-y-6">
              
              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-slate-300">
                  <strong className="text-white block mb-0.5">Decoupled Open Architecture:</strong>
                  OmniVault operates like Kodi and Stremio — the core codebase is clean, neutral, and modular. You can connect your own personal, private Torznab endpoints (such as local <strong>Prowlarr</strong> or <strong>Jackett</strong> proxies) to query search results directly into the store.
                </div>
              </div>

              {/* Active Providers List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Configured Providers</span>
                  <span className="text-[11px] font-mono lowercase">{providers.filter(p => p.is_enabled).length} active</span>
                </h4>

                <div className="space-y-2.5">
                  {providers.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white truncate">
                            {p.name}
                          </span>
                          {p.is_builtin ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-950 text-violet-300 border border-violet-800">
                              Built-in Preservation
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                              Torznab Feed
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 font-mono truncate max-w-md">
                          {p.endpoint_url}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!p.is_builtin && (
                          <>
                            <button
                              onClick={() => handleToggleProvider(p.id)}
                              className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                p.is_enabled
                                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                                  : 'bg-slate-800 border-white/10 text-slate-500'
                              }`}
                              title={p.is_enabled ? "Disable Provider" : "Enable Provider"}
                            >
                              <Power className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteProvider(p.id)}
                              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-white/10 text-slate-400 transition-colors cursor-pointer"
                              title="Delete Provider"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {p.is_builtin && (
                          <span className="text-xs text-emerald-400 font-bold px-2 py-1 bg-emerald-950/40 rounded-lg border border-emerald-500/30">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Torznab Provider Form */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-cyan-400" />
                    <span>Add Custom Torznab Feed</span>
                  </h4>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setProvName('Local Prowlarr');
                        setProvUrl('http://localhost:9696/api/v1/search');
                      }}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                    >
                      Preset: Prowlarr
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProvName('Local Jackett');
                        setProvUrl('http://localhost:9117/api/v2.0/indexers/all/results/torznab/api');
                      }}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer"
                    >
                      Preset: Jackett
                    </button>
                  </div>
                </div>

                <form onSubmit={handleAddProvider} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">
                        Provider Display Name
                      </label>
                      <input
                        type="text"
                        value={provName}
                        onChange={(e) => setProvName(e.target.value)}
                        placeholder="e.g. My Prowlarr Indexer"
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">
                        API Key (optional)
                      </label>
                      <input
                        type="password"
                        value={provKey}
                        onChange={(e) => setProvKey(e.target.value)}
                        placeholder="Torznab API key"
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">
                      Torznab Endpoint Host URL
                    </label>
                    <input
                      type="text"
                      value={provUrl}
                      onChange={(e) => setProvUrl(e.target.value)}
                      placeholder="e.g. http://localhost:9696/api/v1/search"
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>

                  {formError && (
                    <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {testResult && (
                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      testResult.status === 'ok'
                        ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                    }`}>
                      {testResult.status === 'ok' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-cyan-400' : ''}`} />
                      <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold transition-all shadow-glow-cyan cursor-pointer"
                    >
                      Save Provider
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 6: WEB SEARCH TEMPLATES */}
          {/* ========================================================================= */}
          {activeTab === 'templates' && (
            <div className="space-y-6">

              <div className="p-4 rounded-2xl bg-violet-950/30 border border-violet-500/30 flex items-start gap-3">
                <Globe className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-slate-300">
                  <strong className="text-white block mb-0.5">External Search Templates:</strong>
                  Allows OmniVault to generate 1-click external web lookups on archive hubs or torrent trackers whenever a game is missing from the local library.
                </div>
              </div>

              {/* Templates List */}
              <div className="space-y-2.5">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-4 hover:border-white/20 transition-all"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white truncate">
                          {t.name}
                        </span>
                        {t.is_builtin && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-950 text-violet-300 border border-violet-800">
                            Built-in
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate max-w-lg">
                        {t.url_template}
                      </div>
                    </div>

                    {!t.is_builtin && (
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-white/10 text-slate-400 transition-colors cursor-pointer shrink-0"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Template Form */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-violet-400" />
                  <span>Add Search URL Template</span>
                </h4>

                <form onSubmit={handleAddTemplate} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">
                        Template Name
                      </label>
                      <input
                        type="text"
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value)}
                        placeholder="e.g. My Custom Tracker"
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">
                        Short Description
                      </label>
                      <input
                        type="text"
                        value={tplDesc}
                        onChange={(e) => setTplDesc(e.target.value)}
                        placeholder="e.g. Searches retro games tracker"
                        className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">
                      URL Template (Must include <span className="font-mono text-cyan-400">{'{title}'}</span>)
                    </label>
                    <input
                      type="text"
                      value={tplUrl}
                      onChange={(e) => setTplUrl(e.target.value)}
                      placeholder="e.g. https://mytracker.org/search?q={title}+rom"
                      className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400 font-mono"
                    />
                  </div>

                  {tplError && (
                    <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{tplError}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-glow-violet cursor-pointer"
                    >
                      Save Template
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: AI THEMES & KODI LIVING ROOM UI */}
          {/* ========================================================================= */}
          {activeTab === 'themes' && (
            <div className="space-y-6">

              {/* 10-Foot Living Room Mode Switch Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-violet-950/40 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shrink-0">
                    <Tv className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white text-sm">Kodi / XBMC 10-Foot Living Room Interface</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isKodiMode ? 'bg-cyan-500 text-black shadow-glow-cyan' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {isKodiMode ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 max-w-xl">
                      Experience a full console dashboard with oversized horizontal coverflow carousel, dynamic console ambient lighting (PlayStation midnight, Nintendo scarlet, Xbox emerald), digital clock, and gamepad navigation.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    playClick();
                    toggleKodiMode();
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                    isKodiMode
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-glow-cyan'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10'
                  }`}
                >
                  <Tv className="w-4 h-4" />
                  <span>{isKodiMode ? 'Switch to Classic Desktop' : 'Switch to Kodi Cinema View'}</span>
                </button>
              </div>

              {/* AI Theme Studio Generator */}
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-pink-400" />
                    <span>AI Theme Studio & Custom Palette Synthesizer</span>
                  </h4>
                  <span className="text-[10px] font-mono text-pink-400/80 bg-pink-950/40 px-2 py-0.5 rounded border border-pink-500/30">
                    Deterministic Neural Synthesizer
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Describe any visual aesthetic, console heritage, or custom vibe. The AI will synthesize a complete harmonious color system, glow accents, and background ambiance.
                </p>

                <form onSubmit={handleGenerateAI} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiThemePrompt}
                      onChange={(e) => setAiThemePrompt(e.target.value)}
                      placeholder="e.g. Vaporwave sunset neon pink and cyan, Sega Saturn dark metallic cobalt, or Game Boy DMG matrix green"
                      className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-pink-400"
                    />
                    <button
                      type="submit"
                      disabled={isGeneratingTheme || !aiThemePrompt.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-lg cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-4 h-4 ${isGeneratingTheme ? 'animate-spin' : ''}`} />
                      <span>{isGeneratingTheme ? 'Synthesizing...' : 'Generate Theme'}</span>
                    </button>
                  </div>
                </form>

                {/* AI Theme Preview Banner */}
                {previewTheme && (
                  <div className="p-4 rounded-xl border border-pink-500/40 bg-pink-950/20 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{previewTheme.name}</span>
                          <span className="text-[10px] font-mono bg-pink-900/50 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/30">
                            {previewTheme.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{previewTheme.description}</p>
                      </div>

                      <button
                        onClick={handleApplySaveAITheme}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 text-black font-bold text-xs transition-all shadow-glow-pink cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Apply & Save to Vault</span>
                      </button>
                    </div>

                    {/* Color Swatches */}
                    <div className="flex items-center gap-3 pt-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <span className="w-5 h-5 rounded-lg border border-white/20 shadow-sm" style={{ backgroundColor: previewTheme.theme_data.accent }} />
                        <span>Accent: <code className="text-white font-mono">{previewTheme.theme_data.accent}</code></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <span className="w-5 h-5 rounded-lg border border-white/20 shadow-sm" style={{ backgroundColor: previewTheme.theme_data.accentSecondary }} />
                        <span>Secondary: <code className="text-white font-mono">{previewTheme.theme_data.accentSecondary}</code></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <span className="w-5 h-5 rounded-lg border border-white/20 shadow-sm" style={{ backgroundColor: previewTheme.theme_data.bgBase }} />
                        <span>Base: <code className="text-white font-mono">{previewTheme.theme_data.bgBase}</code></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                        <span className="w-5 h-5 rounded-lg border border-white/20 shadow-sm" style={{ backgroundColor: previewTheme.theme_data.bgCard }} />
                        <span>Card: <code className="text-white font-mono">{previewTheme.theme_data.bgCard}</code></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Theme Presets & Custom Library */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Available Theme Presets & Vault Skins ({themesList.length})</span>
                  <span className="text-[11px] text-slate-500 font-normal">Active Theme: <strong className="text-cyan-400">{currentTheme?.name || 'Kodi Hybrid'}</strong></span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {themesList.map((t) => {
                    const isActive = currentTheme?.id === t.id;
                    const data = t.theme_data || {};
                    return (
                      <div
                        key={t.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                          isActive
                            ? 'bg-slate-900 border-cyan-500/80 shadow-glow-cyan'
                            : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-white">{t.name}</span>
                              {t.is_builtin ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                  Preset
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-pink-950 text-pink-300 border border-pink-800">
                                  AI Created
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>
                          </div>

                          {!t.is_builtin && (
                            <button
                              onClick={() => handleDeleteCustomTheme(t.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Delete custom theme"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Swatches & Activation Button */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: data.accent || '#00d2ff' }} title="Accent" />
                            <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: data.accentSecondary || '#0ea5e9' }} title="Secondary" />
                            <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: data.bgBase || '#070c16' }} title="Base" />
                          </div>

                          {isActive ? (
                            <div className="flex items-center gap-1 text-xs font-bold text-cyan-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Active</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                playClick();
                                selectTheme(t.id);
                              }}
                              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: GAMEPAD & BUTTON REMAPPING */}
          {/* ========================================================================= */}
          {activeTab === 'controller' && (
            <div className="space-y-6">

              {/* Gamepad Telemetry & Guide Button Status */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 border border-emerald-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-2xl border shrink-0 ${
                      gamepadInfo.connected 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-glow-emerald' 
                        : 'bg-slate-800 text-slate-500 border-white/10'
                    }`}>
                      <Gamepad2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white text-base">
                          {gamepadInfo.connected ? gamepadInfo.name : 'No Gamepad Detected'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          gamepadInfo.connected 
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {gamepadInfo.connected ? 'Plug & Play Active' : 'Waiting for Input'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {gamepadInfo.connected 
                          ? 'Standard Web Gamepad API polling active at 60fps with zero-lag deadzone filtering.' 
                          : 'Connect a PlayStation DualSense/DualShock, Xbox Wireless, Nintendo Switch Pro, or 8BitDo controller and press any button.'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleResetMapping}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer shrink-0"
                    title="Reset buttons to default standard layout"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                {/* Quick Menu Trigger Information Banner */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded-md bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono font-bold text-[10px]">
                      GUIDE TRIGGER
                    </span>
                    <span className="text-slate-300">
                      Universal In-Game Overlay opens via: <strong className="text-white">PS Home (Btn 16)</strong>, <strong className="text-white">Xbox Guide</strong>, <strong className="text-white">Select+Start combo</strong>, or <strong className="text-cyan-400">F1 / Esc</strong>.
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                    <Check className="w-3.5 h-3.5" />
                    <span>Always Listening</span>
                  </span>
                </div>
              </div>

              {/* Hardware Turbo Auto-Fire Engine */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-orange-950/40 border border-amber-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-2xl border shrink-0 ${
                      gamepadInfo.turbo?.enabled 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-glow-amber' 
                        : 'bg-slate-800 text-slate-500 border-white/10'
                    }`}>
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white text-base">Hardware Turbo & Rapid-Fire Engine</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          gamepadInfo.turbo?.enabled 
                            ? 'bg-amber-950 text-amber-300 border border-amber-700' 
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {gamepadInfo.turbo?.enabled ? 'Active (Auto-Pulsing)' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Synthesizes ultra-fast micro-pulses when designated buttons are held. Fully synced to internal WebAssembly cores and RetroArch.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleToggleTurboGlobal}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      gamepadInfo.turbo?.enabled
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-glow-amber'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10'
                    }`}
                  >
                    {gamepadInfo.turbo?.enabled ? 'Turbo Enabled' : 'Enable Turbo'}
                  </button>
                </div>

                {/* Turbo Rate & Button Assignment */}
                <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-2">
                      Pulse Frequency: <strong className="text-amber-400">{gamepadInfo.turbo?.rateHz || 20} Hz</strong> ({Math.round(1000 / (gamepadInfo.turbo?.rateHz || 20))}ms period)
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[10, 15, 20, 30].map((hz) => (
                        <button
                          key={hz}
                          onClick={() => handleSetTurboRate(hz)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                            (gamepadInfo.turbo?.rateHz || 20) === hz
                              ? 'bg-amber-500/30 text-amber-300 border border-amber-500/60'
                              : 'bg-slate-950 text-slate-400 border border-white/5 hover:text-white'
                          }`}
                        >
                          {hz}Hz {hz === 20 ? '(Standard)' : hz === 30 ? '(Max)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-2">
                      Rapid-Fire Button Assignments
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'confirm', label: 'A / Cross' },
                        { key: 'cancel', label: 'B / Circle' },
                        { key: 'favorite', label: 'X / Square' },
                        { key: 'details', label: 'Y / Triangle' },
                        { key: 'triggerRight', label: 'R2 / RT' },
                        { key: 'triggerLeft', label: 'L2 / LT' }
                      ].map((btn) => {
                        const isBtnActive = gamepadInfo.turbo?.buttons?.[btn.key];
                        return (
                          <button
                            key={btn.key}
                            onClick={() => handleToggleTurboButton(btn.key)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isBtnActive
                                ? 'bg-amber-500 text-black font-bold shadow-glow-amber'
                                : 'bg-slate-950 text-slate-400 border border-white/5 hover:border-white/20'
                            }`}
                          >
                            <Zap className={`w-3 h-3 ${isBtnActive ? 'text-black' : 'text-slate-500'}`} />
                            <span>{btn.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Macro & Combo Sequencer */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40 shrink-0">
                      <FastForward className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base flex items-center gap-2">
                        <span>Universal Macro & Combo Sequencer</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                          {gamepadInfo.macros?.length || 2} Slots Configured
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Executes multi-button fighting game combos and rapid bursts instantly with zero-frame input delay.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {(gamepadInfo.macros || []).map((macro) => (
                    <div
                      key={macro.id}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-purple-500/20 hover:border-purple-500/40 transition-all flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-white text-xs">{macro.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-900/40 text-purple-300 border border-purple-700/50">
                            {macro.triggerLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mb-2">{macro.description}</p>
                        
                        {macro.steps && (
                          <div className="flex items-center gap-1.5">
                            {macro.steps.map((st, i) => (
                              <React.Fragment key={i}>
                                <span className="px-2 py-0.5 rounded bg-slate-900 text-purple-300 text-[10px] font-mono border border-purple-500/30">
                                  {st.replace('NAV_', '')}
                                </span>
                                {i < macro.steps.length - 1 && (
                                  <span className="text-slate-600 text-xs">→</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                        <button
                          onClick={() => handleTestMacro(macro)}
                          disabled={gamepadInfo.activeMacroRunning}
                          className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-glow-purple transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <FastForward className="w-3 h-3" />
                          <span>{gamepadInfo.activeMacroRunning ? 'Executing...' : 'Test Sequence'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remap Prompt Notice (when listening) */}
              {remappingAction && (
                <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-500/60 text-amber-200 text-xs flex items-center justify-between gap-4 animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <strong>Remapping Action: "{remappingAction}"</strong>
                      <p className="text-slate-300 text-[11px]">Press the physical button on your controller that you wish to assign now...</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelRemapping}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Button Remapping Table */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span>Custom Button Remapping Matrix</span>
                  </h4>
                  <span className="text-xs text-slate-400">
                    Saved to local persistent vault config
                  </span>
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'confirm', label: 'Confirm / Launch Game', defaultBtn: 'A / Cross' },
                    { key: 'cancel', label: 'Cancel / Back / Close', defaultBtn: 'B / Circle' },
                    { key: 'favorite', label: 'Toggle Favorite', defaultBtn: 'X / Square' },
                    { key: 'details', label: 'Game Info / Cheats Quick Deck', defaultBtn: 'Y / Triangle' },
                    { key: 'prevTab', label: 'Previous Category / Tab', defaultBtn: 'L1 / LB' },
                    { key: 'nextTab', label: 'Next Category / Tab', defaultBtn: 'R1 / RB' },
                    { key: 'toggleMode', label: 'Switch Kodi Cinema / Desktop UI', defaultBtn: 'Select / Share' },
                    { key: 'start', label: 'Start / Open Primary Menu', defaultBtn: 'Start / Menu' },
                    { key: 'guideHome', label: 'Quick Menu In-Game Overlay', defaultBtn: 'PS / Xbox Guide (16)' },
                    { key: 'dpadUp', label: 'Navigate Up', defaultBtn: 'D-Pad Up' },
                    { key: 'dpadDown', label: 'Navigate Down', defaultBtn: 'D-Pad Down' },
                    { key: 'dpadLeft', label: 'Navigate Left', defaultBtn: 'D-Pad Left' },
                    { key: 'dpadRight', label: 'Navigate Right', defaultBtn: 'D-Pad Right' }
                  ].map((act) => {
                    const currentBtnIdx = gamepadInfo.mapping?.[act.key] ?? DEFAULT_MAPPING[act.key];
                    const btnLabel = BUTTON_NAMES[currentBtnIdx] || `Button ${currentBtnIdx}`;
                    const isListening = remappingAction === act.key;

                    return (
                      <div
                        key={act.key}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                          isListening
                            ? 'bg-amber-950/40 border-amber-500'
                            : 'bg-slate-950/60 border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-white">{act.label}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Action ID: {act.key}</div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${
                            isListening
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                              : 'bg-slate-900 text-cyan-300 border-cyan-500/30'
                          }`}>
                            {isListening ? 'Press Button...' : btnLabel}
                          </span>

                          <button
                            onClick={() => handleStartRemapping(act.key)}
                            disabled={remappingAction !== null}
                            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Remap
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
