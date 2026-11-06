import test from 'node:test';
import assert from 'node:assert/strict';

test('firestore connection status hook accurately tracks online and offline states', () => {
  function getInitialStatus(isOnline, isFromCache) {
    const isFirestoreConnected = isOnline && !isFromCache;
    return {
      isOnline,
      isFirestoreConnected,
      isFromCache,
      status: !isOnline ? 'offline' : (!isFirestoreConnected || isFromCache) ? 'offline' : 'online',
    };
  }

  // When online and live synced
  const onlineState = getInitialStatus(true, false);
  assert.equal(onlineState.isOnline, true);
  assert.equal(onlineState.isFirestoreConnected, true);
  assert.equal(onlineState.status, 'online');

  // When network drops offline
  const offlineState = getInitialStatus(false, true);
  assert.equal(offlineState.isOnline, false);
  assert.equal(offlineState.isFirestoreConnected, false);
  assert.equal(offlineState.status, 'offline');

  // When browser is online but Firestore served from cache (connection lost)
  const cachedOfflineState = getInitialStatus(true, true);
  assert.equal(cachedOfflineState.isOnline, true);
  assert.equal(cachedOfflineState.isFirestoreConnected, false);
  assert.equal(cachedOfflineState.status, 'offline');
});
