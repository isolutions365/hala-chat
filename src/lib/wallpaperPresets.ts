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

export function resolveWallpaperStyle(wallpaperValue?: string | null): {
  style: React.CSSProperties;
  isDark: boolean;
} {
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
