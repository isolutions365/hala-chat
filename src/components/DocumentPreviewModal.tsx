import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, FileText, AlertCircle, Loader2, Download, Paperclip } from 'lucide-react';
import { Language } from '../types';
import { formatFileSize, getDocumentMetadata, MAX_MEDIA_BYTES } from '../lib/mediaPolicy';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  file: File | null;
  onSend: (caption: string) => void;
  isUploading?: boolean;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  language,
  file,
  onSend,
  isUploading = false,
}) => {
  const isRtl = language === 'ar';
  const [caption, setCaption] = useState('');

  if (!isOpen || !file) return null;

  const isOversized = file.size > MAX_MEDIA_BYTES;
  const meta = getDocumentMetadata(file.name, file.type);

  const handleSendClick = () => {
    if (isOversized || isUploading) return;
    onSend(caption.trim());
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-60 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-slate-100"
          dir={isRtl ? 'rtl' : 'ltr'}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Paperclip className="w-4 h-4 text-[#087F75]" />
              <span>{isRtl ? 'إرسال مستند أو ملف' : 'Send Document or File'}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Document Preview Card */}
          <div className="p-5 flex flex-col items-center justify-center gap-4 bg-slate-50/30">
            <div
              className={`w-20 h-24 rounded-2xl ${meta.lightBg} ${meta.border} border-2 flex flex-col items-center justify-between p-2 shadow-sm transition-transform hover:scale-105`}
            >
              <div className="w-full flex justify-end">
                <span className={`text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded text-white ${meta.bg}`}>
                  {meta.ext}
                </span>
              </div>
              <FileText className={`w-8 h-8 ${meta.text}`} />
              <div className="w-full h-1 bg-current opacity-20 rounded" />
            </div>

            <div className="text-center max-w-full px-2">
              <h4 className="font-bold text-slate-900 text-sm truncate max-w-xs mx-auto" title={file.name}>
                {file.name}
              </h4>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                {formatFileSize(file.size)}
              </p>
            </div>

            {isOversized && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs w-full">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  {isRtl
                    ? `حجم الملف يتجاوز الحد الأقصى (20 ميجابايت). الحجم الحالي: ${formatFileSize(file.size)}`
                    : `File exceeds maximum limit of 20 MB. Current size: ${formatFileSize(file.size)}`}
                </span>
              </div>
            )}
          </div>

          {/* Caption Input */}
          <div className="p-4 border-t border-slate-100 flex flex-col gap-3">
            <div className="relative">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isOversized) {
                    handleSendClick();
                  }
                }}
                disabled={isUploading}
                placeholder={isRtl ? 'إضافة تعليق توضيحي (اختياري)...' : 'Add a caption (optional)...'}
                className="w-full bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#087F75]/40 focus:bg-white transition-all"
                dir="auto"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSendClick}
                disabled={isOversized || isUploading}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                  isOversized || isUploading
                    ? 'bg-slate-300 cursor-not-allowed shadow-none'
                    : 'bg-[#087F75] hover:bg-[#06685F] shadow-[#087F75]/30'
                }`}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isRtl ? 'جاري الرفع...' : 'Uploading...'}</span>
                  </>
                ) : (
                  <>
                    <Send className={`w-3.5 h-3.5 ${isRtl ? '-scale-x-100' : ''}`} />
                    <span>{isRtl ? 'إرسال الملف' : 'Send File'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
