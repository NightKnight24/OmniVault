import React, { useState, useEffect } from 'react';
import { 
  X, Globe, Server, CheckCircle2, AlertCircle, RefreshCw, 
  Download, Search, ExternalLink, Zap, ShieldCheck, Activity, Layers
} from 'lucide-react';
import { fetchMirrorSources, searchMirrors, importAndDownloadMirror, testMirrorSource } from '../services/api';

export default function MirrorsHubModal({ isOpen, onClose, onDownloadQueued }) {
  const [sources, setSources] = useState([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [isPinging, setIsPinging] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  
  // Downloading state
  const [downloadingUrl, setDownloadingUrl] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  const loadSources = async () => {
    setIsLoadingSources(true);
    try {
      const data = await fetchMirrorSources();
      setSources(data.sources || []);
    } catch (err) {
      console.error('Failed to load mirror sources:', err);
    } finally {
      setIsLoadingSources(false);
    }
  };

  const handlePingAll = async () => {
    setIsPinging(true);
    try {
      const data = await fetchMirrorSources();
      setSources(data.sources || []);
    } catch (err) {
      console.error('Ping failed:', err);
    } finally {
      setIsPinging(false);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);
    setDownloadSuccess('');

    try {
      const data = await searchMirrors(searchQuery.trim(), selectedPlatform || null, selectedSource || null);
      setSearchResults(data.results || []);
      if (data.results?.length === 0) {
        setSearchError('No matching ROMs found across selected sources.');
      }
    } catch (err) {
      setSearchError(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportDownload = async (item) => {
    setDownloadingUrl(item.direct_url);
    try {
      await importAndDownloadMirror({
        title: item.title,
        platform: item.platform,
        direct_url: item.direct_url,
        filename: item.filename,
        source_name: item.source_name
      });
      setDownloadSuccess(`Queued download for "${item.title}" via ${item.source_name}! Check Downloads tab.`);
      if (onDownloadQueued) onDownloadQueued();
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingUrl(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#121620] border border-cyan-500/30 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl shadow-cyan-950/50 overflow-hidden text-slate-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-inner">
              <Globe className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">ROM Scraper & Mirror Network</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {sources.length || 9} Sources Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Multi-source scraping & resilient automated failover across top retro & handheld preservation archives
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePingAll}
              disabled={isPinging}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-cyan-400' : ''}`} />
              {isPinging ? 'Pinging...' : 'Ping Latency'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Automated Failover Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-blue-950/20 to-transparent border border-cyan-500/20 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-cyan-300">Automated Zero-Downtime Mirror Failover: </span>
              If any ROM download encounters a network error, OmniVault automatically queries this mirror network in the background, verifies an active high-speed direct mirror or verified P2P torrent, and seamlessly completes the download.
            </div>
          </div>

          {/* Sources Status Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Active Preservation Sources & Mirror Hubs
              </h3>
              <span className="text-xs text-slate-400">All sources monitored live</span>
            </div>

            {isLoadingSources ? (
              <div className="py-8 flex justify-center items-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                Querying source health & latencies...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-semibold text-sm text-slate-200">{src.name}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                          src.status === 'online' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {src.status === 'online' ? `${src.latency_ms || 240}ms` : 'Degraded'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
                        {src.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        {src.supports_direct_download ? (
                          <span className="text-cyan-400 flex items-center gap-1 font-medium">
                            <Zap className="w-3 h-3 text-cyan-400" />
                            Direct Download
                          </span>
                        ) : (
                          <span className="text-slate-400">P2P & Web Mirror</span>
                        )}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Internal
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unified Search Section */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Search className="w-4 h-4 text-cyan-400" />
                Search & Scrape Across All Mirrors
              </h3>
              <div className="flex gap-1.5">
                {['Kid Icarus (3DS)', 'Gravity Rush (PSVita)', 'Persona 4', 'Pokemon', 'Zelda'].map((sample) => (
                  <button
                    key={sample}
                    onClick={() => {
                      const clean = sample.split(' (')[0];
                      const plat = sample.includes('3DS') ? '3DS' : sample.includes('PSVita') ? 'PSVita' : '';
                      setSearchQuery(clean);
                      if (plat) setSelectedPlatform(plat);
                    }}
                    className="px-2 py-0.5 text-[11px] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input Bar */}
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter game title (e.g. Kid Icarus, Gravity Rush, Persona 4 Golden, Chrono Trigger)..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Platform Filter */}
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Platforms</option>
                <option value="3DS">Nintendo 3DS</option>
                <option value="PSVita">PlayStation Vita</option>
                <option value="NDS">Nintendo DS / DSi</option>
                <option value="PSP">Sony PSP</option>
                <option value="Switch">Nintendo Switch</option>
                <option value="PS1">Sony PlayStation 1</option>
                <option value="PS2">Sony PlayStation 2</option>
                <option value="PS3">Sony PlayStation 3</option>
                <option value="GameCube">Nintendo GameCube</option>
                <option value="Wii">Nintendo Wii</option>
                <option value="N64">Nintendo 64</option>
                <option value="GBA">Game Boy Advance</option>
                <option value="SNES">Super Nintendo</option>
                <option value="Genesis">Sega Genesis</option>
                <option value="Dreamcast">Sega Dreamcast</option>
              </select>

              {/* Source Filter */}
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All 9 Sources (Simultaneous)</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-900/30 disabled:opacity-50"
              >
                {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {isSearching ? 'Scraping...' : 'Search Mirrors'}
              </button>
            </form>

            {/* Success Message Banner */}
            {downloadSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-xs text-emerald-300 flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {downloadSuccess}
              </div>
            )}

            {/* Error Message */}
            {searchError && (
              <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                {searchError}
              </div>
            )}

            {/* Results Grid */}
            {searchResults.length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                  <span>Found {searchResults.length} ROMs Across Sources:</span>
                  <span className="text-[11px] text-cyan-400">⚡ Direct downloads & P2P prioritized</span>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-4 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-slate-200 truncate">{item.title}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-cyan-400 border border-slate-700">
                            {item.platform}
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
                            {item.source_name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.filename || item.title}
                          {item.file_size_mb > 0 && ` • ${item.file_size_mb} MB`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleImportDownload(item)}
                          disabled={downloadingUrl === (item.direct_url || item.magnet_uri)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingUrl === (item.direct_url || item.magnet_uri) ? 'Queueing...' : 'Download via Mirror'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Automatic mirror fallback active on all OmniVault downloads</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
