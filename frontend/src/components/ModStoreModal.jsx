import React, { useState, useEffect } from 'react';
import { 
  Puzzle, X, Search, Sparkles, Filter, CheckCircle2, ShieldCheck,
  Layers, Download, Upload, Zap, Globe, Tv, RefreshCw, Power,
  ArrowRight, Heart, Tag, Info, Check, AlertCircle, FileCode2,
  Wand2, Cpu, ExternalLink, Terminal
} from 'lucide-react';
import { 
  fetchModsCatalog, toggleGameMod, uploadCustomPatch, 
  scrapeCommunityMods, autoInstallCommunityMod, 
  aiGenerateMod, generateEmulatorPatches 
} from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

export default function ModStoreModal({ isOpen, onClose, selectedGame = null }) {
  // Main view tabs: 'storefront' | 'community' | 'studio' | 'emulator'
  const [activeHubTab, setActiveHubTab] = useState('storefront');

  // Tab 1: Storefront State
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [togglingId, setTogglingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Tab 2: Community Web Scraper State
  const [communityQuery, setCommunityQuery] = useState(selectedGame?.title || 'Super Mario World');
  const [communityPlatform, setCommunityPlatform] = useState(selectedGame?.platform || 'SNES');
  const [communityResults, setCommunityResults] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [installingCommId, setInstallingCommId] = useState(null);

  // Tab 3: OmniAI Mod Studio State
  const [aiTargetGame, setAiTargetGame] = useState(selectedGame?.title || 'Chrono Trigger');
  const [aiPlatform, setAiPlatform] = useState(selectedGame?.platform || 'SNES');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [lastSynthesized, setLastSynthesized] = useState(null);

  // Tab 4: Standalone Emulator Patch Generator State
  const [emuTitle, setEmuTitle] = useState(selectedGame?.title || 'Chrono Trigger');
  const [emuPlatform, setEmuPlatform] = useState(selectedGame?.platform || 'SNES');
  const [emuGameId, setEmuGameId] = useState('SLUS-20911');
  const [emuCrc, setEmuCrc] = useState('5B326A18');
  const [emuCustomCodes, setEmuCustomCodes] = useState('');
  const [emuResult, setEmuResult] = useState(null);
  const [isGeneratingEmu, setIsGeneratingEmu] = useState(false);

  // Upload Custom Mod State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadGameTitle, setUploadGameTitle] = useState(selectedGame?.title || '');
  const [uploadGameId, setUploadGameId] = useState(selectedGame?.id || 'custom-game');
  const [uploadPlatform, setUploadPlatform] = useState(selectedGame?.platform || 'SNES');
  const [uploadModTitle, setUploadModTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('romhack');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCatalog();
      if (activeHubTab === 'community' && communityResults.length === 0) {
        handleSearchCommunity();
      }
    }
  }, [isOpen, activeHubTab]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await fetchModsCatalog();
      setMods(data.mods || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleToggle = async (mod) => {
    const nextState = !mod.is_enabled;
    setTogglingId(mod.id);
    playClick();

    try {
      const res = await toggleGameMod(mod.id, nextState);
      setMods(prev => prev.map(m => m.id === mod.id ? { ...m, is_enabled: nextState ? 1 : 0 } : m));
      playVictorySound();
      showToast(nextState 
        ? `⚡ Enabled "${mod.mod_title}" (Shadow patch mounted)`
        : `Restored vanilla ROM for "${mod.game_title}"`
      );
    } catch (e) {
      alert(`Error toggling mod: ${e.message}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleSearchCommunity = async (e) => {
    if (e) e.preventDefault();
    if (!communityQuery.trim()) return;
    setCommunityLoading(true);
    try {
      const res = await scrapeCommunityMods(communityQuery.trim(), communityPlatform);
      setCommunityResults(res.results || []);
    } catch (e) {
      alert(`Community scraper error: ${e.message}`);
    } finally {
      setCommunityLoading(false);
    }
  };

  const handleAutoInstallCommunity = async (commHack) => {
    setInstallingCommId(commHack.id);
    playClick();
    try {
      const payload = {
        mod_id: commHack.id,
        game_id: commHack.id.replace('hack_', ''),
        game_title: commHack.game_title,
        platform: commHack.platform,
        mod_title: commHack.title,
        category: commHack.category,
        download_url: commHack.download_url,
        author: commHack.author,
        version: commHack.version,
        patch_format: commHack.format || 'ips'
      };
      const res = await autoInstallCommunityMod(payload);
      playVictorySound();
      if (res.status === 'registered_metadata') {
        showToast(res.message || `Registered "${commHack.title}". Import its .ips/.bps file to enable.`);
      } else {
        showToast(`Downloaded & Verified "${commHack.title}"! Added to Storefront.`);
      }
      loadCatalog();
    } catch (e) {
      alert(`Auto-install failed: ${e.message}`);
    } finally {
      setInstallingCommId(null);
    }
  };

  const handleSynthesizeMod = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setIsSynthesizing(true);
    setLastSynthesized(null);
    playClick();
    try {
      const res = await aiGenerateMod({
        game_id: aiTargetGame.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        game_title: aiTargetGame.trim(),
        platform: aiPlatform,
        prompt: aiPrompt.trim()
      });
      setLastSynthesized(res);
      playVictorySound();
      showToast(`OmniAI Synthesized "${res.title}"!`);
      loadCatalog();
    } catch (e) {
      alert(`AI Synthesis failed: ${e.message}`);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleGenerateEmuPatches = async () => {
    setIsGeneratingEmu(true);
    setEmuResult(null);
    playClick();
    try {
      const parsedPatches = emuCustomCodes
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const parts = line.split(/\s+/);
          const [addr, val] = (parts[0] || '').includes('=')
            ? parts[0].split('=')
            : [parts[0], parts[1]];
          const name = parts.slice((parts[0] || '').includes('=') ? 1 : 2).join(' ') || `Custom Patch #${idx + 1}`;
          return { addr: (addr || '').trim(), val: (val || '').trim(), name };
        })
        .filter(p => p.addr && p.val);

      const res = await generateEmulatorPatches({
        platform: emuPlatform,
        title: emuTitle,
        game_id: emuGameId,
        crc: emuCrc,
        patches: parsedPatches
      });
      setEmuResult(res);
      playVictorySound();
      showToast(`Injected native patch into ${emuPlatform} emulator!`);
    } catch (e) {
      alert(`Failed to inject patch: ${e.message}`);
    } finally {
      setIsGeneratingEmu(false);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile || !uploadModTitle.trim() || !uploadGameTitle.trim()) {
      alert("Game title, mod title, and patch file are required");
      return;
    }

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('game_id', uploadGameId);
      fd.append('game_title', uploadGameTitle.trim());
      fd.append('platform', uploadPlatform);
      fd.append('mod_title', uploadModTitle.trim());
      fd.append('category', uploadCategory);
      fd.append('author', uploadAuthor.trim() || 'Community');
      fd.append('description', uploadDesc.trim() || 'Custom user patch');
      fd.append('file', uploadFile);

      await uploadCustomPatch(fd);
      playVictorySound();
      showToast(`Custom patch "${uploadModTitle}" registered!`);
      setShowUploadModal(false);
      setUploadModTitle('');
      setUploadFile(null);
      loadCatalog();
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: 'All Mods & Patches', icon: Layers },
    { id: 'romhack', label: 'Total Conversions', icon: Sparkles },
    { id: 'translation', label: 'Translations', icon: Globe },
    { id: 'qol', label: 'Quality of Life', icon: Zap },
    { id: 'widescreen_60fps', label: 'Widescreen & 60 FPS', icon: Tv },
  ];

  const filteredMods = mods.filter(m => {
    const matchesCat = selectedCategory === 'all' || m.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || 
      m.mod_title.toLowerCase().includes(q) || 
      m.game_title.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q) ||
      m.author?.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#0b0f19] border border-cyan-500/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Floating Toast */}
        {toastMsg && (
          <div className="absolute top-4 right-16 z-50 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold text-xs shadow-glow-cyan flex items-center gap-2 animate-bounce">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Modal Top Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-950 via-[#0e172a] to-slate-950 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-glow-cyan">
              <Puzzle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-wide">
                  Mods, Romhacks & Enhancements Suite
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase font-mono">
                  OmniAI Powered
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated non-destructive patch toggling, live Romhacking.net community scraper, and OmniAI custom patch synthesizer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Custom Patch</span>
            </button>

            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 px-6 pt-3 bg-slate-950/80 border-b border-white/10 overflow-x-auto scrollbar-none text-xs font-bold">
          <button
            onClick={() => setActiveHubTab('storefront')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeHubTab === 'storefront'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Active Storefront ({mods.length})</span>
          </button>

          <button
            onClick={() => setActiveHubTab('community')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeHubTab === 'community'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4 text-purple-400" />
            <span>Community Web Scraper (Romhacking.net)</span>
          </button>

          <button
            onClick={() => setActiveHubTab('studio')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeHubTab === 'studio'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Wand2 className="w-4 h-4 text-emerald-400" />
            <span>OmniAI Mod Synthesizer</span>
          </button>

          <button
            onClick={() => setActiveHubTab('emulator')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeHubTab === 'emulator'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>Emulator Patch Injector (.pnach / Gecko)</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: ACTIVE STOREFRONT */}
        {/* ========================================================================= */}
        {activeHubTab === 'storefront' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Non-Destructive Guarantee Banner */}
            <div className="px-6 py-2.5 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 border-b border-white/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Zero ROM Corruption:</strong> Vanilla ROMs remain pristine on disk. Enabled mods create non-destructive shadow patches at <code>/Volumes/ROMS/.mod_cache</code>; disabling instantly reverts to vanilla state.
                </span>
              </div>
            </div>

            {/* Category Pills & Search */}
            <div className="px-6 py-3.5 bg-slate-950/70 border-b border-white/5 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full md:w-auto">
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-glow-cyan'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5 hover:border-white/15'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, game, author..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900/90 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Mods Grid */}
            <div className="p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                  <span className="text-xs">Loading Mod & Romhack Storefront...</span>
                </div>
              ) : filteredMods.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                  <Puzzle className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-300">No mods found matching your filter</p>
                  <p className="text-xs text-slate-500 mt-1">Check the Community Scraper tab or synthesize one with OmniAI.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMods.map((mod) => {
                    const isEnabled = mod.is_enabled === 1;
                    const isToggling = togglingId === mod.id;

                    const categoryColors = {
                      romhack: 'bg-purple-950/70 text-purple-300 border-purple-700/60',
                      translation: 'bg-blue-950/70 text-blue-300 border-blue-700/60',
                      qol: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60',
                      widescreen_60fps: 'bg-amber-950/70 text-amber-300 border-amber-700/60'
                    };

                    return (
                      <div
                        key={mod.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                          isEnabled
                            ? 'bg-gradient-to-br from-emerald-950/30 via-slate-900 to-cyan-950/20 border-emerald-500/50 shadow-glow-emerald'
                            : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-cyan-300 border border-cyan-800/60">
                                {mod.game_title} • {mod.platform}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${categoryColors[mod.category] || 'bg-slate-800 text-slate-300'}`}>
                                {mod.category.replace('_', ' ')}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-800 text-slate-400">
                                {mod.patch_format}
                              </span>
                            </div>

                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                              isEnabled
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                : 'bg-slate-950 text-slate-500 border border-white/5'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                              <span>{isEnabled ? 'Active' : 'Vanilla'}</span>
                            </span>
                          </div>

                          <h3 className="font-bold text-white text-sm mb-1 leading-snug">
                            {mod.mod_title}
                          </h3>
                          <div className="text-[11px] text-slate-400 mb-2 flex items-center gap-2">
                            <span>By <strong className="text-slate-300">{mod.author || 'Community'}</strong></span>
                            {mod.version && <span>• {mod.version}</span>}
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                            {mod.description}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-slate-400">
                            {isEnabled ? (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>Patch mounted on next play</span>
                              </span>
                            ) : (
                              <span className="text-slate-500">Clean original ROM</span>
                            )}
                          </div>

                          <button
                            onClick={() => handleToggle(mod)}
                            disabled={isToggling}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-50 ${
                              isEnabled
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-glow-emerald'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 hover:border-cyan-500/40'
                            }`}
                          >
                            <Power className={`w-3.5 h-3.5 ${isToggling ? 'animate-spin' : ''}`} />
                            <span>{isToggling ? 'Applying...' : isEnabled ? 'Enabled' : 'Enable Mod'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: COMMUNITY WEB SCRAPER */}
        {/* ========================================================================= */}
        {activeHubTab === 'community' && (
          <div className="p-6 flex-1 flex flex-col overflow-y-auto space-y-6">
            <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-500/30 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/40 shrink-0">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Live Romhacking.net & Community Scraper</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Search over 20,000 community translations, romhacks, and QoL patches. OmniAI automatically downloads the archive, verifies header offsets, and installs it ready to toggle.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSearchCommunity} className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <input
                  type="text"
                  value={communityQuery}
                  onChange={(e) => setCommunityQuery(e.target.value)}
                  placeholder="Enter game title (e.g. Super Mario World, Chrono Trigger, Pokemon)..."
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
                />
                <select
                  value={communityPlatform}
                  onChange={(e) => setCommunityPlatform(e.target.value)}
                  className="px-3 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
                >
                  {['SNES', 'NES', 'GBA', 'N64', 'Genesis', 'GB', 'PS1', 'PS2', 'GameCube'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={communityLoading}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Search className="w-4 h-4" />
                  <span>{communityLoading ? 'Scraping...' : 'Search Patches'}</span>
                </button>
              </form>
            </div>

            {/* Results Grid */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>Community Results ({communityResults.length})</span>
                <span className="text-[10px] text-purple-400">1-Click AI Auto-Setup Available</span>
              </div>

              {communityLoading ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
                  <p className="text-xs">Querying Romhacking.net & Libretro patch index...</p>
                </div>
              ) : communityResults.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No community patches found for "{communityQuery}". Try another title or check spelling.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {communityResults.map((hack) => {
                    const isInstalling = installingCommId === hack.id;
                    return (
                      <div
                        key={hack.id}
                        className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                              {hack.category}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Format: {hack.format?.toUpperCase() || 'IPS/BPS'}
                            </span>
                          </div>

                          <h4 className="font-bold text-white text-sm mb-1">{hack.title}</h4>
                          <p className="text-[11px] text-slate-400 mb-2">By {hack.author || 'Community'}</p>
                          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{hack.description}</p>
                        </div>

                        <div className="pt-2.5 border-t border-white/5 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-emerald-400 font-semibold">
                            ✓ Verified Safe
                          </span>

                          <button
                            onClick={() => handleAutoInstallCommunity(hack)}
                            disabled={isInstalling}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-glow-purple transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Download className={`w-3.5 h-3.5 ${isInstalling ? 'animate-bounce' : ''}`} />
                            <span>{isInstalling ? 'Configuring...' : 'AI Auto-Setup & Install'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: OMNIAI MOD SYNTHESIZER */}
        {/* ========================================================================= */}
        {activeHubTab === 'studio' && (
          <div className="p-6 flex-1 flex flex-col overflow-y-auto space-y-6">
            <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 border border-emerald-500/30 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
                  <Wand2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">OmniAI Custom Mod Synthesizer</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Describe any enhancement, mechanic, or fix in plain English. The local Qwen LLM synthesizes authentic machine-code patches, compiles binary IPS records, and registers them directly in your vault.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSynthesizeMod} className="space-y-3 pt-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Target Game</label>
                    <input
                      type="text"
                      value={aiTargetGame}
                      onChange={(e) => setAiTargetGame(e.target.value)}
                      placeholder="e.g. Chrono Trigger"
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Platform Architecture</label>
                    <select
                      value={aiPlatform}
                      onChange={(e) => setAiPlatform(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-400"
                    >
                      {['SNES', 'NES', 'Genesis', 'GB', 'GBC', 'GBA', 'PS2', 'GameCube'].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Describe What You Want the Mod to Do</label>
                  <textarea
                    rows={3}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Increase running speed by 50%, grant infinite tech points, and remove random encounter freeze delay..."
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-400 resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Uses private on-device Qwen 2.5 neural model</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSynthesizing || !aiPrompt.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs shadow-glow-emerald flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Wand2 className={`w-4 h-4 ${isSynthesizing ? 'animate-spin' : ''}`} />
                    <span>{isSynthesizing ? 'Synthesizing Machine Code...' : 'Synthesize Mod with OmniAI'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Synthesized Output Card */}
            {lastSynthesized && (
              <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Synthesized: {lastSynthesized.title}</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700">
                    Format: {lastSynthesized.patch_format?.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{lastSynthesized.description}</p>
                <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                  Path: {lastSynthesized.local_path}
                </div>
                <div className="flex items-center justify-between text-xs text-emerald-400 pt-1">
                  <span>Registered into database. Visit Active Storefront tab to toggle it on/off!</span>
                  <button
                    onClick={() => setActiveHubTab('storefront')}
                    className="px-3 py-1 rounded-lg bg-emerald-500 text-black font-bold text-xs cursor-pointer"
                  >
                    View in Storefront
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: STANDALONE EMULATOR PATCH INJECTOR */}
        {/* ========================================================================= */}
        {activeHubTab === 'emulator' && (
          <div className="p-6 flex-1 flex flex-col overflow-y-auto space-y-6">
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-yellow-950/40 border border-amber-500/30 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Standalone Emulator Native Patch Injector</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Directly compiles and injects patches into standalone emulator directories (<code>.pnach</code> for PCSX2, Gecko <code>.ini</code> for Dolphin, CWCheat for PPSSPP, <code>.cht</code> for RetroArch) so cheats work without memory injection.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Console</label>
                  <select
                    value={emuPlatform}
                    onChange={(e) => setEmuPlatform(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="GAMECUBE">GameCube & Wii (Dolphin Gecko .ini)</option>
                    <option value="WIIU">Nintendo Wii U (Cemu Graphic Packs / Patches)</option>
                    <option value="SWITCH">Nintendo Switch (Ryujinx LayeredFS / Cheats)</option>
                    <option value="3DS">Nintendo 3DS (Azahar & Lime3DS Cheats)</option>
                    <option value="NDS">Nintendo DS & DSi (melonDS Action Replay)</option>
                    <option value="PSP">PlayStation Portable (PPSSPP CWCheat)</option>
                    <option value="PS2">PlayStation 2 (PCSX2 .pnach)</option>
                    <option value="PS3">PlayStation 3 (RPCS3 patch.yml)</option>
                    <option value="PS4">PlayStation 4 (shadPS4 Cheats JSON)</option>
                    <option value="PSVITA">PlayStation Vita (Vita3K Vitacheat)</option>
                    <option value="XBOX360">Xbox 360 (Xenia patch.toml)</option>
                    <option value="XBOX">Original Xbox (xemu Shadow IPS)</option>
                    <option value="SNES">RetroArch (Universal Libretro .cht - NES, SNES, GB, GBC, GBA, etc.)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Game Title</label>
                  <input
                    type="text"
                    value={emuTitle}
                    onChange={(e) => setEmuTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Disc / Game ID (e.g. SLUS-20911 / GM8E01)</label>
                  <input
                    type="text"
                    value={emuGameId}
                    onChange={(e) => setEmuGameId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Executable CRC (for PCSX2 .pnach naming)</label>
                  <input
                    type="text"
                    value={emuCrc}
                    onChange={(e) => setEmuCrc(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">
                    Verified Patch Codes (Optional — leave blank to auto-load Libretro DB cheats for this title)
                  </label>
                  <textarea
                    rows={3}
                    value={emuCustomCodes}
                    onChange={(e) => setEmuCustomCodes(e.target.value)}
                    placeholder="Format: ADDRESS=VALUE Description (one per line, e.g. 201A4B90=3F800000 16:9 Widescreen)"
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white font-mono focus:outline-none focus:border-amber-400 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  onClick={handleGenerateEmuPatches}
                  disabled={isGeneratingEmu}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs shadow-glow-amber flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Cpu className="w-4 h-4" />
                  <span>{isGeneratingEmu ? 'Injecting Configuration...' : `Inject Native ${emuPlatform} Patch`}</span>
                </button>
              </div>
            </div>

            {emuResult && (
              <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-2">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Patch File Generated & Injected Successfully!</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-amber-300 overflow-x-auto">
                  {emuResult.patch_file}
                </div>
                <p className="text-[11px] text-slate-400">
                  When you next launch {emuTitle} in {emuPlatform}, the emulator will automatically recognize and activate these patch codes.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal Bottom Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>OmniVault Mod & Enhancement Hub Active</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all cursor-pointer"
          >
            Close Suite
          </button>
        </div>

        {/* Import Custom Mod Modal Dialog */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="relative w-full max-w-lg bg-[#0d1322] border border-purple-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Upload className="w-5 h-5 text-purple-400" />
                  <span>Import Custom Patch / Mod</span>
                </h3>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Target Game Title</label>
                  <input
                    type="text"
                    required
                    value={uploadGameTitle}
                    onChange={(e) => setUploadGameTitle(e.target.value)}
                    placeholder="e.g. Chrono Trigger"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Platform</label>
                    <select
                      value={uploadPlatform}
                      onChange={(e) => setUploadPlatform(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                    >
                      {['NES', 'SNES', 'Genesis', 'GB', 'GBC', 'GBA', 'N64', 'PS1', 'PS2', 'GameCube'].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Category</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="romhack">Total Conversion</option>
                      <option value="translation">Translation</option>
                      <option value="qol">Quality of Life</option>
                      <option value="widescreen_60fps">Widescreen / 60 FPS</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mod / Patch Title</label>
                  <input
                    type="text"
                    required
                    value={uploadModTitle}
                    onChange={(e) => setUploadModTitle(e.target.value)}
                    placeholder="e.g. Uncensored English Translation"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Patch File (.ips, .bps, .ups, .xdelta, .pnach)</label>
                  <input
                    type="file"
                    required
                    accept=".ips,.bps,.ups,.xdelta,.pnach"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                    className="w-full text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={uploadDesc}
                    onChange={(e) => setUploadDesc(e.target.value)}
                    placeholder="What does this patch change?"
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-50"
                  >
                    {isUploading ? 'Registering...' : 'Register Patch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
