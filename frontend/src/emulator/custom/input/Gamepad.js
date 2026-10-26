/**
 * OmniVault Custom Core - Controller & Input Subsystem
 * 
 * Maps Keyboard & Hardware Gamepad to Standard 8-bit Serial Strobe Register:
 * Bit 0: A
 * Bit 1: B
 * Bit 2: Select
 * Bit 3: Start
 * Bit 4: Up
 * Bit 5: Down
 * Bit 6: Left
 * Bit 7: Right
 */

export class Controller {
  constructor(playerIndex = 0) {
    this.playerIndex = playerIndex;
    this.keyButtons = 0x00;
    this.padButtons = 0x00;
    this.buttons = 0x00;
    this.strobe = 0;
    this.shift = 0;

    this.keyMap = {
      // D-Pad
      ArrowUp: 0x10,
      KeyW: 0x10,
      ArrowDown: 0x20,
      KeyS: 0x20,
      ArrowLeft: 0x40,
      KeyA: 0x40,
      ArrowRight: 0x80,
      KeyD: 0x80,

      // Action Buttons
      KeyZ: 0x01,      // A
      KeyJ: 0x01,      // A
      KeyX: 0x02,      // B
      KeyK: 0x02,      // B
      ShiftRight: 0x04,// Select
      ShiftLeft: 0x04, // Select
      KeyU: 0x04,      // Select
      Enter: 0x08,     // Start
      KeyI: 0x08,      // Start
    };

    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    if (this.playerIndex === 0) {
      this.bindEvents();
    }
  }

  bindEvents() {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
    }
  }

  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("keyup", this.onKeyUp);
    }
  }

  handleKeyDown(e) {
    if (this.keyMap[e.code] !== undefined) {
      this.keyButtons |= this.keyMap[e.code];
      this.buttons = this.keyButtons | this.padButtons;
    }
  }

  handleKeyUp(e) {
    if (this.keyMap[e.code] !== undefined) {
      this.keyButtons &= ~this.keyMap[e.code];
      this.buttons = this.keyButtons | this.padButtons;
    }
  }

  pollGamepad() {
    this.padButtons = 0;
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      const pad = gamepads[this.playerIndex];
      if (pad) {
        let padBits = 0;
        // Standard mapping:
        // 0: A (Cross), 1: B (Circle), 8: Select (Share), 9: Start (Options)
        // 12: Up, 13: Down, 14: Left, 15: Right
        if (pad.buttons[0]?.pressed) padBits |= 0x01; // A
        if (pad.buttons[1]?.pressed) padBits |= 0x02; // B
        if (pad.buttons[8]?.pressed) padBits |= 0x04; // Select
        if (pad.buttons[9]?.pressed) padBits |= 0x08; // Start
        if (pad.buttons[12]?.pressed || pad.axes[1] < -0.4) padBits |= 0x10; // Up
        if (pad.buttons[13]?.pressed || pad.axes[1] > 0.4) padBits |= 0x20;  // Down
        if (pad.buttons[14]?.pressed || pad.axes[0] < -0.4) padBits |= 0x40;  // Left
        if (pad.buttons[15]?.pressed || pad.axes[0] > 0.4) padBits |= 0x80;  // Right

        this.padButtons = padBits;
      }
    }
    this.buttons = this.keyButtons | this.padButtons;
  }

  write(data) {
    this.strobe = data & 0x01;
    if (this.strobe === 1) {
      this.pollGamepad();
      this.shift = this.buttons;
    }
  }

  read() {
    let value = 0;
    if (this.strobe === 1) {
      this.pollGamepad();
      value = this.buttons & 0x01;
    } else {
      value = this.shift & 0x01;
      this.shift = (this.shift >> 1) | 0x80;
    }
    return value;
  }
}
