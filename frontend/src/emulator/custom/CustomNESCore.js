/**
 * OmniVault Custom Core - Master NES System Coordinator
 * 
 * Orchestrates:
 * - CPU (MOS 6502)
 * - PPU (2C02 60 FPS Scanline Rasterizer)
 * - APU (2A03 Web Audio Synthesis)
 * - Cartridge & Mappers (iNES Format)
 * - Dual Controller Ports & Gamepad API
 * - Canvas 2D Direct Blit Renderer
 */

import { Bus } from "./bus/Bus.js";
import { CPU6502 } from "./cpu/CPU6502.js";
import { PPU2C02 } from "./ppu/PPU2C02.js";
import { APU2A03 } from "./apu/APU2A03.js";
import { Cartridge } from "./cartridge/Cartridge.js";
import { Controller } from "./input/Gamepad.js";

export class CustomNESCore {
  constructor() {
    this.bus = new Bus();
    this.cpu = new CPU6502();
    this.ppu = new PPU2C02();
    this.apu = new APU2A03();
    this.cartridge = null;
    this.controller1 = new Controller(0);
    this.controller2 = new Controller(1);

    this.bus.connect(
      this.cpu,
      this.ppu,
      this.apu,
      this.cartridge,
      this.controller1,
      this.controller2
    );

    this.canvas = null;
    this.ctx = null;
    this.imgData = null;

    this.running = false;
    this.paused = false;
    this.animFrameId = null;

    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.currentFps = 60;
  }

  loadRom(romBuffer) {
    this.cartridge = new Cartridge(romBuffer);
    this.bus.cartridge = this.cartridge;
    this.reset();
  }

  attachCanvas(canvas) {
    this.canvas = canvas;
    this.canvas.width = 256;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.imgData = this.ctx.createImageData(256, 240);
  }

  start(canvas) {
    if (canvas) {
      this.attachCanvas(canvas);
    }
    this.apu.initAudio();
    this.running = true;
    this.paused = false;
    this.lastFrameTime = performance.now();
    this.loop = this.runFrame.bind(this);
    this.animFrameId = requestAnimationFrame(this.loop);
  }

  runFrame() {
    if (!this.running) return;

    if (!this.paused) {
      // Enforce any frozen RAM addresses prior to frame execution
      if (this.bus.ramFreezes.size > 0) {
        for (const [addr, val] of this.bus.ramFreezes.entries()) {
          this.bus.cpuRam[addr & 0x07FF] = val & 0xFF;
        }
      }

      // Step system until PPU finishes one complete 256x240 frame (approx 89,342 master clocks)
      let safetyCounter = 0;
      while (!this.ppu.frameComplete && safetyCounter < 150000) {
        this.bus.clock();
        safetyCounter++;
      }
      this.ppu.frameComplete = false;

      // Blit frame buffer to canvas
      if (this.ctx && this.imgData) {
        this.imgData.data.set(this.ppu.frameBuffer);
        this.ctx.putImageData(this.imgData, 0, 0);
      }

      // Calculate FPS
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFrameTime >= 1000) {
        this.currentFps = this.frameCount;
        this.frameCount = 0;
        this.lastFrameTime = now;
      }
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  reset() {
    this.bus.reset();
  }

  setVolume(vol) {
    if (this.apu) {
      this.apu.setVolume(vol);
    }
  }

  static decodeGameGenie(code) {
    const alphabet = "APZLGITYEOXUKSVN";
    const clean = String(code || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (clean.length !== 6 && clean.length !== 8) return null;
    const n = [];
    for (let i = 0; i < clean.length; i++) {
      const idx = alphabet.indexOf(clean[i]);
      if (idx === -1) return null;
      n.push(idx);
    }
    const address = 0x8000 |
      ((n[3] & 7) << 12) |
      ((n[5] & 7) << 8) | ((n[4] & 8) << 8) |
      ((n[2] & 7) << 4) | ((n[1] & 8) << 4) |
      (n[4] & 7) | (n[3] & 8);
    if (clean.length === 6) {
      const value = ((n[1] & 7) << 4) | ((n[0] & 8) << 4) | (n[0] & 7) | (n[5] & 8);
      return { address, value, compare: null };
    } else {
      const value = ((n[1] & 7) << 4) | ((n[0] & 8) << 4) | (n[0] & 7) | (n[7] & 8);
      const compare = ((n[7] & 7) << 4) | ((n[6] & 8) << 4) | (n[6] & 7) | (n[5] & 8);
      return { address, value, compare };
    }
  }

  setCheats(cheatCodes = []) {
    this.bus.romCheats.clear();
    for (const raw of cheatCodes) {
      const codeStr = typeof raw === "string" ? raw.trim() : (raw?.code || raw?.game_genie_code || "");
      if (!codeStr) continue;
      // 1. Check ADDR?CMP:VAL or ADDR:VAL format
      const match = codeStr.match(/^\$?([0-9A-Fa-f]{4,6})(?:\?([0-9A-Fa-f]{2}))?:([0-9A-Fa-f]{2})$/);
      if (match) {
        const addr = parseInt(match[1], 16);
        const cmp = match[2] ? parseInt(match[2], 16) : null;
        const val = parseInt(match[3], 16);
        if (addr < 0x2000) {
          this.bus.ramFreezes.set(addr & 0x07FF, val);
        } else {
          this.bus.romCheats.set(addr & 0xFFFF, { value: val, compare: cmp });
        }
        continue;
      }
      // 2. Check 6- or 8-character Galoob Game Genie code
      const gg = CustomNESCore.decodeGameGenie(codeStr);
      if (gg) {
        this.bus.romCheats.set(gg.address, { value: gg.value, compare: gg.compare });
      }
    }
  }

  saveState() {
    return {
      cpu: {
        a: this.cpu.a,
        x: this.cpu.x,
        y: this.cpu.y,
        stkp: this.cpu.stkp,
        pc: this.cpu.pc,
        status: this.cpu.status,
      },
      ram: Array.from(this.bus.cpuRam),
      vram: [Array.from(this.ppu.tblName[0]), Array.from(this.ppu.tblName[1])],
      palette: Array.from(this.ppu.tblPalette),
      oam: Array.from(this.ppu.oam),
    };
  }

  loadState(state) {
    if (!state) return;
    if (state.cpu) {
      this.cpu.a = state.cpu.a;
      this.cpu.x = state.cpu.x;
      this.cpu.y = state.cpu.y;
      this.cpu.stkp = state.cpu.stkp;
      this.cpu.pc = state.cpu.pc;
      this.cpu.status = state.cpu.status;
    }
    if (state.ram) {
      this.bus.cpuRam.set(state.ram);
    }
    if (state.vram) {
      this.ppu.tblName[0].set(state.vram[0]);
      this.ppu.tblName[1].set(state.vram[1]);
    }
    if (state.palette) {
      this.ppu.tblPalette.set(state.palette);
    }
    if (state.oam) {
      this.ppu.oam.set(state.oam);
    }
  }

  destroy() {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.controller1) {
      this.controller1.destroy();
    }
    if (this.controller2) {
      this.controller2.destroy();
    }
    if (this.apu && this.apu.audioCtx) {
      try {
        this.apu.audioCtx.close();
      } catch (e) {}
    }
  }
}
