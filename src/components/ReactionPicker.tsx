import React from 'react';
import { motion } from 'motion/react';

interface ReactionPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
  currentUserReaction?: string;
  isOwn: boolean;
}

export const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  onSelectEmoji,
  onClose,
  currentUserReaction,
  isOwn,
}) => {
  return (
    <>
      {/* Invisible backdrop to catch outside taps */}
      <div
        className="fixed inset-0 z-40"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Floating Reaction Bar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 10 }}
        transition={{ type: 'spring', damping: 20, stiffness: 350 }}
        className={`absolute -top-12 ${
          isOwn ? 'right-0' : 'left-0'
        } bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-full px-2 py-1.5 flex items-center gap-1 z-50`}
        onClick={(e) => e.stopPropagation()}
      >
        {COMMON_EMOJIS.map((emoji) => {
          const isSelected = currentUserReaction === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEmoji(emoji);
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xl hover:scale-125 active:scale-95 transition-all cursor-pointer ${
                isSelected ? 'bg-[#D85A30]/15 ring-2 ring-[#D85A30]' : 'hover:bg-slate-100'
              }`}
            >
              <span className="leading-none select-none">{emoji}</span>
            </button>
          );
        })}
      </motion.div>
    </>
  );
};
