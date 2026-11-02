# Implementation Plan - Fix Call Mute and Audio Routing

Ensure that muting the microphone only mutes outgoing voice (without cutting off incoming remote voice or speaker playback), and unmuting instantly restores outgoing audio.

## Proposed Changes

### 1. `src/lib/webrtc.ts`
- Verify `toggleAudio(enabled: boolean)`:
  - Iterates over local stream audio tracks and WebRTC audio senders, setting `track.enabled = enabled`.
  - Ensures remote audio tracks and incoming audio stream are untouched and continue playing normally.

### 2. `src/components/ActiveCallScreen.tsx`
- Verify `handleToggleMic`:
  - Toggles `isMuted` state correctly.
  - Calls `webrtcControllerRef.current?.toggleAudio(!nextMuteState)` so that when `isMuted` is false (unmuted), microphone audio is enabled (`true`), and when `isMuted` is true (muted), microphone audio is disabled (`false`).
- Verify speaker toggle (`handleToggleSpeaker` / `isSpeakerOn`):
  - Controls remote audio element volume and mute state independently of microphone state.
- Ensure remote audio and video elements (`remoteAudioRef`, `remoteVideoRef`) maintain active playback (`autoPlay playsInline`) and are never paused or silenced by mic mute actions.

## Verification Plan
- Compile applet (`compile_applet`) and run test suite.
- Test muting and unmuting during active voice/video call to ensure outgoing microphone is silenced on mute and restored on unmute, while incoming remote voice remains fully audible.
