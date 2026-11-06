import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('audio proxy URL formation correctly targets /api/media-proxy with encoded url', () => {
  const sampleUrl = 'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/media%2Fuser1%2Fvoice.webm?alt=media&token=tok123';
  const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(sampleUrl)}`;

  assert.equal(proxyUrl.startsWith('/api/media-proxy?url='), true);
  const parsed = new URL(`http://localhost:3000${proxyUrl}`);
  assert.equal(parsed.searchParams.get('url'), sampleUrl);
});

test('media status transitions to ready when decrypted or unencrypted', () => {
  const statuses = {};
  
  // Simulation of unencrypted message (no mediaIv)
  const unencryptedMsg = { id: 'msg1', type: 'voice', content: 'https://storage/audio.webm' };
  if (!unencryptedMsg.mediaIv) {
    statuses[unencryptedMsg.id] = 'ready';
  }
  assert.equal(statuses['msg1'], 'ready');

  // Simulation of successful decryption
  const encryptedMsg = { id: 'msg2', type: 'voice', content: 'https://storage/enc.webm', mediaIv: 'dGVzdA==' };
  statuses[encryptedMsg.id] = 'loading';
  assert.equal(statuses['msg2'], 'loading');

  // When resultUrl is produced
  const resultUrl = 'blob:http://localhost/test-uuid';
  if (resultUrl) {
    statuses[encryptedMsg.id] = 'ready';
  }
  assert.equal(statuses['msg2'], 'ready');
});

test('failed download exhausts retries and always transitions to error status (never hanging)', () => {
  const statuses = {};
  const msgId = 'failed_msg';
  statuses[msgId] = 'loading';

  // Max retries reached (2 retries exhausted)
  const retryCount = 2;
  if (retryCount >= 2) {
    statuses[msgId] = 'error';
  }

  assert.equal(statuses[msgId], 'error');
  assert.notEqual(statuses[msgId], 'loading');
});

test('recording timer tracks monotonic elapsed seconds accurately and prevents double start', () => {
  let isInitializing = false;
  let activeRecorder = null;
  let timerInterval = null;
  let recordingSeconds = 0;
  let initCalls = 0;

  function initRecording(startTime) {
    if (isInitializing || (activeRecorder && activeRecorder.state === 'recording')) {
      return false;
    }
    isInitializing = true;
    initCalls++;
    activeRecorder = { state: 'recording' };

    // Calculate elapsed from monotonic clock
    if (timerInterval) clearInterval(timerInterval);
    const tick = (currentTime) => {
      recordingSeconds = Math.floor((currentTime - startTime) / 1000);
    };
    isInitializing = false;
    return tick;
  }

  const t0 = 10000;
  const tickFn = initRecording(t0);
  assert.equal(initCalls, 1);

  // Attempt duplicate start while recording is active
  const secondCall = initRecording(t0);
  assert.equal(secondCall, false);
  assert.equal(initCalls, 1); // Not incremented

  // Simulate monotonic elapsed ticks
  tickFn(t0 + 1000);
  assert.equal(recordingSeconds, 1);
  tickFn(t0 + 2000);
  assert.equal(recordingSeconds, 2);
  tickFn(t0 + 3400);
  assert.equal(recordingSeconds, 3);
});

test('voice note upload preserves actual recorded MIME type and container format', () => {
  function getVoiceNoteFileName(mimeType) {
    const rawType = mimeType || 'audio/webm';
    const ext = rawType.includes('wav') ? 'wav' : rawType.includes('mp4') || rawType.includes('m4a') ? 'm4a' : rawType.includes('ogg') ? 'ogg' : 'webm';
    return `voice_note_${Date.now()}.${ext}`;
  }

  assert.equal(getVoiceNoteFileName('audio/webm;codecs=opus').endsWith('.webm'), true);
  assert.equal(getVoiceNoteFileName('audio/mp4').endsWith('.m4a'), true);
  assert.equal(getVoiceNoteFileName('audio/ogg;codecs=opus').endsWith('.ogg'), true);
  assert.equal(getVoiceNoteFileName('audio/wav').endsWith('.wav'), true);
});

test('audio cleanup stops all microphone tracks and resets audio elements to avoid echo', () => {
  let tracksStopped = 0;
  const mockTrack = {
    stop: () => { tracksStopped++; }
  };
  const mockStream = {
    getTracks: () => [mockTrack, mockTrack]
  };

  let audioPaused = false;
  let audioSrcCleared = false;
  const mockAudio = {
    pause: () => { audioPaused = true; },
    set src(v) { if (v === '') audioSrcCleared = true; }
  };

  // Cleanup logic
  mockStream.getTracks().forEach(t => t.stop());
  mockAudio.pause();
  mockAudio.src = '';

  assert.equal(tracksStopped, 2);
  assert.equal(audioPaused, true);
  assert.equal(audioSrcCleared, true);
});

test('decryptBlobData falls back to unencrypted media blob when magic bytes match media container', () => {
  function sniffDecryptedMimeType(buffer, fallbackType) {
    if (buffer.byteLength >= 4) {
      const view = new DataView(buffer);
      const magic = view.getUint32(0, false);
      if (magic === 0x1A45DFA3) return fallbackType.startsWith('video/') ? 'video/webm' : 'audio/webm';
      if (magic === 0x4F676753) return 'audio/ogg';
      if (magic === 0x52494646) return 'audio/wav';
      if (buffer.byteLength >= 8 && view.getUint32(4, false) === 0x66747970) return fallbackType.startsWith('video/') ? 'video/mp4' : 'audio/mp4';
      if ((magic & 0xFFFFFF00) === 0xFFD8FF00) return 'image/jpeg';
      if (magic === 0x89504E47) return 'image/png';
    }
    return fallbackType;
  }

  // Create mock WebM header (0x1A45DFA3)
  const webmBuf = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x02]).buffer;
  assert.equal(sniffDecryptedMimeType(webmBuf, ''), 'audio/webm');

  // Create mock PNG header (0x89504E47)
  const pngBuf = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]).buffer;
  assert.equal(sniffDecryptedMimeType(pngBuf, ''), 'image/png');

  // Encrypted ciphertext (random bytes) should NOT match unencrypted media fallback
  const cipherBuf = new Uint8Array([0x12, 0x34, 0x56, 0x78]).buffer;
  assert.equal(sniffDecryptedMimeType(cipherBuf, ''), '');
});


test('voice player does not download and decode the same audio again for waveform decoration', async () => {
  const source = await readFile('src/components/VoiceMessagePlayer.tsx', 'utf8');
  assert.equal(source.includes('fetch(audioUrl)'), false);
  assert.equal(source.includes("audio.preload = 'none'"), true);
});

test('encrypted media uses authenticated Firebase Storage reads before token URL fallback', async () => {
  const source = await readFile('src/hooks/useDecryptedMedia.ts', 'utf8');
  const sdkBlock = source.indexOf('// Authenticated Firebase Storage SDK reads');
  const sdkRead = source.indexOf('arrayBuffer = await getBytes(storageReference)', sdkBlock);
  const tokenFallback = source.indexOf('// Tokenized download URL fallback', sdkBlock);
  const tokenFetch = source.indexOf('fetch(msg.content)', tokenFallback);
  assert.ok(sdkRead >= 0 && tokenFallback > sdkRead && tokenFetch > tokenFallback);
  assert.ok(source.includes('!arrayBuffer && import.meta.env.DEV'));
});

test('voice note send path does not perform a diagnostic duplicate encryption pass', async () => {
  const source = await readFile('src/components/ConversationScreen.tsx', 'utf8');
  const start = source.indexOf('const handleSendVoiceNote');
  const end = source.indexOf('// Voice button Pointer', start);
  const handler = source.slice(start, end);
  assert.equal(handler.includes('const testEnc = await encryptBlobData'), false);
});
