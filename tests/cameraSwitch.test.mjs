import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  setMediaDevicesAdapter,
  switchCameraStream,
  webMediaDevicesAdapter,
} from '../src/services/mediaDevices.ts';

class MockTrack {
  constructor({ id, kind, label = '', deviceId = '', facingMode, enabled = true }) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this._deviceId = deviceId;
    this._facingMode = facingMode;
    this.enabled = enabled;
    this.readyState = 'live';
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
    this.readyState = 'ended';
    // Emulate browsers/WebViews that clear getSettings() after track.stop()
    this._facingMode = undefined;
  }

  getSettings() {
    if (this.stopped) return {};
    return {
      deviceId: this._deviceId,
      facingMode: this._facingMode,
    };
  }
}

class MockMediaStream {
  constructor(tracks = []) {
    this._tracks = [...tracks];
  }
  getTracks() {
    return [...this._tracks];
  }
  getVideoTracks() {
    return this._tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this._tracks.filter((t) => t.kind === 'audio');
  }
  addTrack(track) {
    this._tracks.push(track);
  }
  removeTrack(track) {
    this._tracks = this._tracks.filter((t) => t !== track);
  }
}

test('switchCameraStream switches front -> back -> front even when getSettings().facingMode is undefined and mobile requires stopping active track first', async () => {
  const OriginalMediaStream = globalThis.MediaStream;
  globalThis.MediaStream = MockMediaStream;

  let activeHardwareCamera = 'front-cam-id';
  const replacedTracks = [];
  const frontTrack1 = new MockTrack({
    id: 'vid-front-1',
    kind: 'video',
    label: 'camera2 1',
    deviceId: 'front-cam-id',
    facingMode: undefined, // Common on Android WebView
  });
  const audioTrack = new MockTrack({
    id: 'aud-1',
    kind: 'audio',
    label: 'Default Mic',
    deviceId: 'mic-1',
  });

  // Override stop so it releases hardware lock in our simulator
  const origFrontStop = frontTrack1.stop.bind(frontTrack1);
  frontTrack1.stop = () => {
    origFrontStop();
    if (activeHardwareCamera === 'front-cam-id') activeHardwareCamera = null;
  };

  const mockPc = {
    getSenders() {
      return [{ track: frontTrack1, replaceTrack: async (t) => replacedTracks.push(t) }];
    },
    getTransceivers() {
      return [];
    },
  };

  setMediaDevicesAdapter({
    isSupported: () => true,
    async enumerateDevices() {
      return [
        { kind: 'videoinput', deviceId: 'front-cam-id', label: 'Front Facing Camera' },
        { kind: 'videoinput', deviceId: 'back-cam-id', label: 'Back Facing Camera' },
      ];
    },
    async getUserMedia(constraints) {
      if (activeHardwareCamera !== null) {
        const err = new Error('Camera in use');
        err.name = 'NotReadableError';
        throw err;
      }
      const videoReq = constraints.video;
      // Simulate WebView rejecting facingMode.exact so it must use deviceId fallback
      if (typeof videoReq === 'object' && videoReq.facingMode && typeof videoReq.facingMode === 'object' && 'exact' in videoReq.facingMode) {
        const err = new Error('Overconstrained');
        err.name = 'OverconstrainedError';
        throw err;
      }
      if (typeof videoReq === 'object' && videoReq.deviceId?.exact === 'back-cam-id') {
        activeHardwareCamera = 'back-cam-id';
        const backTrack = new MockTrack({
          id: 'vid-back-1',
          kind: 'video',
          label: 'Back Facing Camera',
          deviceId: 'back-cam-id',
          facingMode: undefined,
        });
        const origStop = backTrack.stop.bind(backTrack);
        backTrack.stop = () => {
          origStop();
          if (activeHardwareCamera === 'back-cam-id') activeHardwareCamera = null;
        };
        return new MockMediaStream([backTrack]);
      }
      if (typeof videoReq === 'object' && videoReq.deviceId?.exact === 'front-cam-id') {
        activeHardwareCamera = 'front-cam-id';
        const frontTrack2 = new MockTrack({
          id: 'vid-front-2',
          kind: 'video',
          label: 'Front Facing Camera',
          deviceId: 'front-cam-id',
          facingMode: undefined,
        });
        return new MockMediaStream([frontTrack2]);
      }
      throw new Error('Unexpected constraint: ' + JSON.stringify(videoReq));
    },
  });

  try {
    const initialStream = new MockMediaStream([audioTrack, frontTrack1]);

    // Front -> Back
    const toBack = await switchCameraStream({
      currentStream: initialStream,
      currentFacing: 'user',
      peerConnections: [mockPc],
    });

    assert.equal(toBack.switched, true);
    assert.equal(toBack.facingMode, 'environment');
    assert.notEqual(toBack.stream, initialStream, 'Must return a fresh MediaStream reference for React/video rebind');
    assert.equal(toBack.stream.getAudioTracks().length, 1, 'Audio track must remain attached');
    assert.equal(toBack.stream.getVideoTracks()[0].id, 'vid-back-1');
    assert.equal(frontTrack1.stopped, true);
    assert.equal(replacedTracks[0].id, 'vid-back-1');

    // Back -> Front
    const backPc = {
      getSenders() {
        return [{ track: null, replaceTrack: async (t) => replacedTracks.push(t) }];
      },
      getTransceivers() {
        return [
          {
            receiver: { track: { kind: 'video' } },
            sender: { track: null, replaceTrack: async (t) => replacedTracks.push(t) },
          },
        ];
      },
    };

    const toFront = await switchCameraStream({
      currentStream: toBack.stream,
      currentFacing: toBack.facingMode,
      peerConnections: [backPc],
    });

    assert.equal(toFront.switched, true);
    assert.equal(toFront.facingMode, 'user');
    assert.equal(toFront.stream.getVideoTracks()[0].id, 'vid-front-2');
    assert.equal(replacedTracks[1].id, 'vid-front-2');
  } finally {
    setMediaDevicesAdapter(webMediaDevicesAdapter);
    if (OriginalMediaStream === undefined) {
      delete globalThis.MediaStream;
    } else {
      globalThis.MediaStream = OriginalMediaStream;
    }
  }
});

test('switchCameraStream recovers original camera gracefully on single-camera devices and preserves disabled video state', async () => {
  const OriginalMediaStream = globalThis.MediaStream;
  globalThis.MediaStream = MockMediaStream;

  const frontTrack = new MockTrack({
    id: 'vid-single-1',
    kind: 'video',
    label: 'Integrated Webcam',
    deviceId: 'only-cam',
    facingMode: 'user',
    enabled: false,
  });

  setMediaDevicesAdapter({
    isSupported: () => true,
    async enumerateDevices() {
      return [{ kind: 'videoinput', deviceId: 'only-cam', label: 'Integrated Webcam' }];
    },
    async getUserMedia(constraints) {
      const v = constraints.video;
      if (typeof v === 'object' && (v.facingMode === 'environment' || v.facingMode?.exact === 'environment')) {
        const err = new Error('No rear camera');
        err.name = 'OverconstrainedError';
        throw err;
      }
      return new MockMediaStream([
        new MockTrack({
          id: 'vid-single-recovered',
          kind: 'video',
          label: 'Integrated Webcam',
          deviceId: 'only-cam',
          facingMode: 'user',
        }),
      ]);
    },
  });

  try {
    const stream = new MockMediaStream([frontTrack]);
    const res = await switchCameraStream({
      currentStream: stream,
      currentFacing: 'user',
    });

    assert.equal(res.switched, false);
    assert.equal(res.facingMode, 'user');
    assert.equal(res.stream.getVideoTracks()[0].id, 'vid-single-recovered');
    assert.equal(res.stream.getVideoTracks()[0].enabled, false, 'Disabled camera state must be preserved');
  } finally {
    setMediaDevicesAdapter(webMediaDevicesAdapter);
    if (OriginalMediaStream === undefined) {
      delete globalThis.MediaStream;
    } else {
      globalThis.MediaStream = OriginalMediaStream;
    }
  }
});

test('ActiveCallScreen, ActiveGroupCallScreen, and webrtc.ts integrate switchCameraStream and facingMode preview handling', async () => {
  const [webrtcSrc, callSrc, groupCallSrc] = await Promise.all([
    readFile('src/lib/webrtc.ts', 'utf8'),
    readFile('src/components/ActiveCallScreen.tsx', 'utf8'),
    readFile('src/components/ActiveGroupCallScreen.tsx', 'utf8'),
  ]);

  assert.equal(webrtcSrc.includes('switchCameraStream'), true);
  assert.equal(webrtcSrc.includes('getFacingMode'), true);
  assert.equal(callSrc.includes('localFacingMode'), true);
  assert.equal(callSrc.includes("localFacingMode === 'user'"), true);
  assert.equal(groupCallSrc.includes('switchCameraStream'), true);
});
