import React, { useEffect, useState } from 'react';
import {
  X, Folder, Download, CheckCircle, AlertCircle, Trash2,
  ArrowUp, ArrowDown, Pause, Play, Clock, ListOrdered, Cloud
} from 'lucide-react';
import {
  revealInFinder, cancelDownload, moveQueuedDownload,
  pauseDownloadQueue, resumeDownloadQueue, clearCompletedDownloads
} from '../services/api';

export default function DownloadDrawer({ isOpen, onClose, downloads = [], queueStatus = null, onRefresh }) {
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    onRefresh?.();
    const interval = setInterval(() => {
      onRefresh?.();
    }, 1200);
    return () => clearInterval(interval);
  }, [isOpen, onRefresh]);

  if (!isOpen) return null;

  const handleReveal = async (id) => {
    try {
      await revealInFinder(id);
    } catch {
      alert('Could not open file in Finder. It may still be in progress.');
    }
  };

  const handleCancel = async (id) => {
    try {
      await cancelDownload(id);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMove = async (id, direction) => {
    setBusyAction(true);
    try {
      await moveQueuedDownload(id, direction);
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleQueuePause = async () => {
    setBusyAction(true);
    try {
      if (queueStatus?.paused) {
        await resumeDownloadQueue();
      } else {
        await pauseDownloadQueue();
      }
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearCompleted = async () => {
    setBusyAction(true);
    try {
      await clearCompletedDownloads();
      onRefresh?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyAction(false);
    }
  };

  const activeItems = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'resolving_mirror'
  );
  const queuedItems = downloads
    .filter((d) => d.status === 'queued')
    .sort((a, b) => (a.queue_position ?? 9999) - (b.queue_position ?? 9999));
  const finishedItems = downloads.filter(
    (d) => d.status !== 'downloading' && d.status !== 'resolving_mirror' && d.status !== 'queued'
  );
  const isQueuePaused = Boolean(queueStatus?.paused);

  const renderCard = (item, queueIdx = -1, totalQueued = 0) => {
    const isCompleted = item.status === 'completed';
    const isDownloading = item.status === 'downloading' || item.status === 'resolving_mirror';
    const isError = item.status === 'error';
    const isQueued = item.status === 'queued';

    return (
      <div
        key={item.id}
        className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5 shadow-sm ${
          isDownloading
            ? 'bg-cyan-950/25 border-cyan-500/40'
            : isQueued
            ? 'bg-slate-900/80 border-amber-500/20'
            : 'bg-slate-900/90 border-white/5 hover:border-white/15'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                {item.platform}
              </span>
              {item.destination_target && item.destination_target !== 'local' && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center gap-1">
                  <Cloud className="w-2.5 h-2.5" />
                  <span>{item.destination_label || item.destination_target}</span>
                </span>
              )}
              {isDownloading && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Active
                </span>
              )}
              {isQueued && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  #{item.queue_position || queueIdx + 1} in Queue
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-white truncate">
              {item.game_title || item.filename}
            </h4>
            <span className="text-xs text-slate-400 truncate block">
              {item.filename}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isQueued && (
              <>
                <button
                  onClick={() => handleMove(item.id, 'up')}
                  disabled={busyAction || queueIdx <= 0}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Move up in queue"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleMove(item.id, 'down')}
                  disabled={busyAction || queueIdx >= totalQueued - 1}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Move down in queue"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {isCompleted && (
              <button
                onClick={() => handleReveal(item.id)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-black text-cyan-400 transition-colors cursor-pointer"
                title="Show in Finder"
              >
                <Folder className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleCancel(item.id)}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              title={isDownloading ? 'Cancel active download' : isQueued ? 'Remove from queue' : 'Remove record'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar & Status */}
        <div className="space-y-1">
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isError
                  ? 'bg-rose-500'
                  : isQueued
                  ? 'bg-amber-500/50'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-500'
              }`}
              style={{ width: `${item.progress || 0}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 gap-2">
            {isCompleted && (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Completed &amp; Ready
              </span>
            )}
            {isDownloading && (
              <span className="text-cyan-400 font-mono font-medium truncate">
                {item.progress ? item.progress.toFixed(1) : 0}% • {item.speed}
              </span>
            )}
            {isError && (
              <span className="text-rose-400 font-medium flex items-center gap-1 truncate" title={item.error_message || ''}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.error_message || 'Download Failed'}</span>
              </span>
            )}
            {isQueued && (
              <span className="text-amber-300 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {isQueuePaused ? 'Queue Paused' : 'Waiting (1-at-a-Time)'}
              </span>
            )}
            {item.status === 'paused' && (
              <span className="text-slate-400 font-medium">Paused / Cancelled</span>
            )}

            <span className="text-slate-500 font-mono shrink-0">
              {item.eta || ''}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0b101b] border-l border-white/10 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-white/10 space-y-2.5 bg-slate-950/70">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            <h3 className="font-display font-bold text-white text-base">Download Queue</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono font-bold">
              1 at a Time
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Queue Control Bar */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-400 font-mono flex items-center gap-1.5">
            <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {activeItems.length} Active • {queuedItems.length} Queued
            </span>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleQueuePause}
              disabled={busyAction}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                isQueuePaused
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-slate-800 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {isQueuePaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span>{isQueuePaused ? 'Resume Queue' : 'Pause Queue'}</span>
            </button>

            {finishedItems.length > 0 && (
              <button
                type="button"
                onClick={handleClearCompleted}
                disabled={busyAction}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-[11px] font-semibold cursor-pointer"
              >
                Clear Finished
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Downloads List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {downloads.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Download className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="text-sm font-medium">No downloads in queue</p>
            <p className="text-xs text-slate-600 mt-1">
              Added games download automatically one at a time in queue order
            </p>
          </div>
        ) : (
          <>
            {activeItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 px-1">
                  Now Downloading
                </div>
                <div className="space-y-2.5">
                  {activeItems.map((item) => renderCard(item))}
                </div>
              </div>
            )}

            {queuedItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 px-1">
                  Up Next in Queue ({queuedItems.length})
                </div>
                <div className="space-y-2.5">
                  {queuedItems.map((item, idx) => renderCard(item, idx, queuedItems.length))}
                </div>
              </div>
            )}

            {finishedItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
                  Completed &amp; History ({finishedItems.length})
                </div>
                <div className="space-y-2.5">
                  {finishedItems.map((item) => renderCard(item))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
