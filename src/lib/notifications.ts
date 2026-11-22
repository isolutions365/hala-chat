import { playTone, readSoundPreferences } from './sounds';
import { requestAppNotificationPermission, showAppNotification, getNotificationPermission } from '../services/notifications';

// Web Push Notifications Helper delegating to services/notifications.ts
export async function requestNotificationPermission(): Promise<boolean> {
  return await requestAppNotificationPermission();
}

export function triggerFilteredNotification(params: {
  chatType: '1-1' | 'group' | 'channel';
  messageContent: string;
  senderName: string;
  senderAvatar?: string | null;
  currentUserName: string;
  currentUserPhone?: string;
  isReplyToUser?: boolean;
  isChatOpen?: boolean;
  chatId?: string;
}): void {
  if (getNotificationPermission() !== 'granted') return;

  const {
    chatType,
    messageContent,
    senderName,
    currentUserName,
    currentUserPhone,
    isReplyToUser,
  } = params;

  const prefs = readSoundPreferences();
  const groupSetting = prefs.groupNotifications || 'mentions';

  const isDirectMessage = chatType === '1-1';

  const cleanName = currentUserName.replace(/\s+/g, '');
  const mentionsUser =
    messageContent.includes(`@${currentUserName}`) ||
    messageContent.includes(`@${cleanName}`) ||
    (currentUserPhone && messageContent.includes(`@${currentUserPhone}`));

  const isReply = Boolean(isReplyToUser);

  if (chatType === 'group') {
    if (groupSetting === 'off') {
      return;
    }
    if (groupSetting === 'mentions' && !mentionsUser && !isReply) {
      return;
    }
  } else if (!isDirectMessage && !mentionsUser && !isReply) {
    return;
  }

  // Construct Notification Title
  let title = senderName;
  if (mentionsUser) {
    title = `${senderName} mentioned you`;
  } else if (isReply) {
    title = `${senderName} replied to you`;
  } else if (isDirectMessage) {
    title = `New message from ${senderName}`;
  }

  try {
    showAppNotification(title, {
      body: messageContent.slice(0, 100),
      icon: './icons/icon-192.png',
      badge: './icons/notification-badge-96.png',
      tag: `hala-msg-${Date.now()}`,
    });

    // Play tone for 1-1 or group chat if enabled and chat is not currently open
    if (prefs.messageSoundEnabled && !params.isChatOpen) {
      playTone(chatType === 'group' ? 'group' : 'message');
    }
  } catch (err) {
    console.warn('Notification trigger error:', err);
  }
}
