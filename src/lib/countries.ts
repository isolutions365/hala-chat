import { Country } from '../types';

export const GULF_COUNTRIES: Country[] = [
  {
    code: 'AE',
    nameEn: 'United Arab Emirates',
    nameAr: 'الإمارات العربية المتحدة',
    dialCode: '+971',
    flag: '🇦🇪',
    minDigits: 9,
    maxDigits: 9,
    placeholder: '50 123 4567',
  },
  {
    code: 'SA',
    nameEn: 'Saudi Arabia',
    nameAr: 'المملكة العربية السعودية',
    dialCode: '+966',
    flag: '🇸🇦',
    minDigits: 9,
    maxDigits: 9,
    placeholder: '50 123 4567',
  },
  {
    code: 'QA',
    nameEn: 'Qatar',
    nameAr: 'قطر',
    dialCode: '+974',
    flag: '🇶🇦',
    minDigits: 8,
    maxDigits: 8,
    placeholder: '3312 3456',
  },
  {
    code: 'KW',
    nameEn: 'Kuwait',
    nameAr: 'الكويت',
    dialCode: '+965',
    flag: '🇰🇼',
    minDigits: 8,
    maxDigits: 8,
    placeholder: '9123 4567',
  },
  {
    code: 'BH',
    nameEn: 'Bahrain',
    nameAr: 'البحرين',
    dialCode: '+973',
    flag: '🇧🇭',
    minDigits: 8,
    maxDigits: 8,
    placeholder: '3912 3456',
  },
  {
    code: 'OM',
    nameEn: 'Oman',
    nameAr: 'عُمان',
    dialCode: '+968',
    flag: '🇴🇲',
    minDigits: 8,
    maxDigits: 8,
    placeholder: '9123 4567',
  },
];

export const OTHER_COUNTRIES: Country[] = [
  {
    code: 'EG',
    nameEn: 'Egypt',
    nameAr: 'مصر',
    dialCode: '+20',
    flag: '🇪🇬',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '10 1234 5678',
  },
  {
    code: 'JO',
    nameEn: 'Jordan',
    nameAr: 'الأردن',
    dialCode: '+962',
    flag: '🇯🇴',
    minDigits: 9,
    maxDigits: 9,
    placeholder: '7 9123 4567',
  },
  {
    code: 'LB',
    nameEn: 'Lebanon',
    nameAr: 'لبنان',
    dialCode: '+961',
    flag: '🇱🇧',
    minDigits: 7,
    maxDigits: 8,
    placeholder: '70 123 456',
  },
  {
    code: 'IQ',
    nameEn: 'Iraq',
    nameAr: 'العراق',
    dialCode: '+964',
    flag: '🇮🇶',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '770 123 4567',
  },
  {
    code: 'US',
    nameEn: 'United States',
    nameAr: 'الولايات المتحدة',
    dialCode: '+1',
    flag: '🇺🇸',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '(555) 000-0000',
  },
  {
    code: 'GB',
    nameEn: 'United Kingdom',
    nameAr: 'المملكة المتحدة',
    dialCode: '+44',
    flag: '🇬🇧',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '7911 123456',
  },
  {
    code: 'PK',
    nameEn: 'Pakistan',
    nameAr: 'باكستان',
    dialCode: '+92',
    flag: '🇵🇰',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '300 1234567',
  },
  {
    code: 'IN',
    nameEn: 'India',
    nameAr: 'الهند',
    dialCode: '+91',
    flag: '🇮🇳',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '91234 56789',
  },
];

export const FEATURED_COUNTRIES: Country[] = [
  ...GULF_COUNTRIES,
  {
    code: 'US',
    nameEn: 'United States',
    nameAr: 'الولايات المتحدة',
    dialCode: '+1',
    flag: '🇺🇸',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '(555) 000-0000',
  },
  {
    code: 'PK',
    nameEn: 'Pakistan',
    nameAr: 'باكستان',
    dialCode: '+92',
    flag: '🇵🇰',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '300 1234567',
  },
  {
    code: 'IN',
    nameEn: 'India',
    nameAr: 'الهند',
    dialCode: '+91',
    flag: '🇮🇳',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '91234 56789',
  },
];

export const ALL_COUNTRIES: Country[] = [...FEATURED_COUNTRIES, ...OTHER_COUNTRIES.filter(c => !['US', 'PK', 'IN'].includes(c.code))];

export function validatePhoneNumber(phone: string, country: Country, lang: 'ar' | 'en'): { isValid: boolean; error: string | null } {
  const digitsOnly = phone.replace(/\D/g, '');
  
  if (!digitsOnly) {
    return { isValid: false, error: null };
  }

  if (digitsOnly.length < country.minDigits) {
    const errorMsg = lang === 'ar'
      ? `رقم الهاتف قصير جداً (${country.nameAr} يتطلب ${country.minDigits} أرقام)`
      : `Phone number is too short (${country.nameEn} requires ${country.minDigits} digits)`;
    return { isValid: false, error: errorMsg };
  }

  if (digitsOnly.length > country.maxDigits) {
    const errorMsg = lang === 'ar'
      ? `رقم الهاتف طويل جداً (${country.nameAr} يتطلب ${country.maxDigits} أرقام)`
      : `Phone number is too long (${country.nameEn} requires ${country.maxDigits} digits)`;
    return { isValid: false, error: errorMsg };
  }

  return { isValid: true, error: null };
}
