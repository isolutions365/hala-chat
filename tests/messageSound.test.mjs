import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

/**
 * Message and Call Sound preferences and notification gating tests.
 */

// Mock localStorage
const storage = new Map();
global.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  clear: () => storage.clear(),
};

// Mock AudioContext and related classes
class MockAudioNode {
  connect() {}
}
class MockOscillator extends MockAudioNode {
  start() {}
  stop() {}
  frequency = {
    value: 440,
    setValueAtTime: () => {},
  };
}
class MockGain extends MockAudioNode {
  gain = {
    setValueAtTime: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  };
}
global.AudioContext = class {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
  }
  createOscillator() {
    return new MockOscillator();
  }
  createGain() {
    return new MockGain();
  }
  destination = {};
  resume() {
    return Promise.resolve();
  }
};

const SOUND_PREFS_KEY = 'hala.soundPreferences.v1';
const DEFAULT_SOUND_PREFERENCES = {
  messageTone: 'default',
  groupTone: 'default',
  callTone: 'default',
  ringbackTone: 'default',
  vibrationEnabled: true,
  groupNotifications: 'mentions',
  messageSoundEnabled: true,
};

function readSoundPreferences() {
  try {
    const raw = global.localStorage.getItem(SOUND_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const legacySoundEnabled = global.localStorage.getItem('hala.messageSoundEnabled');
    const messageSoundEnabled =
      legacySoundEnabled !== null
        ? legacySoundEnabled !== 'false'
        : (parsed.messageSoundEnabled ?? true);

    return {
      messageTone: parsed.messageTone || DEFAULT_SOUND_PREFERENCES.messageTone,
      groupTone: parsed.groupTone || DEFAULT_SOUND_PREFERENCES.groupTone,
      callTone: parsed.callTone || DEFAULT_SOUND_PREFERENCES.callTone,
      ringbackTone: parsed.ringbackTone || DEFAULT_SOUND_PREFERENCES.ringbackTone,
      vibrationEnabled: parsed.vibrationEnabled ?? DEFAULT_SOUND_PREFERENCES.vibrationEnabled,
      groupNotifications: ['all', 'mentions', 'off'].includes(parsed.groupNotifications)
        ? parsed.groupNotifications
        : DEFAULT_SOUND_PREFERENCES.groupNotifications,
      messageSoundEnabled,
    };
  } catch {
    return { ...DEFAULT_SOUND_PREFERENCES };
  }
}

function saveSoundPreferences(prefs) {
  try {
    global.localStorage.setItem('hala.messageSoundEnabled', String(prefs.messageSoundEnabled));
    global.localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

function filterNotification(params, prefs) {
  const { chatType, messageContent, currentUserName, currentUserPhone, isReplyToUser } = params;
  const groupSetting = prefs.groupNotifications || 'mentions';

  const isDirectMessage = chatType === '1-1';
  const cleanName = currentUserName.replace(/\s+/g, '');
  const mentionsUser =
    messageContent.includes(`@${currentUserName}`) ||
    messageContent.includes(`@${cleanName}`) ||
    (currentUserPhone && messageContent.includes(`@${currentUserPhone}`));
  const isReply = Boolean(isReplyToUser);

  if (chatType === 'group') {
    if (groupSetting === 'off') {
      return false;
    }
    if (groupSetting === 'mentions' && !mentionsUser && !isReply) {
      return false;
    }
    return true;
  }

  if (!isDirectMessage && !mentionsUser && !isReply) {
    return false;
  }

  return true;
}

function determineToneKind(chatType) {
  return chatType === 'group' ? 'group' : 'message';
}

beforeEach(() => {
  storage.clear();
});

test('1. Default sound preferences when localStorage is empty', () => {
  const prefs = readSoundPreferences();
  assert.equal(prefs.messageTone, 'default');
  assert.equal(prefs.groupTone, 'default');
  assert.equal(prefs.callTone, 'default');
  assert.equal(prefs.ringbackTone, 'default');
  assert.equal(prefs.vibrationEnabled, true);
  assert.equal(prefs.groupNotifications, 'mentions');
  assert.equal(prefs.messageSoundEnabled, true);
});

test('2. Saves and persists custom preferences in localStorage', () => {
  const custom = {
    messageTone: 'harp',
    groupTone: 'ripple',
    callTone: 'celeste',
    ringbackTone: 'soft_sonar',
    vibrationEnabled: false,
    groupNotifications: 'all',
    messageSoundEnabled: true,
  };
  const ok = saveSoundPreferences(custom);
  assert.equal(ok, true);

  const loaded = readSoundPreferences();
  assert.deepEqual(loaded, custom);
  assert.equal(global.localStorage.getItem('hala.messageSoundEnabled'), 'true');
});

test('3. Backward compatibility: respects legacy hala.messageSoundEnabled="false"', () => {
  global.localStorage.setItem('hala.messageSoundEnabled', 'false');
  const prefs = readSoundPreferences();
  assert.equal(prefs.messageSoundEnabled, false);
});

test('4. Group notification filtering: "off" drops all group notifications', () => {
  const prefs = { ...DEFAULT_SOUND_PREFERENCES, groupNotifications: 'off' };
  const passedWithMention = filterNotification(
    {
      chatType: 'group',
      messageContent: 'Hey @Ahmed check this out',
      currentUserName: 'Ahmed',
    },
    prefs
  );
  assert.equal(passedWithMention, false);

  const passedGeneral = filterNotification(
    {
      chatType: 'group',
      messageContent: 'Hello everyone',
      currentUserName: 'Ahmed',
    },
    prefs
  );
  assert.equal(passedGeneral, false);
});

test('5. Group notification filtering: "mentions" allows mentions or replies only', () => {
  const prefs = { ...DEFAULT_SOUND_PREFERENCES, groupNotifications: 'mentions' };
  
  const passedMention = filterNotification(
    {
      chatType: 'group',
      messageContent: 'Hello @Sara',
      currentUserName: 'Sara',
    },
    prefs
  );
  assert.equal(passedMention, true);

  const passedReply = filterNotification(
    {
      chatType: 'group',
      messageContent: 'Yes I agree',
      currentUserName: 'Sara',
      isReplyToUser: true,
    },
    prefs
  );
  assert.equal(passedReply, true);

  const droppedNoMention = filterNotification(
    {
      chatType: 'group',
      messageContent: 'Just a casual message to group',
      currentUserName: 'Sara',
    },
    prefs
  );
  assert.equal(droppedNoMention, false);
});

test('6. Group notification filtering: "all" allows all group messages', () => {
  const prefs = { ...DEFAULT_SOUND_PREFERENCES, groupNotifications: 'all' };
  const passed = filterNotification(
    {
      chatType: 'group',
      messageContent: 'General announcement to all members',
      currentUserName: 'Sara',
    },
    prefs
  );
  assert.equal(passed, true);
});

test('7. Tone kind selection: 1-1 uses "message", group uses "group"', () => {
  assert.equal(determineToneKind('1-1'), 'message');
  assert.equal(determineToneKind('group'), 'group');
});

test('8. Sound play check: muted when messageSoundEnabled is false or chat is open', () => {
  const shouldPlay = (isOpen, enabled) => enabled && !isOpen;
  assert.equal(shouldPlay(false, true), true);
  assert.equal(shouldPlay(true, true), false);
  assert.equal(shouldPlay(false, false), false);
  assert.equal(shouldPlay(true, false), false);
});
