import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Globe,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Language } from '../../types';
import {
  type CommunityAuthorProfile,
  type CommunityGeoLocation,
  type CommunityPost,
  MAX_COMMUNITY_IMAGE_BYTES,
  MAX_COMMUNITY_POST_TEXT,
  type MyCommunityGroupItem,
  createCommunityPost,
  fetchMyCommunityGroups,
} from '../../services/community';
import { LocationPickerModal } from '../maps/LocationPickerModal';

interface CreateCommunityPostScreenProps {
  currentUser: CommunityAuthorProfile;
  language: Language;
  initialGroupId?: string;
  onBack: () => void;
  onPublished: (post: CommunityPost) => void;
}

export const CreateCommunityPostScreen: React.FC<CreateCommunityPostScreenProps> = ({
  currentUser,
  language,
  initialGroupId = '',
  onBack,
  onPublished,
}) => {
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [myGroups, setMyGroups] = useState<MyCommunityGroupItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroupId);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');

  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [location, setLocation] = useState<CommunityGeoLocation | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setSelectedGroupId(initialGroupId);
  }, [initialGroupId]);

  useEffect(() => {
    let active = true;
    fetchMyCommunityGroups(currentUser.id)
      .then((list) => {
        if (active) setMyGroups(list);
      })
      .catch(() => {
        if (active) setMyGroups([]);
      });
    return () => {
      active = false;
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const handleImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage(isRtl ? 'يرجى اختيار ملف صورة صالح.' : 'Please select a valid image file.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_COMMUNITY_IMAGE_BYTES) {
      setErrorMessage(isRtl ? 'الحد الأقصى لحجم الصورة 10 ميغابايت.' : 'Image size must be under 10 MB.');
      e.target.value = '';
      return;
    }
    setErrorMessage('');
    setImageFile(file);
  };

  const handleAddOption = () => {
    if (pollOptions.length < 4) {
      setPollOptions((prev) => [...prev, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    if (isPublishing) return;
    setErrorMessage('');

    let pollInput: { question: string; options: string[] } | null = null;
    if (showPoll) {
      const cleanedOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (!pollQuestion.trim() || cleanedOpts.length < 2) {
        setErrorMessage(
          isRtl
            ? 'يتطلب الاستطلاع سؤالاً وخيارين على الأقل.'
            : 'Please enter a poll question and at least 2 options.'
        );
        return;
      }
      pollInput = { question: pollQuestion.trim(), options: cleanedOpts };
    }

    if (!text.trim() && !imageFile && !pollInput && !location) {
      setErrorMessage(
        isRtl
          ? 'اكتب نصاً أو أضف صورة أو استطلاعاً أو موقعاً للنشر.'
          : 'Write something, attach a photo, add a poll, or tag a location to publish.'
      );
      return;
    }

    const matchedGroup = myGroups.find((item) => item.group.id === selectedGroupId);
    setIsPublishing(true);
    setUploadProgress(0);

    try {
      const created = await createCommunityPost({
        groupId: matchedGroup ? matchedGroup.group.id : '',
        groupName: matchedGroup ? matchedGroup.group.name : '',
        text,
        imageFile,
        pollInput,
        location,
        authorProfile: currentUser,
        onProgress: setUploadProgress,
      });
      onPublished(created);
    } catch (err: any) {
      setErrorMessage(
        err?.message || (isRtl ? 'تعذر نشر المنشور. حاول مرة أخرى.' : 'Failed to publish post.')
      );
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-50 text-slate-900"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Bar */}
      <header className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0 pt-[max(14px,env(safe-area-inset-top))] sm:pt-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            disabled={isPublishing}
            onClick={onBack}
            aria-label={isRtl ? 'رجوع' : 'Back'}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[#112330] truncate">
            {isRtl ? 'منشور مجتمع جديد' : 'New Community Post'}
          </h2>
        </div>

        <button
          type="button"
          disabled={isPublishing}
          onClick={() => void handlePublish()}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {isPublishing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{isRtl ? 'نشر' : 'Publish'}</span>
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto space-y-4">
          {/* Author + Destination Group Selector */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-700 text-white text-sm font-bold flex items-center justify-center shrink-0 overflow-hidden">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  currentUser.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#112330] truncate">{currentUser.name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  {selectedGroupId ? (
                    <Users className="w-3.5 h-3.5 text-[#087F75] shrink-0" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  )}
                  <select
                    aria-label={isRtl ? 'وجهة النشر' : 'Post destination'}
                    value={selectedGroupId}
                    disabled={isPublishing}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 max-w-full cursor-pointer"
                  >
                    <option value="">
                      {isRtl ? 'المجتمع العام (الجميع)' : 'Public Community Feed'}
                    </option>
                    {myGroups.map((item) => (
                      <option key={item.group.id} value={item.group.id}>
                        {item.group.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <textarea
              rows={5}
              value={text}
              disabled={isPublishing}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_COMMUNITY_POST_TEXT}
              placeholder={
                isRtl
                  ? 'بماذا تفكر؟ شارك تحديثاً أو سؤالاً مع المجتمع...'
                  : "What's on your mind? Share an update, photo, or question..."
              }
              className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none resize-none leading-relaxed"
            />

            {/* Image Preview */}
            {imagePreviewUrl && (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src={imagePreviewUrl}
                  alt="Attachment preview"
                  className="w-full max-h-[320px] object-cover"
                />
                {!isPublishing && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    aria-label={isRtl ? 'إزالة الصورة' : 'Remove image'}
                    className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Poll Builder */}
            {showPoll && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#112330] flex items-center gap-1.5">
                    <BarChart2 className="w-4 h-4 text-[#087F75]" />
                    <span>{isRtl ? 'استطلاع رأي' : 'Poll'}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={() => setShowPoll(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    {isRtl ? 'إزالة' : 'Remove'}
                  </button>
                </div>

                <input
                  type="text"
                  maxLength={200}
                  disabled={isPublishing}
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder={isRtl ? 'اكتب سؤال الاستطلاع...' : 'Ask a question...'}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30"
                />

                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={120}
                        disabled={isPublishing}
                        value={opt}
                        onChange={(e) =>
                          setPollOptions((prev) =>
                            prev.map((item, i) => (i === idx ? e.target.value : item))
                          )
                        }
                        placeholder={
                          isRtl ? `الخيار ${idx + 1}` : `Option ${idx + 1}`
                        }
                        className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          disabled={isPublishing}
                          onClick={() => handleRemoveOption(idx)}
                          aria-label={isRtl ? 'حذف الخيار' : 'Remove option'}
                          className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {pollOptions.length < 4 && (
                  <button
                    type="button"
                    disabled={isPublishing}
                    onClick={handleAddOption}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold text-[#087F75] hover:bg-teal-50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'إضافة خيار' : 'Add Option'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Tagged Location Chip */}
            {location && (
              <div className="rounded-xl bg-teal-50/80 border border-[#087F75]/25 px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-[#087F75] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#112330] truncate">{location.locationName}</p>
                    <p className="text-[10px] font-mono text-slate-500">
                      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>
                {!isPublishing && (
                  <button
                    type="button"
                    onClick={() => setLocation(null)}
                    aria-label={isRtl ? 'إزالة الموقع' : 'Remove location'}
                    className="p-1.5 rounded-full hover:bg-teal-100 text-slate-500 hover:text-rose-600 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Attachment Toolbar */}
            <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleImagePicked}
              />
              <button
                type="button"
                disabled={isPublishing}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-[#087F75]" />
                <span>{isRtl ? 'صورة' : 'Photo'}</span>
              </button>

              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setShowPoll((prev) => !prev)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                  showPoll
                    ? 'bg-teal-50 text-[#087F75] border border-[#087F75]/30'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                }`}
              >
                <BarChart2 className="w-4 h-4 text-[#087F75]" />
                <span>{isRtl ? 'استطلاع' : 'Poll'}</span>
              </button>

              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setIsLocationPickerOpen(true)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                  location
                    ? 'bg-teal-50 text-[#087F75] border border-[#087F75]/30'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                }`}
              >
                <MapPin className="w-4 h-4 text-[#087F75]" />
                <span>{isRtl ? 'موقع' : 'Location'}</span>
              </button>
            </div>
          </div>

          {/* Upload Progress */}
          {isPublishing && imageFile && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>{isRtl ? 'جاري رفع الصورة...' : 'Uploading photo...'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-[#087F75] transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        language={language}
        title={isRtl ? 'تحديد موقع المنشور' : 'Tag Post Location'}
        confirmLabel={isRtl ? 'استخدام هذا الموقع' : 'Use This Location'}
        onClose={() => setIsLocationPickerOpen(false)}
        onConfirmLocation={(resolved) => {
          setLocation({
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            locationName: resolved.locationName,
          });
        }}
      />
    </div>
  );
};
