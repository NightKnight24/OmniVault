/**
 * OmniVault Custom Core - 2A03 Audio Processing Unit (APU)
 * 
 * Features:
 * - Real-time Web Audio API streaming at 44.1 kHz
 * - Dual Pulse Wave Generators with 4 duty cycles (12.5%, 25%, 50%, 75%)
 * - 32-step Triangle Wave Generator with Linear and Length Counters
 * - 15-bit LFSR Pseudo-Random White Noise Generator (Metallic & Smooth modes)
 * - 4-step & 5-step APU Frame Counter sequencers for envelope decay & volume modulation
 */

const LENGTH_TABLE = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
  12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
];

const DUTY_SEQUENCES = [
  [0, 1, 0, 0, 0, 0, 0, 0], // 12.5%
  [0, 1, 1, 0, 0, 0, 0, 0], // 25.0%
  [0, 1, 1, 1, 1, 0, 0, 0], // 50.0%
  [1, 0, 0, 1, 1, 1, 1, 1], // 75.0% (inverted 25%)
];

const TRIANGLE_SEQUENCE = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

export class APU2A03 {
  constructor() {
    this.bus = null;
    this.audioCtx = null;
    this.gainNode = null;
    this.scriptNode = null;

    // Output sample buffer
    this.sampleBuffer = new Float32Array(4096);
    this.sampleWritePtr = 0;
    this.sampleReadPtr = 0;

    // Pulse 1
    this.pulse1 = {
      enabled: false,
      duty: 0,
      dutyIndex: 0,
      lengthHalt: false,
      constantVolume: false,
      volume: 0,
      timerPeriod: 0,
      timerValue: 0,
      lengthCounter: 0,
      output: 0,
    };

    // Pulse 2
    this.pulse2 = {
      enabled: false,
      duty: 0,
      dutyIndex: 0,
      lengthHalt: false,
      constantVolume: false,
      volume: 0,
      timerPeriod: 0,
      timerValue: 0,
      lengthCounter: 0,
      output: 0,
    };

    // Triangle
    this.triangle = {
      enabled: false,
      controlFlag: false,
      linearCounterPeriod: 0,
      linearCounter: 0,
      linearCounterReload: false,
      timerPeriod: 0,
      timerValue: 0,
      lengthCounter: 0,
      stepIndex: 0,
      output: 0,
    };

    // Noise
    this.noise = {
      enabled: false,
      lengthHalt: false,
      constantVolume: false,
      volume: 0,
      loopNoise: false,
      timerPeriod: 0,
      timerValue: 0,
      lengthCounter: 0,
      shiftRegister: 1,
      output: 0,
    };

    // Master Frame Counter (240Hz sequencer: ~7457 CPU cycles per step)
    this.frameCounter = 0;
    this.frameStep = 0;
    this.frameMode = 0; // 0 = 4-step, 1 = 5-step

    this.sampleRate = 44100;
    this.clockRate = 1789773; // NTSC Master CPU Clock (~1.79 MHz)
    this.clocksPerSample = this.clockRate / this.sampleRate;
    this.sampleClockCounter = 0;
  }

  connectBus(bus) {
    this.bus = bus;
  }

  initAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass({ sampleRate: 44100 });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);

      this.scriptNode = this.audioCtx.createScriptProcessor(2048, 0, 1);
      this.scriptNode.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < out.length; i++) {
          if (this.sampleReadPtr !== this.sampleWritePtr) {
            out[i] = this.sampleBuffer[this.sampleReadPtr];
            this.sampleReadPtr = (this.sampleReadPtr + 1) % this.sampleBuffer.length;
          } else {
            out[i] = 0;
          }
        }
      };

      this.gainNode.connect(this.audioCtx.destination);
      this.scriptNode.connect(this.gainNode);
    } catch (err) {
      console.warn("[OmniVault APU] AudioContext initialization deferred:", err);
    }
  }

  setVolume(vol) {
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), this.audioCtx.currentTime);
    }
  }

  cpuRead(addr) {
    if (addr === 0x4015) {
      let data = 0;
      if (this.pulse1.lengthCounter > 0) data |= 0x01;
      if (this.pulse2.lengthCounter > 0) data |= 0x02;
      if (this.triangle.lengthCounter > 0) data |= 0x04;
      if (this.noise.lengthCounter > 0) data |= 0x08;
      return data;
    }
    return 0;
  }

  cpuWrite(addr, data) {
    switch (addr) {
      // Pulse 1
      case 0x4000:
        this.pulse1.duty = (data >> 6) & 0x03;
        this.pulse1.lengthHalt = (data & 0x20) !== 0;
        this.pulse1.constantVolume = (data & 0x10) !== 0;
        this.pulse1.volume = data & 0x0F;
        break;
      case 0x4002:
        this.pulse1.timerPeriod = (this.pulse1.timerPeriod & 0xFF00) | data;
        break;
      case 0x4003:
        this.pulse1.timerPeriod = (this.pulse1.timerPeriod & 0x00FF) | ((data & 0x07) << 8);
        if (this.pulse1.enabled) {
          this.pulse1.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
        }
        this.pulse1.dutyIndex = 0;
        break;

      // Pulse 2
      case 0x4004:
        this.pulse2.duty = (data >> 6) & 0x03;
        this.pulse2.lengthHalt = (data & 0x20) !== 0;
        this.pulse2.constantVolume = (data & 0x10) !== 0;
        this.pulse2.volume = data & 0x0F;
        break;
      case 0x4006:
        this.pulse2.timerPeriod = (this.pulse2.timerPeriod & 0xFF00) | data;
        break;
      case 0x4007:
        this.pulse2.timerPeriod = (this.pulse2.timerPeriod & 0x00FF) | ((data & 0x07) << 8);
        if (this.pulse2.enabled) {
          this.pulse2.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
        }
        this.pulse2.dutyIndex = 0;
        break;

      // Triangle
      case 0x4008:
        this.triangle.controlFlag = (data & 0x80) !== 0;
        this.triangle.linearCounterPeriod = data & 0x7F;
        break;
      case 0x400A:
        this.triangle.timerPeriod = (this.triangle.timerPeriod & 0xFF00) | data;
        break;
      case 0x400B:
        this.triangle.timerPeriod = (this.triangle.timerPeriod & 0x00FF) | ((data & 0x07) << 8);
        if (this.triangle.enabled) {
          this.triangle.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
        }
        this.triangle.linearCounterReload = true;
        break;

      // Noise
      case 0x400C:
        this.noise.lengthHalt = (data & 0x20) !== 0;
        this.noise.constantVolume = (data & 0x10) !== 0;
        this.noise.volume = data & 0x0F;
        break;
      case 0x400E:
        this.noise.loopNoise = (data & 0x80) !== 0;
        this.noise.timerPeriod = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068][data & 0x0F];
        break;
      case 0x400F:
        if (this.noise.enabled) {
          this.noise.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
        }
        break;

      // Control / Channel Enable ($4015)
      case 0x4015:
        this.pulse1.enabled = (data & 0x01) !== 0;
        if (!this.pulse1.enabled) this.pulse1.lengthCounter = 0;

        this.pulse2.enabled = (data & 0x02) !== 0;
        if (!this.pulse2.enabled) this.pulse2.lengthCounter = 0;

        this.triangle.enabled = (data & 0x04) !== 0;
        if (!this.triangle.enabled) this.triangle.lengthCounter = 0;

        this.noise.enabled = (data & 0x08) !== 0;
        if (!this.noise.enabled) this.noise.lengthCounter = 0;
        break;

      // Frame Counter ($4017)
      case 0x4017:
        this.frameMode = (data & 0x80) !== 0 ? 1 : 0;
        this.frameCounter = 0;
        this.frameStep = 0;
        if (this.frameMode === 1) {
          this.clockQuarterFrame();
          this.clockHalfFrame();
        }
        break;
    }
  }

  clockQuarterFrame() {
    // Clock Triangle Linear Counter
    if (this.triangle.linearCounterReload) {
      this.triangle.linearCounter = this.triangle.linearCounterPeriod;
    } else if (this.triangle.linearCounter > 0) {
      this.triangle.linearCounter--;
    }
    if (!this.triangle.controlFlag) {
      this.triangle.linearCounterReload = false;
    }
  }

  clockHalfFrame() {
    // Clock Length Counters for all 4 channels
    if (!this.pulse1.lengthHalt && this.pulse1.lengthCounter > 0) {
      this.pulse1.lengthCounter--;
    }
    if (!this.pulse2.lengthHalt && this.pulse2.lengthCounter > 0) {
      this.pulse2.lengthCounter--;
    }
    if (!this.triangle.controlFlag && this.triangle.lengthCounter > 0) {
      this.triangle.lengthCounter--;
    }
    if (!this.noise.lengthHalt && this.noise.lengthCounter > 0) {
      this.noise.lengthCounter--;
    }
  }

  clock() {
    // 0. Clock 240Hz APU Frame Sequencer (~7457 CPU cycles per step)
    this.frameCounter++;
    if (this.frameCounter >= 7457) {
      this.frameCounter = 0;
      const maxSteps = this.frameMode === 1 ? 5 : 4;
      this.frameStep = (this.frameStep + 1) % maxSteps;
      if (this.frameMode === 0) {
        this.clockQuarterFrame();
        if (this.frameStep === 1 || this.frameStep === 3) {
          this.clockHalfFrame();
        }
      } else {
        if (this.frameStep !== 3) {
          this.clockQuarterFrame();
        }
        if (this.frameStep === 1 || this.frameStep === 4) {
          this.clockHalfFrame();
        }
      }
    }
    // 1. Clock Pulse 1
    if (this.pulse1.timerValue === 0) {
      this.pulse1.timerValue = this.pulse1.timerPeriod;
      this.pulse1.dutyIndex = (this.pulse1.dutyIndex + 1) % 8;
    } else {
      this.pulse1.timerValue--;
    }

    if (this.pulse1.enabled && this.pulse1.lengthCounter > 0 && this.pulse1.timerPeriod >= 8) {
      const bit = DUTY_SEQUENCES[this.pulse1.duty][this.pulse1.dutyIndex];
      this.pulse1.output = bit ? this.pulse1.volume : 0;
    } else {
      this.pulse1.output = 0;
    }

    // 2. Clock Pulse 2
    if (this.pulse2.timerValue === 0) {
      this.pulse2.timerValue = this.pulse2.timerPeriod;
      this.pulse2.dutyIndex = (this.pulse2.dutyIndex + 1) % 8;
    } else {
      this.pulse2.timerValue--;
    }

    if (this.pulse2.enabled && this.pulse2.lengthCounter > 0 && this.pulse2.timerPeriod >= 8) {
      const bit = DUTY_SEQUENCES[this.pulse2.duty][this.pulse2.dutyIndex];
      this.pulse2.output = bit ? this.pulse2.volume : 0;
    } else {
      this.pulse2.output = 0;
    }

    // 3. Clock Triangle
    if (this.triangle.timerValue === 0) {
      this.triangle.timerValue = this.triangle.timerPeriod;
      if (this.triangle.lengthCounter > 0 && this.triangle.linearCounter > 0) {
        this.triangle.stepIndex = (this.triangle.stepIndex + 1) % 32;
        this.triangle.output = TRIANGLE_SEQUENCE[this.triangle.stepIndex];
      }
    } else {
      this.triangle.timerValue--;
    }

    // 4. Clock Noise
    if (this.noise.timerValue === 0) {
      this.noise.timerValue = this.noise.timerPeriod;
      const b1 = this.noise.shiftRegister & 1;
      const b2 = this.noise.loopNoise ? ((this.noise.shiftRegister >> 6) & 1) : ((this.noise.shiftRegister >> 1) & 1);
      this.noise.shiftRegister = (this.noise.shiftRegister >> 1) | ((b1 ^ b2) << 14);
    } else {
      this.noise.timerValue--;
    }

    if (this.noise.enabled && this.noise.lengthCounter > 0 && (this.noise.shiftRegister & 1) === 0) {
      this.noise.output = this.noise.volume;
    } else {
      this.noise.output = 0;
    }

    // Mix channels to Audio Sample Buffer
    this.sampleClockCounter++;
    if (this.sampleClockCounter >= this.clocksPerSample) {
      this.sampleClockCounter -= this.clocksPerSample;

      // Nonlinear audio mixing formula approximation
      const pulseOut = (this.pulse1.output + this.pulse2.output) > 0 ?
        95.88 / ((8128 / (this.pulse1.output + this.pulse2.output)) + 100) : 0;

      const tndSum = (this.triangle.output / 8227) + (this.noise.output / 12241);
      const tndOut = tndSum > 0 ? 159.79 / ((1 / tndSum) + 100) : 0;

      const mixedSample = (pulseOut + tndOut) * 2.0 - 0.5;

      // Push to cyclic audio buffer
      const nextPtr = (this.sampleWritePtr + 1) % this.sampleBuffer.length;
      if (nextPtr !== this.sampleReadPtr) {
        this.sampleBuffer[this.sampleWritePtr] = mixedSample;
        this.sampleWritePtr = nextPtr;
      }
    }
  }

  reset() {
    this.pulse1.enabled = false;
    this.pulse2.enabled = false;
    this.triangle.enabled = false;
    this.noise.enabled = false;
    this.sampleWritePtr = 0;
    this.sampleReadPtr = 0;
  }
}
