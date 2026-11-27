import { playTone, readSoundPreferences } from './sounds.ts';
import {
  requestAppNotificationPermission,
  showAppNotification,
  getNotificationPermission,
  getAndroidNotificationBridge,
} from '../services/notifications.ts';

// Web Push Notifications Helper delegating to services/notifications.ts
export async function requestNotificationPermission(): Promise<boolean> {
  return await requestAppNotificationPermission();
}

export function looksLikeEncryptedPayload(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    trimmed.startsWith('{') &&
    (trimmed.includes('"iv"') || trimmed.includes('"ciphertext"') || trimmed.includes('"ct"'))
  ) {
    return true;
  }
  if (/^(E2EE:|ENC:|v1:)/i.test(trimmed)) {
    return true;
  }
  // Long whitespace-free base64/hex-like blob (never a normal human word)
  if (trimmed.length >= 40 && !/\s/.test(trimmed) && /^[A-Za-z0-9+/=._:-]+$/.test(trimmed)) {
    return true;
  }
  return false;
}

function formatVoiceDuration(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }
  const total = Math.max(1, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return ` (${mins}:${secs < 10 ? '0' : ''}${secs})`;
}

export function formatNotificationMessagePreview(params: {
  type?: string;
  content?: string | null;
  decryptedText?: string | null;
  caption?: string | null;
  duration?: number;
  fileName?: string;
  pollQuestion?: string;
  language?: 'en' | 'ar';
}): string {
  const isAr = params.language === 'ar';
  const msgType = (params.type || 'text').toLowerCase();

  const safeCaption =
    typeof params.caption === 'string' && params.caption.trim() && !looksLikeEncryptedPayload(params.caption)
      ? params.caption.trim()
      : '';

  switch (msgType) {
    case 'voice': {
      const dur = formatVoiceDuration(params.duration);
      return isAr ? `🎤 رسالة صوتية${dur}` : `🎤 Voice message${dur}`;
    }
    case 'image':
      return safeCaption ? `📷 ${safeCaption}` : isAr ? '📷 صورة' : '📷 Photo';
    case 'video':
      return safeCaption ? `🎥 ${safeCaption}` : isAr ? '🎥 فيديو' : '🎥 Video';
    case 'file': {
      const name = typeof params.fileName === 'string' ? params.fileName.trim() : '';
      return name ? `📎 ${name}` : isAr ? '📎 ملف' : '📎 File';
    }
    case 'location':
      return isAr ? '📍 موقع جغرافي' : '📍 Location';
    case 'sticker':
      return isAr ? '✨ ملصق' : '✨ Sticker';
    case 'poll': {
      const q = typeof params.pollQuestion === 'string' ? params.pollQuestion.trim() : '';
      return q ? `📊 ${q}` : isAr ? '📊 استطلاع رأي' : '📊 Poll';
    }
    case 'text':
    default: {
      const candidate =
        typeof params.decryptedText === 'string' && params.decryptedText.trim()
          ? params.decryptedText.trim()
          : typeof params.content === 'string'
            ? params.content.trim()
            : '';

      if (!candidate || looksLikeEncryptedPayload(candidate)) {
        return isAr ? 'رسالة جديدة' : 'New message';
      }
      return candidate;
    }
  }
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
    senderName,
    currentUserName,
    currentUserPhone,
    isReplyToUser,
    chatId,
  } = params;

  const safeContent = looksLikeEncryptedPayload(params.messageContent)
    ? 'New message'
    : (params.messageContent || 'New message').trim() || 'New message';

  const prefs = readSoundPreferences();
  const groupSetting = prefs.groupNotifications || 'mentions';

  const isDirectMessage = chatType === '1-1';

  const cleanName = currentUserName.replace(/\s+/g, '');
  const mentionsUser =
    safeContent.includes(`@${currentUserName}`) ||
    safeContent.includes(`@${cleanName}`) ||
    (currentUserPhone && safeContent.includes(`@${currentUserPhone}`));

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
    title = senderName || 'Hala Chat';
  }

  const isNativeAndroid = Boolean(getAndroidNotificationBridge());

  try {
    showAppNotification(title, {
      body: safeContent.slice(0, 140),
      icon: './icons/icon-192.png',
      badge: './icons/notification-badge-96.png',
      tag: chatId ? `chat-${chatId}` : `hala-msg-${Date.now()}`,
      data: { chatId: chatId || '' },
    });

    // On web/PWA, synthesize Web Audio message tone; on native Android, the
    // hala_messages_v2 channel already plays bundled hala_message_tone.wav
    if (!isNativeAndroid && prefs.messageSoundEnabled && !params.isChatOpen) {
      playTone(chatType === 'group' ? 'group' : 'message');
    }
  } catch (err) {
    console.warn('Notification trigger error:', err);
  }
}
