import { getDoc, setDoc, doc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

/**
 * End-to-End Encryption (E2EE) Module for Hala Chat
 * Uses native Web Crypto API (SubtleCrypto) & IndexedDB
 */

const DB_NAME = 'HalaCryptoDB';
const DB_VERSION = 1;
const STORE_KEYS = 'keys';
const STORE_SESSION_KEYS = 'session_keys';

// In-memory key cache for fast access during session
const memoryKeyCache = new Map<string, CryptoKey>();

/**
 * Clear in-memory crypto key cache
 */
export function clearCryptoKeyCache(): void {
  memoryKeyCache.clear();
}

/**
 * Helper to open IndexedDB
 */
function openCryptoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORE_SESSION_KEYS)) {
        db.createObjectStore(STORE_SESSION_KEYS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save data to IndexedDB
 */
async function saveToIDB(storeName: string, key: string, value: any): Promise<void> {
  const db = await openCryptoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read data from IndexedDB
 */
async function getFromIDB(storeName: string, key: string): Promise<any> {
  const db = await openCryptoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Compute SHA-256 fingerprint of JWK public key (first 8 hex characters)
 */
export async function computePublicKeyFingerprint(publicKeyJwk: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKeyJwk);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.slice(0, 8);
  } catch (err) {
    return '';
  }
}

/**
 * Get fingerprint of own local key stored in IndexedDB
 */
export async function getOwnLocalKeyFingerprint(userId: string): Promise<string> {
  const pubKeyId = `pub_${userId}`;
  const pubKey = await getFromIDB(STORE_KEYS, pubKeyId);
  if (!pubKey) return '';
  return await computePublicKeyFingerprint(pubKey);
}

/**
 * Sync public key and fingerprint to Firestore users and users_public documents
 */
export async function syncUserPublicKeyToFirestore(userId: string, publicKeyJwk?: string): Promise<string | null> {
  try {
    const pubKeyId = `pub_${userId}`;
    const pubKey = publicKeyJwk || (await getFromIDB(STORE_KEYS, pubKeyId));
    if (!pubKey) return null;

    const fingerprint = await computePublicKeyFingerprint(pubKey);
    const db = getFirebaseDb();
    await setDoc(doc(db, 'users', userId), { public_key: pubKey }, { merge: true });
    await setDoc(doc(db, 'users_public', userId), { public_key: pubKey, publicKeyFingerprint: fingerprint }, { merge: true });
    console.log(`[E2EE] Synced public key and fingerprint (${fingerprint}) to Firestore for user: ${userId}`);
    return pubKey;
  } catch (err) {
    console.warn('[E2EE] Failed to sync public key to Firestore:', err);
    return null;
  }
}

/**
 * Base64 Utilities
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate user ECDH P-256 Key Pair for E2EE
 */
export async function generateUserKeyPair(): Promise<{
  publicKeyJwk: string;
  privateKeyJwk: string;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable so we can store JWK
    ['deriveKey', 'deriveBits']
  );

  const publicKeyJwkObj = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwkObj = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

  const publicKeyJwk = JSON.stringify(publicKeyJwkObj);
  const privateKeyJwk = JSON.stringify(privateKeyJwkObj);

  return { publicKeyJwk, privateKeyJwk };
}

/**
 * Initialize or retrieve E2EE keys for current user
 */
export async function ensureUserE2EEKeyPair(userId: string, forceNew = false): Promise<string> {
  const privKeyId = `priv_${userId}`;
  const pubKeyId = `pub_${userId}`;

  // 1. Check local IndexedDB
  const existingPrivKeyJwk = await getFromIDB(STORE_KEYS, privKeyId);
  const existingPubKeyJwk = await getFromIDB(STORE_KEYS, pubKeyId);

  if (existingPrivKeyJwk && existingPubKeyJwk && !forceNew) {
    // Local key exists: check Firestore published public_key first
    try {
      const db = getFirebaseDb();
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const serverPubKey = data.public_key;
        if (!serverPubKey) {
          // No published key on server (new user), publish it
          void syncUserPublicKeyToFirestore(userId, existingPubKeyJwk);
        } else if (serverPubKey === existingPubKeyJwk) {
          // Published key equals local public key -> do nothing
        } else {
          // Published key is different -> DO NOT overwrite; throw KEY_MISMATCH
          throw new Error('KEY_MISMATCH');
        }
      } else {
        // User doc doesn't exist yet, publish key
        void syncUserPublicKeyToFirestore(userId, existingPubKeyJwk);
      }
    } catch (err: any) {
      if (err.message === 'KEY_MISMATCH') {
        throw err;
      }
      console.warn('[E2EE] Error checking server public key during ensureKeyPair:', err);
    }
    return existingPubKeyJwk;
  }

  // 2. Check Firestore if not forced and local key is missing
  if (!forceNew) {
    const db = getFirebaseDb();
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.public_key) {
        // User has a key on server but not here. Restore required.
        throw new Error('RESTORE_REQUIRED');
      }
    }
  }

  // 3. Generate new keypair (either new user or forced "start fresh" / "Use this device's key")
  if (forceNew) {
    clearCryptoKeyCache();
  }
  const { publicKeyJwk, privateKeyJwk } = await generateUserKeyPair();

  // Save to IndexedDB
  await saveToIDB(STORE_KEYS, privKeyId, privateKeyJwk);
  await saveToIDB(STORE_KEYS, pubKeyId, publicKeyJwk);

  // Sync to Firestore immediately so all peers receive the active public key & fingerprint
  void syncUserPublicKeyToFirestore(userId, publicKeyJwk);

  return publicKeyJwk;
}

/**
 * Check if current user has private key locally
 */
export async function hasUserPrivateKey(userId: string): Promise<boolean> {
  const privKeyId = `priv_${userId}`;
  const existingPrivKeyJwk = await getFromIDB(STORE_KEYS, privKeyId);
  return Boolean(existingPrivKeyJwk);
}

/**
 * Import User Private ECDH Key from IndexedDB
 */
export async function getOwnPrivateKey(userId: string): Promise<CryptoKey | null> {
  const cacheKey = `priv_key_${userId}`;
  if (memoryKeyCache.has(cacheKey)) {
    return memoryKeyCache.get(cacheKey)!;
  }

  const privKeyId = `priv_${userId}`;
  const privKeyJwkString = await getFromIDB(STORE_KEYS, privKeyId);
  if (!privKeyJwkString) return null;

  try {
    const jwkObj = JSON.parse(privKeyJwkString);
    const key = await window.crypto.subtle.importKey(
      'jwk',
      jwkObj,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits']
    );
    memoryKeyCache.set(cacheKey, key);
    return key;
  } catch (err) {
    console.error('Failed to import own private key:', err);
    return null;
  }
}

/**
 * Import Peer Public ECDH Key
 */
export async function importPeerPublicKey(publicKeyJwkString: string): Promise<CryptoKey | null> {
  try {
    const jwkObj = typeof publicKeyJwkString === 'string' ? JSON.parse(publicKeyJwkString) : publicKeyJwkString;
    return await window.crypto.subtle.importKey(
      'jwk',
      jwkObj,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
  } catch (err) {
    console.error('Failed to import peer public key:', err);
    return null;
  }
}

/**
 * Derive 1-on-1 AES-GCM Shared Session Key via ECDH
 */
export async function derive1on1SessionKey({
  currentUserId,
  peerPublicKeyJwk,
  chatId,
}: {
  currentUserId: string;
  peerPublicKeyJwk: string;
  chatId: string;
}): Promise<CryptoKey | null> {
  const cacheKey = `session_${chatId}_${currentUserId}_${peerPublicKeyJwk}`;
  if (memoryKeyCache.has(cacheKey)) {
    return memoryKeyCache.get(cacheKey)!;
  }

  const ownPrivateKey = await getOwnPrivateKey(currentUserId);
  if (!ownPrivateKey) return null;

  const peerPublicKey = await importPeerPublicKey(peerPublicKeyJwk);
  if (!peerPublicKey) return null;

  try {
    const sessionKey = await window.crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: peerPublicKey,
      },
      ownPrivateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );

    memoryKeyCache.set(cacheKey, sessionKey);
    return sessionKey;
  } catch (err) {
    console.error('Failed to derive 1-on-1 session key:', err);
    return null;
  }
}

/**
 * Generate a random AES-GCM 256 Symmetric Key for Group Chat
 */
export async function generateGroupSymmetricKey(): Promise<{
  key: CryptoKey;
  rawBase64: string;
}> {
  const key = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable so we can encrypt for members
    ['encrypt', 'decrypt']
  );

  const rawBuffer = await window.crypto.subtle.exportKey('raw', key);
  const rawBase64 = arrayBufferToBase64(rawBuffer);

  return { key, rawBase64 };
}

/**
 * Encrypt group key for a specific member using ECDH derived key
 */
export async function encryptGroupKeyForMember({
  senderUserId,
  memberUserId,
  memberPublicKeyJwk,
  rawGroupKeyBase64,
}: {
  senderUserId: string;
  memberUserId: string;
  memberPublicKeyJwk: string;
  rawGroupKeyBase64: string;
}): Promise<{ ciphertext: string; iv: string; senderPubKeyJwk: string } | null> {
  // If sender is encrypting for themselves, we derive using sender's own key
  const tempChatId = `grp_key_xchange_${senderUserId}_${memberUserId}`;
  const derivedKey = await derive1on1SessionKey({
    currentUserId: senderUserId,
    peerPublicKeyJwk: memberPublicKeyJwk,
    chatId: tempChatId,
  });

  if (!derivedKey) return null;

  const pubKeyId = `pub_${senderUserId}`;
  const senderPubKeyJwk = await getFromIDB(STORE_KEYS, pubKeyId);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const rawGroupKeyBuffer = base64ToArrayBuffer(rawGroupKeyBase64);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    derivedKey,
    rawGroupKeyBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv.buffer),
    senderPubKeyJwk: senderPubKeyJwk || '',
  };
}

/**
 * Decrypt Group Symmetric Key for current user
 */
export async function decryptGroupSymmetricKey({
  currentUserId,
  encryptedPackage,
  chatId,
}: {
  currentUserId: string;
  encryptedPackage: { ciphertext: string; iv: string; senderPubKeyJwk: string };
  chatId: string;
}): Promise<CryptoKey | null> {
  const cacheKey = `group_key_${chatId}_${currentUserId}`;
  if (memoryKeyCache.has(cacheKey)) {
    return memoryKeyCache.get(cacheKey)!;
  }

  const { ciphertext, iv, senderPubKeyJwk } = encryptedPackage;
  if (!ciphertext || !iv || !senderPubKeyJwk) return null;

  const tempChatId = `grp_key_xchange_${currentUserId}_partner`;
  const derivedKey = await derive1on1SessionKey({
    currentUserId,
    peerPublicKeyJwk: senderPubKeyJwk,
    chatId: tempChatId,
  });

  if (!derivedKey) return null;

  try {
    const ivBuffer = base64ToArrayBuffer(iv);
    const ciphertextBuffer = base64ToArrayBuffer(ciphertext);

    const decryptedRawBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer),
      },
      derivedKey,
      ciphertextBuffer
    );

    const importedGroupKey = await window.crypto.subtle.importKey(
      'raw',
      decryptedRawBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    memoryKeyCache.set(cacheKey, importedGroupKey);
    return importedGroupKey;
  } catch (err) {
    console.error('Failed to decrypt group symmetric key:', err);
    return null;
  }
}

/**
 * Encrypt Text Payload (AES-GCM)
 */
export async function encryptTextContent(
  text: string,
  key: CryptoKey
): Promise<{ encryptedString: string } | null> {
  if (!text) return { encryptedString: '' };
  try {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encoded
    );

    const ivB64 = arrayBufferToBase64(iv.buffer);
    const cipherB64 = arrayBufferToBase64(ciphertextBuffer);

    // Format: e2ee:v1:<iv_b64>:<cipher_b64>
    return {
      encryptedString: `e2ee:v1:${ivB64}:${cipherB64}`,
    };
  } catch (err) {
    console.error('Error encrypting text content:', err);
    return null;
  }
}

import { decryptionCacheService } from './lruDecryptionCache';

export function getCachedDecryptedText(messageId: string): string | null {
  return decryptionCacheService.get(messageId);
}

export function setCachedDecryptedText(messageId: string, text: string): void {
  decryptionCacheService.set(messageId, text);
}

/**
 * Decrypt Text Payload (AES-GCM) with Persistent Time-Based Cache Support
 */
export async function decryptTextContent(
  formattedString: string,
  key: CryptoKey | null,
  language: 'ar' | 'en' = 'en',
  messageId?: string
): Promise<string> {
  if (!formattedString) return '';
  if (!formattedString.startsWith('e2ee:v1:')) {
    // Legacy / unencrypted text
    return formattedString;
  }

  if (messageId) {
    const cached = getCachedDecryptedText(messageId);
    if (cached !== null) {
      return cached;
    }
  }

  if (!key) {
    return language === 'ar'
      ? '🔒 رسالة مشفرة بمفتاح غير متوفر'
      : '🔒 Encrypted message (Key unavailable)';
  }

  try {
    const parts = formattedString.split(':');
    if (parts.length < 4) return formattedString;

    const ivB64 = parts[2];
    const cipherB64 = parts[3];

    const ivBuffer = base64ToArrayBuffer(ivB64);
    const cipherBuffer = base64ToArrayBuffer(cipherB64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer),
      },
      key,
      cipherBuffer
    );

    const decoder = new TextDecoder();
    const plainText = decoder.decode(decryptedBuffer);

    if (messageId && plainText) {
      setCachedDecryptedText(messageId, plainText);
    }

    return plainText;
  } catch (err) {
    console.warn('Failed to decrypt text content:', err);
    return language === 'ar'
      ? '🔒 رسالة مشفرة بمفتاح أمان سابق'
      : '🔒 Encrypted message (Previous security key)';
  }
}

/**
 * Encrypt Blob / File (Images, Videos, Voice) Client-Side
 */
export async function encryptBlobData(
  blob: Blob,
  key: CryptoKey
): Promise<{ encryptedBlob: Blob; ivB64: string } | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      arrayBuffer
    );

    const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
    const ivB64 = arrayBufferToBase64(iv.buffer);

    return { encryptedBlob, ivB64 };
  } catch (err) {
    console.error('Failed to encrypt media blob:', err);
    return null;
  }
}

function sniffDecryptedMimeType(buffer: ArrayBuffer, fallbackType: string): string {
  if (buffer && buffer.byteLength >= 4) {
    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);
    const magic16 = view.getUint16(0, false);

    // EBML / WebM: 0x1A45DFA3
    if (magic === 0x1A45DFA3) return fallbackType.startsWith('video/') ? 'video/webm' : 'audio/webm';
    
    // OggS: 0x4F676753
    if (magic === 0x4F676753) return 'audio/ogg';
    
    // RIFF (WAV): 0x52494646
    if (magic === 0x52494646) return 'audio/wav';
    
    // ftyp (ISOBMFF / MP4 / M4A): 'ftyp' at offset 4
    if (buffer.byteLength >= 8 && view.getUint32(4, false) === 0x66747970) return fallbackType.startsWith('video/') ? 'video/mp4' : 'audio/mp4';
    
    // MP3 ID3v2 tag: 0x494433 ("ID3")
    if ((magic & 0xFFFFFF00) === 0x49443300) return 'audio/mpeg';
    
    // MP3 frame sync: 11 bits set (0xFFE0 mask)
    if ((magic16 & 0xFFE0) === 0xFFE0) return 'audio/mpeg';
    
    // AAC ADTS syncword: 0xFFF0 mask
    if ((magic16 & 0xFFF6) === 0xFFF0) return 'audio/aac';
    
    // JPEG: 0xFFD8FF
    if ((magic & 0xFFFFFF00) === 0xFFD8FF00) return 'image/jpeg';
    
    // PNG: 0x89504E47
    if (magic === 0x89504E47) return 'image/png';
  }
  
  // Fallback: If it's explicitly typed as audio but sniffer failed, assume webm as it is the most common format
  if (fallbackType.startsWith('audio/')) return 'audio/webm';
  
  return fallbackType;
}

/**
 * Decrypt Encrypted ArrayBuffer/Blob to Object URL
 */
export async function decryptBlobData(
  encryptedArrayBuffer: ArrayBuffer,
  ivB64: string,
  mimeType: string,
  key: CryptoKey | null
): Promise<string | null> {
  if (!encryptedArrayBuffer || encryptedArrayBuffer.byteLength < 16) {
    return null;
  }

  // 1. If payload is unencrypted media bytes (WebM, OGG, WAV, MP4, JPEG, PNG, MP3, AAC), return raw media blob immediately
  const sniffedUnencrypted = sniffDecryptedMimeType(encryptedArrayBuffer, '');
  if (sniffedUnencrypted) {
    const rawBlob = new Blob([encryptedArrayBuffer], { type: sniffedUnencrypted });
    return URL.createObjectURL(rawBlob);
  }

  if (!key) return null;

  // 2. Otherwise decrypt true AES-GCM encrypted payload
  try {
    const ivBuffer = base64ToArrayBuffer(ivB64);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ivBuffer),
      },
      key,
      encryptedArrayBuffer
    );

    const actualMimeType = sniffDecryptedMimeType(decryptedBuffer, mimeType);
    const decryptedBlob = new Blob([decryptedBuffer], { type: actualMimeType });
    return URL.createObjectURL(decryptedBlob);
  } catch (err) {
    console.warn('[crypto] Failed to decrypt media blob (prior session key or unauthenticated):', err);
    return null;
  }
}

/**
 * Derive AES-GCM Key from 6-digit PIN using PBKDF2 (600,000 iterations)
 */
export async function deriveKeyFromPin(pin: string, saltHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const pinKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );
  const salt = base64ToArrayBuffer(saltHex);
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600000,
      hash: 'SHA-256',
    },
    pinKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt own private key JWK string using PIN
 */
export async function encryptPrivateKeyBackup(userId: string, pin: string): Promise<{ blob: string; salt: string; iv: string; keyVersion: number } | null> {
  const privKeyId = `priv_${userId}`;
  const pubKeyId = `pub_${userId}`;
  const privKeyJwkString = await getFromIDB(STORE_KEYS, privKeyId);
  const pubKeyJwkString = await getFromIDB(STORE_KEYS, pubKeyId);
  if (!privKeyJwkString) return null;

  const payload = JSON.stringify({ priv: privKeyJwkString, pub: pubKeyJwkString });

  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const saltHex = arrayBufferToBase64(saltBytes.buffer);
  const derivedKey = await deriveKeyFromPin(pin, saltHex);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    enc.encode(payload)
  );

  return {
    blob: arrayBufferToBase64(ciphertext),
    salt: saltHex,
    iv: arrayBufferToBase64(iv.buffer),
    keyVersion: 1,
  };
}

/**
 * Decrypt private key backup using PIN and store in IndexedDB
 */
export async function decryptAndRestorePrivateKey(
  userId: string,
  pin: string,
  backup: { blob: string; salt: string; iv: string }
): Promise<boolean> {
  try {
    const derivedKey = await deriveKeyFromPin(pin, backup.salt);
    const iv = base64ToArrayBuffer(backup.iv);
    const ciphertext = base64ToArrayBuffer(backup.blob);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      derivedKey,
      ciphertext
    );
    const dec = new TextDecoder();
    const parsed = JSON.parse(dec.decode(decrypted));

    if (!parsed.priv) return false;

    const privKeyId = `priv_${userId}`;
    const pubKeyId = `pub_${userId}`;
    await saveToIDB(STORE_KEYS, privKeyId, parsed.priv);
    if (parsed.pub) {
      await saveToIDB(STORE_KEYS, pubKeyId, parsed.pub);
    }
    return true;
  } catch (err) {
    console.error('Failed to decrypt private key backup with PIN:', err);
    return false;
  }
}
