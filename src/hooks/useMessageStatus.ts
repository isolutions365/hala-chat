import { useState, useEffect } from 'react';
import { getMessageStatus, ComputedMessageStatus } from '../lib/messageStatus';
import { MessageModel } from '../types';

export function useMessageStatus(
  _chatId: string,
  _messageId: string,
  message: MessageModel | null,
  receiverUid: string,
  isGroup: boolean,
  currentUserId: string
): ComputedMessageStatus {
  const [status, setStatus] = useState<ComputedMessageStatus>(() =>
    getMessageStatus(message, receiverUid, currentUserId, isGroup)
  );

  useEffect(() => {
    setStatus(getMessageStatus(message, receiverUid, currentUserId, isGroup));
  }, [message, receiverUid, isGroup, currentUserId]);

  return status;
}
