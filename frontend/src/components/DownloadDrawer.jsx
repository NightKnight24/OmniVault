import React, { useEffect } from 'react';
import { X, Folder, Download, CheckCircle, AlertCircle, Trash2, ArrowUpRight, RefreshCw } from 'lucide-react';
import { revealInFinder, cancelDownload } from '../services/api';

export default function DownloadDrawer({ isOpen, onClose, downloads, onRefresh }) {
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
    } catch (e) {
      alert("Could not open file in Finder. It may still be in progress.");
    }
  };

  const handleCancel = async (id) => {
    try {
      await cancelDownload(id);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0b101b] border-l border-white/10 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      
      {/* Drawer Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-cyan-400" />
          <h3 className="font-display font-bold text-white text-base">Vault Downloads</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {downloads.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Downloads List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {downloads.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Download className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="text-sm font-medium">No downloads in queue</p>
            <p className="text-xs text-slate-600 mt-1">
              Select any game in the storefront to download its ROM
            </p>
          </div>
        ) : (
          downloads.map((item) => {
            const isCompleted = item.status === 'completed';
            const isDownloading = item.status === 'downloading';
            const isError = item.status === 'error';

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/5 hover:border-white/15 transition-all flex flex-col gap-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                      {item.platform}
                    </span>
                    <h4 className="text-sm font-bold text-white truncate">
                      {item.game_title || item.filename}
                    </h4>
                    <span className="text-xs text-slate-400 truncate block">
                      {item.filename}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {isCompleted && (
                      <button
                        onClick={() => handleReveal(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-black text-cyan-400 transition-colors"
                        title="Show in Finder"
                      >
                        <Folder className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(item.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Remove download"
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
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${item.progress || 0}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    {isCompleted && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Completed & Ready
                      </span>
                    )}
                    {isDownloading && (
                      <span className="text-cyan-400 font-mono font-medium">
                        {item.progress ? item.progress.toFixed(1) : 0}% • {item.speed}
                      </span>
                    )}
                    {isError && (
                      <span className="text-rose-400 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Download Failed
                      </span>
                    )}
                    {item.status === 'queued' && (
                      <span className="text-amber-400 font-medium">
                        Queued...
                      </span>
                    )}

                    <span className="text-slate-500 font-mono">
                      {item.eta || ''}
                    </span>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
