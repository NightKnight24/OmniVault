import React, { useState, useEffect } from 'react';
import { 
  Wrench, X, ShieldCheck, Cpu, HardDrive, Search, ArrowRightLeft,
  RotateCcw, Lock, Unlock, Zap, Check, AlertCircle, Copy, Terminal,
  RefreshCw, Sparkles, Layers, Languages, Volume2, Play
} from 'lucide-react';
import { 
  diffSaves, searchSave, patchSave, fetchSaveBackups, revertSave,
  fetchRetroArchStatus, scanRetroArchRam, pokeRetroArchRam, freezeRetroArchRam, unfreezeRetroArchRam,
  analyzeRomCheats, translateFrame, speakText, fetchRetroArchAiConfig, fetchActiveSession
} from '../services/api';

export default function CheatLabModal({ isOpen, onClose, selectedGame = null }) {
  const [activeTab, setActiveTab] = useState('savediff'); // 'savediff' | 'retroarch' | 'romgenie' | 'translation'
  
  // Tab 4: Live Translation state
  const [testImgBase64, setTestImgBase64] = useState('');
  const [transResults, setTransResults] = useState(null);
  const [isTranslatingDemo, setIsTranslatingDemo] = useState(false);
  const [raConfig, setRaConfig] = useState(null);
  const [copiedConfig, setCopiedConfig] = useState(false);
  
  // Tab 1: Save Diff state
  const [savePathA, setSavePathA] = useState('');
  const [savePathB, setSavePathB] = useState('');
  const [valA, setValA] = useState('');
  const [valB, setValB] = useState('');
  const [diffResults, setDiffResults] = useState(null);
  const [isDiffing, setIsDiffing] = useState(false);
  const [patchOffset, setPatchOffset] = useState('');
  const [patchVal, setPatchVal] = useState('');
  const [patchType, setPatchType] = useState('uint16_le');
  const [patchFeedback, setPatchFeedback] = useState(null);
  const [backups, setBackups] = useState([]);

  // Tab 2: RetroArch Live RAM state
  const [raStatus, setRaStatus] = useState({ connected: false, message: 'Checking...' });
  const [raPlatform, setRaPlatform] = useState(selectedGame?.platform || 'SNES');
  const [raTargetVal, setRaTargetVal] = useState('');
  const [raDataType, setRaDataType] = useState('uint16_le');
  const [raCandidates, setRaCandidates] = useState([]);
  const [isRaScanning, setIsRaScanning] = useState(false);
  const [frozenAddresses, setFrozenAddresses] = useState(new Set());
  const [pokeInputVal, setPokeInputVal] = useState('');

  // Tab 3: ROM Analyzer state
  const [romPath, setRomPath] = useState('');
  const [romPlatform, setRomPlatform] = useState(selectedGame?.platform || 'NES');
  const [romCheats, setRomCheats] = useState([]);
  const [isRomAnalyzing, setIsRomAnalyzing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (!selectedGame) {
        fetchActiveSession().then(data => {
          if (data?.session) {
            if (data.session.platform) {
              setRaPlatform(data.session.platform);
              setRomPlatform(data.session.platform);
            }
            if (data.session.rom_path) {
              setRomPath(data.session.rom_path);
            }
          }
        }).catch(() => {});
      }
      if (activeTab === 'retroarch') {
        checkRetroArch();
      }
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const checkRetroArch = async () => {
    const activeEngine = typeof window !== 'undefined' ? window.__OMNI_ACTIVE_ENGINE__ : null;
    if (activeEngine && activeEngine.getSystemRamView()) {
      const ram = activeEngine.getSystemRamView();
      setRaStatus({
        connected: true,
        inApp: true,
        status: `In-App OmniCore (${activeEngine.platform || 'Active'})`,
        message: `Direct zero-latency access to ${ram.length} bytes of live in-app System RAM.`
      });
      return;
    }
    try {
      const res = await fetchRetroArchStatus();
      setRaStatus(res);
    } catch (e) {
      setRaStatus({ connected: false, message: e.message });
    }
  };

  const handleDiffSaves = async () => {
    if (!savePathA.trim() || !savePathB.trim()) {
      alert("Please provide paths for both Save A and Save B");
      return;
    }
    setIsDiffing(true);
    setDiffResults(null);
    setPatchFeedback(null);
    try {
      const formData = new FormData();
      formData.append('path_a', savePathA.trim());
      formData.append('path_b', savePathB.trim());
      if (valA !== '') formData.append('val_a', parseInt(valA, 10));
      if (valB !== '') formData.append('val_b', parseInt(valB, 10));

      const res = await diffSaves(formData);
      setDiffResults(res);
      loadBackups(savePathA.trim());
    } catch (e) {
      alert(e.message);
    } finally {
      setIsDiffing(false);
    }
  };

  const loadBackups = async (path) => {
    try {
      const res = await fetchSaveBackups(path);
      setBackups(res.backups || []);
    } catch {
      // ignore
    }
  };

  const handleApplyPatch = async () => {
    if (!savePathA.trim() || patchOffset === '' || patchVal === '') {
      alert("Path, offset, and target value are required");
      return;
    }
    try {
      const offsetNum = patchOffset.toString().startsWith('0x') 
        ? parseInt(patchOffset, 16) 
        : parseInt(patchOffset, 10);

      const res = await patchSave({
        path: savePathA.trim(),
        offset: offsetNum,
        new_value: parseInt(patchVal, 10),
        data_type: patchType
      });
      setPatchFeedback(res);
      loadBackups(savePathA.trim());
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRevert = async (backupPath) => {
    try {
      const res = await revertSave(savePathA.trim(), backupPath);
      alert(res.message);
      loadBackups(savePathA.trim());
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRaScan = async (isRefine = false) => {
    if (raTargetVal === '') {
      alert("Please enter a target value to scan for");
      return;
    }
    setIsRaScanning(true);
    try {
      const activeEngine = typeof window !== 'undefined' ? window.__OMNI_ACTIVE_ENGINE__ : null;
      if (activeEngine && activeEngine.getSystemRamView()) {
        const matches = activeEngine.scanRam(
          parseInt(raTargetVal, 10),
          raDataType,
          isRefine && raCandidates.length > 0 ? raCandidates.map(c => c.address) : null
        );
        setRaCandidates(matches);
        return;
      }
      const res = await scanRetroArchRam({
        platform: raPlatform,
        value: parseInt(raTargetVal, 10),
        data_type: raDataType,
        candidates: isRefine && raCandidates.length > 0 ? raCandidates.map(c => c.address) : null
      });
      setRaCandidates(res.matches || []);
    } catch (e) {
      alert(e.message);
    } finally {
      setIsRaScanning(false);
    }
  };

  const handlePoke = async (addr) => {
    const val = pokeInputVal !== '' ? parseInt(pokeInputVal, 10) : parseInt(raTargetVal, 10);
    try {
      const activeEngine = typeof window !== 'undefined' ? window.__OMNI_ACTIVE_ENGINE__ : null;
      if (activeEngine && activeEngine.getSystemRamView()) {
        activeEngine.pokeRam(addr, val, raDataType);
        return;
      }
      const res = await pokeRetroArchRam({
        address: addr,
        value: val,
        data_type: raDataType
      });
      alert(res.message);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleToggleFreeze = async (addr) => {
    const isFrozen = frozenAddresses.has(addr);
    const activeEngine = typeof window !== 'undefined' ? window.__OMNI_ACTIVE_ENGINE__ : null;
    try {
      if (isFrozen) {
        if (activeEngine && activeEngine.getSystemRamView()) {
          activeEngine.unfreezeRam(addr);
        } else {
          await unfreezeRetroArchRam({ address: addr });
        }
        setFrozenAddresses(prev => {
          const next = new Set(prev);
          next.delete(addr);
          return next;
        });
      } else {
        const val = pokeInputVal !== '' ? parseInt(pokeInputVal, 10) : parseInt(raTargetVal, 10);
        if (activeEngine && activeEngine.getSystemRamView()) {
          activeEngine.freezeRam(addr, val, raDataType);
        } else {
          await freezeRetroArchRam({
            address: addr,
            value: val,
            data_type: raDataType
          });
        }
        setFrozenAddresses(prev => new Set(prev).add(addr));
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleAnalyzeRom = async () => {
    if (!romPath.trim()) {
      alert("Please enter the ROM file path on disk");
      return;
    }
    setIsRomAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('path', romPath.trim());
      formData.append('platform', romPlatform);
      const res = await analyzeRomCheats(formData);
      setRomCheats(res.cheats || []);
    } catch (e) {
      alert(e.message);
    } finally {
      setIsRomAnalyzing(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] bg-[#0c121e] border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900/80 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-glow-cyan">
              <Wrench className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-lg text-white">Cheat Engineering Lab</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Zero-Corruption Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Safe differential save hacking, RetroArch UDP live memory scanner, and ROM opcode disassembler
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-white/10 bg-slate-900/40">
          <button
            onClick={() => setActiveTab('savediff')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'savediff'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Zero-Corruption Save Diff & Patch</span>
          </button>

          <button
            onClick={() => setActiveTab('retroarch')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'retroarch'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>RetroArch Live RAM Scanner (UDP)</span>
          </button>

          <button
            onClick={() => setActiveTab('romgenie')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'romgenie'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>ROM Opcode & Game Genie Generator</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('translation');
              if (!raConfig) {
                fetchRetroArchAiConfig().then(setRaConfig).catch(() => {});
              }
            }}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'translation'
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Languages className="w-4 h-4" />
            <span>Live Screen & Audio Translation</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* TAB 1: ZERO-CORRUPTION SAVE DIFF & PATCH */}
          {activeTab === 'savediff' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-slate-300 leading-relaxed flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-cyan-300 block mb-1">How Zero-Corruption Differential Save Hacking Works:</strong>
                  Save your game at two points (e.g. Save A with 100 gold, Save B with 150 gold). The diff engine compares them byte-by-byte, filtering through 8-bit, 16-bit, 24-bit, 32-bit, and BCD encodings to isolate the exact offset. Every patch automatically creates an atomic, timestamped <code className="text-amber-400">.bak</code> file so you can roll back instantly.
                </div>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Save File A (Baseline State)</span>
                    <span className="text-[11px] text-slate-500">.sav / .srm / .state</span>
                  </label>
                  <input
                    type="text"
                    value={savePathA}
                    onChange={(e) => setSavePathA(e.target.value)}
                    placeholder="/Volumes/ROMS/SNES/Chrono_Trigger.srm"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Known Value A:</span>
                    <input
                      type="number"
                      value={valA}
                      onChange={(e) => setValA(e.target.value)}
                      placeholder="e.g. 100"
                      className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Save File B (After Collecting / Spending)</span>
                    <span className="text-[11px] text-slate-500">Changed State</span>
                  </label>
                  <input
                    type="text"
                    value={savePathB}
                    onChange={(e) => setSavePathB(e.target.value)}
                    placeholder="/Volumes/ROMS/SNES/Chrono_Trigger_after.srm"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Known Value B:</span>
                    <input
                      type="number"
                      value={valB}
                      onChange={(e) => setValB(e.target.value)}
                      placeholder="e.g. 150"
                      className="w-28 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleDiffSaves}
                disabled={isDiffing}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-glow-cyan cursor-pointer disabled:opacity-50"
              >
                {isDiffing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                <span>{isDiffing ? "Analyzing Save Deltas..." : "Run Differential Save Analysis"}</span>
              </button>

              {/* Diff Results Table */}
              {diffResults && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300">
                      Discovered Candidates ({diffResults.candidates?.length || 0} offsets found)
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      {diffResults.total_diff_bytes} total changed bytes in {diffResults.file_size} bytes file
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-white/10 rounded-xl bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 border-b border-white/10 sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Offset</th>
                          <th className="px-3 py-2">Data Type</th>
                          <th className="px-3 py-2">Before</th>
                          <th className="px-3 py-2">After</th>
                          <th className="px-3 py-2">Confidence</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {diffResults.candidates?.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-900/60 transition-colors">
                            <td className="px-3 py-2 font-mono text-cyan-400 font-bold">{c.hex_offset}</td>
                            <td className="px-3 py-2 text-slate-300">{c.data_type}</td>
                            <td className="px-3 py-2 text-amber-400 font-mono">{c.before}</td>
                            <td className="px-3 py-2 text-emerald-400 font-mono">{c.after}</td>
                            <td className="px-3 py-2 text-slate-400">{c.confidence || 'Medium'}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => {
                                  setPatchOffset(c.hex_offset);
                                  setPatchType(c.data_type);
                                  setPatchVal('9999');
                                }}
                                className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 text-[11px] font-bold"
                              >
                                Select for Patch
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Safe Patch Panel */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Safe Atomic Patching (With Guaranteed Auto-Backup)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Target Offset (Hex or Int):</span>
                    <input
                      type="text"
                      value={patchOffset}
                      onChange={(e) => setPatchOffset(e.target.value)}
                      placeholder="0x01A0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Data Encoding:</span>
                    <select
                      value={patchType}
                      onChange={(e) => setPatchType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    >
                      <option value="uint8">uint8 (1 Byte: 0-255)</option>
                      <option value="uint16_le">uint16_le (2 Bytes Little Endian)</option>
                      <option value="uint16_be">uint16_be (2 Bytes Big Endian)</option>
                      <option value="uint24_le">uint24_le (3 Bytes RPG Gold)</option>
                      <option value="uint32_le">uint32_le (4 Bytes)</option>
                      <option value="bcd_2byte">bcd_2byte (Binary Coded Decimal)</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">New Value:</span>
                    <input
                      type="number"
                      value={patchVal}
                      onChange={(e) => setPatchVal(e.target.value)}
                      placeholder="9999"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>

                <button
                  onClick={handleApplyPatch}
                  className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs transition-all shadow-md cursor-pointer"
                >
                  Safely Patch Value (Creates .bak first)
                </button>

                {patchFeedback && (
                  <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300">
                    ✓ {patchFeedback.revert_command} (New Hex: <span className="font-mono text-white">{patchFeedback.new_hex}</span>)
                  </div>
                )}
              </div>

              {/* Backups List */}
              {backups.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Existing Safety Backups (One-Click Rollback)</span>
                  </h4>
                  <div className="space-y-1.5">
                    {backups.map((b, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-white/5 text-xs">
                        <div>
                          <span className="text-white font-mono text-[11px] block">{b.filename}</span>
                          <span className="text-[10px] text-slate-500">{b.timestamp} • {b.size_bytes} bytes</span>
                        </div>
                        <button
                          onClick={() => handleRevert(b.path)}
                          className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-bold text-[11px]"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RETROARCH LIVE RAM SCANNER (UDP) */}
          {activeTab === 'retroarch' && (
            <div className="space-y-6">
              {/* Connection Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                raStatus.connected 
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
                  : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${raStatus.connected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                  <div>
                    <span className="text-xs font-bold block">
                      {raStatus.connected ? `Connected to RetroArch (${raStatus.status || 'Active Core'})` : 'RetroArch Disconnected'}
                    </span>
                    <span className="text-[11px] text-slate-400 leading-tight">
                      {raStatus.message}
                    </span>
                  </div>
                </div>
                <button
                  onClick={checkRetroArch}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-bold transition-colors cursor-pointer"
                >
                  Test Connection
                </button>
              </div>

              {/* Scanner Form */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Target Console Platform:</span>
                  <select
                    value={raPlatform}
                    onChange={(e) => setRaPlatform(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="NES">NES (2KB WRAM: $0000-$07FF)</option>
                    <option value="SNES">SNES (Low WRAM: $7E0000-$7E1FFF)</option>
                    <option value="GB">Game Boy / GBC (WRAM: $C000-$DFFF)</option>
                    <option value="GBA">GBA (IWRAM / EWRAM: $02000000)</option>
                    <option value="Genesis">Sega Genesis (64KB RAM: $FF0000)</option>
                  </select>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Value to Search (e.g. Current Lives):</span>
                  <input
                    type="number"
                    value={raTargetVal}
                    onChange={(e) => setRaTargetVal(e.target.value)}
                    placeholder="3"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Value Data Type:</span>
                  <select
                    value={raDataType}
                    onChange={(e) => setRaDataType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="uint8">uint8 (1 Byte: 0-255)</option>
                    <option value="uint16_le">uint16_le (2 Bytes Little Endian)</option>
                    <option value="uint16_be">uint16_be (2 Bytes Big Endian)</option>
                    <option value="uint32_le">uint32_le (4 Bytes)</option>
                  </select>
                </div>
              </div>

              {/* Scan Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleRaScan(false)}
                  disabled={isRaScanning || !raStatus.connected}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-xs transition-all shadow-glow-cyan cursor-pointer disabled:opacity-40"
                >
                  {isRaScanning ? "Scanning Live RAM..." : "1. Initial RAM Search"}
                </button>

                <button
                  onClick={() => handleRaScan(true)}
                  disabled={isRaScanning || !raStatus.connected || raCandidates.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs transition-all cursor-pointer disabled:opacity-40"
                >
                  2. Refine Search with New Value ({raCandidates.length} Candidates)
                </button>
              </div>

              {/* Candidates & Poke Panel */}
              {raCandidates.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">
                      RAM Address Candidates ({raCandidates.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Poke Value:</span>
                      <input
                        type="number"
                        value={pokeInputVal}
                        onChange={(e) => setPokeInputVal(e.target.value)}
                        placeholder="99"
                        className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-white/10 rounded-xl bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 border-b border-white/10 sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Memory Address</th>
                          <th className="px-3 py-2">Current Value</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {raCandidates.map((c, i) => (
                          <tr key={i} className="hover:bg-slate-900/60 transition-colors">
                            <td className="px-3 py-2 font-mono text-cyan-400 font-bold">{c.hex_address}</td>
                            <td className="px-3 py-2 font-mono text-emerald-400">{c.value}</td>
                            <td className="px-3 py-2">
                              {frozenAddresses.has(c.address) ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Frozen
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">Active</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right space-x-2">
                              <button
                                onClick={() => handlePoke(c.address)}
                                className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 text-[11px] font-bold"
                              >
                                Poke
                              </button>
                              <button
                                onClick={() => handleToggleFreeze(c.address)}
                                className={`px-2 py-1 rounded text-[11px] font-bold ${
                                  frozenAddresses.has(c.address)
                                    ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/40'
                                    : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/40'
                                }`}
                              >
                                {frozenAddresses.has(c.address) ? 'Unfreeze' : 'Freeze / Lock'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ROM DECREMENT ANALYZER & GAME GENIE GENERATOR */}
          {activeTab === 'romgenie' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/20 text-xs text-slate-300 leading-relaxed flex items-start gap-3">
                <Zap className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-violet-300 block mb-1">Non-Destructive ROM Opcode Analysis:</strong>
                  The disassembler scans machine code instructions (6502 on NES, SM83 on Game Boy) searching for decrement and subtraction opcodes (<code className="text-amber-300">DEC $xx</code>, <code className="text-amber-300">SBC #$01</code>) that take away player health, lives, or ammo. It converts the candidate address into an authentic <strong>Game Genie Code</strong> so you can use it in your emulator without touching or corrupting the ROM file on disk!
                </div>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <span className="text-[11px] text-slate-400 block mb-1">ROM File Path on Disk:</span>
                  <input
                    type="text"
                    value={romPath}
                    onChange={(e) => setRomPath(e.target.value)}
                    placeholder="/Volumes/ROMS/NES/Super_Mario_Bros.nes"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">Platform:</span>
                  <select
                    value={romPlatform}
                    onChange={(e) => setRomPlatform(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="NES">NES (6502 Machine Code)</option>
                    <option value="SNES">SNES (65C816 Machine Code)</option>
                    <option value="GB">Game Boy / GBC (SM83 / Z80)</option>
                    <option value="Genesis">Sega Genesis / Neo Geo (Motorola 68000)</option>
                    <option value="GBA">Game Boy Advance / NDS (ARM7TDMI Thumb)</option>
                    <option value="PS1">PS1 / PS2 / PSP / N64 (MIPS R3000/R4300)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleAnalyzeRom}
                disabled={isRomAnalyzing}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-extrabold text-xs transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRomAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                <span>{isRomAnalyzing ? "Disassembling & Scanning Opcodes..." : "Scan ROM for Decrement Routines"}</span>
              </button>

              {/* Cheats Found */}
              {romCheats.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300">
                    Generated Game Genie Codes ({romCheats.length} Routines Detected)
                  </h4>
                  <div className="space-y-2">
                    {romCheats.map((c, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-cyan-400 font-extrabold text-sm tracking-wider">
                              {c.game_genie_code}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-950 text-violet-300 border border-violet-800">
                              {c.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            CPU Target: <span className="font-mono text-slate-300">{c.cpu_address}</span> • {c.effect}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const eng = typeof window !== 'undefined' ? window.__OMNI_ACTIVE_ENGINE__ : null;
                              if (eng) {
                                eng.applyCheats([{ code: c.game_genie_code, description: c.effect, enabled: true }]);
                                alert(`Applied ${c.game_genie_code} to active emulator!`);
                              } else {
                                copyToClipboard(c.game_genie_code, i);
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/40 text-violet-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Apply to Game</span>
                          </button>
                          <button
                            onClick={() => copyToClipboard(c.game_genie_code, i)}
                            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {copiedCode === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedCode === i ? "Copied!" : "Copy Code"}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LIVE GAME SCREEN & AUDIO VOICE TRANSLATION */}
          {activeTab === 'translation' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-slate-300 leading-relaxed flex items-start gap-3">
                <Languages className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-cyan-300 block mb-1">Live Game Translation & Audio Voice Narration:</strong>
                  Play untranslated Japanese Super Famicom, PC Engine, Saturn, or PS1 games with real-time English text overlays and spoken voice narration. Powered by Apple Vision Neural OCR (running in ~25ms on your Mac) and the local OmniAI translation model.
                </div>
              </div>

              {/* RetroArch Native Setup Box */}
              <div className="p-4 rounded-xl bg-slate-900 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white">RetroArch Native AI Service Integration</span>
                  </div>
                  <button
                    onClick={() => {
                      if (raConfig?.config_lines) {
                        navigator.clipboard.writeText(raConfig.config_lines.join('\n'));
                        setCopiedConfig(true);
                        setTimeout(() => setCopiedConfig(false), 2000);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedConfig ? "Copied Config!" : "Copy retroarch.cfg lines"}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Map a controller button in RetroArch (e.g. L3/R3 or a trigger) to <strong>&quot;AI Service&quot;</strong>. Whenever a Japanese dialogue box appears, press the button to instantly display English subtitles directly on top of the game screen!
                </p>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400 space-y-1">
                  <div>ai_service_enable = &quot;true&quot;</div>
                  <div>ai_service_url = &quot;http://127.0.0.1:19842/api/ai/retroarch-translate&quot;</div>
                  <div>ai_service_mode = &quot;0&quot;  <span className="text-slate-500"># 0 = Visual Subtitle Overlay, 1 = Audio Speech Narrator</span></div>
                  <div>ai_service_pause = &quot;true&quot; <span className="text-slate-500"># Automatically pauses game while translating</span></div>
                </div>
              </div>

              {/* Live Web Player Feature Info */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex items-start gap-3">
                <Volume2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="font-bold text-white block">In-Browser OmniPlayer Live Translate & Audio Voice</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    When launching any game in the web player, click the <strong>&quot;AI Translate&quot;</strong> button in the bottom control bar. It captures the screen canvas, runs instant OCR, displays English subtitles, and speaks the dialogue aloud in natural English speech audio!
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
