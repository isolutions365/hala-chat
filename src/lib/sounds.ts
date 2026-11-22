/**
 * Hala Sound & Tone Subsystem
 * Web Audio API synthesized tones for messages, group alerts, incoming calls, and ringback.
 * All tones are purely synthesized without external audio asset files.
 */

import { safeLocalStorageSet } from './safeStorage.ts';

export type SoundKind = 'message' | 'group' | 'call' | 'ringback';
export type GroupNotificationSetting = 'all' | 'mentions' | 'off';

export interface SoundPreset {
  id: string;
  nameEn: string;
  nameAr: string;
}

export interface SoundPreferences {
  messageTone: string;
  groupTone: string;
  callTone: string;
  ringbackTone: string;
  vibrationEnabled: boolean;
  groupNotifications: GroupNotificationSetting;
  messageSoundEnabled: boolean;
}

export const SOUND_PRESETS: Record<SoundKind, SoundPreset[]> = {
  message: [
    { id: 'default', nameEn: 'Chime (Default)', nameAr: 'رنين ناعم (افتراضي)' },
    { id: 'soft_pop', nameEn: 'Soft Pop', nameAr: 'فقاعة ناعمة' },
    { id: 'harp', nameEn: 'Harp Pluck', nameAr: 'قيثارة' },
    { id: 'ping', nameEn: 'Digital Ping', nameAr: 'جرس رقمي' },
  ],
  group: [
    { id: 'default', nameEn: 'Tri-tone (Default)', nameAr: 'ثلاثي النغمات (افتراضي)' },
    { id: 'marimba', nameEn: 'Warm Marimba', nameAr: 'ماريمبا هادئة' },
    { id: 'double_tap', nameEn: 'Double Tap', nameAr: 'نقرة مزدوجة' },
    { id: 'ripple', nameEn: 'Water Ripple', nameAr: 'موجة مائية' },
  ],
  call: [
    { id: 'default', nameEn: 'Marimba Melodic (Default)', nameAr: 'ماريمبا شرقية (افتراضي)' },
    { id: 'celeste', nameEn: 'Celeste Bells', nameAr: 'أجراس سيليست' },
    { id: 'oriental_strings', nameEn: 'Oud Chimes', nameAr: 'نغمات العود' },
    { id: 'modern_ring', nameEn: 'Modern Pulse', nameAr: 'نبض عصري' },
  ],
  ringback: [
    { id: 'default', nameEn: 'Standard Pulse (Default)', nameAr: 'نبض تقليدي (افتراضي)' },
    { id: 'soft_sonar', nameEn: 'Soft Sonar', nameAr: 'سونار ناعم' },
    { id: 'warm_drone', nameEn: 'Warm Tone', nameAr: 'نغمة دافئة' },
    { id: 'low_beat', nameEn: 'Gentle Ping', nameAr: 'رنين خافت' },
  ],
};

export const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
  messageTone: 'default',
  groupTone: 'default',
  callTone: 'default',
  ringbackTone: 'default',
  vibrationEnabled: true,
  groupNotifications: 'mentions',
  messageSoundEnabled: true,
};

const SOUND_PREFS_KEY = 'hala.soundPreferences.v1';

export function readSoundPreferences(): SoundPreferences {
  try {
    const raw = localStorage.getItem(SOUND_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Backward compatibility with hala.messageSoundEnabled
    const legacySoundEnabled = localStorage.getItem('hala.messageSoundEnabled');
    const messageSoundEnabled = legacySoundEnabled !== null ? legacySoundEnabled !== 'false' : (parsed.messageSoundEnabled ?? true);

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

export function saveSoundPreferences(prefs: SoundPreferences): boolean {
  try {
    localStorage.setItem('hala.messageSoundEnabled', String(prefs.messageSoundEnabled));
    const saved = safeLocalStorageSet(SOUND_PREFS_KEY, JSON.stringify(prefs));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hala-sounds-changed', { detail: prefs }));
    }
    return saved;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// Web Audio Synthesis Engine
// ----------------------------------------------------

let audioCtx: AudioContext | null = null;
let activeLoopIntervals: Partial<Record<SoundKind, any>> = {};

export function getAudioContext(): AudioContext | null {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// Global user-gesture unlock listener
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlockAudioContext();
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

function playOscillatorNote(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gainLevel = 0.12,
  type: OscillatorType = 'sine'
) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  } catch (e) {
    console.warn('[Sounds] Note synthesis error:', e);
  }
}

// --- Synthesizers for each kind & preset ---

function synthesizeMessage(ctx: AudioContext, presetId: string, now: number) {
  switch (presetId) {
    case 'soft_pop':
      // Short gentle pop (B4 -> E5 quickly)
      playOscillatorNote(ctx, 493.88, now, 0.04, 0.14, 'sine');
      playOscillatorNote(ctx, 659.25, now + 0.03, 0.09, 0.12, 'triangle');
      break;
    case 'harp':
      // Gentle 3-note arpeggio (C5 -> E5 -> G5)
      playOscillatorNote(ctx, 523.25, now, 0.12, 0.09, 'sine');
      playOscillatorNote(ctx, 659.25, now + 0.07, 0.12, 0.09, 'sine');
      playOscillatorNote(ctx, 783.99, now + 0.14, 0.22, 0.1, 'triangle');
      break;
    case 'ping':
      // High clean crystal ping (A5)
      playOscillatorNote(ctx, 880.0, now, 0.2, 0.15, 'sine');
      playOscillatorNote(ctx, 1760.0, now, 0.08, 0.04, 'sine');
      break;
    case 'default':
    default:
      // Short soft two-note chime (E5 -> G5) - EXACT previous sound
      playOscillatorNote(ctx, 659.25, now, 0.08, 0.1, 'sine');
      playOscillatorNote(ctx, 783.99, now + 0.1, 0.15, 0.1, 'sine');
      break;
  }
}

function synthesizeGroup(ctx: AudioContext, presetId: string, now: number) {
  switch (presetId) {
    case 'marimba':
      // Warm marimba double strike (F#4 -> A4)
      playOscillatorNote(ctx, 369.99, now, 0.1, 0.13, 'triangle');
      playOscillatorNote(ctx, 440.0, now + 0.09, 0.14, 0.12, 'sine');
      break;
    case 'double_tap':
      // Percussive double tap (D5 -> D5)
      playOscillatorNote(ctx, 587.33, now, 0.05, 0.12, 'sine');
      playOscillatorNote(ctx, 587.33, now + 0.08, 0.08, 0.12, 'sine');
      break;
    case 'ripple':
      // Quick water ripple (G4 -> B4 -> D5 -> G5)
      playOscillatorNote(ctx, 392.0, now, 0.06, 0.07, 'sine');
      playOscillatorNote(ctx, 493.88, now + 0.04, 0.06, 0.07, 'sine');
      playOscillatorNote(ctx, 587.33, now + 0.08, 0.07, 0.08, 'sine');
      playOscillatorNote(ctx, 783.99, now + 0.12, 0.18, 0.09, 'sine');
      break;
    case 'default':
    default:
      // Tri-tone ascending flourish (D5 -> G5 -> B5)
      playOscillatorNote(ctx, 587.33, now, 0.07, 0.09, 'sine');
      playOscillatorNote(ctx, 783.99, now + 0.07, 0.08, 0.1, 'sine');
      playOscillatorNote(ctx, 987.77, now + 0.14, 0.18, 0.11, 'sine');
      break;
  }
}

function synthesizeCall(ctx: AudioContext, presetId: string, now: number, vibrate: boolean) {
  if (vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([200, 100, 200, 100, 400]);
    } catch {}
  }

  switch (presetId) {
    case 'celeste': {
      // Celeste bell bells (E5, G5, B5, E6, B5, G5)
      const notes = [659.25, 783.99, 987.77, 1318.51, 987.77, 783.99];
      notes.forEach((freq, idx) => {
        playOscillatorNote(ctx, freq, now + idx * 0.16, 0.45, 0.12, 'sine');
      });
      break;
    }
    case 'oriental_strings': {
      // Warm oriental oud scale (D4, E4, F4, G#4, A4)
      const notes = [293.66, 329.63, 349.23, 415.3, 440.0];
      notes.forEach((freq, idx) => {
        playOscillatorNote(ctx, freq, now + idx * 0.18, 0.4, 0.14, 'triangle');
      });
      break;
    }
    case 'modern_ring': {
      // Two-pulse ring (800Hz & 1000Hz)
      playOscillatorNote(ctx, 800, now, 0.25, 0.14, 'sine');
      playOscillatorNote(ctx, 1000, now + 0.05, 0.25, 0.12, 'sine');
      playOscillatorNote(ctx, 800, now + 0.35, 0.35, 0.14, 'sine');
      playOscillatorNote(ctx, 1000, now + 0.4, 0.35, 0.12, 'sine');
      break;
    }
    case 'default':
    default: {
      // EXACT ORIGINAL melody: C5, E5, G5, C6, G5, A5
      const melodyNotes = [523.25, 659.25, 783.99, 1046.5, 783.99, 880.0];
      melodyNotes.forEach((freq, index) => {
        const noteStart = now + index * 0.18;
        playOscillatorNote(ctx, freq, noteStart, 0.5, 0.18, 'sine');
      });
      break;
    }
  }
}

function synthesizeRingback(ctx: AudioContext, presetId: string, now: number) {
  switch (presetId) {
    case 'soft_sonar':
      playOscillatorNote(ctx, 523.25, now, 0.8, 0.1, 'sine');
      break;
    case 'warm_drone':
      playOscillatorNote(ctx, 330.0, now, 1.0, 0.08, 'sine');
      playOscillatorNote(ctx, 440.0, now, 1.0, 0.06, 'sine');
      break;
    case 'gentle_ping':
    case 'low_beat':
      playOscillatorNote(ctx, 392.0, now, 0.4, 0.09, 'sine');
      playOscillatorNote(ctx, 392.0, now + 0.5, 0.4, 0.09, 'sine');
      break;
    case 'default':
    default:
      // EXACT ORIGINAL OUTGOING RINGBACK: 440Hz + 480Hz dual tone pulse
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.value = 440;
        osc2.type = 'sine';
        osc2.frequency.value = 480;

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.2);
        gain.gain.linearRampToValueAtTime(0, now + 1.3);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.35);
        osc2.stop(now + 1.35);
      } catch (e) {
        console.warn('[Sounds] Ringback pulse error:', e);
      }
      break;
  }
}

// ----------------------------------------------------
// Public Tone Playback and Loop Controls
// ----------------------------------------------------

/**
 * Plays a single tone of the specified kind using stored user preferences.
 */
export function playTone(kind: SoundKind): void {
  const prefs = readSoundPreferences();
  if (kind === 'message' && !prefs.messageSoundEnabled) {
    return;
  }

  const presetId =
    kind === 'message'
      ? prefs.messageTone
      : kind === 'group'
      ? prefs.groupTone
      : kind === 'call'
      ? prefs.callTone
      : prefs.ringbackTone;

  previewTone(kind, presetId);
}

/**
 * Previews a specific preset of a given kind immediately (e.g. for settings UI).
 */
export function previewTone(kind: SoundKind, presetId: string): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state === 'closed') {
    unlockAudioContext();
  }
  const active = getAudioContext();
  if (!active) return;
  if (active.state === 'suspended') {
    active.resume().catch(() => {});
  }

  const now = active.currentTime;
  const prefs = readSoundPreferences();

  switch (kind) {
    case 'message':
      synthesizeMessage(active, presetId, now);
      break;
    case 'group':
      synthesizeGroup(active, presetId, now);
      break;
    case 'call':
      synthesizeCall(active, presetId, now, prefs.vibrationEnabled);
      break;
    case 'ringback':
      synthesizeRingback(active, presetId, now);
      break;
  }
}

/**
 * Starts looping a tone (used for incoming calls and outgoing ringback).
 */
export function startLoopTone(kind: 'call' | 'ringback'): void {
  stopLoopTone(kind);

  const ctx = getAudioContext();
  if (!ctx || ctx.state === 'closed') {
    unlockAudioContext();
  }
  const active = getAudioContext();
  if (!active) return;
  if (active.state === 'suspended') {
    active.resume().catch(() => {});
  }

  const prefs = readSoundPreferences();
  const presetId = kind === 'call' ? prefs.callTone : prefs.ringbackTone;

  const playIteration = () => {
    const curCtx = getAudioContext();
    if (!curCtx || curCtx.state === 'closed') return;
    const now = curCtx.currentTime;
    if (kind === 'call') {
      synthesizeCall(curCtx, presetId, now, prefs.vibrationEnabled);
    } else {
      synthesizeRingback(curCtx, presetId, now);
    }
  };

  playIteration();
  const intervalMs = kind === 'call' ? 2800 : 3500;
  activeLoopIntervals[kind] = setInterval(playIteration, intervalMs);
}

/**
 * Stops any active looping tone of the specified kind (or all kinds if omitted).
 */
export function stopLoopTone(kind?: 'call' | 'ringback'): void {
  const kindsToStop: Array<'call' | 'ringback'> = kind ? [kind] : ['call', 'ringback'];

  kindsToStop.forEach((k) => {
    if (activeLoopIntervals[k]) {
      clearInterval(activeLoopIntervals[k]);
      activeLoopIntervals[k] = null;
    }
  });

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch {}
  }
}
