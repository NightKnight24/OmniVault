import React, { useState, useEffect } from 'react';
import { 
  X, HardDrive, Disc, Sparkles, CheckCircle2, ArrowRight, 
  Layers, RefreshCw, Zap, AlertCircle, FileText
} from 'lucide-react';
import { fetchCompressorAudit, convertRomFormat, buildM3UPlaylist } from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

export default function RomCompressorModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'm3u'
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // M3U Builder state
  const [m3uTitle, setM3uTitle] = useState('Final Fantasy VII');
  const [m3uPlatform, setM3uPlatform] = useState('PS1');
  const [m3uDiscs, setM3uDiscs] = useState('Disc 1, Disc 2, Disc 3');
  const [m3uLoading, setM3uLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAudit();
    }
  }, [isOpen]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const data = await fetchCompressorAudit();
      setAuditData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleConvert = async (item) => {
    playClick();
    setConvertingId(item.game_id);
    try {
      const res = await convertRomFormat({
        game_id: item.game_id,
        target_format: item.target_format
      });
      playVictorySound();
      showToast(res.message);
      loadAudit();
    } catch (e) {
      showToast('Compression failed: ' + e.message);
    } finally {
      setConvertingId(null);
    }
  };

  const handleGenerateM3U = async (e) => {
    e.preventDefault();
    playClick();
    if (!m3uTitle.trim()) return;

    setM3uLoading(true);
    try {
      const discList = m3uDiscs.split(',').map(d => `${m3uTitle} (${d.trim()}).chd`);
      const res = await buildM3UPlaylist({
        title: m3uTitle,
        platform: m3uPlatform,
        discs: discList
      });
      playVictorySound();
      showToast(res.message);
    } catch (e) {
      showToast('Failed to build M3U: ' + e.message);
    } finally {
      setM3uLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#090d18] border border-cyan-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-black font-black shadow-glow-cyan">
              <Disc className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-white text-base tracking-wide">
                  Lossless ROM Compressor & Multi-Disc Studio
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono font-bold">
                  CHD & RVZ
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Reclaim up to 70% drive space on /Volumes/ROMS without audio or texture loss
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-950/50 border-b border-white/10 text-xs font-bold">
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'audit' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Storage Compression Audit</span>
          </button>
          <button
            onClick={() => setActiveTab('m3u')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'm3u' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Multi-Disc M3U Playlist Merger</span>
          </button>
        </div>

        {/* Status Toast */}
        {toastMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-cyan-950 border border-cyan-400 text-cyan-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          
          {activeTab === 'audit' && (
            <div className="space-y-4">
              
              {/* Savings Overview Banner */}
              {auditData && (
                <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/40 to-slate-900 border border-cyan-500/30 text-center">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Current Footprint</div>
                    <div className="text-base font-black text-white font-mono">{auditData.total_current_gb} GB</div>
                  </div>
                  <div className="border-x border-white/10">
                    <div className="text-[10px] font-bold uppercase text-slate-400">After Compression</div>
                    <div className="text-base font-black text-cyan-400 font-mono">{auditData.total_projected_gb} GB</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-emerald-400">Space Saved</div>
                    <div className="text-base font-black text-emerald-400 font-mono">+{auditData.total_potential_savings_gb} GB</div>
                  </div>
                </div>
              )}

              {/* Candidate Games Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                  <span>Compressible CD/DVD Disc Images ({auditData?.candidates?.length || 0})</span>
                  <button 
                    onClick={loadAudit}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                <div className="space-y-2">
                  {(!auditData?.candidates || auditData.candidates.length === 0) ? (
                    <div className="p-8 rounded-2xl bg-slate-900/50 border border-dashed border-white/10 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                        <HardDrive className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">No Uncompressed Disc Images Found</h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          {auditData?.message || "No .iso, .cue, or .gdi files found on /Volumes/ROMS. Download a PS1, PS2, or Saturn disc game first to losslessly compress it into CHD format."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    auditData.candidates.map((c) => (
                      <div
                        key={c.game_id}
                        className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 hover:border-cyan-500/40 flex items-center justify-between gap-4 transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                              {c.platform}
                            </span>
                            <span className="text-xs font-black text-white truncate">
                              {c.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono text-slate-300">{c.current_format} ({c.current_size_mb} MB)</span>
                            <ArrowRight className="w-3 h-3 text-cyan-400" />
                            <span className="font-mono font-bold text-emerald-400">{c.target_format} ({c.projected_size_mb} MB)</span>
                            <span className="text-[10px] text-emerald-500 font-bold">(-{c.potential_savings_mb} MB)</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleConvert(c)}
                          disabled={convertingId === c.game_id}
                          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                        >
                          <Zap className="w-3.5 h-3.5 fill-black" />
                          <span>{convertingId === c.game_id ? 'Compressing...' : 'Compress'}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'm3u' && (
            <form onSubmit={handleGenerateM3U} className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                  <FileText className="w-4 h-4" />
                  <span>Automatic Multi-Disc Consolidation</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Consolidates multi-disc games (like Metal Gear Solid or Final Fantasy) into a single master playlist (.m3u). 
                  This removes duplicate entries in your vault and enables seamless disc swapping in the Quick Menu.
                </p>

                <div className="space-y-2 pt-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Game Title</label>
                  <input
                    type="text"
                    value={m3uTitle}
                    onChange={(e) => setM3uTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Final Fantasy VIII"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Platform</label>
                    <select
                      value={m3uPlatform}
                      onChange={(e) => setM3uPlatform(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value="PS1">PlayStation 1 (PS1)</option>
                      <option value="PS2">PlayStation 2 (PS2)</option>
                      <option value="Saturn">Sega Saturn</option>
                      <option value="Dreamcast">Sega Dreamcast</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Disc Labels (Comma Separated)</label>
                    <input
                      type="text"
                      value={m3uDiscs}
                      onChange={(e) => setM3uDiscs(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                      placeholder="Disc 1, Disc 2, Disc 3, Disc 4"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={m3uLoading}
                  className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 fill-black" />
                  <span>{m3uLoading ? 'Generating Playlist...' : 'Generate Multi-Disc M3U Playlist'}</span>
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span>Supported Formats: CHD (MAME/Chdman) • RVZ (Dolphin)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
