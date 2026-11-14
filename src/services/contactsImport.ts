import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../lib/firebase';
import { Language } from '../types';

export interface RawPhoneContact {
  name: string;
  phone: string;
}

export interface MatchedUser {
  phone: string;
  uid: string;
  name: string;
  avatar_url: string | null;
  public_key: string | null;
}

export interface UnmatchedContact {
  name: string;
  phone: string;
}

/**
 * Checks if the Web Contact Picker API is supported on the current browser/device.
 * Wrap in service so it can later be easily swapped for Capacitor Contacts plugin.
 */
export function isContactPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof (navigator as any).contacts?.select === 'function'
  );
}

/**
 * Opens device contact picker to select one or multiple contacts.
 */
export async function pickPhoneContacts(): Promise<RawPhoneContact[]> {
  if (!isContactPickerSupported()) {
    throw new Error('Contact Picker API is not supported on this device.');
  }

  try {
    const rawContacts = await (navigator as any).contacts.select(['name', 'tel'], {
      multiple: true,
    });

    if (!Array.isArray(rawContacts)) return [];

    const results: RawPhoneContact[] = [];
    for (const item of rawContacts) {
      const rawName = Array.isArray(item.name) ? item.name[0] : item.name;
      const name = (rawName || '').trim() || 'Contact';
      const tels: string[] = Array.isArray(item.tel) ? item.tel : item.tel ? [item.tel] : [];

      for (const rawTel of tels) {
        const phone = (rawTel || '').trim();
        if (phone) {
          results.push({ name, phone });
        }
      }
    }
    return results;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'SecurityError') {
      return [];
    }
    throw err;
  }
}

/**
 * Normalizes phone numbers to E.164.
 * Uses default country of current user for numbers without country code.
 * For +92 and 03xx numbers strips leading 0.
 * Same for +91 and Saudi 05xx numbers.
 */
export function normalizeToE164(rawPhone: string, defaultCountryDialCode: string = '+966'): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Convert Arabic-Indic and Persian numerals to ASCII digits
  const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let cleaned = rawPhone.trim();
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.replaceAll(arabicIndic[i], String(i));
    cleaned = cleaned.replaceAll(persian[i], String(i));
  }

  // Remove spaces, hyphens, parentheses, dots
  cleaned = cleaned.replace(/[\s\-\(\)\.]/g, '');

  // Convert international 00 prefix to +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  let defaultDial = (defaultCountryDialCode || '+966').trim();
  if (!defaultDial.startsWith('+')) {
    defaultDial = '+' + defaultDial;
  }

  if (cleaned.startsWith('+')) {
    // If country code is followed by a leading 0, strip it:
    // Pakistan: +9203xx -> +923xx
    if (cleaned.startsWith('+920')) {
      cleaned = '+92' + cleaned.slice(4);
    }
    // Saudi Arabia: +96605xx -> +9665xx
    else if (cleaned.startsWith('+9660')) {
      cleaned = '+966' + cleaned.slice(5);
    }
    // India: +910xx -> +91xx
    else if (cleaned.startsWith('+910')) {
      cleaned = '+91' + cleaned.slice(4);
    }
  } else {
    // Without country code:
    // Pakistan local format: 03xx -> strip 0 and prepend +92
    if (defaultDial === '+92') {
      if (cleaned.startsWith('0')) {
        cleaned = defaultDial + cleaned.slice(1);
      } else {
        cleaned = defaultDial + cleaned;
      }
    }
    // Saudi local format: 05xx -> strip 0 and prepend +966
    else if (defaultDial === '+966') {
      if (cleaned.startsWith('0')) {
        cleaned = defaultDial + cleaned.slice(1);
      } else {
        cleaned = defaultDial + cleaned;
      }
    }
    // India local format: 0xx -> strip 0 and prepend +91
    else if (defaultDial === '+91') {
      if (cleaned.startsWith('0')) {
        cleaned = defaultDial + cleaned.slice(1);
      } else {
        cleaned = defaultDial + cleaned;
      }
    }
    // General fallback: if starts with 0 strip it and prepend defaultDial
    else {
      if (cleaned.startsWith('0')) {
        cleaned = defaultDial + cleaned.slice(1);
      } else {
        cleaned = defaultDial + cleaned;
      }
    }
  }

  // Strict E.164 verification: + followed by 7 to 18 digits, no leading 0 after +
  if (/^\+[1-9]\d{6,18}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Invokes the matchContacts callable Cloud Function (europe-west1).
 * Never logs phone numbers.
 */
export async function matchContactsCallable(numbers: string[]): Promise<MatchedUser[]> {
  if (!Array.isArray(numbers) || numbers.length === 0) return [];

  const app = getFirebaseApp();
  const functionsInstance = getFunctions(app, 'europe-west1');
  const fn = httpsCallable<{ numbers: string[] }, { matches: MatchedUser[] } | MatchedUser[]>(
    functionsInstance,
    'matchContacts'
  );

  const res = await fn({ numbers });
  const data = res.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray((data as any).matches)) {
    return (data as any).matches;
  }
  return [];
}

/**
 * 4 short message variants in English and Arabic.
 */
export const INVITE_MESSAGES: Record<Language, string[]> = {
  en: [
    "Hey! Let's chat on Hala, the fast and secure messaging app. Download it here:",
    "I'm using Hala for private messaging and HD calls. Join me here:",
    "Switch to Hala with me! It's encrypted, fast, and simple. Get it here:",
    "Let's connect on Hala! Tap the link to chat with me:",
  ],
  ar: [
    "مرحباً! تعال نتحدث على هلا، تطبيق المحادثات السريع والآمن. حمله من هنا:",
    "أنا أستخدم هلا للمراسلة الخاصة والمكالمات عالية الدقة. انضم إليّ هنا:",
    "انتقل إلى هلا معي! تطبيق مشفر، سريع وبسيط. حمله من هنا:",
    "دعنا نتواصل على هلا! اضغط على الرابط للدردشة معي:",
  ],
};

export function getRandomInviteMessage(language: Language): string {
  const list = INVITE_MESSAGES[language] || INVITE_MESSAGES.en;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

export function getPublicAppUrl(): string {
  return (
    (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://hala.chat')
  );
}

export function getWhatsAppInviteUrl(phone?: string, text?: string): string {
  const cleanDigits = phone ? phone.replace(/[^0-9]/g, '') : '';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  if (cleanDigits) {
    return `https://wa.me/${cleanDigits}${query}`;
  }
  return `https://wa.me/${query}`;
}

export function getSmsInviteUrl(phone?: string, text?: string): string {
  const cleanDigits = phone ? phone.replace(/[^0-9+]/g, '') : '';
  const bodyParam = text ? `body=${encodeURIComponent(text)}` : '';
  if (cleanDigits) {
    return `sms:${cleanDigits}?${bodyParam}`;
  }
  return `sms:?${bodyParam}`;
}

/**
 * Opens native share sheet or falls back to WhatsApp / SMS.
 */
export async function shareContactInvite(
  contact: { name: string; phone: string },
  language: Language
): Promise<void> {
  const appUrl = getPublicAppUrl();
  const message = getRandomInviteMessage(language);
  const fullText = `${message} ${appUrl}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'Hala Messenger',
        text: fullText,
        url: appUrl,
      });
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return; // User dismissed share sheet
      }
    }
  }

  // Fallback to WhatsApp
  const waUrl = getWhatsAppInviteUrl(contact.phone, fullText);
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}
