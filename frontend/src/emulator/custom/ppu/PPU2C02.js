/**
 * OmniVault Custom Core - 2C02 Picture Processing Unit (PPU)
 * 
 * Features:
 * - Scanline rasterizer (262 scanlines x 341 dots @ 60 FPS NTSC)
 * - 256x240 32-bit RGBA direct canvas frame buffer
 * - Loopy VRAM addressing registers (v, t, x, w) for pixel-perfect scrolling
 * - Full 64-color NES hardware palette table
 * - 64 Hardware Sprites with OAM DMA support, 8x8 & 8x16 modes, flipping, and priority
 * - Sprite 0 hit detection for split-screen status bars
 */

export const NES_PALETTE = [
  0x7C7C7C, 0x0000FC, 0x0000BC, 0x4428BC, 0x940084, 0xA80020, 0xA81000, 0x881400,
  0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000, 0x000000, 0x000000,
  0xBCBCBC, 0x0078F8, 0x0058F8, 0x6844FC, 0xD800CC, 0xE40058, 0xF83800, 0xE45C10,
  0xAC7C00, 0x00B800, 0x00A800, 0x00A844, 0x008888, 0x000000, 0x000000, 0x000000,
  0xF8F8F8, 0x3CBCFC, 0x6888FC, 0x9878F8, 0xF878F8, 0xF85898, 0xF87858, 0xFCA044,
  0xF8B800, 0xB8F818, 0x58D854, 0x58F898, 0x00E8D8, 0x787878, 0x000000, 0x000000,
  0xFFFFFF, 0xA4E4FC, 0xB8B8F8, 0xD8B8F8, 0xF8B8F8, 0xF8A4C0, 0xF0D0B0, 0xFCE0A8,
  0xF8D878, 0xD8F878, 0xB8F8B8, 0xB8F8D8, 0x00FCFC, 0xF8D8F8, 0x000000, 0x000000,
];

export class PPU2C02 {
  constructor() {
    this.bus = null;

    // VRAM & Palettes
    this.tblName = [new Uint8Array(1024), new Uint8Array(1024)]; // 2KB internal nametable RAM
    this.tblPalette = new Uint8Array(32);                        // 32-byte palette RAM
    this.oam = new Uint8Array(256);                               // 256-byte OAM (64 sprites)

    // Frame Buffer (256 x 240 x 4 RGBA bytes)
    this.frameBuffer = new Uint8ClampedArray(256 * 240 * 4);
    this.frameComplete = false;

    // Registers
    this.status = {
      spriteOverflow: 0,
      spriteZeroHit: 0,
      verticalBlank: 0,
    };

    this.mask = {
      grayscale: 0,
      renderBackgroundLeft: 0,
      renderSpritesLeft: 0,
      renderBackground: 0,
      renderSprites: 0,
      enhanceRed: 0,
      enhanceGreen: 0,
      enhanceBlue: 0,
    };

    this.control = {
      nametableX: 0,
      nametableY: 0,
      incrementMode: 0,
      patternSprite: 0,
      patternBackground: 0,
      spriteSize: 0,
      slaveMode: 0,
      enableNmi: 0,
    };

    // Loopy VRAM Register State
    this.vramAddr = {
      coarseX: 0,
      coarseY: 0,
      nametableX: 0,
      nametableY: 0,
      fineY: 0,
      raw: 0,
    };

    this.tramAddr = {
      coarseX: 0,
      coarseY: 0,
      nametableX: 0,
      nametableY: 0,
      fineY: 0,
      raw: 0,
    };

    this.fineX = 0;
    this.addressLatch = 0;
    this.ppuDataBuffer = 0;

    // Scanline & Dot Counters
    this.scanline = 0;
    this.cycle = 0;

    // Interrupt signal
    this.nmiTriggered = false;

    // Background tile pipeline registers
    this.bgNextTileId = 0x00;
    this.bgNextTileAttrib = 0x00;
    this.bgNextTileLsb = 0x00;
    this.bgNextTileMsb = 0x00;

    this.bgShifterPatternLo = 0x0000;
    this.bgShifterPatternHi = 0x0000;
    this.bgShifterAttribLo = 0x0000;
    this.bgShifterAttribHi = 0x0000;

    // Sprite evaluation
    this.oamAddr = 0x00;
    this.scanlineSprites = [];
    this.spriteScanline = [];
    this.spriteCount = 0;
    this.spriteZeroHitPossible = false;
    this.spriteZeroBeingRendered = false;
  }

  connectBus(bus) {
    this.bus = bus;
  }

  // --- CPU Bus Interface ($2000 - $2007) ---
  cpuRead(addr, readOnly = false) {
    let data = 0x00;

    switch (addr) {
      case 0x0000: // Control (write only)
        break;
      case 0x0001: // Mask (write only)
        break;
      case 0x0002: // Status
        data = (this.status.verticalBlank << 7) |
               (this.status.spriteZeroHit << 6) |
               (this.status.spriteOverflow << 5) |
               (this.ppuDataBuffer & 0x1F);
        if (!readOnly) {
          this.status.verticalBlank = 0;
          this.addressLatch = 0;
        }
        break;
      case 0x0003: // OAM Address
        break;
      case 0x0004: // OAM Data
        data = this.oam[this.oamAddr];
        break;
      case 0x0005: // Scroll
        break;
      case 0x0006: // PPU Address
        break;
      case 0x0007: // PPU Data
        data = this.ppuDataBuffer;
        this.ppuDataBuffer = this.ppuRead(this.vramAddr.raw);
        // Palette reads are not delayed by buffer
        if (this.vramAddr.raw >= 0x3F00) {
          data = this.ppuDataBuffer;
        }
        this.vramAddr.raw = (this.vramAddr.raw + (this.control.incrementMode ? 32 : 1)) & 0x3FFF;
        break;
    }
    return data;
  }

  cpuWrite(addr, data) {
    switch (addr) {
      case 0x0000: // Control ($2000)
        this.control.nametableX = (data & 0x01);
        this.control.nametableY = (data & 0x02) >> 1;
        this.control.incrementMode = (data & 0x04) >> 2;
        this.control.patternSprite = (data & 0x08) >> 3;
        this.control.patternBackground = (data & 0x10) >> 4;
        this.control.spriteSize = (data & 0x20) >> 5;
        this.control.slaveMode = (data & 0x40) >> 6;
        this.control.enableNmi = (data & 0x80) >> 7;

        this.tramAddr.raw = (this.tramAddr.raw & ~0x0C00) | ((data & 0x03) << 10);
        break;

      case 0x0001: // Mask ($2001)
        this.mask.grayscale = (data & 0x01);
        this.mask.renderBackgroundLeft = (data & 0x02) >> 1;
        this.mask.renderSpritesLeft = (data & 0x04) >> 2;
        this.mask.renderBackground = (data & 0x08) >> 3;
        this.mask.renderSprites = (data & 0x10) >> 4;
        this.mask.enhanceRed = (data & 0x20) >> 5;
        this.mask.enhanceGreen = (data & 0x40) >> 6;
        this.mask.enhanceBlue = (data & 0x80) >> 7;
        break;

      case 0x0002: // Status
        break;

      case 0x0003: // OAM Address ($2003)
        this.oamAddr = data;
        break;

      case 0x0004: // OAM Data ($2004)
        this.oam[this.oamAddr] = data;
        this.oamAddr = (this.oamAddr + 1) & 0xFF;
        break;

      case 0x0005: // Scroll ($2005)
        if (this.addressLatch === 0) {
          this.fineX = data & 0x07;
          this.tramAddr.raw = (this.tramAddr.raw & ~0x001F) | (data >> 3);
          this.addressLatch = 1;
        } else {
          this.tramAddr.raw = (this.tramAddr.raw & ~0x73E0) |
                              ((data & 0x07) << 12) |
                              ((data & 0xF8) << 2);
          this.addressLatch = 0;
        }
        break;

      case 0x0006: // PPU Address ($2006)
        if (this.addressLatch === 0) {
          this.tramAddr.raw = (this.tramAddr.raw & 0x00FF) | ((data & 0x3F) << 8);
          this.addressLatch = 1;
        } else {
          this.tramAddr.raw = (this.tramAddr.raw & 0xFF00) | data;
          this.vramAddr.raw = this.tramAddr.raw;
          this.addressLatch = 0;
        }
        break;

      case 0x0007: // PPU Data ($2007)
        this.ppuWrite(this.vramAddr.raw, data);
        this.vramAddr.raw = (this.vramAddr.raw + (this.control.incrementMode ? 32 : 1)) & 0x3FFF;
        break;
    }
  }

  // --- PPU VRAM Interface ($0000 - $3FFF) ---
  ppuRead(addr) {
    addr &= 0x3FFF;
    let data = 0x00;

    // 1. Cartridge Pattern Memory ($0000 - $1FFF)
    if (this.bus && this.bus.cartridge && this.bus.cartridge.ppuRead(addr, (val) => { data = val; })) {
      return data;
    }

    // 2. Nametable RAM ($2000 - $3EFF)
    if (addr >= 0x2000 && addr <= 0x3EFF) {
      addr &= 0x0FFF;
      const mirror = this.bus && this.bus.cartridge ? this.bus.cartridge.mirror : 0;
      if (mirror === 1) {
        // Vertical Mirroring ($2000 == $2800, $2400 == $2C00)
        if (addr >= 0x0000 && addr <= 0x03FF) data = this.tblName[0][addr & 0x03FF];
        if (addr >= 0x0400 && addr <= 0x07FF) data = this.tblName[1][addr & 0x03FF];
        if (addr >= 0x0800 && addr <= 0x0BFF) data = this.tblName[0][addr & 0x03FF];
        if (addr >= 0x0C00 && addr <= 0x0FFF) data = this.tblName[1][addr & 0x03FF];
      } else if (mirror === 2) {
        // Single-Screen Lower
        data = this.tblName[0][addr & 0x03FF];
      } else if (mirror === 3) {
        // Single-Screen Upper
        data = this.tblName[1][addr & 0x03FF];
      } else {
        // Horizontal Mirroring ($2000 == $2400, $2800 == $2C00)
        if (addr >= 0x0000 && addr <= 0x03FF) data = this.tblName[0][addr & 0x03FF];
        if (addr >= 0x0400 && addr <= 0x07FF) data = this.tblName[0][addr & 0x03FF];
        if (addr >= 0x0800 && addr <= 0x0BFF) data = this.tblName[1][addr & 0x03FF];
        if (addr >= 0x0C00 && addr <= 0x0FFF) data = this.tblName[1][addr & 0x03FF];
      }
      return data;
    }

    // 3. Palette RAM ($3F00 - $3FFF, mirrored)
    if (addr >= 0x3F00 && addr <= 0x3FFF) {
      addr &= 0x001F;
      // Mirror palette addresses $10, $14, $18, $1C to $00, $04, $08, $0C
      if (addr === 0x0010) addr = 0x0000;
      if (addr === 0x0014) addr = 0x0004;
      if (addr === 0x0018) addr = 0x0008;
      if (addr === 0x001C) addr = 0x000C;
      return this.tblPalette[addr] & (this.mask.grayscale ? 0x30 : 0x3F);
    }

    return 0;
  }

  ppuWrite(addr, data) {
    addr &= 0x3FFF;
    data &= 0xFF;

    if (this.bus && this.bus.cartridge && this.bus.cartridge.ppuWrite(addr, data)) {
      return;
    }

    if (addr >= 0x2000 && addr <= 0x3EFF) {
      addr &= 0x0FFF;
      const mirror = this.bus && this.bus.cartridge ? this.bus.cartridge.mirror : 0;
      if (mirror === 1) {
        // Vertical Mirroring ($2000 == $2800, $2400 == $2C00)
        if (addr >= 0x0000 && addr <= 0x03FF) this.tblName[0][addr & 0x03FF] = data;
        if (addr >= 0x0400 && addr <= 0x07FF) this.tblName[1][addr & 0x03FF] = data;
        if (addr >= 0x0800 && addr <= 0x0BFF) this.tblName[0][addr & 0x03FF] = data;
        if (addr >= 0x0C00 && addr <= 0x0FFF) this.tblName[1][addr & 0x03FF] = data;
      } else if (mirror === 2) {
        this.tblName[0][addr & 0x03FF] = data;
      } else if (mirror === 3) {
        this.tblName[1][addr & 0x03FF] = data;
      } else {
        // Horizontal Mirroring ($2000 == $2400, $2800 == $2C00)
        if (addr >= 0x0000 && addr <= 0x03FF) this.tblName[0][addr & 0x03FF] = data;
        if (addr >= 0x0400 && addr <= 0x07FF) this.tblName[0][addr & 0x03FF] = data;
        if (addr >= 0x0800 && addr <= 0x0BFF) this.tblName[1][addr & 0x03FF] = data;
        if (addr >= 0x0C00 && addr <= 0x0FFF) this.tblName[1][addr & 0x03FF] = data;
      }
      return;
    }

    if (addr >= 0x3F00 && addr <= 0x3FFF) {
      addr &= 0x001F;
      if (addr === 0x0010) addr = 0x0000;
      if (addr === 0x0014) addr = 0x0004;
      if (addr === 0x0018) addr = 0x0008;
      if (addr === 0x001C) addr = 0x000C;
      this.tblPalette[addr] = data;
    }
  }


  evaluateSprites(scanline) {
    this.scanlineSprites = [];
    const spriteHeight = this.control.spriteSize ? 16 : 8;

    for (let i = 0; i < 64; i++) {
      const oamOffset = i * 4;
      const y = this.oam[oamOffset];
      const diff = scanline - y;

      if (diff >= 0 && diff < spriteHeight) {
        if (this.scanlineSprites.length < 8) {
          const tile = this.oam[oamOffset + 1];
          const attr = this.oam[oamOffset + 2];
          const x = this.oam[oamOffset + 3];

          let patternAddrLo = 0;
          const row = (attr & 0x80) ? (spriteHeight - 1 - diff) : diff; // Vertical flip

          if (spriteHeight === 8) {
            const table = this.control.patternSprite << 12;
            patternAddrLo = table + (tile << 4) + row;
          } else {
            // 8x16 Mode
            const table = (tile & 0x01) << 12;
            const tileIdx = (tile & 0xFE) + (row >= 8 ? 1 : 0);
            patternAddrLo = table + (tileIdx << 4) + (row & 0x07);
          }

          const patternLo = this.ppuRead(patternAddrLo);
          const patternHi = this.ppuRead(patternAddrLo + 8);

          this.scanlineSprites.push({
            index: i,
            x: x,
            attr: attr,
            patternLo: patternLo,
            patternHi: patternHi,
          });
        } else {
          this.status.spriteOverflow = 1;
          break;
        }
      }
    }
  }

  getColorFromPalette(palette, pixel) {
    return NES_PALETTE[this.ppuRead(0x3F00 + (palette << 2) + pixel) & 0x3F];
  }

  // --- Clock Cycle & Scanline Pipeline ---
  clock() {
    if (this.scanline >= -1 && this.scanline < 240) {
      if (this.cycle === 0 && this.scanline >= 0 && this.scanline < 240) {
        this.evaluateSprites(this.scanline);
      }

      if (this.scanline === 0 && this.cycle === 0) {
        // "Odd frame" skip cycle
        this.cycle = 1;
      }

      if (this.scanline === -1 && this.cycle === 1) {
        // Start of pre-render scanline: clear flags
        this.status.verticalBlank = 0;
        this.status.spriteOverflow = 0;
        this.status.spriteZeroHit = 0;
      }

      // Background tile pipeline
      if ((this.cycle >= 2 && this.cycle < 258) || (this.cycle >= 321 && this.cycle < 338)) {
        this.updateShifters();

        switch ((this.cycle - 1) % 8) {
          case 0:
            this.loadBackgroundShifters();
            this.bgNextTileId = this.ppuRead(0x2000 | (this.vramAddr.raw & 0x0FFF));
            break;
          case 2:
            this.bgNextTileAttrib = this.ppuRead(
              0x23C0 | (this.vramAddr.raw & 0x0C00) |
              ((this.vramAddr.raw >> 4) & 0x38) |
              ((this.vramAddr.raw >> 2) & 0x07)
            );
            if ((this.vramAddr.raw & 0x0040) !== 0) this.bgNextTileAttrib >>= 4;
            if ((this.vramAddr.raw & 0x0002) !== 0) this.bgNextTileAttrib >>= 2;
            this.bgNextTileAttrib &= 0x03;
            break;
          case 4:
            this.bgNextTileLsb = this.ppuRead(
              (this.control.patternBackground << 12) +
              (this.bgNextTileId << 4) +
              ((this.vramAddr.raw >> 12) & 0x07)
            );
            break;
          case 6:
            this.bgNextTileMsb = this.ppuRead(
              (this.control.patternBackground << 12) +
              (this.bgNextTileId << 4) +
              ((this.vramAddr.raw >> 12) & 0x07) + 8
            );
            break;
          case 7:
            this.incrementScrollX();
            break;
        }
      }

      if (this.cycle === 256) {
        this.incrementScrollY();
      }

      if (this.cycle === 257) {
        this.loadBackgroundShifters();
        this.transferAddressX();
      }

      if (this.cycle === 260 && this.scanline >= 0 && (this.mask.renderBackground || this.mask.renderSprites)) {
        if (this.bus && this.bus.cartridge && this.bus.cartridge.scanline) {
          this.bus.cartridge.scanline();
        }
      }

      if (this.scanline === -1 && this.cycle >= 280 && this.cycle < 305) {
        this.transferAddressY();
      }
    }

    // V-Blank Triggering (Scanline 241)
    if (this.scanline === 241 && this.cycle === 1) {
      this.status.verticalBlank = 1;
      if (this.control.enableNmi) {
        this.nmiTriggered = true;
      }
    }

    // Pixel Rendering Composition
    let bgPixel = 0x00;
    let bgPalette = 0x00;

    if (this.mask.renderBackground && this.scanline >= 0 && this.scanline < 240 && this.cycle >= 1 && this.cycle <= 256) {
      const x = this.cycle - 1;
      if (this.mask.renderBackgroundLeft || x >= 8) {
        const bitMux = 0x8000 >> this.fineX;
        const p0 = (this.bgShifterPatternLo & bitMux) > 0 ? 1 : 0;
        const p1 = (this.bgShifterPatternHi & bitMux) > 0 ? 1 : 0;
        bgPixel = (p1 << 1) | p0;

        const bgPal0 = (this.bgShifterAttribLo & bitMux) > 0 ? 1 : 0;
        const bgPal1 = (this.bgShifterAttribHi & bitMux) > 0 ? 1 : 0;
        bgPalette = (bgPal1 << 1) | bgPal0;
      }
    }

    let fgPixel = 0x00;
    let fgPalette = 0x00;
    let fgPriority = false;
    let fgIsSpriteZero = false;

    if (this.mask.renderSprites && this.scanline >= 0 && this.scanline < 240 && this.cycle >= 1 && this.cycle <= 256) {
      const x = this.cycle - 1;
      if (this.mask.renderSpritesLeft || x >= 8) {
        for (let s = 0; s < this.scanlineSprites.length; s++) {
          const sp = this.scanlineSprites[s];
          const xDiff = x - sp.x;
          if (xDiff >= 0 && xDiff < 8) {
            const bit = (sp.attr & 0x40) ? xDiff : (7 - xDiff); // Horizontal flip
            const p0 = (sp.patternLo >> bit) & 1;
            const p1 = (sp.patternHi >> bit) & 1;
            const pixel = (p1 << 1) | p0;
            if (pixel !== 0) {
              fgPixel = pixel;
              fgPalette = (sp.attr & 0x03) + 4;
              fgPriority = (sp.attr & 0x20) === 0; // 0 = in front of background
              if (sp.index === 0) {
                fgIsSpriteZero = true;
              }
              break; // Highest priority sprite on scanline wins
            }
          }
        }
      }
    }

    // Sprite 0 Hit Evaluation
    if (fgIsSpriteZero && bgPixel !== 0 && this.status.spriteZeroHit === 0) {
      if (this.mask.renderBackground && this.mask.renderSprites) {
        const x = this.cycle - 1;
        const leftOK = (this.mask.renderBackgroundLeft || x >= 8) && (this.mask.renderSpritesLeft || x >= 8);
        if (leftOK && x < 255) {
          this.status.spriteZeroHit = 1;
        }
      }
    }

    // Final Pixel Multiplexing & Palette Selection
    if (this.scanline >= 0 && this.scanline < 240 && this.cycle >= 1 && this.cycle <= 256) {
      let finalPixel = 0;
      let finalPalette = 0;

      if (bgPixel === 0 && fgPixel === 0) {
        finalPixel = 0;
        finalPalette = 0;
      } else if (bgPixel !== 0 && fgPixel === 0) {
        finalPixel = bgPixel;
        finalPalette = bgPalette;
      } else if (bgPixel === 0 && fgPixel !== 0) {
        finalPixel = fgPixel;
        finalPalette = fgPalette;
      } else {
        // Both background and sprite opaque: priority decides
        if (fgPriority) {
          finalPixel = fgPixel;
          finalPalette = fgPalette;
        } else {
          finalPixel = bgPixel;
          finalPalette = bgPalette;
        }
      }

      const x = this.cycle - 1;
      const y = this.scanline;
      const pixelColor = this.getColorFromPalette(finalPalette, finalPixel);

      const offset = (y * 256 + x) * 4;
      this.frameBuffer[offset] = (pixelColor >> 16) & 0xFF;     // R
      this.frameBuffer[offset + 1] = (pixelColor >> 8) & 0xFF;  // G
      this.frameBuffer[offset + 2] = pixelColor & 0xFF;         // B
      this.frameBuffer[offset + 3] = 0xFF;                      // A
    }

    // Cycle & Scanline Advance
    this.cycle++;
    if (this.cycle >= 341) {
      this.cycle = 0;
      this.scanline++;
      if (this.scanline >= 261) {
        this.scanline = -1;
        this.frameComplete = true;
      }
    }
  }

  // --- Scroll Register Transformations ---
  incrementScrollX() {
    if (this.mask.renderBackground || this.mask.renderSprites) {
      if ((this.vramAddr.raw & 0x001F) === 31) {
        this.vramAddr.raw &= ~0x001F;
        this.vramAddr.raw ^= 0x0400; // Switch horizontal nametable
      } else {
        this.vramAddr.raw = (this.vramAddr.raw + 1) & 0x7FFF;
      }
    }
  }

  incrementScrollY() {
    if (this.mask.renderBackground || this.mask.renderSprites) {
      let fineY = (this.vramAddr.raw >> 12) & 0x07;
      if (fineY < 7) {
        this.vramAddr.raw = (this.vramAddr.raw + 0x1000) & 0x7FFF;
      } else {
        this.vramAddr.raw &= ~0x7000;
        let coarseY = (this.vramAddr.raw >> 5) & 0x1F;
        if (coarseY === 29) {
          coarseY = 0;
          this.vramAddr.raw ^= 0x0800; // Switch vertical nametable
        } else if (coarseY === 31) {
          coarseY = 0;
        } else {
          coarseY++;
        }
        this.vramAddr.raw = (this.vramAddr.raw & ~0x03E0) | (coarseY << 5);
      }
    }
  }

  transferAddressX() {
    if (this.mask.renderBackground || this.mask.renderSprites) {
      this.vramAddr.raw = (this.vramAddr.raw & ~0x041F) | (this.tramAddr.raw & 0x041F);
    }
  }

  transferAddressY() {
    if (this.mask.renderBackground || this.mask.renderSprites) {
      this.vramAddr.raw = (this.vramAddr.raw & ~0x7BE0) | (this.tramAddr.raw & 0x7BE0);
    }
  }

  loadBackgroundShifters() {
    this.bgShifterPatternLo = (this.bgShifterPatternLo & 0xFF00) | this.bgNextTileLsb;
    this.bgShifterPatternHi = (this.bgShifterPatternHi & 0xFF00) | this.bgNextTileMsb;
    this.bgShifterAttribLo = (this.bgShifterAttribLo & 0xFF00) | ((this.bgNextTileAttrib & 0x01) ? 0xFF : 0x00);
    this.bgShifterAttribHi = (this.bgShifterAttribHi & 0xFF00) | ((this.bgNextTileAttrib & 0x02) ? 0xFF : 0x00);
  }

  updateShifters() {
    if (this.mask.renderBackground) {
      this.bgShifterPatternLo = (this.bgShifterPatternLo << 1) & 0xFFFF;
      this.bgShifterPatternHi = (this.bgShifterPatternHi << 1) & 0xFFFF;
      this.bgShifterAttribLo = (this.bgShifterAttribLo << 1) & 0xFFFF;
      this.bgShifterAttribHi = (this.bgShifterAttribHi << 1) & 0xFFFF;
    }
  }

  reset() {
    this.fineX = 0;
    this.addressLatch = 0;
    this.ppuDataBuffer = 0;
    this.scanline = 0;
    this.cycle = 0;
    this.bgNextTileId = 0;
    this.bgNextTileAttrib = 0;
    this.bgNextTileLsb = 0;
    this.bgNextTileMsb = 0;
    this.bgShifterPatternLo = 0;
    this.bgShifterPatternHi = 0;
    this.bgShifterAttribLo = 0;
    this.bgShifterAttribHi = 0;
    this.status.verticalBlank = 0;
    this.status.spriteZeroHit = 0;
    this.status.spriteOverflow = 0;
    this.control.enableNmi = 0;
    this.oamAddr = 0;
    this.scanlineSprites = [];
  }
}
