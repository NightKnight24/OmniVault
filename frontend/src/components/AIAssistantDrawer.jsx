import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Sparkles, Send, X, Gamepad2, Download, ExternalLink, 
  RotateCcw, HelpCircle, ChevronRight, Star, ShieldCheck, Zap,
  Mic, MicOff, Volume2, VolumeX
} from 'lucide-react';
import { chatWithAI, fetchAISuggestions } from '../services/api';

export default function AIAssistantDrawer({ 
  isOpen, 
  onClose, 
  onSelectGame, 
  onQuickDownload,
  totalGames
}) {
  const [messages, setMessages] = useState(() => [
    {
      sender: 'ai',
      text: `👋 **Greetings, Vault Hunter! I'm OmniAI.**\n\nI am an embedded AI assistant running 100% locally and offline on your Mac${totalGames ? `, indexing over ${totalGames.toLocaleString()} classic games in your vault` : ', indexing classic games in your vault'}. Ask me for recommendations, hidden gems, emulator setups (RetroArch / OpenEmu / Dolphin), or secret cheat codes!`,
      games: [],
      suggestions: [
        "💎 Best hidden gems on Saturn & Dreamcast",
        "⚔️ Top 90s RPGs on SNES & PS1",
        "👥 2-player co-op classics",
        "🛡️ How do I use cheats in RetroArch?"
      ]
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const speakText = (text) => {
    if (!speechEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*#_`>]/g, '').replace(/https?:\/\/\S+/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone voice recognition is not supported in this browser engine.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      handleSend(transcript);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    rec.start();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (totalGames && messages.length === 1 && messages[0].sender === 'ai') {
      setMessages([
        {
          ...messages[0],
          text: `👋 **Greetings, Vault Hunter! I'm OmniAI.**\n\nI am an embedded AI assistant running 100% locally and offline on your Mac, indexing over ${totalGames.toLocaleString()} classic games in your vault. Ask me for recommendations, hidden gems, emulator setups (RetroArch / OpenEmu / Dolphin), or secret cheat codes!`
        }
      ]);
    }
  }, [totalGames]);

  const handleSend = async (textToSend) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg = { sender: 'user', text: query };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = newMessages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const res = await chatWithAI(query, historyPayload);
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: res.reply || "I found some great classics in your vault!",
          games: res.games || [],
          suggestions: res.suggestions || [],
          walkthrough_guide: res.walkthrough_guide || null,
          online_grounded: res.online_grounded || false
        }
      ]);
      if (res.reply) {
        speakText(res.reply);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: "⚠️ Sorry, I had trouble querying the vault. Please try asking again!",
          games: [],
          suggestions: ["Best SNES RPGs", "Show me Dreamcast games"]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Drawer Container */}
      <div className="w-full max-w-lg bg-[#0a0f1d] border-l border-white/10 h-full flex flex-col shadow-2xl relative">
        
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-sky-400 to-violet-600 flex items-center justify-center shadow-glow-cyan text-black">
              <Bot className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-sm tracking-wider text-white">
                  OmniAI Copilot
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Local AI
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                73,906+ Preserved Games • Retro Knowledge Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !speechEnabled;
                setSpeechEnabled(next);
                if (!next && typeof window !== 'undefined' && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
              }}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                speechEnabled ? 'bg-cyan-950 text-cyan-400 border border-cyan-700 shadow-glow-cyan' : 'bg-slate-900 text-slate-400 hover:text-white border border-white/10'
              }`}
              title={speechEnabled ? "Voice Narration ACTIVE (Speaking responses)" : "Enable Spoken Walkthroughs"}
            >
              {speechEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-5">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Message Bubble */}
              <div
                className={`max-w-[92%] rounded-2xl p-4 text-xs md:text-sm leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-semibold shadow-md rounded-br-none'
                    : 'bg-slate-900/90 border border-white/10 text-slate-100 rounded-bl-none shadow-sm'
                }`}
              >
                <div className="whitespace-pre-line font-normal">
                  {m.text}
                </div>

                {/* Live Strategy Guide & Walkthrough Grounding Card */}
                {m.walkthrough_guide && (
                  <div className="mt-3.5 p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{m.walkthrough_guide.source}</span>
                      </div>
                      {m.walkthrough_guide.title && (
                        <span className="text-cyan-400/80 flex items-center gap-1 text-[11px] font-semibold">
                          Internal Guide
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono font-medium truncate">
                      📍 {m.walkthrough_guide.title}
                    </div>
                  </div>
                )}

                {/* Recommended Game Action Cards */}
                {m.games && m.games.length > 0 && (
                  <div className="mt-3.5 space-y-2 pt-3 border-t border-white/10">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 block mb-2">
                      Interactive Game Cards ({m.games.length})
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {m.games.map((g) => (
                        <div
                          key={g.id}
                          className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 hover:border-cyan-500/50 flex items-center justify-between gap-3 group transition-all"
                        >
                          <div 
                            onClick={() => onSelectGame(g)}
                            className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
                          >
                            <img
                              src={g.box_art_2d || `/api/covers/image?title=${encodeURIComponent(g.title)}&platform=${encodeURIComponent(g.platform)}`}
                              alt={g.title}
                              className="w-10 h-12 object-cover rounded-lg bg-black border border-white/10 flex-shrink-0"
                              onError={(e) => { e.currentTarget.src = `/api/covers/image?title=${encodeURIComponent(g.title)}&platform=${encodeURIComponent(g.platform)}`; }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                                  {g.platform}
                                </span>
                                <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 fill-amber-400" />
                                  {g.rating ? g.rating.toFixed(1) : '4.8'}
                                </span>
                              </div>
                              <h5 className="font-bold text-xs text-white truncate group-hover:text-cyan-300 transition-colors">
                                {g.title}
                              </h5>
                              <p className="text-[10px] text-slate-400 truncate">
                                {g.genre} • {g.file_size_mb} MB
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => onQuickDownload(g)}
                              className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-transform active:scale-95 cursor-pointer shadow-sm"
                              title="Download to /Volumes/ROMS"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onSelectGame(g)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-transform active:scale-95 cursor-pointer"
                              title="View details, cheats and trailer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Dynamic Suggestion Chips */}
              {m.suggestions && m.suggestions.length > 0 && idx === messages.length - 1 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pl-1">
                  {m.suggestions.map((s, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={() => handleSend(s)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-900 border border-white/10 text-cyan-400 text-xs w-fit">
              <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
              <span>OmniAI is thinking and querying the retro vault...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-white/10 bg-slate-950/90">
          <div className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-2xl p-1.5 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening... Speak your question now!" : "Ask for recommendations, cheats, hidden gems..."}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none"
              disabled={loading}
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                isListening 
                  ? 'bg-rose-500 text-white animate-pulse shadow-glow-rose' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400'
              }`}
              title={isListening ? "Listening to your voice..." : "Voice Input (Push-to-Talk)"}
            >
              {isListening ? <Mic className="w-3.5 h-3.5 animate-bounce" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1">
            <span>Powered by OmniAI • Instant & 100% Offline</span>
            <span>Press Enter to send</span>
          </div>
        </div>

      </div>
    </div>
  );
}
