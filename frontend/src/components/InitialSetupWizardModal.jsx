import React, { useState, useEffect } from 'react';
import {
  Check, CheckCircle2, FolderOpen, HardDrive, Sparkles, Sliders,
  ArrowRight, ArrowLeft, RefreshCw, X, Zap, Database, Disc, ExternalLink, Cloud
} from 'lucide-react';
import {
  completeSetup, fetchStorageConfig, saveStorageConfig,
  applyQuickSetup, browseDirectory, revealStorageFolder,
  fetchCloudTargets, saveCloudTargets
} from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

export default function InitialSetupWizardModal({ isOpen, onClose, onFinish, initialStep = 1, totalGames = 0 }) {
  const [currentStep, setCurrentStep] = useState(initialStep || 1);
  const totalSteps = 2;

  useEffect(() => {
    if (initialStep) {
      setCurrentStep(initialStep <= 2 ? initialStep : 1);
    }
  }, [initialStep]);

  const [storageConfig, setStorageConfig] = useState(null);
  const [storageMode, setStorageMode] = useState('quick'); // 'quick' | 'custom'
  const [cloudTargets, setCloudTargets] = useState({ default_target: 'local', targets: [] });
  const [customPaths, setCustomPaths] = useState({
    dir_roms: '/Volumes/ROMS',
    dir_app_data: '/Volumes/ROMS/OmniVault-Data'
  });
  const [savingStorage, setSavingStorage] = useState(false);
  const [storageFeedback, setStorageFeedback] = useState(null);
  const [browsingField, setBrowsingField] = useState(null);
  const [isFinishing, setIsFinishing] = useState(false);

  const loadData = async () => {
    try {
      const [storageRes, cloudRes] = await Promise.all([
        fetchStorageConfig().catch(() => null),
        fetchCloudTargets().catch(() => null),
      ]);
      if (cloudRes) {
        setCloudTargets(cloudRes);
      }
      if (storageRes) {
        setStorageConfig(storageRes);
        setStorageMode(storageRes.mode || 'quick');
        setCustomPaths({
          dir_roms: storageRes.directories?.roms?.path || storageRes.quick_defaults?.dir_roms || '/Volumes/ROMS',
          dir_app_data: storageRes.directories?.app_data?.path || storageRes.quick_defaults?.dir_app_data || '/Volumes/ROMS/OmniVault-Data'
        });
      }
    } catch (err) {
      console.error('[SetupWizard Load Error]:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBrowseFolder = async (fieldKey, currentPath) => {
    playClick();
    setBrowsingField(fieldKey);
    try {
      const res = await browseDirectory(currentPath);
      if (!res.canceled && res.path) {
        setCustomPaths(prev => ({ ...prev, [fieldKey]: res.path }));
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
        dir_app_data: res.config.directories?.app_data?.path || '',
      });
      setStorageFeedback('Quick Setup applied! Download and catalog folders are ready.');
      setTimeout(() => setStorageFeedback(null), 4000);
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
        dir_app_data: customPaths.dir_app_data,
      });
      playVictorySound();
      setStorageConfig(res.config);
      setStorageMode('custom');
      setStorageFeedback('Custom download locations saved and verified!');
      setTimeout(() => setStorageFeedback(null), 4000);
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
      dir_app_data: `${cleanVol}${sep}OmniVault-Data`,
    });
  };

  const handleFinishWizard = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    playVictorySound();
    try {
      localStorage.setItem('omnivault_initial_setup_completed', 'true');
      await completeSetup({
        storage_setup_mode: storageMode,
        storage: {
          mode: storageMode,
          dir_roms: customPaths.dir_roms,
          dir_app_data: customPaths.dir_app_data,
        }
      });
    } catch (e) {
      console.warn('Could not complete setup via API:', e);
    } finally {
      setIsFinishing(false);
      if (onFinish) onFinish();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-2.5 sm:p-4 select-none">
      <div className="relative w-full max-w-3xl h-[calc(100dvh-1.5rem)] sm:h-auto max-h-[820px] bg-slate-950/95 border border-cyan-500/30 rounded-3xl shadow-[0_0_50px_rgba(0,210,255,0.25)] flex flex-col overflow-hidden text-slate-200">

        {/* Header */}
        <div className="px-4 sm:px-8 py-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <img src="/vault.svg" alt="OmniVault" className="w-9 h-9 object-contain drop-shadow-[0_0_12px_#00f0ff]" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-xl text-white tracking-wider">OMNIVAULT</span>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Quick Setup
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                ROM Finder & Download Manager • Step {currentStep} of {totalSteps}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Skip Setup (Can be reopened anytime from Settings)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-8 py-3 bg-black/40 border-b border-white/5 flex items-center gap-3">
          {[
            { num: 1, label: '1. Download & Storage Folders' },
            { num: 2, label: '2. Ready to Find & Download' }
          ].map((s) => (
            <div
              key={s.num}
              onClick={() => { playClick(); setCurrentStep(s.num); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                currentStep === s.num
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black shadow-glow-cyan'
                  : currentStep > s.num
                    ? 'bg-slate-900 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-900/50 text-slate-500 border border-white/5'
              }`}
            >
              {currentStep > s.num ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span>{s.num}</span>}
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {currentStep === 1 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-slate-900 border border-cyan-500/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <HardDrive className="w-7 h-7 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="text-base font-black text-white">Download Destination & Storage</h2>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Choose where OmniVault saves downloaded ROM files and stores its catalog metadata & cover cache.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center p-1 rounded-xl bg-black/60 border border-white/10 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => { playClick(); setStorageMode('quick'); }}
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
                      onClick={() => { playClick(); setStorageMode('custom'); }}
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
                  <div className="mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{storageFeedback}</span>
                  </div>
                )}
              </div>

              {storageMode === 'quick' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-mono text-cyan-400">AUTO-DETECTED PRESET</div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {storageConfig?.quick_defaults?.preset_label || 'Auto-Detected Vault Storage'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyQuickSetup}
                      disabled={savingStorage}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${savingStorage ? 'animate-spin' : ''}`} />
                      <span>{savingStorage ? 'Provisioning...' : 'Apply Quick Defaults'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <Disc className="w-4 h-4 text-emerald-400" />
                          <span>1. ROMs & Downloads Folder</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {storageConfig?.directories?.roms?.free_gb || 0} GB Free
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate">
                        {storageConfig?.directories?.roms?.path || customPaths.dir_roms}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Organized per platform</span>
                        <button
                          type="button"
                          onClick={() => revealStorageFolder('roms')}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" /> Reveal
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                          <Database className="w-4 h-4 text-violet-400" />
                          <span>2. Catalog & Cache Data</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-950 text-violet-400 border border-violet-800">
                          {totalGames > 0 ? `${totalGames.toLocaleString()} Titles` : 'Catalog Ready'}
                        </span>
                      </div>
                      <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5 font-mono text-xs text-slate-200 truncate">
                        {storageConfig?.directories?.app_data?.path || customPaths.dir_app_data}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>vault.db & artwork cache</span>
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
                </div>
              )}

              {storageMode === 'custom' && (
                <div className="space-y-4">
                  {storageConfig?.detected_volumes && storageConfig.detected_volumes.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/10 space-y-2">
                      <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                        Quick Drive Presets:
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {storageConfig.detected_volumes.map((vol) => (
                          <button
                            key={vol.path}
                            type="button"
                            onClick={() => handleSelectVolumePreset(vol.path)}
                            className="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/50 text-xs font-mono font-bold text-slate-200 hover:text-cyan-300 flex items-center gap-2 transition-all cursor-pointer"
                          >
                            <span>{vol.name}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400">
                              {vol.free_gb} GB Free
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Disc className="w-4 h-4 text-emerald-400" />
                      <span>ROMs & Downloads Folder</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customPaths.dir_roms}
                        onChange={(e) => setCustomPaths({ ...customPaths, dir_roms: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleBrowseFolder('dir_roms', customPaths.dir_roms)}
                        disabled={browsingField === 'dir_roms'}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>{browsingField === 'dir_roms' ? 'Selecting...' : 'Browse...'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => revealStorageFolder('roms', customPaths.dir_roms)}
                        className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Database className="w-4 h-4 text-violet-400" />
                      <span>OmniVault Data & Cache Folder</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customPaths.dir_app_data}
                        onChange={(e) => setCustomPaths({ ...customPaths, dir_app_data: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleBrowseFolder('dir_app_data', customPaths.dir_app_data)}
                        disabled={browsingField === 'dir_app_data'}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-violet-300 border border-violet-500/30 flex items-center gap-1.5 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>{browsingField === 'dir_app_data' ? 'Selecting...' : 'Browse...'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => revealStorageFolder('app_data', customPaths.dir_app_data)}
                        className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-300 border border-white/10 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveCustomStorage}
                      disabled={savingStorage}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-bold cursor-pointer"
                    >
                      {savingStorage ? 'Saving...' : 'Verify & Save Paths'}
                    </button>
                  </div>
                </div>
              )}

              {/* Cloud Drive Quick Destination Picker */}
              {cloudTargets.targets?.some((t) => t.available) && (
                <div className="p-4 rounded-2xl bg-sky-950/20 border border-sky-500/30 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-sky-400" />
                      <span>Cloud Drive Direct Destination (Optional Default)</span>
                    </div>
                    <span className="text-[10px] font-mono text-sky-300">
                      Save straight to iCloud / Google Drive / OneDrive
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { id: 'local', name: 'Local Drive', available: true },
                      ...(cloudTargets.targets || []).filter((t) => t.available),
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={async () => {
                          playClick();
                          try {
                            const updated = await saveCloudTargets({ default_target: opt.id });
                            setCloudTargets(updated);
                            setStorageFeedback(`Default download destination set to ${opt.name}.`);
                          } catch {}
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          cloudTargets.default_target === opt.id
                            ? 'bg-sky-500 text-black border-sky-400 shadow-glow-cyan'
                            : 'bg-slate-900 text-slate-300 border-white/10 hover:border-sky-400/50'
                        }`}
                      >
                        {opt.id === 'local' ? <HardDrive className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
                        <span>{opt.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5 animate-fadeIn py-4 text-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/40 flex items-center justify-center mx-auto shadow-glow-cyan">
                <Sparkles className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-black text-white font-display">
                Ready to Find & Download ROMs
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                {totalGames > 0
                  ? `Your ${totalGames.toLocaleString()}-title catalog, multi-source mirror finder, sequential download queue, checksum verifier, and CHD/RVZ compressor are ready.`
                  : 'Your catalog, multi-source mirror finder, sequential download queue, checksum verifier, and CHD/RVZ compressor are ready.'}
              </p>
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 text-left space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Download Directory:</span>
                  <span className="font-mono text-emerald-300 truncate max-w-[260px]">{customPaths.dir_roms}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">App Data Directory:</span>
                  <span className="font-mono text-violet-300 truncate max-w-[260px]">{customPaths.dir_app_data}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Custom Indexers (BYOS):</span>
                  <span className="text-cyan-300">Configurable anytime in Settings</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-white/10 bg-slate-900/70 flex items-center justify-between shrink-0">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => { playClick(); setCurrentStep(1); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < totalSteps ? (
            <button
              type="button"
              onClick={() => { playClick(); setCurrentStep(2); }}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs shadow-glow-cyan cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishWizard}
              disabled={isFinishing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-black font-black text-xs shadow-glow-cyan cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isFinishing ? 'Saving...' : 'Start Finding ROMs'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
