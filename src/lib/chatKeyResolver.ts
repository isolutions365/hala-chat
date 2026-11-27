import { doc, getDoc } from 'firebase/firestore';
import type { ChatModel } from '../types';
import { getFirebaseDb } from './firebase';
import { derive1on1SessionKey, decryptGroupSymmetricKey } from './crypto';

const resolvedKeyCache = new Map<string, { key: CryptoKey; peerPubKey?: any }>();

export function clearResolvedChatKeys(): void {
  resolvedKeyCache.clear();
}

export async function fetchChatById(chatId: string): Promise<ChatModel | null> {
  if (!chatId || !chatId.trim()) return null;
  try {
    const snap = await getDoc(doc(getFirebaseDb(), 'chats', chatId.trim()));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<ChatModel, 'id'>) };
  } catch (err) {
    console.warn('[ChatKeyResolver] Failed to fetch chat by ID:', err);
    return null;
  }
}

export async function resolveChatCryptoKey(
  chat: ChatModel,
  currentUserId: string
): Promise<CryptoKey | null> {
  if (!chat?.id || !currentUserId) return null;

  try {
    const cached = resolvedKeyCache.get(chat.id);
    const firestore = getFirebaseDb();

    if (chat.type === '1-1') {
      const peerId = (chat.participants || []).find((p) => p !== currentUserId);
      if (!peerId) return null;

      let peerPubKey = (chat.participantDetails?.[peerId] as any)?.publicKey;
      if (cached && (!peerPubKey || cached.peerPubKey === peerPubKey)) {
        return cached.key;
      }

      if (!peerPubKey) {
        try {
          const pSnap = await getDoc(doc(firestore, 'users_public', peerId));
          if (pSnap.exists()) peerPubKey = pSnap.data()?.public_key;
          if (!peerPubKey) {
            const uSnap = await getDoc(doc(firestore, 'users', peerId));
            if (uSnap.exists()) peerPubKey = uSnap.data()?.public_key;
          }
        } catch {
          // ignore lookup errors
        }
      }

      if (!peerPubKey) return null;
      const key = await derive1on1SessionKey({
        currentUserId,
        peerPublicKeyJwk: peerPubKey,
        chatId: chat.id,
      });
      if (key) {
        resolvedKeyCache.set(chat.id, { key, peerPubKey });
      }
      return key;
    }

    if (chat.type === 'group') {
      if (cached) return cached.key;
      const grpEncPkg = chat.encryptedGroupKeys?.[currentUserId];
      if (!grpEncPkg) return null;
      const key = await decryptGroupSymmetricKey({
        currentUserId,
        encryptedPackage: grpEncPkg,
        chatId: chat.id,
      });
      if (key) {
        resolvedKeyCache.set(chat.id, { key });
      }
      return key;
    }

    return null;
  } catch (err) {
    console.warn('[ChatKeyResolver] Key resolution error:', err);
    return null;
  }
}
