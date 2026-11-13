import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
  handleTranscribe,
  normalizeAudioMimeType,
  parseTranscriptionPayload,
  stripBase64DataUrlPrefix,
} from '../src/server/transcribe.ts';

function invokeHandler(method, bodyObj) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;

    const headers = {};
    let finished = false;
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        headers[k.toLowerCase()] = v;
      },
      end(chunk = '') {
        if (finished) return;
        finished = true;
        resolve({
          statusCode: res.statusCode,
          headers,
          body: chunk ? JSON.parse(chunk) : null,
        });
      },
    };

    handleTranscribe(req, res);

    if (bodyObj !== undefined) {
      req.emit('data', Buffer.from(JSON.stringify(bodyObj)));
    }
    req.emit('end');
  });
}

test('normalizeAudioMimeType strips codecs and normalizes browser audio formats', () => {
  assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/ogg; codecs=opus'), 'audio/ogg');
  assert.equal(normalizeAudioMimeType('audio/x-m4a'), 'audio/mp4');
  assert.equal(normalizeAudioMimeType('video/webm'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('application/octet-stream'), 'audio/webm');
  assert.equal(normalizeAudioMimeType(''), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/mp3'), 'audio/mp3');
});

test('stripBase64DataUrlPrefix strips data URI prefix safely', () => {
  assert.equal(
    stripBase64DataUrlPrefix('data:audio/webm;codecs=opus;base64,SGVsbG8='),
    'SGVsbG8='
  );
  assert.equal(stripBase64DataUrlPrefix('  SGVsbG8=  '), 'SGVsbG8=');
});

test('parseTranscriptionPayload parses JSON, fenced JSON, and plain text', () => {
  assert.deepEqual(
    parseTranscriptionPayload('{"transcription":"مرحبا","detectedLanguage":"Arabic","translation":"Hello"}'),
    { transcription: 'مرحبا', detectedLanguage: 'Arabic', translation: 'Hello' }
  );
  assert.deepEqual(
    parseTranscriptionPayload('```json\n{"transcription":"Test message"}\n```'),
    { transcription: 'Test message', detectedLanguage: undefined, translation: undefined }
  );
  assert.deepEqual(parseTranscriptionPayload('Plain speech text'), {
    transcription: 'Plain speech text',
  });
});

test('handleTranscribe returns 400 for missing audioBase64 and 503 JSON when GEMINI_API_KEY is missing', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const missingRes = await invokeHandler('POST', { targetLanguage: 'en' });
    assert.equal(missingRes.statusCode, 400);
    assert.equal(missingRes.body.error, 'Missing audio data.');

    const noKeyRes = await invokeHandler('POST', {
      audioBase64: 'SGVsbG8=',
      mimeType: 'audio/webm;codecs=opus',
      targetLanguage: 'en',
    });
    assert.equal(noKeyRes.statusCode, 503);
    assert.equal(noKeyRes.body.unavailable, true);
    assert.equal(noKeyRes.body.reason, 'missing_api_key');
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});
