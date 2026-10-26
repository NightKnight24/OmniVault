/**
 * OmniVault Multi-Console Emulator Engine Hub
 * 
 * Bridges:
 * 1. OmniVault Custom From-Scratch Cores (MOS 6502 + 2C02 PPU + 2A03 APU)
 * 2. OmniRetro High-Performance WebAssembly Cores (Nostalgist / Libretro)
 * 
 * Supported Consoles:
 * NES, SNES, Genesis, Sega CD, Master System, Game Gear, Game Boy,
 * Game Boy Color, Game Boy Advance, Nintendo 64, PS1, PSP, NDS,
 * Arcade, Neo Geo, Atari 2600, Atari 7800, Sega Saturn, Dreamcast,
 * TurboGrafx-16, GameCube, Wii.
 */

import { Nostalgist } from "nostalgist";
import JSZip from "jszip";
import { CustomNESCore } from "./custom/CustomNESCore.js";

export const SYSTEM_CORE_MAP = {
  NES: { core: "fceumm", name: "FCEUmm", hasCustomCore: true },
  SNES: { core: "snes9x", name: "Snes9x", hasCustomCore: false },
  Genesis: { core: "genesis_plus_gx", name: "Genesis Plus GX", hasCustomCore: false },
  SegaCD: { core: "genesis_plus_gx", name: "Genesis Plus GX (CD)", hasCustomCore: false },
  MasterSystem: { core: "genesis_plus_gx", name: "Genesis Plus GX (SMS)", hasCustomCore: false },
  GameGear: { core: "genesis_plus_gx", name: "Genesis Plus GX (GG)", hasCustomCore: false },
  GB: { core: "gambatte", name: "Gambatte", hasCustomCore: false },
  GBC: { core: "gambatte", name: "Gambatte (Color)", hasCustomCore: false },
  GBA: { core: "mgba", name: "mGBA", hasCustomCore: false },
  N64: { core: "mupen64plus_next", name: "Mupen64Plus-Next", hasCustomCore: false },
  PS1: { core: "pcsx_rearmed", name: "PCSX ReARMed", hasCustomCore: false },
  PSP: { core: "ppsspp", name: "PPSSPP", hasCustomCore: false, nativeId: "ppsspp" },
  NDS: { core: "desmume", name: "DeSmuME", hasCustomCore: false, nativeId: "melonds" },
  DSi: { core: "desmume", name: "melonDS", hasCustomCore: false, nativeId: "melonds" },
  Arcade: { core: "fbneo", name: "FinalBurn Neo", hasCustomCore: false },
  NeoGeo: { core: "fbneo", name: "FinalBurn Neo (MVS/AES)", hasCustomCore: false },
  Atari2600: { core: "stella2014", name: "Stella", hasCustomCore: false },
  Atari7800: { core: "prosystem", name: "ProSystem", hasCustomCore: false },
  ColecoVision: { core: "bluemsx", name: "blueMSX / Coleco", hasCustomCore: false },
  "3DO": { core: "opera", name: "Opera (3DO)", hasCustomCore: false },
  Saturn: { core: "yabause", name: "Yabause / Beetle Saturn", hasCustomCore: false },
  Dreamcast: { core: "flycast", name: "Flycast", hasCustomCore: false },
  TG16: { core: "beetle_pce_fast", name: "Beetle PCE Fast", hasCustomCore: false },
  GameCube: { core: "native", name: "Dolphin Engine", isNative: true, nativeId: "dolphin" },
  Wii: { core: "native", name: "Dolphin Engine", isNative: true, nativeId: "dolphin" },
  WiiU: { core: "native", name: "Cemu", isNative: true, nativeId: "cemu" },
  "3DS": { core: "native", name: "Lime3DS / Azahar", isNative: true, nativeId: "lime3ds" },
  PSVita: { core: "native", name: "Vita3K", isNative: true, nativeId: "vita3k" },
  PSTV: { core: "native", name: "Vita3K", isNative: true, nativeId: "vita3k" },
  PS2: { core: "native", name: "PCSX2", isNative: true, nativeId: "pcsx2" },
  PS3: { core: "native", name: "RPCS3", isNative: true, nativeId: "rpcs3" },
  PS4: { core: "native", name: "shadPS4", isNative: true, nativeId: "shadps4" },
  Switch: { core: "native", name: "Ryujinx / Switch Engine", isNative: true, nativeId: "ryujinx" },
  Xbox: { core: "native", name: "xemu", isNative: true, nativeId: "xemu" },
  Xbox360: { core: "native", name: "Xenia Canary", isNative: true, nativeId: "xenia" },
};


export class OmniCoreEngine {
  constructor() {
    this.activeCoreType = null; // 'custom' | 'wasm'
    this.customCore = null;
    this.nostalgistInstance = null;
    this.canvas = null;
    this.platform = null;
    this.romData = null;
    this.isPaused = false;
    this.lastSavedState = null;
  }

  async _extractIfZip(romData) {
    const view = new Uint8Array(romData);
    if (view.length >= 4 && view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04) {
      const zip = await JSZip.loadAsync(romData);
      const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir && !f.startsWith("__MACOSX"));
      const nesFile = files.find((f) => f.toLowerCase().endsWith(".nes")) || files[0];
      if (nesFile) {
        return await zip.file(nesFile).async("arraybuffer");
      }
    }
    return romData;
  }

  async launch({ canvas, romData, romFileName, platform, preferCustom = false }) {
    this.canvas = canvas;
    this.romData = romData;
    this.platform = platform;

    // Destroy existing session if active
    await this.destroy();

    const systemInfo = SYSTEM_CORE_MAP[platform] || { core: "fceumm", name: "Generic Retro Core" };

    if (systemInfo.isNative) {
      throw new Error(
        `${platform} titles utilize hardware-accelerated Metal/Vulkan graphics. Click "Launch in Native Mac Emulator" below to run directly in ${systemInfo.name}.`
      );
    }


    // Use From-Scratch Custom Core if requested or if NES with preferCustom
    if (systemInfo.hasCustomCore && preferCustom) {
      const unpackedRom = await this._extractIfZip(romData);
      this.activeCoreType = "custom";
      this.customCore = new CustomNESCore();
      this.customCore.loadRom(unpackedRom);
      this.customCore.start(canvas);
      if (typeof window !== "undefined") {
        window.__OMNI_ACTIVE_ENGINE__ = this;
      }
      return {
        type: "custom",
        coreName: "OmniVault Custom 6502/2C02 Core",
        platform,
      };
    }

    // Otherwise, launch high-performance WebAssembly Libretro Core
    this.activeCoreType = "wasm";
    const romBlob = new Blob([romData], { type: "application/octet-stream" });

    try {
      this.nostalgistInstance = await Nostalgist.launch({
        core: systemInfo.core,
        rom: romBlob,
        element: canvas,
        resolveRom({ rom }) {
          return {
            name: romFileName || "game.rom",
            file: rom,
          };
        },
      });

      if (typeof window !== "undefined") {
        window.__OMNI_ACTIVE_ENGINE__ = this;
      }

      return {
        type: "wasm",
        coreName: systemInfo.name,
        platform,
      };
    } catch (err) {
      console.warn(`[OmniVault Engine] WASM core '${systemInfo.core}' launch note:`, err);
      // Fallback to custom core if NES
      if (systemInfo.hasCustomCore) {
        console.log("[OmniVault Engine] Engaging Custom From-Scratch Core fallback...");
        const unpackedRom = await this._extractIfZip(romData);
        this.activeCoreType = "custom";
        this.customCore = new CustomNESCore();
        this.customCore.loadRom(unpackedRom);
        this.customCore.start(canvas);
        if (typeof window !== "undefined") {
          window.__OMNI_ACTIVE_ENGINE__ = this;
        }
        return {
          type: "custom",
          coreName: "OmniVault Custom Core (Native Fallback)",
          platform,
        };
      }
      throw err;
    }
  }

  pause() {
    this.isPaused = true;
    if (this.activeCoreType === "custom" && this.customCore) {
      this.customCore.pause();
    } else if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      this.nostalgistInstance.pause();
    }
  }

  resume() {
    this.isPaused = false;
    if (this.activeCoreType === "custom" && this.customCore) {
      this.customCore.resume();
    } else if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      this.nostalgistInstance.resume();
    }
  }

  reset() {
    if (this.activeCoreType === "custom" && this.customCore) {
      this.customCore.reset();
    } else if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      this.nostalgistInstance.restart();
    }
  }

  async saveState() {
    if (this.activeCoreType === "custom" && this.customCore) {
      const state = this.customCore.saveState();
      localStorage.setItem(`omnivault_state_${this.platform}`, JSON.stringify(state));
      return { success: true };
    } else if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      const res = await this.nostalgistInstance.saveState();
      this.lastSavedState = res?.state || res;
      return { success: Boolean(this.lastSavedState), state: this.lastSavedState };
    }
    return { success: false };
  }

  async loadState() {
    if (this.activeCoreType === "custom" && this.customCore) {
      const raw = localStorage.getItem(`omnivault_state_${this.platform}`);
      if (raw) {
        this.customCore.loadState(JSON.parse(raw));
        return { success: true };
      }
    } else if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      if (this.lastSavedState) {
        await this.nostalgistInstance.loadState(this.lastSavedState);
        return { success: true };
      }
    }
    return { success: false };
  }

  setVolume(vol) {
    if (this.activeCoreType === "custom" && this.customCore) {
      this.customCore.setVolume(vol);
    }
  }

  async captureScreenshot() {
    if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      try {
        const blob = await this.nostalgistInstance.screenshot();
        if (blob) {
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch (e) {
        console.warn("[OmniCoreEngine] Nostalgist screenshot fallback to canvas:", e);
      }
    }
    if (this.canvas) {
      return this.canvas.toDataURL("image/png");
    }
    return null;
  }

  applyCheats(cheatsList = []) {
    if (this.activeCoreType === "custom" && this.customCore) {
      const enabledCheats = cheatsList.filter((c) => c.enabled && (c.code || c.game_genie_code));
      this.customCore.setCheats(enabledCheats);
      return true;
    }
    if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      try {
        const formatted = cheatsList
          .filter((c) => c.code || c.game_genie_code)
          .map((c) => ({
            code: c.code || c.game_genie_code,
            description: c.name || c.description || "Cheat",
            enabled: Boolean(c.enabled),
          }));
        this.nostalgistInstance.setCheats(formatted);
        return true;
      } catch (e) {
        console.warn("[OmniCoreEngine] setCheats note:", e);
      }
    }
    return false;
  }

  getSystemRamView() {
    if (this.activeCoreType === "custom" && this.customCore?.bus?.cpuRam) {
      return this.customCore.bus.cpuRam;
    }
    if (this.activeCoreType === "wasm" && this.nostalgistInstance) {
      try {
        const mod =
          this.nostalgistInstance.getEmscriptenModule?.() ||
          this.nostalgistInstance.getEmscripten?.()?.Module;
        if (mod && mod.HEAPU8) {
          // RETRO_MEMORY_SYSTEM_RAM = 2
          const ptr = mod._retro_get_memory_data ? mod._retro_get_memory_data(2) : 0;
          const size = mod._retro_get_memory_size ? mod._retro_get_memory_size(2) : 0;
          if (ptr && size > 0) {
            return mod.HEAPU8.subarray(ptr, ptr + size);
          }
        }
      } catch (e) {
        console.warn("[OmniCoreEngine] getSystemRamView error:", e);
      }
    }
    return null;
  }

  scanRam(targetValue, dataType = "uint8", candidates = null) {
    const ram = this.getSystemRamView();
    if (!ram) return [];
    const matches = [];
    const candidateSet = Array.isArray(candidates) && candidates.length > 0 ? new Set(candidates) : null;
    const step = dataType.includes("32") ? 4 : dataType.includes("16") ? 2 : 1;
    const limit = ram.length - step;

    for (let addr = 0; addr <= limit; addr++) {
      if (candidateSet && !candidateSet.has(addr)) continue;
      let val = 0;
      if (dataType === "uint8") {
        val = ram[addr];
      } else if (dataType === "uint16_le") {
        val = ram[addr] | (ram[addr + 1] << 8);
      } else if (dataType === "uint16_be") {
        val = (ram[addr] << 8) | ram[addr + 1];
      } else if (dataType === "uint32_le") {
        val = (ram[addr] | (ram[addr + 1] << 8) | (ram[addr + 2] << 16) | (ram[addr + 3] << 24)) >>> 0;
      }
      if (val === targetValue) {
        matches.push({
          address: addr,
          hex_address: `0x${addr.toString(16).toUpperCase().padStart(4, "0")}`,
          value: val,
        });
        if (matches.length >= 250) break;
      }
    }
    return matches;
  }

  pokeRam(address, value, dataType = "uint8") {
    const ram = this.getSystemRamView();
    if (!ram || address < 0 || address >= ram.length) return false;
    if (dataType === "uint8") {
      ram[address] = value & 0xFF;
    } else if (dataType === "uint16_le" && address + 1 < ram.length) {
      ram[address] = value & 0xFF;
      ram[address + 1] = (value >> 8) & 0xFF;
    } else if (dataType === "uint16_be" && address + 1 < ram.length) {
      ram[address] = (value >> 8) & 0xFF;
      ram[address + 1] = value & 0xFF;
    } else if (dataType === "uint32_le" && address + 3 < ram.length) {
      ram[address] = value & 0xFF;
      ram[address + 1] = (value >> 8) & 0xFF;
      ram[address + 2] = (value >> 16) & 0xFF;
      ram[address + 3] = (value >> 24) & 0xFF;
    }
    return true;
  }

  freezeRam(address, value, dataType = "uint8") {
    this.pokeRam(address, value, dataType);
    if (this.activeCoreType === "custom" && this.customCore?.bus) {
      this.customCore.bus.ramFreezes.set(address & 0x07FF, value & 0xFF);
    } else {
      if (!this._wasmFreezeTimers) this._wasmFreezeTimers = new Map();
      if (this._wasmFreezeTimers.has(address)) {
        clearInterval(this._wasmFreezeTimers.get(address));
      }
      const timer = setInterval(() => this.pokeRam(address, value, dataType), 50);
      this._wasmFreezeTimers.set(address, timer);
    }
    return true;
  }

  unfreezeRam(address) {
    if (this.activeCoreType === "custom" && this.customCore?.bus) {
      this.customCore.bus.ramFreezes.delete(address & 0x07FF);
    }
    if (this._wasmFreezeTimers && this._wasmFreezeTimers.has(address)) {
      clearInterval(this._wasmFreezeTimers.get(address));
      this._wasmFreezeTimers.delete(address);
    }
    return true;
  }

  async destroy() {
    if (this._wasmFreezeTimers) {
      for (const timer of this._wasmFreezeTimers.values()) {
        clearInterval(timer);
      }
      this._wasmFreezeTimers.clear();
    }
    if (typeof window !== "undefined" && window.__OMNI_ACTIVE_ENGINE__ === this) {
      window.__OMNI_ACTIVE_ENGINE__ = null;
    }
    if (this.customCore) {
      this.customCore.destroy();
      this.customCore = null;
    }
    if (this.nostalgistInstance) {
      try {
        await this.nostalgistInstance.exit();
      } catch (e) {}
      this.nostalgistInstance = null;
    }
    this.activeCoreType = null;
  }
}
