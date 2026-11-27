import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (i) => Array.from(storage.keys())[i] ?? null,
};

let oscCount = 0;
globalThis.AudioContext = class {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createOscillator() {
    oscCount += 1;
    return {
      type: 'sine',
      frequency: { setValueAtTime() {} },
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {},
      },
      connect() {},
      disconnect() {},
    };
  }
  resume() {
    return Promise.resolve();
  }
};

const {
  looksLikeEncryptedPayload,
  formatNotificationMessagePreview,
  triggerFilteredNotification,
} = await import('../src/lib/notifications.ts');
const { setNotificationAdapter } = await import('../src/services/notifications.ts');

let nativeCalls = [];

beforeEach(() => {
  storage.clear();
  oscCount = 0;
  nativeCalls = [];
  setNotificationAdapter(null);
  globalThis.window = {
    HalaAndroidNotifications: {
      isSupported: () => true,
      getPermissionStatus: () => 'granted',
      requestPermission: () => {},
      showNotification: (title, body, tag, chatId) => {
        nativeCalls.push({ title, body, tag, chatId });
      },
      cancelMessageNotification: () => {},
      showIncomingCallNotification: () => {},
      cancelCallNotification: () => {},
      getFcmToken: () => 'fake-android-token',
      consumePendingActions: () => '[]',
    },
  };
});

afterEach(() => {
  delete globalThis.window;
});

test('1. looksLikeEncryptedPayload detects E2EE ciphertext blobs without false positives on normal text', () => {
  assert.equal(looksLikeEncryptedPayload('{"iv":"abc123","ciphertext":"XYZ987"}'), true);
  assert.equal(looksLikeEncryptedPayload('E2EE:dGVzdA=='), true);
  assert.equal(
    looksLikeEncryptedPayload('U2FsdGVkX19aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+/=='),
    true
  );

  assert.equal(looksLikeEncryptedPayload('Assalam o Alaikum bhai kaise ho?'), false);
  assert.equal(looksLikeEncryptedPayload('مرحبا كيف حالك؟'), false);
  assert.equal(looksLikeEncryptedPayload('Ok'), false);
});

test('2. formatNotificationMessagePreview shows decrypted text and clean voice/media previews without leaking ciphertext', () => {
  assert.equal(
    formatNotificationMessagePreview({
      type: 'text',
      content: '{"iv":"123","ciphertext":"SECRET_BLOB"}',
      decryptedText: 'Kahan pohanch gaye?',
    }),
    'Kahan pohanch gaye?'
  );

  // If decryption failed, raw ciphertext MUST NOT leak
  assert.equal(
    formatNotificationMessagePreview({
      type: 'text',
      content: '{"iv":"123","ciphertext":"SECRET_BLOB"}',
      decryptedText: null,
    }),
    'New message'
  );

  assert.equal(
    formatNotificationMessagePreview({
      type: 'voice',
      content: 'https://storage.example/voice.webm',
      duration: 14,
    }),
    '🎤 Voice message (0:14)'
  );

  assert.equal(
    formatNotificationMessagePreview({
      type: 'voice',
      duration: 9,
      language: 'ar',
    }),
    '🎤 رسالة صوتية (0:09)'
  );

  assert.equal(
    formatNotificationMessagePreview({
      type: 'image',
      caption: 'Sunset view',
    }),
    '📷 Sunset view'
  );

  assert.equal(
    formatNotificationMessagePreview({
      type: 'video',
    }),
    '🎥 Video'
  );

  assert.equal(
    formatNotificationMessagePreview({
      type: 'file',
      fileName: 'invoice.pdf',
    }),
    '📎 invoice.pdf'
  );
});

test('3. Android native notification forwards chatId for Direct Reply, blocks ciphertext, and avoids double Web Audio tone', () => {
  triggerFilteredNotification({
    chatType: '1-1',
    chatId: 'chat_abc_123',
    messageContent: 'Salam bhai!',
    senderName: 'Ahmed',
    currentUserName: 'Ali',
  });

  assert.equal(nativeCalls.length, 1);
  assert.equal(nativeCalls[0].title, 'Ahmed');
  assert.equal(nativeCalls[0].body, 'Salam bhai!');
  assert.equal(nativeCalls[0].chatId, 'chat_abc_123');
  assert.equal(nativeCalls[0].tag, 'chat-chat_abc_123');
  assert.equal(oscCount, 0, 'Web Audio must not double-play on native Android APK');

  // Even if raw encrypted payload somehow passed directly, guard blocks it
  triggerFilteredNotification({
    chatType: '1-1',
    chatId: 'chat_abc_123',
    messageContent: '{"iv":"abc","ciphertext":"deadbeef1234567890"}',
    senderName: 'Ahmed',
    currentUserName: 'Ali',
  });

  assert.equal(nativeCalls.length, 2);
  assert.equal(nativeCalls[1].body, 'New message');
});
