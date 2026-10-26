import React, { useState } from 'react';
import { 
  X, Palette, Sparkles, Check, RefreshCw, Wand2, 
  Layers, Tv, Eye, Sliders
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { generateAITheme, saveTheme } from '../services/api';
import { playClick, playVictorySound } from '../utils/soundEffects';

const PRESET_THEMES = [
  {
    id: 'vaporwave_sunset',
    name: 'Vaporwave Sunset',
    description: 'Neon magenta and cyan retro outrun aesthetic',
    accent: '#f43f5e',
    accentSecondary: '#06b6d4',
    bgBase: '#0b0618',
    glow: 'rgba(244, 63, 94, 0.55)'
  },
  {
    id: 'cyberpunk_neon',
    name: 'Cyberpunk Neon 2077',
    description: 'High-voltage electric violet and laser cyan',
    accent: '#a855f7',
    accentSecondary: '#06b6d4',
    bgBase: '#090514',
    glow: 'rgba(168, 85, 247, 0.55)'
  },
  {
    id: 'dmg_olive',
    name: 'Game Boy DMG Olive',
    description: 'Nostalgic 4-shade green monochrome LCD palette',
    accent: '#84cc16',
    accentSecondary: '#65a30d',
    bgBase: '#0c1208',
    glow: 'rgba(132, 204, 22, 0.45)'
  },
  {
    id: 'ps2_midnight',
    name: 'PS2 Midnight Blue',
    description: 'Deep cobalt blue and glowing crystal boot screen',
    accent: '#0044cc',
    accentSecondary: '#38bdf8',
    bgBase: '#02050f',
    glow: 'rgba(0, 68, 204, 0.55)'
  },
  {
    id: 'atari_woodgrain',
    name: 'Atari 2600 Woodgrain',
    description: 'Warm amber, vintage orange, and rich walnut brown',
    accent: '#d97706',
    accentSecondary: '#f59e0b',
    bgBase: '#0e0904',
    glow: 'rgba(217, 119, 6, 0.5)'
  },
  {
    id: 'matrix_terminal',
    name: 'CRT Matrix Terminal',
    description: 'Phosphor green matrix terminal with scanline glow',
    accent: '#22c55e',
    accentSecondary: '#4ade80',
    bgBase: '#030804',
    glow: 'rgba(34, 197, 94, 0.6)'
  }
];

export default function ThemeStudioModal({ isOpen, onClose }) {
  const { currentTheme, selectTheme, reloadThemes } = useTheme();
  const [activeTab, setActiveTab] = useState('presets'); // 'presets' | 'ai' | 'custom'
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  // Custom palette state
  const [customAccent, setCustomAccent] = useState('#00d2ff');
  const [customBg, setCustomBg] = useState('#070c16');
  const [customName, setCustomName] = useState('My Custom Theme');

  if (!isOpen) return null;

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleApplyPreset = async (preset) => {
    playClick();
    const themePayload = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      theme_data: {
        accent: preset.accent,
        accentSecondary: preset.accentSecondary,
        glow: preset.glow,
        bgBase: preset.bgBase,
        bgCard: '#0f172a',
        bgCardHover: '#1e293b',
        border: `${preset.accent}40`,
        textPrimary: '#ffffff',
        textMuted: '#94a3b8',
        mode: 'hybrid'
      }
    };
    try {
      await saveTheme(themePayload);
      await selectTheme(preset.id);
      playVictorySound();
      showToast(`Activated '${preset.name}'`);
    } catch (e) {
      showToast('Could not save theme');
    }
  };

  const handleGenerateAI = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    playClick();
    setGeneratingAI(true);
    try {
      const res = await generateAITheme(aiPrompt.trim());
      if (res.theme) {
        await saveTheme(res.theme);
        await selectTheme(res.theme.id);
        playVictorySound();
        showToast(`AI Theme '${res.theme.name}' Synthesized & Activated!`);
      }
    } catch (e) {
      showToast('AI theme generation failed: ' + e.message);
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSaveCustom = async (e) => {
    e.preventDefault();
    playClick();
    const customId = `custom_${Date.now()}`;
    const payload = {
      id: customId,
      name: customName || 'Custom Palette',
      description: 'Handcrafted custom user theme',
      theme_data: {
        accent: customAccent,
        accentSecondary: customAccent,
        glow: `${customAccent}66`,
        bgBase: customBg,
        bgCard: '#111827',
        bgCardHover: '#1f2937',
        border: `${customAccent}40`,
        textPrimary: '#ffffff',
        textMuted: '#94a3b8',
        mode: 'hybrid'
      }
    };
    try {
      await saveTheme(payload);
      await selectTheme(customId);
      playVictorySound();
      showToast(`Saved and applied '${payload.name}'`);
    } catch (e) {
      showToast('Save failed: ' + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#090d18] border border-cyan-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-fuchsia-500 via-violet-500 to-cyan-500 flex items-center justify-center text-white font-black shadow-glow-cyan">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-white text-base tracking-wide">
                  Theme Studio & Ambience Generator
                </h3>
                <span className="px-2 py-0.2 rounded-full bg-violet-950 text-violet-300 border border-violet-700 text-[10px] font-mono font-bold">
                  AI Powered
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Transform OmniVault into authentic arcade, retro console, or futuristic aesthetic colorways
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
            onClick={() => setActiveTab('presets')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'presets' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Nostalgic Presets</span>
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'ai' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            <span>AI Theme Generator</span>
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'custom' ? 'bg-cyan-500 text-black font-black shadow-glow-cyan' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Custom Palette</span>
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
          
          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-2 gap-3.5">
              {PRESET_THEMES.map((p) => {
                const isActive = currentTheme?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleApplyPreset(p)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group hover:scale-[1.02] ${
                      isActive 
                        ? 'border-cyan-400 bg-slate-900 shadow-glow-cyan' 
                        : 'border-white/10 bg-slate-900/70 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-4 h-4 rounded-full shadow-md"
                            style={{ backgroundColor: p.accent }}
                          />
                          <span 
                            className="w-4 h-4 rounded-full shadow-md"
                            style={{ backgroundColor: p.accentSecondary }}
                          />
                        </div>
                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-400">
                            <Check className="w-3.5 h-3.5" />
                            Active
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-white mb-1">{p.name}</h4>
                      <p className="text-[11px] text-slate-400 leading-snug">{p.description}</p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Click to Apply</span>
                      <span style={{ color: p.accent }}>Preview Glow</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: AI THEME SYNTHESIZER */}
          {activeTab === 'ai' && (
            <form onSubmit={handleGenerateAI} className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Synthesize Theme from Semantic Mood</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Describe a mood, retro game, anime, or aesthetic (e.g. <em>"Metroid Norfair Lava"</em>, <em>"Tokyo Neo-Tokyo Rain"</em>, <em>"Zelda Hyrule Castle Gold"</em>). OmniAI will calculate balanced background harmonies and glowing accents.
                </p>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Cyberpunk Synthwave Outrun..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={generatingAI || !aiPrompt.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{generatingAI ? 'Synthesizing...' : 'Generate Theme'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 3: CUSTOM PALETTE */}
          {activeTab === 'custom' && (
            <form onSubmit={handleSaveCustom} className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Theme Name</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Glow Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customAccent}
                        onChange={(e) => setCustomAccent(e.target.value)}
                        className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-white uppercase">{customAccent}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Background Base Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customBg}
                        onChange={(e) => setCustomBg(e.target.value)}
                        className="w-10 h-10 rounded-xl bg-transparent border-0 cursor-pointer"
                      />
                      <span className="font-mono text-xs text-white uppercase">{customBg}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Save & Apply Custom Theme</span>
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span>Real-time CSS Variable Injection & GPU Shimmer</span>
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
