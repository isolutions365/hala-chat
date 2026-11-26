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
const LEGACY_MESSAGE_SOUND_KEY = 'hala.messageSoundEnabled';
const MAX_LOOP_DURATION_MS = 60_000;

function isValidPresetId(kind: SoundKind, id: unknown): id is string {
  return typeof id === 'string' && SOUND_PRESETS[kind].some((p) => p.id === id);
}

export function normalizeSoundPreferences(value: any): SoundPreferences {
  const src = value && typeof value === 'object' ? value : {};
  return {
    messageTone: isValidPresetId('message', src.messageTone)
      ? src.messageTone
      : DEFAULT_SOUND_PREFERENCES.messageTone,
    groupTone: isValidPresetId('group', src.groupTone)
      ? src.groupTone
      : DEFAULT_SOUND_PREFERENCES.groupTone,
    callTone: isValidPresetId('call', src.callTone)
      ? src.callTone
      : DEFAULT_SOUND_PREFERENCES.callTone,
    ringbackTone: isValidPresetId('ringback', src.ringbackTone)
      ? src.ringbackTone
      : DEFAULT_SOUND_PREFERENCES.ringbackTone,
    vibrationEnabled:
      typeof src.vibrationEnabled === 'boolean'
        ? src.vibrationEnabled
        : DEFAULT_SOUND_PREFERENCES.vibrationEnabled,
    groupNotifications:
      src.groupNotifications === 'all' ||
      src.groupNotifications === 'mentions' ||
      src.groupNotifications === 'off'
        ? src.groupNotifications
        : DEFAULT_SOUND_PREFERENCES.groupNotifications,
    messageSoundEnabled:
      typeof src.messageSoundEnabled === 'boolean'
        ? src.messageSoundEnabled
        : DEFAULT_SOUND_PREFERENCES.messageSoundEnabled,
  };
}

export function readSoundPreferences(): SoundPreferences {
  try {
    const raw = localStorage.getItem(SOUND_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    // Backward compatibility with hala.messageSoundEnabled
    const legacySoundEnabled = localStorage.getItem(LEGACY_MESSAGE_SOUND_KEY);
    const normalized = normalizeSoundPreferences(parsed);
    if (legacySoundEnabled !== null) {
      normalized.messageSoundEnabled = legacySoundEnabled !== 'false';
    }
    return normalized;
  } catch {
    return { ...DEFAULT_SOUND_PREFERENCES };
  }
}

export function saveSoundPreferences(prefs: SoundPreferences): boolean {
  const normalized = normalizeSoundPreferences(prefs);
  try {
    safeLocalStorageSet(LEGACY_MESSAGE_SOUND_KEY, String(normalized.messageSoundEnabled));
    const saved = safeLocalStorageSet(SOUND_PREFS_KEY, JSON.stringify(normalized));
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hala-sounds-changed', { detail: normalized }));
    }
    return saved;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// Web Audio Synthesis Engine
// ----------------------------------------------------

interface ActiveAudioNode {
  osc: OscillatorNode;
  gain: GainNode;
}

let audioCtx: AudioContext | null = null;
let audioUnlockInstalled = false;
const activeLoopIntervals: Partial<Record<SoundKind, ReturnType<typeof setInterval> | null>> = {};
const activeLoopTimeouts: Partial<Record<SoundKind, ReturnType<typeof setTimeout> | null>> = {};
const activeLoopNodes: Partial<Record<SoundKind, ActiveAudioNode[]>> = {};
let activePreviewNodes: ActiveAudioNode[] = [];

function resolveAudioContextConstructor(): (new () => AudioContext) | null {
  if (typeof window !== 'undefined') {
    const ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (ctor) return ctor;
  }
  if (typeof globalThis !== 'undefined') {
    const ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (ctor) return ctor;
  }
  return null;
}

export function getAudioContext(): AudioContext | null {
  if (audioCtx && audioCtx.state === 'closed') {
    audioCtx = null;
  }
  if (!audioCtx) {
    const AudioContextClass = resolveAudioContextConstructor();
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch {
        audioCtx = null;
      }
    }
  }
  return audioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    ctx.resume().catch(() => {});
  }
}

export function installAudioUnlockListeners(target?: EventTarget): void {
  const evtTarget = target || (typeof window !== 'undefined' ? window : null);
  if (!evtTarget || (evtTarget === (typeof window !== 'undefined' ? window : null) && audioUnlockInstalled)) {
    return;
  }
  if (typeof window !== 'undefined' && evtTarget === window) {
    audioUnlockInstalled = true;
  }

  const events = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const removeAll = () => {
    events.forEach((evt) => {
      try {
        evtTarget.removeEventListener(evt, unlock, true);
      } catch {
        // ignore
      }
    });
  };

  const unlock = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            removeAll();
          }
        })
        .catch(() => {});
    } else if (ctx.state === 'running') {
      removeAll();
    }
  };

  events.forEach((evt) => {
    try {
      evtTarget.addEventListener(evt, unlock, { capture: true, passive: true });
    } catch {
      // ignore
    }
  });
}

// Install global first-user-gesture unlock listener automatically in browser environments
if (typeof window !== 'undefined') {
  installAudioUnlockListeners(window);
}

function stopNodeList(nodes: ActiveAudioNode[] | undefined, ctx: AudioContext | null): void {
  if (!nodes || nodes.length === 0) return;
  const now = ctx?.currentTime ?? 0;
  for (const { osc, gain } of nodes) {
    try {
      if (gain?.gain) {
        if (typeof gain.gain.cancelScheduledValues === 'function') {
          gain.gain.cancelScheduledValues(now);
        }
        gain.gain.setValueAtTime(0, now);
      }
    } catch {
      // ignore
    }
    try {
      osc.stop(now);
    } catch {
      // ignore already-stopped oscillator
    }
    try {
      if (typeof osc.disconnect === 'function') osc.disconnect();
      if (typeof gain.disconnect === 'function') gain.disconnect();
    } catch {
      // ignore
    }
  }
}

export function stopPreviewTone(): void {
  stopNodeList(activePreviewNodes, audioCtx);
  activePreviewNodes = [];
}

function triggerVibration(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

function playOscillatorNote(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gainLevel = 0.12,
  type: OscillatorType = 'sine',
  sink?: ActiveAudioNode[]
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

    if (sink) {
      sink.push({ osc, gain });
    }
  } catch (e) {
    console.warn('[Sounds] Note synthesis error:', e);
  }
}

// --- Synthesizers for each kind & preset ---

function synthesizeMessage(ctx: AudioContext, presetId: string, now: number, sink?: ActiveAudioNode[]) {
  switch (presetId) {
    case 'soft_pop':
      // Short gentle pop (B4 -> E5 quickly)
      playOscillatorNote(ctx, 493.88, now, 0.04, 0.14, 'sine', sink);
      playOscillatorNote(ctx, 659.25, now + 0.03, 0.09, 0.12, 'triangle', sink);
      break;
    case 'harp':
      // Gentle 3-note arpeggio (C5 -> E5 -> G5)
      playOscillatorNote(ctx, 523.25, now, 0.12, 0.09, 'sine', sink);
      playOscillatorNote(ctx, 659.25, now + 0.07, 0.12, 0.09, 'sine', sink);
      playOscillatorNote(ctx, 783.99, now + 0.14, 0.22, 0.1, 'triangle', sink);
      break;
    case 'ping':
      // High clean crystal ping (A5)
      playOscillatorNote(ctx, 880.0, now, 0.2, 0.15, 'sine', sink);
      playOscillatorNote(ctx, 1760.0, now, 0.08, 0.04, 'sine', sink);
      break;
    case 'default':
    default:
      // Short soft two-note chime (E5 -> G5) - EXACT previous sound
      playOscillatorNote(ctx, 659.25, now, 0.08, 0.1, 'sine', sink);
      playOscillatorNote(ctx, 783.99, now + 0.1, 0.15, 0.1, 'sine', sink);
      break;
  }
}

function synthesizeGroup(ctx: AudioContext, presetId: string, now: number, sink?: ActiveAudioNode[]) {
  switch (presetId) {
    case 'marimba':
      // Warm marimba double strike (F#4 -> A4)
      playOscillatorNote(ctx, 369.99, now, 0.1, 0.13, 'triangle', sink);
      playOscillatorNote(ctx, 440.0, now + 0.09, 0.14, 0.12, 'sine', sink);
      break;
    case 'double_tap':
      // Percussive double tap (D5 -> D5)
      playOscillatorNote(ctx, 587.33, now, 0.05, 0.12, 'sine', sink);
      playOscillatorNote(ctx, 587.33, now + 0.08, 0.08, 0.12, 'sine', sink);
      break;
    case 'ripple':
      // Quick water ripple (G4 -> B4 -> D5 -> G5)
      playOscillatorNote(ctx, 392.0, now, 0.06, 0.07, 'sine', sink);
      playOscillatorNote(ctx, 493.88, now + 0.04, 0.06, 0.07, 'sine', sink);
      playOscillatorNote(ctx, 587.33, now + 0.08, 0.07, 0.08, 'sine', sink);
      playOscillatorNote(ctx, 783.99, now + 0.12, 0.18, 0.09, 'sine', sink);
      break;
    case 'default':
    default:
      // Tri-tone ascending flourish (D5 -> G5 -> B5)
      playOscillatorNote(ctx, 587.33, now, 0.07, 0.09, 'sine', sink);
      playOscillatorNote(ctx, 783.99, now + 0.07, 0.08, 0.1, 'sine', sink);
      playOscillatorNote(ctx, 987.77, now + 0.14, 0.18, 0.11, 'sine', sink);
      break;
  }
}

function synthesizeCall(
  ctx: AudioContext,
  presetId: string,
  now: number,
  vibrate: boolean,
  sink?: ActiveAudioNode[]
) {
  if (vibrate) {
    triggerVibration([200, 100, 200, 100, 400]);
  }

  switch (presetId) {
    case 'celeste': {
      // Celeste bells (E5, G5, B5, E6, B5, G5)
      const notes = [659.25, 783.99, 987.77, 1318.51, 987.77, 783.99];
      notes.forEach((freq, idx) => {
        playOscillatorNote(ctx, freq, now + idx * 0.16, 0.45, 0.12, 'sine', sink);
      });
      break;
    }
    case 'oriental_strings': {
      // Warm oriental oud scale (D4, E4, F4, G#4, A4)
      const notes = [293.66, 329.63, 349.23, 415.3, 440.0];
      notes.forEach((freq, idx) => {
        playOscillatorNote(ctx, freq, now + idx * 0.18, 0.4, 0.14, 'triangle', sink);
      });
      break;
    }
    case 'modern_ring': {
      // Two-pulse ring (800Hz & 1000Hz)
      playOscillatorNote(ctx, 800, now, 0.25, 0.14, 'sine', sink);
      playOscillatorNote(ctx, 1000, now + 0.05, 0.25, 0.12, 'sine', sink);
      playOscillatorNote(ctx, 800, now + 0.35, 0.35, 0.14, 'sine', sink);
      playOscillatorNote(ctx, 1000, now + 0.4, 0.35, 0.12, 'sine', sink);
      break;
    }
    case 'default':
    default: {
      // EXACT ORIGINAL melody: C5, E5, G5, C6, G5, A5
      const melodyNotes = [523.25, 659.25, 783.99, 1046.5, 783.99, 880.0];
      melodyNotes.forEach((freq, index) => {
        const noteStart = now + index * 0.18;
        playOscillatorNote(ctx, freq, noteStart, 0.5, 0.18, 'sine', sink);
      });
      break;
    }
  }
}

function synthesizeRingback(ctx: AudioContext, presetId: string, now: number, sink?: ActiveAudioNode[]) {
  switch (presetId) {
    case 'soft_sonar':
      playOscillatorNote(ctx, 523.25, now, 0.8, 0.1, 'sine', sink);
      break;
    case 'warm_drone':
      playOscillatorNote(ctx, 330.0, now, 1.0, 0.08, 'sine', sink);
      playOscillatorNote(ctx, 440.0, now, 1.0, 0.06, 'sine', sink);
      break;
    case 'gentle_ping':
    case 'low_beat':
      playOscillatorNote(ctx, 392.0, now, 0.4, 0.09, 'sine', sink);
      playOscillatorNote(ctx, 392.0, now + 0.5, 0.4, 0.09, 'sine', sink);
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

        if (sink) {
          sink.push({ osc: osc1, gain }, { osc: osc2, gain });
        }
      } catch (e) {
        console.warn('[Sounds] Ringback pulse error:', e);
      }
      break;
  }
}

function synthesizeByKind(
  ctx: AudioContext,
  kind: SoundKind,
  presetId: string,
  now: number,
  vibrate: boolean,
  sink?: ActiveAudioNode[]
) {
  switch (kind) {
    case 'message':
      if (vibrate) triggerVibration(60);
      synthesizeMessage(ctx, presetId, now, sink);
      break;
    case 'group':
      if (vibrate) triggerVibration([50, 40, 50]);
      synthesizeGroup(ctx, presetId, now, sink);
      break;
    case 'call':
      synthesizeCall(ctx, presetId, now, vibrate, sink);
      break;
    case 'ringback':
      synthesizeRingback(ctx, presetId, now, sink);
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
  if ((kind === 'message' || kind === 'group') && !prefs.messageSoundEnabled) {
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

  const active = getAudioContext();
  if (!active) return;
  if (active.state === 'suspended' && typeof active.resume === 'function') {
    active.resume().catch(() => {});
  }

  synthesizeByKind(active, kind, presetId, active.currentTime, prefs.vibrationEnabled);
}

/**
 * Previews a specific preset of a given kind immediately (e.g. for settings UI).
 */
export function previewTone(kind: SoundKind, presetId: string): void {
  stopPreviewTone();

  const active = getAudioContext();
  if (!active) return;
  if (active.state === 'suspended' && typeof active.resume === 'function') {
    active.resume().catch(() => {});
  }

  const prefs = readSoundPreferences();
  const validPreset = isValidPresetId(kind, presetId) ? presetId : 'default';
  const sink: ActiveAudioNode[] = [];
  activePreviewNodes = sink;

  synthesizeByKind(active, kind, validPreset, active.currentTime, prefs.vibrationEnabled, sink);
}

/**
 * Starts looping a tone (used for incoming calls and outgoing ringback).
 */
export function startLoopTone(kind: SoundKind): void {
  stopLoopTone(kind);

  const active = getAudioContext();
  if (!active) return;
  if (active.state === 'suspended' && typeof active.resume === 'function') {
    active.resume().catch(() => {});
  }

  const prefs = readSoundPreferences();
  const presetId =
    kind === 'call'
      ? prefs.callTone
      : kind === 'ringback'
      ? prefs.ringbackTone
      : kind === 'group'
      ? prefs.groupTone
      : prefs.messageTone;

  const playIteration = () => {
    const curCtx = getAudioContext();
    if (!curCtx || curCtx.state === 'closed') return;
    const sink: ActiveAudioNode[] = [];
    activeLoopNodes[kind] = sink;
    synthesizeByKind(curCtx, kind, presetId, curCtx.currentTime, prefs.vibrationEnabled, sink);
  };

  playIteration();
  const intervalMs = kind === 'call' ? 2800 : kind === 'ringback' ? 3500 : 2200;
  activeLoopIntervals[kind] = setInterval(playIteration, intervalMs);
  // Safety timeout so a looping tone cannot play indefinitely on call timeout/disconnect
  activeLoopTimeouts[kind] = setTimeout(() => {
    stopLoopTone(kind);
  }, MAX_LOOP_DURATION_MS);
}

/**
 * Stops any active looping tone of the specified kind (or all kinds if omitted).
 */
export function stopLoopTone(kind?: SoundKind): void {
  const kindsToStop: SoundKind[] = kind ? [kind] : ['message', 'group', 'call', 'ringback'];

  kindsToStop.forEach((k) => {
    if (activeLoopIntervals[k]) {
      clearInterval(activeLoopIntervals[k]!);
      activeLoopIntervals[k] = null;
    }
    if (activeLoopTimeouts[k]) {
      clearTimeout(activeLoopTimeouts[k]!);
      activeLoopTimeouts[k] = null;
    }
    if (activeLoopNodes[k]) {
      stopNodeList(activeLoopNodes[k], audioCtx);
      activeLoopNodes[k] = [];
    }
  });

  triggerVibration(0);
}

/**
 * Test helper to reset cached AudioContext & timers between isolated unit tests.
 */
export function resetAudioEngineForTests(): void {
  stopLoopTone();
  stopPreviewTone();
  audioCtx = null;
  audioUnlockInstalled = false;
}
