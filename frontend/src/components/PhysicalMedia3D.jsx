import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, Play, Pause, Sparkles, Disc, Cpu, Eye, Box, Layers, RefreshCw } from 'lucide-react';

const CARTRIDGE_PLATFORMS = new Set([
  'NES', 'SNES', 'N64', 'GB', 'GBC', 'GBA', 'Genesis', 
  'MasterSystem', 'GameGear', 'Atari2600', 'Atari5200', 'Atari7800', 'TG16'
]);

const DISC_PLATFORMS = new Set([
  'PS1', 'PS2', 'PS3', 'PS4', 'GameCube', 'Wii', 'WiiU', 
  'Saturn', 'Dreamcast', 'SegaCD', 'Xbox', 'Xbox360'
]);

const CARD_PLATFORMS = new Set(['Switch', 'NDS', '3DS', 'PSVita']);

export default function PhysicalMedia3D({ game }) {
  const platform = (game.platform || 'SNES').trim();
  const title = game.title || 'Retro Game';
  const coverUrl = game.box_art_2d && !game.box_art_2d.includes('libretro-thumbnails/MAME')
    ? game.box_art_2d
    : `/api/covers/image?title=${encodeURIComponent(title)}&platform=${encodeURIComponent(platform)}`;

  const isCart = CARTRIDGE_PLATFORMS.has(platform);
  const isDisc = DISC_PLATFORMS.has(platform);
  const isCard = CARD_PLATFORMS.has(platform);

  // 3D Rotation State
  const [rotX, setRotX] = useState(12);
  const [rotY, setRotY] = useState(-18);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAutoSpinning, setIsAutoSpinning] = useState(true);
  const [mediaView, setMediaView] = useState(isDisc ? 'disc' : 'cart'); // 'disc' | 'case' | 'cart'

  // Drag tracking
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef(null);

  // Auto-spin loop
  useEffect(() => {
    let lastTime = performance.now();
    const spinLoop = (now) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (isAutoSpinning && !isDraggingRef.current) {
        setRotY((prev) => (prev + delta * 24) % 360);
      }
      animFrameRef.current = requestAnimationFrame(spinLoop);
    };
    animFrameRef.current = requestAnimationFrame(spinLoop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isAutoSpinning]);

  // Mouse drag handlers
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    setRotY((y) => (y + dx * 0.75) % 360);
    setRotX((x) => Math.max(-65, Math.min(65, x - dy * 0.75)));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleResetOrientation = () => {
    setRotX(12);
    setRotY(isFlipped ? 180 : -18);
  };

  const handleToggleFlip = () => {
    setIsFlipped(!isFlipped);
    setRotY((y) => (y + 180) % 360);
  };

  // Determine physical colors and styling
  const getCartridgeStyle = () => {
    switch (platform) {
      case 'SNES':
        return {
          bodyColor: '#c5c7cb',
          accentColor: '#9fa3a9',
          grooveColor: '#7b7f86',
          labelRatio: 'h-[58%] w-[84%]',
          brandLabel: 'SUPER NINTENDO',
          cautionText: 'NINTENDO RESTRICTED — DO NOT TOUCH CONNECTOR TERMINALS OR BLOW INTO SLOT',
          pinCount: 62
        };
      case 'N64':
        return {
          bodyColor: '#474b53',
          accentColor: '#34373d',
          grooveColor: '#25272b',
          labelRatio: 'h-[65%] w-[86%]',
          brandLabel: 'NINTENDO 64',
          cautionText: 'MODEL NO. NUS-006 (USA) — IMPORTANT: READ INSTRUCTION BOOKLET BEFORE USE',
          pinCount: 60
        };
      case 'Genesis':
        return {
          bodyColor: '#1c1d22',
          accentColor: '#2b2d35',
          grooveColor: '#111215',
          labelRatio: 'h-[62%] w-[82%]',
          brandLabel: 'SEGA GENESIS',
          cautionText: 'PATENTS: U.S. 4,442,486 — MADE IN JAPAN — DO NOT DROP OR EXPOSE TO WATER',
          pinCount: 64
        };
      case 'GBA':
        return {
          bodyColor: '#3c404b',
          accentColor: '#2e313a',
          grooveColor: '#202228',
          labelRatio: 'h-[50%] w-[88%]',
          brandLabel: 'GAME BOY ADVANCE',
          cautionText: 'AGB-002 (USA) — FOR GBA SYSTEMS ONLY',
          pinCount: 32
        };
      case 'GB':
      case 'GBC':
        return {
          bodyColor: '#cbd1d6',
          accentColor: '#a8afb5',
          grooveColor: '#8a9198',
          labelRatio: 'h-[68%] w-[80%]',
          brandLabel: 'Nintendo GAME BOY',
          cautionText: 'MADE IN JAPAN — PAT. PEND. — DO NOT BEND OR IMMERSE IN LIQUID',
          pinCount: 32
        };
      default: // NES & Other
        return {
          bodyColor: '#a1a4a8',
          accentColor: '#878a8e',
          grooveColor: '#686b70',
          labelRatio: 'h-[68%] w-[78%]',
          brandLabel: 'Nintendo Entertainment System',
          cautionText: 'NES-GP — DO NOT STORE IN EXTREME TEMPERATURES OR REPEATEDLY POWER CYCLE',
          pinCount: 72
        };
    }
  };

  const cartSpec = getCartridgeStyle();

  return (
    <div 
      className="relative w-full h-full min-h-[360px] flex flex-col items-center justify-between p-6 select-none overflow-hidden bg-gradient-to-b from-[#0a0f1d] via-[#060a14] to-black"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Interactive Controls Overlay */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
        {isDisc && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/10">
            <button
              onClick={() => setMediaView('disc')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mediaView === 'disc'
                  ? 'bg-cyan-500 text-black shadow-glow-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              <span>Optical Disc</span>
            </button>
            <button
              onClick={() => setMediaView('case')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mediaView === 'case'
                  ? 'bg-cyan-500 text-black shadow-glow-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Jewel Case</span>
            </button>
          </div>
        )}

        <button
          onClick={() => setIsAutoSpinning(!isAutoSpinning)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border text-xs font-bold transition-all cursor-pointer ${
            isAutoSpinning
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
              : 'bg-black/60 border-white/10 text-slate-400 hover:text-white'
          }`}
          title="Toggle automatic turntable rotation"
        >
          {isAutoSpinning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isAutoSpinning ? 'Auto-Spin ON' : 'Auto-Spin OFF'}</span>
        </button>

        <button
          onClick={handleToggleFlip}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-slate-800 backdrop-blur-md border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
          title="Flip 180° to inspect rear chassis and caution label"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Flip 180°</span>
        </button>

        <button
          onClick={handleResetOrientation}
          className="p-1.5 rounded-xl bg-black/60 hover:bg-slate-800 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
          title="Reset default viewing angle"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Helpful Drag Instruction Badge */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-[11px] font-medium text-cyan-300 backdrop-blur-md">
        <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
        <span>Click & drag to inspect in 3D</span>
      </div>

      {/* 3D PERSPECTIVE VIEWPORT */}
      <div 
        className="w-full flex-1 flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={{ perspective: '1100px' }}
      >
        <div
          className="relative transition-transform duration-75 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          }}
        >
          {/* ============================================================ */}
          {/* 1. OPTICAL DISC VISUALIZER (PS1 / PS2 / Saturn / GameCube)   */}
          {/* ============================================================ */}
          {isDisc && mediaView === 'disc' && (
            <div 
              className="relative w-72 h-72 rounded-full shadow-2xl flex items-center justify-center"
              style={{
                transformStyle: 'preserve-3d',
                boxShadow: '0 25px 60px -15px rgba(0,0,0,0.85), 0 0 40px rgba(6,182,212,0.2)'
              }}
            >
              {/* Spinning Disc Face */}
              <div 
                className="absolute inset-0 rounded-full overflow-hidden border-2 border-white/20 flex items-center justify-center"
                style={{
                  background: 'conic-gradient(from 180deg at 50% 50%, #38bdf8 0deg, #ec4899 60deg, #eab308 120deg, #10b981 180deg, #6366f1 240deg, #ec4899 300deg, #38bdf8 360deg)',
                  boxShadow: 'inset 0 0 25px rgba(0,0,0,0.6)'
                }}
              >
                {/* Artwork Silk-screen Overlay */}
                <div 
                  className="absolute inset-[6%] rounded-full overflow-hidden flex flex-col justify-between p-6 text-center border border-white/30"
                  style={{
                    backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.85) 100%), url(${coverUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  <div className="z-10 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white drop-shadow-md bg-black/60 px-2 py-0.5 rounded">
                      {platform}
                    </span>
                    <span className="text-[9px] font-mono text-cyan-300 drop-shadow bg-black/60 px-1.5 py-0.5 rounded">
                      COMPACT DISC
                    </span>
                  </div>

                  <div className="z-10">
                    <h4 className="font-display font-black text-xs text-white uppercase tracking-tight drop-shadow-lg px-2 line-clamp-2">
                      {title}
                    </h4>
                  </div>
                </div>

                {/* Iridescent Rainbow Laser Glare Overlay */}
                <div 
                  className="absolute inset-0 rounded-full pointer-events-none mix-blend-color-dodge opacity-60"
                  style={{
                    background: 'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.4) 30deg, transparent 60deg, transparent 180deg, rgba(255,255,255,0.4) 210deg, transparent 240deg)'
                  }}
                />

                {/* Clear Polycarbonate Inner Ring Spindle */}
                <div 
                  className="absolute w-28 h-28 rounded-full border-4 border-white/40 shadow-inner flex items-center justify-center"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(0,0,0,0.7) 100%)',
                    backdropFilter: 'blur(3px)'
                  }}
                >
                  {/* Laser serial stamp */}
                  <span className="absolute text-[8px] font-mono text-slate-400 rotate-45 tracking-widest uppercase">
                    OMNI-CD-{platform}-001
                  </span>

                  {/* Spindle Center Hole */}
                  <div className="w-10 h-10 rounded-full bg-[#060a14] border-2 border-white/50 shadow-inner" />
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* 2. JEWEL CASE / DVD CASE VISUALIZER                          */}
          {/* ============================================================ */}
          {isDisc && mediaView === 'case' && (
            <div 
              className="relative w-64 h-80 rounded-lg shadow-2xl flex items-center justify-center"
              style={{
                transformStyle: 'preserve-3d',
                background: '#0d111a',
                border: '2px solid rgba(255,255,255,0.25)',
                boxShadow: '0 30px 70px -15px rgba(0,0,0,0.9), 0 0 35px rgba(6,182,212,0.25)'
              }}
            >
              {/* Jewel Case Spine */}
              <div 
                className="absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-slate-900 to-black border-r border-white/20 flex flex-col justify-between py-4 text-center"
                style={{ transform: 'rotateY(-90deg) translateZ(10px)' }}
              >
                <span className="text-[7px] font-mono font-bold text-cyan-400 -rotate-90 origin-center whitespace-nowrap">
                  {platform}
                </span>
                <span className="text-[8px] font-black text-white -rotate-90 origin-center whitespace-nowrap line-clamp-1">
                  {title}
                </span>
              </div>

              {/* Front Insert Cover Art */}
              <div className="w-full h-full p-2.5 rounded-lg overflow-hidden flex flex-col">
                <img
                  src={coverUrl}
                  alt={title}
                  className="w-full flex-1 object-cover rounded shadow"
                />
              </div>

              {/* Holographic Case Sheen Reflection */}
              <div 
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 40%, rgba(255,255,255,0.08) 70%, transparent 100%)'
                }}
              />
            </div>
          )}

          {/* ============================================================ */}
          {/* 3. RETRO CARTRIDGE VISUALIZER (SNES, NES, N64, GBA, Genesis) */}
          {/* ============================================================ */}
          {(isCart || isCard || (!isDisc)) && (
            <div
              className="relative w-64 h-80 rounded-2xl flex flex-col items-center justify-between p-3.5 shadow-2xl"
              style={{
                transformStyle: 'preserve-3d',
                backgroundColor: cartSpec.bodyColor,
                border: `2px solid ${cartSpec.accentColor}`,
                boxShadow: '0 30px 65px -15px rgba(0,0,0,0.85), 0 0 30px rgba(0,0,0,0.5)',
              }}
            >
              {/* FRONT OF CARTRIDGE */}
              <div 
                className={`w-full h-full flex flex-col justify-between ${isFlipped ? 'hidden' : 'flex'}`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                {/* Top Grip Ridges & Logo */}
                <div className="w-full flex items-center justify-between px-2 pt-1 pb-2 border-b border-black/20">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: cartSpec.grooveColor }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-black/75 drop-shadow-sm font-display">
                    {cartSpec.brandLabel}
                  </span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="w-1.5 h-3.5 rounded-full" style={{ backgroundColor: cartSpec.grooveColor }} />
                    ))}
                  </div>
                </div>

                {/* Central Glossy Label Sticker */}
                <div 
                  className={`mx-auto ${cartSpec.labelRatio} my-2 rounded-xl border-2 border-black/30 overflow-hidden relative shadow-inner bg-slate-950 flex flex-col`}
                >
                  <img
                    src={coverUrl}
                    alt={title}
                    className="w-full flex-1 object-cover"
                  />
                  
                  {/* Glossy Reflection Bar */}
                  <div 
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 45%, rgba(255,255,255,0.15) 75%, transparent 100%)'
                    }}
                  />
                  
                  {/* Authentic Vintage Label Bottom Strip */}
                  <div className="bg-black/90 px-2 py-1 flex items-center justify-between text-[9px] font-mono text-slate-300">
                    <span className="truncate max-w-[140px] font-bold text-white uppercase">{title}</span>
                    <span className="text-cyan-400 font-black">{platform}</span>
                  </div>
                </div>

                {/* Bottom Connector Socket & Gold Contact Pins */}
                <div 
                  className="w-full h-8 rounded-lg border border-black/40 flex items-center justify-center px-3 relative overflow-hidden"
                  style={{ backgroundColor: '#18191c' }}
                >
                  {/* Gold Pins */}
                  <div className="w-full flex justify-between gap-[2px] opacity-90">
                    {Array.from({ length: 28 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="w-1 h-5 rounded-t-[1px]"
                        style={{
                          background: 'linear-gradient(to bottom, #f59e0b, #d97706, #92400e)'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* REAR OF CARTRIDGE (Shown when flipped) */}
              <div 
                className={`w-full h-full flex flex-col justify-between p-2 ${isFlipped ? 'flex' : 'hidden'}`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="w-full flex justify-between items-center px-2 pt-1 border-b border-black/20">
                  <span className="text-[9px] font-bold text-black/60 uppercase">OFFICIAL NINTENDO / SEGA REAR CASING</span>
                  <span className="text-[9px] font-mono text-black/60">MADE IN JAPAN</span>
                </div>

                {/* Vintage Rear Caution & Precautions Sticker */}
                <div className="my-auto mx-auto w-[90%] p-3.5 rounded-xl border border-black/30 bg-[#f4ebd0] text-[#222] shadow-md flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-black/20 pb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-700">
                      ★ IMPORTANT PRECAUTIONS ★
                    </span>
                    <span className="text-[8px] font-mono font-bold text-black/60">REV-A</span>
                  </div>
                  <p className="text-[8px] leading-relaxed font-sans font-medium text-[#333]">
                    1. Do not subject cartridge to extreme heat, cold, or direct sunlight.
                  </p>
                  <p className="text-[8px] leading-relaxed font-sans font-medium text-[#333]">
                    2. Do not immerse in water or clean with solvents. Use 91% isopropyl alcohol.
                  </p>
                  <p className="text-[8px] leading-relaxed font-sans font-medium text-[#333]">
                    3. Do not touch gold edge connector terminals with bare fingers.
                  </p>
                  <div className="pt-1 border-t border-black/10 flex items-center justify-between text-[7px] font-mono font-bold text-slate-700">
                    <span>OMNIVAULT DIGITAL PRESERVATION</span>
                    <span>{cartSpec.pinCount}-PIN INTERFACE</span>
                  </div>
                </div>

                {/* Gold pins on bottom */}
                <div 
                  className="w-full h-8 rounded-lg border border-black/40 flex items-center justify-center px-3 relative overflow-hidden"
                  style={{ backgroundColor: '#18191c' }}
                >
                  <div className="w-full flex justify-between gap-[2px] opacity-90">
                    {Array.from({ length: 28 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="w-1 h-5 rounded-t-[1px]"
                        style={{
                          background: 'linear-gradient(to bottom, #f59e0b, #d97706, #92400e)'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info Pill */}
      <div className="z-10 mt-3 flex items-center gap-2 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">{title}</span>
        <span>•</span>
        <span className="text-cyan-400 font-bold uppercase">{platform} {isDisc ? 'Optical Media' : 'Solid-State Cartridge'}</span>
      </div>
    </div>
  );
}
