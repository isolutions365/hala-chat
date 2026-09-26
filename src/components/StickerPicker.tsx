import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Heart, Smile, X, Layers } from 'lucide-react';
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
  const [activeCategory, setActiveCategory] = useState<'greetings' | 'reactions' | 'characters'>(
    'greetings'
  );

  const categories: { id: 'greetings' | 'reactions' | 'characters'; labelEn: string; labelAr: string; icon: any }[] = [
    { id: 'greetings', labelEn: 'Greetings', labelAr: 'تحيات هلا', icon: Sparkles },
    { id: 'reactions', labelEn: 'Reactions', labelAr: 'تفاعلات', icon: Smile },
    { id: 'characters', labelEn: 'Heritage', labelAr: 'أصالة وتراث', icon: Layers },
  ];

  const currentStickers = STICKER_PACKS.filter((s) => s.category === activeCategory);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="w-full bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col z-30"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ maxHeight: '280px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Category Tabs & Close */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#D85A30] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isRtl ? cat.labelAr : cat.labelEn}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stickers Grid */}
      <div className="p-3 overflow-y-auto grid grid-cols-3 gap-2 flex-1">
        {currentStickers.map((sticker) => {
          return (
            <motion.button
              key={sticker.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={() => onSelectSticker(sticker)}
              className="p-3 rounded-2xl border border-slate-100 hover:border-[#D85A30]/40 hover:bg-orange-50/40 transition-all flex flex-col items-center justify-center text-center gap-1 cursor-pointer group shadow-2xs"
              style={{ backgroundColor: sticker.previewColor || '#F8FAFC' }}
            >
              <span className="text-xl select-none group-hover:scale-110 transition-transform">
                {sticker.svgOrEmoji.split(' ')[0]}
              </span>
              <span className="text-[11px] font-bold text-slate-800 line-clamp-1 leading-snug">
                {isRtl ? sticker.nameAr : sticker.name}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};
