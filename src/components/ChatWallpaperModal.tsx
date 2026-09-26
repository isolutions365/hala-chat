import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Check,
  Image as ImageIcon,
  Upload,
  Sparkles,
  RotateCcw,
  Loader2,
  CheckCheck,
  Moon,
  Palette,
  Layers,
} from 'lucide-react';
import { Language, ChatModel } from '../types';
import { WALLPAPER_PRESETS, WallpaperPreset, resolveWallpaperStyle } from '../lib/wallpaperPresets';
import { updateChatWallpaper } from '../lib/firebase';
import { compressImage } from '../lib/media';

interface ChatWallpaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  chat: ChatModel;
  currentUserId: string;
  onWallpaperChanged?: (newWallpaper: string | null) => void;
}

export const ChatWallpaperModal: React.FC<ChatWallpaperModalProps> = ({
  isOpen,
  onClose,
  language,
  chat,
  currentUserId,
  onWallpaperChanged,
}) => {
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial current wallpaper
  const initialWallpaper =
    chat.wallpaperBy?.[currentUserId] || chat.wallpaper || 'default';

  const [selectedWallpaper, setSelectedWallpaper] = useState<string>(initialWallpaper);
  const [activeTab, setActiveTab] = useState<'all' | 'pattern' | 'gradient' | 'dark' | 'custom'>('all');
  const [customImageUri, setCustomImageUri] = useState<string | null>(
    initialWallpaper.startsWith('data:') || initialWallpaper.startsWith('http')
      ? initialWallpaper
      : null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filter presets
  const filteredPresets = WALLPAPER_PRESETS.filter((p) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pattern') return p.type === 'pattern';
    if (activeTab === 'gradient') return p.type === 'gradient' || p.type === 'solid';
    if (activeTab === 'dark') return p.type === 'dark';
    return true;
  });

  // Handle custom image selection
  const handleCustomImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const compressed = await compressImage(file, 1200, 1200, 0.82);
      setCustomImageUri(compressed.dataUrl);
      setSelectedWallpaper(compressed.dataUrl);
      setIsUploading(false);
    } catch (err) {
      console.warn('Failed to compress custom wallpaper:', err);
      setIsUploading(false);
    }
  };

  // Handle Save
  const handleSaveWallpaper = async () => {
    setIsSaving(true);
    try {
      const wallpaperToSave = selectedWallpaper === 'default' ? null : selectedWallpaper;
      await updateChatWallpaper({
        chatId: chat.id,
        userId: currentUserId,
        wallpaper: wallpaperToSave,
      });

      onWallpaperChanged?.(wallpaperToSave);
      onClose();
    } catch (err) {
      console.error('Failed to save chat wallpaper:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default
  const handleResetDefault = () => {
    setSelectedWallpaper('default');
    setCustomImageUri(null);
  };

  if (!isOpen) return null;

  const currentPreviewStyle = resolveWallpaperStyle(selectedWallpaper);

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
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-orange-50 via-white to-orange-50/40 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#D85A30]/10 text-[#D85A30] flex items-center justify-center font-bold">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                {isRtl ? 'خلفية المحادثة' : 'Chat Wallpaper'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isRtl
                  ? 'تخصيص مظهر هذه المحادثة وحفظه في حسابك'
                  : 'Customize this conversation background'}
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
          {/* Live Chat Mockup Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                {isRtl ? 'معاينة مباشرة للمحادثة' : 'Live Preview'}
              </span>
              <button
                type="button"
                onClick={handleResetDefault}
                className="text-xs text-[#D85A30] font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isRtl ? 'استعادة الافتراضي' : 'Reset to Default'}</span>
              </button>
            </div>

            <div
              className="w-full h-44 sm:h-48 rounded-2xl border border-slate-200 shadow-inner p-4 flex flex-col justify-between overflow-hidden relative transition-all duration-300"
              style={currentPreviewStyle.style}
            >
              {/* Incoming Bubble Mockup */}
              <div className="flex items-start gap-2 max-w-[80%]">
                <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-[11px] font-bold text-slate-700 shrink-0 shadow-2xs">
                  {chat.name ? chat.name[0]?.toUpperCase() : 'H'}
                </div>
                <div className="bg-white/95 text-slate-800 p-2.5 rounded-2xl rounded-tl-xs shadow-xs text-xs font-medium border border-slate-100/60 leading-relaxed">
                  {isRtl
                    ? 'أهلاً بك! كيف تبدو هذه الخلفية الجديدة؟ ✨'
                    : 'Hey there! How does this new wallpaper look? ✨'}
                  <div className="text-[10px] text-slate-400 mt-1 text-right">10:42 AM</div>
                </div>
              </div>

              {/* Outgoing Bubble Mockup */}
              <div className="flex justify-end">
                <div className="bg-[#D85A30] text-white p-2.5 rounded-2xl rounded-tr-xs shadow-xs text-xs font-medium max-w-[80%] leading-relaxed">
                  {isRtl
                    ? 'تبدو رائعة ومريحة للعين تماماً! 👌'
                    : 'Looks fantastic and very clean! 👌'}
                  <div className="text-[10px] text-white/80 mt-1 flex items-center justify-end gap-1">
                    <span>10:43 AM</span>
                    <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isRtl ? 'الكل' : 'All'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pattern')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'pattern'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isRtl ? 'زخارف وأنماط' : 'Patterns'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gradient')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'gradient'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRtl ? 'تدرجات هادئة' : 'Gradients'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dark')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'dark'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>{isRtl ? 'داكنة' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'custom'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isRtl ? 'صورة مخصصة' : 'Custom'}</span>
            </button>
          </div>

          {/* Presets Grid */}
          {activeTab !== 'custom' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredPresets.map((preset) => {
                const isSelected = selectedWallpaper === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedWallpaper(preset.id)}
                    className={`h-24 rounded-2xl border-2 p-2.5 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden text-left shadow-2xs group hover:scale-[1.02] ${
                      isSelected
                        ? 'border-[#D85A30] ring-2 ring-[#D85A30]/20 shadow-md'
                        : 'border-slate-200/80 hover:border-slate-300'
                    }`}
                    style={preset.style}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md shadow-2xs ${
                          preset.isDark
                            ? 'bg-slate-800/80 text-white'
                            : 'bg-white/80 text-slate-800 border border-slate-200/50'
                        }`}
                      >
                        {isRtl ? preset.nameAr : preset.nameEn}
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-[#D85A30] text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Custom Image Upload Section */
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-slate-300 hover:border-[#D85A30] rounded-2xl flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-orange-50/40 transition-colors cursor-pointer text-center"
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 text-[#D85A30]">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-xs font-bold">
                      {isRtl ? 'جاري ضغط ومعالجة الصورة...' : 'Processing image...'}
                    </span>
                  </div>
                ) : customImageUri ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={customImageUri}
                      alt="Custom preview"
                      className="w-16 h-16 rounded-xl object-cover shadow-sm border border-slate-200"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      {isRtl ? 'اضغط لتغيير الصورة المحددة' : 'Click to change selected photo'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-[#D85A30]">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {isRtl ? 'اختر صورة من جهازك' : 'Choose an image from your device'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {isRtl ? 'يدعم صور PNG, JPG, WebP' : 'Supports PNG, JPG, WebP'}
                      </p>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCustomImage}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSaveWallpaper}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-2xl bg-[#D85A30] hover:bg-[#c44e27] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-[#D85A30]/20 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{isRtl ? 'حفظ الخلفية' : 'Save Wallpaper'}</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
