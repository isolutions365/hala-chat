import React from 'react';

interface EmojiSuggestionBarProps {
  emojis: string[];
  onSelectEmoji: (emoji: string) => void;
  isRtl: boolean;
}

export const EmojiSuggestionBar: React.FC<EmojiSuggestionBarProps> = ({
  emojis,
  onSelectEmoji,
  isRtl,
}) => {
  if (!emojis || emojis.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2.5 z-30 flex justify-start pointer-events-auto px-2"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-700/80 py-1.5 px-2 flex items-center gap-1 overflow-x-auto max-w-full scrollbar-none animate-fadeIn backdrop-blur-md">
        {emojis.slice(0, 10).map((emoji, idx) => (
          <button
            key={idx}
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelectEmoji(emoji)}
            aria-label={`Insert emoji ${emoji}`}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-[28px] hover:bg-teal-50 dark:hover:bg-slate-700/80 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            {emoji}
          </button>
        ))}
        {/* Small pointer tail at bottom */}
        <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-white dark:bg-slate-800 border-r border-b border-slate-200 dark:border-slate-700 rotate-45 pointer-events-none" />
      </div>
    </div>
  );
};
