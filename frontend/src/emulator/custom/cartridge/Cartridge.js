/**
 * OmniVault Custom Core - Cartridge & iNES Format Loader
 * 
 * Supports:
 * - iNES Header Parsing (Magic 'NES^Z', PRG-ROM banks, CHR-ROM/RAM banks)
 * - Horizontal, Vertical, and Single-Screen Mirroring
 * - Mapper 0 (NROM: Super Mario Bros, Tetris, Pac-Man)
 * - Mapper 1 (MMC1: Mega Man 2, Legend of Zelda, Metroid)
 * - Mapper 2 (UxROM: Mega Man, Castlevania, Contra)
 * - Mapper 3 (CNROM: Cybernoid, Solomon's Key)
 */

export class Cartridge {
  constructor(romBuffer) {
    this.rom = new Uint8Array(romBuffer);
    this.prgRom = null;
    this.chrRom = null;
    this.prgRam = new Uint8Array(8192); // 8KB Battery/Work PRG-RAM at $6000-$7FFF
    this.mapperId = 0;
    this.prgBanks = 0;
    this.chrBanks = 0;
    this.mirror = 0; // 0 = Horizontal, 1 = Vertical

    // Mapper registers
    this.mapper0_prgMask = 0;
    this.mapper1_shift = 0x10;
    this.mapper1_control = 0x0C;
    this.mapper1_prgBank = 0;
    this.mapper1_chrBank0 = 0;
    this.mapper1_chrBank1 = 0;
    this.mapper2_prgBank = 0;
    this.mapper3_chrBank = 0;

    // Mapper 4 (MMC3) state
    this.mmc3_targetReg = 0;
    this.mmc3_prgBankMode = false;
    this.mmc3_chrInversion = false;
    this.mmc3_regs = new Uint32Array(8);
    this.mmc3_irqActive = false;
    this.mmc3_irqEnable = false;
    this.mmc3_irqReload = false;
    this.mmc3_irqCounter = 0;
    this.mmc3_irqLatch = 0;

    // Mapper 7 (AxROM) state
    this.mapper7_prgBank = 0;

    this.parseHeader();
  }

  parseHeader() {
    // Check 'NES\x1A' magic string
    if (this.rom[0] !== 0x4E || this.rom[1] !== 0x45 || this.rom[2] !== 0x53 || this.rom[3] !== 0x1A) {
      throw new Error("Invalid NES ROM: Missing 'NES\\x1A' header.");
    }

    this.prgBanks = this.rom[4];
    this.chrBanks = this.rom[5];

    const flags6 = this.rom[6];
    const flags7 = this.rom[7];

    this.mirror = (flags6 & 0x01) ? 1 : 0; // 0 = horizontal, 1 = vertical
    this.mapperId = ((flags7 & 0xF0) | (flags6 >> 4));

    let filePtr = 16;
    // Skip 512-byte trainer if present
    if (flags6 & 0x04) {
      filePtr += 512;
    }

    // Extract PRG ROM (16KB per bank)
    const prgSize = this.prgBanks * 16384;
    this.prgRom = this.rom.slice(filePtr, filePtr + prgSize);
    filePtr += prgSize;

    // Extract CHR ROM (8KB per bank), or allocate 8KB CHR RAM if 0 banks
    if (this.chrBanks > 0) {
      const chrSize = this.chrBanks * 8192;
      this.chrRom = this.rom.slice(filePtr, filePtr + chrSize);
    } else {
      this.chrRom = new Uint8Array(8192); // 8KB CHR RAM
    }

    this.mapper0_prgMask = this.prgBanks > 1 ? 0x7FFF : 0x3FFF;
  }

  cpuRead(addr, callback) {
    if (addr >= 0x6000 && addr <= 0x7FFF) {
      callback(this.prgRam[addr & 0x1FFF]);
      return true;
    }
    if (addr >= 0x8000 && addr <= 0xFFFF) {
      let mappedAddr = 0;

      switch (this.mapperId) {
        case 0: // NROM
          mappedAddr = (addr - 0x8000) & this.mapper0_prgMask;
          break;

        case 1: // MMC1
          const prgMode = (this.mapper1_control >> 2) & 0x03;
          if (prgMode <= 1) {
            // 32KB switchable
            mappedAddr = ((this.mapper1_prgBank & 0x0E) * 16384) + (addr - 0x8000);
          } else if (prgMode === 2) {
            // Fix first bank at $8000, switch 16KB at $C000
            if (addr >= 0x8000 && addr <= 0xBFFF) {
              mappedAddr = addr - 0x8000;
            } else {
              mappedAddr = (this.mapper1_prgBank * 16384) + (addr - 0xC000);
            }
          } else {
            // Switch 16KB at $8000, fix last bank at $C000
            if (addr >= 0x8000 && addr <= 0xBFFF) {
              mappedAddr = (this.mapper1_prgBank * 16384) + (addr - 0x8000);
            } else {
              mappedAddr = ((this.prgBanks - 1) * 16384) + (addr - 0xC000);
            }
          }
          break;

        case 2: // UxROM
          if (addr >= 0x8000 && addr <= 0xBFFF) {
            mappedAddr = (this.mapper2_prgBank * 16384) + (addr - 0x8000);
          } else {
            // Fixed to last 16KB bank
            mappedAddr = ((this.prgBanks - 1) * 16384) + (addr - 0xC000);
          }
          break;

        case 3: // CNROM
          mappedAddr = (addr - 0x8000) & this.mapper0_prgMask;
          break;

        case 4: { // MMC3 (8KB banks)
          const total8k = Math.max(1, this.prgBanks * 2);
          let bank8k = 0;
          if (addr >= 0x8000 && addr <= 0x9FFF) {
            bank8k = this.mmc3_prgBankMode ? (total8k - 2) : (this.mmc3_regs[6] % total8k);
            mappedAddr = (bank8k * 8192) + (addr & 0x1FFF);
          } else if (addr >= 0xA000 && addr <= 0xBFFF) {
            bank8k = this.mmc3_regs[7] % total8k;
            mappedAddr = (bank8k * 8192) + (addr & 0x1FFF);
          } else if (addr >= 0xC000 && addr <= 0xDFFF) {
            bank8k = this.mmc3_prgBankMode ? (this.mmc3_regs[6] % total8k) : (total8k - 2);
            mappedAddr = (bank8k * 8192) + (addr & 0x1FFF);
          } else {
            bank8k = total8k - 1;
            mappedAddr = (bank8k * 8192) + (addr & 0x1FFF);
          }
          break;
        }

        case 7: // AxROM (32KB switchable)
          mappedAddr = (this.mapper7_prgBank * 32768) + (addr - 0x8000);
          break;

        default:
          mappedAddr = (addr - 0x8000) & (this.prgRom.length - 1);
          break;
      }

      callback(this.prgRom[mappedAddr % this.prgRom.length]);
      return true;
    }
    return false;
  }

  cpuWrite(addr, data) {
    if (addr >= 0x6000 && addr <= 0x7FFF) {
      this.prgRam[addr & 0x1FFF] = data;
      return true;
    }
    if (addr >= 0x8000 && addr <= 0xFFFF) {
      switch (this.mapperId) {
        case 1: // MMC1 Serial Shift Register
          if (data & 0x80) {
            this.mapper1_shift = 0x10;
            this.mapper1_control |= 0x0C;
          } else {
            const complete = this.mapper1_shift & 0x01;
            this.mapper1_shift = (this.mapper1_shift >> 1) | ((data & 0x01) << 4);
            if (complete) {
              const reg = (addr >> 13) & 0x03;
              const val = this.mapper1_shift;
              if (reg === 0) {
                this.mapper1_control = val & 0x1F;
                const mir = val & 0x03;
                if (mir === 0) this.mirror = 2; // Single-Screen Lower
                else if (mir === 1) this.mirror = 3; // Single-Screen Upper
                else if (mir === 2) this.mirror = 1; // Vertical
                else if (mir === 3) this.mirror = 0; // Horizontal
              }
              if (reg === 1) this.mapper1_chrBank0 = val & 0x1F;
              if (reg === 2) this.mapper1_chrBank1 = val & 0x1F;
              if (reg === 3) this.mapper1_prgBank = val & 0x0F;
              this.mapper1_shift = 0x10;
            }
          }
          return true;

        case 2: // UxROM Bank Switch
          this.mapper2_prgBank = data & 0x0F;
          return true;

        case 3: // CNROM CHR Bank Switch
          this.mapper3_chrBank = data & 0x03;
          return true;

        case 4: // MMC3
          if (addr >= 0x8000 && addr <= 0x9FFF) {
            if ((addr & 1) === 0) {
              this.mmc3_targetReg = data & 0x07;
              this.mmc3_prgBankMode = (data & 0x40) !== 0;
              this.mmc3_chrInversion = (data & 0x80) !== 0;
            } else {
              this.mmc3_regs[this.mmc3_targetReg] = data;
            }
          } else if (addr >= 0xA000 && addr <= 0xBFFF) {
            if ((addr & 1) === 0) {
              // MMC3 bit 0: 0 = Vertical (1), 1 = Horizontal (0)
              this.mirror = (data & 0x01) ? 0 : 1;
            }
          } else if (addr >= 0xC000 && addr <= 0xDFFF) {
            if ((addr & 1) === 0) {
              this.mmc3_irqLatch = data;
            } else {
              this.mmc3_irqReload = true;
            }
          } else if (addr >= 0xE000 && addr <= 0xFFFF) {
            if ((addr & 1) === 0) {
              this.mmc3_irqEnable = false;
              this.mmc3_irqActive = false;
            } else {
              this.mmc3_irqEnable = true;
            }
          }
          return true;

        case 7: // AxROM
          this.mapper7_prgBank = data & 0x07;
          this.mirror = (data & 0x10) ? 3 : 2;
          return true;
      }
    }
    return false;
  }

  ppuRead(addr, callback) {
    if (addr >= 0x0000 && addr <= 0x1FFF) {
      let mappedAddr = addr;
      if (this.mapperId === 1 && this.chrBanks > 0) {
        const chrMode = (this.mapper1_control >> 4) & 0x01;
        if (chrMode === 0) {
          // 8KB switchable CHR bank
          mappedAddr = ((this.mapper1_chrBank0 & 0x1E) * 4096) + addr;
        } else {
          // Two 4KB switchable CHR banks
          if (addr < 0x1000) {
            mappedAddr = (this.mapper1_chrBank0 * 4096) + addr;
          } else {
            mappedAddr = (this.mapper1_chrBank1 * 4096) + (addr - 0x1000);
          }
        }
      } else if (this.mapperId === 3) {
        mappedAddr = (this.mapper3_chrBank * 8192) + addr;
      } else if (this.mapperId === 4 && this.chrBanks > 0) {
        const effAddr = this.mmc3_chrInversion ? (addr ^ 0x1000) : addr;
        let bank1k = 0;
        if (effAddr < 0x0800) {
          bank1k = (this.mmc3_regs[0] & 0xFE) + ((effAddr >> 10) & 1);
        } else if (effAddr < 0x1000) {
          bank1k = (this.mmc3_regs[1] & 0xFE) + ((effAddr >> 10) & 1);
        } else {
          const rIdx = 2 + ((effAddr - 0x1000) >> 10);
          bank1k = this.mmc3_regs[rIdx];
        }
        mappedAddr = (bank1k * 1024) + (addr & 0x03FF);
      }
      callback(this.chrRom[mappedAddr % this.chrRom.length]);
      return true;
    }
    return false;
  }

  ppuWrite(addr, data) {
    if (addr >= 0x0000 && addr <= 0x1FFF) {
      if (this.chrBanks === 0) {
        // CHR RAM is writable
        this.chrRom[addr & 0x1FFF] = data;
        return true;
      }
    }
    return false;
  }

  scanline() {
    if (this.mapperId === 4) {
      if (this.mmc3_irqCounter === 0 || this.mmc3_irqReload) {
        this.mmc3_irqCounter = this.mmc3_irqLatch;
        this.mmc3_irqReload = false;
      } else {
        this.mmc3_irqCounter--;
      }
      if (this.mmc3_irqCounter === 0 && this.mmc3_irqEnable) {
        this.mmc3_irqActive = true;
      }
    }
  }

  irqState() { return this.mmc3_irqActive; }
  irqClear() { this.mmc3_irqActive = false; }
  reset() {
    this.mapper1_shift = 0x10;
    this.mapper1_control = 0x0C;
    this.mapper1_prgBank = 0;
    this.mapper2_prgBank = 0;
    this.mapper3_chrBank = 0;
    this.mmc3_irqActive = false;
    this.mmc3_irqEnable = false;
    this.mmc3_irqCounter = 0;
  }
}
