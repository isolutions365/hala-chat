/**
 * Pluggable Media Devices Service (Camera & Microphone)
 * Abstracts navigator.mediaDevices.getUserMedia behind a clean adapter interface
 * for easy swapping with Capacitor Camera/Microphone or Electron native streams.
 */

export interface MediaDevicesAdapter {
  isSupported(): boolean;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
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
