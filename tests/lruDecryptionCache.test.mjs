import test from 'node:test';
import assert from 'node:assert';
import { DecryptionCacheService } from '../src/lib/lruDecryptionCache.ts';

test('DecryptionCacheService respects capacity and LRU eviction', () => {
  const cache = new DecryptionCacheService(3);

  cache.set('msg1', 'text1');
  cache.set('msg2', 'text2');
  cache.set('msg3', 'text3');

  assert.strictEqual(cache.get('msg1'), 'text1');
  assert.strictEqual(cache.size(), 3);

  // Access msg1 so msg2 becomes the oldest entry
  cache.get('msg1');

  // Adding msg4 should evict msg2 (since msg1 was just accessed, and msg3 was added after msg1)
  cache.set('msg4', 'text4');

  assert.strictEqual(cache.get('msg1'), 'text1');
  assert.strictEqual(cache.get('msg3'), 'text3');
  assert.strictEqual(cache.get('msg4'), 'text4');
  assert.strictEqual(cache.get('msg2'), null); // evicted
  assert.strictEqual(cache.size(), 3);
});
