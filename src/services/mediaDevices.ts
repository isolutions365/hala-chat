/**
 * Pluggable Media Devices Service (Camera & Microphone)
 * Abstracts navigator.mediaDevices.getUserMedia behind a clean adapter interface
 * for easy swapping with Capacitor Camera/Microphone or Electron native streams.
 */

export type CameraFacingMode = 'user' | 'environment';

export interface MediaDevicesAdapter {
  isSupported(): boolean;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices?(): Promise<MediaDeviceInfo[]>;
}

export const webMediaDevicesAdapter: MediaDevicesAdapter = {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
    );
  },
  async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (!this.isSupported()) {
      throw new Error('Media capture (camera/microphone) is not supported in this environment.');
    }
    return await navigator.mediaDevices.getUserMedia(constraints);
  },
  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== 'function'
    ) {
      return [];
    }
    return await navigator.mediaDevices.enumerateDevices();
  },
};

let activeMediaAdapter: MediaDevicesAdapter = webMediaDevicesAdapter;

export function setMediaDevicesAdapter(adapter: MediaDevicesAdapter): void {
  activeMediaAdapter = adapter;
}

export function isMediaCaptureSupported(): boolean {
  return activeMediaAdapter.isSupported();
}

export async function requestMediaStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return await activeMediaAdapter.getUserMedia(constraints);
}

export async function enumerateMediaDevices(): Promise<MediaDeviceInfo[]> {
  try {
    if (typeof activeMediaAdapter.enumerateDevices === 'function') {
      return await activeMediaAdapter.enumerateDevices();
    }
    return await webMediaDevicesAdapter.enumerateDevices!();
  } catch {
    return [];
  }
}

export function resolveTrackFacingMode(
  track: MediaStreamTrack | null | undefined,
  fallbackFacing: CameraFacingMode = 'user'
): CameraFacingMode {
  if (!track) return fallbackFacing;
  try {
    const settingsFacing = typeof track.getSettings === 'function' ? track.getSettings()?.facingMode : undefined;
    if (settingsFacing === 'user' || settingsFacing === 'environment') {
      return settingsFacing;
    }
  } catch {
    // ignore getSettings errors on stopped/mock tracks
  }

  const label = (track.label || '').toLowerCase();
  if (/back|rear|environment|world/.test(label) && !/front|user|selfie/.test(label)) {
    return 'environment';
  }
  if (/front|user|selfie|facetime/.test(label) && !/back|rear|environment/.test(label)) {
    return 'user';
  }
  return fallbackFacing;
}

export function findAlternateVideoDevice(
  devices: Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[],
  currentDeviceId: string | undefined,
  targetFacing: CameraFacingMode
): Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'> | null {
  const videoInputs = devices.filter((d) => d.kind === 'videoinput' && Boolean(d.deviceId));
  if (videoInputs.length === 0) return null;

  const candidates = currentDeviceId
    ? videoInputs.filter((d) => d.deviceId !== currentDeviceId)
    : videoInputs;

  if (candidates.length === 0) return null;

  const targetPattern =
    targetFacing === 'environment'
      ? /back|rear|environment|world|external|main/i
      : /front|user|selfie|facetime/i;
  const oppositePattern =
    targetFacing === 'environment'
      ? /front|user|selfie|facetime/i
      : /back|rear|environment|world/i;

  const labelMatch = candidates.find(
    (d) => targetPattern.test(d.label || '') && !oppositePattern.test(d.label || '')
  );
  if (labelMatch) return labelMatch;

  if (currentDeviceId) {
    const currentIndex = videoInputs.findIndex((d) => d.deviceId === currentDeviceId);
    if (currentIndex >= 0 && videoInputs.length > 1) {
      return videoInputs[(currentIndex + 1) % videoInputs.length];
    }
  }

  return candidates[0];
}

function getVideoSender(pc: RTCPeerConnection): RTCRtpSender | null {
  const senders = typeof pc.getSenders === 'function' ? pc.getSenders() : [];
  const directSender = senders.find((s) => s.track && s.track.kind === 'video');
  if (directSender) return directSender;

  const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
  const videoTransceiver = transceivers.find(
    (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
  );
  return videoTransceiver?.sender || null;
}

function createFreshStreamWithVideoTrack(
  existingStream: MediaStream,
  oldTrack: MediaStreamTrack,
  newTrack: MediaStreamTrack
): MediaStream {
  const audioTracks = typeof existingStream.getAudioTracks === 'function' ? existingStream.getAudioTracks() : [];
  if (typeof MediaStream === 'function') {
    return new MediaStream([...audioTracks, newTrack]);
  }
  if (typeof existingStream.removeTrack === 'function') {
    existingStream.removeTrack(oldTrack);
  }
  if (typeof existingStream.addTrack === 'function') {
    existingStream.addTrack(newTrack);
  }
  return existingStream;
}

export interface SwitchCameraOptions {
  currentStream: MediaStream;
  currentFacing?: CameraFacingMode;
  preferredConstraints?: {
    width?: number;
    height?: number;
    frameRate?: number;
  };
  peerConnections?: RTCPeerConnection[];
}

export interface SwitchCameraResult {
  stream: MediaStream;
  facingMode: CameraFacingMode;
  switched: boolean;
  newTrack: MediaStreamTrack | null;
}

export async function switchCameraStream({
  currentStream,
  currentFacing = 'user',
  preferredConstraints,
  peerConnections = [],
}: SwitchCameraOptions): Promise<SwitchCameraResult> {
  const currentVideoTrack = currentStream.getVideoTracks()[0];
  if (!currentVideoTrack) {
    return {
      stream: currentStream,
      facingMode: currentFacing,
      switched: false,
      newTrack: null,
    };
  }

  // Capture current track metadata BEFORE stopping it (stopping clears getSettings() on many browsers/WebViews)
  let prevDeviceId: string | undefined;
  try {
    prevDeviceId =
      typeof currentVideoTrack.getSettings === 'function'
        ? currentVideoTrack.getSettings()?.deviceId
        : undefined;
  } catch {
    prevDeviceId = undefined;
  }

  const prevEnabled = currentVideoTrack.enabled !== false;
  const resolvedCurrentFacing = resolveTrackFacingMode(currentVideoTrack, currentFacing);
  const targetFacing: CameraFacingMode = resolvedCurrentFacing === 'user' ? 'environment' : 'user';

  const devices = await enumerateMediaDevices();
  const alternateDevice = findAlternateVideoDevice(devices, prevDeviceId, targetFacing);

  // Release the active camera hardware before acquiring the opposite camera (critical on Android/iOS)
  try {
    currentVideoTrack.stop();
  } catch {
    // ignore stop errors
  }

  const attempts: MediaTrackConstraints[] = [];
  if (preferredConstraints) {
    attempts.push({
      facingMode: { exact: targetFacing },
      ...(preferredConstraints.width ? { width: { ideal: preferredConstraints.width } } : {}),
      ...(preferredConstraints.height ? { height: { ideal: preferredConstraints.height } } : {}),
      ...(preferredConstraints.frameRate ? { frameRate: { ideal: preferredConstraints.frameRate } } : {}),
    });
  }
  attempts.push({ facingMode: { exact: targetFacing } });
  if (alternateDevice) {
    attempts.push({ deviceId: { exact: alternateDevice.deviceId } });
  }
  attempts.push({ facingMode: targetFacing });

  let acquiredTrack: MediaStreamTrack | null = null;

  for (const videoConstraint of attempts) {
    try {
      const candidateStream = await requestMediaStream({
        audio: false,
        video: videoConstraint,
      });
      const candidateTrack = candidateStream.getVideoTracks()[0];
      if (!candidateTrack) {
        candidateStream.getTracks().forEach((t) => t.stop());
        continue;
      }

      let candidateDeviceId: string | undefined;
      try {
        candidateDeviceId =
          typeof candidateTrack.getSettings === 'function'
            ? candidateTrack.getSettings()?.deviceId
            : undefined;
      } catch {
        candidateDeviceId = undefined;
      }

      // If an alternate camera deviceId is known and this constraint still gave the same camera, try the explicit deviceId
      if (
        alternateDevice &&
        prevDeviceId &&
        candidateDeviceId &&
        candidateDeviceId === prevDeviceId &&
        !('deviceId' in videoConstraint)
      ) {
        candidateTrack.stop();
        continue;
      }

      acquiredTrack = candidateTrack;
      break;
    } catch {
      // Try next fallback strategy
    }
  }

  if (!acquiredTrack) {
    // Recover original camera so the user is not stuck with a stopped/black video feed
    const recoveryAttempts: (MediaTrackConstraints | boolean)[] = [];
    if (prevDeviceId) {
      recoveryAttempts.push({ deviceId: { exact: prevDeviceId } });
    }
    recoveryAttempts.push({ facingMode: resolvedCurrentFacing });
    recoveryAttempts.push(true);

    let recoveredTrack: MediaStreamTrack | null = null;
    for (const constraint of recoveryAttempts) {
      try {
        const recStream = await requestMediaStream({ audio: false, video: constraint });
        const recTrack = recStream.getVideoTracks()[0];
        if (recTrack) {
          recoveredTrack = recTrack;
          break;
        }
      } catch {
        // continue recovery
      }
    }

    if (recoveredTrack) {
      recoveredTrack.enabled = prevEnabled;
      for (const pc of peerConnections) {
        const sender = getVideoSender(pc);
        if (sender) {
          await sender.replaceTrack(recoveredTrack).catch(() => {});
        }
      }
      const recoveredStream = createFreshStreamWithVideoTrack(
        currentStream,
        currentVideoTrack,
        recoveredTrack
      );
      return {
        stream: recoveredStream,
        facingMode: resolvedCurrentFacing,
        switched: false,
        newTrack: recoveredTrack,
      };
    }

    return {
      stream: currentStream,
      facingMode: resolvedCurrentFacing,
      switched: false,
      newTrack: null,
    };
  }

  acquiredTrack.enabled = prevEnabled;
  const nextFacing = resolveTrackFacingMode(acquiredTrack, targetFacing);

  for (const pc of peerConnections) {
    const sender = getVideoSender(pc);
    if (sender) {
      await sender.replaceTrack(acquiredTrack).catch((err) => {
        console.warn('[MediaDevices] replaceTrack notice:', err);
      });
    }
  }

  const freshStream = createFreshStreamWithVideoTrack(currentStream, currentVideoTrack, acquiredTrack);
  return {
    stream: freshStream,
    facingMode: nextFacing,
    switched: true,
    newTrack: acquiredTrack,
  };
}

