import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase';
import { getMessageStatus } from '../lib/messageStatus';
import { MessageModel } from '../types';

export function useMessageStatus(
  chatId: string,
  messageId: string,
  initialMessage: MessageModel | null,
  receiverUid: string,
  isGroup: boolean,
  currentUserId: string
) {
  const [status, setStatus] = useState<'sent' | 'delivered' | 'read'>(() => 
    getMessageStatus(initialMessage, receiverUid, isGroup, currentUserId)
  );

  useEffect(() => {
    if (initialMessage) {
      const currentStatus = getMessageStatus(initialMessage, receiverUid, isGroup, currentUserId);
      setStatus(currentStatus);
    }
  }, [initialMessage, receiverUid, isGroup, currentUserId]);

  useEffect(() => {
    if (
      !chatId ||
      typeof chatId !== 'string' ||
      !chatId.trim() ||
      !messageId ||
      typeof messageId !== 'string' ||
      !messageId.trim() ||
      messageId.startsWith('temp_') ||
      messageId.startsWith('voice_') ||
      messageId.startsWith('media_') ||
      messageId.startsWith('file_') ||
      messageId.startsWith('sticker_') ||
      messageId.startsWith('poll_')
    ) {
      return;
    }

    const db = getFirebaseDb();
    const messageDocRef = doc(db, 'chats', chatId, 'messages', messageId);

    const unsubscribe = onSnapshot(messageDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const messageData = snapshot.data();
        const newStatus = getMessageStatus(messageData, receiverUid, isGroup, currentUserId);
        setStatus(newStatus);
      }
    }, (error) => {
      console.warn('Error listening to message status:', error);
    });

    return () => unsubscribe();
  }, [chatId, messageId, receiverUid, isGroup, currentUserId]);

  return status;
}
