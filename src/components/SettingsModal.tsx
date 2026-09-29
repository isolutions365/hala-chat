import { AppearanceSettings } from './AppearanceSettings';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  Phone,
  Globe,
  LogOut,
  CheckCircle2,
  ShieldCheck,
  Database,
  MessageSquare,
  QrCode,
  ScanLine,
  Share2,
  Download,
  Copy,
  Check,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import { Language, UserProfile } from '../types';
import { generateContactQrDataUrl, generateContactQrPayload } from '../lib/qrCode';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  profile: UserProfile;
  onLanguageChange: (lang: Language) => void;
  onRestartOnboarding: () => void;
  onOpenQrModal?: (tab: 'my_code' | 'scan') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  profile,
  onLanguageChange,
  onRestartOnboarding,
  onOpenQrModal,
}) => {
  const isRtl = language === 'ar';
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Generate QR Code for the profile
  useEffect(() => {
    if (isOpen && profile) {
      generateContactQrDataUrl(profile, {
        size: 360,
        darkColor: '#0f172a',
        lightColor: '#ffffff',
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Error generating QR in SettingsModal:', err));
    }
  }, [isOpen, profile]);

  const handleCopyLink = () => {
    const payload = generateContactQrPayload(profile);
    navigator.clipboard?.writeText(payload);
    setCopied(true);
    showToast(isRtl ? 'تم نسخ رمز الاتصال بنجاح!' : 'Contact code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const shareText = `${profile.name} on Hala: ${profile.phoneNumber}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.name} - Hala Contact`,
          text: isRtl
            ? `تواصل معي على تطبيق هلا: ${profile.phoneNumber}`
            : `Connect with me on Hala: ${profile.phoneNumber}`,
        });
      } catch (err) {
        // Fallback to copy
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `hala-qr-${profile.name.replace(/\s+/g, '_')}.png`;
    link.href = qrDataUrl;
    link.click();
    showToast(isRtl ? 'تم تنزيل رمز QR بنجاح!' : 'QR Code downloaded successfully!');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Top Bar */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <h3 className="font-bold text-slate-900 text-base">
              {isRtl ? 'الملف الشخصي والإعدادات' : 'Profile & Settings'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Toast Notification */}
          <AnimatePresence>
            {toastMsg && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-slate-900 text-white text-xs px-4 py-2 text-center font-medium shadow-md"
              >
                {toastMsg}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
            {/* User Profile Card */}
            <div className="flex flex-col items-center text-center p-4 bg-slate-50 border border-slate-100 rounded-2xl relative">
              <div className="w-20 h-20 rounded-full bg-[#D85A30] text-white flex items-center justify-center overflow-hidden font-bold text-2xl shadow-md mb-3 ring-4 ring-[#D85A30]/10">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{profile.name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <h4 className="text-lg font-bold text-slate-900">{profile.name}</h4>
              <p className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                {profile.country?.flag} {profile.phoneNumber}
              </p>
              <p className="text-xs text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200 mt-2.5">
                "{profile.status || "Hey there, I'm using Hala"}"
              </p>
            </div>

            {/* Visually Prominent Personal QR Code Section */}
            <div className="bg-gradient-to-br from-orange-50/90 via-white to-amber-50/60 border border-orange-200/90 rounded-2xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-orange-100">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#D85A30] text-white rounded-lg shadow-2xs">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {isRtl ? 'رمز QR الشخصي الخاص بك' : 'Your Personal QR Code'}
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      {isRtl ? 'شارك رمزك للإضافة والمحادثة الفورية' : 'Share for instant contact sharing'}
                    </p>
                  </div>
                </div>

                {onOpenQrModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenQrModal('my_code');
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#D85A30] hover:text-[#c44e27] bg-white border border-orange-200 px-2 py-1 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>{isRtl ? 'عرض مكبّر' : 'Expand'}</span>
                  </button>
                )}
              </div>

              {/* QR Code Presentation Box */}
              <div className="py-4 flex flex-col items-center justify-center">
                <div className="w-44 h-44 bg-white p-2.5 rounded-2xl border-2 border-orange-200 shadow-md flex items-center justify-center relative group">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Personal QR Code"
                      className="w-full h-full object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                      <QrCode className="w-12 h-12 animate-pulse text-[#D85A30]" />
                    </div>
                  )}

                  {/* Centered avatar badge inside QR */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-white shadow-md p-0.5 border-2 border-[#D85A30] flex items-center justify-center overflow-hidden">
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <div className="w-full h-full bg-[#D85A30] text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                          {profile.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 text-center mt-3 font-medium px-4">
                  {isRtl
                    ? 'امسح هذا الرمز باستخدام كاميرا تطبيق هلا لبدء محادثة فورية'
                    : 'Scan this code with the Hala camera scanner to add contact & chat'}
                </p>
              </div>

              {/* Prominent QR Action Buttons */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-orange-100">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-orange-50 border border-slate-200 hover:border-[#D85A30]/40 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#D85A30]" />
                  <span>{isRtl ? 'مشاركة' : 'Share'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-orange-50 border border-slate-200 hover:border-[#D85A30]/40 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#D85A30]" />
                  <span>{isRtl ? 'تنزيل' : 'Save'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-orange-50 border border-slate-200 hover:border-[#D85A30]/40 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-600">{isRtl ? 'تم!' : 'Copied'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#D85A30]" />
                      <span>{isRtl ? 'نسخ' : 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Scan Code Option */}
              {onOpenQrModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQrModal('scan');
                  }}
                  className="w-full mt-2.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <ScanLine className="w-4 h-4" />
                  <span>{isRtl ? 'مسح رمز QR لجهة اتصال أخرى' : 'Scan a Contact’s QR Code'}</span>
                </button>
              )}
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {isRtl ? 'لغة التطبيق' : 'App Interface Language'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onLanguageChange('ar')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    language === 'ar'
                      ? 'border-[#D85A30] bg-[#D85A30]/10 text-[#D85A30] shadow-2xs'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>العربية</span>
                  {language === 'ar' && <CheckCircle2 className="w-3.5 h-3.5 text-[#D85A30]" />}
                </button>
                <button
                  type="button"
                  onClick={() => onLanguageChange('en')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    language === 'en'
                      ? 'border-[#D85A30] bg-[#D85A30]/10 text-[#D85A30] shadow-2xs'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>English</span>
                  {language === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-[#D85A30]" />}
                </button>
              </div>
            </div>


            <AppearanceSettings isRtl={isRtl} />

            {/* Auto-Translation Settings */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#D85A30]" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {isRtl ? 'الترجمة التلقائية للرسائل' : 'Message Auto-Translation'}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {isRtl ? 'لغة الترجمة المفضلة' : 'Preferred Language'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isRtl
                        ? 'تترجم جميع الرسائل الواردة إلى هذه اللغة مباشرة'
                        : 'Translates incoming messages automatically'}
                    </p>
                  </div>
                  <select
                    value={localStorage.getItem('hala_pref_trans_lang') || language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      localStorage.setItem('hala_pref_trans_lang', newLang);
                      // Force re-render if needed
                      window.dispatchEvent(new Event('storage'));
                    }}
                    className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#D85A30]"
                  >
                    <option value="ar">العربية (Arabic)</option>
                    <option value="en">English</option>
                    <option value="fr">Français (French)</option>
                    <option value="es">Español (Spanish)</option>
                    <option value="de">Deutsch (German)</option>
                    <option value="tr">Türkçe (Turkish)</option>
                    <option value="ur">اردو (Urdu)</option>
                    <option value="hi">हिन्दी (Hindi)</option>
                    <option value="zh">中文 (Chinese)</option>
                    <option value="it">Italiano (Italian)</option>
                    <option value="pt">Português (Portuguese)</option>
                    <option value="ru">Русский (Russian)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Security & System Info */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                {isRtl ? 'حالة النظام وقاعدة البيانات' : 'System & Database'}
              </span>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isRtl ? 'قاعدة بيانات Firestore:' : 'Firestore DB:'}</span>
                  </div>
                  <span className="font-semibold text-emerald-600">Connected</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#D85A30]" />
                    <span>{isRtl ? 'حالة التوثيق:' : 'Auth Verification:'}</span>
                  </div>
                  <span className="font-mono text-slate-900">Phone OTP Verified</span>
                </div>
              </div>
            </div>

            {/* Restart Onboarding / Log Out */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRestartOnboarding();
                }}
                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-2xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer border border-red-200/60"
              >
                <LogOut className="w-4 h-4 text-red-600" />
                <span>{isRtl ? 'تسجيل الخروج والبدء من جديد' : 'Log Out / Restart Onboarding'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
