import React, { useEffect, useRef, useState } from 'react';
import { Globe, ImagePlus, Loader2, LocateFixed, Lock, MapPin, X } from 'lucide-react';
import { Language } from '../../types';
import {
  type CommunityAuthorProfile,
  type CommunityGeoLocationInput,
  type CommunityGroup,
  askOnceForCreateLocation,
  createCommunityGroup,
  requestCommunityBrowserCoords,
} from '../../services/community';
import { LocationPickerModal } from '../maps/LocationPickerModal';

interface CreateGroupModalProps {
  currentUser: CommunityAuthorProfile;
  language: Language;
  onClose: () => void;
  onCreated: (group: CommunityGroup) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  currentUser,
  language,
  onClose,
  onCreated,
}) => {
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [location, setLocation] = useState<CommunityGeoLocationInput | null>(null);
  const [hasEditedLocation, setHasEditedLocation] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    void askOnceForCreateLocation().then((coords) => {
      if (!active || !coords) return;
      setLocation((prev) => {
        if (prev || hasEditedLocation) return prev;
        return { lat: coords.lat, lng: coords.lng };
      });
    });
    return () => {
      active = false;
    };
  }, [hasEditedLocation]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const created = await createCommunityGroup({
        name,
        description,
        coverFile,
        isPublic,
        location,
        userProfile: currentUser,
        onProgress: setUploadProgress,
      });
      onCreated(created);
    } catch (err: any) {
      setErrorMsg(err?.message || (isRtl ? 'تعذر إنشاء المجموعة.' : 'Failed to create group.'));
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-[#112330] dark:text-slate-100">
            {isRtl ? 'إنشاء مجموعة مجتمع' : 'Create Community Group'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={isRtl ? 'إغلاق' : 'Close'}
            className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Cover Image */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCoverFile(file);
              }}
            />
            {coverPreviewUrl ? (
              <div className="relative h-32 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                <img src={coverPreviewUrl} alt="Group cover" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setCoverFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[72px] rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/80 dark:hover:bg-slate-800 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                <ImagePlus className="w-4 h-4 text-[#087F75] dark:text-teal-400" />
                <span>{isRtl ? 'إضافة صورة غلاف (اختياري)' : 'Add Cover Photo (optional)'}</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isRtl ? 'اسم المجموعة' : 'Group Name'}
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRtl ? 'مثال: مصممو واجهات المستخدم' : 'e.g., Riyadh Coffee & Tech'}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:bg-white dark:focus:bg-slate-900"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isRtl ? 'الوصف' : 'Description'}
            </label>
            <textarea
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isRtl ? 'ما موضوع هذه المجموعة؟' : 'What is this group about?'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:bg-white dark:focus:bg-slate-900 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isRtl ? 'الخصوصية' : 'Privacy'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  isPublic
                    ? 'border-[#087F75] bg-teal-50 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span>{isRtl ? 'عامة (مفتوحة)' : 'Open Group'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  !isPublic
                    ? 'border-[#087F75] bg-teal-50 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>{isRtl ? 'للأعضاء فقط' : 'Members Only'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {isRtl ? 'موقع المجموعة (اختياري)' : 'Group Location (optional)'}
            </label>
            {location ? (
              <div className="rounded-xl border border-[#087F75]/30 dark:border-teal-700/50 bg-teal-50/70 dark:bg-teal-950/40 px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-[#087F75] dark:text-teal-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#112330] dark:text-slate-100 truncate">
                      {location.locationName || (isRtl ? 'موقعي الحالي' : 'Current location attached')}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      {(location.lat ?? location.latitude ?? 0).toFixed(4)},{' '}
                      {(location.lng ?? location.longitude ?? 0).toFixed(4)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHasEditedLocation(true);
                    setLocation(null);
                  }}
                  aria-label={isRtl ? 'إزالة الموقع' : 'Remove location'}
                  className="p-1.5 rounded-full hover:bg-teal-100 dark:hover:bg-teal-900/60 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setHasEditedLocation(true);
                    void requestCommunityBrowserCoords().then((coords) => {
                      if (coords) setLocation({ lat: coords.lat, lng: coords.lng });
                    });
                  }}
                  className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/80 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <LocateFixed className="w-4 h-4 text-[#087F75] dark:text-teal-400" />
                  <span>{isRtl ? 'إرفاق موقعي' : 'Use My Location'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="min-h-[44px] px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/80 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-[#087F75] dark:text-teal-400" />
                  <span>{isRtl ? 'اختر على الخريطة' : 'Pick on Map'}</span>
                </button>
              </div>
            )}
          </div>

          {isSubmitting && coverFile && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#087F75] transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">{uploadProgress}%</p>
            </div>
          )}

          {errorMsg && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl px-3 py-2">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isRtl ? 'إنشاء المجموعة' : 'Create Group'}</span>
          </button>
        </div>
      </form>

      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        language={language}
        title={isRtl ? 'موقع المجموعة' : 'Set Group Location'}
        confirmLabel={isRtl ? 'حفظ الموقع' : 'Save Location'}
        onClose={() => setIsLocationPickerOpen(false)}
        onConfirmLocation={(resolved) => {
          setHasEditedLocation(true);
          setLocation({
            lat: resolved.latitude,
            lng: resolved.longitude,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            locationName: resolved.locationName,
          });
        }}
      />
    </div>
  );
};
