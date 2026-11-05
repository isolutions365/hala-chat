import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptTextContent,
  decryptTextContent,
  generateUserKeyPair,
  importPeerPublicKey,
} from '../src/lib/crypto.ts';

test('new messages encrypt and decrypt normally with valid session key', async () => {
  const aliceKeys = await generateUserKeyPair();
  const bobKeys = await generateUserKeyPair();

  const alicePriv = await window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(aliceKeys.privateKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const bobPub = await importPeerPublicKey(bobKeys.publicKeyJwk);

  const aliceSessionKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: bobPub },
    alicePriv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const originalText = 'Hello Bob, this is secure E2EE!';
  const encryptedPkg = await encryptTextContent(originalText, aliceSessionKey);
  assert.ok(encryptedPkg.encryptedString.startsWith('e2ee:v1:'));

  const decryptedText = await decryptTextContent(encryptedPkg.encryptedString, aliceSessionKey, 'en');
  assert.equal(decryptedText, originalText);
});

test('missing or unavailable historical key is handled safely without crashing or false decryption', async () => {
  const aliceKeys = await generateUserKeyPair();
  const bobKeys = await generateUserKeyPair();

  const alicePriv = await window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(aliceKeys.privateKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
  const bobPub = await importPeerPublicKey(bobKeys.publicKeyJwk);

  const sessionKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: bobPub },
    alicePriv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const encryptedPkg = await encryptTextContent('Secret message', sessionKey);

  // Decrypt with null key (missing historical key)
  const resultWithNullKey = await decryptTextContent(encryptedPkg.encryptedString, null, 'en');
  assert.equal(resultWithNullKey.includes('Key unavailable'), true);

  // Decrypt with an invalid/rotated key
  const otherKeys = await generateUserKeyPair();
  const otherPriv = await window.crypto.subtle.importKey(
    'jwk',
    JSON.parse(otherKeys.privateKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
  const wrongSessionKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: bobPub },
    otherPriv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const resultWithWrongKey = await decryptTextContent(encryptedPkg.encryptedString, wrongSessionKey, 'en');
  assert.equal(resultWithWrongKey.includes('Previous security key'), true);
});

test('existing/legacy unencrypted message formats remain readable', async () => {
  const legacyText = 'Hello legacy unencrypted message';
  const decrypted = await decryptTextContent(legacyText, null, 'en');
  assert.equal(decrypted, legacyText);
});
