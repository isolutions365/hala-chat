const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');

admin.initializeApp();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const REGION = 'europe-west1';
const DATABASE_ID = 'ai-studio-hala-efac1993-f3c4-44ed-b676-ccb87cb486aa';
const db = getFirestore(DATABASE_ID);
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

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
          body: 'New message' // Strictly "New message" as requested
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

  await db.collection('users_private').doc(request.auth.uid).set({
    recoveryEmail: email,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

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

  // Rate Limit: 3 requests per hour
  const recentRequests = (data.resetRequestTimestamps || []).filter(ts => ts > oneHourAgo);
  if (recentRequests.length >= 3) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again in an hour.');
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedCode = await hashData(code, salt);
  const expiresAt = now + 10 * 60000; // 10 mins

  // Store hashed code and update rate limit timestamps
  await userPrivRef.update({
    resetCode: {
      hash: hashedCode,
      salt: salt,
      expiresAt: expiresAt
    },
    resetRequestTimestamps: [...recentRequests, now]
  });

  // Send Email
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

// 10. Transcribe Voice
exports.transcribeVoice = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  const { audioBase64, targetLanguage, mimeType } = request.data;
  if (!audioBase64) throw new HttpsError('invalid-argument', 'Missing audio data.');

  try {
    const model = 'gemini-3.5-transcribe';
    const prompt = `Transcribe this audio. If it is not in ${targetLanguage === 'ar' ? 'Arabic' : 'English'}, also translate it to ${targetLanguage === 'ar' ? 'Arabic' : 'English'}. Return only the transcription and translation in JSON format: { "transcription": "...", "translation": "..." }. If the audio is unclear, return an error message in the transcription field.`;

    const result = await ai.models.generateContent({
      model: model,
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } },
          { text: prompt }
        ]
      }],
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text;
    const response = JSON.parse(responseText || '{}');
    return response;
  } catch (err) {
    console.error('Transcription failed:', err);
    throw new HttpsError('internal', 'Transcription failed: ' + err.message);
  }
});
