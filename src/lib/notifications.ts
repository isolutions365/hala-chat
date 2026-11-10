import { playTone, readSoundPreferences } from './sounds';
// Web Push Notifications Helper
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
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
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

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

  // STRICT FILTER CRITERIA:
  // 1) Direct Message (1-1): passes
  // 2) Group: depends on groupNotifications setting ('all' | 'mentions' | 'off')
  // 3) Channel: passes only if mentionsUser or isReply
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

  // Construct Notification
  let title = senderName;
  if (mentionsUser) {
    title = `${senderName} mentioned you`;
  } else if (isReply) {
    title = `${senderName} replied to you`;
  } else if (isDirectMessage) {
    title = `New message from ${senderName}`;
  }

  try {
    const notification = new Notification(title, {
      body: messageContent.slice(0, 100),
      icon: '/icons/icon-192.png',
      badge: '/icons/notification-badge-96.png',
      tag: `hala-msg-${Date.now()}`,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Play tone for 1-1 or group chat if enabled and chat is not currently open
    if (prefs.messageSoundEnabled && !params.isChatOpen) {
      playTone(chatType === 'group' ? 'group' : 'message');
    }
  } catch (err) {
    console.warn('Notification trigger error:', err);
  }
}
