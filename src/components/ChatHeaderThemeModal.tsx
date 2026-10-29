import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Check,
  RotateCcw,
  Loader2,
  Palette,
  ArrowLeft,
  ArrowRight,
  Lock,
  Video,
  Phone,
  MoreVertical,
  Sun,
  Moon,
  Layers,
} from 'lucide-react';
import { Language, ChatModel } from '../types';
import {
  HEADER_THEME_PRESETS,
  extractHeaderThemeValue,
  extractWallpaperValue,
  combineWallpaperAndHeaderTheme,
  resolveHeaderTheme,
} from '../lib/wallpaperPresets';
import { updateChatHeaderTheme } from '../lib/firebase';

interface ChatHeaderThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  chat: ChatModel;
  currentUserId: string;
  chatTitle: string;
  chatAvatar?: string | null;
  onHeaderThemeChanged?: (newThemeId: string, combinedWallpaperValue: string | null) => void;
}

export const ChatHeaderThemeModal: React.FC<ChatHeaderThemeModalProps> = ({
  isOpen,
  onClose,
  language,
  chat,
  currentUserId,
  chatTitle,
  chatAvatar,
  onHeaderThemeChanged,
}) => {
  const isRtl = language === 'ar';

  const rawValue =
    chat.headerThemeBy?.[currentUserId] ||
    chat.wallpaperBy?.[currentUserId] ||
    chat.headerTheme ||
    chat.wallpaper ||
    'default';

  const initialHeaderTheme = extractHeaderThemeValue(rawValue, chat.id, currentUserId);

  const [selectedThemeId, setSelectedThemeId] = useState<string>(initialHeaderTheme);
  const [activeTab, setActiveTab] = useState<'all' | 'vibrant' | 'light' | 'dark'>('all');
  const [isSaving, setIsSaving] = useState(false);

  const filteredPresets = HEADER_THEME_PRESETS.filter((p) => {
    if (activeTab === 'all') return true;
    return p.category === activeTab;
  });

  const activePreset = resolveHeaderTheme(selectedThemeId, chat.id, currentUserId);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const currentRawWallpaper = chat.wallpaperBy?.[currentUserId] || chat.wallpaper || 'default';
      await updateChatHeaderTheme({
        chatId: chat.id,
        userId: currentUserId,
        headerTheme: selectedThemeId,
        currentRawWallpaper,
      });

      const cleanWp = extractWallpaperValue(currentRawWallpaper);
      const combined = combineWallpaperAndHeaderTheme(cleanWp, selectedThemeId);
      onHeaderThemeChanged?.(selectedThemeId, combined);
      onClose();
    } catch (err) {
      console.error('Failed to save header theme:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-50 via-white to-teal-50/40 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#087F75]/10 text-[#087F75] flex items-center justify-center font-bold">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                {isRtl ? 'مظهر ترويسة المحادثة (Header Theme)' : 'Chat Header Theme'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isRtl
                  ? 'اختر لون ومظهر شريط المحادثة العلوي مع نص واضح ومقروء'
                  : 'Customize the top chat bar with high-contrast legible text'}
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
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Live Header Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                {isRtl ? 'معاينة مباشرة للترويسة ووضوح النص' : 'Live Header & Text Legibility Preview'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedThemeId('default')}
                className="text-xs text-[#087F75] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRtl ? 'استعادة الافتراضي' : 'Reset Default'}</span>
              </button>
            </div>

            {/* Simulated Header Bar */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md">
              <div
                style={activePreset.style}
                className={`px-4 py-3.5 border-b ${activePreset.borderClass} flex items-center justify-between transition-all duration-300`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${activePreset.iconBtnClass}`}
                  >
                    {isRtl ? <ArrowRight className="w-4.5 h-4.5" /> : <ArrowLeft className="w-4.5 h-4.5" />}
                  </div>

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#087F75] to-teal-400 text-white font-bold flex items-center justify-center text-sm overflow-hidden shadow-xs border border-white/30">
                      {chatAvatar ? (
                        <img src={chatAvatar} alt={chatTitle} className="w-full h-full object-cover" />
                      ) : (
                        <span>{(chatTitle || 'H').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full ${activePreset.onlineDotClass}`}
                    />
                  </div>

                  {/* Title & Subtitle */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className={`font-extrabold text-sm truncate leading-tight ${activePreset.titleClass}`}>
                        {chatTitle || (isRtl ? 'محادثة هلا' : 'Hala Chat')}
                      </h4>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-0.5 ${activePreset.badgeClass}`}
                      >
                        <Lock className="w-2.5 h-2.5" />
                        <span>{isRtl ? 'خاصة' : 'Private'}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs truncate mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activePreset.onlineDotClass}`} />
                      <span className={activePreset.onlineTextClass}>
                        {isRtl ? 'متصل الآن' : 'Online'}
                      </span>
                      <span className={activePreset.subtitleClass}>•</span>
                      <span className={`truncate ${activePreset.subtitleClass}`}>
                        {isRtl ? 'نص واضح ومقروء' : 'Clear legible text'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Simulated Right Action Icons */}
                <div className="flex items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activePreset.iconBtnClass}`}>
                    <Video className="w-4 h-4" />
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activePreset.iconBtnClass}`}>
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activePreset.iconBtnClass}`}>
                    <MoreVertical className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', labelEn: 'All Themes', labelAr: 'الكل', icon: Layers },
              { id: 'vibrant', labelEn: 'Vibrant', labelAr: 'ملون بارز', icon: Palette },
              { id: 'light', labelEn: 'Light', labelAr: 'فاتح', icon: Sun },
              { id: 'dark', labelEn: 'Dark', labelAr: 'داكن', icon: Moon },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-[#087F75] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{isRtl ? tab.labelAr : tab.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Presets Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredPresets.map((preset) => {
              const isSelected = selectedThemeId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedThemeId(preset.id)}
                  className={`group relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer text-start flex flex-col ${
                    isSelected
                      ? 'border-[#087F75] ring-2 ring-[#087F75]/20 shadow-md scale-[1.01]'
                      : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  {/* Mini Header Swatch with Sample Text */}
                  <div
                    className="w-full h-16 px-3 py-2 flex flex-col justify-center relative"
                    style={preset.style}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-extrabold truncate ${preset.titleClass}`}>
                        {isRtl ? 'عنوان المحادثة' : 'Chat Title'}
                      </span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-white text-[#087F75] flex items-center justify-center shadow-md shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${preset.onlineDotClass}`} />
                      <span className={`text-[10px] truncate ${preset.subtitleClass}`}>
                        {isRtl ? 'متصل الآن' : 'Online'}
                      </span>
                    </div>
                  </div>

                  {/* Label Footer */}
                  <div className="w-full px-3 py-2 bg-white border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-800 truncate">
                      {isRtl ? preset.nameAr : preset.nameEn}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        preset.isDark
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {preset.isDark ? (isRtl ? 'نص أبيض' : 'White Text') : (isRtl ? 'نص داكن' : 'Dark Text')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{isRtl ? 'حفظ مظهر الترويسة' : 'Apply Header Theme'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
