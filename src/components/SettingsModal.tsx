import { ProfilePhotoEditor } from './ProfilePhotoEditor';
import { AppearanceSettings } from './AppearanceSettings';
import { PWAInstallButton } from './PWAInstallButton';
import { TestVersionBanner } from './TestVersionBanner';
import { TwoStepSettings } from './TwoStepSettings';
import React, { useState, useEffect, useRef } from 'react';
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
  Edit2,
  FileText,
  Info,
  Loader2,
  ShieldAlert,
  ChevronRight,
  Mail,
  Monitor,
  Smartphone,
  History,
  RefreshCw,
} from 'lucide-react';
import { Language, UserProfile } from '../types';
import { generateContactQrDataUrl, generateContactQrPayload } from '../lib/qrCode';
import { doc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb, checkUserExists } from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  profile: UserProfile;
  onPhotoSave: (dataUrl: string) => Promise<void>;
  onLanguageChange: (lang: Language) => void;
  onRestartOnboarding: () => void;
  onOpenQrModal?: (tab: 'my_code' | 'scan') => void;
  onUserProfileUpdated?: (profile: UserProfile) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  language,
  profile,
  onPhotoSave,
  onLanguageChange,
  onRestartOnboarding,
  onOpenQrModal,
  onUserProfileUpdated,
}) => {
  const isRtl = language === 'ar';
  const modalRef = useRef<HTMLDivElement>(null);
  const [showTwoStep, setShowTwoStep] = useState(false);
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [isLinkingLoading, setIsLinkingLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && profile.id) {
      void loadSessions();
    }
  }, [isOpen, profile.id]);

  const loadSessions = async () => {
    if (!profile.id) return;
    setIsSessionsLoading(true);
    try {
      const { fetchActiveSessions } = await import('../lib/firebase');
      const sessions = await fetchActiveSessions(profile.id);
      setActiveSessions(sessions);
    } catch (err) {
      console.warn('Failed to load sessions:', err);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const { revokeSession } = await import('../lib/firebase');
      await revokeSession(sessionId);
      setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
      
      const currentSessionId = localStorage.getItem('hala.sessionId');
      if (sessionId === currentSessionId) {
        onRestartOnboarding();
      }
    } catch (err) {
      console.warn('Failed to revoke session:', err);
    }
  };

  const handleLinkEmail = async () => {
    if (!linkEmail || linkPassword.length < 6) return;
    setIsLinkingLoading(true);
    try {
      const { linkEmailToAccount, setRecoveryEmail } = await import('../lib/firebase');
      await linkEmailToAccount(linkEmail, linkPassword);
      await setRecoveryEmail(linkEmail);

      const nextTwoFactor = { ...profile.twoFactor, recoveryEmail: linkEmail, enabled: profile.twoFactor?.enabled ?? false };
      if (onUserProfileUpdated) {
        onUserProfileUpdated({ ...profile, email: linkEmail, emailVerified: false, twoFactor: nextTwoFactor });
      } else {
        profile.email = linkEmail;
        profile.twoFactor = nextTwoFactor;
      }
      setIsLinkingEmail(false);
      showToast(isRtl ? 'تم ربط البريد الإلكتروني وتعيينه للاسترداد بنجاح!' : 'Email linked & set as recovery email!');
    } catch (err: any) {
      console.error('Link email error:', err);
      showToast(err.message || (isRtl ? 'فشل ربط البريد الإلكتروني' : 'Failed to link email'));
    } finally {
      setIsLinkingLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setShowTwoStep(false);
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const focusable = () => Array.from<HTMLElement>(modal?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href]') || []).filter(el => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !modal?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [isOpen, onClose]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioText, setBioText] = useState(profile.status || (isRtl ? 'مرحباً! أنا أستخدم تطبيق هلا 👋' : "Hey there! I'm using Hala 👋"));
  const [isSavingBio, setIsSavingBio] = useState(false);

  useEffect(() => {
    setBioText(profile.status || (isRtl ? 'مرحباً! أنا أستخدم تطبيق هلا 👋' : "Hey there! I'm using Hala 👋"));
  }, [profile.status, isRtl]);

  const handleSaveBio = async () => {
    if (!profile.id) return;
    setIsSavingBio(true);
    try {
      const firestore = getFirebaseDb();
      const userRef = doc(firestore, 'users', profile.id);
      await updateDoc(userRef, { status: bioText.trim() });
      await checkUserExists(profile.id);
      if (onUserProfileUpdated) {
        onUserProfileUpdated({ ...profile, status: bioText.trim() });
      } else {
        profile.status = bioText.trim();
      }
      setIsEditingBio(false);
      showToast(isRtl ? 'تم تحديث السيرة الذاتية بنجاح!' : 'Bio updated successfully!');
    } catch (err) {
      console.warn('Failed to update bio:', err);
      showToast(isRtl ? 'فشل تحديث السيرة الذاتية' : 'Failed to update bio');
    } finally {
      setIsSavingBio(false);
    }
  };

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
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-settings-title"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {showTwoStep ? (
            <TwoStepSettings
              language={language}
              profile={profile}
              onClose={() => setShowTwoStep(false)}
              onStatusChange={(enabled) => {
                if (onUserProfileUpdated) {
                  onUserProfileUpdated({ ...profile, twoFactor: { ...profile.twoFactor, enabled } });
                } else {
                  profile.twoFactor = { ...profile.twoFactor, enabled };
                }
              }}
              onUserProfileUpdated={onUserProfileUpdated}
            />
          ) : (
            <>
              {/* Top Bar */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <h3 id="profile-settings-title" className="font-bold text-slate-900 text-base">
                  {isRtl ? 'الملف الشخصي والإعدادات' : 'Profile & Settings'}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={isRtl ? 'إغلاق' : 'Close'}
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
                  <div className="w-20 h-20 rounded-full bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-2xl shadow-md mb-3 ring-4 ring-[#087F75]/10">
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

                  <ProfilePhotoEditor isRtl={isRtl} onSave={onPhotoSave} />
                  <h4 className="text-lg font-bold text-slate-900">{profile.name}</h4>
                  <div className="flex flex-col items-center mt-0.5">
                    <p className="text-xs text-slate-500 font-mono" dir="ltr">
                      {profile.country?.flag} {profile.phoneNumber}
                    </p>
                    {profile.email && (
                      <p className="text-[10px] text-[#087F75] font-semibold mt-0.5">
                        {profile.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Dedicated Bio / About Display Card */}
                <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#087F75]">
                      <FileText className="w-4 h-4" />
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        {isRtl ? 'السيرة الذاتية / نبذة عنك' : 'Bio / About'}
                      </span>
                    </div>
                    {!isEditingBio && (
                      <button
                        type="button"
                        onClick={() => setIsEditingBio(true)}
                        className="text-xs font-bold text-[#087F75] hover:text-[#06685F] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>{isRtl ? 'تعديل' : 'Edit'}</span>
                      </button>
                    )}
                  </div>

                  {isEditingBio ? (
                    <div className="space-y-2.5 pt-1">
                      <textarea
                        value={bioText}
                        onChange={(e) => {
                          if (e.target.value.length <= 200) {
                            setBioText(e.target.value);
                          }
                        }}
                        rows={3}
                        className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#087F75]/20 focus:border-[#087F75] resize-none leading-relaxed"
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>{bioText.length}/200</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBioText(profile.status || '');
                              setIsEditingBio(false);
                            }}
                            className="px-2.5 py-1 text-slate-500 font-bold hover:text-slate-700 cursor-pointer"
                          >
                            {isRtl ? 'إلغاء' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveBio}
                            disabled={isSavingBio}
                            className="px-3 py-1 bg-[#087F75] text-white text-xs font-bold rounded-lg hover:bg-[#06685F] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {isSavingBio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>{isRtl ? 'حفظ' : 'Save'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700 font-medium leading-relaxed italic bg-slate-50/80 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap break-words">
                      "{profile.status || (isRtl ? 'لا توجد سيرة ذاتية بعد' : 'No bio provided yet')}"
                    </p>
                  )}
                </div>

                {/* Visually Prominent Personal QR Code Section */}
                <div className="bg-gradient-to-br from-teal-50/90 via-white to-amber-50/60 border border-teal-200/90 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-teal-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-[#087F75] text-white rounded-lg shadow-2xs">
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
                        className="flex items-center gap-1 text-[11px] font-bold text-[#087F75] hover:text-[#06685F] bg-white border border-teal-200 px-2 py-1 rounded-lg shadow-2xs transition-colors cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>{isRtl ? 'عرض مكبّر' : 'Expand'}</span>
                      </button>
                    )}
                  </div>

                  {/* QR Code Presentation Box */}
                  <div className="py-4 flex flex-col items-center justify-center">
                    <div className="w-44 h-44 bg-white p-2.5 rounded-2xl border-2 border-teal-200 shadow-md flex items-center justify-center relative group">
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt="Personal QR Code"
                          className="w-full h-full object-contain rounded-xl"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                          <QrCode className="w-12 h-12 animate-pulse text-[#087F75]" />
                        </div>
                      )}

                      {/* Centered avatar badge inside QR */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-white shadow-md p-0.5 border-2 border-[#087F75] flex items-center justify-center overflow-hidden">
                          {profile.avatarUrl ? (
                            <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <div className="w-full h-full bg-[#087F75] text-white text-[10px] font-bold flex items-center justify-center rounded-full">
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
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-teal-100">
                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-[#087F75]/40 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[#087F75]" />
                      <span>{isRtl ? 'مشاركة' : 'Share'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-[#087F75]/40 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#087F75]" />
                      <span>{isRtl ? 'تنزيل' : 'Save'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex items-center justify-center gap-1 py-2 px-2 bg-white hover:bg-teal-50 border border-slate-200 hover:border-[#087F75]/40 text-slate-800 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">{isRtl ? 'تم!' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#087F75]" />
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

                {/* Two-step Verification Link */}
                <button
                  type="button"
                  onClick={() => setShowTwoStep(true)}
                  className="w-full p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between shadow-2xs hover:bg-slate-100 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-teal-600 text-white shadow-sm">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-slate-900">
                        {isRtl ? 'التحقق بخطوتين' : 'Two-step Verification'}
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        {profile.twoFactor?.enabled 
                          ? (isRtl ? 'مفعل' : 'Enabled')
                          : (isRtl ? 'إضافة طبقة أمان' : 'Add an extra security layer')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 group-hover:text-[#087F75] transition-colors ${isRtl ? 'rotate-180' : ''}`} />
                </button>

                {/* Email Linking Section */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          {isRtl ? 'ربط البريد وكلمة المرور' : 'Link Email & Password'}
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          {profile.email 
                            ? (isRtl ? `مرتبط بـ: ${profile.email}` : `Linked to: ${profile.email}`)
                            : (isRtl ? 'عيّن بريدك وكلمة المرور لتسجيل الدخول من أجهزة أخرى بدون SMS' : 'Set email & password to login from other devices without SMS')}
                        </p>
                      </div>
                    </div>
                    
                    {!profile.email && (
                      <button
                        type="button"
                        onClick={() => setIsLinkingEmail(true)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                      >
                        {isRtl ? 'تعيين الآن' : 'Set Up Now'}
                      </button>
                    )}
                    {profile.email && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isRtl ? 'تم الربط' : 'Linked'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isLinkingEmail && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3"
                    >
                      <div className="space-y-3">
                        <p className="text-[11px] text-blue-900/80 leading-relaxed font-medium">
                          {isRtl
                            ? 'أدخل بريدك الإلكتروني واختر كلمة مرور لحسابك، لتتمكن من تسجيل الدخول بهما لاحقاً.'
                            : 'Enter your email and choose a password to use for future logins from other devices.'}
                        </p>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{isRtl ? 'البريد الإلكتروني' : 'Email'}</label>
                          <input
                            type="email"
                            value={linkEmail}
                            onChange={(e) => setLinkEmail(e.target.value)}
                            placeholder="mail@example.com"
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 shadow-2xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{isRtl ? 'كلمة المرور الجديدة (6 خانات على الأقل)' : 'New Password (min 6 characters)'}</label>
                          <input
                            type="password"
                            value={linkPassword}
                            onChange={(e) => setLinkPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 shadow-2xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsLinkingEmail(false)}
                            className="flex-1 h-10 rounded-xl bg-slate-200 text-slate-700 font-bold text-xs"
                          >
                            {isRtl ? 'إلغاء' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            disabled={isLinkingLoading || !linkEmail || linkPassword.length < 6}
                            onClick={handleLinkEmail}
                            className="flex-[2] h-10 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:bg-slate-300"
                          >
                            {isLinkingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isRtl ? 'تأكيد الربط' : 'Confirm Link')}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Linked Devices Section */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                        <History className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          {isRtl ? 'الأجهزة المرتبطة' : 'Linked Devices'}
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          {isRtl ? 'إدارة الجلسات النشطة' : 'Manage active sessions'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={loadSessions}
                      className="p-1.5 text-slate-400 hover:text-[#087F75] transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSessionsLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {activeSessions.length === 0 && !isSessionsLoading && (
                      <p className="text-[10px] text-slate-400 italic text-center py-2">
                        {isRtl ? 'لا توجد جلسات أخرى' : 'No other active sessions'}
                      </p>
                    )}
                    {activeSessions.map((session) => {
                      const isCurrent = session.id === localStorage.getItem('hala.sessionId');
                      return (
                        <div key={session.id} className="flex items-center justify-between gap-3 p-2.5 bg-white border border-slate-100 rounded-xl">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-lg bg-slate-50 text-slate-400">
                              {session.platform === 'desktop' ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-slate-800 truncate">{session.deviceName}</span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase rounded-md">
                                    {isRtl ? 'هذا الجهاز' : 'Current'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-400 truncate max-w-[120px]">
                                {session.userAgent}
                              </p>
                            </div>
                          </div>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleRevokeSession(session.id)}
                              className="text-[9px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              {isRtl ? 'تسجيل خروج' : 'Log out'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Voice Message Privacy & Safety Setting */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-teal-100 text-[#087F75]">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          {isRtl ? 'تقييد الرسائل الصوتية' : 'Restrict Incoming Voice Messages'}
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          {isRtl
                            ? 'منع تشغيل الصوتيات تلقائياً ويتطلب تأكيداً يدوياً قبل التشغيل'
                            : 'Prevents automatic voice playback and requires manual confirmation'}
                        </p>
                      </div>
                    </div>

                    {/* Toggle Button */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!profile.id) return;
                        const nextVal = !profile.restrictVoiceMessages;
                        try {
                          const firestore = getFirebaseDb();
                          const userRef = doc(firestore, 'users', profile.id);
                          await updateDoc(userRef, {
                            restrictVoiceMessages: nextVal,
                            restrict_voice_messages: nextVal,
                          });
                          if (onUserProfileUpdated) {
                            onUserProfileUpdated({ ...profile, restrictVoiceMessages: nextVal });
                          } else {
                            profile.restrictVoiceMessages = nextVal;
                          }
                          showToast(
                            nextVal
                              ? (isRtl ? 'تم تفعيل تقييد الرسائل الصوتية بنجاح' : 'Voice message restriction enabled')
                              : (isRtl ? 'تم إلغاء تقييد الرسائل الصوتية' : 'Voice message restriction disabled')
                          );
                        } catch (err) {
                          console.warn('Failed to update voice restriction:', err);
                          showToast(isRtl ? 'فشل حفظ الإعداد' : 'Failed to save setting');
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        profile.restrictVoiceMessages ? 'bg-[#087F75]' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={Boolean(profile.restrictVoiceMessages)}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          profile.restrictVoiceMessages ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Auto-Transcribe Voice Messages Setting */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-teal-100 text-[#087F75]">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <h4 className="text-xs font-bold text-slate-900">
                          {isRtl ? 'النسخ التلقائي للرسائل الصوتية' : 'Auto-Transcribe Voice Messages'}
                        </h4>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          {isRtl
                            ? 'تحويل الرسائل الصوتية الواردة إلى نص وترجمتها تلقائياً باستخدام الذكاء الاصطناعي'
                            : 'Automatically transcribe and translate incoming voice notes using AI'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!profile.id) return;
                        const nextVal = !profile.autoTranscribeVoice;
                        try {
                          const firestore = getFirebaseDb();
                          const userRef = doc(firestore, 'users', profile.id);
                          await updateDoc(userRef, {
                            autoTranscribeVoice: nextVal,
                            auto_transcribe_voice: nextVal,
                          });
                          if (onUserProfileUpdated) {
                            onUserProfileUpdated({ ...profile, autoTranscribeVoice: nextVal });
                          } else {
                            profile.autoTranscribeVoice = nextVal;
                          }
                          showToast(
                            nextVal
                              ? (isRtl ? 'تم تفعيل النسخ التلقائي' : 'Auto-transcription enabled')
                              : (isRtl ? 'تم إلغاء النسخ التلقائي' : 'Auto-transcription disabled')
                          );
                        } catch (err) {
                          console.warn('Failed to update transcription setting:', err);
                          showToast(isRtl ? 'فشل حفظ الإعداد' : 'Failed to save setting');
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        profile.autoTranscribeVoice ? 'bg-[#087F75]' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={Boolean(profile.autoTranscribeVoice)}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          profile.autoTranscribeVoice ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
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
                          ? 'border-[#087F75] bg-[#087F75]/10 text-[#087F75] shadow-2xs'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>العربية</span>
                      {language === 'ar' && <CheckCircle2 className="w-3.5 h-3.5 text-[#087F75]" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onLanguageChange('en')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        language === 'en'
                          ? 'border-[#087F75] bg-[#087F75]/10 text-[#087F75] shadow-2xs'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>English</span>
                      {language === 'en' && <CheckCircle2 className="w-3.5 h-3.5 text-[#087F75]" />}
                    </button>
                  </div>
                </div>


                {/* App Brand & Version Card */}
                <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <img src="/icons/icon-192.png" alt="Hala" className="w-11 h-11 rounded-2xl shadow-xs border border-teal-600/20 shrink-0" />
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                      {isRtl ? 'تطبيق هلا' : 'Hala Messenger'}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-mono">
                      v2.1.0 · {isRtl ? 'محادثات ومكالمات آمنة' : 'Secure Calls & Chat'}
                    </p>
                  </div>
                </div>

                {/* Test Version Notice */}
                <TestVersionBanner language={language} variant="card" />

                {/* PWA App Installation */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    {isRtl ? 'تطبيق الهاتف (PWA)' : 'Mobile App (PWA)'}
                  </span>
                  <PWAInstallButton language={language} variant="settings" />
                </div>

                <AppearanceSettings isRtl={isRtl} />

                <p className="text-xs text-slate-600 border-t border-slate-100 pt-3">
                  {isRtl ? 'الترجمة التلقائية متوقفة. لا تُرسل رسائلك الخاصة إلى خدمات الذكاء الاصطناعي.' : 'Automatic translation is off. Your private messages are not sent to AI services.'}
                </p>

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
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

