import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Share2, MessageCircle, QrCode, Sparkles } from 'lucide-react';
import { Language, UserProfile } from '../types';

import { getPublicAppUrl } from '../services/appConfig';
import { copyToClipboard } from '../services/clipboard';
import { shareAppContent } from '../services/share';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
}) => {
  const isRtl = language === 'ar';
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Invite URL format using appConfig
  const inviteUrl = `${getPublicAppUrl()}/invite/${currentUserId}`;

  const shareTitle = isRtl ? 'انضم إليّ على تطبيق هالة شات!' : 'Join me on Hala Chat!';
  const shareText = isRtl
    ? `أهلاً! تواصل ودردش معي على تطبيق هالة شات المشفر وآمن. انقر هنا للبدء: ${inviteUrl}`
    : `Hey! Let's connect on Hala Chat, a secure and encrypted messaging app. Click here to talk: ${inviteUrl}`;

  const handleCopyLink = async () => {
    const success = await copyToClipboard(inviteUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleWhatsAppShare = () => {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    const shared = await shareAppContent({
      title: shareTitle,
      text: shareText,
      url: inviteUrl,
    });
    if (!shared) {
      handleCopyLink();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-teal-500 via-[#087F75] to-teal-700 text-white flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold leading-snug">
                {isRtl ? 'دعوة الأصدقاء' : 'Invite Friends'}
              </h3>
              <p className="text-xs text-white/80 font-medium">
                {isRtl ? 'شارك رابطك الخاص للبدء بالمحادثة فوراً' : 'Share your invite link to chat instantly'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer relative z-10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* User Profile Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-base shadow-xs shrink-0">
              {currentUserProfile.avatarUrl ? (
                <img
                  src={currentUserProfile.avatarUrl}
                  alt={currentUserProfile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{currentUserProfile.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-slate-900 truncate">
                {currentUserProfile.name}
              </h4>
              <p className="text-xs text-slate-500 truncate">
                {currentUserProfile.phoneNumber}
              </p>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-teal-100/80 text-[#087F75] text-[10px] font-extrabold uppercase">
              {isRtl ? 'رابط نشط' : 'Active Link'}
            </div>
          </div>

          {/* Link Box */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 px-1">
              {isRtl ? 'رابط الدعوة الخاص بك' : 'Your Personal Invite Link'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-xs'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isRtl ? 'تم النسخ' : 'Copied'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{isRtl ? 'نسخ' : 'Copy'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Action Share Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* WhatsApp Share Button */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="py-3 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isRtl ? 'واتساب' : 'WhatsApp'}</span>
            </button>

            {/* Native / General Share Button */}
            <button
              type="button"
              onClick={handleNativeShare}
              className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>{isRtl ? 'مشاركة' : 'Share...'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
