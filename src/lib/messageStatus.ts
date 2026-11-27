export type ComputedMessageStatus = 'sending' | 'failed' | 'sent' | 'delivered' | 'read';

/**
 * Single authoritative source of truth for message status calculation.
 * Used identically across ChatListScreen and ConversationScreen.
 */
export function getMessageStatus(
  message: any,
  receiverUid?: string,
  currentUserId?: string,
  isGroup?: boolean
): ComputedMessageStatus {
  if (!message) return 'sent';

  // 1. Pending / Sending state
  if (
    message.status === 'sending' ||
    message.hasPendingWrites === true ||
    (typeof message.id === 'string' &&
      (message.id.startsWith('temp_') ||
        message.id.startsWith('voice_') ||
        message.id.startsWith('media_') ||
        message.id.startsWith('file_') ||
        message.id.startsWith('sticker_') ||
        message.id.startsWith('poll_')))
  ) {
    return 'sending';
  }

  // 2. Failed state
  if (message.status === 'failed') {
    return 'failed';
  }

  // Normalize readBy array (supporting array and legacy map formats)
  const readBy: string[] = Array.isArray(message.readBy)
    ? message.readBy
    : typeof message.readBy === 'object' && message.readBy !== null
    ? Object.keys(message.readBy)
    : [];

  // Normalize deliveredTo array (supporting array and legacy map formats)
  const deliveredTo: string[] = Array.isArray(message.deliveredTo)
    ? message.deliveredTo
    : typeof message.deliveredTo === 'object' && message.deliveredTo !== null
    ? Object.keys(message.deliveredTo)
    : [];

  // 3. Group vs 1-on-1 resolution
  if (isGroup) {
    // In group, marked 'read' if any participant other than the sender and current user read it
    const sender = message.senderId;
    if (readBy.some((uid) => uid && uid !== sender && (!currentUserId || uid !== currentUserId))) {
      return 'read';
    }
    if (deliveredTo.some((uid) => uid && uid !== sender && (!currentUserId || uid !== currentUserId))) {
      return 'delivered';
    }
  } else if (receiverUid) {
    // In 1-on-1, check if the recipient has read or received
    if (readBy.includes(receiverUid)) {
      return 'read';
    }
    if (deliveredTo.includes(receiverUid)) {
      return 'delivered';
    }
  }

  // 4. Backward-compatibility / Legacy status fallbacks
  if (message.status === 'read') return 'read';
  if (message.status === 'delivered') return 'delivered';

  // 5. Default sent state (written to server)
  return 'sent';
}
