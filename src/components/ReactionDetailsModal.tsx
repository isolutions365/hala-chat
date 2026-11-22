import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Users } from 'lucide-react';
import { Language, MessageModel, ChatModel } from '../types';

interface ReactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: MessageModel;
  chat: ChatModel;
  currentUserId: string;
  language: Language;
}

export const ReactionDetailsModal: React.FC<ReactionDetailsModalProps> = ({
  isOpen,
  onClose,
  message,
  chat,
  currentUserId,
  language,
}) => {
  const isRtl = language === 'ar';
  const reactions = message.reactions || {};
  const emojis = Object.keys(reactions).filter((em) => (reactions[em] || []).length > 0);

  const [activeEmoji, setActiveEmoji] = useState<string>('all');

  if (!isOpen || emojis.length === 0) return null;

  // Flatten all reactors
  const allReactors: { userId: string; emoji: string }[] = [];
  emojis.forEach((em) => {
    (reactions[em] || []).forEach((uid) => {
      allReactors.push({ userId: uid, emoji: em });
    });
  });

  const filteredReactors =
    activeEmoji === 'all'
      ? allReactors
      : allReactors.filter((r) => r.emoji === activeEmoji);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-base">
            {isRtl ? 'التفاعلات' : 'Reactions'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Emoji Tabs */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 overflow-x-auto shrink-0 bg-slate-50/70">
          <button
            type="button"
            onClick={() => setActiveEmoji('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeEmoji === 'all'
                ? 'bg-[#087F75] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isRtl ? 'الكل' : 'All'} ({allReactors.length})
          </button>

          {emojis.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setActiveEmoji(em)}
              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeEmoji === em
                  ? 'bg-[#087F75] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{em}</span>
              <span>{(reactions[em] || []).length}</span>
            </button>
          ))}
        </div>

        {/* Reactors List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredReactors.map((item, idx) => {
            const isMe = item.userId === currentUserId;
            const detail = chat.participantDetails?.[item.userId];
            const name = isMe
              ? isRtl ? 'أنت' : 'You'
              : detail?.name || (isRtl ? 'مستخدم هلا' : 'Hala User');

            return (
              <div
                key={`${item.userId}-${idx}`}
                className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                    {detail?.avatarUrl ? (
                      <img
                        src={detail.avatarUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">
                      {name}
                    </p>
                    {detail?.phone && !isMe && (
                      <p className="text-xs text-slate-400 font-mono truncate" dir="ltr">
                        {detail.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-lg shrink-0">
                  {item.emoji}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
