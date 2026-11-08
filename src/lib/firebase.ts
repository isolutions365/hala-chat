import { projectPoll, projectReactions } from './messageInteractions';
import { compressAvatar } from './imageCompression';
import { safeLocalStorageSet, isFirebaseStorageQuotaError, isStorageQuotaError, getSafeStorageErrorMessage } from './safeStorage';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getAuth,
  connectAuthEmulator,
  Auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInAnonymously,
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  setLogLevel,
  Firestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  runTransaction,
  deleteField,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocFromServer,
  getDocFromCache,
  increment,
  limit,
  arrayUnion,
  arrayRemove,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  connectStorageEmulator,
  FirebaseStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  uploadString,
  getDownloadURL,
  getBytes,
} from 'firebase/storage';
import {
  getMessaging,
  getToken,
  onMessage,
} from 'firebase/messaging';
import {
  UserModel,
  UserProfile,
  Country,
  ChatModel,
  MessageModel,
  ContactItem,
  PresenceModel,
  ChannelModel,
  ChannelSubscriberModel,
  PollData,
  CallModel,
  CallType,
  CallStatus,
  SignalingData,
  StoryModel,
} from '../types';
import firebaseConfigData from '../../firebase-applet-config.json';
import type { OtpRequestResult } from './phoneAuth';
import {
  ensureUserE2EEKeyPair,
  generateGroupSymmetricKey,
  encryptGroupKeyForMember,
  encryptTextContent,
  encryptPrivateKeyBackup,
  decryptAndRestorePrivateKey,
  clearCryptoKeyCache,
  syncUserPublicKeyToFirestore,
} from './crypto';

export {
  ensureUserE2EEKeyPair,
  generateGroupSymmetricKey,
  encryptGroupKeyForMember,
  encryptTextContent,
  encryptPrivateKeyBackup,
  decryptAndRestorePrivateKey,
  clearCryptoKeyCache,
  syncUserPublicKeyToFirestore,
};
import {
  combineWallpaperAndHeaderTheme,
  extractHeaderThemeValue,
} from './wallpaperPresets';

// Emulator mode cannot be enabled in a production build or remote origin.
export const USING_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATORS === 'true'
  && ['localhost','127.0.0.1'].includes(window.location.hostname);

// Singleton instances
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function validateFirebaseConfig(): boolean {
  if (USING_EMULATORS) return true;

  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigData.apiKey;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigData.projectId;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigData.authDomain;

  const missing: string[] = [];
  if (!apiKey) missing.push('VITE_FIREBASE_API_KEY');
  if (!projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');

  if (missing.length > 0) {
    const errorMsg = `Missing Firebase environment variables: ${missing.join(', ')}. Please configure them in Vercel Settings -> Environment Variables.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  return true;
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;

  validateFirebaseConfig();

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    const config = USING_EMULATORS ? {
      apiKey: 'demo-key', projectId: 'demo-hala-rules', authDomain: 'localhost',
      storageBucket: 'demo-hala-rules.appspot.com', appId: 'demo-hala',
    } : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigData.apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigData.authDomain,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigData.projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigData.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigData.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigData.appId,
    };
    app = initializeApp(config);
  }

  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const firebaseApp = getFirebaseApp();
  auth = getAuth(firebaseApp);
  if (USING_EMULATORS) connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (db) return db;
  try {
    setLogLevel('error');
  } catch {}
  const firebaseApp = getFirebaseApp();
  const databaseId = USING_EMULATORS ? undefined : firebaseConfigData.firestoreDatabaseId;
  const firestoreSettings = {
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  };
  try {
    db = databaseId 
      ? initializeFirestore(firebaseApp, firestoreSettings, databaseId) 
      : initializeFirestore(firebaseApp, firestoreSettings);
  } catch (error) {
    console.warn('initializeFirestore failed, falling back to getFirestore:', error);
    db = databaseId ? getFirestore(firebaseApp, databaseId) : getFirestore(firebaseApp);
  }
  if (USING_EMULATORS) connectFirestoreEmulator(db, '127.0.0.1', 8088);
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (storage) return storage;
  const firebaseApp = getFirebaseApp();
  storage = getStorage(firebaseApp);
  if (USING_EMULATORS) connectStorageEmulator(storage, '127.0.0.1', 9198);
  try {
    storage.maxUploadRetryTime = 60000; // 60s
    storage.maxOperationRetryTime = 30000; // 30s
  } catch (err) {
    console.warn('Failed to set Firebase Storage retry times:', err);
  }
  return storage;
}

export { getBytes, ref };
export const transcribeVoice = (data: { audioBase64: string; targetLanguage: string; mimeType?: string }) => {
  const functions = getFunctions(getFirebaseApp(), 'europe-west1');
  return httpsCallable(functions, 'transcribeVoice')(data);
};

/**
 * Check if a URL belongs to Firebase Storage
 */
export function isFirebaseStorageUrl(url: string): boolean {
  return typeof url === 'string' && (
    url.includes('firebasestorage.googleapis.com') || 
    url.includes('googleapi') || 
    url.startsWith('gs://')
  );
}

export async function ensureAuthUser(): Promise<FirebaseUser | null> {
  const authInstance = getFirebaseAuth();
  if (authInstance.currentUser) {
    return authInstance.currentUser;
  }
  try {
    const cred = await signInAnonymously(authInstance);
    return cred.user;
  } catch (err) {
    console.warn('ensureAuthUser signInAnonymously notice:', err);
    return null;
  }
}

// Test Firestore Connection
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const firestore = getFirebaseDb();
    await getDoc(doc(firestore, 'test', 'connection'));
    return true;
  } catch (error: any) {
    if (error?.message?.includes('the client is offline') || error?.code === 'unavailable') {
      console.warn('Firestore is currently connecting/offline mode active');
      return false;
    }
    // Connected (or document not found is also a successful server reach)
    return true;
  }
}

// Setup invisible reCAPTCHA Verifier
export function clearRecaptchaVerifier(containerId = 'recaptcha-container'): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (err) {
      console.warn('recaptchaVerifier.clear() failed:', err);
    }
    recaptchaVerifier = null;
  }
  try {
    const parent = document.getElementById(containerId);
    if (parent) {
      parent.innerHTML = '';
    }
    // Remove any leftover invisible badges or orphaned reCAPTCHA iframes
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.grecaptcha-badge').forEach((badge) => {
        badge.remove();
      });
    }
  } catch {}
}

export function setupRecaptcha(containerId = 'recaptcha-container'): RecaptchaVerifier | null {
  const authInstance = getFirebaseAuth();
  if (!authInstance) return null;

  try {
    clearRecaptchaVerifier(containerId);

    let parent = document.getElementById(containerId);
    if (!parent) {
      console.warn(`Container #${containerId} not found in DOM, creating fallback container`);
      parent = document.createElement('div');
      parent.id = containerId;
      document.body.appendChild(parent);
    }

    // Always create a brand-new child element with a unique ID for each verification session.
    // This guarantees grecaptcha never encounters a previously used DOM node or ID,
    // completely preventing the "reCAPTCHA has already been rendered in this container" error!
    parent.innerHTML = '';
    const freshWidget = document.createElement('div');
    const uniqueId = `rc-widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    freshWidget.id = uniqueId;
    parent.appendChild(freshWidget);

    recaptchaVerifier = new RecaptchaVerifier(authInstance, freshWidget, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        console.warn('reCAPTCHA expired, resetting container');
        clearRecaptchaVerifier(containerId);
      },
    });

    return recaptchaVerifier;
  } catch (err: any) {
    console.error('Failed to setup RecaptchaVerifier:', err);
    return null;
  }
}

// Request OTP SMS to phone number with automatic mobile network retry & timeout protection
export async function requestPhoneOtp(
  fullPhoneNumber: string,
  maxRetries = 2,
  language: 'ar' | 'en' = 'ar'
): Promise<OtpRequestResult> {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    return {
      success: false,
      error: language === 'ar'
        ? 'لم يتم العثور على تهيئة Firebase. يرجى التحقق من الاتصال بالشبكة.'
        : 'Firebase configuration not found. Please check your network connection.',
    };
  }

  // Pre-check offline status
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      success: false,
      error: language === 'ar'
        ? 'لا يوجد اتصال بالإنترنت حالياً. يرجى التأكد من تشغيل بيانات الهاتف أو الاتصال بشبكة Wi-Fi.'
        : 'No internet connection available. Please check mobile data or Wi-Fi.',
    };
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const activeVerifier = setupRecaptcha('recaptcha-container');
      if (!activeVerifier) {
        throw new Error('Failed to initialize reCAPTCHA verifier');
      }

      console.log(`[Firebase Phone Auth] Sending OTP attempt ${attempt + 1}/${maxRetries + 1} for ${fullPhoneNumber.slice(0, 5)}...`);

      // 22-second timeout per attempt to avoid indefinite hang on mobile carrier connections
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          const timeoutErr = new Error('Network response timeout during OTP request');
          (timeoutErr as any).code = 'auth/network-request-failed';
          reject(timeoutErr);
        }, 22000);
      });

      const confirmationResult = await Promise.race([
        signInWithPhoneNumber(authInstance, fullPhoneNumber, activeVerifier),
        timeoutPromise,
      ]);

      console.log('[Firebase Phone Auth] OTP sent successfully.');
      return { success: true, confirmationResult };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Firebase Phone Auth] Attempt ${attempt + 1} failed:`, err?.code, err?.message || err);

      // Clean up verifier before retry attempt
      clearRecaptchaVerifier('recaptcha-container');

      const isNetworkOrCaptcha =
        err?.code === 'auth/network-request-failed' ||
        err?.code === 'auth/captcha-check-failed' ||
        err?.message?.includes('network') ||
        err?.message?.includes('timeout') ||
        err?.message?.includes('مهلة') ||
        err?.message?.includes('already been rendered') ||
        err?.message?.includes('internal-error');

      const isUnrecoverable =
        err?.code === 'auth/invalid-phone-number' ||
        err?.code === 'auth/too-many-requests' ||
        err?.code === 'auth/quota-exceeded' ||
        err?.code === 'auth/unauthorized-domain';

      if (isUnrecoverable || attempt >= maxRetries || !isNetworkOrCaptcha) {
        break;
      }

      // Exponential backoff delay before retry (1s, 2s, 4s...)
      const backoffMs = 1000 * Math.pow(2, attempt);
      console.log(`[Firebase Phone Auth] Transient network/recaptcha error. Retrying with exponential backoff in ${backoffMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  let errorMsg = lastError?.message || (language === 'ar' ? 'تعذر إرسال رمز التحقق.' : 'Failed to send verification code.');
  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';

  if (lastError?.code === 'auth/operation-not-allowed') {
    errorMsg = language === 'ar'
      ? 'خدمة التحقق عبر الهاتف (Phone Auth) غير مفعّلة في مشروع Firebase. يرجى تفعيلها من: Firebase Console > Authentication > Sign-in method > Phone.'
      : 'Phone Authentication is not enabled in Firebase Console. Please enable it in Firebase Console > Authentication > Sign-in method > Phone.';
  } else if (lastError?.code === 'auth/unauthorized-domain' || lastError?.message?.includes('unauthorized-domain')) {
    errorMsg = language === 'ar'
      ? `هذا النطاق (${currentDomain}) غير مضاف في قائمة النطاقات المصرح بها. يرجى إضافته في Firebase Console > Authentication > Settings > Authorized domains.`
      : `Domain (${currentDomain}) is not authorized in Firebase Auth. Please add it to Firebase Console > Authentication > Settings > Authorized domains.`;
  } else if (lastError?.code === 'auth/invalid-phone-number') {
    errorMsg = language === 'ar'
      ? 'رقم الهاتف غير صحيح. يرجى التأكد من اختيار مفتاح الدولة وإدخال الرقم بشكل صحيح.'
      : 'Invalid phone number. Please check the country code and phone digits.';
  } else if (lastError?.code === 'auth/too-many-requests') {
    errorMsg = language === 'ar'
      ? 'تم إرسال طلبات كثيرة جداً لهذا الرقم مؤخراً. يرجى الانتظار بضع دقائق أو استخدام أرقام الاختبار (Phone numbers for testing) في Firebase Console.'
      : 'Too many requests sent. Please wait a few minutes or use Phone numbers for testing in Firebase Console.';
  } else if (lastError?.code === 'auth/quota-exceeded') {
    errorMsg = language === 'ar'
      ? 'تم استنفاد الحد اليومي لرسائل SMS (Spark plan). يرجى الترقية إلى Blaze plan أو استخدام أرقام الاختبار (Phone numbers for testing).'
      : 'Daily SMS quota exceeded on Firebase. Please use Phone numbers for testing in Firebase Console or upgrade to Blaze plan.';
  } else if (lastError?.code === 'auth/captcha-check-failed') {
    errorMsg = language === 'ar'
      ? 'فشل التحقق الأمني من reCAPTCHA. يرجى التأكد من عدم حظر ملفات تعريف الارتباط أو جدران الحماية وإعادة المحاولة.'
      : 'reCAPTCHA security check failed. Please check browser privacy/cookie settings and retry.';
  } else if (lastError?.code === 'auth/invalid-app-credential' || lastError?.code === 'auth/app-not-authorized') {
    errorMsg = language === 'ar'
      ? `بيانات التطبيق أو النطاق غير مصرح به في Firebase. تأكد من إضافة (${currentDomain}) في Authorized domains.`
      : `App domain (${currentDomain}) or credentials are not authorized in Firebase Console settings.`;
  } else if (
    lastError?.code === 'auth/network-request-failed' ||
    lastError?.message?.includes('network') ||
    lastError?.message?.includes('Network') ||
    lastError?.message?.includes('timeout') ||
    lastError?.message?.includes('مهلة')
  ) {
    errorMsg = 'auth/network-request-failed';
  } else if (lastError?.message?.includes('already been rendered')) {
    errorMsg = 'auth/network-request-failed';
  }

  return {
    success: false,
    error: errorMsg,
  };
}


// Local Profile Cache Helpers for aggressive background verification & offline resilience
export function getCachedUserProfile(uid: string): UserModel | null {
  try {
    const raw = localStorage.getItem(`hala.profile.${uid}`);
    if (raw) return JSON.parse(raw) as UserModel;
  } catch {}
  return null;
}

export function setCachedUserProfile(uid: string, profile: UserModel): void {
  try {
    // If avatar_url is a heavy base64 data URL (> 4KB), do not pollute localStorage with it
    let toStore = profile;
    if (profile.avatar_url && profile.avatar_url.startsWith('data:') && profile.avatar_url.length > 4096) {
      toStore = { ...profile, avatar_url: '' };
    }
    safeLocalStorageSet(`hala.profile.${uid}`, JSON.stringify(toStore));
  } catch {}
}

export function clearCachedUserProfile(uid: string): void {
  try {
    localStorage.removeItem(`hala.profile.${uid}`);
  } catch {}
}

// Proactive background verification for cached Firebase Auth session
export async function verifyCachedAuthSession(timeoutMs = 2500): Promise<{
  isAuthenticated: boolean;
  user: FirebaseUser | null;
  profile: UserModel | null;
}> {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    return { isAuthenticated: false, user: null, profile: null };
  }

  // 1. Immediate synchronous check
  let currentUser = authInstance.currentUser;

  // 2. Wait for authStateReady() if currentUser is null
  if (!currentUser && typeof authInstance.authStateReady === 'function') {
    try {
      await Promise.race([
        authInstance.authStateReady(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
      currentUser = authInstance.currentUser;
    } catch (e) {
      console.warn('[Auth] authStateReady wait warning:', e);
    }
  }

  // 3. One-time listener check if still null
  if (!currentUser) {
    currentUser = await new Promise<FirebaseUser | null>((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsub();
          resolve(null);
        }
      }, Math.min(1000, timeoutMs));

      const unsub = onAuthStateChanged(authInstance, (u) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          unsub();
          resolve(u);
        }
      });
    });
  }

  if (!currentUser) {
    return { isAuthenticated: false, user: null, profile: null };
  }

  // 4. Resolve cached or fresh profile aggressively
  let profile = getCachedUserProfile(currentUser.uid);
  if (!profile) {
    try {
      profile = await checkUserExists(currentUser.uid);
    } catch (err) {
      console.warn('[Auth] Background profile lookup warning:', err);
    }
  }

  return {
    isAuthenticated: true,
    user: currentUser,
    profile,
  };
}

// Check if user document exists in Firestore (with aggressive cache fallback)
export async function checkUserExists(uid: string): Promise<UserModel | null> {
  const localCached = getCachedUserProfile(uid);
  const userDocRef = doc(getFirebaseDb(), 'users', uid);

  let snapshot;
  try {
    snapshot = await Promise.race([
      getDocFromServer(userDocRef),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile server lookup timeout')), 3000)
      ),
    ]);
  } catch (serverErr) {
    // If server lookup timed out or failed on mobile network, check Firestore cache
    try {
      snapshot = await getDocFromCache(userDocRef);
    } catch {
      // If Firestore cache also unavailable, fall back to local localStorage cache
      if (localCached) {
        console.log(`[Auth] Using local cache for user ${uid} after server lookup error`);
        return localCached;
      }
      throw serverErr;
    }
  }

  if (!snapshot.exists()) {
    if (localCached) return localCached;
    return null;
  }
  const profile = { ...snapshot.data(), id: snapshot.id } as UserModel;
  setCachedUserProfile(uid, profile);
  void syncPublicProfile(profile);
  return profile;
}

// Deliberately excludes phone, blocks, moderation flags and private settings.
async function syncPublicProfile(profile: UserModel) {
  await setDoc(doc(getFirebaseDb(), 'users_public', profile.id), {
    id: profile.id, name: profile.name, avatar_url: profile.avatar_url || null,
    status: profile.status || '', public_key: profile.public_key || '',
  });
}

// Upload Avatar to Firebase Storage or format for Firestore
export async function uploadUserAvatar(uid: string, avatarDataUrlOrFile: string | File): Promise<string | null> {
  if (typeof avatarDataUrlOrFile === 'string' && !avatarDataUrlOrFile.startsWith('data:')) return avatarDataUrlOrFile;
  const fallback = await compressAvatar(avatarDataUrlOrFile);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const storageInstance = getFirebaseStorage();
    const storageRef = ref(storageInstance, `avatars/${uid}_${Date.now()}.jpg`);

    // Race upload against a 4-second timeout to guarantee non-blocking behavior
    const uploadPromise = (async () => {
      await uploadString(storageRef, fallback, 'data_url');
      return await getDownloadURL(storageRef);
    })();

    const timeoutPromise = new Promise<null>((_, reject) =>
      timeoutId = setTimeout(() => reject(new Error('Avatar upload timed out after 4 seconds')), 4000)
    );

    const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
    console.info('[Avatar] Upload completed.');
    return downloadUrl;
  } catch (err: any) {
    if (isFirebaseStorageQuotaError(err)) {
      console.warn('[Avatar] Firebase Storage quota exceeded for avatar upload. Using compressed fallback.');
    } else {
      console.warn(`[Avatar] Upload failed or timed out (${err?.message || err}). Proceeding with optional avatar fallback.`);
    }
    return fallback;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

// Update only the photo: preserve account metadata and original creation date.
export async function updateProfilePhoto(uid: string, dataUrl: string): Promise<string> {
  if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error('Please sign in again.');
  const avatarUrl = await uploadUserAvatar(uid, dataUrl);
  if (!avatarUrl) throw new Error('Profile photo upload failed.');
  await updateDoc(doc(getFirebaseDb(), 'users', uid), { avatar_url: avatarUrl });
  await checkUserExists(uid);
  return avatarUrl;
}

// Create or update user profile document in Firestore
export async function saveUserProfileToDatabase({
  uid,
  phoneNumber,
  name,
  avatarDataUrl,
  status = "Hey there, I'm using Hala",
}: {
  uid: string;
  phoneNumber: string;
  name: string;
  avatarDataUrl: string | null;
  status?: string;
}): Promise<UserModel> {
  console.log(`[Firestore] Starting user profile write for UID: ${uid}, Name: "${name}"`);
  const firestore = getFirebaseDb();
  // Never discard a selected photo silently when Storage is unavailable.
  const uploadedAvatarUrl = avatarDataUrl ? await uploadUserAvatar(uid, avatarDataUrl) : null;

  const nowIso = new Date().toISOString();

  // Step 1b: Ensure user has E2EE Key Pair generated and public key uploaded
  let publicKeyJwk: string | undefined;
  try {
    publicKeyJwk = await ensureUserE2EEKeyPair(uid);
  } catch (keyErr) {
    console.warn('[Profile] Keypair generation warning:', keyErr);
  }

  const userData: UserModel = {
    id: uid,
    phone: phoneNumber,
    name: name.trim(),
    avatar_url: uploadedAvatarUrl,
    status: status || "Hey there, I'm using Hala",
    created_at: nowIso,
    last_seen: nowIso,
    public_key: publicKeyJwk,
  };

  // Step 2: Write user document to Firestore
  try {
    const userDocRef = doc(firestore, 'users', uid);
    await setDoc(userDocRef, userData, { merge: true });
    await syncPublicProfile(userData);
    console.log(`[Firestore] User document written successfully to "users/${uid}"!`);
  } catch (firestoreErr: any) {
    console.error(`[Firestore] Failed to write user document to "users/${uid}":`, firestoreErr);
    throw new Error(
      firestoreErr?.message || `Database write failed with code: ${firestoreErr?.code || 'unknown'}`
    );
  }

  // Step 3: Set initial presence
  try {
    console.log(`[Firestore] Setting initial presence for "presence/${uid}"...`);
    const presenceRef = doc(firestore, 'presence', uid);
    await setDoc(presenceRef, {
      online: true,
      lastSeen: serverTimestamp(),
    }, { merge: true });
    console.log(`[Firestore] Initial presence set successfully!`);
  } catch (err) {
    console.warn('[Firestore] Could not set initial presence (non-fatal):', err);
  }

  setCachedUserProfile(uid, userData);
  return userData;
}

// Update presence record (writes serverTimestamp, never writes online: false)
export async function setUserPresence(uid: string, _online: boolean = true): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const presenceRef = doc(firestore, 'presence', uid);
    await setDoc(presenceRef, {
      online: true,
      lastSeen: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('Error setting presence:', err);
  }
}

// Listen to Auth State
export function onAuthUserChanged(callback: (user: FirebaseUser | null) => void) {
  const authInstance = getFirebaseAuth();
  return onAuthStateChanged(authInstance, callback);
}

// Sign Out
export async function logoutUser(): Promise<void> {
  const authInstance = getFirebaseAuth();
  try {
    safeLocalStorageSet('hala.explicitLogout', 'true');
    if (authInstance?.currentUser) {
      const uid = authInstance.currentUser.uid;
      clearCachedUserProfile(uid);
      // Offline is determined purely by lastSeen staleness; we do not write online: false
      try {
        const messaging = getMessaging(getFirebaseApp());
        const token = await getToken(messaging);
        if (token) {
          await deleteDoc(doc(getFirebaseDb(), 'users', uid, 'fcmTokens', token)).catch(() => {});
        }
      } catch {}
    }
    if (authInstance) {
      await signOut(authInstance);
    }
  } catch (err) {
    console.warn('Sign out error:', err);
  }
}

// Setup foreground FCM notification listener via onMessage
let isForegroundMessagingSetup = false;

export function setupForegroundMessagingListener(messagingInstance?: any): Unsubscribe | null {
  if (typeof window === 'undefined') return null;
  try {
    const messaging = messagingInstance || getMessaging(getFirebaseApp());
    if (!isForegroundMessagingSetup) {
      isForegroundMessagingSetup = true;
      console.log('[FCM] Setting up foreground message listener...');
      return onMessage(messaging, (payload) => {
        console.log('[FCM] Received foreground message:', payload);
        const title = payload.notification?.title || payload.data?.title || 'Hala Chat';
        const body = payload.notification?.body || payload.data?.body || payload.data?.content || 'New message received';

        if (Notification.permission === 'granted') {
          try {
            const notif = new Notification(title, {
              body,
              icon: payload.notification?.icon || payload.data?.icon || '/icons/icon-192.png',
              badge: '/icons/notification-badge-96.png',
              tag: payload.data?.chatId ? `chat-${payload.data.chatId}` : `fcm-${Date.now()}`,
            });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch (err) {
            console.warn('[FCM] Failed to render foreground notification:', err);
          }
        }
      });
    }
  } catch (err) {
    console.warn('[FCM] Foreground message listener registration notice:', err);
  }
  return null;
}

// Request notification permission and save token
export async function requestNotificationPermission(uid: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const app = getFirebaseApp();
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      let swRegistration: ServiceWorkerRegistration | undefined;
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        if (swRegistration.installing || swRegistration.waiting) {
          await navigator.serviceWorker.ready;
        }
      } catch (swErr) {
        console.warn('[FCM] Service worker registration notice:', swErr);
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      const options: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration } = {};
      if (vapidKey) options.vapidKey = vapidKey;
      if (swRegistration) options.serviceWorkerRegistration = swRegistration;

      let token: string | null = null;
      try {
        token = await getToken(messaging, options);
      } catch (tokenErr) {
        console.warn('[FCM] getToken with options failed, retrying fallback getToken:', tokenErr);
        try {
          token = await getToken(messaging);
        } catch (retryErr) {
          console.error('[FCM] getToken fallback failed:', retryErr);
        }
      }

      if (token) {
        await setDoc(doc(getFirebaseDb(), 'users', uid, 'fcmTokens', token), {
          token,
          updatedAt: serverTimestamp(),
          platform: 'web',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }, { merge: true });
        console.log('[FCM] Push token registered successfully for user:', uid);

        // Ensure foreground listener is active
        setupForegroundMessagingListener(messaging);
        return token;
      }
    }
  } catch (err) {
    console.error('[FCM] Error requesting notification permission:', err);
  }
  return null;
}

// Production discovery contains actual public profiles only.
export const DEFAULT_CONTACTS: ContactItem[] = [];

// Fetch all registered users for contact picker
export async function fetchUsersForContactPicker(currentUserId: string): Promise<ContactItem[]> {
  const firestore = getFirebaseDb();
  const contactsMap = new Map<string, ContactItem>();

  // Add default demo contacts
  DEFAULT_CONTACTS.forEach((c) => {
    if (c.id !== currentUserId) {
      contactsMap.set(c.id, c);
    }
  });

  try {
    const usersColRef = collection(firestore, 'users_public');
    const snapshot = await getDocs(query(usersColRef, limit(100)));

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as UserModel;
      if (docSnap.id !== currentUserId && data.name) {
        contactsMap.set(docSnap.id, {
          id: docSnap.id,
          name: data.name,
          phone: data.phone || '',
          avatar_url: data.avatar_url || null,
          status: data.status || "Hey there, I'm using Hala",
          created_at: data.created_at,
          last_seen: data.last_seen,
          public_key: data.public_key,
        });
      }
    });
  } catch (err) {
    console.warn('Could not fetch all users from Firestore:', err);
  }

  // Also fetch saved contacts for this user
  try {
    const userContactsColRef = collection(firestore, 'users', currentUserId, 'contacts');
    const savedSnapshot = await getDocs(userContactsColRef);
    savedSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (docSnap.id !== currentUserId && (data.name || data.phone)) {
        contactsMap.set(docSnap.id, {
          id: docSnap.id,
          name: data.name || data.phone || 'Contact',
          phone: data.phone || '',
          avatar_url: data.avatar_url || data.avatarUrl || null,
          status: data.status || "Added via QR code",
          created_at: data.created_at || data.added_at,
        });
      }
    });
  } catch (err) {
    console.warn('Could not fetch saved user contacts:', err);
  }

  return Array.from(contactsMap.values());
}

// Save a contact to the user's personal address book in Firestore
export async function saveUserContact(
  currentUserId: string,
  contact: ContactItem
): Promise<void> {
  const firestore = getFirebaseDb();
  const contactDocRef = doc(firestore, 'users', currentUserId, 'contacts', contact.id);
  const nowIso = new Date().toISOString();

  await setDoc(
    contactDocRef,
    {
      id: contact.id,
      name: contact.name,
      phone: contact.phone || '',
      avatar_url: contact.avatar_url || null,
      status: contact.status || "Hey there, I'm using Hala",
      added_at: nowIso,
      updated_at: nowIso,
    },
    { merge: true }
  );
}

// Lookup a user by ID or Phone number across Firestore
export async function fetchUserByIdOrPhone(identifier: string): Promise<ContactItem | null> {
  const cleanId = identifier.trim();
  if (!cleanId) return null;

  // Check in DEFAULT_CONTACTS first
  const matchDemo = DEFAULT_CONTACTS.find(
    (c) => c.id === cleanId || (c.phone && c.phone.replace(/\D/g, '') === cleanId.replace(/\D/g, ''))
  );
  if (matchDemo) return matchDemo;

  const firestore = getFirebaseDb();

  // 1. Direct ID lookup
  try {
    const docRef = doc(firestore, 'users_public', cleanId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as UserModel;
      return {
        id: snap.id,
        name: data.name,
        phone: data.phone || '',
        avatar_url: data.avatar_url || null,
        status: data.status || "Hey there, I'm using Hala",
        public_key: data.public_key,
      };
    }
  } catch (err) {
    console.warn('Error looking up user by ID:', err);
  }

  // Phone-number discovery requires a private backend lookup; use Hala ID/QR.

  return null;
}

// Subscribe to real-time chats for a user
export function subscribeToUserChats(
  userId: string,
  callback: (chats: ChatModel[]) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const chatsRef = collection(firestore, 'chats');
  const q = query(chatsRef, where('participants', 'array-contains', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const chats: ChatModel[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        chats.push({
          id: docSnap.id,
          type: data.type || '1-1',
          name: data.name || data.title,
          title: data.title || data.name,
          description: data.description,
          avatarUrl: data.avatarUrl || data.avatar_url || null,
          createdBy: data.createdBy || data.created_by,
          ownerId: data.ownerId || data.createdBy || data.created_by,
          adminIds: data.adminIds || data.admin_ids || (data.createdBy ? [data.createdBy] : []),
          isPublic: data.isPublic !== undefined ? data.isPublic : true,
          allowMemberPosts: data.allowMemberPosts !== undefined ? data.allowMemberPosts : false,
          subscriberCount: data.subscriberCount || (data.participants ? data.participants.length : 1),
          disappearingMessagesDuration: data.disappearingMessagesDuration || 0,
          participants: data.participants || [],
          participantDetails: data.participantDetails || {},
          unreadCount: data.unreadCount || {},
          typing: data.typing || {},
          lastMessage: data.lastMessage || null,
          pinnedBy: Array.isArray(data.pinnedBy) ? data.pinnedBy : [],
          archivedBy: Array.isArray(data.archivedBy) ? data.archivedBy : [],
          pinnedMessageIds: Array.isArray(data.pinnedMessageIds) ? data.pinnedMessageIds : [],
          wallpaper: data.wallpaper || null,
          wallpaperBy: data.wallpaperBy || {},
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      });

      // Sort by updatedAt descending (most recent first)
      chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      callback(chats);
    },
    (error) => {
      console.warn('subscribeToUserChats error:', error);
      callback([]);
    }
  );
}

// Subscribe to Single Chat Document (for real-time typing indicators, participants, and status)
export function subscribeToSingleChat(
  chatId: string,
  callback: (chat: ChatModel | null) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);

  return onSnapshot(
    chatRef,
    (docSnap) => {
      if (!docSnap.exists()) {
        callback(null);
        return;
      }
      const data = docSnap.data();
      const chat: ChatModel = {
        id: docSnap.id,
        type: data.type || '1-1',
        name: data.name || data.title,
        title: data.title || data.name,
        description: data.description,
        avatarUrl: data.avatarUrl || data.avatar_url || null,
        createdBy: data.createdBy || data.created_by,
        ownerId: data.ownerId || data.createdBy || data.created_by,
        adminIds: data.adminIds || data.admin_ids || (data.createdBy ? [data.createdBy] : []),
        isPublic: data.isPublic !== undefined ? data.isPublic : true,
        allowMemberPosts: data.allowMemberPosts !== undefined ? data.allowMemberPosts : false,
        subscriberCount: data.subscriberCount || (data.participants ? data.participants.length : 1),
        disappearingMessagesDuration: data.disappearingMessagesDuration || 0,
        participants: data.participants || [],
        participantDetails: data.participantDetails || {},
        unreadCount: data.unreadCount || {},
        typing: data.typing || {},
        lastMessage: data.lastMessage || null,
        pinnedBy: Array.isArray(data.pinnedBy) ? data.pinnedBy : [],
        archivedBy: Array.isArray(data.archivedBy) ? data.archivedBy : [],
        pinnedMessageIds: Array.isArray(data.pinnedMessageIds) ? data.pinnedMessageIds : [],
        wallpaper: data.wallpaper || null,
        wallpaperBy: data.wallpaperBy || {},
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
      callback(chat);
    },
    (error) => {
      console.warn('subscribeToSingleChat error:', error);
    }
  );
}

// Find or Create 1-on-1 Chat
export async function findOrCreateOneOnOneChat(
  currentUserId: string,
  currentUserProfile: UserProfile,
  targetContact: ContactItem
): Promise<string> {
  const firestore = getFirebaseDb();
  const chatsRef = collection(firestore, 'chats');

  try {
    // Check if chat already exists
    const q = query(chatsRef, where('participants', 'array-contains', currentUserId));
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (
        data.type === '1-1' &&
        Array.isArray(data.participants) &&
        data.participants.includes(targetContact.id)
      ) {
        // Chat already exists
        return docSnap.id;
      }
    }
  } catch (err) {
    console.warn('Error checking existing chats:', err);
  }

  // Create new chat document
  const nowIso = new Date().toISOString();
  const newChatData: Omit<ChatModel, 'id'> = {
    type: '1-1',
    participants: [currentUserId, targetContact.id],
    participantDetails: {
      [currentUserId]: {
        name: currentUserProfile.name,
        avatarUrl: currentUserProfile.avatarUrl,
        phone: currentUserProfile.phoneNumber,
      },
      [targetContact.id]: {
        name: targetContact.name,
        avatarUrl: targetContact.avatar_url || null,
        phone: targetContact.phone,
      },
    },
    unreadCount: {
      [currentUserId]: 0,
      [targetContact.id]: 0,
    },
    typing: {
      [currentUserId]: false,
      [targetContact.id]: false,
    },
    disappearingMessagesDuration: 0,
    lastMessage: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const docRef = await addDoc(chatsRef, newChatData);
  return docRef.id;
}

// Create New Group Chat
export async function createNewGroupChat({
  creatorId,
  creatorProfile,
  groupName,
  groupAvatarUrl,
  selectedContacts,
}: {
  creatorId: string;
  creatorProfile: UserProfile;
  groupName: string;
  groupAvatarUrl: string | null;
  selectedContacts: ContactItem[];
}): Promise<string> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();

  // Participant IDs (Creator + Selected Contacts)
  const participantIds = [creatorId, ...selectedContacts.map((c) => c.id)];

  // Participant Details Mapping
  const participantDetails: {
    [uid: string]: {
      name: string;
      avatarUrl?: string | null;
      phone?: string;
      role: 'admin' | 'member';
    };
  } = {
    [creatorId]: {
      name: creatorProfile.name,
      avatarUrl: creatorProfile.avatarUrl || null,
      phone: creatorProfile.phoneNumber,
      role: 'admin',
    },
  };

  selectedContacts.forEach((c) => {
    participantDetails[c.id] = {
      name: c.name,
      avatarUrl: c.avatar_url || null,
      phone: c.phone,
      role: 'member',
    };
  });

  const unreadCount: { [uid: string]: number } = {};
  const typing: { [uid: string]: boolean } = {};
  participantIds.forEach((uid) => {
    unreadCount[uid] = 0;
    typing[uid] = false;
  });

  // Generate E2EE Group Symmetric Key & Encrypt for members
  const encryptedGroupKeys: Record<
    string,
    { ciphertext: string; iv: string; senderPubKeyJwk: string }
  > = {};
  try {
    const { rawBase64 } = await generateGroupSymmetricKey();
    const creatorPubKeyJwk =
      creatorProfile.publicKey || (await ensureUserE2EEKeyPair(creatorId));

    // Encrypt group key for creator
    const creatorEncPkg = await encryptGroupKeyForMember({
      senderUserId: creatorId,
      memberUserId: creatorId,
      memberPublicKeyJwk: creatorPubKeyJwk,
      rawGroupKeyBase64: rawBase64,
    });
    if (creatorEncPkg) {
      encryptedGroupKeys[creatorId] = creatorEncPkg;
    }

    // Encrypt group key for each selected contact who has a public key
    for (const c of selectedContacts) {
      if (c.public_key) {
        const encPkg = await encryptGroupKeyForMember({
          senderUserId: creatorId,
          memberUserId: c.id,
          memberPublicKeyJwk: c.public_key,
          rawGroupKeyBase64: rawBase64,
        });
        if (encPkg) {
          encryptedGroupKeys[c.id] = encPkg;
        }
      }
    }
  } catch (grpKeyErr) {
    console.warn('Failed to generate/encrypt E2EE group key:', grpKeyErr);
  }

  // 1. Create chat document in 'chats'
  const chatsRef = collection(firestore, 'chats');
  const chatDocRef = await addDoc(chatsRef, {
    type: 'group',
    name: groupName.trim(),
    title: groupName.trim(),
    avatarUrl: groupAvatarUrl,
    createdBy: creatorId,
    adminIds: [creatorId],
    participants: participantIds,
    participantDetails,
    unreadCount,
    typing,
    encryptedGroupKeys,
    lastMessage: {
      senderId: creatorId,
      senderName: creatorProfile.name,
      content: `Group "${groupName.trim()}" created`,
      type: 'text',
      timestamp: nowIso,
      status: 'sent',
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const groupId = chatDocRef.id;

  // 2. Create group document in 'groups'
  try {
    const groupDocRef = doc(firestore, 'groups', groupId);
    await setDoc(groupDocRef, {
      id: groupId,
      name: groupName.trim(),
      avatar_url: groupAvatarUrl,
      created_by: creatorId,
      created_at: nowIso,
      admin_ids: [creatorId],
    });

    // 3. Create group members subcollection
    for (const pid of participantIds) {
      const memberRef = doc(firestore, 'groups', groupId, 'members', pid);
      await setDoc(memberRef, {
        group_id: groupId,
        user_id: pid,
        role: pid === creatorId ? 'admin' : 'member',
        name: participantDetails[pid]?.name || 'Member',
        avatar_url: participantDetails[pid]?.avatarUrl || null,
        phone: participantDetails[pid]?.phone || '',
        joined_at: nowIso,
      });
    }
  } catch (err) {
    console.warn('Error setting groups table entries (non-fatal):', err);
  }

  // 4. Create initial welcome system message in chat
  try {
    const messagesRef = collection(firestore, 'chats', groupId, 'messages');
    await addDoc(messagesRef, {
      senderId: creatorId,
      senderName: creatorProfile.name,
      content: `🌟 Group "${groupName.trim()}" created by ${creatorProfile.name}`,
      type: 'text',
      status: 'sent',
      timestamp: nowIso,
    });
  } catch (err) {
    console.warn('Error creating initial group message:', err);
  }

  return groupId;
}

// Update Group Info (Admin only)
export async function updateGroupInfo(
  chatId: string,
  name: string,
  avatarUrl: string | null
): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  const nowIso = new Date().toISOString();

  await updateDoc(chatRef, {
    name: name.trim(),
    title: name.trim(),
    avatarUrl: avatarUrl,
    updatedAt: nowIso,
  });

  try {
    const groupRef = doc(firestore, 'groups', chatId);
    await updateDoc(groupRef, {
      name: name.trim(),
      avatar_url: avatarUrl,
    });
  } catch {
    // ignore
  }
}

// Add Members to Group Chat (Admin only)
export async function addMembersToGroup(
  chatId: string,
  newMembers: ContactItem[],
  existingChat: ChatModel
): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  const nowIso = new Date().toISOString();

  const newParticipantIds = newMembers.map((m) => m.id);
  const updatedParticipants = Array.from(new Set([...existingChat.participants, ...newParticipantIds]));

  const updatedDetails = { ...(existingChat.participantDetails || {}) };
  newMembers.forEach((m) => {
    updatedDetails[m.id] = {
      name: m.name,
      avatarUrl: m.avatar_url || null,
      phone: m.phone,
      role: 'member',
    };
  });

  await updateDoc(chatRef, {
    participants: updatedParticipants,
    participantDetails: updatedDetails,
    updatedAt: nowIso,
  });

  // Add to groups/members subcollection
  try {
    for (const m of newMembers) {
      const memberRef = doc(firestore, 'groups', chatId, 'members', m.id);
      await setDoc(memberRef, {
        group_id: chatId,
        user_id: m.id,
        role: 'member',
        name: m.name,
        avatar_url: m.avatar_url || null,
        phone: m.phone,
        joined_at: nowIso,
      });
    }
  } catch {
    // ignore
  }
}

// Leave Group Chat
export async function leaveGroupChat(chatId: string, userId: string): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;

  const data = snap.data();
  const currentParticipants: string[] = data.participants || [];
  const updatedParticipants = currentParticipants.filter((p) => p !== userId);

  await updateDoc(chatRef, {
    participants: updatedParticipants,
    updatedAt: new Date().toISOString(),
  });
}

// Subscribe to Messages for a Chat
export function subscribeToChatMessages(
  chatId: string,
  callback: (messages: MessageModel[]) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const messagesRef = collection(firestore, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  const parseDoc = (docSnap: any): MessageModel => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      chatId,
      senderId: data.senderId,
      senderName: data.senderName,
      content: data.content,
      caption: data.caption,
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileType: data.fileType,
      type: data.type || 'text',
      status: data.status || 'sent',
      timestamp: data.timestamp,
      duration: data.duration,
      stickerUrl: data.stickerUrl,
      pollData: projectPoll(data.pollData, data.pollVotes),
      mediaIv: data.mediaIv,
      expiresAt: data.expiresAt,
      reactions: projectReactions(data.reactions, data.reactionsBy),
      isPinned: Boolean(data.isPinned),
      pinnedAt: data.pinnedAt,
      pinnedBy: data.pinnedBy,
      isEdited: Boolean(data.isEdited),
      editedAt: data.editedAt,
      deletedFor: Array.isArray(data.deletedFor) ? data.deletedFor : [],
      isDeletedForEveryone: Boolean(data.isDeletedForEveryone),
      deletedAt: data.deletedAt,
      readBy: Array.isArray(data.readBy) ? data.readBy : [],
      deliveredTo: Array.isArray(data.deliveredTo) ? data.deliveredTo : [],
    };
  };

  const filterNonExpired = (rawMsgs: MessageModel[]): MessageModel[] => {
    const now = Date.now();
    return rawMsgs.filter((msg) => {
      if (!msg.expiresAt) return true;
      const expiryTime = new Date(msg.expiresAt).getTime();
      return isNaN(expiryTime) || expiryTime > now;
    });
  };

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: MessageModel[] = [];
      snapshot.forEach((docSnap) => {
        msgs.push(parseDoc(docSnap));
      });
      // Sort client-side just in case
      msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      callback(filterNonExpired(msgs));
    },
    (error) => {
      console.warn('subscribeToChatMessages error, trying unordered fallback:', error);
      return onSnapshot(messagesRef, (snap) => {
        const msgs: MessageModel[] = [];
        snap.forEach((docSnap) => {
          msgs.push(parseDoc(docSnap));
        });
        msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        callback(filterNonExpired(msgs));
      });
    }
  );
}

// Send Message (Text, Image, Video, Voice, Sticker, Poll)
interface NonContactMessageLog {
  recipientId: string;
  timestamp: number;
}
const nonContactMessageCache: Record<string, NonContactMessageLog[]> = {};

export async function sendChatMessage({
  chatId,
  senderId,
  senderName,
  content,
  caption,
  type = 'text',
  duration,
  stickerUrl,
  pollData,
  disappearingDuration = 0,
  recipientId,
  isGroup = false,
  otherParticipantIds = [],
  conversationKey,
  mediaIv,
  fileName,
  fileSize,
  fileType,
  timestamp,
}: {
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  caption?: string;
  type?: 'text' | 'image' | 'video' | 'voice' | 'sticker' | 'poll' | 'file' | 'location';
  duration?: number;
  stickerUrl?: string;
  pollData?: PollData;
  disappearingDuration?: number;
  recipientId?: string;
  isGroup?: boolean;
  otherParticipantIds?: string[];
  conversationKey?: CryptoKey | null;
  mediaIv?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  timestamp?: string;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const nowIso = timestamp || new Date().toISOString();

  if (getFirebaseAuth().currentUser?.uid !== senderId) throw new Error('Please sign in again.');
  // Membership, sender identity and blocking are enforced by Firestore rules.

  let finalContent = content.trim();
  let finalCaption = caption && caption.trim() ? caption.trim() : undefined;

  // Encrypt text content and caption with session key if available
  if (type === 'text' && finalContent) {
    if (!conversationKey) {
      throw new Error('Secure conversation key is not ready. Message was not sent. Reopen the chat and try again.');
    }
    const encRes = await encryptTextContent(finalContent, conversationKey);
    if (!encRes?.encryptedString) throw new Error('Could not encrypt this message. Please retry.');
    finalContent = encRes.encryptedString;
  }

  if (finalCaption) {
    if (!conversationKey) {
      throw new Error('Secure conversation key is not ready. Caption was not sent. Reopen the chat and try again.');
    }
    const encCap = await encryptTextContent(finalCaption, conversationKey);
    if (!encCap?.encryptedString) throw new Error('Could not encrypt this caption. Please retry.');
    finalCaption = encCap.encryptedString;
  }

  const msgData: Record<string, any> = {
    senderId,
    senderName,
    content: finalContent,
    type,
    status: 'sent',
    timestamp: nowIso,
    reactions: {},
    deletedFor: [],
    readBy: [],
    deliveredTo: [],
  };

  if (finalCaption) {
    msgData.caption = finalCaption;
  }

  if (mediaIv) {
    msgData.mediaIv = mediaIv;
  }

  if (duration !== undefined && duration > 0) {
    msgData.duration = duration;
  }

  if (stickerUrl) {
    msgData.stickerUrl = stickerUrl;
  }

  if (pollData) {
    msgData.pollData = pollData;
  }

  if (fileName) {
    msgData.fileName = fileName;
  }

  if (fileSize !== undefined) {
    msgData.fileSize = fileSize;
  }

  if (fileType) {
    msgData.fileType = fileType;
  }

  // Calculate disappearing messages expiry
  if (disappearingDuration && disappearingDuration > 0) {
    const expiryDate = new Date(Date.now() + disappearingDuration * 1000);
    msgData.expiresAt = expiryDate.toISOString();
  }

  // Add to subcollection
  const messagesRef = collection(firestore, 'chats', chatId, 'messages');
  const msgDoc = await addDoc(messagesRef, msgData);

  // Update decryption cache for sender immediate preview
  if (type === 'text' && finalContent && finalContent !== content) {
    const { setCachedDecryptedText } = await import('./crypto');
    setCachedDecryptedText(msgDoc.id, content.trim());
  }

  // Update parent chat document
  const chatRef = doc(firestore, 'chats', chatId);
  try {
    const previewContent =
      type === 'image'
        ? caption ? `📷 ${caption}` : '📷 Photo'
        : type === 'video'
        ? caption ? `🎥 ${caption}` : '🎥 Video'
        : type === 'voice'
        ? '🎤 Voice message'
        : type === 'sticker'
        ? `🎨 ${content || 'Sticker'}`
        : type === 'poll'
        ? `📊 ${pollData?.question || 'Poll'}`
        : type === 'file'
        ? `📄 ${fileName || caption || 'Document'}`
        : (conversationKey ? finalContent : content.trim());

    const updatePayload: Record<string, any> = {
      lastMessage: {
        id: msgDoc.id,
        senderId,
        senderName,
        content: previewContent,
        type,
        timestamp: nowIso,
        status: 'sent',
        deliveredTo: [],
        readBy: [],
        fileName: type === 'file' ? fileName : undefined,
      },
      updatedAt: nowIso,
    };

    if (isGroup && otherParticipantIds.length > 0) {
      otherParticipantIds.forEach((pid) => {
        if (pid !== senderId) {
          updatePayload[`unreadCount.${pid}`] = increment(1);
        }
      });
    } else if (recipientId) {
      updatePayload[`unreadCount.${recipientId}`] = increment(1);
    }

    await updateDoc(chatRef, updatePayload);
  } catch (err) {
    console.warn('Failed to update parent chat document:', err);
  }

  return msgDoc.id;
}

/**
 * Saves recorded audio/video call media file to Firebase Storage
 * and appends a call recording message entry in the conversation chat log.
 */
export async function saveCallRecordingMessage({
  chatId,
  currentUserId,
  currentUserProfile,
  targetUserId,
  targetUserName,
  recordingBlob,
  callType,
  durationSeconds,
}: {
  chatId?: string;
  currentUserId: string;
  currentUserProfile: UserProfile;
  targetUserId: string;
  targetUserName: string;
  recordingBlob: Blob;
  callType: 'voice' | 'video';
  durationSeconds: number;
}): Promise<string | null> {
  try {
    let targetChatId = chatId;
    if (!targetChatId) {
      targetChatId = await findOrCreateOneOnOneChat(currentUserId, currentUserProfile, {
        id: targetUserId,
        name: targetUserName,
        phone: '',
      });
    }

    if (!targetChatId) {
      console.warn('Could not resolve target chatId for call recording upload');
      return null;
    }

    const timestamp = Date.now();
    const isVideo = callType === 'video';
    const extension = isVideo ? 'webm' : 'm4a';
    const storagePath = `call_recordings/${targetChatId}_${timestamp}.${extension}`;

    let recordingUrl = '';
    try {
      const storageInstance = getFirebaseStorage();
      const storageRef = ref(storageInstance, storagePath);
      await uploadBytes(storageRef, recordingBlob, {
        contentType: isVideo ? 'video/webm' : 'audio/webm',
      });
      recordingUrl = await getDownloadURL(storageRef);
      console.log('[CallRecording] Uploaded call recording to Firebase Storage:', recordingUrl);
    } catch (storageErr) {
      console.warn('[CallRecording] Firebase Storage upload fallback to Blob URL:', storageErr);
      recordingUrl = URL.createObjectURL(recordingBlob);
    }

    const msgType = isVideo ? 'video' : 'voice';
    const fileName = `Call Recording (${isVideo ? 'Video' : 'Audio'})`;

    const msgId = await sendChatMessage({
      chatId: targetChatId,
      senderId: currentUserId,
      senderName: currentUserProfile.name,
      content: recordingUrl,
      type: msgType,
      duration: durationSeconds,
      fileName,
      fileSize: recordingBlob.size,
    });

    console.log('[CallRecording] Call recording entry appended to chat log:', msgId);
    return msgId;
  } catch (err) {
    console.error('[CallRecording] Failed to save call recording to Firebase:', err);
    return null;
  }
}

/**
 * Isolated Text Message Sender with dedicated encryption & Firestore write logging
 * Completely isolated from voice note / media pipelines
 */
export async function sendChatTextMessage({
  chatId,
  senderId,
  senderName,
  content,
  disappearingDuration = 0,
  recipientId,
  isGroup = false,
  otherParticipantIds = [],
  conversationKey,
  timestamp,
}: {
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  disappearingDuration?: number;
  recipientId?: string;
  isGroup?: boolean;
  otherParticipantIds?: string[];
  conversationKey?: CryptoKey | null;
  timestamp?: string;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const nowIso = timestamp || new Date().toISOString();

  // (a) Message Content Encryption Logging
  let finalContent = content.trim();
  console.log('[Text Message Flow - Step a] Starting message content encryption...', {
    hasConversationKey: Boolean(conversationKey),
    rawTextLength: finalContent.length,
  });

  if (!conversationKey) {
    throw new Error('Secure conversation key is not ready. Message was not sent. Reopen the chat and try again.');
  }

  if (finalContent) {
    try {
      const encRes = await encryptTextContent(finalContent, conversationKey);
      if (!encRes?.encryptedString) throw new Error('Could not encrypt this message. Please retry.');
      finalContent = encRes.encryptedString;
    } catch (encErr) {
      console.error('[Text Message Flow - Step a] Message content encryption FAILED with error:', encErr);
      throw encErr;
    }
  }

  // (b) Firestore Document Write Logging
  console.log('[Text Message Flow - Step b] Starting Firestore document write for chat:', chatId);
  const msgData: Record<string, any> = {
    senderId,
    senderName,
    content: finalContent,
    type: 'text',
    status: 'sent',
    timestamp: nowIso,
    reactions: {},
    deletedFor: [],
    readBy: [],
    deliveredTo: [],
  };

  if (disappearingDuration && disappearingDuration > 0) {
    const expiryDate = new Date(Date.now() + disappearingDuration * 1000);
    msgData.expiresAt = expiryDate.toISOString();
  }

  try {
    const messagesRef = collection(firestore, 'chats', chatId, 'messages');
    const msgDoc = await addDoc(messagesRef, msgData);
    console.log('[Text Message Flow - Step b] Firestore message document write SUCCEEDED. Message ID:', msgDoc.id);

    // Update decryption cache for sender immediate preview
    if (finalContent && finalContent !== content) {
      const { setCachedDecryptedText } = await import('./crypto');
      setCachedDecryptedText(msgDoc.id, content.trim());
    }

    // Update parent chat document
    const chatRef = doc(firestore, 'chats', chatId);
    try {
      const updatePayload: Record<string, any> = {
        lastMessage: {
          id: msgDoc.id,
          senderId,
          senderName,
          content: conversationKey ? finalContent : content.trim(),
          type: 'text',
          timestamp: nowIso,
          status: 'sent',
          deliveredTo: [],
          readBy: [],
        },
        updatedAt: nowIso,
      };

      if (isGroup && otherParticipantIds.length > 0) {
        otherParticipantIds.forEach((pid) => {
          if (pid !== senderId) {
            updatePayload[`unreadCount.${pid}`] = increment(1);
          }
        });
      } else if (recipientId) {
        updatePayload[`unreadCount.${recipientId}`] = increment(1);
      }

      await updateDoc(chatRef, updatePayload);
      console.log('[Text Message Flow - Step b] Parent chat document update SUCCEEDED');
    } catch (parentErr) {
      console.warn('[Text Message Flow - Step b] Parent chat document update non-fatal warning:', parentErr);
    }



    return msgDoc.id;
  } catch (writeErr) {
    console.error('[Text Message Flow - Step b] Firestore message document write FAILED with error:', writeErr);
    throw writeErr;
  }
}

// Toggle Reaction on a Message
export async function toggleMessageReaction({
  chatId,
  messageId,
  emoji,
  userId,
}: {
  chatId: string;
  messageId: string;
  emoji: string;
  userId: string;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const msgRef = doc(firestore, 'chats', chatId, 'messages', messageId);

  if (getFirebaseAuth().currentUser?.uid !== userId) throw new Error('Please sign in again.');
  await runTransaction(firestore, async tx => {
    const snap = await tx.get(msgRef);
    if (!snap.exists()) return;
    const previous = snap.data().reactionsBy?.[userId];
    tx.update(msgRef, { [`reactionsBy.${userId}`]: previous === emoji ? '' : emoji });
  });
}

// Edit a Sent Chat Message (Text only)
export async function editChatMessage({
  chatId,
  messageId,
  newContent,
  isLastMessage = false,
  conversationKey = null,
}: {
  chatId: string;
  messageId: string;
  newContent: string;
  isLastMessage?: boolean;
  conversationKey?: CryptoKey | null;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const msgRef = doc(firestore, 'chats', chatId, 'messages', messageId);
  const nowIso = new Date().toISOString();

  let finalContent = newContent.trim();
  if (conversationKey) {
    const { encryptTextContent } = await import('./crypto');
    const encRes = await encryptTextContent(finalContent, conversationKey);
    if (encRes?.encryptedString) {
      finalContent = encRes.encryptedString;
    }
  }

  // Update decryption cache
  if (finalContent !== newContent.trim()) {
    const { setCachedDecryptedText } = await import('./crypto');
    setCachedDecryptedText(messageId, newContent.trim());
  }

  await updateDoc(msgRef, {
    content: finalContent,
    isEdited: true,
    editedAt: nowIso,
  });

  if (isLastMessage) {
    const chatRef = doc(firestore, 'chats', chatId);
    try {
      await updateDoc(chatRef, {
        'lastMessage.content': finalContent,
        updatedAt: nowIso,
      });
    } catch {
      // non-fatal
    }
  }
}

// Delete Message For Current User Only
export async function deleteChatMessageForMe({
  chatId,
  messageId,
  userId,
}: {
  chatId: string;
  messageId: string;
  userId: string;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const msgRef = doc(firestore, 'chats', chatId, 'messages', messageId);

  await updateDoc(msgRef, {
    deletedFor: arrayUnion(userId),
  });
}

// Delete Message For Everyone
export async function deleteChatMessageForEveryone({
  chatId,
  messageId,
  deletedText,
  isLastMessage = false,
}: {
  chatId: string;
  messageId: string;
  deletedText: string;
  isLastMessage?: boolean;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const msgRef = doc(firestore, 'chats', chatId, 'messages', messageId);
  const nowIso = new Date().toISOString();

  await updateDoc(msgRef, {
    isDeletedForEveryone: true,
    content: deletedText,
    type: 'text',
    caption: '',
    deletedAt: nowIso,
    reactions: {},
  });

  if (isLastMessage) {
    const chatRef = doc(firestore, 'chats', chatId);
    try {
      await updateDoc(chatRef, {
        'lastMessage.content': deletedText,
        'lastMessage.type': 'text',
        updatedAt: nowIso,
      });
    } catch {
      // non-fatal
    }
  }
}

// Mark chat messages as read & update read receipts for participants
// Mark chat messages as read & update read receipts for participants
export async function markChatAsRead(
  chatId: string,
  userId: string,
  unreadMessages: MessageModel[] = []
): Promise<void> {
  if (!chatId || !userId || !Array.isArray(unreadMessages)) return;
  const currentAuth = getFirebaseAuth().currentUser;
  if (!currentAuth || currentAuth.uid !== userId) return;
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);

  const unreadToUpdate = unreadMessages.filter(msg => {
    if (!msg || typeof msg.id !== 'string' || !msg.id.trim()) return false;
    // Don't attempt to update optimistic / temporary message IDs
    if (
      msg.id.startsWith('temp_') ||
      msg.id.startsWith('voice_') ||
      msg.id.startsWith('media_') ||
      msg.id.startsWith('file_') ||
      msg.id.startsWith('sticker_') ||
      msg.id.startsWith('poll_')
    ) {
      return false;
    }
    const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
    return msg.senderId !== userId && !readBy.includes(userId);
  });

  let shouldResetUnreadCount = false;
  let isLastMsgAffected = false;

  try {
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      const chatData = chatSnap.data();
      const currentUnread = chatData?.unreadCount?.[userId] || 0;
      if (currentUnread > 0) {
        shouldResetUnreadCount = true;
      }
      const lastMsgId = chatData?.lastMessage?.id;
      if (lastMsgId && unreadToUpdate.some(m => m.id === lastMsgId)) {
        isLastMsgAffected = true;
      }
    }
  } catch (err) {
    console.warn('[markChatAsRead] Last message check failed:', err);
  }

  // If no message needs readBy update and unreadCount is already 0, avoid redundant writes
  if (unreadToUpdate.length === 0 && !shouldResetUnreadCount) {
    return;
  }

  const batch = writeBatch(firestore);
  let hasUpdates = false;

  for (const msg of unreadToUpdate) {
    const msgDocRef = doc(firestore, 'chats', chatId, 'messages', msg.id);
    batch.update(msgDocRef, {
      readBy: arrayUnion(userId),
      deliveredTo: arrayUnion(userId),
      status: 'read',
    });
    hasUpdates = true;
  }

  if (shouldResetUnreadCount || isLastMsgAffected) {
    const chatUpdate: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (shouldResetUnreadCount) {
      chatUpdate[`unreadCount.${userId}`] = 0;
    }
    if (isLastMsgAffected) {
      chatUpdate['lastMessage.readBy'] = arrayUnion(userId);
      chatUpdate['lastMessage.deliveredTo'] = arrayUnion(userId);
      chatUpdate['lastMessage.status'] = 'read';
    }
    batch.update(chatRef, chatUpdate);
    hasUpdates = true;
  }

  if (hasUpdates) {
    try {
      await batch.commit();
    } catch (err) {
      console.error('[markChatAsRead] Batch commit failed:', err);
    }
  }
}

// Mark chat messages as delivered
export async function markMessagesAsDelivered(
  chatId: string,
  userId: string,
  messages: MessageModel[] = []
): Promise<void> {
  if (!chatId || !userId || !Array.isArray(messages) || messages.length === 0) return;
  const currentAuth = getFirebaseAuth().currentUser;
  if (!currentAuth || currentAuth.uid !== userId) return;

  const deliveredToUpdate = messages.filter(msg => {
    if (!msg || typeof msg.id !== 'string' || !msg.id.trim()) return false;
    // Don't attempt to update optimistic / temporary message IDs
    if (
      msg.id.startsWith('temp_') ||
      msg.id.startsWith('voice_') ||
      msg.id.startsWith('media_') ||
      msg.id.startsWith('file_') ||
      msg.id.startsWith('sticker_') ||
      msg.id.startsWith('poll_')
    ) {
      return false;
    }
    const deliveredTo = Array.isArray(msg.deliveredTo) ? msg.deliveredTo : [];
    const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
    return msg.senderId !== userId && !deliveredTo.includes(userId) && !readBy.includes(userId);
  });

  if (deliveredToUpdate.length === 0) {
    return;
  }

  const firestore = getFirebaseDb();
  const batch = writeBatch(firestore);
  const chatRef = doc(firestore, 'chats', chatId);
  let hasUpdates = false;

  for (const msg of deliveredToUpdate) {
    const msgDocRef = doc(firestore, 'chats', chatId, 'messages', msg.id);
    batch.update(msgDocRef, {
      deliveredTo: arrayUnion(userId),
      status: 'delivered',
    });
    hasUpdates = true;
  }

  try {
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      const chatData = chatSnap.data();
      const lastMsgId = chatData?.lastMessage?.id;
      const isLastMsgAffected = Boolean(lastMsgId && deliveredToUpdate.some(m => m.id === lastMsgId));

      if (isLastMsgAffected) {
        batch.update(chatRef, {
          'lastMessage.deliveredTo': arrayUnion(userId),
          'lastMessage.status': 'delivered',
          updatedAt: new Date().toISOString(),
        });
        hasUpdates = true;
      }
    }
  } catch (err) {
    console.warn('[markMessagesAsDelivered] Last message check failed:', err);
  }

  if (hasUpdates) {
    try {
      await batch.commit();
    } catch (err) {
      console.error('[markMessagesAsDelivered] Batch commit failed:', err);
    }
  }
}


// Set Typing Status
export async function setChatTyping(chatId: string, userId: string, isTyping: boolean): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);

  try {
    await updateDoc(chatRef, {
      [`typing.${userId}`]: isTyping,
    });
  } catch {
    // Ignore typing sync error
  }
}

// Subscribe to User Presence
export function subscribeToUserPresence(
  userId: string,
  callback: (presence: PresenceModel | null) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const presenceRef = doc(firestore, 'presence', userId);

  return onSnapshot(
    presenceRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as PresenceModel);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.warn('Presence subscription error:', err);
      callback(null);
    }
  );
}

// ----------------------------------------------------
// CHANNELS / BROADCAST
// ----------------------------------------------------

// Create New Channel
export async function createNewChannel({
  ownerId,
  ownerProfile,
  name,
  description = '',
  avatarUrl = null,
  isPublic = true,
  allowMemberPosts = false,
}: {
  ownerId: string;
  ownerProfile: UserProfile;
  name: string;
  description?: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
  allowMemberPosts?: boolean;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();

  // 1. Prepare references
  const chatsRef = collection(firestore, 'chats');
  const chatDocRef = doc(chatsRef); // Generate ID first
  const channelId = chatDocRef.id;
  const channelDocRef = doc(firestore, 'channels', channelId);
  const subscriberRef = doc(firestore, 'channels', channelId, 'subscribers', ownerId);
  const rootSubRef = doc(firestore, 'channel_subscribers', `${channelId}_${ownerId}`);

  // 2. Atomic creation of all channel-related documents
  await runTransaction(firestore, async (transaction) => {
    // Create Chat document
    transaction.set(chatDocRef, {
      type: 'channel',
      name: name.trim(),
      title: name.trim(),
      description: description.trim(),
      avatarUrl,
      createdBy: ownerId,
      ownerId,
      adminIds: [ownerId],
      isPublic,
      allowMemberPosts,
      subscriberCount: 1,
      disappearingMessagesDuration: 0,
      participants: [ownerId],
      participantDetails: {
        [ownerId]: {
          name: ownerProfile.name,
          avatarUrl: ownerProfile.avatarUrl || null,
          phone: ownerProfile.phoneNumber,
          role: 'admin',
        },
      },
      unreadCount: {
        [ownerId]: 0,
      },
      typing: {
        [ownerId]: false,
      },
      lastMessage: {
        senderId: ownerId,
        senderName: ownerProfile.name,
        content: `📢 Channel "${name.trim()}" created`,
        type: 'text',
        timestamp: nowIso,
        status: 'sent',
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Create Channel metadata document
    transaction.set(channelDocRef, {
      id: channelId,
      name: name.trim(),
      description: description.trim(),
      avatar_url: avatarUrl,
      owner_id: ownerId,
      admin_ids: [ownerId],
      is_public: isPublic,
      allow_member_posts: allowMemberPosts,
      subscriber_count: 1,
      created_at: nowIso,
    });

    // Create Subscriber sub-collection entry
    transaction.set(subscriberRef, {
      channel_id: channelId,
      user_id: ownerId,
      name: ownerProfile.name,
      avatar_url: ownerProfile.avatarUrl || null,
      joined_at: nowIso,
    });

    // Create Root subscriber index
    transaction.set(rootSubRef, {
      channel_id: channelId,
      user_id: ownerId,
      joined_at: nowIso,
    });
  });

  // 3. Create initial greeting message (outside transaction as it's a subcollection add)
  try {
    const messagesRef = collection(firestore, 'chats', channelId, 'messages');
    await addDoc(messagesRef, {
      senderId: ownerId,
      senderName: ownerProfile.name,
      content: `📢 Channel "${name.trim()}" created`,
      type: 'text',
      timestamp: nowIso,
      status: 'sent',
    });
  } catch (err) {
    console.warn('Error creating initial channel message:', err);
  }

  return channelId;
}

// Subscribe to Public Channels for Discovery
export function subscribeToPublicChannels(
  callback: (channels: ChannelModel[]) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const channelsRef = collection(firestore, 'channels');
  const q = query(channelsRef, where('is_public', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ChannelModel[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          name: data.name,
          description: data.description || '',
          avatar_url: data.avatar_url || null,
          owner_id: data.owner_id,
          admin_ids: data.admin_ids || (data.owner_id ? [data.owner_id] : []),
          is_public: Boolean(data.is_public),
          allow_member_posts: Boolean(data.allow_member_posts),
          subscriber_count: data.subscriber_count || 1,
          created_at: data.created_at || new Date().toISOString(),
        });
      });

      list.sort((a, b) => (b.subscriber_count || 0) - (a.subscriber_count || 0));
      callback(list);
    },
    (error) => {
      console.warn('subscribeToPublicChannels error:', error);
      callback([]);
    }
  );
}

// Join Public Channel
export async function joinChannel({
  channelId,
  userId,
  userProfile,
}: {
  channelId: string;
  userId: string;
  userProfile: UserProfile;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();

  if (getFirebaseAuth().currentUser?.uid !== userId) throw new Error('Please sign in again.');
  
  const chatRef = doc(firestore, 'chats', channelId);
  const channelRef = doc(firestore, 'channels', channelId);
  const subRef = doc(firestore, 'channels', channelId, 'subscribers', userId);
  const rootSubRef = doc(firestore, 'channel_subscribers', `${channelId}_${userId}`);

  await runTransaction(firestore, async (tx) => {
    const [chatSnap, channelSnap, subSnap] = await Promise.all([
      tx.get(chatRef),
      tx.get(channelRef),
      tx.get(subRef),
    ]);

    if (!chatSnap.exists() || !channelSnap.exists()) {
      throw new Error('Channel unavailable');
    }

    // Skip if already a subscriber to prevent duplicate counting
    if (subSnap.exists()) return;

    const chatData = chatSnap.data();
    const participants = Array.from(new Set([...chatData.participants, userId]));
    const newCount = participants.length;

    // Update 'chats' collection
    tx.update(chatRef, {
      participants,
      subscriberCount: newCount,
      [`participantDetails.${userId}`]: {
        name: userProfile.name,
        avatarUrl: userProfile.avatarUrl || null,
        role: 'member',
      },
      updatedAt: nowIso,
    });

    // Update 'channels' collection (Consistency fix)
    tx.update(channelRef, {
      subscriber_count: newCount,
    });

    // Create subscriber records
    tx.set(subRef, {
      channel_id: channelId,
      user_id: userId,
      name: userProfile.name,
      avatar_url: userProfile.avatarUrl || null,
      joined_at: nowIso,
    });

    tx.set(rootSubRef, {
      channel_id: channelId,
      user_id: userId,
      joined_at: nowIso,
    });
  });
}

export async function leaveChannel({ channelId, userId }: { channelId: string; userId: string }): Promise<void> {
  if (getFirebaseAuth().currentUser?.uid !== userId) throw new Error('Please sign in again.');
  const firestore = getFirebaseDb();
  
  const chatRef = doc(firestore, 'chats', channelId);
  const channelRef = doc(firestore, 'channels', channelId);
  const subRef = doc(firestore, 'channels', channelId, 'subscribers', userId);
  const rootSubRef = doc(firestore, 'channel_subscribers', `${channelId}_${userId}`);

  await runTransaction(firestore, async (tx) => {
    const [chatSnap, subSnap] = await Promise.all([
      tx.get(chatRef),
      tx.get(subRef),
    ]);

    if (!chatSnap.exists()) return;

    const chatData = chatSnap.data();
    const participants = chatData.participants.filter((uid: string) => uid !== userId);
    const newCount = Math.max(0, participants.length);

    // Update 'chats'
    tx.update(chatRef, {
      participants,
      subscriberCount: newCount,
      updatedAt: new Date().toISOString(),
    });

    // Update 'channels' (Consistency fix)
    tx.update(channelRef, {
      subscriber_count: newCount,
    });

    // Remove subscriber records if they exist
    if (subSnap.exists()) {
      tx.delete(subRef);
    }
    tx.delete(rootSubRef);
  });
}

// Update Channel Settings (Admins only)
export async function updateChannelSettings({
  channelId,
  name,
  description,
  avatarUrl,
  isPublic,
  allowMemberPosts,
  disappearingMessagesDuration,
}: {
  channelId: string;
  name?: string;
  description?: string;
  avatarUrl?: string | null;
  isPublic?: boolean;
  allowMemberPosts?: boolean;
  disappearingMessagesDuration?: number;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();
  const chatRef = doc(firestore, 'chats', channelId);

  const payload: Record<string, any> = {
    updatedAt: nowIso,
  };

  if (name !== undefined) {
    payload.name = name.trim();
    payload.title = name.trim();
  }
  if (description !== undefined) payload.description = description.trim();
  if (avatarUrl !== undefined) payload.avatarUrl = avatarUrl;
  if (isPublic !== undefined) payload.isPublic = isPublic;
  if (allowMemberPosts !== undefined) payload.allowMemberPosts = allowMemberPosts;
  if (disappearingMessagesDuration !== undefined) {
    payload.disappearingMessagesDuration = disappearingMessagesDuration;
  }

  await updateDoc(chatRef, payload);

  try {
    const channelRef = doc(firestore, 'channels', channelId);
    const channelPayload: Record<string, any> = {};
    if (name !== undefined) channelPayload.name = name.trim();
    if (description !== undefined) channelPayload.description = description.trim();
    if (avatarUrl !== undefined) channelPayload.avatar_url = avatarUrl;
    if (isPublic !== undefined) channelPayload.is_public = isPublic;
    if (allowMemberPosts !== undefined) channelPayload.allow_member_posts = allowMemberPosts;

    if (Object.keys(channelPayload).length > 0) {
      await updateDoc(channelRef, channelPayload);
    }
  } catch {
    // ignore
  }
}

// ----------------------------------------------------
// DISAPPEARING MESSAGES
// ----------------------------------------------------
export async function updateChatDisappearingDuration({
  chatId,
  durationSeconds,
}: {
  chatId: string;
  durationSeconds: number;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  await updateDoc(chatRef, {
    disappearingMessagesDuration: durationSeconds,
    updatedAt: new Date().toISOString(),
  });
}

// ----------------------------------------------------
// POLLS & VOTING
// ----------------------------------------------------
export async function voteInPoll({
  chatId,
  messageId,
  optionId,
  userId,
  allowMultiple,
}: {
  chatId: string;
  messageId: string;
  optionId: string;
  userId: string;
  allowMultiple: boolean;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const msgRef = doc(firestore, 'chats', chatId, 'messages', messageId);

  if (getFirebaseAuth().currentUser?.uid !== userId) throw new Error('Please sign in again.');
  await runTransaction(firestore, async tx => {
    const snap = await tx.get(msgRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data.pollData?.options?.some((option: any) => option.id === optionId)) throw new Error('Invalid poll option');
    const old: string[] = data.pollVotes?.[userId] || [];
    const votes = old.includes(optionId) ? old.filter(id => id !== optionId)
      : data.pollData.allowMultiple ? [...old, optionId] : [optionId];
    tx.update(msgRef, { [`pollVotes.${userId}`]: votes });
  });
}

// ----------------------------------------------------
// VOICE & VIDEO CALLING
// ----------------------------------------------------

export async function initiateCall({
  chatId,
  callerProfile,
  calleeId,
  calleeProfile,
  type,
}: {
  chatId?: string;
  callerProfile: UserProfile;
  calleeId: string;
  calleeProfile: { name: string; avatarUrl?: string | null; phone?: string };
  type: CallType;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const callerId = callerProfile.id || `user_${callerProfile.phoneNumber.replace(/\D/g, '')}`;
  const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const callDoc: CallModel = {
    id: callId,
    chatId: chatId || '',
    callerId,
    callerName: callerProfile.name || 'Hala User',
    callerAvatar: callerProfile.avatarUrl || null,
    callerPhone: callerProfile.phoneNumber,
    calleeId,
    calleeName: calleeProfile.name || 'User',
    calleeAvatar: calleeProfile.avatarUrl || null,
    calleePhone: calleeProfile.phone || '',
    type,
    status: 'ringing',
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
  };

  const callRef = doc(firestore, 'calls', callId);
  await setDoc(callRef, callDoc);
  return callId;
}

export async function updateCallStatus({
  callId,
  status,
  durationSeconds,
}: {
  callId: string;
  status: CallStatus;
  durationSeconds?: number;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const callRef = doc(firestore, 'calls', callId);

  const updates: Partial<CallModel> = {
    status,
  };

  if (status === 'ongoing') {
    updates.connectedAt = new Date().toISOString();
  } else if (status === 'ended' || status === 'declined' || status === 'missed' || status === 'cancelled') {
    updates.endedAt = new Date().toISOString();
    if (typeof durationSeconds === 'number') {
      updates.durationSeconds = durationSeconds;
    }
  }

  await updateDoc(callRef, updates);
}

export async function answerCall(callId: string): Promise<void> {
  await updateCallStatus({ callId, status: 'ongoing' });
}

// Track notified call IDs to prevent duplicate alerts for the same incoming call
const notifiedCallWakeupIds = new Set<string>();

export function triggerCallWakeupNotification(call: CallModel): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (notifiedCallWakeupIds.has(call.id)) return;

  notifiedCallWakeupIds.add(call.id);

  const title = `📞 Incoming ${call.type === 'video' ? 'Video' : 'Voice'} Call`;
  const body = `${call.callerName || 'Someone'} is calling you on Hala...`;
  const icon = call.callerAvatar || '/icons/icon-192.png';

  const notificationOptions: NotificationOptions & {
    renotify?: boolean;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string }>;
  } = {
    body,
    icon,
    badge: '/icons/notification-badge-96.png',
    tag: `voip-call-${call.id}`,
    requireInteraction: true,
    renotify: true,
    vibrate: [500, 250, 500, 250, 500, 250, 500, 250, 500],
    data: {
      type: 'call_wakeup',
      callId: call.id,
      callerName: call.callerName,
      callerAvatar: call.callerAvatar,
      callType: call.type,
      priority: 'high',
      voip: true,
      timestamp: Date.now(),
    },
    actions: [
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' },
    ],
  };

  // If Service Worker is available, dispatch via SW for high-priority background VoIP wake-up
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        return registration.showNotification(title, notificationOptions);
      })
      .catch((err) => {
        console.warn('[CallWakeup] ServiceWorker notification notice:', err);
        try {
          const notif = new Notification(title, notificationOptions);
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch (e) {
          console.warn('[CallWakeup] Notification fallback error:', e);
        }
      });
  } else {
    try {
      const notif = new Notification(title, notificationOptions);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('[CallWakeup] Notification fallback error:', e);
    }
  }
}

export function subscribeToIncomingCalls(
  userId: string,
  callback: (call: CallModel | null) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const callsRef = collection(firestore, 'calls');
  const q = query(
    callsRef,
    where('calleeId', '==', userId),
    where('status', '==', 'ringing')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }
      const now = Date.now();
      // Only keep calls with status === "ringing" created within the last 60 seconds
      const validDocs = snapshot.docs
        .map((d) => d.data() as CallModel)
        .filter((call) => {
          if (call.status !== 'ringing') return false;
          const startedTime = new Date(call.startedAt).getTime();
          if (isNaN(startedTime)) return false;
          return now - startedTime <= 60000;
        });

      if (validDocs.length === 0) {
        callback(null);
        return;
      }

      validDocs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      const incomingCall = validDocs[0];

      // If document/tab is in background or permission granted, trigger high-priority call wake-up notification
      const isBackground = typeof document !== 'undefined' && (document.hidden || document.visibilityState === 'hidden');
      if (isBackground || (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')) {
        triggerCallWakeupNotification(incomingCall);
      }

      callback(incomingCall);
    },
    (error) => {
      console.warn('Error subscribing to incoming calls:', error);
      callback(null);
    }
  );
}

export async function fetchCallById(callId: string): Promise<CallModel | null> {
  try {
    const firestore = getFirebaseDb();
    const snap = await getDoc(doc(firestore, 'calls', callId));
    if (snap.exists()) {
      return { ...snap.data(), id: snap.id } as CallModel;
    }
  } catch (err) {
    console.warn('fetchCallById error:', err);
  }
  return null;
}

export function subscribeToCall(
  callId: string,
  callback: (call: CallModel | null) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const callRef = doc(firestore, 'calls', callId);

  return onSnapshot(
    callRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      callback(snapshot.data() as CallModel);
    },
    (error) => {
      console.warn('Error subscribing to call:', error);
      callback(null);
    }
  );
}

export function subscribeToUserCalls(
  userId: string,
  callback: (calls: CallModel[]) => void,
  limitCount: number = 20
): Unsubscribe {
  const firestore = getFirebaseDb();
  const callsRef = collection(firestore, 'calls');

  let callerCalls: CallModel[] = [];
  let calleeCalls: CallModel[] = [];

  const emit = () => {
    const map = new Map<string, CallModel>();
    callerCalls.forEach((c) => map.set(c.id, c));
    calleeCalls.forEach((c) => map.set(c.id, c));
    const merged = Array.from(map.values());
    merged.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    callback(merged.slice(0, limitCount));
  };

  const qCaller = query(callsRef, where('callerId', '==', userId), orderBy('startedAt', 'desc'), limit(limitCount));
  const qCallee = query(callsRef, where('calleeId', '==', userId), orderBy('startedAt', 'desc'), limit(limitCount));


  const unsub1 = onSnapshot(
    qCaller,
    (snap) => {
      callerCalls = snap.docs.map((d) => d.data() as CallModel);
      emit();
    },
    (err) => {
      console.warn('Error listening to caller calls:', err);
    }
  );

  const unsub2 = onSnapshot(
    qCallee,
    (snap) => {
      calleeCalls = snap.docs.map((d) => d.data() as CallModel);
      emit();
    },
    (err) => {
      console.warn('Error listening to callee calls:', err);
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

export async function sendCallSignaling(
  callId: string,
  signal: Omit<SignalingData, 'timestamp'>
): Promise<void> {
  const firestore = getFirebaseDb();
  const signalingRef = collection(firestore, 'calls', callId, 'signaling');

  const signalPayload: SignalingData = {
    ...signal,
    timestamp: new Date().toISOString(),
  };

  await addDoc(signalingRef, signalPayload);
}

export function subscribeToCallSignaling(
  callId: string,
  targetUserId: string,
  onSignal: (signal: SignalingData) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const signalingRef = collection(firestore, 'calls', callId, 'signaling');
  const q = query(signalingRef, where('to', '==', targetUserId));

  const processedIds = new Set<string>();

  return onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const docId = change.doc.id;
          if (!processedIds.has(docId)) {
            processedIds.add(docId);
            const data = change.doc.data() as SignalingData;
            onSignal({ ...data, id: docId });
          }
        }
      });
    },
    (error) => {
      console.warn('Error in call signaling subscription:', error);
    }
  );
}

export async function cleanupCallSignaling(callId: string): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const signalingRef = collection(firestore, 'calls', callId, 'signaling');
    const snap = await getDocs(signalingRef);
    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Signaling cleanup notice:', err);
  }
}

// ==================== STORIES / STATUS ====================

export async function createStory({
  userId,
  userName,
  userAvatar,
  userPhone,
  mediaUrl,
  mediaType,
  textOverlay,
  drawingOverlay,
}: {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  userPhone?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  textOverlay?: any;
  drawingOverlay?: string | null;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const storiesRef = collection(firestore, 'stories');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const storyDoc = await addDoc(storiesRef, {
    userId,
    userName,
    userAvatar: userAvatar || null,
    schemaVersion: 2,
    mediaUrl,
    mediaType,
    textOverlay: textOverlay || null,
    drawingOverlay: drawingOverlay || null,
    createdAt: now.toISOString(),
    expiresAt,
    views: {},
  });

  return storyDoc.id;
}

export function subscribeToActiveStories(
  callback: (stories: StoryModel[]) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const storiesRef = collection(firestore, 'stories');
  const nowIso = new Date().toISOString();

  const q = query(storiesRef, where('schemaVersion', '==', 2), where('expiresAt', '>', nowIso));

  return onSnapshot(
    q,
    (snapshot) => {
      const activeStories: StoryModel[] = [];
      const currentNow = new Date().getTime();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const expTime = new Date(data.expiresAt).getTime();
        if (expTime > currentNow) {
          activeStories.push({
            id: docSnap.id,
            userId: data.userId,
            userName: data.userName || 'User',
            userAvatar: data.userAvatar || null,
            userPhone: data.userPhone || '',
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType || 'image',
            textOverlay: data.textOverlay || null,
            drawingOverlay: data.drawingOverlay || null,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            views: data.views || {},
          });
        }
      });

      // Sort by createdAt descending
      activeStories.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      callback(activeStories);
    },
    (error) => {
      console.warn('Error subscribing to stories:', error);
      callback([]);
    }
  );
}

export async function markStoryAsViewed({
  storyId,
  viewerId,
  viewerName,
  viewerAvatar,
}: {
  storyId: string;
  viewerId: string;
  viewerName: string;
  viewerAvatar?: string | null;
}): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const storyDocRef = doc(firestore, 'stories', storyId);

    await updateDoc(storyDocRef, {
      [`views.${viewerId}`]: {
        viewerId,
        viewerName,
        viewerAvatar: viewerAvatar || null,
        viewedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('Failed to mark story as viewed:', err);
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const storyDocRef = doc(firestore, 'stories', storyId);
    await deleteDoc(storyDocRef);
  } catch (err) {
    console.warn('Failed to delete story:', err);
  }
}

// Pin / Unpin a Message in a Chat
export async function togglePinMessage({
  chatId,
  messageId,
  userId,
  isPinned,
}: {
  chatId: string;
  messageId: string;
  userId: string;
  isPinned: boolean;
}): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const messageDocRef = doc(firestore, 'chats', chatId, 'messages', messageId);
    await updateDoc(messageDocRef, {
      isPinned,
      pinnedAt: isPinned ? new Date().toISOString() : null,
      pinnedBy: isPinned ? userId : null,
    });

    const chatDocRef = doc(firestore, 'chats', chatId);
    await updateDoc(chatDocRef, {
      pinnedMessageIds: isPinned ? arrayUnion(messageId) : arrayRemove(messageId),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to toggle pin message:', err);
  }
}

// Pin / Unpin a Chat for a specific User
export async function togglePinChat({
  chatId,
  userId,
  isPinned,
}: {
  chatId: string;
  userId: string;
  isPinned: boolean;
}): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const chatDocRef = doc(firestore, 'chats', chatId);
    await updateDoc(chatDocRef, {
      pinnedBy: isPinned ? arrayUnion(userId) : arrayRemove(userId),
    });
  } catch (err) {
    console.warn('Failed to toggle pin chat:', err);
  }
}

// Archive / Unarchive a Chat for a specific User
export async function toggleArchiveChat({
  chatId,
  userId,
  isArchived,
}: {
  chatId: string;
  userId: string;
  isArchived: boolean;
}): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const chatDocRef = doc(firestore, 'chats', chatId);
    await updateDoc(chatDocRef, {
      archivedBy: isArchived ? arrayUnion(userId) : arrayRemove(userId),
    });
  } catch (err) {
    console.warn('Failed to toggle archive chat:', err);
  }
}

// Subscribe to User Profile in real-time
export function subscribeToUserProfile(
  userId: string,
  callback: (profile: Partial<UserProfile> | null) => void
): Unsubscribe {
  const firestore = getFirebaseDb();
  const userDocRef = doc(firestore, 'users', userId);

  return onSnapshot(
    userDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback({
          id: data.id || snapshot.id,
          name: data.name,
          phoneNumber: data.phone || data.phoneNumber,
          avatarUrl: data.avatar_url || data.avatarUrl || null,
          status: data.status,
          blockedUsers: data.blockedUsers || data.blocked_users || [],
          isFlagged: data.is_flagged ?? data.isFlagged,
          flaggedReason: data.flagged_reason ?? data.flaggedReason,
          privacySettings: data.privacy_settings ?? data.privacySettings,
        });
      } else {
        callback(null);
      }
    },
    (error) => {
      console.warn(`Error subscribing to user profile (${userId}):`, error);
      callback(null);
    }
  );
}

// Toggle Block / Unblock User in Firestore
export async function toggleBlockUser({
  currentUserId,
  targetUserId,
  isBlocked,
}: {
  currentUserId: string;
  targetUserId: string;
  isBlocked: boolean;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const userDocRef = doc(firestore, 'users', currentUserId);

  await updateDoc(userDocRef, {
    blockedUsers: isBlocked ? arrayUnion(targetUserId) : arrayRemove(targetUserId),
    blocked_users: isBlocked ? arrayUnion(targetUserId) : arrayRemove(targetUserId),
  });
}

// Update Chat Background Wallpaper for a Conversation (Persisting in Chat Document)
export async function updateChatWallpaper({
  chatId,
  userId,
  wallpaper,
  currentRawValue,
}: {
  chatId: string;
  userId?: string;
  wallpaper: string | null;
  currentRawValue?: string | null;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  const nowIso = new Date().toISOString();

  const existingHeaderTheme = extractHeaderThemeValue(currentRawValue, chatId, userId);
  const combined = combineWallpaperAndHeaderTheme(wallpaper, existingHeaderTheme);

  const updatePayload: Record<string, any> = {
    updatedAt: nowIso,
  };

  if (userId) {
    updatePayload[`wallpaperBy.${userId}`] = combined;
  }

  await updateDoc(chatRef, updatePayload);
}

// Update Chat Header Theme for a Conversation
export async function updateChatHeaderTheme({
  chatId,
  userId,
  headerTheme,
  currentRawWallpaper,
}: {
  chatId: string;
  userId?: string;
  headerTheme: string | null;
  currentRawWallpaper?: string | null;
}): Promise<void> {
  const cleanTheme = headerTheme || 'default';
  if (typeof window !== 'undefined' && chatId) {
    const key = userId ? `hala.headerTheme.${chatId}.${userId}` : `hala.headerTheme.${chatId}`;
    safeLocalStorageSet(key, cleanTheme);
  }

  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  const nowIso = new Date().toISOString();

  const combined = combineWallpaperAndHeaderTheme(currentRawWallpaper, cleanTheme);

  const updatePayload: Record<string, any> = {
    updatedAt: nowIso,
  };

  if (userId) {
    updatePayload[`wallpaperBy.${userId}`] = combined;
  }

  try {
    await updateDoc(chatRef, updatePayload);
  } catch (err) {
    console.warn('Could not sync header theme to Firestore (saved locally):', err);
  }
}

// Submit Testing Feedback from Tester
export async function submitUserFeedback({
  userId,
  userName,
  userPhone,
  category,
  rating,
  message,
}: {
  userId: string;
  userName?: string;
  userPhone?: string;
  category?: 'bug' | 'feature' | 'design' | 'general';
  rating?: number;
  message: string;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const feedbackCol = collection(firestore, 'feedback');
  await addDoc(feedbackCol, {
    userId,
    userName: userName || 'Tester',
    userPhone: userPhone || '',
    category: category || 'general',
    rating: rating || 5,
    message: message.trim(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    createdAt: new Date().toISOString(),
  });
}

/**
 * Uploads a PDF file to Firebase Storage using uploadBytesResumable,
 * explicitly setting contentType metadata to 'application/pdf',
 * with robust console.error logging and optional toast callback.
 */
export async function uploadFirebasePdf(
  pdfFileOrBlob: Blob | File,
  onToastMessage?: (msg: string) => void,
  onProgress?: (percent: number) => void
): Promise<string | null> {
  const authUser = await ensureAuthUser();
  const uid = authUser?.uid || getFirebaseAuth().currentUser?.uid;
  if (!uid) {
    const err = new Error('User not authenticated for PDF upload.');
    console.error('[Firebase PDF Upload Error] Code: auth/unauthenticated', err);
    onToastMessage?.('PDF upload failed: auth/unauthenticated');
    return null;
  }

  const fileName = (pdfFileOrBlob as File).name || `document_${Date.now()}.pdf`;
  const storageRef = ref(getFirebaseStorage(), `media/${uid}/${crypto.randomUUID()}_${fileName}`);
  const metadata = {
    contentType: 'application/pdf',
    customMetadata: {
      originalName: fileName,
    },
  };

  return new Promise((resolve) => {
    const uploadTask = uploadBytesResumable(storageRef, pdfFileOrBlob, metadata);

    const timeout = setTimeout(() => {
      uploadTask.cancel();
      const timeoutErr: any = new Error('PDF upload timed out (3 min limit).');
      timeoutErr.code = 'storage/canceled';
      console.error('[Firebase PDF Upload Error] Code: storage/canceled', timeoutErr);
      onToastMessage?.('PDF upload failed: storage/canceled');
      resolve(null);
    }, 180000);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes) {
          const progressPercent = Math.min(
            99,
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          );
          onProgress?.(progressPercent);
        }
      },
      (error: any) => {
        clearTimeout(timeout);
        const errorCode = error?.code || 'storage/unknown';
        console.error(`[Firebase PDF Upload Error] Code: ${errorCode} Message:`, error?.message, error);
        onToastMessage?.(`PDF upload failed: ${errorCode}`);
        resolve(null);
      },
      async () => {
        clearTimeout(timeout);
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onProgress?.(100);
          resolve(downloadUrl);
        } catch (urlError: any) {
          const errorCode = urlError?.code || 'storage/url-failed';
          console.error(`[Firebase PDF Upload getDownloadURL Error] Code: ${errorCode}`, urlError);
          onToastMessage?.(`PDF upload failed: ${errorCode}`);
          resolve(null);
        }
      }
    );
  });
}

/**
 * Schedules a call in Firestore.
 */
export async function scheduleCall(data: {
  chatId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  calleeName: string;
  callerAvatar?: string | null;
  calleeAvatar?: string | null;
  type: 'voice' | 'video';
  scheduledAt: string;
  title: string;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const callsRef = collection(firestore, 'scheduled_calls');
  const docRef = await addDoc(callsRef, {
    ...data,
    createdAt: serverTimestamp(),
    status: 'scheduled',
  });
  return docRef.id;
}

/**
 * Saves a message notifying participants about a scheduled call.
 */
export async function saveScheduledCallMessage({
  chatId,
  currentUserId,
  currentUserProfile,
  targetUserId,
  targetUserName,
  callType,
  scheduledAt,
  title,
}: {
  chatId: string;
  currentUserId: string;
  currentUserProfile: any;
  targetUserId: string;
  targetUserName: string;
  callType: 'voice' | 'video';
  scheduledAt: string;
  title: string;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const messagesRef = collection(firestore, 'chats', chatId, 'messages');
  const msg = await addDoc(messagesRef, {
    type: 'scheduled_call',
    senderId: currentUserId,
    senderName: currentUserProfile.name,
    content: `Scheduled a ${callType} call: ${title}`,
    scheduledCallData: {
      title,
      callType,
      scheduledAt,
      targetUserId,
    },
    createdAt: serverTimestamp(),
  });
  return msg.id;
}

export async function saveCallRating(callId: string, rating: number): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) throw new Error('Authentication required to save rating');
  
  const db = getFirebaseDb();
  const uid = auth.currentUser.uid;
  const ratingDocRef = doc(db, 'calls', callId, 'ratings', uid);
  await setDoc(ratingDocRef, {
    rating,
    createdAt: serverTimestamp(),
  }, { merge: true });
}







export async function setTwoStepPin(pin: string): Promise<void> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'setPin');
  await fn({ pin });
}

export async function isTwoStepEnabled(uid: string): Promise<boolean> {
  const db = getFirebaseDb();
  const docSnap = await getDoc(doc(db, 'users', uid));
  return docSnap.exists() && docSnap.data().two_factor?.enabled === true;
}

export async function verifyTwoStepPin(pin: string): Promise<string> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'verifyPin');
  const res = (await fn({ pin })) as { data: { sessionToken: string } };
  return res.data?.sessionToken || '';
}

export async function saveEncryptedKeyBackup(blob: string, salt: string, iv: string, keyVersion = 1): Promise<void> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'saveKeyBackup');
  await fn({ backup: { blob, salt, iv, keyVersion } });
}

export async function fetchEncryptedKeyBackup(sessionToken: string): Promise<{ blob: string; salt: string; iv: string; keyVersion: number }> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'getKeyBackup');
  const res = (await fn({ sessionToken })) as { data: { backup: { blob: string; salt: string; iv: string; keyVersion: number } } };
  return res.data.backup;
}

export async function setRecoveryEmail(email: string): Promise<void> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'setRecoveryEmail');
  await fn({ email });
}

export async function startPinReset(): Promise<{ email: string }> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'startPinReset');
  const res = (await fn()) as { data: { email: string } };
  return res.data;
}

export async function resetPinWithCode(code: string, newPin: string): Promise<void> {
  const functionsInstance = getFunctions(getFirebaseApp(), 'europe-west1');
  const fn = httpsCallable(functionsInstance, 'resetPinWithCode');
  await fn({ code, newPin });
}
