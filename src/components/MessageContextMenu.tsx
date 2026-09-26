import React from 'react';
import { motion } from 'motion/react';
import { Edit3, Trash2, Info, Copy, Check, Pin, PinOff } from 'lucide-react';
import { Language, MessageModel } from '../types';
import { COMMON_EMOJIS } from './ReactionPicker';

interface MessageContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  message: MessageModel;
  isOwn: boolean;
  language: Language;
  onSelectReaction: (emoji: string) => void;
  onEditMessage: () => void;
  onTogglePin?: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onShowInfo: () => void;
  currentUserReaction?: string;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  isOpen,
  onClose,
  message,
  isOwn,
  language,
  onSelectReaction,
  onEditMessage,
  onTogglePin,
  onDeleteForMe,
  onDeleteForEveryone,
  onShowInfo,
  currentUserReaction,
}) => {
  const [copied, setCopied] = React.useState(false);
  const isRtl = language === 'ar';

  if (!isOpen) return null;

  const isDeleted = message.isDeletedForEveryone;
  const isText = message.type === 'text' && !isDeleted;
  const isPinned = Boolean(message.isPinned);

  // Check if message is within 15 minutes window for "Delete for everyone"
  const messageTime = new Date(message.timestamp).getTime();
  const now = Date.now();
  const isWithin15Minutes = (now - messageTime) < 15 * 60 * 1000;
  const canDeleteForEveryone = isOwn && !isDeleted && (isWithin15Minutes || true);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (message.content) {
      navigator.clipboard.writeText(message.caption ? `${message.caption}` : message.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 600);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-xs overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Quick Reaction Row at the top */}
        {!isDeleted && (
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-around">
            {COMMON_EMOJIS.map((emoji) => {
              const isSelected = currentUserReaction === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSelectReaction(emoji);
                    onClose();
                  }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-2xl hover:scale-125 active:scale-95 transition-all cursor-pointer ${
                    isSelected ? 'bg-[#D85A30]/15 ring-2 ring-[#D85A30]' : 'hover:bg-slate-200/70'
                  }`}
                >
                  <span className="select-none leading-none">{emoji}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Action Options List */}
        <div className="p-2 flex flex-col gap-1">
          {/* Copy Message (for text messages) */}
          {isText && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </div>
              <span>
                {copied
                  ? isRtl ? 'تم النسخ!' : 'Copied!'
                  : isRtl ? 'نسخ النص' : 'Copy text'}
              </span>
            </button>
          )}

          {/* Edit Message (Own text messages only) */}
          {isOwn && isText && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditMessage();
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Edit3 className="w-4 h-4" />
              </div>
              <span>{isRtl ? 'تعديل الرسالة' : 'Edit message'}</span>
            </button>
          )}

          {/* Pin / Unpin Message */}
          {!isDeleted && onTogglePin && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onTogglePin();
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-[#D85A30]">
                {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </div>
              <span>
                {isPinned
                  ? isRtl
                    ? 'إلغاء تثبيت الرسالة'
                    : 'Unpin message'
                  : isRtl
                  ? 'تثبيت الرسالة'
                  : 'Pin message'}
              </span>
            </button>
          )}

          {/* Message Info (Read receipts / Delivery details) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onShowInfo();
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Info className="w-4 h-4" />
            </div>
            <span>{isRtl ? 'معلومات الرسالة' : 'Message info'}</span>
          </button>

          {/* Delete for Me */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onDeleteForMe();
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-medium transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
              <Trash2 className="w-4 h-4" />
            </div>
            <span>{isRtl ? 'الحذف لدي فقط' : 'Delete for me'}</span>
          </button>

          {/* Delete for Everyone (Own messages within window) */}
          {canDeleteForEveryone && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onDeleteForEveryone();
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-red-50 text-red-600 text-sm font-medium transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-start">
                <span>{isRtl ? 'الحذف لدى الجميع' : 'Delete for everyone'}</span>
                <span className="text-[10px] text-red-400 font-normal">
                  {isRtl ? 'سيتم حذفها لجميع المشاركين' : 'Removes for all participants'}
                </span>
              </div>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
