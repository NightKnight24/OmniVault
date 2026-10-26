import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchThemes, activateTheme } from '../services/api';

const ThemeContext = createContext();

export const CONSOLE_PALETTES = {
  // PlayStation Family
  PS1: { name: 'PlayStation', primary: '#003791', accent: '#00f0ff', glow: 'rgba(0, 55, 145, 0.5)', bg: '#030814' },
  PS2: { name: 'PlayStation 2', primary: '#002b70', accent: '#3b82f6', glow: 'rgba(59, 130, 246, 0.5)', bg: '#02050e' },
  PS3: { name: 'PlayStation 3', primary: '#001a40', accent: '#60a5fa', glow: 'rgba(96, 165, 250, 0.45)', bg: '#020409' },
  PS4: { name: 'PlayStation 4', primary: '#003087', accent: '#006fee', glow: 'rgba(0, 111, 238, 0.5)', bg: '#010511' },
  PSP: { name: 'PlayStation Portable', primary: '#00439c', accent: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', bg: '#030712' },
  PSVita: { name: 'PlayStation Vita', primary: '#003791', accent: '#00d2ff', glow: 'rgba(0, 210, 255, 0.5)', bg: '#030814' },
  PSTV: { name: 'PlayStation TV', primary: '#003791', accent: '#00d2ff', glow: 'rgba(0, 210, 255, 0.5)', bg: '#030814' },

  // Xbox Family
  Xbox: { name: 'Original Xbox', primary: '#107c10', accent: '#52b788', glow: 'rgba(16, 124, 16, 0.55)', bg: '#020d04' },
  Xbox360: { name: 'Xbox 360', primary: '#5dc21e', accent: '#9bf00b', glow: 'rgba(93, 194, 30, 0.5)', bg: '#050f02' },

  // Nintendo Family
  NES: { name: 'Nintendo Entertainment System', primary: '#e60012', accent: '#ef4444', glow: 'rgba(230, 0, 18, 0.45)', bg: '#0e0506' },
  SNES: { name: 'Super Nintendo', primary: '#6d28d9', accent: '#a78bfa', glow: 'rgba(109, 40, 217, 0.5)', bg: '#090514' },
  N64: { name: 'Nintendo 64', primary: '#eab308', accent: '#ef4444', glow: 'rgba(234, 179, 8, 0.45)', bg: '#0c0a04' },
  GameCube: { name: 'Nintendo GameCube', primary: '#654597', accent: '#c084fc', glow: 'rgba(101, 69, 151, 0.55)', bg: '#0a0614' },
  Wii: { name: 'Nintendo Wii', primary: '#00a4e4', accent: '#e0f2fe', glow: 'rgba(0, 164, 228, 0.45)', bg: '#040b14' },
  Switch: { name: 'Nintendo Switch', primary: '#e60012', accent: '#00c3e3', glow: 'rgba(230, 0, 18, 0.5)', bg: '#0e0608' },
  NDS: { name: 'Nintendo DS', primary: '#0284c7', accent: '#38bdf8', glow: 'rgba(2, 132, 199, 0.45)', bg: '#040a14' },
  '3DS': { name: 'Nintendo 3DS', primary: '#dc2626', accent: '#f87171', glow: 'rgba(220, 38, 38, 0.45)', bg: '#0f0506' },
  GB: { name: 'Game Boy', primary: '#84cc16', accent: '#a3e635', glow: 'rgba(132, 204, 22, 0.45)', bg: '#0a1006' },
  GBC: { name: 'Game Boy Color', primary: '#ec4899', accent: '#8b5cf6', glow: 'rgba(236, 72, 153, 0.45)', bg: '#0e0512' },
  GBA: { name: 'Game Boy Advance', primary: '#7c3aed', accent: '#38bdf8', glow: 'rgba(124, 58, 237, 0.5)', bg: '#0b0616' },

  // Sega Family
  Genesis: { name: 'Sega Genesis / Mega Drive', primary: '#0060a9', accent: '#3b82f6', glow: 'rgba(0, 96, 169, 0.5)', bg: '#040812' },
  Saturn: { name: 'Sega Saturn', primary: '#0284c7', accent: '#f59e0b', glow: 'rgba(2, 132, 199, 0.45)', bg: '#060a14' },
  Dreamcast: { name: 'Sega Dreamcast', primary: '#ff6600', accent: '#3b82f6', glow: 'rgba(255, 102, 0, 0.5)', bg: '#0e0703' },
  GameGear: { name: 'Sega Game Gear', primary: '#0060a9', accent: '#ec4899', glow: 'rgba(0, 96, 169, 0.45)', bg: '#050710' },

  // Arcade & Retro
  Arcade: { name: 'Classic Arcade', primary: '#e11d48', accent: '#fbbf24', glow: 'rgba(225, 29, 72, 0.5)', bg: '#0d0407' },
  NeoGeo: { name: 'SNK Neo Geo', primary: '#eab308', accent: '#dc2626', glow: 'rgba(234, 179, 8, 0.55)', bg: '#0c0a04' },
  Atari2600: { name: 'Atari 2600', primary: '#d97706', accent: '#f59e0b', glow: 'rgba(217, 119, 6, 0.45)', bg: '#0d0803' },
  TG16: { name: 'TurboGrafx-16', primary: '#ea580c', accent: '#38bdf8', glow: 'rgba(234, 88, 12, 0.45)', bg: '#0d0603' },
};

export function ThemeProvider({ children }) {
  // Mode: 'desktop' (Classic Catalog) or 'kodi' (10-Foot Living Room Cinema)
  const [isKodiMode, setIsKodiMode] = useState(() => {
    try {
      return localStorage.getItem('omnivault_ui_mode') === 'kodi';
    } catch {
      return false;
    }
  });

  const [activePlatform, setActivePlatform] = useState('ALL');
  const [themesList, setThemesList] = useState([]);
  const [currentTheme, setCurrentTheme] = useState({
    id: 'kodi_hybrid',
    name: 'Kodi / XBMC Estuary Hybrid',
    theme_data: {
      accent: '#00d2ff',
      accentSecondary: '#0ea5e9',
      glow: 'rgba(0, 210, 255, 0.45)',
      bgBase: '#070c16',
      bgCard: '#0c1527',
      bgCardHover: '#14223c',
      border: 'rgba(0, 210, 255, 0.2)',
      textPrimary: '#f8fafc',
      textMuted: '#94a3b8',
      mode: 'kodi',
      fontFamily: 'Inter, sans-serif'
    }
  });

  const loadThemes = async () => {
    try {
      const res = await fetchThemes();
      const list = res.themes || [];
      setThemesList(list);
      const active = list.find(t => t.is_active) || list[0];
      if (active) {
        setCurrentTheme(active);
        applyThemeCss(active.theme_data);
      }
    } catch (err) {
      console.warn('Could not load themes from backend, using defaults:', err);
    }
  };

  useEffect(() => {
    loadThemes();
  }, []);

  const toggleKodiMode = () => {
    setIsKodiMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('omnivault_ui_mode', next ? 'kodi' : 'desktop');
      } catch {}
      return next;
    });
  };

  const applyThemeCss = (data) => {
    if (!data || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (data.accent) root.style.setProperty('--theme-accent', data.accent);
    if (data.accentSecondary) root.style.setProperty('--theme-accent-sec', data.accentSecondary);
    if (data.glow) root.style.setProperty('--theme-glow', data.glow);
    if (data.bgBase) root.style.setProperty('--theme-bg-base', data.bgBase);
    if (data.bgCard) root.style.setProperty('--theme-bg-card', data.bgCard);
    if (data.bgCardHover) root.style.setProperty('--theme-bg-card-hover', data.bgCardHover);
    if (data.border) root.style.setProperty('--theme-border', data.border);
    if (data.fontFamily) root.style.setProperty('--theme-font', data.fontFamily);
  };

  const selectTheme = async (themeId) => {
    const found = themesList.find(t => t.id === themeId);
    if (found) {
      setCurrentTheme(found);
      applyThemeCss(found.theme_data);
      try {
        await activateTheme(themeId);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Compute active console ambiance
  const currentAmbiance = CONSOLE_PALETTES[activePlatform] || {
    name: 'Universal Vault',
    primary: currentTheme.theme_data?.accent || '#00d2ff',
    accent: currentTheme.theme_data?.accentSecondary || '#0ea5e9',
    glow: currentTheme.theme_data?.glow || 'rgba(0, 210, 255, 0.45)',
    bg: currentTheme.theme_data?.bgBase || '#070c16',
  };

  return (
    <ThemeContext.Provider value={{
      isKodiMode,
      toggleKodiMode,
      currentTheme,
      themesList,
      loadThemes,
      selectTheme,
      activePlatform,
      setActivePlatform,
      currentAmbiance,
      CONSOLE_PALETTES
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
