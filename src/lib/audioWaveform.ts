export interface ExtractedAudioWaveform {
  peaks: number[];
  duration: number;
}

// In-memory cache keyed by messageId, mediaIv, remote URL, or local blob URL
const waveformCache = new Map<string, ExtractedAudioWaveform>();
const inFlightExtractions = new Map<string, Promise<ExtractedAudioWaveform | null>>();

let sharedDecodeCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedDecodeCtx || sharedDecodeCtx.state === 'closed') {
    sharedDecodeCtx = new AudioCtx();
  }
  return sharedDecodeCtx;
}

export function registerAudioWaveform(identifier: string | null | undefined, data: ExtractedAudioWaveform) {
  if (!identifier || !data?.peaks?.length) return;
  waveformCache.set(identifier, data);
}

export function getCachedAudioWaveform(identifier?: string | null): ExtractedAudioWaveform | null {
  if (!identifier) return null;
  return waveformCache.get(identifier) || null;
}

/**
 * Computes real perceptual amplitude bars (14..100%) from PCM audio samples.
 * Silent passages remain low (~14%), while spoken words scale dynamically to the clip's peaks.
 */
export function computeWaveformFromChannelArrays(channels: Float32Array[], barCount = 40): number[] {
  const count = Math.max(4, Math.min(96, Math.round(barCount)));
  if (!channels.length || !channels[0]?.length) {
    return Array.from({ length: count }, () => 16);
  }

  const totalSamples = channels[0].length;
  const blockSize = Math.max(1, Math.floor(totalSamples / count));
  const rawRms: number[] = [];
  let maxRms = 0;

  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * totalSamples) / count);
    const end = Math.min(totalSamples, Math.max(start + 1, Math.floor(((i + 1) * totalSamples) / count)));
    const span = Math.max(1, end - start);
    const stride = span > 2048 ? Math.floor(span / 1024) : 1;

    let sumSquares = 0;
    let sampled = 0;
    for (let s = start; s < end; s += stride) {
      let mixed = 0;
      for (let c = 0; c < channels.length; c++) {
        mixed += channels[c][s] || 0;
      }
      mixed /= channels.length;
      sumSquares += mixed * mixed;
      sampled++;
    }

    const rms = sampled > 0 ? Math.sqrt(sumSquares / sampled) : 0;
    rawRms.push(rms);
    if (rms > maxRms) maxRms = rms;
  }

  // Silence floor: avoid amplifying microphone self-noise on silent clips
  if (maxRms < 0.004) {
    return rawRms.map((rms) => Math.max(12, Math.min(20, Math.round(12 + (rms / 0.004) * 6))));
  }

  const noiseFloor = Math.min(0.003, maxRms * 0.06);
  const denom = Math.max(0.0001, maxRms - noiseFloor);

  return rawRms.map((rms) => {
    const normalized = Math.max(0, Math.min(1, (rms - noiseFloor) / denom));
    // Perceptual compression makes speech dynamics legible without clipping peaks
    const perceptual = Math.pow(normalized, 0.72);
    return Math.max(14, Math.min(100, Math.round(14 + perceptual * 86)));
  });
}

export function computeWaveformFromSamples(samples: Float32Array, barCount = 40): number[] {
  return computeWaveformFromChannelArrays([samples], barCount);
}

/**
 * Resamples an extracted waveform array to match a target visual bar count while preserving peaks.
 */
export function resampleWaveform(peaks: number[], targetCount: number): number[] {
  const count = Math.max(4, Math.round(targetCount));
  if (!peaks || peaks.length === 0) {
    return Array.from({ length: count }, () => 18);
  }
  if (peaks.length === count) {
    return peaks.map((v) => Math.max(14, Math.min(100, Math.round(v))));
  }

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const startIdx = (i * peaks.length) / count;
    const endIdx = ((i + 1) * peaks.length) / count;
    const lo = Math.floor(startIdx);
    const hi = Math.min(peaks.length - 1, Math.floor(Math.max(startIdx, endIdx - 0.0001)));

    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let j = lo; j <= hi; j++) {
      const val = peaks[j] ?? 18;
      if (val > peak) peak = val;
      sum += val;
      n++;
    }
    const avg = n > 0 ? sum / n : 18;
    // Blend peak & mean when downsampling so loud syllables stay distinct
    const blended = peaks.length > count ? peak * 0.65 + avg * 0.35 : avg;
    out.push(Math.max(14, Math.min(100, Math.round(blended))));
  }
  return out;
}

export async function extractAudioWaveformFromBuffer(
  arrayBuffer: ArrayBuffer,
  barCount = 40
): Promise<ExtractedAudioWaveform | null> {
  if (!arrayBuffer || arrayBuffer.byteLength < 16) return null;
  const ctx = getSharedAudioContext();
  if (!ctx) return null;

  try {
    // decodeAudioData detaches the passed ArrayBuffer, so pass a copy
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      channels.push(decoded.getChannelData(c));
    }
    const peaks = computeWaveformFromChannelArrays(channels, barCount);
    const duration = Number.isFinite(decoded.duration) && decoded.duration > 0
      ? Math.round(decoded.duration)
      : 0;
    return { peaks, duration };
  } catch {
    return null;
  }
}

export async function extractAudioWaveformFromBlob(
  blob: Blob,
  barCount = 40
): Promise<ExtractedAudioWaveform | null> {
  if (!blob || blob.size < 16) return null;
  try {
    const buffer = await blob.arrayBuffer();
    return await extractAudioWaveformFromBuffer(buffer, barCount);
  } catch {
    return null;
  }
}

/**
 * Extracts waveform ONLY from local in-memory blob:/data: URLs (zero network traffic).
 */
export async function extractAudioWaveformFromLocalUrl(
  localUrl: string,
  barCount = 40
): Promise<ExtractedAudioWaveform | null> {
  if (!localUrl || (!localUrl.startsWith('blob:') && !localUrl.startsWith('data:'))) {
    return null;
  }

  const cached = waveformCache.get(localUrl);
  if (cached) return cached;

  const existing = inFlightExtractions.get(localUrl);
  if (existing) return existing;

  const task = (async () => {
    try {
      const response = await fetch(localUrl);
      const buffer = await response.arrayBuffer();
      const extracted = await extractAudioWaveformFromBuffer(buffer, barCount);
      if (extracted) {
        waveformCache.set(localUrl, extracted);
      }
      return extracted;
    } catch {
      return null;
    } finally {
      inFlightExtractions.delete(localUrl);
    }
  })();

  inFlightExtractions.set(localUrl, task);
  return task;
}
