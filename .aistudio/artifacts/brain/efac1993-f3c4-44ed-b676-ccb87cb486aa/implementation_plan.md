# Implementation Plan - Voice Note Audio Quality Enhancement

## Overview
Enhance voice note recording clarity by configuring higher audio bitrates (128 kbps Opus), studio-grade Web Audio API audio constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`, `sampleRate: 48000`, `channelCount: 1`), and ensuring optimal encoding parameters in `MediaRecorder`.

## Proposed Changes

### 1. `src/components/VoiceRecorderBar.tsx`
- **Audio Stream Constraints**: Configure `navigator.mediaDevices.getUserMedia` with explicit high quality voice settings:
  ```ts
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 },
  }
  ```
- **MediaRecorder Bitrate Settings**: Pass explicit `audioBitsPerSecond: 128000` (128 kbps) in options when instantiating `MediaRecorder`.
- **MIME Type Prioritization**: Prefer `audio/webm;codecs=opus` with 128 kbps bitrate, falling back cleanly to `audio/mp4` or `audio/ogg` if needed.

### 2. Audio Processing & Normalization
- Ensure Web Audio API Analyser node filters frequency spectrum cleanly without distorting audio chunks.
- Preserve clean blob audio output for standard HTML5 Audio playback in `VoiceMessagePlayer.tsx`.

## Verification Plan
1. Test recording voice clips on `VoiceRecorderBar` component.
2. Verify recording bitrate and audio stream settings with 128 kbps Opus configuration.
3. Verify playback clarity and sound fidelity in `VoiceMessagePlayer`.
4. Run `compile_applet` and test suite (`npm test`).
