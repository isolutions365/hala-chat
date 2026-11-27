import test from 'node:test';
import assert from 'node:assert/strict';

// Test safe storage invariants and quota error detection directly
test('isStorageQuotaError accurately detects quota error variations', () => {
  function isStorageQuotaError(err) {
    if (!err) return false;
    const e = err;
    return (
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 ||
      e.code === 1014 ||
      (typeof e.message === 'string' && (
        e.message.toLowerCase().includes('quota') ||
        e.message.toLowerCase().includes('storage full') ||
        e.message.toLowerCase().includes('exceeded the quota')
      ))
    );
  }

  assert.equal(isStorageQuotaError(new Error('QuotaExceededError: DOM exception 22')), true);
  assert.equal(isStorageQuotaError({ name: 'QuotaExceededError', code: 22 }), true);
  assert.equal(isStorageQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 }), true);
  assert.equal(isStorageQuotaError(new Error('The quota has been exceeded.')), true);
  assert.equal(isStorageQuotaError(new Error('Network connection timed out')), false);
  assert.equal(isStorageQuotaError(null), false);
});

test('isFirebaseStorageNonRetryableError flags fatal errors', () => {
  function isFirebaseStorageNonRetryableError(err) {
    if (!err) return false;
    const code = err?.code || '';
    const message = String(err?.message || '').toLowerCase();
    return (
      code === 'storage/quota-exceeded' ||
      code === 'storage/unauthorized' ||
      code === 'storage/object-not-found' ||
      code === 'storage/canceled' ||
      code === 'storage/invalid-checksum' ||
      message.includes('permission') ||
      message.includes('quota') ||
      message.includes('unauthorized')
    );
  }

  assert.equal(isFirebaseStorageNonRetryableError({ code: 'storage/quota-exceeded' }), true);
  assert.equal(isFirebaseStorageNonRetryableError({ code: 'storage/unauthorized' }), true);
  assert.equal(isFirebaseStorageNonRetryableError({ code: 'storage/object-not-found' }), true);
  assert.equal(isFirebaseStorageNonRetryableError(new Error('Firebase Storage: User does not have permission')), true);
  assert.equal(isFirebaseStorageNonRetryableError({ code: 'storage/retry-limit-exceeded' }), false);
  assert.equal(isFirebaseStorageNonRetryableError(new Error('TypeError: Failed to fetch')), false);
});

test('safeLocalStorageSet rejects large base64 media payloads and handles quota cleanup without losing critical keys', () => {
  // Mock window.localStorage
  const store = new Map();
  let failOnNextSet = false;

  const mockLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (failOnNextSet) {
        failOnNextSet = false;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null,
  };

  // Seed critical and disposable keys
  store.set('hala.interfaceLanguage', 'en');
  store.set('hala.profile.user123', JSON.stringify({ name: 'User', uid: 'user123' }));
  store.set('hala_hidden_posts_user123', '["post1"]');
  store.set('hala_trans_v1_msg1_en', '{"translatedText":"Hello"}');
  store.set('hala_trans_v1_msg2_en', '{"translatedText":"World"}');
  store.set('hala_whatsapp_speed_cache_v1', '{"m1":"text"}');

  function cleanupDisposableStorage(targetKeysToFree = 20) {
    let freedCount = 0;
    const keysToRemove = [];
    const translationKeys = [];

    for (let i = 0; i < mockLocalStorage.length; i++) {
      const key = mockLocalStorage.key(i);
      if (!key) continue;
      if (key.startsWith('hala_trans_v1_')) {
        translationKeys.push(key);
      } else if (key === 'hala_whatsapp_speed_cache_v1') {
        keysToRemove.push(key);
      }
    }

    keysToRemove.push(...translationKeys.slice(0, targetKeysToFree));
    for (const k of keysToRemove) {
      mockLocalStorage.removeItem(k);
      freedCount++;
    }
    return freedCount;
  }

  function safeLocalStorageSet(key, value) {
    // Media guard
    if (value.length > 65536 && (value.includes('data:image/') || value.includes('data:audio/'))) {
      return false;
    }
    try {
      mockLocalStorage.setItem(key, value);
      return true;
    } catch (err) {
      cleanupDisposableStorage(10);
      try {
        mockLocalStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  }

  // 1. Should reject 70KB data:image payload
  const hugePayload = 'data:image/jpeg;base64,' + 'A'.repeat(70000);
  const rejectResult = safeLocalStorageSet('huge_image', hugePayload);
  assert.equal(rejectResult, false);
  assert.equal(store.has('huge_image'), false);

  // 2. Trigger quota error on write, should clean disposable translation cache but preserve user profiles & settings
  failOnNextSet = true;
  const ok = safeLocalStorageSet('new_key', 'normal_value');
  assert.equal(ok, true);
  assert.equal(store.get('new_key'), 'normal_value');

  // Verify critical keys remained completely intact
  assert.equal(store.get('hala.interfaceLanguage'), 'en');
  assert.ok(store.has('hala.profile.user123'));
  assert.ok(store.has('hala_hidden_posts_user123'));

  // Verify disposable keys were safely pruned
  assert.equal(store.has('hala_trans_v1_msg1_en'), false);
  assert.equal(store.has('hala_trans_v1_msg2_en'), false);
});

test('isFirebaseStorageQuotaError correctly identifies quota errors', () => {
  function isFirebaseStorageQuotaError(err) {
    if (!err) return false;
    const code = err?.code || '';
    const message = String(err?.message || '').toLowerCase();
    return (
      code === 'storage/quota-exceeded' ||
      code === 'storage/project-quota-exceeded' ||
      message.includes('quota') ||
      message.includes('exceeded quota')
    );
  }

  assert.equal(isFirebaseStorageQuotaError({ code: 'storage/quota-exceeded' }), true);
  assert.equal(isFirebaseStorageQuotaError({ code: 'storage/project-quota-exceeded' }), true);
  assert.equal(isFirebaseStorageQuotaError(new Error('Firebase Storage: quota exceeded')), true);
  assert.equal(isFirebaseStorageQuotaError({ code: 'storage/unauthorized' }), false);
  assert.equal(isFirebaseStorageQuotaError(null), false);
});

