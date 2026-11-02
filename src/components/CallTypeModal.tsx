import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Video, X } from 'lucide-react';
import { Language, CallType } from '../types';

interface CallTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  contactAvatar?: string | null;
  phoneNumber?: string;
  onSelectCallType: (type: CallType) => void;
  language: Language;
}

export const CallTypeModal: React.FC<CallTypeModalProps> = ({
  isOpen,
  onClose,
  contactName,
  contactAvatar,
  phoneNumber,
  onSelectCallType,
  language,
}) => {
  if (!isOpen) return null;
  const isRtl = language === 'ar';
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSelect = (type: CallType) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onSelectCallType(type);
    onClose();
    setTimeout(() => {
      setIsSubmitting(false);
    }, 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
        {/* Backdrop dismiss */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-sm bg-[#1E2024] border border-stone-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl text-stone-100 overflow-hidden z-10"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800/60 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Contact Header */}
          <div className="flex flex-col items-center text-center mt-2 mb-6">
            <div className="relative mb-3">
              {contactAvatar ? (
                <img
                  src={contactAvatar}
                  alt={contactName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-[#087F75]/50 shadow-md"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#087F75] to-[#b3421b] text-white flex items-center justify-center text-2xl font-bold border-2 border-stone-700 shadow-md">
                  {contactName ? contactName.charAt(0).toUpperCase() : 'H'}
                </div>
              )}
            </div>
            <h3 className="text-xl font-bold text-stone-100">{contactName}</h3>
            {phoneNumber && (
              <p className="text-xs text-stone-400 font-mono mt-0.5 dir-ltr">{phoneNumber}</p>
            )}
            <p className="text-xs text-[#087F75] mt-1.5 font-medium">
              {isRtl ? 'اختر نوع المكالمة' : 'Choose call type'}
            </p>
          </div>

          {/* Call Options */}
          <div className="grid grid-cols-2 gap-3 mb-2">
            {/* Voice Call */}
            <button
              onClick={() => handleSelect('voice')}
              disabled={isSubmitting}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-stone-800/80 hover:bg-stone-700/80 border border-stone-700/60 active:scale-95 transition group ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition">
                <Phone className="w-6 h-6" />
              </div>
              <span className="font-semibold text-stone-200 text-sm">
                {isRtl ? 'مكالمة صوتية' : 'Voice Call'}
              </span>
              <span className="text-[11px] text-stone-400 mt-0.5">
                {isRtl ? 'صوت عالي الدقة' : 'HD Audio'}
              </span>
            </button>

            {/* Video Call */}
            <button
              onClick={() => handleSelect('video')}
              disabled={isSubmitting}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-stone-800/80 hover:bg-stone-700/80 border border-stone-700/60 active:scale-95 transition group ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-[#087F75]/20 text-[#087F75] flex items-center justify-center mb-2 group-hover:scale-110 transition">
                <Video className="w-6 h-6" />
              </div>
              <span className="font-semibold text-stone-200 text-sm">
                {isRtl ? 'مكالمة فيديو' : 'Video Call'}
              </span>
              <span className="text-[11px] text-stone-400 mt-0.5">
                {isRtl ? 'كاميرا وصوت' : 'Cam & Audio'}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
