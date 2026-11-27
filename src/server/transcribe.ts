import { GoogleGenAI, Type } from '@google/genai';

export interface TranscribeRequestBody {
  audioBase64: string;
  targetLanguage?: string;
  mimeType?: string;
}

export interface TranscribeResult {
  transcription: string;
  detectedLanguage?: string;
  translation?: string;
  source?: 'gemini';
}

const MAX_BODY_BYTES = 24 * 1024 * 1024; // 24MB JSON payload cap (~18MB audio)

const TARGET_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  bn: 'Bangla (Bengali)',
  hi: 'Hindi',
  ur: 'Urdu',
};

/**
 * Strip codec suffixes (e.g. "audio/webm;codecs=opus" -> "audio/webm") and normalize MIME types for Gemini inlineData.
 */
export function normalizeAudioMimeType(rawMime?: string): string {
  const base = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (!base || base === 'application/octet-stream') {
    return 'audio/webm';
  }
  if (base === 'audio/x-m4a' || base === 'audio/m4a') {
    return 'audio/mp4';
  }
  if (base === 'video/webm') {
    return 'audio/webm';
  }
  if (base === 'audio/x-wav') {
    return 'audio/wav';
  }
  if (base.startsWith('audio/')) {
    return base;
  }
  return 'audio/webm';
}

/**
 * Clean optional data URL prefix from base64 audio payload.
 */
export function stripBase64DataUrlPrefix(rawBase64: string): string {
  const trimmed = (rawBase64 || '').trim();
  const commaIdx = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIdx !== -1) {
    return trimmed.slice(commaIdx + 1).trim();
  }
  return trimmed;
}

/**
 * Safely parse JSON returned by gemini-3.5-transcribe (handles accidental markdown code fences or plain text).
 */
export function parseTranscriptionPayload(rawText?: string): TranscribeResult {
  const cleaned = (rawText || '').trim();
  if (!cleaned) {
    return { transcription: '' };
  }

  const withoutFences = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(withoutFences);
    if (parsed && typeof parsed === 'object') {
      return {
        transcription: typeof parsed.transcription === 'string' ? parsed.transcription.trim() : '',
        detectedLanguage: typeof parsed.detectedLanguage === 'string' ? parsed.detectedLanguage.trim() : undefined,
        translation: typeof parsed.translation === 'string' && parsed.translation.trim() ? parsed.translation.trim() : undefined,
      };
    }
  } catch {
    // Model returned plain text transcription directly
  }

  return { transcription: withoutFences };
}

function sendJson(res: any, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Server-side handler for voice message transcription via Gemini 3.5 Transcribe
 */
export async function handleTranscribe(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let aborted = false;

  req.on('data', (chunk: Buffer | string) => {
    if (aborted) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: 'Audio payload too large for transcription.' });
      return;
    }
    chunks.push(buf);
  });

  req.on('end', async () => {
    if (aborted) return;

    let body: TranscribeRequestBody = { audioBase64: '' };
    try {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      body = rawBody ? JSON.parse(rawBody) : { audioBase64: '' };
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON request body.' });
      return;
    }

    const cleanBase64 = stripBase64DataUrlPrefix(body.audioBase64);
    if (!cleanBase64) {
      sendJson(res, 400, { error: 'Missing audio data.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      sendJson(res, 503, {
        error: 'Voice transcription is unavailable: Gemini API key is not configured.',
        unavailable: true,
        reason: 'missing_api_key',
      });
      return;
    }

    const normalizedMimeType = normalizeAudioMimeType(body.mimeType);
    const targetLangName = body.targetLanguage ? TARGET_LANGUAGE_NAMES[body.targetLanguage] : undefined;

    const prompt = targetLangName
      ? `Transcribe this speech audio accurately in its original spoken language and detect the spoken language. If it is in a language other than ${targetLangName}, also translate it into ${targetLangName}. Return JSON matching { "transcription": "...", "detectedLanguage": "...", "translation": "..." }.`
      : `Transcribe this speech audio accurately in its original spoken language and detect the spoken language. Return JSON matching { "transcription": "...", "detectedLanguage": "..." }.`;

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMimeType,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcription: {
                type: Type.STRING,
                description: 'The transcribed speech text in its original language',
              },
              detectedLanguage: {
                type: Type.STRING,
                description: 'Detected spoken language name',
              },
              translation: {
                type: Type.STRING,
                description: 'Translation into target language if requested and different from spoken language',
              },
            },
            required: ['transcription'],
          },
        },
      });

      const parsed = parseTranscriptionPayload(response.text);
      sendJson(res, 200, {
        ...parsed,
        source: 'gemini',
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 502;
      console.warn('[Transcribe] Gemini API error:', err?.message || err);
      sendJson(res, status, {
        error: err?.message || 'Transcription failed.',
        unavailable: status === 401 || status === 403 || status === 429 || status >= 500,
      });
    }
  });
}
