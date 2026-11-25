import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  computeWaveformFromSamples,
  resampleWaveform,
  extractAudioWaveformFromLocalUrl,
} from '../src/lib/audioWaveform.ts';

test('silent audio produces flat low baseline bars rather than amplified noise', () => {
  const silent = new Float32Array(16000); // 1s silence
  const bars = computeWaveformFromSamples(silent, 24);
  assert.equal(bars.length, 24);
  assert.ok(bars.every((h) => h <= 20), `Expected all silent bars <= 20, got ${JSON.stringify(bars)}`);
});

test('waveform reflects actual speech loudness contour (quiet vs loud segments)', () => {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate * 2); // 2 seconds
  // First second: quiet breath/pause (~0.01 amplitude)
  for (let i = 0; i < sampleRate; i++) {
    samples[i] = 0.01 * Math.sin(i * 0.1);
  }
  // Second second: loud spoken word (~0.75 amplitude)
  for (let i = sampleRate; i < samples.length; i++) {
    samples[i] = 0.75 * Math.sin(i * 0.25);
  }

  const bars = computeWaveformFromSamples(samples, 24);
  const firstHalfAvg = bars.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const secondHalfAvg = bars.slice(14, 24).reduce((a, b) => a + b, 0) / 10;

  assert.ok(firstHalfAvg < 30, `Quiet half should stay low (<30), got ${firstHalfAvg}`);
  assert.ok(secondHalfAvg > 85, `Loud half should peak high (>85), got ${secondHalfAvg}`);
  assert.ok(secondHalfAvg - firstHalfAvg > 55);
});

test('two distinct audio clips produce distinctly different waveforms matching each recording', () => {
  const n = 12000;
  const clipA = new Float32Array(n);
  const clipB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Clip A: loud at start, quiet at end
    clipA[i] = (i < n / 2 ? 0.7 : 0.02) * Math.sin(i * 0.2);
    // Clip B: quiet at start, loud at end
    clipB[i] = (i < n / 2 ? 0.02 : 0.7) * Math.sin(i * 0.2);
  }
  const waveA = computeWaveformFromSamples(clipA, 24);
  const waveB = computeWaveformFromSamples(clipB, 24);
  assert.notDeepEqual(waveA, waveB);
  assert.ok(waveA[2] > waveA[21]);
  assert.ok(waveB[21] > waveB[2]);
});

test('resampleWaveform preserves dynamic shape across target bar counts', () => {
  const source = [14, 16, 95, 98, 20, 15, 88, 16];
  const down = resampleWaveform(source, 4);
  assert.equal(down.length, 4);
  assert.ok(down[1] > down[0] && down[3] > down[0]);

  const up = resampleWaveform(source, 24);
  assert.equal(up.length, 24);
  assert.ok(up.every((v) => v >= 14 && v <= 100));
});

test('extractAudioWaveformFromLocalUrl refuses remote https URLs to avoid duplicate downloads', async () => {
  const res = await extractAudioWaveformFromLocalUrl('https://firebasestorage.googleapis.com/example.webm');
  assert.equal(res, null);
});

test('VoiceMessagePlayer consumes waveformPeaks and does not override them with synthetic sine loops', async () => {
  const source = await readFile('src/components/VoiceMessagePlayer.tsx', 'utf8');
  assert.equal(source.includes('waveformPeaks'), true);
  assert.equal(source.includes('resampleWaveform(waveformPeaks, barCount)'), true);
  assert.equal(source.includes('liveFrequencies'), false);
  assert.equal(source.includes('wavePulse'), false);
});
