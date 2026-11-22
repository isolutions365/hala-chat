import React from 'react';

export interface WallpaperPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  type: 'pattern' | 'gradient' | 'solid' | 'dark';
  previewBg: string;
  style: React.CSSProperties;
  isDark?: boolean;
}

// Subtle Islamic arabesque pattern SVG as data URL
const ARABESQUE_SVG = `data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0 L40 20 L20 40 L0 20 Z' fill='none' stroke='%23d97706' stroke-width='0.75' stroke-opacity='0.12'/%3E%3Ccircle cx='20' cy='20' r='6' fill='none' stroke='%23d97706' stroke-width='0.75' stroke-opacity='0.12'/%3E%3Cpath d='M0 0 L20 20 L40 0 M0 40 L20 20 L40 40' fill='none' stroke='%23d97706' stroke-width='0.5' stroke-opacity='0.08'/%3E%3C/svg%3E`;

// Subtle messenger doodle pattern SVG
const DOODLE_SVG = `data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2364748b' fill-opacity='0.08'%3E%3Cpath d='M10 15 a5 5 0 0 1 5 -5 h10 a5 5 0 0 1 5 5 v5 a5 5 0 0 1 -5 5 h-3 l-4 4 v-4 h-3 a5 5 0 0 1 -5 -5 z'/%3E%3Ccircle cx='45' cy='18' r='3'/%3E%3Cpath d='M40 40 a4 4 0 0 1 4 -4 h6 a4 4 0 0 1 4 4 v4 a4 4 0 0 1 -4 4 h-2 l-3 3 v-3 h-1 a4 4 0 0 1 -4 -4 z'/%3E%3Cpath d='M18 45 l2 -4 l2 4 z'/%3E%3Cpath d='M48 10 l1.5 3 l3 1.5 l-3 1.5 l-1.5 3 l-1.5 -3 l-3 -1.5 l3 -1.5 z'/%3E%3C/g%3E%3C/svg%3E`;

// Subtle Geometric Star pattern SVG
const GEOMETRIC_STAR_SVG = `data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ea580c' stroke-width='0.6' stroke-opacity='0.1'%3E%3Cpolygon points='24,4 30,18 44,18 33,27 37,41 24,32 11,41 15,27 4,18 18,18'/%3E%3Ccircle cx='24' cy='24' r='16'/%3E%3C/g%3E%3C/svg%3E`;

// Dark mode starry pattern
const DARK_STARS_SVG = `data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 50 50' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2394a3b8' fill-opacity='0.15'%3E%3Ccircle cx='10' cy='15' r='1'/%3E%3Ccircle cx='35' cy='25' r='1.5'/%3E%3Ccircle cx='20' cy='40' r='1'/%3E%3Ccircle cx='42' cy='8' r='0.8'/%3E%3Cpath d='M25 10 l1 2 l2 1 l-2 1 l-1 2 l-1 -2 l-2 -1 l2 -1 z' fill='%23f59e0b' fill-opacity='0.25'/%3E%3C/g%3E%3C/svg%3E`;

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'default',
    nameEn: 'Default Dots',
    nameAr: 'النقاط الافتراضية',
    type: 'pattern',
    previewBg: '#f8fafc',
    style: {
      backgroundColor: '#f8fafc',
      backgroundImage:
        'radial-gradient(circle at 1px 1px, rgba(203, 213, 225, 0.45) 1px, transparent 0)',
      backgroundSize: '24px 24px',
    },
    isDark: false,
  },
  {
    id: 'doodle',
    nameEn: 'Hala Doodles',
    nameAr: 'رسومات هلا',
    type: 'pattern',
    previewBg: '#fdfbf7',
    style: {
      backgroundColor: '#fbf9f4',
      backgroundImage: `url("${DOODLE_SVG}")`,
      backgroundSize: '120px 120px',
    },
    isDark: false,
  },
  {
    id: 'arabesque',
    nameEn: 'Arabesque Star',
    nameAr: 'زخرفة أرابيسك',
    type: 'pattern',
    previewBg: '#faf5ee',
    style: {
      backgroundColor: '#faf5ee',
      backgroundImage: `url("${ARABESQUE_SVG}")`,
      backgroundSize: '60px 60px',
    },
    isDark: false,
  },
  {
    id: 'geometric_star',
    nameEn: 'Geometric Star',
    nameAr: 'نجمة هندسية',
    type: 'pattern',
    previewBg: '#fffaf5',
    style: {
      backgroundColor: '#fffaf5',
      backgroundImage: `url("${GEOMETRIC_STAR_SVG}")`,
      backgroundSize: '72px 72px',
    },
    isDark: false,
  },
  {
    id: 'desert_sand',
    nameEn: 'Desert Dune',
    nameAr: 'رمال الصحراء',
    type: 'gradient',
    previewBg: 'linear-gradient(135deg, #fdfbf7 0%, #f5ebd9 100%)',
    style: {
      background: 'linear-gradient(135deg, #fdfbf7 0%, #f4e9d5 100%)',
    },
    isDark: false,
  },
  {
    id: 'terracotta_sunset',
    nameEn: 'Warm Terracotta',
    nameAr: 'غروب طيني دافئ',
    type: 'gradient',
    previewBg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
    style: {
      background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
    },
    isDark: false,
  },
  {
    id: 'oasis_sage',
    nameEn: 'Oasis Sage',
    nameAr: 'واحة خضراء',
    type: 'gradient',
    previewBg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    style: {
      background: 'linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)',
    },
    isDark: false,
  },
  {
    id: 'ocean_sky',
    nameEn: 'Ocean Breeze',
    nameAr: 'نسيم البحر',
    type: 'gradient',
    previewBg: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
    style: {
      background: 'linear-gradient(135deg, #f0f9ff 0%, #bae6fd 100%)',
    },
    isDark: false,
  },
  {
    id: 'twilight_lavender',
    nameEn: 'Twilight Lavender',
    nameAr: 'شفق الخزامى',
    type: 'gradient',
    previewBg: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
    style: {
      background: 'linear-gradient(135deg, #faf5ff 0%, #e9d5ff 100%)',
    },
    isDark: false,
  },
  {
    id: 'midnight_slate',
    nameEn: 'Midnight Stars',
    nameAr: 'سواد الليل والنجوم',
    type: 'dark',
    previewBg: '#0f172a',
    style: {
      backgroundColor: '#0b1120',
      backgroundImage: `url("${DARK_STARS_SVG}")`,
      backgroundSize: '100px 100px',
    },
    isDark: true,
  },
  {
    id: 'dark_charcoal',
    nameEn: 'Deep Charcoal',
    nameAr: 'فحم داكن',
    type: 'dark',
    previewBg: '#1e293b',
    style: {
      background: 'linear-gradient(180deg, #182234 0%, #0f172a 100%)',
    },
    isDark: true,
  },
  {
    id: 'solid_warm_white',
    nameEn: 'Clean Ivory',
    nameAr: 'عاجي ناصع',
    type: 'solid',
    previewBg: '#faf9f6',
    style: {
      backgroundColor: '#faf9f6',
    },
    isDark: false,
  },
  {
    id: 'solid_soft_gray',
    nameEn: 'Soft Slate',
    nameAr: 'رمادي ناعم',
    type: 'solid',
    previewBg: '#f1f5f9',
    style: {
      backgroundColor: '#f1f5f9',
    },
    isDark: false,
  },
];

export interface HeaderThemePreset {
  id: string;
  nameEn: string;
  nameAr: string;
  category: 'light' | 'vibrant' | 'dark';
  previewBg: string;
  previewTextColor: string;
  style: React.CSSProperties;
  isDark: boolean;
  borderClass: string;
  titleClass: string;
  subtitleClass: string;
  onlineTextClass: string;
  onlineDotClass: string;
  offlineDotClass: string;
  typingTextClass: string;
  typingDotClass: string;
  badgeClass: string;
  iconBtnClass: string;
  timerBadgeClass: string;
}

export const HEADER_THEME_PRESETS: HeaderThemePreset[] = [
  {
    id: 'default',
    nameEn: 'Classic White',
    nameAr: 'الأبيض الكلاسيكي',
    category: 'light',
    previewBg: '#ffffff',
    previewTextColor: '#0f172a',
    style: { backgroundColor: '#ffffff' },
    isDark: false,
    borderClass: 'border-slate-200/90',
    titleClass: 'text-slate-900',
    subtitleClass: 'text-slate-600 font-semibold',
    onlineTextClass: 'text-emerald-700 font-bold',
    onlineDotClass: 'bg-emerald-500',
    offlineDotClass: 'bg-slate-400',
    typingTextClass: 'text-[#087F75] font-bold',
    typingDotClass: 'bg-[#087F75]',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    iconBtnClass: 'text-slate-700 hover:text-slate-950 hover:bg-slate-100',
    timerBadgeClass: 'bg-teal-50 border border-[#087F75]/30 text-[#087F75]',
  },
  {
    id: 'hala_teal',
    nameEn: 'Hala Royal Teal',
    nameAr: 'أخضر هلا الملكي',
    category: 'vibrant',
    previewBg: 'linear-gradient(135deg, #087F75 0%, #055a52 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #087F75 0%, #055a52 100%)' },
    isDark: true,
    borderClass: 'border-teal-900/40',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]',
    subtitleClass: 'text-teal-50 font-semibold',
    onlineTextClass: 'text-emerald-200 font-bold',
    onlineDotClass: 'bg-emerald-300 ring-2 ring-white/30',
    offlineDotClass: 'bg-teal-200/80',
    typingTextClass: 'text-amber-200 font-bold',
    typingDotClass: 'bg-amber-300',
    badgeClass: 'bg-white/20 text-white border border-white/35 backdrop-blur-xs',
    iconBtnClass: 'text-white hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-white/20 border border-white/35 text-white',
  },
  {
    id: 'emerald_oasis',
    nameEn: 'Emerald Oasis',
    nameAr: 'واحة الزمرد',
    category: 'vibrant',
    previewBg: 'linear-gradient(135deg, #047857 0%, #064e3b 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #047857 0%, #064e3b 100%)' },
    isDark: true,
    borderClass: 'border-emerald-950/40',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]',
    subtitleClass: 'text-emerald-50 font-semibold',
    onlineTextClass: 'text-lime-200 font-bold',
    onlineDotClass: 'bg-lime-300 ring-2 ring-white/30',
    offlineDotClass: 'bg-emerald-200/80',
    typingTextClass: 'text-amber-200 font-bold',
    typingDotClass: 'bg-amber-300',
    badgeClass: 'bg-white/20 text-white border border-white/35 backdrop-blur-xs',
    iconBtnClass: 'text-white hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-white/20 border border-white/35 text-white',
  },
  {
    id: 'midnight_navy',
    nameEn: 'Midnight Navy',
    nameAr: 'كحلي منتصف الليل',
    category: 'dark',
    previewBg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' },
    isDark: true,
    borderClass: 'border-slate-800',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]',
    subtitleClass: 'text-slate-200 font-semibold',
    onlineTextClass: 'text-emerald-300 font-bold',
    onlineDotClass: 'bg-emerald-400 ring-2 ring-white/25',
    offlineDotClass: 'bg-slate-400',
    typingTextClass: 'text-teal-300 font-bold',
    typingDotClass: 'bg-teal-300',
    badgeClass: 'bg-white/15 text-white border border-white/30',
    iconBtnClass: 'text-slate-100 hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-teal-500/25 border border-teal-400/40 text-teal-200',
  },
  {
    id: 'royal_indigo',
    nameEn: 'Royal Indigo',
    nameAr: 'نيلي ملكي',
    category: 'vibrant',
    previewBg: 'linear-gradient(135deg, #3730a3 0%, #1e1b4b 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #3730a3 0%, #1e1b4b 100%)' },
    isDark: true,
    borderClass: 'border-indigo-950/50',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]',
    subtitleClass: 'text-indigo-100 font-semibold',
    onlineTextClass: 'text-emerald-300 font-bold',
    onlineDotClass: 'bg-emerald-400 ring-2 ring-white/30',
    offlineDotClass: 'bg-indigo-200/80',
    typingTextClass: 'text-amber-200 font-bold',
    typingDotClass: 'bg-amber-300',
    badgeClass: 'bg-white/20 text-white border border-white/35',
    iconBtnClass: 'text-white hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-white/20 border border-white/35 text-white',
  },
  {
    id: 'desert_gold',
    nameEn: 'Warm Sand Gold',
    nameAr: 'رمال الصحراء الذهبية',
    category: 'light',
    previewBg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    previewTextColor: '#451a03',
    style: { background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' },
    isDark: false,
    borderClass: 'border-amber-300/80',
    titleClass: 'text-amber-950',
    subtitleClass: 'text-amber-900/90 font-semibold',
    onlineTextClass: 'text-emerald-800 font-bold',
    onlineDotClass: 'bg-emerald-600',
    offlineDotClass: 'bg-amber-700/60',
    typingTextClass: 'text-[#087F75] font-bold',
    typingDotClass: 'bg-[#087F75]',
    badgeClass: 'bg-amber-950/10 text-amber-950 border border-amber-900/25',
    iconBtnClass: 'text-amber-950 hover:text-black hover:bg-amber-900/10',
    timerBadgeClass: 'bg-amber-950/10 border border-amber-900/25 text-amber-950',
  },
  {
    id: 'soft_mint',
    nameEn: 'Soft Mint Breeze',
    nameAr: 'نسيم النعناع الفاتح',
    category: 'light',
    previewBg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
    previewTextColor: '#064e3b',
    style: { background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' },
    isDark: false,
    borderClass: 'border-emerald-200',
    titleClass: 'text-emerald-950',
    subtitleClass: 'text-emerald-800 font-semibold',
    onlineTextClass: 'text-emerald-700 font-bold',
    onlineDotClass: 'bg-emerald-600',
    offlineDotClass: 'bg-emerald-600/60',
    typingTextClass: 'text-[#087F75] font-bold',
    typingDotClass: 'bg-[#087F75]',
    badgeClass: 'bg-emerald-900/10 text-emerald-950 border border-emerald-800/25',
    iconBtnClass: 'text-emerald-950 hover:text-black hover:bg-emerald-900/10',
    timerBadgeClass: 'bg-emerald-900/10 border border-emerald-800/25 text-emerald-950',
  },
  {
    id: 'sky_breeze',
    nameEn: 'Sky Blue Breeze',
    nameAr: 'نسيم السماء الأزرق',
    category: 'light',
    previewBg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
    previewTextColor: '#0c4a6e',
    style: { background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)' },
    isDark: false,
    borderClass: 'border-sky-200',
    titleClass: 'text-sky-950',
    subtitleClass: 'text-sky-900 font-semibold',
    onlineTextClass: 'text-emerald-800 font-bold',
    onlineDotClass: 'bg-emerald-600',
    offlineDotClass: 'bg-sky-700/60',
    typingTextClass: 'text-sky-900 font-bold',
    typingDotClass: 'bg-sky-800',
    badgeClass: 'bg-sky-950/10 text-sky-950 border border-sky-900/25',
    iconBtnClass: 'text-sky-950 hover:text-black hover:bg-sky-900/10',
    timerBadgeClass: 'bg-sky-950/10 border border-sky-900/25 text-sky-950',
  },
  {
    id: 'sunset_amber',
    nameEn: 'Arabian Sunset',
    nameAr: 'غروب الصحراء الدافئ',
    category: 'vibrant',
    previewBg: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #c2410c 0%, #7c2d12 100%)' },
    isDark: true,
    borderClass: 'border-orange-950/40',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]',
    subtitleClass: 'text-orange-50 font-semibold',
    onlineTextClass: 'text-emerald-200 font-bold',
    onlineDotClass: 'bg-emerald-300 ring-2 ring-white/30',
    offlineDotClass: 'bg-orange-200/80',
    typingTextClass: 'text-amber-200 font-bold',
    typingDotClass: 'bg-amber-200',
    badgeClass: 'bg-white/20 text-white border border-white/35',
    iconBtnClass: 'text-white hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-white/20 border border-white/35 text-white',
  },
  {
    id: 'velvet_plum',
    nameEn: 'Velvet Plum',
    nameAr: 'أرجواني مخملي',
    category: 'vibrant',
    previewBg: 'linear-gradient(135deg, #6b21a8 0%, #3b0764 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #6b21a8 0%, #3b0764 100%)' },
    isDark: true,
    borderClass: 'border-purple-950/50',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]',
    subtitleClass: 'text-purple-100 font-semibold',
    onlineTextClass: 'text-emerald-300 font-bold',
    onlineDotClass: 'bg-emerald-400 ring-2 ring-white/30',
    offlineDotClass: 'bg-purple-200/80',
    typingTextClass: 'text-amber-200 font-bold',
    typingDotClass: 'bg-amber-300',
    badgeClass: 'bg-white/20 text-white border border-white/35',
    iconBtnClass: 'text-white hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-white/20 border border-white/35 text-white',
  },
  {
    id: 'rose_blossom',
    nameEn: 'Soft Rose Blossom',
    nameAr: 'وردي ناعم',
    category: 'light',
    previewBg: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
    previewTextColor: '#881337',
    style: { background: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)' },
    isDark: false,
    borderClass: 'border-rose-200',
    titleClass: 'text-rose-950',
    subtitleClass: 'text-rose-900 font-semibold',
    onlineTextClass: 'text-emerald-800 font-bold',
    onlineDotClass: 'bg-emerald-600',
    offlineDotClass: 'bg-rose-700/60',
    typingTextClass: 'text-rose-900 font-bold',
    typingDotClass: 'bg-rose-800',
    badgeClass: 'bg-rose-950/10 text-rose-950 border border-rose-900/25',
    iconBtnClass: 'text-rose-950 hover:text-black hover:bg-rose-900/10',
    timerBadgeClass: 'bg-rose-950/10 border border-rose-900/25 text-rose-950',
  },
  {
    id: 'obsidian_dark',
    nameEn: 'Obsidian Black',
    nameAr: 'أسود فحمي أنيق',
    category: 'dark',
    previewBg: 'linear-gradient(135deg, #090d16 0%, #111827 100%)',
    previewTextColor: '#ffffff',
    style: { background: 'linear-gradient(135deg, #090d16 0%, #111827 100%)' },
    isDark: true,
    borderClass: 'border-slate-800',
    titleClass: 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]',
    subtitleClass: 'text-slate-200 font-semibold',
    onlineTextClass: 'text-emerald-300 font-bold',
    onlineDotClass: 'bg-emerald-400 ring-2 ring-white/25',
    offlineDotClass: 'bg-slate-400',
    typingTextClass: 'text-teal-300 font-bold',
    typingDotClass: 'bg-teal-300',
    badgeClass: 'bg-white/15 text-white border border-white/30',
    iconBtnClass: 'text-slate-100 hover:text-white hover:bg-white/15',
    timerBadgeClass: 'bg-white/15 border border-white/30 text-white',
  },
];

const HEADER_THEME_DELIMITER = '##header:';

export function extractWallpaperValue(raw?: string | null): string {
  if (!raw) return 'default';
  const idx = raw.indexOf(HEADER_THEME_DELIMITER);
  if (idx !== -1) {
    return raw.slice(0, idx) || 'default';
  }
  return raw;
}

export function extractHeaderThemeValue(
  raw?: string | null,
  chatId?: string,
  userId?: string
): string {
  if (raw) {
    const idx = raw.indexOf(HEADER_THEME_DELIMITER);
    if (idx !== -1) {
      const extracted = raw.slice(idx + HEADER_THEME_DELIMITER.length).trim();
      if (extracted) return extracted;
    }
    // Also check if raw itself is a direct header theme preset ID
    if (HEADER_THEME_PRESETS.some((p) => p.id === raw)) {
      return raw;
    }
  }
  if (chatId && typeof window !== 'undefined') {
    try {
      const key = userId ? `hala.headerTheme.${chatId}.${userId}` : `hala.headerTheme.${chatId}`;
      const saved = localStorage.getItem(key);
      if (saved) return saved;
    } catch {
      // ignore storage errors
    }
  }
  return 'default';
}

export function combineWallpaperAndHeaderTheme(
  wallpaper: string | null | undefined,
  headerTheme: string | null | undefined
): string | null {
  const cleanWp = extractWallpaperValue(wallpaper);
  const cleanHt = headerTheme || 'default';
  if (cleanWp === 'default' && cleanHt === 'default') {
    return null;
  }
  if (cleanHt === 'default') {
    return cleanWp === 'default' ? null : cleanWp;
  }
  return `${cleanWp}${HEADER_THEME_DELIMITER}${cleanHt}`;
}

export function resolveHeaderTheme(
  rawValue?: string | null,
  chatId?: string,
  userId?: string
): HeaderThemePreset {
  const themeId = extractHeaderThemeValue(rawValue, chatId, userId);
  return HEADER_THEME_PRESETS.find((p) => p.id === themeId) || HEADER_THEME_PRESETS[0];
}

export function resolveWallpaperStyle(rawWallpaperValue?: string | null): {
  style: React.CSSProperties;
  isDark: boolean;
} {
  const wallpaperValue = extractWallpaperValue(rawWallpaperValue);
  if (!wallpaperValue || wallpaperValue === 'default') {
    const def = WALLPAPER_PRESETS[0];
    return { style: def.style, isDark: Boolean(def.isDark) };
  }

  // Check if it matches a preset ID
  const preset = WALLPAPER_PRESETS.find((p) => p.id === wallpaperValue);
  if (preset) {
    return { style: preset.style, isDark: Boolean(preset.isDark) };
  }

  // Check if it is a custom image URL or base64 data URI
  if (
    wallpaperValue.startsWith('data:') ||
    wallpaperValue.startsWith('http://') ||
    wallpaperValue.startsWith('https://') ||
    wallpaperValue.startsWith('blob:')
  ) {
    return {
      style: {
        backgroundImage: `url("${wallpaperValue}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      },
      isDark: false,
    };
  }

  // Check if it is a direct CSS color or gradient
  if (
    wallpaperValue.startsWith('#') ||
    wallpaperValue.startsWith('rgb') ||
    wallpaperValue.startsWith('linear-gradient')
  ) {
    return {
      style: {
        background: wallpaperValue,
      },
      isDark: wallpaperValue.includes('#0') || wallpaperValue.includes('#1'),
    };
  }

  const def = WALLPAPER_PRESETS[0];
  return { style: def.style, isDark: false };
}

