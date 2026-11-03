import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, User, X, Sparkles, Check, AlertCircle, RefreshCw, QrCode, Share2, Copy, CheckCheck } from 'lucide-react';
import { Language, UserProfile, Country } from '../types';
import { compressImage } from '../lib/media';
import { generateContactQrDataUrl, generateContactQrPayload } from '../lib/qrCode';
import { LazyImage } from './LazyImage';

interface ProfileSetupScreenProps {
  language: Language;
  phoneNumber: string;
  country: Country;
  onCompleteProfile: (profile: UserProfile) => Promise<void>;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  language,
  phoneNumber,
  country,
  onCompleteProfile,
}) => {
  const isRtl = language === 'ar';
  const [name, setName] = useState('');
  const [bio, setBio] = useState(
    isRtl ? 'مرحباً! أنا أستخدم تطبيق هلا للمراسلة والمكالمات 👋' : 'Hey there! I am using Hala for messaging and calls 👋'
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isQrCopied, setIsQrCopied] = useState(false);
  const [showQrDetails, setShowQrDetails] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidName = name.trim().length >= 2;

  // Generate live QR code for the user profile as name, bio, or avatar changes
  useEffect(() => {
    let isCancelled = false;
    const displayName = name.trim() || (isRtl ? 'مستخدم هلا' : 'Hala User');
    
    generateContactQrDataUrl({
      name: displayName,
      phoneNumber,
      avatarUrl,
      status: bio.trim() || (isRtl ? 'مرحباً! أنا أستخدم تطبيق هلا 👋' : "Hey there! I'm using Hala 👋"),
    }, {
      size: 320,
      darkColor: '#0f172a',
      lightColor: '#ffffff',
    })
      .then((dataUrl) => {
        if (!isCancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch((err) => {
        console.warn('[ProfileSetup] QR code preview generation error:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [name, bio, phoneNumber, avatarUrl, isRtl]);

  const handleCopyLink = () => {
    const payload = generateContactQrPayload({
      name: name.trim() || 'Hala User',
      phoneNumber,
      avatarUrl,
    });
    navigator.clipboard?.writeText(payload);
    setIsQrCopied(true);
    setTimeout(() => setIsQrCopied(false), 2000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    try {
      console.log('[ProfileSetup] Processing selected avatar image...', { fileName: file.name, size: file.size });
      // Compress avatar client-side to ensure fast uploads and safe payload sizes
      const { dataUrl } = await compressImage(file, 400, 400, 0.8);
      setAvatarUrl(dataUrl);
      console.log('[ProfileSetup] Avatar successfully processed and ready for upload.');
    } catch (err: any) {
      console.warn('[ProfileSetup] Avatar compression fallback to raw read:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAvatarUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValidName || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);

    console.log('[ProfileSetup] Step 1: Starting profile save process for:', name.trim());
    setSavingStep(
      avatarUrl
        ? isRtl ? 'جاري معالجة الصورة الشخصية...' : 'Preparing avatar...'
        : isRtl ? 'جاري حفظ الملف الشخصي...' : 'Saving profile...'
    );

    try {
      console.log('[ProfileSetup] Step 2: Calling onCompleteProfile with user payload');
      setSavingStep(isRtl ? 'جاري الاتصال بقاعدة البيانات...' : 'Writing to Firebase...');

      await onCompleteProfile({
        name: name.trim(),
        avatarUrl,
        phoneNumber,
        status: bio.trim() || (isRtl ? 'مرحباً! أنا أستخدم تطبيق هلا 👋' : "Hey there! I'm using Hala 👋"),
        country,
      });

      console.log('[ProfileSetup] Step 3: Profile write completed! Navigation triggered.');
      setSavingStep(isRtl ? 'تم الحفظ! جاري فتح المحادثات...' : 'Saved! Opening chats...');
    } catch (err: any) {
      console.error('[ProfileSetup] Profile save error encountered:', err);
      const readableError =
        err?.message || (isRtl ? 'حدث خطأ أثناء حفظ الملف الشخصي' : 'Failed to save profile. Please check your connection.');
      setErrorMessage(readableError);
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full h-full flex flex-col justify-between px-6 py-6 bg-slate-50 text-slate-900 min-h-[580px] overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      <div>
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#087F75]/10 text-[#087F75] rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isRtl ? 'الملف الشخصي' : 'Profile Setup'}</span>
          </div>

          <span className="text-xs text-slate-400 font-mono" dir="ltr">
            {country.flag} {phoneNumber}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">
          {isRtl ? 'أنشئ ملفك الشخصي' : 'Set up your profile'}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {isRtl
            ? 'أضف اسمك وصورة شخصية لحفظ حسابك وتوليد رمز QR الخاص بك'
            : 'Add your name and photo to setup your account and personal QR code'}
        </p>

        {/* Error Alert Banner if an error occurred */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1 text-xs">
                <p className="font-semibold mb-1">
                  {isRtl ? 'تعذر حفظ الملف الشخصي' : 'Profile save failed'}
                </p>
                <p className="text-red-600 mb-2">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'إعادة المحاولة' : 'Try Again'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-400 hover:text-red-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Avatar Upload Container */}
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="relative group">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full bg-slate-200 border-2 border-dashed border-slate-300 hover:border-[#087F75] flex items-center justify-center overflow-hidden relative transition-all cursor-pointer group-hover:shadow-md"
              aria-label={isRtl ? 'رفع صورة شخصية' : 'Upload profile picture'}
            >
              {avatarUrl ? (
                <LazyImage
                  src={avatarUrl}
                  alt="Avatar preview"
                  aspectRatio="1/1"
                  containerClassName="w-full h-full rounded-full"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <User className="w-10 h-10 stroke-[1.5]" />
                </div>
              )}

              {/* Overlay Camera Icon */}
              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera className="w-6 h-6" />
              </div>
            </button>

            {/* Camera Badge Icon */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md border-2 border-white hover:bg-[#06685F] transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            {/* Remove photo button if uploaded */}
            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="absolute top-0 right-0 w-6 h-6 rounded-full bg-slate-800/80 text-white flex items-center justify-center shadow-xs hover:bg-slate-900 transition-colors cursor-pointer"
                title={isRtl ? 'إزالة الصورة' : 'Remove photo'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <span className="text-xs text-slate-400 mt-2">
            {avatarUrl
              ? isRtl ? 'انقر لتغيير الصورة' : 'Tap to change photo'
              : isRtl ? 'صورة شخصية (اختياري)' : 'Profile picture (optional)'}
          </span>
        </div>

        {/* Name & Bio Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              {isRtl ? 'الاسم الكامل' : 'Full Name'} <span className="text-[#087F75]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder={isRtl ? 'مثال: محمد العتيبي' : 'e.g. Sarah Mansour'}
                className="w-full h-[48px] min-h-[44px] px-4 bg-white border border-slate-300 rounded-2xl text-base font-medium text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#087F75] focus:ring-2 focus:ring-[#087F75]/20 transition-all"
                autoFocus
              />
              {isValidName && (
                <div className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} text-emerald-600`}>
                  <Check className="w-5 h-5" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {isRtl ? 'هذا الاسم سيظهر لجهات اتصالك ويضمن في رمز QR الخاص بك' : 'This name will be saved and encoded in your personal QR code'}
            </p>
          </div>

          {/* Multi-line Bio / About Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 block">
                {isRtl ? 'السيرة الذاتية / نبذة عنك' : 'Bio / About'}
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {bio.length}/200
              </span>
            </div>
            <div className="relative">
              <textarea
                value={bio}
                onChange={(e) => {
                  if (e.target.value.length <= 200) {
                    setBio(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }
                }}
                rows={3}
                placeholder={
                  isRtl
                    ? 'اكتب نبذة قصيرة عن نفسك، اهتماماتك أو حالتك الشخصية...'
                    : 'Write a short bio, status, or details about yourself...'
                }
                className="w-full p-3.5 bg-white border border-slate-300 rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-[#087F75] focus:ring-2 focus:ring-[#087F75]/20 transition-all resize-none leading-relaxed shadow-2xs"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              {isRtl
                ? 'ستظهر هذه السيرة الذاتية في ملفك الشخصي وفي بطاقة جهة الاتصال الخاصة بك'
                : 'This bio will be rendered in a dedicated card on your user profile display'}
            </p>
          </div>
        </form>

        {/* Visually Prominent Personal QR Code Section */}
        <div className="bg-gradient-to-br from-teal-50/80 via-white to-amber-50/50 border border-teal-200/80 rounded-2xl p-4 shadow-xs relative overflow-hidden mb-2">
          <div className="flex items-center justify-between pb-3 border-b border-teal-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#087F75] text-white rounded-lg shadow-2xs">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  {isRtl ? 'رمز QR الشخصي للمشاركة السريعة' : 'Your Personal Contact QR Code'}
                </h4>
                <p className="text-[10px] text-slate-500">
                  {isRtl ? 'جاهز للمسح والمشاركة فور إكمال الحساب' : 'Live preview • Ready for instant contact sharing'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="text-[11px] font-semibold text-[#087F75] hover:text-[#06685F] bg-white border border-teal-200 px-2 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
              title={isRtl ? 'نسخ بيانات الاتصال' : 'Copy contact payload'}
            >
              {isQrCopied ? (
                <>
                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-600">{isRtl ? 'تم النسخ' : 'Copied'}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{isRtl ? 'نسخ' : 'Copy'}</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-3 flex items-center gap-4">
            {/* Live QR Image Box */}
            <div className="w-24 h-24 bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs shrink-0 flex items-center justify-center relative group">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Personal QR Code Preview"
                  className="w-full h-full object-contain rounded-md"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                  <QrCode className="w-8 h-8 animate-pulse" />
                </div>
              )}
              {/* Subtle center avatar badge inside QR */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-5 h-5 rounded-full bg-white shadow-xs p-0.5 border border-[#087F75]/30 flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <div className="w-full h-full bg-[#087F75] text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                      {(name.trim() || 'H').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Info and sharing instructions */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold text-slate-800 truncate">
                  {name.trim() || (isRtl ? 'اسمك هنا' : 'Your Name')}
                </span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0" dir="ltr">
                  {country.flag} {phoneNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {isRtl
                  ? 'يمكن لأصدقائك مسح هذا الرمز بكاميرا هاتفهم لإضافتك وبدء محادثة أو مكالمة صوتية ومرئية معك فوراً.'
                  : 'Friends can scan this QR code with their camera to instantly message or call you on Hala.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="w-full pt-4">
        <motion.button
          type="button"
          whileHover={isValidName && !isSaving ? { scale: 1.01 } : {}}
          whileTap={isValidName && !isSaving ? { scale: 0.98 } : {}}
          onClick={() => handleSubmit()}
          disabled={!isValidName || isSaving}
          className={`w-full h-[52px] min-h-[44px] font-semibold text-base rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
            isValidName && !isSaving
              ? 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-md shadow-[#087F75]/20'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? (
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>{savingStep || (isRtl ? 'جاري الحفظ...' : 'Saving...')}</span>
            </div>
          ) : (
            <span>{isRtl ? 'حفظ ومتابعة' : 'Save & Continue'}</span>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};

