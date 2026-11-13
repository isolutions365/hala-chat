import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCw, X } from 'lucide-react';
import { Language } from '../types';

interface QuickRepliesBarProps {
  messageText: string | null;
  messageId: string | null;
  senderName?: string;
  language: Language;
  isRtl: boolean;
  onSelectReply: (reply: string) => void;
  disabled?: boolean;
}

// Memory cache to prevent redundant API calls for previously analyzed messages
const repliesCache = new Map<string, string[]>();

export const QuickRepliesBar: React.FC<QuickRepliesBarProps> = ({
  messageText,
  messageId,
  senderName,
  language,
  isRtl,
  onSelectReply,
  disabled = false,
}) => {
  const [replies, setReplies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const lastFetchedIdRef = useRef<string | null>(null);

  // Reset dismissal when a new message arrives
  useEffect(() => {
    if (messageId && messageId !== lastFetchedIdRef.current) {
      setIsDismissed(false);
    }
  }, [messageId]);

  const fetchReplies = async (forceRefresh = false) => {
    if (!messageId || !messageText || !messageText.trim()) {
      setReplies([]);
      return;
    }

    if (!forceRefresh && repliesCache.has(messageId)) {
      setReplies(repliesCache.get(messageId) || []);
      lastFetchedIdRef.current = messageId;
      return;
    }

    lastFetchedIdRef.current = messageId;
    setIsLoading(true);

    try {
      const response = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageText,
          language,
          senderName,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.replies) && data.replies.length > 0) {
          const validReplies = data.replies.slice(0, 3);
          repliesCache.set(messageId, validReplies);
          setReplies(validReplies);
          return;
        }
      }
    } catch (err) {
      console.warn('[QuickReplies] Failed to fetch suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (messageId && messageText && !disabled) {
      fetchReplies();
    } else {
      setReplies([]);
    }
  }, [messageId, messageText, disabled]);

  if (disabled || isDismissed || (!isLoading && replies.length === 0)) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="w-full pb-2"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-2 max-w-full">
          {isLoading ? (
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
              {[76, 92, 68].map((width, idx) => (
                <div
                  key={idx}
                  style={{ width }}
                  className="h-8 rounded-2xl bg-slate-100 animate-pulse shrink-0"
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar py-0.5">
              {replies.slice(0, 3).map((reply, idx) => (
                <button
                  key={`${messageId}_${idx}`}
                  type="button"
                  onClick={() => onSelectReply(reply)}
                  className="px-3.5 py-1.5 min-h-[34px] bg-slate-100/90 hover:bg-teal-50 active:bg-teal-100/80 border border-slate-200/70 hover:border-[#087F75]/35 text-slate-800 hover:text-[#06685F] rounded-2xl text-[12.5px] font-medium whitespace-nowrap transition-colors active:scale-[0.97] cursor-pointer truncate max-w-[220px] shadow-[0_1px_1px_rgba(15,23,42,0.03)]"
                  title={reply}
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {/* Discreet trailing controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchReplies(true)}
              disabled={isLoading}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-[#087F75] hover:bg-slate-100 transition-colors cursor-pointer"
              title={isRtl ? 'اقتراحات أخرى' : 'More suggestions'}
              aria-label={isRtl ? 'تحديث' : 'Refresh'}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isRtl ? 'إخفاء' : 'Dismiss'}
              aria-label={isRtl ? 'إخفاء' : 'Dismiss'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
