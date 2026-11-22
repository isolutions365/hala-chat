import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Smile,
  X,
  Layers,
  Search,
  Flame,
  Heart,
  Delete,
  Coffee,
  Activity,
  Compass,
  Zap,
  Clock,
  Dog,
} from 'lucide-react';
import { Language, StickerItem } from '../types';
import { STICKER_PACKS } from '../lib/stickers';

interface StickerPickerProps {
  language: Language;
  onSelectSticker: (sticker: StickerItem) => void;
  onSelectEmoji?: (emoji: string) => void;
  onDeleteBackspace?: () => void;
  onClose: () => void;
}

interface EmojiCategory {
  id: string;
  labelEn: string;
  labelAr: string;
  icon: any;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    labelEn: 'Smileys',
    labelAr: 'وجوه',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '☺️',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗',
      '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
      '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
      '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
      '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯',
      '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
      '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡',
      '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👻', '👽',
      '👾', '🤖'
    ],
  },
  {
    id: 'hands',
    labelEn: 'Gestures',
    labelAr: 'أيدي',
    icon: Flame,
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️',
      '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐',
      '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵',
      '🦶', '👂', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️',
      '👅', '👄'
    ],
  },
  {
    id: 'hearts',
    labelEn: 'Hearts',
    labelAr: 'قلوب',
    icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💋', '💐', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻',
      '✨', '⭐', '🌟', '💫', '💥', '💢', '💯', '💤'
    ],
  },
  {
    id: 'animals',
    labelEn: 'Nature',
    labelAr: 'طبيعة',
    icon: Dog,
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅',
      '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌',
      '🐞', '🐜', '🐢', '🐍', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠',
      '🐟', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘',
      '🌴', '🌵', '🌲', '🌳', '🍀', '🍁', '🍂', '🍃', '🌙', '☀️'
    ],
  },
  {
    id: 'food',
    labelEn: 'Food',
    labelAr: 'طعام',
    icon: Coffee,
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦',
      '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇',
      '🥓', '🥩', '🍗', '🍖', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮',
      '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍛', '🍜', '🍝', '🍲',
      '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬', '☕',
      '🍵', '🧃', '🥤', '🧋'
    ],
  },
  {
    id: 'activities',
    labelEn: 'Activities',
    labelAr: 'أنشطة',
    icon: Activity,
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🏏', '🥅', '⛳', '🎯', '🚀',
      '🎣', '🤿', '🥊', '🥋', '🛹', '🛼', '🏋️', '🤸', '🧗', '🚵',
      '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎫', '🎟️', '🎪',
      '🎨', '🎬', '🎤', '🎧', '🎮', '🎲', '♟️', '🧩', '🎸', '🎹'
    ],
  },
  {
    id: 'travel',
    labelEn: 'Travel',
    labelAr: 'سفر',
    icon: Compass,
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨',
      '✈️', '🛫', '🛬', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🚢',
      '🏝️', '🏕️', '🌋', '⛰️', '🏔️', '🏖️', '🏜️', '🏟️', '🏛️', '🕌'
    ],
  },
  {
    id: 'objects',
    labelEn: 'Objects',
    labelAr: 'أدوات',
    icon: Zap,
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '📱', '💻', '🖥️', '📷', '📸', '📹',
      '🔍', '🔎', '🕯️', '💡', '🔦', '🏮', '📚', '📖', '💰', '💵',
      '💳', '💎', '⚖️', '🔧', '🔨', '🛠️', '⚙️', '🗝️', '🔑', '🚪',
      '🔔', '📢', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '🔒', '🔓', '🔏'
    ],
  },
];

// Bilingual search lookup dictionary
const EMOJI_KEYWORDS: { [emoji: string]: string[] } = {
  '😀': ['smile', 'happy', 'face', 'مبتسم', 'سعيد', 'ضحك'],
  '😂': ['laugh', 'cry', 'joy', 'lol', 'haha', 'ضحك', 'دموع', 'مضحك'],
  '🤣': ['rofl', 'laugh', 'rolling', 'ميت ضحك'],
  '😍': ['love', 'heart', 'eyes', 'حب', 'عشق', 'قلوب'],
  '🥰': ['love', 'hearts', 'warm', 'محبة', 'حنان'],
  '😘': ['kiss', 'love', 'بوسة', 'قبلة'],
  '❤️': ['heart', 'love', 'red', 'قلب', 'حب', 'أحمر'],
  '🔥': ['fire', 'lit', 'flame', 'hot', 'نار', 'حريق', 'حماس'],
  '👍': ['thumbs', 'up', 'ok', 'yes', 'good', 'نعم', 'تمام', 'أحسنت'],
  '👎': ['thumbs', 'down', 'no', 'bad', 'لا', 'سيء'],
  '👏': ['clap', 'applause', 'bravo', 'تصفيق', 'برافو'],
  '🙌': ['celebrate', 'hooray', 'hands', 'الحمدلله', 'فرح'],
  '🙏': ['pray', 'please', 'thanks', 'دعاء', 'شكر', 'يارب', 'أرجوك'],
  '✨': ['sparkles', 'stars', 'magic', 'shine', 'نجوم', 'لمعان', 'بريق'],
  '🎉': ['party', 'celebrate', 'congrats', 'tada', 'احتفال', 'مبروك', 'حفلة'],
  '☕': ['coffee', 'tea', 'cafe', 'قهوة', 'شاي', 'مقهى'],
  '🚀': ['rocket', 'launch', 'fast', 'صاروخ', 'انطلاق'],
  '💯': ['hundred', 'score', 'perfect', 'مية', 'ممتاز'],
  '🌹': ['rose', 'flower', 'وردة', 'زهرة'],
};

const DEFAULT_RECENTS = ['😀', '😂', '😍', '👍', '❤️', '🔥', '🎉', '🙏', '✨', '☕', '👏', '🥰', '🌹', '💯'];

export const StickerPicker: React.FC<StickerPickerProps> = ({
  language,
  onSelectSticker,
  onSelectEmoji,
  onDeleteBackspace,
  onClose,
}) => {
  const isRtl = language === 'ar';
  const [activeMainTab, setActiveMainTab] = useState<'emoji' | 'stickers'>('emoji');
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hala_recent_emojis');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_RECENTS;
  });

  const stickerCategories: { id: string; labelEn: string; labelAr: string; icon: any }[] = [
    { id: 'all', labelEn: 'All', labelAr: 'الكل', icon: Smile },
    { id: 'greetings', labelEn: 'Greetings', labelAr: 'تحيات', icon: Sparkles },
    { id: 'reactions', labelEn: 'Reactions', labelAr: 'تفاعلات', icon: Flame },
    { id: 'characters', labelEn: 'Heritage', labelAr: 'أصالة', icon: Layers },
  ];

  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [stickersLoaded, setStickersLoaded] = useState(false);

  useEffect(() => {
    if (activeMainTab === 'stickers' && !stickersLoaded) {
      import('../lib/stickers').then((module) => {
        setStickers(module.STICKER_PACKS);
        setStickersLoaded(true);
      });
    }
  }, [activeMainTab, stickersLoaded]);

  const filteredStickers = useMemo(() => {
    return stickers.filter((s) => {
      const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
      if (!searchQuery.trim()) return matchesCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesName = s.name.toLowerCase().includes(query) || s.nameAr.toLowerCase().includes(query);
      const matchesText = s.svgOrEmoji.toLowerCase().includes(query);
      return matchesCategory && (matchesName || matchesText);
    });
  }, [activeCategory, searchQuery, stickers]);


  // Filter emojis across all categories based on query
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return null;

    const matched: string[] = [];
    EMOJI_CATEGORIES.forEach((cat) => {
      cat.emojis.forEach((emoji) => {
        if (emoji.includes(q)) {
          if (!matched.includes(emoji)) matched.push(emoji);
          return;
        }
        const keywords = EMOJI_KEYWORDS[emoji] || [];
        if (keywords.some((k) => k.toLowerCase().includes(q))) {
          if (!matched.includes(emoji)) matched.push(emoji);
        }
      });
    });
    return matched;
  }, [searchQuery]);

  const currentCategory = EMOJI_CATEGORIES.find((c) => c.id === activeCategory) || EMOJI_CATEGORIES[0];

  const handlePickEmoji = (emoji: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {
        // ignore
      }
    }

    // Save to recents
    setRecentEmojis((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 24);
      try {
        localStorage.setItem('hala_recent_emojis', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    if (onSelectEmoji) {
      onSelectEmoji(emoji);
    } else {
      onSelectSticker({
        id: `emoji_${Date.now()}`,
        name: emoji,
        nameAr: emoji,
        svgOrEmoji: emoji,
        category: 'reactions',
        categoryName: 'Reactions',
        categoryNameAr: 'تفاعلات',
      });
    }
  };

  const handlePickSticker = (sticker: StickerItem) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(25);
      } catch {
        // ignore
      }
    }
    onSelectSticker(sticker);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col z-40 max-w-lg mx-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ maxHeight: '380px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header: Switcher, Search Input, Backspace, Close */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 bg-slate-50/90 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Main Segmented Switcher */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveMainTab('emoji');
                setActiveCategory('smileys');
                setSearchQuery('');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMainTab === 'emoji'
                  ? 'bg-white text-[#087F75] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
              <span>{isRtl ? 'الإيموجي' : 'Emojis'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMainTab('stickers');
                setActiveCategory('all');
                setSearchQuery('');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMainTab === 'stickers'
                  ? 'bg-white text-[#087F75] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRtl ? 'الملصقات' : 'Stickers'}</span>
            </button>
          </div>

          {/* Quick Backspace and Close Buttons */}
          <div className="flex items-center gap-1">
            {onDeleteBackspace && activeMainTab === 'emoji' && (
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    try {
                      navigator.vibrate(10);
                    } catch {
                      // ignore
                    }
                  }
                  onDeleteBackspace();
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                title={isRtl ? 'حذف الرمز السابق' : 'Backspace'}
                aria-label="Backspace"
              >
                <Delete className={`w-4 h-4 ${isRtl ? 'scale-x-[-1]' : ''}`} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title={isRtl ? 'إغلاق' : 'Close'}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real-time Search Bar */}
        <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 focus-within:border-[#087F75] transition-colors shadow-2xs">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeMainTab === 'emoji'
                ? isRtl
                  ? 'بحث في الإيموجي (ضحك، قلب، قهوة...)'
                  : 'Search emojis (smile, heart, coffee...)'
                : isRtl
                ? 'بحث في الملصقات...'
                : 'Search stickers...'
            }
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            dir="auto"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Horizontal Filter Bar */}
        {!searchQuery && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {activeMainTab === 'emoji' ? (
              <>
                {/* Recent Tab */}
                {recentEmojis.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('recents')}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                      activeCategory === 'recents'
                        ? 'bg-[#087F75] text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{isRtl ? 'المستخدمة مؤخراً' : 'Recents'}</span>
                  </button>
                )}

                {EMOJI_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-[#087F75] text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{isRtl ? cat.labelAr : cat.labelEn}</span>
                    </button>
                  );
                })}
              </>
            ) : (
              stickerCategories.map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                const categoryCount =
                  cat.id === 'all'
                    ? STICKER_PACKS.length
                    : STICKER_PACKS.filter((s) => s.category === cat.id).length;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#087F75] text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{isRtl ? cat.labelAr : cat.labelEn}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {categoryCount}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Grid Content Body */}
      {activeMainTab === 'emoji' ? (
        <div className="p-3 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1.5 flex-1 min-h-[200px] max-h-[250px]">
          {searchResults ? (
            searchResults.length > 0 ? (
              searchResults.map((emoji, idx) => (
                <motion.button
                  key={`search_${emoji}_${idx}`}
                  whileHover={{ scale: 1.25 }}
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  onClick={() => handlePickEmoji(emoji)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-teal-50 transition-colors cursor-pointer select-none"
                >
                  <span>{emoji}</span>
                </motion.button>
              ))
            ) : (
              <div className="col-span-7 sm:col-span-8 py-8 flex flex-col items-center justify-center text-slate-400 gap-1.5 text-center">
                <Smile className="w-8 h-8 stroke-[1.5]" />
                <p className="text-xs font-semibold">
                  {isRtl ? 'لم يتم العثور على إيموجي يطابق بحثك' : 'No emojis matching your search'}
                </p>
              </div>
            )
          ) : activeCategory === 'recents' ? (
            recentEmojis.map((emoji, idx) => (
              <motion.button
                key={`recent_${emoji}_${idx}`}
                whileHover={{ scale: 1.25 }}
                whileTap={{ scale: 0.85 }}
                type="button"
                onClick={() => handlePickEmoji(emoji)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-teal-50 transition-colors cursor-pointer select-none"
              >
                <span>{emoji}</span>
              </motion.button>
            ))
          ) : (
            currentCategory.emojis.map((emoji, idx) => (
              <motion.button
                key={`${currentCategory.id}_${emoji}_${idx}`}
                whileHover={{ scale: 1.25 }}
                whileTap={{ scale: 0.85 }}
                type="button"
                onClick={() => handlePickEmoji(emoji)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl hover:bg-teal-50 transition-colors cursor-pointer select-none"
              >
                <span>{emoji}</span>
              </motion.button>
            ))
          )}
        </div>
      ) : (
        /* Stickers Grid */
        <div className="p-3 overflow-y-auto grid grid-cols-3 gap-2 flex-1 min-h-[200px] max-h-[250px]">
          {filteredStickers.length > 0 ? (
            filteredStickers.map((sticker) => (
              <motion.button
                key={sticker.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={() => handlePickSticker(sticker)}
                className="p-3 rounded-2xl border border-slate-100/90 hover:border-[#087F75]/50 hover:bg-teal-50/50 transition-all flex flex-col items-center justify-center text-center gap-1 cursor-pointer group shadow-2xs relative overflow-hidden"
                style={{ backgroundColor: sticker.previewColor || '#F8FAFC' }}
              >
                <span className="text-2xl select-none group-hover:scale-110 transition-transform filter drop-shadow-xs">
                  {sticker.svgOrEmoji.split(' ')[0]}
                </span>
                <span className="text-[11px] font-bold text-slate-800 line-clamp-1 leading-tight">
                  {isRtl ? sticker.nameAr : sticker.name}
                </span>
              </motion.button>
            ))
          ) : (
            <div className="col-span-3 py-8 flex flex-col items-center justify-center text-slate-400 gap-1.5 text-center">
              <Smile className="w-8 h-8 stroke-[1.5]" />
              <p className="text-xs font-semibold">
                {isRtl ? 'لم يتم العثور على ملصقات' : 'No stickers found'}
              </p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
