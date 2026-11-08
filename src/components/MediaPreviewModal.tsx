import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Image as ImageIcon, Video as VideoIcon, Loader2 } from 'lucide-react';
import { Language } from '../types';

interface MediaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  mediaType: 'image' | 'video';
  mediaPreviewUrl: string;
  onSend: (caption: string) => void;
  isUploading?: boolean;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  isOpen,
  onClose,
  language,
  mediaType,
  mediaPreviewUrl,
  onSend,
  isUploading = false,
}) => {
  const isRtl = language === 'ar';
  const [caption, setCaption] = useState('');

  if (!isOpen) return null;

  const handleSendClick = () => {
    onSend(caption.trim());
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-60 flex flex-col justify-between"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Top Header */}
        <div className="p-4 flex items-center justify-between z-10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-white/90 text-xs font-medium">
            {mediaType === 'image' ? (
              <>
                <ImageIcon className="w-3.5 h-3.5 text-[#087F75]" />
                <span>{isRtl ? 'صورة' : 'Photo'}</span>
              </>
            ) : (
              <>
                <VideoIcon className="w-3.5 h-3.5 text-[#087F75]" />
                <span>{isRtl ? 'فيديو' : 'Video'}</span>
              </>
            )}
          </div>

          <div className="w-10" />
        </div>

        {/* Media Preview Stage */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden relative">
          {mediaType === 'image' ? (
            <img
              src={mediaPreviewUrl || undefined}
              alt="Media Preview"
              className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl"
            />
          ) : (
            <video
              src={mediaPreviewUrl || undefined}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl"
            />
          )}
        </div>

        {/* Bottom Caption & Send Bar */}
        <div className="p-4 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent shrink-0">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <div className="flex-1 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 px-4 py-2.5 flex items-center gap-2">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isUploading) {
                    e.preventDefault();
                    handleSendClick();
                  }
                }}
                disabled={isUploading}
                placeholder={isRtl ? 'أضف شرحاً توضيحياً...' : 'Add a caption...'}
                className={`w-full bg-transparent text-white placeholder:text-white/50 text-sm outline-hidden ${
                  isRtl ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <button
              type="button"
              onClick={handleSendClick}
              disabled={isUploading}
              className="w-12 h-12 rounded-full bg-[#087F75] hover:bg-[#06685F] text-white flex items-center justify-center shadow-lg shadow-[#087F75]/40 cursor-pointer transition-all shrink-0 active:scale-95 disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className={`w-5 h-5 ${isRtl ? 'rotate-180 -mr-0.5' : '-ml-0.5'}`} />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
