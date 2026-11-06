// Client-side translation service with local caching
import { safeLocalStorageSet } from './safeStorage';

export interface TranslationResult {
  translatedText: string;
  sourceLang: string;
  isSameLanguage: boolean;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'ar', nameEn: 'Arabic', nameAr: 'العربية', flag: '🇸🇦' },
  { code: 'en', nameEn: 'English', nameAr: 'الإنجليزية', flag: '🇺🇸' },
  { code: 'fr', nameEn: 'French', nameAr: 'الفرنسية', flag: '🇫🇷' },
  { code: 'es', nameEn: 'Spanish', nameAr: 'الإسبانية', flag: '🇪🇸' },
  { code: 'de', nameEn: 'German', nameAr: 'الألمانية', flag: '🇩🇪' },
  { code: 'tr', nameEn: 'Turkish', nameAr: 'التركية', flag: '🇹🇷' },
  { code: 'ur', nameEn: 'Urdu', nameAr: 'الأوردو', flag: '🇵🇰' },
  { code: 'hi', nameEn: 'Hindi', nameAr: 'الهندية', flag: '🇮🇳' },
  { code: 'zh', nameEn: 'Chinese', nameAr: 'الصينية', flag: '🇨🇳' },
  { code: 'it', nameEn: 'Italian', nameAr: 'الإيطالية', flag: '🇮🇹' },
  { code: 'pt', nameEn: 'Portuguese', nameAr: 'البرتغالية', flag: '🇧🇷' },
  { code: 'ru', nameEn: 'Russian', nameAr: 'الروسية', flag: '🇷🇺' },
];

export function getLanguageName(code: string, isRtl: boolean): string {
  const normalized = (code || '').toLowerCase().slice(0, 2);
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === normalized);
  if (found) {
    return isRtl ? found.nameAr : found.nameEn;
  }
  return code.toUpperCase();
}

/**
 * Perform client-side translation of message text
 */
export async function translateMessageText(
  msgId: string,
  text: string,
  targetLang: string
): Promise<TranslationResult | null> {
  if (!text || !text.trim() || text.startsWith('http')) {
    return null;
  }

  const cacheKey = `hala_trans_v1_${msgId}_${targetLang}`;

  // Check local cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TranslationResult;
    }
  } catch {
    // ignore storage errors
  }

  try {
    // Call Google Translate client-side GTX API with 4s timeout
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      targetLang
    )}&dt=t&q=${encodeURIComponent(text)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedChunks = data[0].map((item: any) => item[0]).filter(Boolean);
        const translatedText = translatedChunks.join('');
        const sourceLang = typeof data[2] === 'string' ? data[2] : 'en';

        const isSameLanguage =
          sourceLang.toLowerCase().slice(0, 2) === targetLang.toLowerCase().slice(0, 2);

        const result: TranslationResult = {
          translatedText,
          sourceLang,
          isSameLanguage,
        };

        safeLocalStorageSet(cacheKey, JSON.stringify(result));
        return result;
      }
    }
  } catch (err) {
    console.warn('Primary translation API call failed, trying fallback:', err);
  }

  // Fallback to MyMemory translation API if primary fails with 3s timeout
  try {
    const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=Autodetect|${encodeURIComponent(targetLang)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const fallbackRes = await fetch(fallbackUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      if (fbData.responseData?.translatedText) {
        const translatedText = fbData.responseData.translatedText;
        const sourceLang = fbData.responseData.detectedLanguage || 'en';
        const isSameLanguage =
          sourceLang.toLowerCase().slice(0, 2) === targetLang.toLowerCase().slice(0, 2);

        const result: TranslationResult = {
          translatedText,
          sourceLang,
          isSameLanguage,
        };

        safeLocalStorageSet(cacheKey, JSON.stringify(result));
        return result;
      }
    }
  } catch (fbErr) {
    console.warn('Fallback translation also failed:', fbErr);
  }

  return null;
}
