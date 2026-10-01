import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Plus, Search, Settings, User, LogOut, CheckCircle2, Sparkles, Globe } from 'lucide-react';
import { Language, UserProfile } from '../types';

interface ChatListPlaceholderProps {
  language: Language;
  profile: UserProfile;
  onLanguageChange: (lang: Language) => void;
  onRestartOnboarding: () => void;
}

export const ChatListPlaceholder: React.FC<ChatListPlaceholderProps> = ({
  language,
  profile,
  onLanguageChange,
  onRestartOnboarding,
}) => {
  const [showToast, setShowToast] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isRtl = language === 'ar';

  const handleFabClick = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full h-full flex flex-col justify-between bg-slate-50 text-slate-900 min-h-[580px] relative overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Header Navigation */}
      <div className="bg-white border-b border-slate-200 px-5 py-4 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* User Avatar */}
            <div className="w-10 h-10 rounded-full bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-base shadow-xs shrink-0">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <span>{profile.name.charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {isRtl ? 'المحادثات' : 'Chats'}
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>{profile.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Language Switcher Button */}
            <button
              type="button"
              onClick={() => onLanguageChange(language === 'ar' ? 'en' : 'ar')}
              className="p-2.5 rounded-full text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isRtl ? 'تغيير اللغة إلى الإنجليزية' : 'Switch language to Arabic'}
            >
              <Globe className="w-5 h-5" />
            </button>

            {/* Settings Modal Toggle */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="p-2.5 rounded-full text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Input Placeholder */}
        <div className="relative">
          <Search className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            placeholder={isRtl ? 'بحث في المحادثات...' : 'Search chats...'}
            className={`w-full h-10 ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'} bg-slate-100 border border-transparent rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-slate-300 transition-all`}
            disabled
          />
        </div>
      </div>

      {/* Settings / Menu Dropdown Drawer */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-20 inset-x-4 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-30"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="font-semibold text-sm text-slate-800">{isRtl ? 'إعدادات الحساب' : 'Account Settings'}</span>
              <span className="text-xs text-[#087F75] bg-[#087F75]/10 px-2 py-0.5 rounded-full font-medium">
                Phase 1 Complete
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 text-slate-600">
                <span>{isRtl ? 'الاسم:' : 'Name:'}</span>
                <span className="font-semibold text-slate-900">{profile.name}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600">
                <span>{isRtl ? 'رقم الهاتف:' : 'Phone:'}</span>
                <span className="font-mono text-slate-900">{profile.country.flag} {profile.phoneNumber}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600">
                <span>{isRtl ? 'حالة التوثيق:' : 'Auth Status:'}</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> OTP Verified
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onRestartOnboarding}
              className="mt-4 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[#087F75]" />
              <span>{isRtl ? 'إعادة تجربة التوثيق (Reset Onboarding)' : 'Restart Onboarding Flow'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Empty State Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[#087F75]/10 text-[#087F75] flex items-center justify-center mb-4">
          <MessageSquare className="w-10 h-10 stroke-[1.5]" />
        </div>

        <h3 className="text-xl font-bold text-slate-800 mb-1">
          {isRtl ? 'لا توجد محادثات بعد' : 'No chats yet'}
        </h3>
        <p className="text-sm text-slate-500 max-w-xs mb-6 leading-relaxed">
          {isRtl
            ? 'ابدأ المحادثة الأولى مع أصدقائك وعائلتك بالضغط على الزر البرتقالي بالأسفل'
            : 'Start your first conversation with friends or family by tapping the button below'}
        </p>

        {/* Onboarding Success Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>{isRtl ? 'اكتمل إعداد الحساب بنجاح!' : 'Onboarding Completed Successfully!'}</span>
        </div>
      </div>

      {/* Interactive Toast Notification when FAB Tapped */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 inset-x-6 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between z-40 text-xs"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#087F75]" />
              <span>{isRtl ? 'جاري البحث عن جهات الاتصال المسجلة في هلاً...' : 'Searching contacts registered in Hala...'}</span>
            </div>
            <span className="text-[#087F75] font-semibold">{isRtl ? 'قريباً' : 'Phase 2'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (FAB) in Solid Coral #087F75 */}
      <div className={`p-6 flex ${isRtl ? 'justify-start' : 'justify-end'}`}>
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={handleFabClick}
          className="w-14 h-14 rounded-full bg-[#087F75] hover:bg-[#06685F] text-white flex items-center justify-center shadow-lg shadow-[#087F75]/30 cursor-pointer transition-colors"
          aria-label={isRtl ? 'محادثة جديدة' : 'Start new chat'}
        >
          <Plus className="w-7 h-7" />
        </motion.button>
      </div>
    </motion.div>
  );
};
