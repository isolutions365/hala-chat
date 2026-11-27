import { test } from 'node:test';
import assert from 'node:assert/strict';

test('bandwidth estimation computes accurate throughput and smooths with exponential moving average', () => {
  let estimatedKbps = 3000;
  let sampleCount = 0;
  const alpha = 0.35;

  function recordSample(bytes, durationMs) {
    if (bytes < 1024 || durationMs < 15) return estimatedKbps;
    const seconds = durationMs / 1000;
    const instantKbps = Math.round((bytes * 8) / seconds / 1024);
    if (sampleCount === 0) {
      estimatedKbps = instantKbps;
    } else {
      estimatedKbps = Math.round(alpha * instantKbps + (1 - alpha) * estimatedKbps);
    }
    sampleCount++;
    return estimatedKbps;
  }

  // 100KB transferred in 1000ms = 800 kbps
  const s1 = recordSample(100 * 1024, 1000);
  assert.equal(s1, 800);
  assert.equal(sampleCount, 1);

  // 50KB transferred in 1000ms = 400 kbps -> EMA: 0.35 * 400 + 0.65 * 800 = 140 + 520 = 660 kbps
  const s2 = recordSample(50 * 1024, 1000);
  assert.equal(s2, 660);
  assert.equal(sampleCount, 2);
});

test('bandwidth tier and effective resolution map correctly across connection states', () => {
  function getTier(estimatedKbps, isDataSaver, effectiveType) {
    if (isDataSaver) return 'low';
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'low';
    if (estimatedKbps < 650) return 'low';
    if (estimatedKbps < 2200 || effectiveType === '3g') return 'medium';
    return 'high';
  }

  function getEffectiveResolution(preference, tier) {
    if (preference === 'low') return 'low';
    if (preference === 'high') return 'high';
    return tier === 'low' ? 'low' : 'high';
  }

  // 1. Data Saver forced low
  assert.equal(getTier(5000, true, '4g'), 'low');
  assert.equal(getEffectiveResolution('auto', 'low'), 'low');

  // 2. Slow 2G forced low
  assert.equal(getTier(1200, false, '2g'), 'low');
  assert.equal(getEffectiveResolution('auto', 'low'), 'low');

  // 3. Fast connection auto high
  assert.equal(getTier(4500, false, '4g'), 'high');
  assert.equal(getEffectiveResolution('auto', 'high'), 'high');

  // 4. User manual override to high even on low tier
  assert.equal(getEffectiveResolution('high', 'low'), 'high');

  // 5. User manual override to low even on fast tier
  assert.equal(getEffectiveResolution('low', 'high'), 'low');
});

test('proxy resolution parameter and cache key differentiate low-res and high-res entries', () => {
  function getLRUCacheKey(url, range, res) {
    const parts = [url];
    if (range) parts.push(`range:${range}`);
    if (res) parts.push(`res:${res}`);
    return parts.join('::');
  }

  const assetUrl = 'https://firebasestorage.googleapis.com/v0/b/app/o/media%2Fphoto.jpg';
  const keyHigh = getLRUCacheKey(assetUrl, undefined, 'high');
  const keyLow = getLRUCacheKey(assetUrl, undefined, 'low');

  assert.notEqual(keyHigh, keyLow);
  assert.equal(keyHigh, `${assetUrl}::res:high`);
  assert.equal(keyLow, `${assetUrl}::res:low`);

  const proxyUrlLow = `/api/media-proxy?url=${encodeURIComponent(assetUrl)}&res=low`;
  const parsed = new URL(`http://localhost:3000${proxyUrlLow}`);
  assert.equal(parsed.searchParams.get('url'), assetUrl);
  assert.equal(parsed.searchParams.get('res'), 'low');
});
