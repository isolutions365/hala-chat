import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Radio,
  Globe,
  Lock,
  Camera,
  Upload,
  Sparkles,
  Loader2,
  Check,
  ShieldCheck,
  MessageSquarePlus,
  Eye,
} from 'lucide-react';
import { Language, UserProfile } from '../types';
import { createNewChannel } from '../lib/firebase';
import { uploadChatMedia } from '../lib/media';

interface NewChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onChannelCreated: (channelId: string) => void;
}

export const NewChannelModal: React.FC<NewChannelModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
  onChannelCreated,
}) => {
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [channelName, setChannelName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [allowMemberPosts, setAllowMemberPosts] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setError(null);
    try {
      const url = await uploadChatMedia({
        chatId: 'channels_avatar_upload',
        messageId: `channel_avatar_${Date.now()}`,
        fileOrBlob: file,
      });
      setAvatarUrl(url);
    } catch (err: any) {
      console.warn('Avatar upload error:', err);
      // Fallback to data URL
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCreate = async () => {
    if (!channelName.trim()) {
      setError(isRtl ? 'يرجى إدخال اسم القناة' : 'Please enter channel name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const channelId = await createNewChannel({
        ownerId: currentUserId,
        ownerProfile: currentUserProfile,
        name: channelName.trim(),
        description: description.trim(),
        avatarUrl,
        isPublic,
        allowMemberPosts,
      });

      // Reset state & notify
      setChannelName('');
      setDescription('');
      setAvatarUrl(null);
      setIsPublic(true);
      setAllowMemberPosts(false);
      onChannelCreated(channelId);
    } catch (err: any) {
      console.error('Failed to create channel:', err);
      setError(err?.message || (isRtl ? 'حدث خطأ أثناء إنشاء القناة' : 'Failed to create channel'));
    } finally {
      setIsCreating(false);
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
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-teal-50 via-white to-teal-50/40 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#087F75]/10 text-[#087F75] flex items-center justify-center font-bold shadow-xs">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                {isRtl ? 'إنشاء قناة جديدة' : 'New Channel'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isRtl ? 'بث رسائل وتحديثات لعدد غير محدود' : 'Broadcast to unlimited subscribers'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold border border-red-100 flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Avatar & Basic Info */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-18 h-18 rounded-2xl bg-teal-100 border-2 border-dashed border-[#087F75]/40 flex items-center justify-center overflow-hidden text-[#087F75] shadow-xs">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Channel Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Radio className="w-8 h-8 opacity-70" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md hover:bg-[#06685F] cursor-pointer transition-transform hover:scale-105"
                title={isRtl ? 'تغيير صورة القناة' : 'Change avatar'}
              >
                {isUploadingAvatar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>

            <div className="flex-1 space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                {isRtl ? 'اسم القناة *' : 'Channel Name *'}
              </label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder={isRtl ? 'مثال: أخبار التقنية، عروض حصرية...' : 'e.g. Tech News, Daily Deals...'}
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:border-[#087F75] transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              {isRtl ? 'وصف القناة (اختياري)' : 'Description (Optional)'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isRtl
                  ? 'اكتب نبذة عن القناة والمحتوى الذي تشاركه مع المشتركين...'
                  : 'What is this channel about? Inform your subscribers...'
              }
              rows={2}
              maxLength={200}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:border-[#087F75] transition-all resize-none"
            />
          </div>

          {/* Public vs Private Setting */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              {isRtl ? 'نوع القناة والظهور' : 'Channel Privacy'}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Public */}
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                  isPublic
                    ? 'border-[#087F75] bg-teal-50/60 ring-2 ring-[#087F75]/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Globe className="w-4 h-4 text-[#087F75]" />
                    <span>{isRtl ? 'قناة عامة' : 'Public'}</span>
                  </div>
                  {isPublic && <Check className="w-4 h-4 text-[#087F75]" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {isRtl
                    ? 'يمكن لأي شخص العثور على القناة والاشتراك بها'
                    : 'Discoverable and joinable by anyone'}
                </p>
              </button>

              {/* Private */}
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                  !isPublic
                    ? 'border-[#087F75] bg-teal-50/60 ring-2 ring-[#087F75]/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Lock className="w-4 h-4 text-slate-700" />
                    <span>{isRtl ? 'قناة خاصة' : 'Private'}</span>
                  </div>
                  {!isPublic && <Check className="w-4 h-4 text-[#087F75]" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {isRtl
                    ? 'لا يمكن الانضمام إلا عن طريق دعوة خاصة'
                    : 'Only accessible via direct invite link'}
                </p>
              </button>
            </div>
          </div>

          {/* Posting Permissions */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-100 text-[#087F75] flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {isRtl ? 'السماح للأعضاء بنشر الرسائل' : 'Allow member posting'}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {isRtl
                    ? 'افتراضياً القناة باتجاه واحد (المشرفون فقط ينشرون)'
                    : 'By default, only channel admins can post'}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowMemberPosts}
                onChange={(e) => setAllowMemberPosts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#087F75]"></div>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !channelName.trim()}
            className="px-6 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-[#087F75]/25 flex items-center gap-2 cursor-pointer transition-all"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isRtl ? 'جاري الإنشاء...' : 'Creating...'}</span>
              </>
            ) : (
              <span>{isRtl ? 'إنشاء القناة' : 'Create Channel'}</span>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
