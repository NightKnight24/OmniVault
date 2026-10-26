/**
 * OmniVault Custom Core - MOS 6502 Microprocessor Engine
 * 
 * Features:
 * - Cycle-accurate instruction decoding matrix
 * - Full 56 official 6502 opcodes + illegal NOP fallbacks
 * - 13 addressing modes with page boundary cycle penalty detection
 * - High-precision status flag calculations (Negative, Overflow, Zero, Carry)
 * - NMI, IRQ, and Hardware RESET vector handling
 */

export const FLAGS6502 = {
  C: 1 << 0, // Carry
  Z: 1 << 1, // Zero
  I: 1 << 2, // Disable Interrupts
  D: 1 << 3, // Decimal Mode
  B: 1 << 4, // Break
  U: 1 << 5, // Unused (always 1 in stack)
  V: 1 << 6, // Overflow
  N: 1 << 7, // Negative
};

export class CPU6502 {
  constructor() {
    this.bus = null;

    // Core Registers
    this.a = 0x00;       // Accumulator
    this.x = 0x00;       // X Register
    this.y = 0x00;       // Y Register
    this.stkp = 0x00;    // Stack Pointer ($0100 + stkp)
    this.pc = 0x0000;    // Program Counter
    this.status = 0x00;  // Status Register (P)

    // Internal timing & execution variables
    this.fetched = 0x00;
    this.addrAbs = 0x0000;
    this.addrRel = 0x0000;
    this.opcode = 0x00;
    this.cycles = 0;
    this.totalCycles = 0;

    this.lookup = this.createOpcodeTable();
  }

  connectBus(bus) {
    this.bus = bus;
  }

  // --- Bus Interface ---
  read(addr) {
    return this.bus.cpuRead(addr);
  }

  write(addr, data) {
    this.bus.cpuWrite(addr, data);
  }

  // --- Flag Helpers ---
  getFlag(f) {
    return (this.status & f) !== 0 ? 1 : 0;
  }

  setFlag(f, v) {
    if (v) {
      this.status |= f;
    } else {
      this.status &= ~f;
    }
  }

  // --- Clock & Stepping ---
  clock() {
    if (this.cycles === 0) {
      this.opcode = this.read(this.pc);
      this.setFlag(FLAGS6502.U, true);
      this.pc = (this.pc + 1) & 0xFFFF;

      const inst = this.lookup[this.opcode];
      this.cycles = inst.cycles;

      const additionalCycle1 = inst.addrmode.call(this);
      const additionalCycle2 = inst.operate.call(this);

      this.cycles += (additionalCycle1 & additionalCycle2);
      this.setFlag(FLAGS6502.U, true);
    }

    this.cycles--;
    this.totalCycles++;
  }

  fetch() {
    if (this.lookup[this.opcode].addrmode !== this.IMP) {
      this.fetched = this.read(this.addrAbs);
    }
    return this.fetched;
  }

  // --- Interrupts ---
  reset() {
    this.addrAbs = 0xFFFC;
    const lo = this.read(this.addrAbs);
    const hi = this.read(this.addrAbs + 1);
    this.pc = (hi << 8) | lo;

    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.stkp = 0xFD;
    this.status = 0x00 | FLAGS6502.U | FLAGS6502.I;

    this.addrRel = 0;
    this.addrAbs = 0;
    this.fetched = 0;
    this.cycles = 8;
  }

  irq() {
    if (this.getFlag(FLAGS6502.I) === 0) {
      // Push PC (hi then lo)
      this.write(0x0100 + this.stkp, (this.pc >> 8) & 0xFF);
      this.stkp = (this.stkp - 1) & 0xFF;
      this.write(0x0100 + this.stkp, this.pc & 0xFF);
      this.stkp = (this.stkp - 1) & 0xFF;

      // Push Status with B=0, U=1
      this.setFlag(FLAGS6502.B, false);
      this.setFlag(FLAGS6502.U, true);
      this.setFlag(FLAGS6502.I, true);
      this.write(0x0100 + this.stkp, this.status);
      this.stkp = (this.stkp - 1) & 0xFF;

      this.addrAbs = 0xFFFE;
      const lo = this.read(this.addrAbs);
      const hi = this.read(this.addrAbs + 1);
      this.pc = (hi << 8) | lo;

      this.cycles = 7;
    }
  }

  nmi() {
    this.write(0x0100 + this.stkp, (this.pc >> 8) & 0xFF);
    this.stkp = (this.stkp - 1) & 0xFF;
    this.write(0x0100 + this.stkp, this.pc & 0xFF);
    this.stkp = (this.stkp - 1) & 0xFF;

    this.setFlag(FLAGS6502.B, false);
    this.setFlag(FLAGS6502.U, true);
    this.setFlag(FLAGS6502.I, true);
    this.write(0x0100 + this.stkp, this.status);
    this.stkp = (this.stkp - 1) & 0xFF;

    this.addrAbs = 0xFFFA;
    const lo = this.read(this.addrAbs);
    const hi = this.read(this.addrAbs + 1);
    this.pc = (hi << 8) | lo;

    this.cycles = 8;
  }

  // --- Addressing Modes ---
  IMP() {
    this.fetched = this.a;
    return 0;
  }

  IMM() {
    this.addrAbs = this.pc;
    this.pc = (this.pc + 1) & 0xFFFF;
    return 0;
  }

  ZP0() {
    this.addrAbs = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.addrAbs &= 0x00FF;
    return 0;
  }

  ZPX() {
    this.addrAbs = (this.read(this.pc) + this.x) & 0x00FF;
    this.pc = (this.pc + 1) & 0xFFFF;
    return 0;
  }

  ZPY() {
    this.addrAbs = (this.read(this.pc) + this.y) & 0x00FF;
    this.pc = (this.pc + 1) & 0xFFFF;
    return 0;
  }

  REL() {
    this.addrRel = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    if ((this.addrRel & 0x80) !== 0) {
      this.addrRel |= 0xFF00; // Sign extend
    }
    return 0;
  }

  ABS() {
    const lo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.addrAbs = (hi << 8) | lo;
    return 0;
  }

  ABX() {
    const lo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.addrAbs = ((hi << 8) | lo) + this.x;
    this.addrAbs &= 0xFFFF;

    // Check if page boundary crossed
    return ((this.addrAbs & 0xFF00) !== (hi << 8)) ? 1 : 0;
  }

  ABY() {
    const lo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const hi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    this.addrAbs = ((hi << 8) | lo) + this.y;
    this.addrAbs &= 0xFFFF;

    return ((this.addrAbs & 0xFF00) !== (hi << 8)) ? 1 : 0;
  }

  IND() {
    const ptrLo = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const ptrHi = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const ptr = (ptrHi << 8) | ptrLo;

    // Hardware bug simulation: page boundary wrap
    if (ptrLo === 0x00FF) {
      this.addrAbs = (this.read(ptr & 0xFF00) << 8) | this.read(ptr);
    } else {
      this.addrAbs = (this.read(ptr + 1) << 8) | this.read(ptr);
    }
    return 0;
  }

  IZX() {
    const t = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const lo = this.read((t + this.x) & 0x00FF);
    const hi = this.read((t + this.x + 1) & 0x00FF);
    this.addrAbs = (hi << 8) | lo;
    return 0;
  }

  IZY() {
    const t = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    const lo = this.read(t & 0x00FF);
    const hi = this.read((t + 1) & 0x00FF);
    this.addrAbs = ((hi << 8) | lo) + this.y;
    this.addrAbs &= 0xFFFF;

    return ((this.addrAbs & 0xFF00) !== (hi << 8)) ? 1 : 0;
  }

  // --- Instruction Implementations ---
  ADC() {
    this.fetch();
    const temp = this.a + this.fetched + this.getFlag(FLAGS6502.C);
    this.setFlag(FLAGS6502.C, temp > 255);
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.V, (~(this.a ^ this.fetched) & (this.a ^ temp) & 0x0080) !== 0);
    this.setFlag(FLAGS6502.N, (temp & 0x80) !== 0);
    this.a = temp & 0x00FF;
    return 1;
  }

  SBC() {
    this.fetch();
    const value = this.fetched ^ 0x00FF;
    const temp = this.a + value + this.getFlag(FLAGS6502.C);
    this.setFlag(FLAGS6502.C, (temp & 0xFF00) !== 0);
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.V, ((temp ^ this.a) & (temp ^ value) & 0x0080) !== 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    this.a = temp & 0x00FF;
    return 1;
  }

  AND() {
    this.fetch();
    this.a &= this.fetched;
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x80) !== 0);
    return 1;
  }

  ASL() {
    this.fetch();
    const temp = this.fetched << 1;
    this.setFlag(FLAGS6502.C, (temp & 0xFF00) > 0);
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x80) !== 0);
    if (this.lookup[this.opcode].addrmode === this.IMP) {
      this.a = temp & 0x00FF;
    } else {
      this.write(this.addrAbs, temp & 0x00FF);
    }
    return 0;
  }

  BCC() { return this.branch(this.getFlag(FLAGS6502.C) === 0); }
  BCS() { return this.branch(this.getFlag(FLAGS6502.C) === 1); }
  BEQ() { return this.branch(this.getFlag(FLAGS6502.Z) === 1); }
  BMI() { return this.branch(this.getFlag(FLAGS6502.N) === 1); }
  BNE() { return this.branch(this.getFlag(FLAGS6502.Z) === 0); }
  BPL() { return this.branch(this.getFlag(FLAGS6502.N) === 0); }
  BVC() { return this.branch(this.getFlag(FLAGS6502.V) === 0); }
  BVS() { return this.branch(this.getFlag(FLAGS6502.V) === 1); }

  branch(condition) {
    if (condition) {
      this.cycles++;
      this.addrAbs = (this.pc + this.addrRel) & 0xFFFF;
      if ((this.addrAbs & 0xFF00) !== (this.pc & 0xFF00)) {
        this.cycles++;
      }
      this.pc = this.addrAbs;
    }
    return 0;
  }

  BIT() {
    this.fetch();
    const temp = this.a & this.fetched;
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.N, (this.fetched & (1 << 7)) !== 0);
    this.setFlag(FLAGS6502.V, (this.fetched & (1 << 6)) !== 0);
    return 0;
  }

  BRK() {
    this.pc = (this.pc + 1) & 0xFFFF;
    this.setFlag(FLAGS6502.I, true);
    this.write(0x0100 + this.stkp, (this.pc >> 8) & 0xFF);
    this.stkp = (this.stkp - 1) & 0xFF;
    this.write(0x0100 + this.stkp, this.pc & 0xFF);
    this.stkp = (this.stkp - 1) & 0xFF;

    this.setFlag(FLAGS6502.B, true);
    this.write(0x0100 + this.stkp, this.status);
    this.stkp = (this.stkp - 1) & 0xFF;
    this.setFlag(FLAGS6502.B, false);

    this.pc = this.read(0xFFFE) | (this.read(0xFFFF) << 8);
    return 0;
  }

  CLC() { this.setFlag(FLAGS6502.C, false); return 0; }
  CLD() { this.setFlag(FLAGS6502.D, false); return 0; }
  CLI() { this.setFlag(FLAGS6502.I, false); return 0; }
  CLV() { this.setFlag(FLAGS6502.V, false); return 0; }
  SEC() { this.setFlag(FLAGS6502.C, true); return 0; }
  SED() { this.setFlag(FLAGS6502.D, true); return 0; }
  SEI() { this.setFlag(FLAGS6502.I, true); return 0; }

  CMP() { return this.compare(this.a); }
  CPX() { return this.compare(this.x); }
  CPY() { return this.compare(this.y); }

  compare(reg) {
    this.fetch();
    const temp = reg - this.fetched;
    this.setFlag(FLAGS6502.C, reg >= this.fetched);
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    return 1;
  }

  DEC() {
    this.fetch();
    const temp = (this.fetched - 1) & 0x00FF;
    this.write(this.addrAbs, temp);
    this.setFlag(FLAGS6502.Z, temp === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    return 0;
  }

  DEX() {
    this.x = (this.x - 1) & 0x00FF;
    this.setFlag(FLAGS6502.Z, this.x === 0);
    this.setFlag(FLAGS6502.N, (this.x & 0x0080) !== 0);
    return 0;
  }

  DEY() {
    this.y = (this.y - 1) & 0x00FF;
    this.setFlag(FLAGS6502.Z, this.y === 0);
    this.setFlag(FLAGS6502.N, (this.y & 0x0080) !== 0);
    return 0;
  }

  EOR() {
    this.fetch();
    this.a ^= this.fetched;
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x0080) !== 0);
    return 1;
  }

  INC() {
    this.fetch();
    const temp = (this.fetched + 1) & 0x00FF;
    this.write(this.addrAbs, temp);
    this.setFlag(FLAGS6502.Z, temp === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    return 0;
  }

  INX() {
    this.x = (this.x + 1) & 0x00FF;
    this.setFlag(FLAGS6502.Z, this.x === 0);
    this.setFlag(FLAGS6502.N, (this.x & 0x0080) !== 0);
    return 0;
  }

  INY() {
    this.y = (this.y + 1) & 0x00FF;
    this.setFlag(FLAGS6502.Z, this.y === 0);
    this.setFlag(FLAGS6502.N, (this.y & 0x0080) !== 0);
    return 0;
  }

  JMP() {
    this.pc = this.addrAbs;
    return 0;
  }

  JSR() {
    this.pc = (this.pc - 1) & 0xFFFF;
    this.write(0x0100 + this.stkp, (this.pc >> 8) & 0xFF);
    this.stkp = (this.stkp - 1) & 0xFF;
    this.write(0x0100 + this.stkp, this.pc & 0xFF);
    this.stkp = (this.stkp - 1) & 0xFF;
    this.pc = this.addrAbs;
    return 0;
  }

  LDA() {
    this.fetch();
    this.a = this.fetched;
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x0080) !== 0);
    return 1;
  }

  LDX() {
    this.fetch();
    this.x = this.fetched;
    this.setFlag(FLAGS6502.Z, this.x === 0);
    this.setFlag(FLAGS6502.N, (this.x & 0x0080) !== 0);
    return 1;
  }

  LDY() {
    this.fetch();
    this.y = this.fetched;
    this.setFlag(FLAGS6502.Z, this.y === 0);
    this.setFlag(FLAGS6502.N, (this.y & 0x0080) !== 0);
    return 1;
  }

  LSR() {
    this.fetch();
    this.setFlag(FLAGS6502.C, (this.fetched & 0x0001) !== 0);
    const temp = this.fetched >> 1;
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    if (this.lookup[this.opcode].addrmode === this.IMP) {
      this.a = temp & 0x00FF;
    } else {
      this.write(this.addrAbs, temp & 0x00FF);
    }
    return 0;
  }

  NOP() {
    return 0;
  }

  ORA() {
    this.fetch();
    this.a |= this.fetched;
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x0080) !== 0);
    return 1;
  }

  PHA() {
    this.write(0x0100 + this.stkp, this.a);
    this.stkp = (this.stkp - 1) & 0xFF;
    return 0;
  }

  PHP() {
    this.write(0x0100 + this.stkp, this.status | FLAGS6502.B | FLAGS6502.U);
    this.setFlag(FLAGS6502.B, false);
    this.setFlag(FLAGS6502.U, true);
    this.stkp = (this.stkp - 1) & 0xFF;
    return 0;
  }

  PLA() {
    this.stkp = (this.stkp + 1) & 0xFF;
    this.a = this.read(0x0100 + this.stkp);
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x0080) !== 0);
    return 0;
  }

  PLP() {
    this.stkp = (this.stkp + 1) & 0xFF;
    this.status = this.read(0x0100 + this.stkp);
    this.setFlag(FLAGS6502.U, true);
    return 0;
  }

  ROL() {
    this.fetch();
    const temp = (this.fetched << 1) | this.getFlag(FLAGS6502.C);
    this.setFlag(FLAGS6502.C, (temp & 0xFF00) > 0);
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    if (this.lookup[this.opcode].addrmode === this.IMP) {
      this.a = temp & 0x00FF;
    } else {
      this.write(this.addrAbs, temp & 0x00FF);
    }
    return 0;
  }

  ROR() {
    this.fetch();
    const temp = (this.getFlag(FLAGS6502.C) << 7) | (this.fetched >> 1);
    this.setFlag(FLAGS6502.C, (this.fetched & 0x01) !== 0);
    this.setFlag(FLAGS6502.Z, (temp & 0x00FF) === 0);
    this.setFlag(FLAGS6502.N, (temp & 0x0080) !== 0);
    if (this.lookup[this.opcode].addrmode === this.IMP) {
      this.a = temp & 0x00FF;
    } else {
      this.write(this.addrAbs, temp & 0x00FF);
    }
    return 0;
  }

  RTI() {
    this.stkp = (this.stkp + 1) & 0xFF;
    this.status = this.read(0x0100 + this.stkp);
    this.status &= ~FLAGS6502.B;
    this.status |= FLAGS6502.U;

    this.stkp = (this.stkp + 1) & 0xFF;
    const lo = this.read(0x0100 + this.stkp);
    this.stkp = (this.stkp + 1) & 0xFF;
    const hi = this.read(0x0100 + this.stkp);
    this.pc = (hi << 8) | lo;
    return 0;
  }

  RTS() {
    this.stkp = (this.stkp + 1) & 0xFF;
    const lo = this.read(0x0100 + this.stkp);
    this.stkp = (this.stkp + 1) & 0xFF;
    const hi = this.read(0x0100 + this.stkp);
    this.pc = ((hi << 8) | lo) + 1;
    return 0;
  }

  STA() { this.write(this.addrAbs, this.a); return 0; }
  STX() { this.write(this.addrAbs, this.x); return 0; }
  STY() { this.write(this.addrAbs, this.y); return 0; }

  TAX() {
    this.x = this.a;
    this.setFlag(FLAGS6502.Z, this.x === 0);
    this.setFlag(FLAGS6502.N, (this.x & 0x0080) !== 0);
    return 0;
  }

  TAY() {
    this.y = this.a;
    this.setFlag(FLAGS6502.Z, this.y === 0);
    this.setFlag(FLAGS6502.N, (this.y & 0x0080) !== 0);
    return 0;
  }

  TSX() {
    this.x = this.stkp;
    this.setFlag(FLAGS6502.Z, this.x === 0);
    this.setFlag(FLAGS6502.N, (this.x & 0x0080) !== 0);
    return 0;
  }

  TXA() {
    this.a = this.x;
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x0080) !== 0);
    return 0;
  }

  TXS() {
    this.stkp = this.x;
    return 0;
  }

  TYA() {
    this.a = this.y;
    this.setFlag(FLAGS6502.Z, this.a === 0);
    this.setFlag(FLAGS6502.N, (this.a & 0x0080) !== 0);
    return 0;
  }

  XXX() {
    // Unofficial or illegal opcode fallback
    return 0;
  }

  // --- Complete 256-Opcode Matrix Definition ---
  createOpcodeTable() {
    const table = new Array(256);
    // Initialize defaults with NOP
    for (let i = 0; i < 256; i++) {
      table[i] = { name: "NOP", operate: this.NOP, addrmode: this.IMP, cycles: 2 };
    }

    const set = (op, name, fn, mode, cycles) => {
      table[op] = { name, operate: fn, addrmode: mode, cycles };
    };

    // Row 0
    set(0x00, "BRK", this.BRK, this.IMM, 7);
    set(0x01, "ORA", this.ORA, this.IZX, 6);
    set(0x05, "ORA", this.ORA, this.ZP0, 3);
    set(0x06, "ASL", this.ASL, this.ZP0, 5);
    set(0x08, "PHP", this.PHP, this.IMP, 3);
    set(0x09, "ORA", this.ORA, this.IMM, 2);
    set(0x0A, "ASL", this.ASL, this.IMP, 2);
    set(0x0D, "ORA", this.ORA, this.ABS, 4);
    set(0x0E, "ASL", this.ASL, this.ABS, 6);

    // Row 1
    set(0x10, "BPL", this.BPL, this.REL, 2);
    set(0x11, "ORA", this.ORA, this.IZY, 5);
    set(0x15, "ORA", this.ORA, this.ZPX, 4);
    set(0x16, "ASL", this.ASL, this.ZPX, 6);
    set(0x18, "CLC", this.CLC, this.IMP, 2);
    set(0x19, "ORA", this.ORA, this.ABY, 4);
    set(0x1D, "ORA", this.ORA, this.ABX, 4);
    set(0x1E, "ASL", this.ASL, this.ABX, 7);

    // Row 2
    set(0x20, "JSR", this.JSR, this.ABS, 6);
    set(0x21, "AND", this.AND, this.IZX, 6);
    set(0x24, "BIT", this.BIT, this.ZP0, 3);
    set(0x25, "AND", this.AND, this.ZP0, 3);
    set(0x26, "ROL", this.ROL, this.ZP0, 5);
    set(0x28, "PLP", this.PLP, this.IMP, 4);
    set(0x29, "AND", this.AND, this.IMM, 2);
    set(0x2A, "ROL", this.ROL, this.IMP, 2);
    set(0x2C, "BIT", this.BIT, this.ABS, 4);
    set(0x2D, "AND", this.AND, this.ABS, 4);
    set(0x2E, "ROL", this.ROL, this.ABS, 6);

    // Row 3
    set(0x30, "BMI", this.BMI, this.REL, 2);
    set(0x31, "AND", this.AND, this.IZY, 5);
    set(0x35, "AND", this.AND, this.ZPX, 4);
    set(0x36, "ROL", this.ROL, this.ZPX, 6);
    set(0x38, "SEC", this.SEC, this.IMP, 2);
    set(0x39, "AND", this.AND, this.ABY, 4);
    set(0x3D, "AND", this.AND, this.ABX, 4);
    set(0x3E, "ROL", this.ROL, this.ABX, 7);

    // Row 4
    set(0x40, "RTI", this.RTI, this.IMP, 6);
    set(0x41, "EOR", this.EOR, this.IZX, 6);
    set(0x45, "EOR", this.EOR, this.ZP0, 3);
    set(0x46, "LSR", this.LSR, this.ZP0, 5);
    set(0x48, "PHA", this.PHA, this.IMP, 3);
    set(0x49, "EOR", this.EOR, this.IMM, 2);
    set(0x4A, "LSR", this.LSR, this.IMP, 2);
    set(0x4C, "JMP", this.JMP, this.ABS, 3);
    set(0x4D, "EOR", this.EOR, this.ABS, 4);
    set(0x4E, "LSR", this.LSR, this.ABS, 6);

    // Row 5
    set(0x50, "BVC", this.BVC, this.REL, 2);
    set(0x51, "EOR", this.EOR, this.IZY, 5);
    set(0x55, "EOR", this.EOR, this.ZPX, 4);
    set(0x56, "LSR", this.LSR, this.ZPX, 6);
    set(0x58, "CLI", this.CLI, this.IMP, 2);
    set(0x59, "EOR", this.EOR, this.ABY, 4);
    set(0x5D, "EOR", this.EOR, this.ABX, 4);
    set(0x5E, "LSR", this.LSR, this.ABX, 7);

    // Row 6
    set(0x60, "RTS", this.RTS, this.IMP, 6);
    set(0x61, "ADC", this.ADC, this.IZX, 6);
    set(0x65, "ADC", this.ADC, this.ZP0, 3);
    set(0x66, "ROR", this.ROR, this.ZP0, 5);
    set(0x68, "PLA", this.PLA, this.IMP, 4);
    set(0x69, "ADC", this.ADC, this.IMM, 2);
    set(0x6A, "ROR", this.ROR, this.IMP, 2);
    set(0x6C, "JMP", this.JMP, this.IND, 5);
    set(0x6D, "ADC", this.ADC, this.ABS, 4);
    set(0x6E, "ROR", this.ROR, this.ABS, 6);

    // Row 7
    set(0x70, "BVS", this.BVS, this.REL, 2);
    set(0x71, "ADC", this.ADC, this.IZY, 5);
    set(0x75, "ADC", this.ADC, this.ZPX, 4);
    set(0x76, "ROR", this.ROR, this.ZPX, 6);
    set(0x78, "SEI", this.SEI, this.IMP, 2);
    set(0x79, "ADC", this.ADC, this.ABY, 4);
    set(0x7D, "ADC", this.ADC, this.ABX, 4);
    set(0x7E, "ROR", this.ROR, this.ABX, 7);

    // Row 8
    set(0x81, "STA", this.STA, this.IZX, 6);
    set(0x84, "STY", this.STY, this.ZP0, 3);
    set(0x85, "STA", this.STA, this.ZP0, 3);
    set(0x86, "STX", this.STX, this.ZP0, 3);
    set(0x88, "DEY", this.DEY, this.IMP, 2);
    set(0x8A, "TXA", this.TXA, this.IMP, 2);
    set(0x8C, "STY", this.STY, this.ABS, 4);
    set(0x8D, "STA", this.STA, this.ABS, 4);
    set(0x8E, "STX", this.STX, this.ABS, 4);

    // Row 9
    set(0x90, "BCC", this.BCC, this.REL, 2);
    set(0x91, "STA", this.STA, this.IZY, 6);
    set(0x94, "STY", this.STY, this.ZPX, 4);
    set(0x95, "STA", this.STA, this.ZPX, 4);
    set(0x96, "STX", this.STX, this.ZPY, 4);
    set(0x98, "TYA", this.TYA, this.IMP, 2);
    set(0x99, "STA", this.STA, this.ABY, 5);
    set(0x9A, "TXS", this.TXS, this.IMP, 2);
    set(0x9D, "STA", this.STA, this.ABX, 5);

    // Row A
    set(0xA0, "LDY", this.LDY, this.IMM, 2);
    set(0xA1, "LDA", this.LDA, this.IZX, 6);
    set(0xA2, "LDX", this.LDX, this.IMM, 2);
    set(0xA4, "LDY", this.LDY, this.ZP0, 3);
    set(0xA5, "LDA", this.LDA, this.ZP0, 3);
    set(0xA6, "LDX", this.LDX, this.ZP0, 3);
    set(0xA8, "TAY", this.TAY, this.IMP, 2);
    set(0xA9, "LDA", this.LDA, this.IMM, 2);
    set(0xAA, "TAX", this.TAX, this.IMP, 2);
    set(0xAC, "LDY", this.LDY, this.ABS, 4);
    set(0xAD, "LDA", this.LDA, this.ABS, 4);
    set(0xAE, "LDX", this.LDX, this.ABS, 4);

    // Row B
    set(0xB0, "BCS", this.BCS, this.REL, 2);
    set(0xB1, "LDA", this.LDA, this.IZY, 5);
    set(0xB4, "LDY", this.LDY, this.ZPX, 4);
    set(0xB5, "LDA", this.LDA, this.ZPX, 4);
    set(0xB6, "LDX", this.LDX, this.ZPY, 4);
    set(0xB8, "CLV", this.CLV, this.IMP, 2);
    set(0xB9, "LDA", this.LDA, this.ABY, 4);
    set(0xBA, "TSX", this.TSX, this.IMP, 2);
    set(0xBC, "LDY", this.LDY, this.ABX, 4);
    set(0xBD, "LDA", this.LDA, this.ABX, 4);
    set(0xBE, "LDX", this.LDX, this.ABY, 4);

    // Row C
    set(0xC0, "CPY", this.CPY, this.IMM, 2);
    set(0xC1, "CMP", this.CMP, this.IZX, 6);
    set(0xC4, "CPY", this.CPY, this.ZP0, 3);
    set(0xC5, "CMP", this.CMP, this.ZP0, 3);
    set(0xC6, "DEC", this.DEC, this.ZP0, 5);
    set(0xC8, "INY", this.INY, this.IMP, 2);
    set(0xC9, "CMP", this.CMP, this.IMM, 2);
    set(0xCA, "DEX", this.DEX, this.IMP, 2);
    set(0xCC, "CPY", this.CPY, this.ABS, 4);
    set(0xCD, "CMP", this.CMP, this.ABS, 4);
    set(0xCE, "DEC", this.DEC, this.ABS, 6);

    // Row D
    set(0xD0, "BNE", this.BNE, this.REL, 2);
    set(0xD1, "CMP", this.CMP, this.IZY, 5);
    set(0xD5, "CMP", this.CMP, this.ZPX, 4);
    set(0xD6, "DEC", this.DEC, this.ZPX, 6);
    set(0xD8, "CLD", this.CLD, this.IMP, 2);
    set(0xD9, "CMP", this.CMP, this.ABY, 4);
    set(0xDD, "CMP", this.CMP, this.ABX, 4);
    set(0xDE, "DEC", this.DEC, this.ABX, 7);

    // Row E
    set(0xE0, "CPX", this.CPX, this.IMM, 2);
    set(0xE1, "SBC", this.SBC, this.IZX, 6);
    set(0xE4, "CPX", this.CPX, this.ZP0, 3);
    set(0xE5, "SBC", this.SBC, this.ZP0, 3);
    set(0xE6, "INC", this.INC, this.ZP0, 5);
    set(0xE8, "INX", this.INX, this.IMP, 2);
    set(0xE9, "SBC", this.SBC, this.IMM, 2);
    set(0xEA, "NOP", this.NOP, this.IMP, 2);
    set(0xEC, "CPX", this.CPX, this.ABS, 4);
    set(0xED, "SBC", this.SBC, this.ABS, 4);
    set(0xEE, "INC", this.INC, this.ABS, 6);

    // Row F
    set(0xF0, "BEQ", this.BEQ, this.REL, 2);
    set(0xF1, "SBC", this.SBC, this.IZY, 5);
    set(0xF5, "SBC", this.SBC, this.ZPX, 4);
    set(0xF6, "INC", this.INC, this.ZPX, 6);
    set(0xF8, "SED", this.SED, this.IMP, 2);
    set(0xF9, "SBC", this.SBC, this.ABY, 4);
    set(0xFD, "SBC", this.SBC, this.ABX, 4);
    set(0xFE, "INC", this.INC, this.ABX, 7);

    return table;
  }
}
