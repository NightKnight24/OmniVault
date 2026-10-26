import React, { useState, useEffect } from 'react';
import { 
  X, RotateCcw, Cloud, HardDrive, ShieldCheck, Plus, 
  Clock, CheckCircle2, AlertTriangle, Sparkles, RefreshCw
} from 'lucide-react';
import { 
  fetchSaveSnapshots, createSaveSnapshot, 
  rollbackSaveSnapshot, syncCloudSaves, fetchCloudStatus 
} from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

export default function SaveTimeMachineModal({ isOpen, onClose, game }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [cloudStatus, setCloudStatus] = useState(null);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (isOpen && game) {
      loadData();
    }
  }, [isOpen, game]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [snapRes, cloudRes] = await Promise.all([
        fetchSaveSnapshots(game.id),
        fetchCloudStatus()
      ]);
      setSnapshots(snapRes.snapshots || []);
      setCloudStatus(cloudRes);
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

  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    playClick();
    setCreating(true);
    try {
      const res = await createSaveSnapshot({
        game_id: game.id,
        label: newLabel.trim()
      });
      playVictorySound();
      showToast(res.message);
      setNewLabel('');
      loadData();
    } catch (e) {
      showToast('Failed to create snapshot: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRollback = async (snap) => {
    playClick();
    setRollingBackId(snap.id);
    try {
      const res = await rollbackSaveSnapshot({
        game_id: game.id,
        snapshot_id: snap.id
      });
      playVictorySound();
      showToast(res.message);
      loadData();
    } catch (e) {
      showToast('Rollback failed: ' + e.message);
    } finally {
      setRollingBackId(null);
    }
  };

  const handleCloudSync = async () => {
    playClick();
    setSyncingCloud(true);
    try {
      const res = await syncCloudSaves();
      playVictorySound();
      showToast(res.message);
      loadData();
    } catch (e) {
      showToast('Cloud sync failed: ' + e.message);
    } finally {
      setSyncingCloud(false);
    }
  };

  if (!isOpen || !game) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#090d18] border border-cyan-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-black font-black shadow-glow-cyan">
              <RotateCcw className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-white text-base tracking-wide">
                  OmniSync: Save Time-Machine
                </h3>
                <span className="px-2 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-mono font-bold">
                  Zero Data Loss
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-sm">
                {game.title} • {game.platform}
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

        {/* Status Toast */}
        {toastMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-cyan-950 border border-cyan-400 text-cyan-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          
          {/* Create New Checkpoint Bar */}
          <form onSubmit={handleCreateSnapshot} className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Create checkpoint (e.g. 'Before Water Temple Boss')..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={creating || !newLabel.trim()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Snapshot</span>
            </button>
          </form>

          {/* Cloud Sync Status Strip */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <Cloud className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <div className="truncate">
                <span className="font-bold text-white">iCloud & Cloud Vault: </span>
                <span className="text-slate-400 text-[11px]">
                  Last synced {cloudStatus?.last_synced || 'Never'}
                </span>
              </div>
            </div>
            <button
              onClick={handleCloudSync}
              disabled={syncingCloud}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${syncingCloud ? 'animate-spin' : ''}`} />
              <span>{syncingCloud ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {/* Historical Snapshots Timeline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-1">
              <span>Historical Timeline ({snapshots.length} Snapshots)</span>
              <span className="text-[10px] text-emerald-400 font-mono">100% Reversible</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading Time-Machine checkpoints...</div>
            ) : snapshots.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No checkpoints recorded yet.</div>
            ) : (
              <div className="space-y-2">
                {snapshots.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 flex items-center justify-between gap-3 transition-all group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.2 rounded text-[9px] font-bold uppercase font-mono ${
                          s.is_auto ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {s.is_auto ? 'Auto Checkpoint' : 'Player Save'}
                        </span>
                        <span className="text-xs font-black text-white truncate">
                          {s.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {s.timestamp}
                        </span>
                        <span>•</span>
                        <span className="font-mono">{s.size_kb} KB</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRollback(s)}
                      disabled={rollingBackId === s.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 flex-shrink-0"
                      title="Roll back active memory to this checkpoint"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{rollingBackId === s.id ? 'Rolling back...' : 'Rollback'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Safety backups created automatically before every rollback</span>
          </div>
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
