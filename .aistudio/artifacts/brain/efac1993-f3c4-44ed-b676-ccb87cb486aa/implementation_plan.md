# Implementation Plan - Fix Voice Call Mute & Speaker Buttons

## Overview
Fix the Mute (microphone) and Speaker controls during active voice/video calls so that tapping Mute immediately stops outgoing audio transmission across media tracks and WebRTC senders, and tapping Speaker immediately mutes/unmutes incoming remote audio on `remoteAudioRef` and `remoteVideoRef` media elements.

## Proposed Changes

### 1. `src/lib/webrtc.ts`
- **Microphone Toggle (`toggleAudio`)**:
  - Update `localStream.getAudioTracks()` to set `track.enabled = enabled`.
  - Iterate over `pc.getSenders()`, find audio senders, and set `sender.track.enabled = enabled` to guarantee microphone track transmission stops instantly when muted.

### 2. `src/components/ActiveCallScreen.tsx`
- **Speaker Toggle Control**:
  - Connect `isSpeakerOn` state directly to `remoteAudioRef.current.muted = !isSpeakerOn` (and `remoteAudioRef.current.volume = isSpeakerOn ? 1.0 : 0.0`) and `remoteVideoRef.current.muted = !isSpeakerOn`.
  - Add a reactive `useEffect` watching `isSpeakerOn` to sync audio element playback volume/mute state in real time.
- **Microphone Mute Control**:
  - Update `handleToggleMic` to toggle `isMuted` state, call `webrtcControllerRef.current.toggleAudio(!nextMuteState)`, and update local visual indicators.

## Verification Plan
1. Test clicking the Mute button during a call and verify microphone transmission is disabled.
2. Test clicking the Speaker button during a call and verify remote speaker audio is muted/unmuted.
3. Run `compile_applet` and `npm test` suite to verify build stability.
