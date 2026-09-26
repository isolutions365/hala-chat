import { Language } from '../types';

export function formatMessageTime(isoString: string, language: Language): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleTimeString(language === 'ar' ? 'ar-AE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export function formatChatListTime(isoString: string, language: Language): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString(language === 'ar' ? 'ar-AE' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return language === 'ar' ? 'أمس' : 'Yesterday';
    }

    // Past 6 days: show day of week
    const diffDays = Math.round((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
    if (diffDays < 7) {
      return date.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-US', {
        weekday: 'short',
      });
    }

    // Older
    return date.toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function formatPresenceStatus(
  isOnline: boolean | undefined,
  lastSeenIso: string | undefined,
  isTyping: boolean | undefined,
  language: Language
): string {
  const isRtl = language === 'ar';

  if (isTyping) {
    return isRtl ? 'يكتب الآن...' : 'typing...';
  }

  if (isOnline) {
    return isRtl ? 'متصل الآن' : 'Online';
  }

  if (!lastSeenIso) {
    return isRtl ? 'غير متصل' : 'Offline';
  }

  try {
    const lastSeen = new Date(lastSeenIso);
    if (isNaN(lastSeen.getTime())) return isRtl ? 'غير متصل' : 'Offline';

    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60));

    if (diffMinutes < 1) {
      return isRtl ? 'آخر ظهور منذ لحظات' : 'last seen just now';
    }
    if (diffMinutes < 60) {
      return isRtl ? `آخر ظهور منذ ${diffMinutes} دقيقة` : `last seen ${diffMinutes}m ago`;
    }

    const isToday =
      lastSeen.getDate() === now.getDate() &&
      lastSeen.getMonth() === now.getMonth() &&
      lastSeen.getFullYear() === now.getFullYear();

    if (isToday) {
      const timeStr = lastSeen.toLocaleTimeString(isRtl ? 'ar-AE' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return isRtl ? `آخر ظهور اليوم ${timeStr}` : `last seen today at ${timeStr}`;
    }

    return isRtl
      ? `آخر ظهور ${lastSeen.toLocaleDateString('ar-AE')}`
      : `last seen ${lastSeen.toLocaleDateString('en-US')}`;
  } catch {
    return isRtl ? 'غير متصل' : 'offline';
  }
}
