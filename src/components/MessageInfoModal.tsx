import React from 'react';
import { motion } from 'motion/react';
import { X, Check, CheckCheck, Clock, User, Eye } from 'lucide-react';
import { Language, MessageModel, ChatModel } from '../types';
import { formatMessageTime } from '../lib/formatters';

interface MessageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: MessageModel;
  chat: ChatModel;
  currentUserId: string;
  language: Language;
}

export const MessageInfoModal: React.FC<MessageInfoModalProps> = ({
  isOpen,
  onClose,
  message,
  chat,
  currentUserId,
  language,
}) => {
  if (!isOpen) return null;
  const isRtl = language === 'ar';
  const isGroup = chat.type === 'group';

  const formatFullTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return formatMessageTime(isoString, language);
    }
  };

  const participants = chat.participants || [];
  const readByMap = message.readBy || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      onClick={onClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
          <h3 className="font-bold text-slate-800 text-base">
            {isRtl ? 'معلومات الرسالة' : 'Message Info'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Preview Box */}
        <div className="p-4 bg-slate-100/60 border-b border-slate-200/60">
          <div className="bg-[#D85A30] text-white p-3 rounded-2xl shadow-xs text-sm max-w-[90%]">
            {message.type === 'image' && (
              <p className="font-medium text-white/90">📷 {isRtl ? 'صورة' : 'Photo'}</p>
            )}
            {message.type === 'video' && (
              <p className="font-medium text-white/90">🎥 {isRtl ? 'فيديو' : 'Video'}</p>
            )}
            {message.type === 'voice' && (
              <p className="font-medium text-white/90">🎤 {isRtl ? 'رسالة صوتية' : 'Voice message'}</p>
            )}
            {message.content && message.type !== 'image' && message.type !== 'video' && (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
            {message.caption && (
              <p className="text-xs text-white/90 mt-1">{message.caption}</p>
            )}
            <div className="flex justify-end text-[10px] text-white/75 mt-1 font-mono">
              {formatFullTime(message.timestamp)}
            </div>
          </div>
        </div>

        {/* Status Details List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Read Status Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCheck className="w-4 h-4 text-sky-500" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {isRtl ? 'تمت القراءة بواسطة' : 'Read By'}
              </span>
            </div>

            {isGroup ? (
              <div className="space-y-2 bg-slate-50 rounded-2xl p-2.5 border border-slate-100">
                {participants
                  .filter((p) => p !== currentUserId)
                  .map((uid) => {
                    const memberDetail = chat.participantDetails?.[uid];
                    const readTime = readByMap[uid];
                    const hasRead = Boolean(readTime);

                    return (
                      <div
                        key={uid}
                        className="flex items-center justify-between py-1.5 px-2 rounded-xl"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                            {memberDetail?.avatarUrl ? (
                              <img
                                src={memberDetail.avatarUrl}
                                alt={memberDetail.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (memberDetail?.name || 'U').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {memberDetail?.name || (isRtl ? 'عضو' : 'Member')}
                            </p>
                          </div>
                        </div>

                        <div className="text-end">
                          {hasRead ? (
                            <span className="text-[11px] font-medium text-sky-600 font-mono">
                              {formatFullTime(readTime)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {isRtl ? 'لم تقرأ بعد' : 'Not read yet'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              (() => {
                const otherUserId = (chat.participants || []).find((p) => p !== currentUserId);
                const readTimestamp = (otherUserId && readByMap[otherUserId]) || (message.status === 'read' ? message.timestamp : undefined);
                const isRead = Boolean(readTimestamp) || message.status === 'read';

                return (
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-600">
                      {isRead
                        ? isRtl ? 'تمت القراءة' : 'Read'
                        : isRtl ? 'لم تقرأ بعد' : 'Unread'}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {isRead && readTimestamp ? formatFullTime(readTimestamp) : '--:--'}
                    </span>
                  </div>
                );
              })()
            )}
          </div>

          {/* Delivered Status Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCheck className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {isRtl ? 'تم الاستلام' : 'Delivered'}
              </span>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                {message.status === 'sending'
                  ? isRtl ? 'قيد الإرسال...' : 'Sending...'
                  : isRtl ? 'تم الاستلام بنجاح' : 'Delivered to device'}
              </span>
              <span className="text-xs font-mono text-slate-500">
                {formatFullTime(message.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
