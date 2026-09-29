import { compressAvatar } from './imageCompression';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  Firestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
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
  increment,
  limit,
  arrayUnion,
  arrayRemove,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  FirebaseStorage,
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
} from 'firebase/storage';
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
} from './crypto';

// Singleton instances
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;

  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    app = initializeApp({
      apiKey: firebaseConfigData.apiKey,
      authDomain: firebaseConfigData.authDomain,
      projectId: firebaseConfigData.projectId,
      storageBucket: firebaseConfigData.storageBucket,
      messagingSenderId: firebaseConfigData.messagingSenderId,
      appId: firebaseConfigData.appId,
    });
  }

  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const firebaseApp = getFirebaseApp();
  auth = getAuth(firebaseApp);
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (db) return db;
  try {
    setLogLevel('error');
  } catch {}
  const firebaseApp = getFirebaseApp();
  const databaseId = firebaseConfigData.firestoreDatabaseId;
  const firestoreSettings = {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
    ignoreUndefinedProperties: true,
  };
  try {
    db = databaseId 
      ? initializeFirestore(firebaseApp, firestoreSettings, databaseId) 
      : initializeFirestore(firebaseApp, firestoreSettings);
  } catch (error) {
    console.warn('initializeFirestore failed, falling back to getFirestore:', error);
    try {
      db = databaseId ? getFirestore(firebaseApp, databaseId) : getFirestore(firebaseApp);
    } catch {
      db = getFirestore(firebaseApp);
    }
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (storage) return storage;
  const firebaseApp = getFirebaseApp();
  storage = getStorage(firebaseApp);
  try {
    storage.maxUploadRetryTime = 2500;
    storage.maxOperationRetryTime = 2500;
  } catch (err) {
    console.warn('Failed to set Firebase Storage retry times:', err);
  }
  return storage;
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
export function setupRecaptcha(containerId: string): RecaptchaVerifier | null {
  const authInstance = getFirebaseAuth();
  if (!authInstance) return null;

  try {
    // Clear existing verifier if any
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch {
        // ignore
      }
      recaptchaVerifier = null;
    }

    const containerEl = document.getElementById(containerId);
    if (!containerEl) {
      console.warn(`Container #${containerId} not found in DOM`);
      return null;
    }

    recaptchaVerifier = new RecaptchaVerifier(authInstance, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        // Reset reCAPTCHA
        console.warn('reCAPTCHA expired, please retry');
      },
    });

    return recaptchaVerifier;
  } catch (err) {
    console.warn('Failed to setup RecaptchaVerifier:', err);
    return null;
  }
}

// Request OTP SMS to phone number
export async function requestPhoneOtp(
  fullPhoneNumber: string
): Promise<OtpRequestResult> {
  try {
    const authInstance = getFirebaseAuth();
    // A verifier is single-use. Recreate it for retries and resends as well.
    const activeVerifier = setupRecaptcha('recaptcha-container');

    if (!activeVerifier) {
      throw new Error('reCAPTCHA verifier could not be initialized');
    }

    const confirmationResult = await signInWithPhoneNumber(authInstance, fullPhoneNumber, activeVerifier);
    return { success: true, confirmationResult };
  } catch (err: any) {
    console.warn('Firebase Phone Auth signInWithPhoneNumber failed:', err?.code, err?.message || err);

    let errorMsg = err?.message || 'Failed to send OTP code';
    if (err?.code === 'auth/invalid-phone-number') {
      errorMsg = 'Invalid phone number format. Please check your country code and number.';
    } else if (err?.code === 'auth/too-many-requests') {
      errorMsg = 'Too many requests. Please wait a few minutes before trying again.';
    } else if (err?.code === 'auth/quota-exceeded') {
      errorMsg = 'SMS quota reached. Please try again later.';
    } else if (err?.code === 'auth/network-request-failed') {
      errorMsg = 'Network error. Please check your internet connection.';
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}

// Check if user document exists in Firestore
export async function checkUserExists(uid: string): Promise<UserModel | null> {
  try {
    const firestore = getFirebaseDb();
    const userDocRef = doc(firestore, 'users', uid);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserModel;
    }
    return null;
  } catch (err) {
    console.warn('Error fetching user document from Firestore:', err);
    return null;
  }
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
      if (typeof avatarDataUrlOrFile === 'string') {
        if (avatarDataUrlOrFile.startsWith('data:image')) {
          await uploadString(storageRef, avatarDataUrlOrFile, 'data_url');
          return await getDownloadURL(storageRef);
        }
        return avatarDataUrlOrFile;
      } else if (typeof avatarDataUrlOrFile === 'object' && avatarDataUrlOrFile !== null) {
        await uploadBytes(storageRef, avatarDataUrlOrFile as Blob | File);
        return await getDownloadURL(storageRef);
      }
      return null;
    })();

    const timeoutPromise = new Promise<null>((_, reject) =>
      timeoutId = setTimeout(() => reject(new Error('Avatar upload timed out after 4 seconds')), 4000)
    );

    const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
    console.log(`[Avatar] Upload succeeded! Storage URL:`, downloadUrl);
    return downloadUrl;
  } catch (err: any) {
    console.warn(`[Avatar] Upload failed or timed out (${err?.message || err}). Proceeding with optional avatar fallback.`);
    return fallback;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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
    console.log(`[Firestore] Writing document to "users/${uid}"...`, userData);
    const userDocRef = doc(firestore, 'users', uid);
    await setDoc(userDocRef, userData, { merge: true });
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
      lastSeen: nowIso,
    }, { merge: true });
    console.log(`[Firestore] Initial presence set successfully!`);
  } catch (err) {
    console.warn('[Firestore] Could not set initial presence (non-fatal):', err);
  }

  return userData;
}

// Update presence record
export async function setUserPresence(uid: string, online: boolean): Promise<void> {
  try {
    const firestore = getFirebaseDb();
    const presenceRef = doc(firestore, 'presence', uid);
    await setDoc(presenceRef, {
      online,
      lastSeen: new Date().toISOString(),
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
    if (authInstance.currentUser) {
      await setUserPresence(authInstance.currentUser.uid, false);
    }
    await signOut(authInstance);
  } catch (err) {
    console.warn('Sign out error:', err);
  }
}

// Built-in GCC Demo/Verified Contacts for rich instant testing
export const DEFAULT_CONTACTS: ContactItem[] = [
  {
    id: 'hala_support',
    name: 'Hala Support | خدمة عملاء هلا',
    phone: '+971 800 4252',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    status: 'Official Hala Assistant 🇦🇪 🇸🇦 🇰🇼',
  },
  {
    id: 'user_tariq_uae',
    name: 'طارق المنصور | Tariq Al-Mansoor',
    phone: '+971 50 123 4567',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    status: 'Available on Hala | متاح للمحادثة',
  },
  {
    id: 'user_noura_ksa',
    name: 'نورة الصباح | Noura Al-Sabah',
    phone: '+966 55 987 6543',
    avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    status: 'Design Lead at Riyadh Studio 🇸🇦',
  },
  {
    id: 'user_khalid_kwt',
    name: 'خالد الزهراني | Khalid Al-Zahrani',
    phone: '+965 99 887 766',
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    status: 'At work / في العمل',
  },
  {
    id: 'user_fatima_qat',
    name: 'فاطمة النعيمي | Fatima Al-Nuaimi',
    phone: '+974 33 445 566',
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    status: 'Busy with meetings / مشغولة باجتماعات',
  },
];

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
    const usersColRef = collection(firestore, 'users');
    const snapshot = await getDocs(usersColRef);

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
    const docRef = doc(firestore, 'users', cleanId);
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

  // 2. Query by phone number
  try {
    const cleanDigits = cleanId.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      const usersRef = collection(firestore, 'users');
      const q = query(usersRef, where('phone', '==', cleanId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const docSnap = qSnap.docs[0];
        const data = docSnap.data() as UserModel;
        return {
          id: docSnap.id,
          name: data.name,
          phone: data.phone || '',
          avatar_url: data.avatar_url || null,
          status: data.status || "Hey there, I'm using Hala",
          public_key: data.public_key,
        };
      }
    }
  } catch (err) {
    console.warn('Error querying user by phone:', err);
  }

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
      type: data.type || 'text',
      status: data.status || 'sent',
      timestamp: data.timestamp,
      duration: data.duration,
      stickerUrl: data.stickerUrl,
      pollData: data.pollData,
      expiresAt: data.expiresAt,
      reactions: data.reactions || {},
      isPinned: Boolean(data.isPinned),
      pinnedAt: data.pinnedAt,
      pinnedBy: data.pinnedBy,
      isEdited: Boolean(data.isEdited),
      editedAt: data.editedAt,
      deletedFor: Array.isArray(data.deletedFor) ? data.deletedFor : [],
      isDeletedForEveryone: Boolean(data.isDeletedForEveryone),
      deletedAt: data.deletedAt,
      readBy: data.readBy || {},
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
}: {
  chatId: string;
  senderId: string;
  senderName: string;
  content: string;
  caption?: string;
  type?: 'text' | 'image' | 'video' | 'voice' | 'sticker' | 'poll';
  duration?: number;
  stickerUrl?: string;
  pollData?: PollData;
  disappearingDuration?: number;
  recipientId?: string;
  isGroup?: boolean;
  otherParticipantIds?: string[];
  conversationKey?: CryptoKey | null;
  mediaIv?: string;
}): Promise<string> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();

  // Anti-Spam Check for New Accounts sending high frequency messages to non-contacts
  if (!isGroup && recipientId) {
    try {
      const senderRef = doc(firestore, 'users', senderId);
      const senderSnap = await getDoc(senderRef);
      if (senderSnap.exists()) {
        const senderData = senderSnap.data();

        // If user is already flagged, reject outright
        if (senderData.is_flagged || senderData.isFlagged) {
          throw new Error('ACCOUNT_FLAGGED_SPAM');
        }

        // Check if sender has blocked recipient
        const senderBlockedList = senderData.blockedUsers || senderData.blocked_users || [];
        if (Array.isArray(senderBlockedList) && senderBlockedList.includes(recipientId)) {
          throw new Error('USER_BLOCKED_BY_YOU');
        }

        // Check if recipient has blocked sender
        const recipientRef = doc(firestore, 'users', recipientId);
        const recipientSnap = await getDoc(recipientRef);
        if (recipientSnap.exists()) {
          const recipientData = recipientSnap.data();
          const recipientBlockedList = recipientData.blockedUsers || recipientData.blocked_users || [];
          if (Array.isArray(recipientBlockedList) && recipientBlockedList.includes(senderId)) {
            throw new Error('USER_BLOCKED_BY_RECIPIENT');
          }
        }

        // Check if account is "new" (created within 24 hours)
        const createdAtStr = senderData.created_at || senderData.createdAt;
        if (createdAtStr) {
          const createdTime = new Date(createdAtStr).getTime();
          const isNewAccount = (Date.now() - createdTime) < 24 * 60 * 60 * 1000;

          if (isNewAccount) {
            // Check if recipient is a contact
            const isDefaultContact = DEFAULT_CONTACTS.some((c) => c.id === recipientId);
            let isContact = isDefaultContact;

            if (!isContact) {
              const contactRef = doc(firestore, 'users', senderId, 'contacts', recipientId);
              const contactSnap = await getDoc(contactRef);
              if (contactSnap.exists()) {
                isContact = true;
              }
            }

            // If the recipient is not in the sender's contacts, evaluate rate limits
            if (!isContact) {
              const now = Date.now();
              if (!nonContactMessageCache[senderId]) {
                nonContactMessageCache[senderId] = [];
              }

              // Record message attempt
              nonContactMessageCache[senderId].push({
                recipientId,
                timestamp: now,
              });

              // Purge logs older than 5 minutes to prevent memory leaks
              nonContactMessageCache[senderId] = nonContactMessageCache[senderId].filter(
                (msg) => (now - msg.timestamp) < 5 * 60 * 1000
              );

              const logs = nonContactMessageCache[senderId];
              const sentInLast15s = logs.filter((msg) => (now - msg.timestamp) < 15 * 1000);
              const sentInLast1m = logs.filter((msg) => (now - msg.timestamp) < 60 * 1000);
              const uniqueRecipientsInLast3m = new Set(
                logs.filter((msg) => (now - msg.timestamp) < 3 * 60 * 1000).map((msg) => msg.recipientId)
              );

              let shouldFlag = false;
              let flaggedReason = '';

              if (sentInLast15s.length > 5) {
                shouldFlag = true;
                flaggedReason = `High-frequency messaging burst: sent ${sentInLast15s.length} messages in under 15 seconds to non-contacts on a new account.`;
              } else if (sentInLast1m.length > 12) {
                shouldFlag = true;
                flaggedReason = `High-frequency messaging rate: sent ${sentInLast1m.length} messages in under 1 minute to non-contacts on a new account.`;
              } else if (uniqueRecipientsInLast3m.size > 3) {
                shouldFlag = true;
                flaggedReason = `Suspicious unsolicited outreach: messaged ${uniqueRecipientsInLast3m.size} different non-contacts in under 3 minutes on a new account.`;
              }

              if (shouldFlag) {
                // Update sender user document in Firestore to flagged status
                await updateDoc(senderRef, {
                  is_flagged: true,
                  flagged_reason: flaggedReason,
                  isFlagged: true,
                  flaggedReason,
                });

                // File a report in the system reports collection
                const reportId = `report_${senderId}_${now}`;
                const reportRef = doc(firestore, 'reports', reportId);
                await setDoc(reportRef, {
                  id: reportId,
                  reportedUserId: senderId,
                  reportedByUserId: 'SYSTEM_ANTISPAM',
                  reason: 'Spam',
                  details: flaggedReason,
                  createdAt: new Date().toISOString(),
                  status: 'pending',
                });

                throw new Error('ACCOUNT_FLAGGED_SPAM');
              }
            }
          }
        }
      }
    } catch (spamErr: any) {
      if (spamErr.message === 'ACCOUNT_FLAGGED_SPAM') {
        throw spamErr;
      }
      console.warn('[Anti-Spam] Evaluation warning:', spamErr);
    }
  }

  let finalContent = content.trim();
  let finalCaption = caption && caption.trim() ? caption.trim() : undefined;

  // Encrypt text content and caption with session key if available
  if (conversationKey && type === 'text' && finalContent) {
    const encRes = await encryptTextContent(finalContent, conversationKey);
    if (encRes?.encryptedString) {
      finalContent = encRes.encryptedString;
    }
  }

  if (conversationKey && finalCaption) {
    const encCap = await encryptTextContent(finalCaption, conversationKey);
    if (encCap?.encryptedString) {
      finalCaption = encCap.encryptedString;
    }
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
    readBy: {
      [senderId]: nowIso,
    },
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

  // Calculate disappearing messages expiry
  if (disappearingDuration && disappearingDuration > 0) {
    const expiryDate = new Date(Date.now() + disappearingDuration * 1000);
    msgData.expiresAt = expiryDate.toISOString();
  }

  // Add to subcollection
  const messagesRef = collection(firestore, 'chats', chatId, 'messages');
  const msgDoc = await addDoc(messagesRef, msgData);

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
        : content.trim();

    const updatePayload: Record<string, any> = {
      lastMessage: {
        senderId,
        senderName,
        content: previewContent,
        type,
        timestamp: nowIso,
        status: 'sent',
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

  // If in 1-on-1 and recipient is bot, schedule reply
  if (!isGroup && recipientId && (recipientId.startsWith('hala_support') || recipientId.startsWith('user_'))) {
    scheduleSimulatedContactReply(
      chatId,
      recipientId,
      senderId,
      type === 'text' ? content.trim() : type === 'voice' ? 'Voice note' : type === 'poll' ? 'Created poll' : 'Sent media'
    );
  }

  return msgDoc.id;
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
}): Promise<string> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();

  // (a) Message Content Encryption Logging
  let finalContent = content.trim();
  console.log('[Text Message Flow - Step a] Starting message content encryption...', {
    hasConversationKey: Boolean(conversationKey),
    rawTextLength: finalContent.length,
  });

  if (conversationKey && finalContent) {
    try {
      const encRes = await encryptTextContent(finalContent, conversationKey);
      if (encRes?.encryptedString) {
        finalContent = encRes.encryptedString;
        console.log('[Text Message Flow - Step a] Message content encryption SUCCEEDED. Payload sample:', finalContent.slice(0, 20) + '...');
      } else {
        console.warn('[Text Message Flow - Step a] Encryption returned null/empty. Sending plain text fallback.');
      }
    } catch (encErr) {
      console.error('[Text Message Flow - Step a] Message content encryption FAILED with error:', encErr);
      throw encErr;
    }
  } else {
    console.log('[Text Message Flow - Step a] No active conversationKey. Sending unencrypted text payload.');
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
    readBy: {
      [senderId]: nowIso,
    },
  };

  if (disappearingDuration && disappearingDuration > 0) {
    const expiryDate = new Date(Date.now() + disappearingDuration * 1000);
    msgData.expiresAt = expiryDate.toISOString();
  }

  try {
    const messagesRef = collection(firestore, 'chats', chatId, 'messages');
    const msgDoc = await addDoc(messagesRef, msgData);
    console.log('[Text Message Flow - Step b] Firestore message document write SUCCEEDED. Message ID:', msgDoc.id);

    // Update parent chat document
    const chatRef = doc(firestore, 'chats', chatId);
    try {
      const updatePayload: Record<string, any> = {
        lastMessage: {
          senderId,
          senderName,
          content: content.trim(),
          type: 'text',
          timestamp: nowIso,
          status: 'sent',
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

    if (!isGroup && recipientId && (recipientId.startsWith('hala_support') || recipientId.startsWith('user_'))) {
      scheduleSimulatedContactReply(chatId, recipientId, senderId, content.trim());
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

  try {
    const docSnap = await getDoc(msgRef);
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    const reactions: Record<string, string[]> = { ...(data.reactions || {}) };

    // Check if user already reacted with this emoji
    const currentUsersForEmoji = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
    const alreadyReactedWithThisEmoji = currentUsersForEmoji.includes(userId);

    // Remove user's reaction from any other emoji (single reaction per user)
    Object.keys(reactions).forEach((em) => {
      if (Array.isArray(reactions[em])) {
        reactions[em] = reactions[em].filter((u) => u !== userId);
        if (reactions[em].length === 0) {
          delete reactions[em];
        }
      }
    });

    if (!alreadyReactedWithThisEmoji) {
      // Add user to this emoji
      reactions[emoji] = [...(reactions[emoji] || []), userId];
    }

    await updateDoc(msgRef, { reactions });
  } catch (err) {
    console.warn('Failed to toggle reaction:', err);
  }
}

// Edit a Sent Chat Message (Text only)
export async function editChatMessage({
  chatId,
  messageId,
  newContent,
  isLastMessage = false,
}: {
  chatId: string;
  messageId: string;
  newContent: string;
  isLastMessage?: boolean;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const msgRef = doc(firestore, 'chats', chatId, 'messages', messageId);
  const nowIso = new Date().toISOString();

  await updateDoc(msgRef, {
    content: newContent.trim(),
    isEdited: true,
    editedAt: nowIso,
  });

  if (isLastMessage) {
    const chatRef = doc(firestore, 'chats', chatId);
    try {
      await updateDoc(chatRef, {
        'lastMessage.content': newContent.trim(),
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

// Helper for simulated interactive replies
function scheduleSimulatedContactReply(
  chatId: string,
  botId: string,
  userRecipientId: string,
  incomingText: string
) {
  setTimeout(async () => {
    const firestore = getFirebaseDb();
    const chatRef = doc(firestore, 'chats', chatId);

    // Set bot typing = true and mark user messages as read
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(chatRef, {
        [`typing.${botId}`]: true,
        'lastMessage.status': 'read',
      });

      const messagesRef = collection(firestore, 'chats', chatId, 'messages');
      const snap = await getDocs(query(messagesRef, where('senderId', '==', userRecipientId), limit(25)));
      snap.docs.forEach(async (d) => {
        const data = d.data();
        if (!data.readBy || !data.readBy[botId] || data.status !== 'read') {
          try {
            await updateDoc(d.ref, {
              [`readBy.${botId}`]: nowIso,
              status: 'read',
            });
          } catch {
            // ignore
          }
        }
      });
    } catch {
      // ignore
    }

    // Wait 1.8 seconds typing delay
    setTimeout(async () => {
      let replyContent = '';
      if (botId === 'hala_support') {
        if (incomingText === 'Voice note') {
          replyContent = 'أهلاً بك! استمعنا لرسالتك الصوتية بوضوح تام، شكراً لتواصلك مع دعم هلا 🎙️✨';
        } else if (incomingText.includes('مرحبا') || incomingText.includes('هلا') || incomingText.toLowerCase().includes('hi') || incomingText.toLowerCase().includes('hello')) {
          replyContent = 'أهلاً وسهلاً بك في تطبيق هلا! نحن هنا لمساعدتك في أي استفسار حول الرسائل والدردشات الفورية 💬';
        } else if (incomingText.includes('شكرا') || incomingText.toLowerCase().includes('thanks')) {
          replyContent = 'على الرحب والسعة! نتمنى لك تجربة ممتعة وآمنة على تطبيق هلا 🌟';
        } else {
          replyContent = 'شكراً لتواصلك مع دعم هلا! تم استلام رسالتك وتوثيقها في قاعدة بيانات Firestore بنجاح ⚡';
        }
      } else if (botId === 'user_tariq_uae') {
        replyContent = incomingText === 'Voice note' ? 'ما شاء الله الصوت واضح جداً! يعطيك العافية 🎙️🇦🇪' : 'مرحباً! كيف حالك؟ يسعدني التواصل معك عبر هلا 🇦🇪';
      } else if (botId === 'user_noura_ksa') {
        replyContent = incomingText === 'Voice note' ? 'صوتك واضح ما شاء الله! ميزة الرسائل الصوتية رهيبة 👌🎙️' : 'أهلاً بك! تطبيق هلا سريع جداً وتصميمه رائع 👌✨';
      } else {
        replyContent = 'هلا والله! وصلت رسالتك تماماً 📱✨';
      }

      const nowIso = new Date().toISOString();
      const messagesRef = collection(firestore, 'chats', chatId, 'messages');

      try {
        await addDoc(messagesRef, {
          senderId: botId,
          content: replyContent,
          type: 'text',
          status: 'delivered',
          timestamp: nowIso,
          readBy: { [botId]: nowIso },
          reactions: {},
          deletedFor: [],
        });

        await updateDoc(chatRef, {
          lastMessage: {
            senderId: botId,
            content: replyContent,
            type: 'text',
            timestamp: nowIso,
            status: 'delivered',
          },
          updatedAt: nowIso,
          [`typing.${botId}`]: false,
          [`unreadCount.${userRecipientId}`]: increment(1),
        });
      } catch (err) {
        console.warn('Simulated reply error:', err);
      }
    }, 1800);
  }, 800);
}

// Mark chat messages as read & update read receipts for participants
export async function markChatAsRead(
  chatId: string,
  userId: string,
  unreadMessages: MessageModel[] = []
): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);

  try {
    await updateDoc(chatRef, {
      [`unreadCount.${userId}`]: 0,
      'lastMessage.status': 'read',
    });
  } catch (err) {
    console.warn('Failed to mark chat as read:', err);
  }

  // Update readBy & status for incoming unread messages
  if (unreadMessages.length > 0) {
    const nowIso = new Date().toISOString();
    for (const msg of unreadMessages) {
      if (msg.senderId !== userId && (!msg.readBy || !msg.readBy[userId])) {
        try {
          const msgDocRef = doc(firestore, 'chats', chatId, 'messages', msg.id);
          await updateDoc(msgDocRef, {
            [`readBy.${userId}`]: nowIso,
            status: 'read',
          });
        } catch {
          // ignore single message update error
        }
      }
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

  // 1. Create channel in 'chats' collection for uniform message streaming
  const chatsRef = collection(firestore, 'chats');
  const chatDocRef = await addDoc(chatsRef, {
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

  const channelId = chatDocRef.id;

  // 2. Create in 'channels' table
  try {
    const channelDocRef = doc(firestore, 'channels', channelId);
    await setDoc(channelDocRef, {
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

    // 3. Create subscriber entry in 'channels/{channelId}/subscribers' and root 'channel_subscribers'
    const subscriberRef = doc(firestore, 'channels', channelId, 'subscribers', ownerId);
    await setDoc(subscriberRef, {
      channel_id: channelId,
      user_id: ownerId,
      name: ownerProfile.name,
      avatar_url: ownerProfile.avatarUrl || null,
      joined_at: nowIso,
    });

    const rootSubRef = doc(firestore, 'channel_subscribers', `${channelId}_${ownerId}`);
    await setDoc(rootSubRef, {
      channel_id: channelId,
      user_id: ownerId,
      joined_at: nowIso,
    });
  } catch (err) {
    console.warn('Error creating channels table records:', err);
  }

  // 4. Initial welcome message
  try {
    const messagesRef = collection(firestore, 'chats', channelId, 'messages');
    await addDoc(messagesRef, {
      senderId: ownerId,
      senderName: ownerProfile.name,
      content: `📢 مرحباً بكم في قناة "${name.trim()}"! تابعوا هنا أحدث الأخبار والتحديثات 🌟`,
      type: 'text',
      status: 'sent',
      timestamp: nowIso,
      readBy: { [ownerId]: nowIso },
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

  // 1. Update chats collection
  const chatRef = doc(firestore, 'chats', channelId);
  await updateDoc(chatRef, {
    participants: arrayUnion(userId),
    [`participantDetails.${userId}`]: {
      name: userProfile.name,
      avatarUrl: userProfile.avatarUrl || null,
      phone: userProfile.phoneNumber,
      role: 'member',
    },
    subscriberCount: increment(1),
    updatedAt: nowIso,
  });

  // 2. Update channels & subscribers table
  try {
    const channelRef = doc(firestore, 'channels', channelId);
    await updateDoc(channelRef, {
      subscriber_count: increment(1),
    });

    const subRef = doc(firestore, 'channels', channelId, 'subscribers', userId);
    await setDoc(subRef, {
      channel_id: channelId,
      user_id: userId,
      name: userProfile.name,
      avatar_url: userProfile.avatarUrl || null,
      joined_at: nowIso,
    });

    const rootSubRef = doc(firestore, 'channel_subscribers', `${channelId}_${userId}`);
    await setDoc(rootSubRef, {
      channel_id: channelId,
      user_id: userId,
      joined_at: nowIso,
    });
  } catch (err) {
    console.warn('joinChannel channels table update error:', err);
  }
}

// Leave Channel
export async function leaveChannel({
  channelId,
  userId,
}: {
  channelId: string;
  userId: string;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const nowIso = new Date().toISOString();

  // 1. Remove from chats
  const chatRef = doc(firestore, 'chats', channelId);
  const chatSnap = await getDoc(chatRef);
  if (chatSnap.exists()) {
    const data = chatSnap.data();
    const currentParts: string[] = data.participants || [];
    const newParts = currentParts.filter((p) => p !== userId);
    await updateDoc(chatRef, {
      participants: newParts,
      subscriberCount: increment(-1),
      updatedAt: nowIso,
    });
  }

  // 2. Remove from channels & subscribers
  try {
    const channelRef = doc(firestore, 'channels', channelId);
    await updateDoc(channelRef, {
      subscriber_count: increment(-1),
    });

    const subRef = doc(firestore, 'channels', channelId, 'subscribers', userId);
    await deleteDoc(subRef);

    const rootSubRef = doc(firestore, 'channel_subscribers', `${channelId}_${userId}`);
    await deleteDoc(rootSubRef);
  } catch (err) {
    console.warn('leaveChannel channels table update error:', err);
  }
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

  const docSnap = await getDoc(msgRef);
  if (!docSnap.exists()) return;

  const data = docSnap.data();
  if (!data.pollData || !Array.isArray(data.pollData.options)) return;

  const currentPoll: PollData = data.pollData;
  const updatedOptions = currentPoll.options.map((opt) => {
    const votes = Array.isArray(opt.votes) ? [...opt.votes] : [];
    const hasVoted = votes.includes(userId);

    if (opt.id === optionId) {
      if (hasVoted) {
        // Toggle off
        return { ...opt, votes: votes.filter((u) => u !== userId) };
      } else {
        // Add vote
        return { ...opt, votes: [...votes, userId] };
      }
    } else {
      if (!allowMultiple) {
        // If single choice, remove from other options
        return { ...opt, votes: votes.filter((u) => u !== userId) };
      }
      return opt;
    }
  });

  // Calculate unique voters total count
  const allVoterIds = new Set<string>();
  updatedOptions.forEach((opt) => {
    opt.votes.forEach((v) => allVoterIds.add(v));
  });

  const updatedPollData: PollData = {
    ...currentPoll,
    options: updatedOptions,
    totalVotes: allVoterIds.size,
  };

  await updateDoc(msgRef, {
    pollData: updatedPollData,
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
  } else if (status === 'ended' || status === 'declined' || status === 'missed') {
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
      // Get the latest ringing call
      const docs = snapshot.docs.map((d) => d.data() as CallModel);
      docs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      callback(docs[0]);
    },
    (error) => {
      console.warn('Error subscribing to incoming calls:', error);
      callback(null);
    }
  );
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
  callback: (calls: CallModel[]) => void
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
    callback(merged);
  };

  const qCaller = query(callsRef, where('callerId', '==', userId));
  const qCallee = query(callsRef, where('calleeId', '==', userId));

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
    userPhone: userPhone || '',
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

  const q = query(storiesRef, where('expiresAt', '>', nowIso));

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
}: {
  chatId: string;
  userId?: string;
  wallpaper: string | null;
}): Promise<void> {
  const firestore = getFirebaseDb();
  const chatRef = doc(firestore, 'chats', chatId);
  const nowIso = new Date().toISOString();

  const updatePayload: Record<string, any> = {
    updatedAt: nowIso,
  };

  if (wallpaper) {
    updatePayload.wallpaper = wallpaper;
    if (userId) {
      updatePayload[`wallpaperBy.${userId}`] = wallpaper;
    }
  } else {
    // Reset to default
    updatePayload.wallpaper = null;
    if (userId) {
      updatePayload[`wallpaperBy.${userId}`] = null;
    }
  }

  await updateDoc(chatRef, updatePayload);
}




