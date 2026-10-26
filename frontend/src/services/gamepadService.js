/**
 * Universal OmniVault Gamepad & Controller Engine
 * 
 * Provides:
 * - Auto-detection of PlayStation DualSense, Xbox, Switch Pro, 8BitDo & generic gamepads
 * - Full 10-foot living-room spatial navigation & action dispatching
 * - Dedicated PS Home, Xbox Guide & Switch Home (Button 16) / Select+Start quick-menu triggers
 * - Configurable custom button remapping with local storage persistence
 */

export const DEFAULT_MAPPING = {
  confirm: 0,      // A / Cross
  cancel: 1,       // B / Circle
  favorite: 2,     // X / Square
  details: 3,      // Y / Triangle
  prevTab: 4,      // L1 / LB
  nextTab: 5,      // R1 / RB
  triggerLeft: 6,  // L2 / LT
  triggerRight: 7, // R2 / RT
  toggleMode: 8,   // Select / View / Share
  start: 9,        // Start / Menu
  thumbLeft: 10,   // L3
  thumbRight: 11,  // R3
  dpadUp: 12,      // D-Pad Up
  dpadDown: 13,    // D-Pad Down
  dpadLeft: 14,    // D-Pad Left
  dpadRight: 15,   // D-Pad Right
  guideHome: 16,   // PS Home / Xbox Guide / Switch Home
};

export const DEFAULT_TURBO_CONFIG = {
  enabled: true,
  rateHz: 20, // 10, 15, 20, 30 Hz
  buttons: {
    confirm: true,      // A / Cross
    cancel: false,     // B / Circle
    favorite: false,   // X / Square
    details: false,    // Y / Triangle
    triggerLeft: false,// L2 / LT
    triggerRight: true // R2 / RT
  }
};

export const DEFAULT_MACROS = [
  {
    id: 'macro_rapid_fire',
    name: 'Rapid Fire Burst (A)',
    triggerBtn: 10, // L3
    triggerLabel: 'L3 / Left Stick Click',
    type: 'burst',
    targetAction: 'CONFIRM',
    pulses: 6,
    delayMs: 35,
    description: 'Rapid 6-tap burst of primary action button'
  },
  {
    id: 'macro_hadouken',
    name: 'Quarter-Circle Combo (Hadouken)',
    triggerBtn: 11, // R3
    triggerLabel: 'R3 / Right Stick Click',
    type: 'sequence',
    steps: ['NAV_DOWN', 'NAV_RIGHT', 'CONFIRM'],
    stepDelayMs: 65,
    description: 'Executes Down -> Right -> Confirm via R3 click'
  }
];

class GamepadService {
  constructor() {
    this.activeGamepad = null;
    this.gamepadName = 'No Controller';
    this.gamepadType = 'generic'; // 'playstation' | 'xbox' | 'nintendo' | 'generic'
    this.listeners = new Set();
    this.actionListeners = new Set();
    this.customMapping = this.loadMapping();
    this.turboConfig = this.loadTurboConfig();
    this.macros = this.loadMacros();
    this.pollInterval = null;
    this.lastButtonStates = {};
    this.repeatTimers = {};
    this.deadzone = 0.35;
    this.isListeningForRemap = false;
    this.remapCallback = null;
    this.activeMacroRunning = false;

    this.init();
  }

  loadMapping() {
    try {
      const saved = localStorage.getItem('omnivault_gamepad_mapping');
      return saved ? { ...DEFAULT_MAPPING, ...JSON.parse(saved) } : { ...DEFAULT_MAPPING };
    } catch {
      return { ...DEFAULT_MAPPING };
    }
  }

  loadTurboConfig() {
    try {
      const saved = localStorage.getItem('omnivault_turbo_config');
      return saved ? { ...DEFAULT_TURBO_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_TURBO_CONFIG };
    } catch {
      return { ...DEFAULT_TURBO_CONFIG };
    }
  }

  saveTurboConfig(newCfg) {
    this.turboConfig = { ...newCfg };
    try {
      localStorage.setItem('omnivault_turbo_config', JSON.stringify(this.turboConfig));
    } catch {}
    this.notifyState();
  }

  loadMacros() {
    try {
      const saved = localStorage.getItem('omnivault_macros');
      return saved ? JSON.parse(saved) : [...DEFAULT_MACROS];
    } catch {
      return [...DEFAULT_MACROS];
    }
  }

  saveMacros(newMacros) {
    this.macros = [...newMacros];
    try {
      localStorage.setItem('omnivault_macros', JSON.stringify(this.macros));
    } catch {}
    this.notifyState();
  }

  saveMapping(newMap) {
    this.customMapping = { ...newMap };
    try {
      localStorage.setItem('omnivault_gamepad_mapping', JSON.stringify(this.customMapping));
    } catch {}
    this.notifyState();
  }

  resetMapping() {
    this.customMapping = { ...DEFAULT_MAPPING };
    try {
      localStorage.removeItem('omnivault_gamepad_mapping');
    } catch {}
    this.notifyState();
  }

  init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('gamepadconnected', (e) => {
      this.handleConnected(e.gamepad);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      this.handleDisconnected(e.gamepad);
    });

    // Start polling loop
    this.startPolling();
  }

  detectGamepadType(id = '') {
    const s = id.toLowerCase();
    if (s.includes('dualsense') || s.includes('dualshock') || s.includes('sony') || s.includes('054c')) {
      return { type: 'playstation', name: 'PlayStation DualSense / DualShock' };
    }
    if (s.includes('xbox') || s.includes('microsoft') || s.includes('xinput') || s.includes('045e')) {
      return { type: 'xbox', name: 'Xbox Wireless Controller' };
    }
    if (s.includes('nintendo') || s.includes('switch') || s.includes('pro controller') || s.includes('joy-con')) {
      return { type: 'nintendo', name: 'Nintendo Switch Controller' };
    }
    if (s.includes('8bitdo')) {
      return { type: '8bitdo', name: '8BitDo Bluetooth Controller' };
    }
    return { type: 'generic', name: id || 'Standard USB/Bluetooth Gamepad' };
  }

  handleConnected(gp) {
    const meta = this.detectGamepadType(gp.id);
    this.activeGamepad = gp;
    this.gamepadType = meta.type;
    this.gamepadName = meta.name;
    this.notifyState(true, `🎮 ${meta.name} Connected`);
  }

  handleDisconnected(gp) {
    if (this.activeGamepad && this.activeGamepad.index === gp.index) {
      this.activeGamepad = null;
      this.gamepadName = 'No Controller';
      this.gamepadType = 'generic';
      this.notifyState(false, 'Gamepad Disconnected');
    }
  }

  startPolling() {
    if (this.pollInterval) return;

    const poll = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let found = null;
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) {
          found = gamepads[i];
          break;
        }
      }

      if (found) {
        if (!this.activeGamepad) {
          this.handleConnected(found);
        } else {
          this.activeGamepad = found;
        }
        this.processGamepadInputs(found);
      } else if (this.activeGamepad) {
        this.activeGamepad = null;
        this.notifyState(false);
      }

      requestAnimationFrame(poll);
    };

    requestAnimationFrame(poll);
  }

  processGamepadInputs(gp) {
    const buttons = gp.buttons;
    const axes = gp.axes;
    const now = Date.now();

    // Remap capture mode
    if (this.isListeningForRemap && this.remapCallback) {
      for (let i = 0; i < buttons.length; i++) {
        if (buttons[i].pressed) {
          this.remapCallback(i);
          this.isListeningForRemap = false;
          this.remapCallback = null;
          return;
        }
      }
    }

    const map = this.customMapping;

    // 1. Direct Guide / Home button detection (Button 16), Select+Start combo, or L3+R3 thumbstick combo
    const isGuidePressed = (buttons[map.guideHome] && buttons[map.guideHome].pressed) ||
                           (buttons[16] && buttons[16].pressed) ||
                           (buttons[map.toggleMode] && buttons[map.toggleMode].pressed && buttons[map.start] && buttons[map.start].pressed) ||
                           (buttons[map.thumbLeft] && buttons[map.thumbLeft].pressed && buttons[map.thumbRight] && buttons[map.thumbRight].pressed) ||
                           (buttons[10] && buttons[10].pressed && buttons[11] && buttons[11].pressed);

    if (isGuidePressed && !this.lastButtonStates['guideHome']) {
      this.dispatchAction('TOGGLE_QUICK_MENU');
      this.lastButtonStates['guideHome'] = true;
    } else if (!isGuidePressed) {
      this.lastButtonStates['guideHome'] = false;
    }

    // 2. Macro Triggers Check (L3 / R3 or custom trigger button)
    if (!this.activeMacroRunning && this.macros && this.macros.length > 0) {
      for (const macro of this.macros) {
        const triggerIdx = macro.triggerBtn;
        const isTriggerPressed = buttons[triggerIdx] && buttons[triggerIdx].pressed;
        if (isTriggerPressed && !this.lastButtonStates['macro_' + macro.id]) {
          this.lastButtonStates['macro_' + macro.id] = true;
          this.executeMacro(macro);
        } else if (!isTriggerPressed) {
          this.lastButtonStates['macro_' + macro.id] = false;
        }
      }
    }

    // 3. Action Buttons & Turbo Auto-Fire Check
    const checkButton = (key, btnIndex, actionName) => {
      const isPressed = buttons[btnIndex] && buttons[btnIndex].pressed;
      const isTurboActive = this.turboConfig?.enabled && this.turboConfig?.buttons?.[key];

      if (isPressed) {
        if (isTurboActive) {
          // Calculate high-frequency pulse (e.g. 20Hz = 50ms period, 25ms on, 25ms off)
          const rate = Math.max(5, Math.min(60, this.turboConfig.rateHz || 20));
          const periodMs = 1000 / rate;
          const isHigh = Math.floor(now / (periodMs / 2)) % 2 === 0;

          if (isHigh && !this.lastButtonStates[key + '_pulse']) {
            this.dispatchAction(actionName);
            this.lastButtonStates[key + '_pulse'] = true;
          } else if (!isHigh) {
            this.lastButtonStates[key + '_pulse'] = false;
          }
        } else {
          if (!this.lastButtonStates[key]) {
            this.dispatchAction(actionName);
            this.lastButtonStates[key] = true;
          }
        }
      } else {
        this.lastButtonStates[key] = false;
        this.lastButtonStates[key + '_pulse'] = false;
      }
    };

    checkButton('confirm', map.confirm, 'CONFIRM');
    checkButton('cancel', map.cancel, 'CANCEL');
    checkButton('favorite', map.favorite, 'FAVORITE');
    checkButton('details', map.details, 'DETAILS');
    checkButton('prevTab', map.prevTab, 'PREV_TAB');
    checkButton('nextTab', map.nextTab, 'NEXT_TAB');
    checkButton('toggleMode', map.toggleMode, 'TOGGLE_MODE');
    checkButton('start', map.start, 'START');

    // 3. Directional Navigation with Left Stick & D-Pad (Debounced Repeat)
    const dpadUp = buttons[map.dpadUp]?.pressed || (axes[1] && axes[1] < -this.deadzone);
    const dpadDown = buttons[map.dpadDown]?.pressed || (axes[1] && axes[1] > this.deadzone);
    const dpadLeft = buttons[map.dpadLeft]?.pressed || (axes[0] && axes[0] < -this.deadzone);
    const dpadRight = buttons[map.dpadRight]?.pressed || (axes[0] && axes[0] > this.deadzone);

    const handleDir = (dirKey, isPressed, actionName) => {
      if (isPressed) {
        if (!this.repeatTimers[dirKey]) {
          this.dispatchAction(actionName);
          this.repeatTimers[dirKey] = { startTime: now, nextTime: now + 240 };
        } else if (now >= this.repeatTimers[dirKey].nextTime) {
          this.dispatchAction(actionName);
          this.repeatTimers[dirKey].nextTime = now + 120; // Fast repeat
        }
      } else {
        delete this.repeatTimers[dirKey];
      }
    };

    handleDir('up', dpadUp, 'NAV_UP');
    handleDir('down', dpadDown, 'NAV_DOWN');
    handleDir('left', dpadLeft, 'NAV_LEFT');
    handleDir('right', dpadRight, 'NAV_RIGHT');
  }

  dispatchAction(action, payload = null) {
    for (const cb of this.actionListeners) {
      try {
        cb(action, payload);
      } catch (e) {
        console.error('[Gamepad Action Error]:', e);
      }
    }
  }

  executeMacro(macro) {
    if (this.activeMacroRunning) return;
    this.activeMacroRunning = true;
    this.dispatchAction('MACRO_START', { macroId: macro.id, name: macro.name });

    if (macro.type === 'burst') {
      const pulses = macro.pulses || 6;
      const delay = macro.delayMs || 35;
      let count = 0;
      const timer = setInterval(() => {
        this.dispatchAction(macro.targetAction || 'CONFIRM');
        count++;
        if (count >= pulses) {
          clearInterval(timer);
          this.activeMacroRunning = false;
          this.dispatchAction('MACRO_COMPLETE', { macroId: macro.id });
        }
      }, delay);
    } else if (macro.type === 'sequence') {
      const steps = macro.steps || [];
      const delay = macro.stepDelayMs || 65;
      let idx = 0;
      const stepTimer = setInterval(() => {
        if (idx < steps.length) {
          this.dispatchAction(steps[idx]);
          idx++;
        } else {
          clearInterval(stepTimer);
          this.activeMacroRunning = false;
          this.dispatchAction('MACRO_COMPLETE', { macroId: macro.id });
        }
      }, delay);
    } else {
      this.activeMacroRunning = false;
    }
  }

  notifyState(connected = Boolean(this.activeGamepad), message = null) {
    const info = {
      connected: Boolean(this.activeGamepad),
      name: this.gamepadName,
      type: this.gamepadType,
      mapping: this.customMapping,
      turbo: this.turboConfig,
      macros: this.macros,
      activeMacroRunning: this.activeMacroRunning,
      message,
    };
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch (e) {
        console.error(e);
      }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({
      connected: Boolean(this.activeGamepad),
      name: this.gamepadName,
      type: this.gamepadType,
      mapping: this.customMapping,
    });
    return () => this.listeners.delete(listener);
  }

  subscribeActions(callback) {
    this.actionListeners.add(callback);
    return () => this.actionListeners.delete(callback);
  }

  startListeningForRemap(actionKey, callback) {
    this.isListeningForRemap = true;
    this.remapCallback = (buttonIndex) => {
      const updated = { ...this.customMapping, [actionKey]: buttonIndex };
      this.saveMapping(updated);
      callback(buttonIndex);
    };
  }

  cancelListeningForRemap() {
    this.isListeningForRemap = false;
    this.remapCallback = null;
  }
}

export const gamepadService = new GamepadService();
