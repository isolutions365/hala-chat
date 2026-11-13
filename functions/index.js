const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const sharp = require('sharp');
const { Readable } = require('stream');
const { GoogleGenAI, Type } = require('@google/genai');

admin.initializeApp();

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

const REGION = 'europe-west1';
const DATABASE_ID = 'ai-studio-hala-efac1993-f3c4-44ed-b676-ccb87cb486aa';
const db = getFirestore(DATABASE_ID);
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/**
 * Generic Hashing Helper
 */
function hashData(data, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(data, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

/**
 * Resend Email Helper
 */
async function sendRecoveryEmail(apiKey, to, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Hala Messenger <onboarding@resend.dev>',
      to: [to],
      subject: 'Your Hala Recovery Code',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Hala Recovery</h2>
          <p>You requested a code to reset your Two-step verification PIN.</p>
          <div style="background: #f4f4f4; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${code}
          </div>
          <p>This code expires in 10 minutes and can only be used once.</p>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Email failed: ${errText}`);
  }
}

/**
 * Helper to cleanup invalid/expired tokens
 */
async function cleanupTokens(uid, tokens, results) {
  const tokensToDelete = [];
  results.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error?.code;
      if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
        tokensToDelete.push(tokens[idx]);
      }
    }
  });

  if (tokensToDelete.length > 0) {
    const batch = db.batch();
    tokensToDelete.forEach(t => {
      batch.delete(db.collection('users').doc(uid).collection('fcmTokens').doc(t));
    });
    await batch.commit();
  }
}

// 1. Call Notification (v2)
exports.sendCallNotification = onDocumentCreated({
  document: 'calls/{callId}',
  database: DATABASE_ID,
  region: REGION
}, async (event) => {
  const snap = event.data;
  if (!snap) return null;
  const callData = snap.data();
  const receiverId = callData.calleeId;
  if (!receiverId) return null;

  const tokensSnapshot = await db.collection('users').doc(receiverId).collection('fcmTokens').get();
  const tokens = tokensSnapshot.docs.map(doc => doc.id);

  if (tokens.length === 0) return null;

  const message = {
    notification: {
      title: 'Incoming call',
      body: `Call from ${callData.callerName || 'Someone'}`
    },
    data: {
      callId: event.params.callId,
      type: callData.type || 'voice'
    },
    android: {
      priority: 'high'
    },
    apns: {
      payload: {
        aps: {
          contentAvailable: true,
        }
      }
    },
    tokens: tokens
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  await cleanupTokens(receiverId, tokens, response.responses);
  return null;
});

// 2. Chat Message Notification (v2)
exports.sendChatMessageNotification = onDocumentCreated({
  document: 'chats/{chatId}/messages/{messageId}',
  database: DATABASE_ID,
  region: REGION
}, async (event) => {
  const snap = event.data;
  if (!snap) return null;
  const messageData = snap.data();
  const chatId = event.params.chatId;

  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) return null;
  const chatData = chatSnap.data();
  
  const recipients = (chatData.participants || []).filter(id => id !== messageData.senderId);

  for (const receiverId of recipients) {
    const tokensSnapshot = await db.collection('users').doc(receiverId).collection('fcmTokens').get();
    const tokens = tokensSnapshot.docs.map(doc => doc.id);

    if (tokens.length > 0) {
      const message = {
        notification: {
          title: messageData.senderName || 'New message',
          body: 'New message'
        },
        data: {
          chatId: chatId,
          messageId: event.params.messageId
        },
        tokens: tokens
      };
      const response = await admin.messaging().sendEachForMulticast(message);
      await cleanupTokens(receiverId, tokens, response.responses);
    }
  }
  return null;
});

// 3. Set PIN
exports.setPin = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { pin } = request.data;
  if (!pin || pin.length !== 6) throw new HttpsError('invalid-argument', 'PIN must be 6 digits.');

  const salt = crypto.randomBytes(16).toString('hex');
  const hashed = await hashData(pin, salt);

  await db.collection('users_private').doc(request.auth.uid).set({
    pinHash: hashed,
    pinSalt: salt,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
});

// 4. Verify PIN
exports.verifyPin = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { pin } = request.data;
  const uid = request.auth.uid;

  const doc = await db.collection('users_private').doc(uid).get();
  if (!doc.exists || !doc.data().pinHash) throw new HttpsError('not-found', 'PIN not set.');

  const data = doc.data();
  const now = Date.now();

  if (data.lockedUntil && data.lockedUntil > now) {
    throw new HttpsError('resource-exhausted', 'Account is locked. Try again later.');
  }

  const hashed = await hashData(pin, data.pinSalt);
  if (hashed === data.pinHash) {
    await db.collection('users_private').doc(uid).update({
      failedAttempts: 0,
      lockedUntil: null
    });
    return { success: true };
  } else {
    const attempts = (data.failedAttempts || 0) + 1;
    let lockedUntil = null;
    if (attempts >= 5) {
      const minutes = attempts >= 15 ? 1440 : (attempts >= 10 ? 60 : 15);
      lockedUntil = now + minutes * 60000;
    }
    await db.collection('users_private').doc(uid).update({
      failedAttempts: attempts,
      lockedUntil: lockedUntil
    });
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  }
});

// 5. Save Key Backup
exports.saveKeyBackup = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { backup } = request.data;
  if (!backup || !backup.blob) throw new HttpsError('invalid-argument', 'Invalid backup data.');

  await db.collection('users_private').doc(request.auth.uid).set({
    keyBackup: {
      ...backup,
      updatedAt: FieldValue.serverTimestamp()
    }
  }, { merge: true });

  return { success: true };
});

// 6. Get Key Backup
exports.getKeyBackup = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  
  const doc = await db.collection('users_private').doc(request.auth.uid).get();
  if (!doc.exists || !doc.data().keyBackup) throw new HttpsError('not-found', 'Backup not found.');

  return { backup: doc.data().keyBackup };
});

// 7. Set Recovery Email
exports.setRecoveryEmail = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { email } = request.data;
  if (!email || !email.includes('@')) throw new HttpsError('invalid-argument', 'Invalid email address.');

  const uid = request.auth.uid;
  const batch = db.batch();

  batch.set(db.collection('users_private').doc(uid), {
    recoveryEmail: email,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  batch.set(db.collection('users').doc(uid), {
    two_factor: {
      recoveryEmail: email
    }
  }, { merge: true });

  await batch.commit();
  return { success: true };
});

// 8. Start PIN Reset (Send Code)
exports.startPinReset = onCall({ region: REGION, secrets: [RESEND_API_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const uid = request.auth.uid;
  const apiKey = RESEND_API_KEY.value();
  
  const userPrivRef = db.collection('users_private').doc(uid);
  const doc = await userPrivRef.get();
  
  if (!doc.exists || !doc.data().recoveryEmail) {
    throw new HttpsError('failed-precondition', 'Recovery email not set.');
  }

  const data = doc.data();
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  const recentRequests = (data.resetRequestTimestamps || []).filter(ts => ts > oneHourAgo);
  if (recentRequests.length >= 3) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again in an hour.');
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedCode = await hashData(code, salt);
  const expiresAt = now + 10 * 60000;

  await userPrivRef.update({
    resetCode: {
      hash: hashedCode,
      salt: salt,
      expiresAt: expiresAt
    },
    resetRequestTimestamps: [...recentRequests, now]
  });

  await sendRecoveryEmail(apiKey, data.recoveryEmail, code);

  return { 
    success: true, 
    email: data.recoveryEmail.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)) 
  };
});

// 9. Reset PIN with Code
exports.resetPinWithCode = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { code, newPin } = request.data;
  if (!code || !newPin || newPin.length !== 6) throw new HttpsError('invalid-argument', 'Invalid input.');

  const userPrivRef = db.collection('users_private').doc(request.auth.uid).get();
  const doc = await userPrivRef;
  if (!doc.exists || !doc.data().resetCode) throw new HttpsError('not-found', 'No reset request found.');

  const data = doc.data();
  const now = Date.now();

  if (data.resetCode.expiresAt < now) {
    throw new HttpsError('permission-denied', 'Code expired.');
  }

  const verifyHash = await hashData(code, data.resetCode.salt);
  if (verifyHash !== data.resetCode.hash) {
    throw new HttpsError('permission-denied', 'Invalid code.');
  }

  const pinSalt = crypto.randomBytes(16).toString('hex');
  const pinHash = await hashData(newPin, pinSalt);

  await db.collection('users_private').doc(request.auth.uid).update({
    pinHash: pinHash,
    pinSalt: pinSalt,
    failedAttempts: 0,
    lockedUntil: null,
    resetCode: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return { success: true };
});

// 10. Transcribe Voice (Callable)
exports.transcribeVoice = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { audioBase64, targetLanguage, mimeType } = request.data || {};
  if (!audioBase64) throw new HttpsError('invalid-argument', 'Missing audio data.');

  const ai = getGeminiClient();
  if (!ai) {
    throw new HttpsError('failed-precondition', 'Transcription API key is not configured.');
  }

  try {
    const cleanBase64 = typeof audioBase64 === 'string' && audioBase64.startsWith('data:') && audioBase64.includes(',')
      ? audioBase64.slice(audioBase64.indexOf(',') + 1).trim()
      : String(audioBase64).trim();
    const baseMime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase() || 'audio/webm';
    const normalizedMimeType = baseMime.startsWith('audio/') ? baseMime : 'audio/webm';

    const langNames = {
      en: 'English',
      ar: 'Arabic',
      bn: 'Bangla (Bengali)',
      hi: 'Hindi',
      ur: 'Urdu',
    };
    const targetLangName = langNames[targetLanguage];

    const prompt = targetLangName
      ? `Transcribe this speech audio accurately. Detect the spoken language. Provide the transcription in the original language. Also provide the translation into ${targetLangName} if it is in another language. Return JSON format: { "transcription": "...", "detectedLanguage": "...", "translation": "..." }.`
      : `Transcribe this speech audio accurately in its original spoken language. Detect the spoken language. Return JSON format: { "transcription": "...", "detectedLanguage": "..." }.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: normalizedMimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING, description: "The transcribed speech text" },
            detectedLanguage: { type: Type.STRING, description: "Detected language name" },
            translation: { type: Type.STRING, description: "Translation of the speech text if target language was specified" }
          },
          required: ["transcription"]
        }
      }
    });

    const responseText = (response.text || '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const resultData = JSON.parse(responseText);
    return resultData;
  } catch (err) {
    console.warn('Transcription failed:', err?.message || err);
    throw new HttpsError('unavailable', err?.message || 'Transcription temporarily unavailable.');
  }
});

// ==========================================
// 11. HTTPS Express App for /api/* Routes
// ==========================================
const app = express();
app.use(express.json({ limit: '25mb' }));

const allowedOrigins = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.run.app') || origin.includes('localhost') || origin.includes('web.app') || origin.includes('firebaseapp.com')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Range', 'Content-Type', 'Accept', 'X-Preload-Url', 'X-Request-ID', 'X-Media-Resolution', 'Authorization']
}));

// LRU cache for media proxy
const MAX_LRU_ENTRIES = 150;
const MAX_CACHEABLE_FILE_SIZE = 15 * 1024 * 1024;
const LRU_TTL_MS = 24 * 60 * 60 * 1000;
const mediaLRUCache = new Map();

function getLRUCacheKey(url, range, res) {
  const parts = [url];
  if (range) parts.push(`range:${range}`);
  if (res) parts.push(`res:${res}`);
  return parts.join('::');
}

function getFromLRUCache(key) {
  const entry = mediaLRUCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > LRU_TTL_MS) {
    mediaLRUCache.delete(key);
    return null;
  }
  mediaLRUCache.delete(key);
  mediaLRUCache.set(key, entry);
  return entry;
}

function putInLRUCache(key, entry) {
  if (entry.buffer.byteLength > MAX_CACHEABLE_FILE_SIZE) return;
  if (mediaLRUCache.has(key)) {
    mediaLRUCache.delete(key);
  } else if (mediaLRUCache.size >= MAX_LRU_ENTRIES) {
    const oldestKey = mediaLRUCache.keys().next().value;
    if (oldestKey) mediaLRUCache.delete(oldestKey);
  }
  mediaLRUCache.set(key, entry);
}

// Media Proxy Route
const handleMediaProxyRoute = async (req, res) => {
  try {
    const urlParam = req.query.url;
    const resParam = (req.query.res || req.headers?.['x-media-resolution'] || 'high').toLowerCase();
    const isLowRes = resParam === 'low';

    if (!urlParam) {
      res.status(400).type('plain').send('Missing url parameter');
      return;
    }
    const parsed = new URL(urlParam);
    if (!parsed.hostname.endsWith('firebasestorage.googleapis.com') && !parsed.hostname.endsWith('storage.googleapis.com')) {
      res.status(403).type('plain').send('Forbidden host');
      return;
    }

    const rangeHeader = req.headers?.range || req.headers?.['range'];
    const cacheKey = getLRUCacheKey(urlParam, rangeHeader, resParam);

    const cachedEntry = getFromLRUCache(cacheKey);
    if (cachedEntry) {
      res.status(cachedEntry.statusCode);
      res.setHeader('Content-Type', cachedEntry.contentType);
      res.setHeader('Content-Length', cachedEntry.contentLength);
      if (cachedEntry.contentRange) res.setHeader('Content-Range', cachedEntry.contentRange);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('X-Proxy-Cache', 'HIT');
      res.send(cachedEntry.buffer);
      return;
    }

    const fetchHeaders = {};
    if (rangeHeader) fetchHeaders['range'] = rangeHeader;

    const response = await fetch(urlParam, { headers: fetchHeaders });
    if (!response.ok && response.status !== 206) {
      const errText = await response.text().catch(() => '');
      res.status(response.status).type('plain').send(`Upstream error ${response.status}: ${errText}`);
      return;
    }

    res.status(response.status);
    let contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (contentType.startsWith('video/')) contentType = 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Proxy-Cache', 'MISS');

    if (isLowRes && !rangeHeader && contentType.startsWith('image/')) {
      try {
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        const downscaledBuffer = await sharp(inputBuffer)
          .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 60, progressive: true })
          .toBuffer();

        res.status(200).type('image/jpeg');
        res.setHeader('Content-Length', downscaledBuffer.byteLength.toString());
        res.send(downscaledBuffer);

        putInLRUCache(cacheKey, {
          buffer: downscaledBuffer,
          contentType: 'image/jpeg',
          contentLength: downscaledBuffer.byteLength.toString(),
          statusCode: 200,
          cachedAt: Date.now(),
        });
        return;
      } catch {}
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).type('plain').send(err?.message || 'Proxy error');
    }
  }
};

// Quick Replies Route
function generateSmartFallbacks(text, language) {
  const isArabic = /[\u0600-\u06FF]/.test(text) || language === 'ar';
  const clean = text.trim().toLowerCase();
  if (isArabic) {
    if (/[؟?]/.test(text) || /^(هل|متى|وين|أين|كيف|شو|إيش|مين|من)/.test(clean)) {
      return ['نعم بالتأكيد 👍', 'لا، للأسف 🙏', 'سأتحقق وأخبرك ⏳'];
    }
    if (/سلام|مرحبا|أهلا|صباح|مساء|يا هلا/.test(clean)) {
      return ['وعليكم السلام ورحمة الله 👋', 'أهلاً وسهلاً بك!', 'حياك الله، كيف حالك؟'];
    }
    if (/شكرا|تسلم|يعطيك|جزاك|مشكور/.test(clean)) {
      return ['عفواً، بأي وقت! 🌸', 'الله يسلمك ويعافيك', 'في خدمتك دائماً 👍'];
    }
    return ['تمام، متفق معك 👍', 'شكراً لك على التوضيح', 'سأرد عليك بعد قليل'];
  }
  if (/\?/.test(text) || /^(is|are|do|does|can|could|would|will|what|when|where|why|how)/i.test(clean)) {
    return ['Yes, definitely! 👍', 'Not right now 🙏', 'Let me check and get back to you'];
  }
  if (/(hi|hello|hey|good morning|good evening)/i.test(clean)) {
    return ['Hello! How are you? 👋', 'Hey there! 😊', 'Good to hear from you!'];
  }
  if (/(thanks|thank you|appreciate)/i.test(clean)) {
    return ['You are welcome! 😊', 'Anytime! 👍', 'Glad to help!'];
  }
  return ['Sounds good! 👍', 'Got it, thanks!', 'Talk to you soon!'];
}

const handleQuickRepliesRoute = async (req, res) => {
  try {
    const { messageText, language, senderName } = req.body || {};
    if (!messageText || !messageText.trim()) {
      res.status(400).json({ error: 'Missing messageText parameter' });
      return;
    }

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try { apiKey = GEMINI_API_KEY.value(); } catch {}
    }

    if (!apiKey) {
      const fallbackReplies = generateSmartFallbacks(messageText, language);
      res.json({ replies: fallbackReplies, source: 'fallback' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Last received message from ${senderName || 'user'}: "${messageText}". Language context: ${language || 'auto'}. Suggest 3 quick reply options for me to reply to this message.`,
      config: {
        systemInstruction: `You are an AI assistant built into the Hala chat messaging app. Generate exactly 3 short, natural, conversational quick reply suggestions for the user to respond to the last received message.
Rules:
1. The replies must directly address the sender's message.
2. Keep each reply concise: 1 to 5 words maximum.
3. Match the language of the message: if Arabic, write natural Arabic replies. If English, write English replies.
4. Provide diverse sentiment options.
5. Output MUST be a JSON array containing exactly 3 strings.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    });

    let replies = [];
    try {
      const text = response.text || '[]';
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        replies = parsed.map(item => String(item).trim()).filter(Boolean).slice(0, 3);
      }
    } catch {}

    if (replies.length < 3) {
      const fallbacks = generateSmartFallbacks(messageText, language);
      while (replies.length < 3 && fallbacks.length > 0) {
        const next = fallbacks.shift();
        if (next && !replies.includes(next)) replies.push(next);
      }
    }

    res.json({ replies: replies.slice(0, 3), source: 'gemini' });
  } catch (err) {
    const fallbackReplies = generateSmartFallbacks(req.body?.messageText || '', req.body?.language);
    res.json({ replies: fallbackReplies, source: 'fallback', error: err?.message });
  }
};

// Transcribe Route
const handleTranscribeRoute = async (req, res) => {
  try {
    const { audioBase64, targetLanguage, mimeType } = req.body || {};
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audio data.' });
      return;
    }

    const cleanBase64 = String(audioBase64).trim().includes(',') 
      ? String(audioBase64).trim().split(',')[1] 
      : String(audioBase64).trim();

    const baseMime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase() || 'audio/webm';
    const normalizedMimeType = baseMime.startsWith('audio/') ? baseMime : 'audio/webm';

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try { apiKey = GEMINI_API_KEY.value(); } catch {}
    }

    if (!apiKey) {
      res.status(503).json({ error: 'Voice transcription is unavailable: Gemini API key is not configured.', unavailable: true });
      return;
    }

    const langNames = { en: 'English', ar: 'Arabic', bn: 'Bangla (Bengali)', hi: 'Hindi', ur: 'Urdu' };
    const targetLangName = targetLanguage ? langNames[targetLanguage] : undefined;

    const prompt = targetLangName
      ? `Transcribe this speech audio accurately in its original spoken language and detect the spoken language. Also translate it into ${targetLangName}. Return JSON matching { "transcription": "...", "detectedLanguage": "...", "translation": "..." }.`
      : `Transcribe this speech audio accurately in its original spoken language and detect the spoken language. Return JSON matching { "transcription": "...", "detectedLanguage": "..." }.`;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: normalizedMimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING },
            detectedLanguage: { type: Type.STRING },
            translation: { type: Type.STRING },
          },
          required: ['transcription'],
        },
      },
    });

    const cleaned = (response.text || '{}').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    res.json({ ...parsed, source: 'gemini' });
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Transcription failed.', unavailable: true });
  }
};

app.get('/api/media-proxy', handleMediaProxyRoute);
app.get('/media-proxy', handleMediaProxyRoute);
app.post('/api/quick-replies', handleQuickRepliesRoute);
app.post('/quick-replies', handleQuickRepliesRoute);
app.post('/api/transcribe', handleTranscribeRoute);
app.post('/transcribe', handleTranscribeRoute);

exports.api = onRequest({
  region: REGION,
  secrets: [GEMINI_API_KEY],
  timeoutSeconds: 60,
  memory: '512MB'
}, app);
