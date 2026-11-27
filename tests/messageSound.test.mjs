import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

/**
 * Tests for Hala notification & call sound preferences, Web Audio synthesis,
 * gesture unlock, looping tone lifecycle, and notification filtering with mocked audio.
 */

// Mock localStorage BEFORE importing modules
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
  removeItem: (key) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  get length() {
    return storage.size;
  },
  key: (idx) => Array.from(storage.keys())[idx] ?? null,
};

// Mock navigator.vibrate
const vibrationCalls = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    vibrate: (pattern) => {
      vibrationCalls.push(pattern);
      return true;
    },
  },
});

// Mock Web Audio API with full instrumentation
let createdOscillators = [];
let resumeCalls = 0;
let nextAudioState = 'running';

class MockOscillator {
  constructor() {
    this.type = 'sine';
    this.startedAt = null;
    this.stoppedAt = null;
    this.disconnected = false;
    this.freqValues = [];
    this.frequency = {
      _value: 440,
      get value() {
        return this._value;
      },
      set value(v) {
        this._value = v;
        this.freqValues.push(v);
      },
      setValueAtTime: (v) => {
        this.frequency._value = v;
        this.freqValues.push(v);
      },
    };
    this.frequency.freqValues = this.freqValues;
    createdOscillators.push(this);
  }
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  start(when = 0) {
    this.startedAt = when;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

class MockGain {
  constructor() {
    this.disconnected = false;
    this.gain = {
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {},
    };
  }
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
}

class MockAudioContext {
  constructor() {
    this.state = nextAudioState;
    this.currentTime = 0;
    this.destination = {};
  }
  createOscillator() {
    return new MockOscillator();
  }
  createGain() {
    return new MockGain();
  }
  resume() {
    resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

globalThis.AudioContext = MockAudioContext;

// Import REAL production modules
const sounds = await import('../src/lib/sounds.ts');
const notifications = await import('../src/lib/notifications.ts');
const notifService = await import('../src/services/notifications.ts');

const {
  SOUND_PRESETS,
  DEFAULT_SOUND_PREFERENCES,
  normalizeSoundPreferences,
  readSoundPreferences,
  saveSoundPreferences,
  playTone,
  previewTone,
  startLoopTone,
  stopLoopTone,
  stopPreviewTone,
  installAudioUnlockListeners,
  getAudioContext,
  resetAudioEngineForTests,
} = sounds;

const { triggerFilteredNotification } = notifications;
const { setNotificationAdapter } = notifService;

let mockPermission = 'granted';
let shownNotifications = [];

beforeEach(() => {
  storage.clear();
  vibrationCalls.length = 0;
  createdOscillators = [];
  resumeCalls = 0;
  nextAudioState = 'running';
  mockPermission = 'granted';
  shownNotifications = [];
  resetAudioEngineForTests();

  setNotificationAdapter({
    isSupported: () => true,
    getPermission: () => mockPermission,
    requestPermission: async () => mockPermission,
    showNotification: (title, options) => {
      shownNotifications.push({ title, options });
    },
  });
});

afterEach(() => {
  stopLoopTone();
  stopPreviewTone();
});

test('1. Default sound preferences when localStorage is empty', () => {
  const prefs = readSoundPreferences();
  assert.deepEqual(prefs, DEFAULT_SOUND_PREFERENCES);
  assert.equal(prefs.groupNotifications, 'mentions');
  assert.equal(prefs.vibrationEnabled, true);
  assert.equal(prefs.messageSoundEnabled, true);
});

test('2. Saves, persists, and normalizes preferences in localStorage', () => {
  const custom = {
    messageTone: 'harp',
    groupTone: 'ripple',
    callTone: 'celeste',
    ringbackTone: 'soft_sonar',
    vibrationEnabled: false,
    groupNotifications: 'all',
    messageSoundEnabled: true,
  };
  assert.equal(saveSoundPreferences(custom), true);
  assert.deepEqual(readSoundPreferences(), custom);
  assert.equal(globalThis.localStorage.getItem('hala.messageSoundEnabled'), 'true');

  // Corrupt/unknown preset IDs and invalid group setting fall back safely
  const normalized = normalizeSoundPreferences({
    messageTone: 'nonexistent',
    groupTone: 123,
    callTone: 'unknown_ring',
    ringbackTone: '',
    vibrationEnabled: 'yes',
    groupNotifications: 'invalid',
    messageSoundEnabled: null,
  });
  assert.deepEqual(normalized, DEFAULT_SOUND_PREFERENCES);
});

test('3. Backward compatibility: respects legacy hala.messageSoundEnabled="false"', () => {
  globalThis.localStorage.setItem('hala.messageSoundEnabled', 'false');
  const prefs = readSoundPreferences();
  assert.equal(prefs.messageSoundEnabled, false);
});

test('4. Every sound kind defines Default + 3 additional synthesized presets', () => {
  for (const kind of ['message', 'group', 'call', 'ringback']) {
    assert.equal(SOUND_PRESETS[kind].length, 4, `${kind} should have 4 presets`);
    assert.equal(SOUND_PRESETS[kind][0].id, 'default', `${kind} first preset must be default`);

    for (const preset of SOUND_PRESETS[kind]) {
      createdOscillators = [];
      previewTone(kind, preset.id);
      assert.ok(
        createdOscillators.length > 0,
        `previewTone(${kind}, ${preset.id}) must synthesize at least one oscillator`
      );
    }
  }
});

test('5. Default call melody and outgoing ringback preserve exact original frequencies', () => {
  previewTone('call', 'default');
  assert.deepEqual(
    createdOscillators.map((o) => o.freqValues[0]),
    [523.25, 659.25, 783.99, 1046.5, 783.99, 880.0]
  );

  createdOscillators = [];
  previewTone('ringback', 'default');
  assert.deepEqual(
    createdOscillators.map((o) => o.freqValues[0]),
    [440, 480]
  );
});

test('6. startLoopTone and stopLoopTone stop active oscillators and cancel vibration', () => {
  startLoopTone('call');
  assert.equal(createdOscillators.length, 6);
  assert.ok(vibrationCalls.length > 0);

  const firstBatch = [...createdOscillators];
  stopLoopTone('call');

  assert.ok(firstBatch.every((o) => o.disconnected), 'all active call oscillators must be disconnected on stop');
  assert.equal(vibrationCalls.at(-1), 0, 'stopLoopTone must cancel vibration with vibrate(0)');
});

test('7. playTone respects messageSoundEnabled and vibrationEnabled preferences', () => {
  saveSoundPreferences({ ...DEFAULT_SOUND_PREFERENCES, messageSoundEnabled: false });
  playTone('message');
  playTone('group');
  assert.equal(createdOscillators.length, 0);

  saveSoundPreferences({
    ...DEFAULT_SOUND_PREFERENCES,
    messageSoundEnabled: true,
    vibrationEnabled: false,
  });
  vibrationCalls.length = 0;
  playTone('message');
  assert.equal(createdOscillators.length, 2);
  assert.equal(vibrationCalls.length, 0, 'vibration must not fire when vibrationEnabled is false');
});

test('8. AudioContext unlocks on the first user gesture', async () => {
  nextAudioState = 'suspended';
  const listeners = new Map();
  const fakeTarget = {
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };

  installAudioUnlockListeners(fakeTarget);
  assert.ok(listeners.has('pointerdown'));
  assert.ok(listeners.has('click'));

  // Simulate first user gesture
  listeners.get('pointerdown')();
  await Promise.resolve();

  assert.equal(resumeCalls, 1);
  assert.equal(getAudioContext().state, 'running');
  assert.equal(listeners.size, 0, 'unlock listeners should clean up once running');
});

test('9. triggerFilteredNotification plays message tone for 1-1 and respects groupNotifications filter', () => {
  // 1-1 chat -> plays default message tone (2 oscillators)
  triggerFilteredNotification({
    chatType: '1-1',
    messageContent: 'Salam!',
    senderName: 'Layla',
    currentUserName: 'Sara',
  });
  assert.equal(shownNotifications.length, 1);
  assert.equal(createdOscillators.length, 2);
  assert.deepEqual(
    createdOscillators.map((o) => o.freqValues[0]),
    [659.25, 783.99]
  );

  // Group chat with default "mentions": drops non-mention
  createdOscillators = [];
  shownNotifications = [];
  triggerFilteredNotification({
    chatType: 'group',
    messageContent: 'Hello everyone',
    senderName: 'Omar',
    currentUserName: 'Sara',
  });
  assert.equal(shownNotifications.length, 0);
  assert.equal(createdOscillators.length, 0);

  // Group chat with default "mentions": allows mention and plays group tone (3 oscillators)
  triggerFilteredNotification({
    chatType: 'group',
    messageContent: 'Hey @Sara please check',
    senderName: 'Omar',
    currentUserName: 'Sara',
  });
  assert.equal(shownNotifications.length, 1);
  assert.equal(createdOscillators.length, 3);
  assert.deepEqual(
    createdOscillators.map((o) => o.freqValues[0]),
    [587.33, 783.99, 987.77]
  );

  // Group chat with "all": allows non-mention and plays group tone
  saveSoundPreferences({ ...DEFAULT_SOUND_PREFERENCES, groupNotifications: 'all' });
  createdOscillators = [];
  shownNotifications = [];
  triggerFilteredNotification({
    chatType: 'group',
    messageContent: 'General update',
    senderName: 'Omar',
    currentUserName: 'Sara',
  });
  assert.equal(shownNotifications.length, 1);
  assert.equal(createdOscillators.length, 3);

  // Group chat with "off": drops even direct mentions
  saveSoundPreferences({ ...DEFAULT_SOUND_PREFERENCES, groupNotifications: 'off' });
  createdOscillators = [];
  shownNotifications = [];
  triggerFilteredNotification({
    chatType: 'group',
    messageContent: 'Urgent @Sara',
    senderName: 'Omar',
    currentUserName: 'Sara',
    isReplyToUser: true,
  });
  assert.equal(shownNotifications.length, 0);
  assert.equal(createdOscillators.length, 0);

  // Open chat or disabled message sound suppresses tone playback
  saveSoundPreferences({ ...DEFAULT_SOUND_PREFERENCES, messageSoundEnabled: true });
  createdOscillators = [];
  triggerFilteredNotification({
    chatType: '1-1',
    messageContent: 'While chat is open',
    senderName: 'Layla',
    currentUserName: 'Sara',
    isChatOpen: true,
  });
  assert.equal(createdOscillators.length, 0);

  // Permission not granted drops notification and tone
  mockPermission = 'denied';
  shownNotifications = [];
  triggerFilteredNotification({
    chatType: '1-1',
    messageContent: 'Blocked by permission',
    senderName: 'Layla',
    currentUserName: 'Sara',
  });
  assert.equal(shownNotifications.length, 0);
  assert.equal(createdOscillators.length, 0);
});
