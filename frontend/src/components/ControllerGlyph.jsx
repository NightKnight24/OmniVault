import React, { useState, useEffect } from 'react';

/**
 * ControllerGlyph
 * Dynamically displays authentic physical button prompts matching
 * the user's connected gamepad (DualSense, Xbox Series, Switch Pro, or 8BitDo).
 */
export default function ControllerGlyph({ 
  button = 'A', 
  size = 'md', // 'sm' | 'md' | 'lg'
  forceLayout = null // null | 'playstation' | 'xbox' | 'nintendo'
}) {
  const [layout, setLayout] = useState('xbox');

  useEffect(() => {
    if (forceLayout) {
      setLayout(forceLayout);
      return;
    }

    const detectController = () => {
      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        for (const gp of gamepads) {
          if (gp && gp.connected) {
            const id = gp.id.toLowerCase();
            if (id.includes('dualshock') || id.includes('dualsense') || id.includes('playstation') || id.includes('sony') || id.includes('054c')) {
              setLayout('playstation');
              return;
            }
            if (id.includes('nintendo') || id.includes('switch') || id.includes('pro controller') || id.includes('joy-con') || id.includes('057e')) {
              setLayout('nintendo');
              return;
            }
            if (id.includes('xbox') || id.includes('x-box') || id.includes('microsoft') || id.includes('045e')) {
              setLayout('xbox');
              return;
            }
          }
        }
      }
    };

    detectController();
    window.addEventListener('gamepadconnected', detectController);
    return () => window.removeEventListener('gamepadconnected', detectController);
  }, [forceLayout]);

  const sizeClasses = {
    sm: 'w-4 h-4 text-[9px]',
    md: 'w-5 h-5 text-[11px]',
    lg: 'w-6 h-6 text-xs'
  }[size] || 'w-5 h-5 text-[11px]';

  const btnKey = button.toUpperCase();

  // 1. PLAYSTATION GLYPHS
  if (layout === 'playstation') {
    if (btnKey === 'A' || btnKey === 'CROSS' || btnKey === 'X_BOTTOM') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-slate-900 border border-blue-500/80 text-blue-400 font-black shadow-sm select-none`}>
          ✕
        </span>
      );
    }
    if (btnKey === 'B' || btnKey === 'CIRCLE') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-slate-900 border border-rose-500/80 text-rose-400 font-black shadow-sm select-none`}>
          ○
        </span>
      );
    }
    if (btnKey === 'X' || btnKey === 'SQUARE') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-slate-900 border border-pink-500/80 text-pink-400 font-black shadow-sm select-none`}>
          □
        </span>
      );
    }
    if (btnKey === 'Y' || btnKey === 'TRIANGLE') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-slate-900 border border-emerald-500/80 text-emerald-400 font-black shadow-sm select-none`}>
          △
        </span>
      );
    }
    if (btnKey === 'GUIDE' || btnKey === 'PS') {
      return (
        <span className="px-1.5 py-0.5 rounded-md bg-blue-950 text-blue-300 border border-blue-500/50 text-[10px] font-black uppercase tracking-wider font-mono select-none">
          PS Home
        </span>
      );
    }
  }

  // 2. NINTENDO SWITCH GLYPHS (A is right, B is bottom, X is top, Y is left)
  if (layout === 'nintendo') {
    if (btnKey === 'A') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-red-950 border border-red-500 text-red-300 font-black shadow-sm select-none`}>
          A
        </span>
      );
    }
    if (btnKey === 'B') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-yellow-950 border border-amber-500 text-amber-300 font-black shadow-sm select-none`}>
          B
        </span>
      );
    }
    if (btnKey === 'X') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-blue-950 border border-blue-500 text-blue-300 font-black shadow-sm select-none`}>
          X
        </span>
      );
    }
    if (btnKey === 'Y') {
      return (
        <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-emerald-950 border border-emerald-500 text-emerald-300 font-black shadow-sm select-none`}>
          Y
        </span>
      );
    }
    if (btnKey === 'GUIDE') {
      return (
        <span className="px-1.5 py-0.5 rounded-md bg-red-950 text-red-300 border border-red-500/50 text-[10px] font-black uppercase tracking-wider font-mono select-none">
          Home
        </span>
      );
    }
  }

  // 3. XBOX DEFAULT GLYPHS (A green bottom, B red right, X blue left, Y yellow top)
  if (btnKey === 'A') {
    return (
      <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-emerald-950 border border-emerald-500 text-emerald-300 font-black shadow-sm select-none`}>
        A
      </span>
    );
  }
  if (btnKey === 'B') {
    return (
      <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-rose-950 border border-rose-500 text-rose-300 font-black shadow-sm select-none`}>
        B
      </span>
    );
  }
  if (btnKey === 'X') {
    return (
      <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-blue-950 border border-blue-500 text-blue-300 font-black shadow-sm select-none`}>
        X
      </span>
    );
  }
  if (btnKey === 'Y') {
    return (
      <span className={`${sizeClasses} inline-flex items-center justify-center rounded-full bg-amber-950 border border-amber-500 text-amber-300 font-black shadow-sm select-none`}>
        Y
      </span>
    );
  }
  if (btnKey === 'GUIDE') {
    return (
      <span className="px-1.5 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-500/50 text-[10px] font-black uppercase tracking-wider font-mono select-none">
        Guide
      </span>
    );
  }

  // General fallback keycaps (e.g. LB, RB, LT, RT, START, SELECT, F1)
  return (
    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/20 text-slate-200 text-[10px] font-bold font-mono uppercase select-none">
      {button}
    </span>
  );
}
