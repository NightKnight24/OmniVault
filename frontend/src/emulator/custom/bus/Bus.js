/**
 * OmniVault Custom Core - System Bus Architecture
 * 
 * Maps 64KB CPU Address Space:
 * $0000 - $1FFF : 2KB Internal RAM (mirrored 4 times)
 * $2000 - $3FFF : PPU Registers ($2000-$2007 mirrored every 8 bytes)
 * $4000 - $4017 : APU & I/O Registers ($4014 = OAM DMA, $4016/$4017 = Controllers)
 * $4018 - $401F : APU and I/O test mode
 * $4020 - $FFFF : Cartridge Space (PRG ROM, PRG RAM, Mapper Registers)
 */

export class Bus {
  constructor() {
    this.cpu = null;
    this.ppu = null;
    this.apu = null;
    this.cartridge = null;
    this.controller1 = null;
    this.controller2 = null;

    // 2KB internal CPU RAM
    this.cpuRam = new Uint8Array(2048);

    // Hardware Game Genie ROM patches ($8000-$FFFF -> { value, compare })
    // and Live RAM freezes ($0000-$07FF -> Uint8Array)
    this.romCheats = new Map();
    this.ramFreezes = new Map();

    // Master system clock ticks
    this.systemClockCounter = 0;

    // Direct Memory Access (DMA) for Sprite OAM transfer
    this.dmaPage = 0x00;
    this.dmaByte = 0x00;
    this.dmaData = 0x00;
    this.dmaTransfer = false;
    this.dmaDummy = true;
  }

  connect(cpu, ppu, apu, cartridge, controller1, controller2) {
    this.cpu = cpu;
    this.ppu = ppu;
    this.apu = apu;
    this.cartridge = cartridge;
    this.controller1 = controller1;
    this.controller2 = controller2;

    if (this.cpu) this.cpu.connectBus(this);
    if (this.ppu) this.ppu.connectBus(this);
    if (this.apu) this.apu.connectBus(this);
  }

  cpuRead(addr, readOnly = false) {
    addr &= 0xFFFF;
    let data = 0x00;

    // 1. Cartridge space ($4020 - $FFFF)
    if (this.cartridge && this.cartridge.cpuRead(addr, (val) => { data = val; })) {
      if (this.romCheats.size > 0 && this.romCheats.has(addr)) {
        const cheat = this.romCheats.get(addr);
        if (cheat.compare === null || cheat.compare === undefined || cheat.compare === data) {
          return cheat.value & 0xFF;
        }
      }
      return data;
    }

    // 2. Internal CPU RAM ($0000 - $1FFF, mirrored every 2KB)
    if (addr >= 0x0000 && addr <= 0x1FFF) {
      const ramAddr = addr & 0x07FF;
      if (this.ramFreezes.size > 0 && this.ramFreezes.has(ramAddr)) {
        return this.ramFreezes.get(ramAddr) & 0xFF;
      }
      return this.cpuRam[ramAddr];
    }

    // 3. PPU Registers ($2000 - $3FFF, mirrored every 8 bytes)
    if (addr >= 0x2000 && addr <= 0x3FFF) {
      if (this.ppu) {
        return this.ppu.cpuRead(addr & 0x0007, readOnly);
      }
      return 0x00;
    }

    // 4. Controller 1 & 2 ($4016, $4017)
    if (addr === 0x4016) {
      return this.controller1 ? this.controller1.read() : 0x00;
    }
    if (addr === 0x4017) {
      return this.controller2 ? this.controller2.read() : 0x00;
    }

    // 5. APU Status register ($4015)
    if (addr === 0x4015 && this.apu) {
      return this.apu.cpuRead(addr);
    }

    return 0x00;
  }

  cpuWrite(addr, data) {
    addr &= 0xFFFF;
    data &= 0xFF;

    // 1. Cartridge space ($4020 - $FFFF)
    if (this.cartridge && this.cartridge.cpuWrite(addr, data)) {
      return;
    }

    // 2. Internal CPU RAM ($0000 - $1FFF, mirrored)
    if (addr >= 0x0000 && addr <= 0x1FFF) {
      this.cpuRam[addr & 0x07FF] = data;
      return;
    }

    // 3. PPU Registers ($2000 - $3FFF, mirrored)
    if (addr >= 0x2000 && addr <= 0x3FFF) {
      if (this.ppu) {
        this.ppu.cpuWrite(addr & 0x0007, data);
      }
      return;
    }

    // 4. OAM DMA Register ($4014) - Triggers 256-byte bulk sprite copy
    if (addr === 0x4014) {
      this.dmaPage = data;
      this.dmaByte = 0x00;
      this.dmaTransfer = true;
      this.dmaDummy = true;
      return;
    }

    // 5. Controller Strobe ($4016)
    if (addr === 0x4016) {
      if (this.controller1) this.controller1.write(data);
      if (this.controller2) this.controller2.write(data);
      return;
    }

    // 6. APU Registers ($4000 - $4017)
    if (addr >= 0x4000 && addr <= 0x4017) {
      if (this.apu) {
        this.apu.cpuWrite(addr, data);
      }
      return;
    }
  }

  clock() {
    // PPU clocks on EVERY master clock tick (3 times faster than CPU)
    if (this.ppu) {
      this.ppu.clock();
    }

    // CPU and APU clock once every 3 master clock ticks
    if (this.systemClockCounter % 3 === 0) {
      // Handle DMA Sprite Transfer if active
      if (this.dmaTransfer) {
        if (this.dmaDummy) {
          // Synchronization cycle (wait for odd CPU cycle)
          if (this.systemClockCounter % 2 === 1) {
            this.dmaDummy = false;
          }
        } else {
          // Read on even cycles, write on odd cycles
          if (this.systemClockCounter % 2 === 0) {
            const dmaAddr = (this.dmaPage << 8) | this.dmaByte;
            this.dmaData = this.cpuRead(dmaAddr);
          } else {
            if (this.ppu) {
              this.ppu.oam[this.dmaByte] = this.dmaData;
            }
            this.dmaByte = (this.dmaByte + 1) & 0xFF;
            if (this.dmaByte === 0x00) {
              this.dmaTransfer = false;
              this.dmaDummy = true;
            }
          }
        }
      } else {
        // Normal CPU instruction step
        if (this.cpu) {
          this.cpu.clock();
        }
      }

      // APU step
      if (this.apu) {
        this.apu.clock();
      }
    }

    // PPU NMI Trigger Check
    if (this.ppu && this.ppu.nmiTriggered) {
      this.ppu.nmiTriggered = false;
      if (this.cpu) {
        this.cpu.nmi();
      }
    }

    // Cartridge IRQ check
    if (this.cartridge && this.cartridge.irqState()) {
      this.cartridge.irqClear();
      if (this.cpu) {
        this.cpu.irq();
      }
    }

    this.systemClockCounter++;
  }

  reset() {
    this.cpuRam.fill(0);
    this.systemClockCounter = 0;
    this.dmaPage = 0;
    this.dmaByte = 0;
    this.dmaData = 0;
    this.dmaTransfer = false;
    this.dmaDummy = true;

    if (this.cartridge) this.cartridge.reset();
    if (this.cpu) this.cpu.reset();
    if (this.ppu) this.ppu.reset();
    if (this.apu) this.apu.reset();
  }
}
