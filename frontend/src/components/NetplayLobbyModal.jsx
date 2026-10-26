import React, { useState, useEffect } from 'react';
import { 
  X, Users, Globe, Play, Sparkles, Radio, Key, 
  RefreshCw, CheckCircle2, Copy, Shield, Trophy
} from 'lucide-react';
import { fetchNetplayLobbies, createNetplayLobby, joinNetplayLobby } from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

export default function NetplayLobbyModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'host' | 'code'
  const [lobbies, setLobbies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Host form
  const [hostTitle, setHostTitle] = useState('Super Smash Bros. Melee');
  const [hostPlatform, setHostPlatform] = useState('GameCube');
  const [hostCore, setHostCore] = useState('Dolphin Netplay');
  const [hostMaxPlayers, setHostMaxPlayers] = useState(4);
  const [hostLoading, setHostLoading] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);

  // Join by code
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [connectedSession, setConnectedSession] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadLobbies();
    }
  }, [isOpen]);

  const loadLobbies = async () => {
    setLoading(true);
    try {
      const res = await fetchNetplayLobbies();
      setLobbies(res.lobbies || []);
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

  const handleHost = async (e) => {
    e.preventDefault();
    playClick();
    setHostLoading(true);
    try {
      const res = await createNetplayLobby({
        title: hostTitle,
        platform: hostPlatform,
        core: hostCore,
        max_players: hostMaxPlayers
      });
      playVictorySound();
      setCreatedRoom(res);
      showToast(res.message);
      loadLobbies();
    } catch (e) {
      showToast('Failed to create lobby: ' + e.message);
    } finally {
      setHostLoading(false);
    }
  };

  const handleJoin = async (codeToJoin) => {
    const code = codeToJoin || joinCode;
    if (!code.trim()) return;
    playClick();
    setJoining(true);
    try {
      const res = await joinNetplayLobby({ room_code: code });
      playVictorySound();
      setConnectedSession(res);
      showToast(res.message);
    } catch (e) {
      showToast('Failed to connect: ' + e.message);
    } finally {
      setJoining(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#090d18] border border-cyan-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-black font-black shadow-glow-cyan">
              <Globe className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-white text-base tracking-wide">
                  OmniNet: Couch P2P Netplay
                </h3>
                <span className="px-2 py-0.2 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700 text-[10px] font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  P2P Matchmaking
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Play 2-to-4 player arcade and console classics online with friends with zero port forwarding
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
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'browse' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Active Lobbies ({lobbies.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('host')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'host' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Host Room</span>
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'code' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Connect by Code</span>
          </button>
        </div>

        {/* Toast */}
        {toastMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-cyan-950 border border-cyan-400 text-cyan-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          
          {/* TAB 1: BROWSE ACTIVE LOBBIES */}
          {activeTab === 'browse' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                <span>Live Multiplayer Rooms</span>
                <button 
                  onClick={loadLobbies}
                  className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="space-y-2.5">
                {lobbies.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-900/50 border border-dashed border-white/10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">No Active Netplay Lobbies</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                        No players are currently hosting a netplay match on your network. Click <strong>Host Match</strong> to create a session with RetroArch Netplay flags.
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('host')}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs cursor-pointer"
                    >
                      Host a Match Now
                    </button>
                  </div>
                ) : (
                  lobbies.map((l) => (
                    <div
                      key={l.code}
                      className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 hover:border-cyan-500/40 flex items-center justify-between gap-4 transition-all group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                            {l.code}
                          </span>
                          <span className="text-xs font-black text-white truncate">
                            {l.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span>Host: <strong className="text-slate-200">{l.host}</strong></span>
                          <span>•</span>
                          <span>Players: <strong className="text-cyan-400">{l.players}/{l.max_players}</strong></span>
                          <span>•</span>
                          <span className="text-emerald-400 font-mono">{l.host_ip ? `${l.host_ip}:${l.port || 55435}` : 'Direct LAN'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleJoin(l.code)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-md flex-shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 fill-black" />
                        <span>Join Room</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HOST A ROOM */}
          {activeTab === 'host' && (
            <form onSubmit={handleHost} className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Host New Match</span>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Game Title</label>
                  <input
                    type="text"
                    value={hostTitle}
                    onChange={(e) => setHostTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Mario Kart 64"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Platform</label>
                    <select
                      value={hostPlatform}
                      onChange={(e) => setHostPlatform(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value="GameCube">Nintendo GameCube</option>
                      <option value="N64">Nintendo 64</option>
                      <option value="Arcade">Arcade (MAME / FB Neo)</option>
                      <option value="SNES">Super Nintendo</option>
                      <option value="Genesis">Sega Genesis</option>
                      <option value="PS1">PlayStation 1</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Max Players</label>
                    <select
                      value={hostMaxPlayers}
                      onChange={(e) => setHostMaxPlayers(parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value={2}>2 Players</option>
                      <option value={4}>4 Players</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={hostLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  <Radio className="w-4 h-4" />
                  <span>{hostLoading ? 'Broadcasting Room...' : 'Start Netplay Session'}</span>
                </button>
              </div>

              {createdRoom && (
                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-2 animate-in fade-in">
                  <div className="text-[11px] uppercase font-bold text-emerald-400">Room Ready to Share</div>
                  <div className="text-2xl font-black font-mono tracking-widest text-white">{createdRoom.room_code}</div>
                  <p className="text-xs text-slate-300">Give this 6-digit code to your friends to connect!</p>
                </div>
              )}
            </form>
          )}

          {/* TAB 3: JOIN BY CODE */}
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Enter 6-Digit Netplay Room Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. OMNI-7712"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono tracking-widest text-center text-sm font-bold focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() => handleJoin()}
                    disabled={joining || !joinCode.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Connect</span>
                  </button>
                </div>
              </div>

              {connectedSession && (
                <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Match Connection Established</span>
                  </div>
                  <div className="text-sm font-bold text-white">{connectedSession.game_title}</div>
                  <div className="text-xs text-slate-300">
                    Slot: <strong className="text-emerald-400">{connectedSession.assigned_player_slot}</strong> • Mode: P2P Direct
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span>Integrated with RetroArch & Dolphin Netplay Engines</span>
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
