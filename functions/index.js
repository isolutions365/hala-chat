const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
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
const CF_TURN_KEY_ID = defineSecret('CF_TURN_KEY_ID');
const CF_TURN_API_TOKEN = defineSecret('CF_TURN_API_TOKEN');

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

const VAULT_FIELDS = [
  'pinHash',
  'pinSalt',
  'failedAttempts',
  'lockedUntil',
  'resetCode',
  'resetRequestTimestamps',
  'resetAttempts',
  'keyBackup',
  'recoveryEmail',
];
const LEGACY_CLIENT_RESET_FIELDS = ['pinResetCode', 'pinResetExpires'];
const BACKUP_SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashSha256SessionToken(uid, token) {
  return crypto.createHash('sha256').update(`${uid}:${token}`).digest('hex');
}

async function verifyStoredPinHash(pin, storedHash, storedSalt) {
  if (typeof pin !== 'string' || typeof storedHash !== 'string' || typeof storedSalt !== 'string') {
    return false;
  }
  // Support legacy client-written 64-char SHA-256 hashes alongside scrypt (128-char hex)
  const candidate = storedHash.length === 64
    ? crypto.createHash('sha256').update(`${storedSalt}:${pin}`).digest('hex')
    : await hashData(pin, storedSalt);
  return timingSafeEqualHex(candidate, storedHash);
}

async function getOrMigrateUserVault(uid) {
  const vaultRef = db.collection('users_vault').doc(uid);
  const privRef = db.collection('users_private').doc(uid);

  return db.runTransaction(async (tx) => {
    const [vaultSnap, privSnap] = await Promise.all([tx.get(vaultRef), tx.get(privRef)]);
    const vaultData = vaultSnap.exists ? { ...(vaultSnap.data() || {}) } : {};
    const privData = privSnap.exists ? (privSnap.data() || {}) : {};

    const toCopy = {};
    const toDelete = {};
    let hasMigration = false;

    for (const field of VAULT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(privData, field) && privData[field] !== undefined) {
        hasMigration = true;
        toDelete[field] = FieldValue.delete();
        if (!Object.prototype.hasOwnProperty.call(vaultData, field) || vaultData[field] === undefined) {
          toCopy[field] = privData[field];
          vaultData[field] = privData[field];
        }
      }
    }

    for (const field of LEGACY_CLIENT_RESET_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(privData, field) && privData[field] !== undefined) {
        hasMigration = true;
        toDelete[field] = FieldValue.delete();
      }
    }

    if (hasMigration) {
      if (Object.keys(toCopy).length > 0) {
        tx.set(vaultRef, {
          ...toCopy,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      tx.update(privRef, toDelete);
    }

    return {
      exists: vaultSnap.exists || Object.keys(toCopy).length > 0,
      data: vaultData,
      vaultRef,
    };
  });
}

// 3. Set PIN
exports.setPin = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { pin } = request.data || {};
  if (typeof pin !== 'string' || pin.length !== 6) throw new HttpsError('invalid-argument', 'PIN must be 6 digits.');

  const uid = request.auth.uid;
  const { vaultRef } = await getOrMigrateUserVault(uid);

  const salt = crypto.randomBytes(16).toString('hex');
  const hashed = await hashData(pin, salt);

  await vaultRef.set({
    pinHash: hashed,
    pinSalt: salt,
    failedAttempts: 0,
    lockedUntil: null,
    keyBackupSession: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
});

// 4. Verify PIN
exports.verifyPin = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { pin } = request.data || {};
  if (typeof pin !== 'string' || !pin) throw new HttpsError('invalid-argument', 'PIN is required.');
  const uid = request.auth.uid;

  const { vaultRef, data } = await getOrMigrateUserVault(uid);
  if (!data.pinHash || !data.pinSalt) throw new HttpsError('not-found', 'PIN not set.');

  const now = Date.now();

  if (data.lockedUntil && data.lockedUntil > now) {
    throw new HttpsError('resource-exhausted', 'Account is locked. Try again later.');
  }

  const isMatch = await verifyStoredPinHash(pin, data.pinHash, data.pinSalt);
  if (isMatch) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSha256SessionToken(uid, sessionToken);
    const expiresAt = now + BACKUP_SESSION_TTL_MS;

    await vaultRef.set({
      failedAttempts: 0,
      lockedUntil: null,
      keyBackupSession: {
        tokenHash,
        expiresAt,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true, sessionToken };
  } else {
    const attempts = (data.failedAttempts || 0) + 1;
    let lockedUntil = null;
    if (attempts >= 5) {
      const minutes = attempts >= 15 ? 1440 : (attempts >= 10 ? 60 : 15);
      lockedUntil = now + minutes * 60000;
    }
    await vaultRef.set({
      failedAttempts: attempts,
      lockedUntil: lockedUntil,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  }
});

// 5. Save Key Backup
exports.saveKeyBackup = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { backup } = request.data || {};
  if (!backup || typeof backup.blob !== 'string' || !backup.blob) {
    throw new HttpsError('invalid-argument', 'Invalid backup data.');
  }

  const uid = request.auth.uid;
  const { vaultRef } = await getOrMigrateUserVault(uid);

  await vaultRef.set({
    keyBackup: {
      blob: backup.blob,
      salt: backup.salt || '',
      iv: backup.iv || '',
      keyVersion: backup.keyVersion ?? 1,
      updatedAt: FieldValue.serverTimestamp()
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true };
});

// 6. Get Key Backup
exports.getKeyBackup = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { sessionToken } = request.data || {};
  if (typeof sessionToken !== 'string' || !sessionToken.trim()) {
    throw new HttpsError('permission-denied', 'Valid PIN verification session token is required.');
  }

  const uid = request.auth.uid;
  const { vaultRef, data } = await getOrMigrateUserVault(uid);

  const session = data.keyBackupSession;
  if (!session || typeof session.tokenHash !== 'string' || typeof session.expiresAt !== 'number') {
    throw new HttpsError('permission-denied', 'PIN verification is required before accessing key backup.');
  }
  if (session.expiresAt < Date.now()) {
    await vaultRef.set({ keyBackupSession: FieldValue.delete() }, { merge: true }).catch(() => {});
    throw new HttpsError('permission-denied', 'PIN session expired. Please verify your PIN again.');
  }

  const candidateHash = hashSha256SessionToken(uid, sessionToken.trim());
  if (!timingSafeEqualHex(candidateHash, session.tokenHash)) {
    throw new HttpsError('permission-denied', 'Invalid PIN verification session token.');
  }

  if (!data.keyBackup) throw new HttpsError('not-found', 'Backup not found.');

  return { backup: data.keyBackup };
});

// 7. Set Recovery Email
exports.setRecoveryEmail = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { email } = request.data || {};
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !cleanEmail.includes('@')) throw new HttpsError('invalid-argument', 'Invalid email address.');

  const uid = request.auth.uid;
  const { vaultRef } = await getOrMigrateUserVault(uid);
  const batch = db.batch();

  batch.set(vaultRef, {
    recoveryEmail: cleanEmail,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  batch.set(db.collection('users').doc(uid), {
    two_factor: {
      recoveryEmail: cleanEmail
    }
  }, { merge: true });

  await batch.commit();
  return { success: true };
});

// 8. Start PIN Reset (Send Code)
exports.startPinReset = onCall({ region: REGION, invoker: 'public', cors: true, secrets: [RESEND_API_KEY] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const uid = request.auth.uid;

  let apiKey = '';
  try {
    apiKey = (RESEND_API_KEY.value() || '').trim();
  } catch {
    apiKey = '';
  }
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Recovery email service is not configured.');
  }

  const { vaultRef, data } = await getOrMigrateUserVault(uid);
  let recoveryEmail = typeof data.recoveryEmail === 'string' ? data.recoveryEmail.trim().toLowerCase() : '';
  if (!recoveryEmail) {
    const userDoc = await db.collection('users').doc(uid).get();
    const fallbackEmail = userDoc.exists ? userDoc.data()?.two_factor?.recoveryEmail : '';
    if (typeof fallbackEmail === 'string' && fallbackEmail.includes('@')) {
      recoveryEmail = fallbackEmail.trim().toLowerCase();
      await vaultRef.set({
        recoveryEmail,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  if (!recoveryEmail) {
    throw new HttpsError('failed-precondition', 'Recovery email not set.');
  }

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

  try {
    await sendRecoveryEmail(apiKey, recoveryEmail, code);
  } catch (err) {
    console.error('[startPinReset] Email delivery error:', err?.message || err);
    throw new HttpsError('failed-precondition', 'Could not send recovery email. Please check email service configuration.');
  }

  await vaultRef.set({
    resetCode: {
      hash: hashedCode,
      salt: salt,
      expiresAt: expiresAt
    },
    resetAttempts: 0,
    resetRequestTimestamps: [...recentRequests, now],
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    success: true,
    email: recoveryEmail.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length))
  };
});

// 9. Reset PIN with Code
exports.resetPinWithCode = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { code, newPin } = request.data || {};
  const cleanCode = typeof code === 'string' ? code.trim() : '';
  if (!cleanCode || typeof newPin !== 'string' || newPin.length !== 6) {
    throw new HttpsError('invalid-argument', 'Invalid input.');
  }

  const uid = request.auth.uid;
  const { vaultRef, data } = await getOrMigrateUserVault(uid);
  if (!data.resetCode || !data.resetCode.hash || !data.resetCode.salt) {
    throw new HttpsError('not-found', 'No reset request found.');
  }

  const now = Date.now();

  if (data.resetCode.expiresAt < now) {
    await vaultRef.set({
      resetCode: FieldValue.delete(),
      resetAttempts: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError('permission-denied', 'Code expired.');
  }

  const currentAttempts = Number(data.resetAttempts || 0);
  if (currentAttempts >= MAX_RESET_ATTEMPTS) {
    await vaultRef.set({
      resetCode: FieldValue.delete(),
      resetAttempts: currentAttempts,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError('resource-exhausted', 'Too many wrong attempts. Please request a new reset code.');
  }

  const verifyHash = await hashData(cleanCode, data.resetCode.salt);
  if (!timingSafeEqualHex(verifyHash, data.resetCode.hash)) {
    const nextAttempts = currentAttempts + 1;
    if (nextAttempts >= MAX_RESET_ATTEMPTS) {
      await vaultRef.set({
        resetCode: FieldValue.delete(),
        resetAttempts: nextAttempts,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw new HttpsError('resource-exhausted', 'Too many wrong attempts. Please request a new reset code.');
    }

    await vaultRef.set({
      resetAttempts: nextAttempts,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError('permission-denied', 'Invalid code.');
  }

  const pinSalt = crypto.randomBytes(16).toString('hex');
  const pinHash = await hashData(newPin, pinSalt);

  await vaultRef.set({
    pinHash: pinHash,
    pinSalt: pinSalt,
    failedAttempts: 0,
    lockedUntil: null,
    resetCode: FieldValue.delete(),
    resetAttempts: 0,
    keyBackupSession: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
});

// 10. Transcribe Voice (Callable)
exports.transcribeVoice = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
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

// Require a valid Firebase ID token on every Express route
async function requireFirebaseAuth(req, res, next) {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }
  const authHeader = req.get('authorization') || req.headers?.authorization || '';
  const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  const idToken = match ? match[1].trim() : '';
  if (!idToken) {
    res.status(401).json({ error: 'Unauthorized: Missing Bearer ID token.' });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    if (!decoded || !decoded.uid) {
      res.status(401).json({ error: 'Unauthorized: Invalid ID token.' });
      return;
    }
    req.authUid = decoded.uid;
    req.authToken = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired ID token.' });
  }
}

app.use(requireFirebaseAuth);

// Per-uid Firestore rate limiting (server-only collection apiRateLimits/{uid})
const RATE_LIMITS = {
  transcribe: { perMinute: 30, perDay: 500 },
  quickReplies: { perMinute: 30, perDay: 500 },
  mediaProxy: { perMinute: 120, perDay: 2000 },
};

async function enforceApiRateLimit(uid, bucket) {
  const limits = RATE_LIMITS[bucket];
  if (!limits) return { allowed: true };

  const nowMs = Date.now();
  const minuteKey = Math.floor(nowMs / 60000);
  const nowDate = new Date(nowMs);
  const dayKey = nowDate.toISOString().slice(0, 10);
  const docRef = db.collection('apiRateLimits').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const existing = snap.exists ? snap.data() || {} : {};
    const entry = existing[bucket] || {};

    const minuteCount = entry.minuteKey === minuteKey ? Number(entry.minuteCount || 0) : 0;
    const dayCount = entry.dayKey === dayKey ? Number(entry.dayCount || 0) : 0;

    if (minuteCount >= limits.perMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil(((minuteKey + 1) * 60000 - nowMs) / 1000));
      return { allowed: false, window: 'minute', limit: limits.perMinute, retryAfterSeconds };
    }

    if (dayCount >= limits.perDay) {
      const nextMidnight = Date.UTC(
        nowDate.getUTCFullYear(),
        nowDate.getUTCMonth(),
        nowDate.getUTCDate() + 1
      );
      const retryAfterSeconds = Math.max(1, Math.ceil((nextMidnight - nowMs) / 1000));
      return { allowed: false, window: 'day', limit: limits.perDay, retryAfterSeconds };
    }

    tx.set(docRef, {
      uid,
      [bucket]: {
        minuteKey,
        minuteCount: minuteCount + 1,
        dayKey,
        dayCount: dayCount + 1,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { allowed: true };
  });
}

function rateLimitRoute(bucket) {
  return async (req, res, next) => {
    const uid = req.authUid;
    if (!uid) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    try {
      const result = await enforceApiRateLimit(uid, bucket);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({
          error: `Rate limit exceeded (${result.limit} requests per ${result.window}). Please try again later.`,
          retryAfterSeconds: result.retryAfterSeconds,
        });
        return;
      }
      next();
    } catch (err) {
      console.error(`Rate limit check failed for ${bucket}:`, err?.message || err);
      res.status(503).json({ error: 'Rate limit service temporarily unavailable.' });
    }
  };
}

// LRU cache for media proxy
const MAX_LRU_ENTRIES = 150;
const MAX_CACHEABLE_FILE_SIZE = 15 * 1024 * 1024;
const MAX_PROXY_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_PROXY_REDIRECTS = 5;
const LRU_TTL_MS = 24 * 60 * 60 * 1000;
const mediaLRUCache = new Map();

function getAllowedStorageBuckets() {
  const buckets = new Set([
    'gen-lang-client-0446181078.firebasestorage.app',
    'gen-lang-client-0446181078.appspot.com',
  ]);
  try {
    const cfg = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
    if (cfg && typeof cfg.storageBucket === 'string' && cfg.storageBucket.trim()) {
      buckets.add(cfg.storageBucket.trim().toLowerCase());
    }
  } catch {}
  return buckets;
}

const ALLOWED_STORAGE_BUCKETS = getAllowedStorageBuckets();

function isPrivateOrLocalIPv4(ip) {
  if (!net.isIPv4(ip)) return true;
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast & reserved
  return false;
}

function parseIPv6Groups(ip) {
  const clean = ip.split('%')[0].toLowerCase();
  if (clean.split('::').length > 2) return null;
  const [leftRaw, rightRaw] = clean.split('::');

  const parseSide = (side) => {
    if (!side) return [];
    const parts = side.split(':');
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) return null;
      if (part.includes('.')) {
        if (i !== parts.length - 1 || !net.isIPv4(part)) return null;
        const octets = part.split('.').map(Number);
        out.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
        out.push(parseInt(part, 16));
      }
    }
    return out;
  };

  const left = parseSide(leftRaw);
  const right = rightRaw !== undefined ? parseSide(rightRaw) : [];
  if (!left || !right) return null;

  if (rightRaw === undefined) {
    return left.length === 8 ? left : null;
  }
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

function groupsToIPv4(hi, lo) {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isPrivateOrLocalIp(ip) {
  if (typeof ip !== 'string' || !ip.trim()) return true;
  const cleanIp = ip.trim();
  if (net.isIPv4(cleanIp)) {
    return isPrivateOrLocalIPv4(cleanIp);
  }
  if (net.isIPv6(cleanIp)) {
    const groups = parseIPv6Groups(cleanIp);
    if (!groups) return true;
    const isAllZeroPrefix5 = groups.slice(0, 5).every((g) => g === 0);
    // Unspecified (::) and Loopback (::1)
    if (isAllZeroPrefix5 && groups[5] === 0 && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) {
      return true;
    }
    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96)
    if (isAllZeroPrefix5 && (groups[5] === 0xffff || groups[5] === 0)) {
      return isPrivateOrLocalIPv4(groupsToIPv4(groups[6], groups[7]));
    }
    // NAT64 well-known prefix (64:ff9b::/96) & local-use (64:ff9b:1::/48)
    if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0x0001) return true;
    if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
      return isPrivateOrLocalIPv4(groupsToIPv4(groups[6], groups[7]));
    }
    // 6to4 embedded IPv4 (2002::/16)
    if (groups[0] === 0x2002) {
      return isPrivateOrLocalIPv4(groupsToIPv4(groups[1], groups[2]));
    }
    // Discard-only (0100::/64) & Documentation (2001:db8::/32)
    if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true;
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
    // Unique local addresses (fc00::/7)
    if ((groups[0] & 0xfe00) === 0xfc00) return true;
    // Link-local (fe80::/10) & deprecated site-local (fec0::/10)
    if ((groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0) return true;
    // Multicast (ff00::/8)
    if ((groups[0] & 0xff00) === 0xff00) return true;
    return false;
  }
  return true;
}

function validateAllowedMediaUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error('Invalid url parameter'), { statusCode: 400 });
  }

  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Only https URLs are allowed'), { statusCode: 403 });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error('URL credentials are not allowed'), { statusCode: 403 });
  }
  if (parsed.port && parsed.port !== '443') {
    throw Object.assign(new Error('Non-standard ports are not allowed'), { statusCode: 403 });
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || net.isIP(hostname) !== 0) {
    throw Object.assign(new Error('Forbidden host'), { statusCode: 403 });
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw Object.assign(new Error('Forbidden host'), { statusCode: 403 });
  }

  let allowed = false;
  if (hostname === 'firebasestorage.googleapis.com') {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/.+$/);
    allowed = Boolean(match && ALLOWED_STORAGE_BUCKETS.has(match[1].toLowerCase()));
  } else if (hostname === 'storage.googleapis.com' || hostname === 'storage.cloud.google.com') {
    const match = parsed.pathname.match(/^\/([^/]+)\/.+$/);
    allowed = Boolean(match && ALLOWED_STORAGE_BUCKETS.has(match[1].toLowerCase()));
  } else if (ALLOWED_STORAGE_BUCKETS.has(hostname)) {
    allowed = true;
  } else if (hostname.endsWith('.storage.googleapis.com')) {
    const bucket = hostname.slice(0, -'.storage.googleapis.com'.length);
    allowed = ALLOWED_STORAGE_BUCKETS.has(bucket);
  } else if (/^[a-z0-9-]+\.googleusercontent\.com$/.test(hostname) || hostname === 'googleusercontent.com') {
    allowed = true;
  }

  if (!allowed) {
    throw Object.assign(new Error('Forbidden host'), { statusCode: 403 });
  }

  return { parsed, hostname, href: parsed.href };
}

async function assertPublicDnsResolution(hostname) {
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw Object.assign(new Error('Host resolution failed'), { statusCode: 403 });
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw Object.assign(new Error('Host resolution returned no records'), { statusCode: 403 });
  }
  for (const record of records) {
    if (!record?.address || isPrivateOrLocalIp(record.address)) {
      throw Object.assign(new Error('Forbidden network destination'), { statusCode: 403 });
    }
  }
}

async function readResponseBufferWithLimit(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw Object.assign(new Error('Upstream media exceeds maximum allowed size'), { statusCode: 413 });
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks, totalBytes);
}

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
    const urlParam = typeof req.query.url === 'string' ? req.query.url : '';
    const resParam = String(req.query.res || req.headers?.['x-media-resolution'] || 'high').toLowerCase();
    const isLowRes = resParam === 'low';

    if (!urlParam || urlParam.length > 2048) {
      res.status(400).type('plain').send('Missing or invalid url parameter');
      return;
    }

    const initialTarget = validateAllowedMediaUrl(urlParam);
    const rangeHeader = req.headers?.range || req.headers?.['range'];
    const cacheKey = getLRUCacheKey(initialTarget.href, rangeHeader, resParam);

    const cachedEntry = getFromLRUCache(cacheKey);
    if (cachedEntry) {
      res.status(cachedEntry.statusCode);
      res.setHeader('Content-Type', cachedEntry.contentType);
      res.setHeader('Content-Length', cachedEntry.contentLength);
      if (cachedEntry.contentRange) res.setHeader('Content-Range', cachedEntry.contentRange);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Proxy-Cache', 'HIT');
      res.send(cachedEntry.buffer);
      return;
    }

    const fetchHeaders = {};
    if (rangeHeader) fetchHeaders['range'] = rangeHeader;

    let currentUrl = initialTarget.href;
    let response = null;
    for (let hop = 0; hop <= MAX_PROXY_REDIRECTS; hop++) {
      const target = validateAllowedMediaUrl(currentUrl);
      await assertPublicDnsResolution(target.hostname);

      response = await fetch(target.href, {
        headers: fetchHeaders,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        try { await response.body?.cancel(); } catch {}
        if (!location) {
          res.status(502).type('plain').send('Upstream redirect missing Location');
          return;
        }
        if (hop === MAX_PROXY_REDIRECTS) {
          res.status(508).type('plain').send('Too many upstream redirects');
          return;
        }
        try {
          currentUrl = new URL(location, target.href).href;
        } catch {
          res.status(403).type('plain').send('Invalid redirect destination');
          return;
        }
        continue;
      }
      break;
    }

    if (!response || (!response.ok && response.status !== 206)) {
      const status = response?.status || 502;
      const errText = response ? await response.text().catch(() => '') : '';
      res.status(status).type('plain').send(`Upstream error ${status}: ${errText.slice(0, 500)}`);
      return;
    }

    const rawLength = response.headers.get('content-length');
    const parsedLength = rawLength ? Number(rawLength) : NaN;
    if (Number.isFinite(parsedLength) && parsedLength > MAX_PROXY_RESPONSE_BYTES) {
      try { await response.body?.cancel(); } catch {}
      res.status(413).type('plain').send('Upstream media exceeds maximum allowed size');
      return;
    }

    let contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (contentType.startsWith('video/')) contentType = 'video/mp4';
    const contentRange = response.headers.get('content-range');

    if (isLowRes && !rangeHeader && contentType.startsWith('image/')) {
      const inputBuffer = await readResponseBufferWithLimit(response, MAX_PROXY_RESPONSE_BYTES);
      try {
        const downscaledBuffer = await sharp(inputBuffer)
          .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 60, progressive: true })
          .toBuffer();

        res.status(200);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Length', downscaledBuffer.byteLength.toString());
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('X-Proxy-Cache', 'MISS');
        res.send(downscaledBuffer);

        putInLRUCache(cacheKey, {
          buffer: downscaledBuffer,
          contentType: 'image/jpeg',
          contentLength: downscaledBuffer.byteLength.toString(),
          statusCode: 200,
          cachedAt: Date.now(),
        });
        return;
      } catch {
        res.status(response.status);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', inputBuffer.byteLength.toString());
        if (contentRange) res.setHeader('Content-Range', contentRange);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('X-Proxy-Cache', 'MISS');
        res.send(inputBuffer);
        return;
      }
    }

    if (!response.body) {
      res.status(response.status);
      res.setHeader('Content-Type', contentType);
      if (rawLength) res.setHeader('Content-Length', rawLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Proxy-Cache', 'MISS');
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(response.body);
    let streamedBytes = 0;
    let headersCommitted = false;

    const commitHeaders = () => {
      if (headersCommitted) return;
      headersCommitted = true;
      res.status(response.status);
      res.setHeader('Content-Type', contentType);
      if (rawLength) res.setHeader('Content-Length', rawLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Proxy-Cache', 'MISS');
    };

    nodeStream.on('data', (chunk) => {
      streamedBytes += chunk.length;
      if (streamedBytes > MAX_PROXY_RESPONSE_BYTES) {
        nodeStream.destroy();
        if (!headersCommitted && !res.headersSent) {
          res.status(413).type('plain').send('Upstream media exceeds maximum allowed size');
        } else {
          res.destroy();
        }
        return;
      }
      commitHeaders();
      if (!res.write(chunk)) {
        nodeStream.pause();
      }
    });

    res.on('drain', () => {
      nodeStream.resume();
    });

    res.on('close', () => {
      if (!nodeStream.destroyed) {
        nodeStream.destroy();
      }
    });

    nodeStream.on('end', () => {
      commitHeaders();
      if (!res.writableEnded) res.end();
    });

    nodeStream.on('error', () => {
      if (!headersCommitted && !res.headersSent) {
        res.status(502).type('plain').send('Upstream stream error');
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    if (!res.headersSent) {
      res.status(statusCode).type('plain').send(err?.message || 'Proxy error');
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

app.get('/api/media-proxy', rateLimitRoute('mediaProxy'), handleMediaProxyRoute);
app.get('/media-proxy', rateLimitRoute('mediaProxy'), handleMediaProxyRoute);
app.post('/api/quick-replies', rateLimitRoute('quickReplies'), handleQuickRepliesRoute);
app.post('/quick-replies', rateLimitRoute('quickReplies'), handleQuickRepliesRoute);
app.post('/api/transcribe', rateLimitRoute('transcribe'), handleTranscribeRoute);
app.post('/transcribe', rateLimitRoute('transcribe'), handleTranscribeRoute);

exports.api = onRequest({
  region: REGION,
  invoker: 'public',
  secrets: [GEMINI_API_KEY],
  timeoutSeconds: 60,
  memory: '512MB'
}, app);

// ==========================================
// 12. Creator Profile Counter Triggers
// ==========================================
async function adjustCreatorCounter(uid, field, delta) {
  if (!uid || !field || delta === 0) return;
  const profileRef = db.collection('creator_profiles').doc(uid);

  if (delta > 0) {
    try {
      await profileRef.update({
        [field]: FieldValue.increment(delta),
      });
    } catch (err) {
      const code = err?.code;
      const msg = String(err?.message || '');
      if (code === 5 || msg.includes('NOT_FOUND') || msg.includes('No document to update')) {
        return;
      }
      throw err;
    }
    return;
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(profileRef);
    if (!snap.exists) return;
    const current = snap.data()?.[field];
    if (typeof current === 'number' && current + delta >= 0) {
      tx.update(profileRef, { [field]: FieldValue.increment(delta) });
    } else {
      tx.update(profileRef, { [field]: 0 });
    }
  });
}

async function reconcileCreatorFollowCounters(followerId, followingId) {
  const tasks = [];
  if (followingId) {
    tasks.push((async () => {
      const profileRef = db.collection('creator_profiles').doc(followingId);
      const [profileSnap, countSnap] = await Promise.all([
        profileRef.get(),
        db.collection('follows').where('followingId', '==', followingId).count().get(),
      ]);
      if (profileSnap.exists) {
        const exactCount = countSnap.data().count || 0;
        if (profileSnap.data()?.followersCount !== exactCount) {
          await profileRef.update({ followersCount: exactCount });
        }
      }
    })());
  }
  if (followerId) {
    tasks.push((async () => {
      const profileRef = db.collection('creator_profiles').doc(followerId);
      const [profileSnap, countSnap] = await Promise.all([
        profileRef.get(),
        db.collection('follows').where('followerId', '==', followerId).count().get(),
      ]);
      if (profileSnap.exists) {
        const exactCount = countSnap.data().count || 0;
        if (profileSnap.data()?.followingCount !== exactCount) {
          await profileRef.update({ followingCount: exactCount });
        }
      }
    })());
  }
  await Promise.all(tasks);
}

exports.onFollowCreated = onDocumentCreated({
  document: 'follows/{followId}',
  database: DATABASE_ID,
  region: REGION
}, async (event) => {
  const data = event.data?.data();
  if (!data) return null;
  const { followerId, followingId } = data;
  if (!followerId || !followingId || followerId === followingId) return null;

  await reconcileCreatorFollowCounters(followerId, followingId);
  return null;
});

exports.onFollowDeleted = onDocumentDeleted({
  document: 'follows/{followId}',
  database: DATABASE_ID,
  region: REGION
}, async (event) => {
  const data = event.data?.data();
  if (!data) return null;
  const { followerId, followingId } = data;
  if (!followerId || !followingId || followerId === followingId) return null;

  await reconcileCreatorFollowCounters(followerId, followingId);
  return null;
});

exports.onReelCreated = onDocumentCreated({
  document: 'reels/{reelId}',
  database: DATABASE_ID,
  region: REGION
}, async (event) => {
  const data = event.data?.data();
  if (!data || !data.authorId) return null;
  await adjustCreatorCounter(data.authorId, 'reelsCount', 1);
  return null;
});

exports.onReelDeleted = onDocumentDeleted({
  document: 'reels/{reelId}',
  database: DATABASE_ID,
  region: REGION
}, async (event) => {
  const data = event.data?.data();
  if (!data || !data.authorId) return null;
  await adjustCreatorCounter(data.authorId, 'reelsCount', -1);
  return null;
});

/**
 * Callable Function: matchContacts
 * Discovers contacts on Hala without revealing global user listings.
 * Rate limited to 10 calls/hour and 1000 numbers/day per caller.
 * Strictly avoids logging any phone numbers.
 */
exports.matchContacts = onCall({ region: REGION, invoker: 'public', cors: true }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }
  const callerUid = request.auth.uid;

  // Verify caller has a verified phone number
  let callerPhone = request.auth.token?.phone_number;
  if (!callerPhone) {
    const callerDoc = await db.collection('users').doc(callerUid).get();
    if (callerDoc.exists) {
      const uData = callerDoc.data() || {};
      callerPhone = uData.phone || uData.phoneNumber;
    }
  }
  if (!callerPhone) {
    throw new HttpsError('failed-precondition', 'Caller must have a verified phone number.');
  }

  const { numbers } = request.data || {};
  if (!Array.isArray(numbers)) {
    throw new HttpsError('invalid-argument', 'The "numbers" parameter must be an array.');
  }
  if (numbers.length > 200) {
    throw new HttpsError('invalid-argument', 'Maximum 200 numbers allowed per call.');
  }
  if (numbers.length === 0) {
    return { matches: [] };
  }

  // Validate E.164 and deduplicate without logging
  const e164Regex = /^\+[1-9]\d{6,18}$/;
  const uniqueNumbers = Array.from(
    new Set(
      numbers
        .filter((n) => typeof n === 'string')
        .map((n) => n.trim())
        .filter((n) => e164Regex.test(n))
    )
  );

  if (uniqueNumbers.length === 0) {
    return { matches: [] };
  }

  // Rate limiting via server-only contactSyncLimits/{callerUid} doc
  const limitRef = db.collection('contactSyncLimits').doc(callerUid);
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  await db.runTransaction(async (transaction) => {
    const limitDoc = await transaction.get(limitRef);
    let hourlyWindowStart = now;
    let hourlyCount = 0;
    let dailyWindowStart = now;
    let dailyNumberCount = 0;

    if (limitDoc.exists) {
      const d = limitDoc.data() || {};
      hourlyWindowStart = typeof d.hourlyWindowStart === 'number' ? d.hourlyWindowStart : now;
      hourlyCount = typeof d.hourlyCount === 'number' ? d.hourlyCount : 0;
      dailyWindowStart = typeof d.dailyWindowStart === 'number' ? d.dailyWindowStart : now;
      dailyNumberCount = typeof d.dailyNumberCount === 'number' ? d.dailyNumberCount : 0;
    }

    if (now - hourlyWindowStart > ONE_HOUR_MS) {
      hourlyWindowStart = now;
      hourlyCount = 1;
    } else {
      if (hourlyCount >= 10) {
        throw new HttpsError('resource-exhausted', 'Hourly contact sync limit reached (10 calls/hour). Please try again later.');
      }
      hourlyCount += 1;
    }

    if (now - dailyWindowStart > ONE_DAY_MS) {
      dailyWindowStart = now;
      dailyNumberCount = uniqueNumbers.length;
    } else {
      if (dailyNumberCount + uniqueNumbers.length > 1000) {
        throw new HttpsError('resource-exhausted', 'Daily contact sync limit reached (1,000 numbers/day). Please try again tomorrow.');
      }
      dailyNumberCount += uniqueNumbers.length;
    }

    transaction.set(
      limitRef,
      {
        hourlyWindowStart,
        hourlyCount,
        dailyWindowStart,
        dailyNumberCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  // Query users by phone in batches of up to 30
  const CHUNK_SIZE = 30;
  const askedNumbersSet = new Set(uniqueNumbers);
  const matches = [];
  const seenUids = new Set();

  for (let i = 0; i < uniqueNumbers.length; i += CHUNK_SIZE) {
    const chunk = uniqueNumbers.slice(i, i + CHUNK_SIZE);
    const snap = await db.collection('users').where('phone', 'in', chunk).get();
    snap.forEach((docSnap) => {
      const u = docSnap.data() || {};
      const uid = docSnap.id;
      if (uid === callerUid) return;
      if (seenUids.has(uid)) return;

      const phone = u.phone;
      if (phone && askedNumbersSet.has(phone)) {
        seenUids.add(uid);
        matches.push({
          phone: phone,
          uid: uid,
          name: typeof u.name === 'string' ? u.name : '',
          avatar_url: typeof u.avatar_url === 'string' ? u.avatar_url : (typeof u.avatarUrl === 'string' ? u.avatarUrl : null),
          public_key: typeof u.public_key === 'string' ? u.public_key : (typeof u.publicKey === 'string' ? u.publicKey : null),
        });
      }
    });
  }

  return { matches };
});

/**
 * Callable Function: getIceServers
 * Returns short-lived Cloudflare Realtime TURN credentials (ttl: 4 hours).
 * Enforces per-uid rate limiting (30 requests/hour) via server-only turnRateLimits/{uid}.
 * Never logs or returns CF_TURN_KEY_ID or CF_TURN_API_TOKEN.
 */
exports.getIceServers = onCall(
  {
    region: REGION,
    invoker: 'public',
    cors: true,
    secrets: [CF_TURN_KEY_ID, CF_TURN_API_TOKEN],
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;

    // Rate limiting: 30 requests per hour per uid via server-only turnRateLimits/{uid}
    const limitRef = db.collection('turnRateLimits').doc(uid);
    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    await db.runTransaction(async (transaction) => {
      const limitDoc = await transaction.get(limitRef);
      let hourlyWindowStart = now;
      let hourlyCount = 0;

      if (limitDoc.exists) {
        const d = limitDoc.data() || {};
        hourlyWindowStart = typeof d.hourlyWindowStart === 'number' ? d.hourlyWindowStart : now;
        hourlyCount = typeof d.hourlyCount === 'number' ? d.hourlyCount : 0;
      }

      if (now - hourlyWindowStart > ONE_HOUR_MS) {
        hourlyWindowStart = now;
        hourlyCount = 1;
      } else {
        if (hourlyCount >= 30) {
          throw new HttpsError(
            'resource-exhausted',
            'Rate limit exceeded (30 requests per hour). Please try again later.'
          );
        }
        hourlyCount += 1;
      }

      transaction.set(
        limitRef,
        {
          hourlyWindowStart,
          hourlyCount,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    let keyId = '';
    let apiToken = '';
    try {
      keyId = (CF_TURN_KEY_ID.value() || '').trim();
    } catch {}
    try {
      apiToken = (CF_TURN_API_TOKEN.value() || '').trim();
    } catch {}

    if (!keyId || !apiToken) {
      keyId = keyId || (process.env.CF_TURN_KEY_ID || '').trim();
      apiToken = apiToken || (process.env.CF_TURN_API_TOKEN || '').trim();
    }

    if (!keyId || !apiToken) {
      throw new HttpsError('failed-precondition', 'TURN service is not configured.');
    }

    const ttl = 4 * 60 * 60; // 4 hours in seconds (14,400)
    const cfUrl = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

    let response;
    try {
      response = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl }),
      });
    } catch (fetchErr) {
      console.warn('[getIceServers] Cloudflare TURN API connection failed:', fetchErr?.message || 'network error');
      throw new HttpsError('unavailable', 'Failed to reach TURN credential service.');
    }

    if (!response.ok) {
      console.warn(`[getIceServers] Cloudflare TURN API responded with status ${response.status}`);
      throw new HttpsError('unavailable', 'Failed to generate TURN credentials.');
    }

    const data = await response.json();
    const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];

    return { iceServers };
  }
);


