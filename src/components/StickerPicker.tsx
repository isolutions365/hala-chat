import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Smile, X, Layers, Search, Heart, Flame } from 'lucide-react';
import { Language, StickerItem } from '../types';
import { STICKER_PACKS } from '../lib/stickers';

interface StickerPickerProps {
  language: Language;
  onSelectSticker: (sticker: StickerItem) => void;
  onClose: () => void;
}

export const StickerPicker: React.FC<StickerPickerProps> = ({
  language,
  onSelectSticker,
  onClose,
}) => {
  const isRtl = language === 'ar';
  const [activeCategory, setActiveCategory] = useState<'all' | 'greetings' | 'reactions' | 'characters'>(
    'greetings'
  );
  const [searchQuery, setSearchQuery] = useState('');

  const categories: { id: 'all' | 'greetings' | 'reactions' | 'characters'; labelEn: string; labelAr: string; icon: any }[] = [
    { id: 'greetings', labelEn: 'Greetings', labelAr: 'تحيات', icon: Sparkles },
    { id: 'reactions', labelEn: 'Reactions', labelAr: 'تفاعلات', icon: Flame },
    { id: 'characters', labelEn: 'Heritage', labelAr: 'أصالة', icon: Layers },
    { id: 'all', labelEn: 'All', labelAr: 'الكل', icon: Smile },
  ];

  const filteredStickers = STICKER_PACKS.filter((s) => {
    const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
    if (!searchQuery.trim()) return matchesCategory;
    const query = searchQuery.toLowerCase().trim();
    const matchesName = s.name.toLowerCase().includes(query) || s.nameAr.toLowerCase().includes(query);
    const matchesText = s.svgOrEmoji.toLowerCase().includes(query);
    return matchesCategory && (matchesName || matchesText);
  });

  const handlePick = (sticker: StickerItem) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(20);
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
      className="w-full bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col z-30"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ maxHeight: '320px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Bar with Search & Category Tabs */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Search Input Bar */}
          <div className="flex-1 min-h-[36px] bg-white border border-slate-200 rounded-xl px-2.5 py-1 flex items-center gap-1.5 focus-within:border-[#087F75] transition-colors shadow-2xs">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث في الملصقات...' : 'Search stickers...'}
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Close Picker Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title={isRtl ? 'إغلاق' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id && !searchQuery;
            const categoryCount =
              cat.id === 'all'
                ? STICKER_PACKS.length
                : STICKER_PACKS.filter((s) => s.category === cat.id).length;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  setSearchQuery('');
                }}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#087F75] text-white shadow-2xs scale-102'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
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
          })}
        </div>
      </div>

      {/* Stickers Grid */}
      <div className="p-3 overflow-y-auto grid grid-cols-3 gap-2 flex-1 min-h-[160px]">
        {filteredStickers.length > 0 ? (
          filteredStickers.map((sticker) => {
            return (
              <motion.button
                key={sticker.id}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={() => handlePick(sticker)}
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
            );
          })
        ) : (
          <div className="col-span-3 py-8 flex flex-col items-center justify-center text-slate-400 gap-1.5 text-center">
            <Smile className="w-8 h-8 stroke-[1.5]" />
            <p className="text-xs font-semibold">
              {isRtl ? 'لم يتم العثور على ملصقات تطابق بحثك' : 'No stickers found matching your search'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
