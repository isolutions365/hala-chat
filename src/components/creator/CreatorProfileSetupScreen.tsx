import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { Language } from '../../types';
import {
  CREATOR_USERNAME_REGEX,
  MAX_CREATOR_BIO,
  MAX_CREATOR_DISPLAY_NAME,
  MAX_CREATOR_USERNAME,
  createCreatorProfile,
  isCreatorUsernameAvailable,
  normalizeCreatorUsername,
  updateCreatorProfile,
  uploadCreatorAvatar,
  type CreatorProfile,
} from '../../services/creatorProfiles';

interface CreatorProfileSetupScreenProps {
  currentUserId: string;
  chatAvatarUrl?: string | null;
  existingProfile?: CreatorProfile | null;
  language: Language;
  onCancel?: () => void;
  onSaved: (profile: CreatorProfile) => void;
}

export const CreatorProfileSetupScreen: React.FC<CreatorProfileSetupScreenProps> = ({
  currentUserId,
  chatAvatarUrl = null,
  existingProfile = null,
  language,
  onCancel,
  onSaved,
}) => {
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const isEditMode = Boolean(existingProfile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Never prefill displayName from phone number; blank for first-time setup
  const [displayName, setDisplayName] = useState<string>(existingProfile?.displayName || '');
  const [username, setUsername] = useState<string>(existingProfile?.username || '');
  const [bio, setBio] = useState<string>(existingProfile?.bio || '');

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    existingProfile ? existingProfile.avatarUrl : chatAvatarUrl || null
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);

  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => {
      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [localObjectUrl]);

  useEffect(() => {
    const normalized = normalizeCreatorUsername(username);
    if (!normalized) {
      setUsernameStatus('idle');
      return;
    }
    if (!CREATOR_USERNAME_REGEX.test(normalized)) {
      setUsernameStatus('invalid');
      return;
    }
    if (existingProfile && normalized === existingProfile.username) {
      setUsernameStatus('available');
      return;
    }

    let cancelled = false;
    setUsernameStatus('checking');
    const timer = setTimeout(() => {
      void isCreatorUsernameAvailable(normalized, currentUserId)
        .then((ok) => {
          if (!cancelled) {
            setUsernameStatus(ok ? 'available' : 'taken');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setUsernameStatus('idle');
          }
        });
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, currentUserId, existingProfile]);

  const handleAvatarFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg(
        isRtl ? 'يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP).' : 'Please select a valid image file.'
      );
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(isRtl ? 'يجب أن يكون حجم الصورة أقل من 10 ميغابايت.' : 'Image must be under 10 MB.');
      e.target.value = '';
      return;
    }
    setErrorMsg('');
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
    }
    const objUrl = URL.createObjectURL(file);
    setLocalObjectUrl(objUrl);
    setAvatarFile(file);
    setAvatarPreviewUrl(objUrl);
  };

  const handleUseChatAvatar = () => {
    if (!chatAvatarUrl) return;
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
      setLocalObjectUrl(null);
    }
    setAvatarFile(null);
    setAvatarPreviewUrl(chatAvatarUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAvatar = () => {
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
      setLocalObjectUrl(null);
    }
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUsernameChange = (raw: string) => {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX_CREATOR_USERNAME);
    setUsername(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const cleanName = displayName.trim();
    if (!cleanName) {
      setErrorMsg(isRtl ? 'يرجى إدخال اسم العرض.' : 'Please enter a display name.');
      return;
    }

    const normalizedUser = normalizeCreatorUsername(username);
    if (normalizedUser && !CREATOR_USERNAME_REGEX.test(normalizedUser)) {
      setErrorMsg(
        isRtl
          ? 'اسم المستخدم يجب أن يكون بين 3 و30 حرفاً (أحرف إنجليزية صغيرة وأرقام و _ فقط).'
          : 'Username must be 3–30 characters using lowercase a-z, 0-9, and _.'
      );
      return;
    }
    if (usernameStatus === 'taken') {
      setErrorMsg(isRtl ? 'اسم المستخدم هذا مستخدم بالفعل.' : 'That username is already taken.');
      return;
    }

    setErrorMsg('');
    setIsSaving(true);

    const formatErrorWithCode = (err: any, fallback: string) => {
      const code = typeof err?.code === 'string' ? err.code : '';
      const msg = typeof err?.message === 'string' ? err.message : '';
      if (code && msg && !msg.includes(code)) return `${msg} (${code})`;
      if (msg) return msg;
      if (code) return `${fallback} (${code})`;
      return fallback;
    };

    try {
      let finalAvatarUrl = avatarPreviewUrl;
      if (avatarFile) {
        try {
          finalAvatarUrl = await uploadCreatorAvatar(currentUserId, avatarFile);
        } catch (err: any) {
          setErrorMsg(
            formatErrorWithCode(
              err,
              isRtl ? 'تعذر رفع صورة الملف التعريفي.' : 'Failed to upload profile avatar.'
            )
          );
          setIsSaving(false);
          return;
        }
      }

      const payload = {
        displayName: cleanName,
        username: normalizedUser,
        avatarUrl: finalAvatarUrl,
        bio: bio.trim().slice(0, MAX_CREATOR_BIO),
      };

      const saved = isEditMode
        ? await updateCreatorProfile(currentUserId, payload)
        : await createCreatorProfile(currentUserId, payload);

      onSaved(saved);
    } catch (err: any) {
      setErrorMsg(
        formatErrorWithCode(
          err,
          isRtl ? 'تعذر حفظ الملف التعريفي. حاول مرة أخرى.' : 'Could not save creator profile. Please try again.'
        )
      );
      setIsSaving(false);
    }
  };

  const isReusingChatAvatar = Boolean(chatAvatarUrl && !avatarFile && avatarPreviewUrl === chatAvatarUrl);

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-50 text-slate-900 overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <header className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onCancel && (
            <button
              type="button"
              disabled={isSaving}
              onClick={onCancel}
              aria-label={isRtl ? 'رجوع' : 'Back'}
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-base font-bold text-[#112330] truncate">
            {isEditMode
              ? isRtl
                ? 'تعديل ملف المبدع'
                : 'Edit Creator Profile'
              : isRtl
              ? 'إعداد ملفك التعريفي'
              : 'Set up your profile'}
          </h2>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-6 pb-[max(28px,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-md mx-auto space-y-5">
          {!isEditMode && (
            <div className="rounded-2xl bg-teal-50/90 border border-[#087F75]/20 p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#087F75] text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-bold text-[#112330]">
                  {isRtl ? 'هوية عامة مستقلة للريلز والمجتمع' : 'Separate public creator identity'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isRtl
                    ? 'ملفك هنا منفصل تماماً عن دردشاتك الخاصة ولا يظهر رقم هاتفك أو جهات اتصالك أبداً.'
                    : 'Your Reels and Community profile is separate from private chats. Phone number and contacts are never shown.'}
                </p>
              </div>
            </div>
          )}

          {/* Avatar Picker */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-[#087F75]/10 border-2 border-[#087F75]/25 text-[#087F75] flex items-center justify-center overflow-hidden shadow-xs">
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt={displayName || 'Creator avatar'}
                    className="w-full h-full object-cover"
                    onError={() => setAvatarPreviewUrl(null)}
                  />
                ) : displayName.trim() ? (
                  <span className="text-2xl font-bold">{displayName.trim().charAt(0).toUpperCase()}</span>
                ) : (
                  <User className="w-10 h-10" />
                )}
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => fileInputRef.current?.click()}
                aria-label={isRtl ? 'رفع صورة جديدة' : 'Upload new photo'}
                className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white flex items-center justify-center shadow-md cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarFilePicked}
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
              {chatAvatarUrl && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleUseChatAvatar}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                    isReusingChatAvatar
                      ? 'bg-teal-50 border-[#087F75] text-[#087F75]'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isReusingChatAvatar && <Check className="w-3.5 h-3.5" />}
                  <span>{isRtl ? 'استخدام صورة الدردشة' : 'Reuse chat avatar'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving}
                onClick={() => fileInputRef.current?.click()}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  avatarFile
                    ? 'bg-teal-50 border-[#087F75] text-[#087F75]'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{isRtl ? 'رفع صورة جديدة' : 'Upload new photo'}</span>
              </button>

              {avatarPreviewUrl && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleRemoveAvatar}
                  aria-label={isRtl ? 'إزالة الصورة' : 'Remove avatar'}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'إزالة' : 'Remove'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Profile Fields */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700">
                {isRtl ? 'اسم العرض' : 'Display name'}{' '}
                <span className="text-rose-600">*</span>
              </span>
              <input
                type="text"
                required
                dir="auto"
                maxLength={MAX_CREATOR_DISPLAY_NAME}
                disabled={isSaving}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={isRtl ? 'أدخل اسمك العام…' : 'Choose your public display name…'}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-[#087F75]"
              />
            </label>

            <div className="space-y-1.5">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700">
                  {isRtl ? 'اسم المستخدم (اختياري)' : 'Username (optional)'}
                </span>
                <div className="relative flex items-center">
                  <AtSign
                    className={`w-4 h-4 text-slate-400 absolute ${
                      isRtl ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={MAX_CREATOR_USERNAME}
                    disabled={isSaving}
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="creator_handle"
                    className={`w-full min-h-[44px] ${
                      isRtl ? 'pr-10 pl-3.5' : 'pl-10 pr-3.5'
                    } py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-[#087F75]`}
                  />
                </div>
              </label>

              {username && (
                <p
                  className={`text-xs font-medium ${
                    usernameStatus === 'available'
                      ? 'text-emerald-700'
                      : usernameStatus === 'taken' || usernameStatus === 'invalid'
                      ? 'text-rose-600'
                      : 'text-slate-500'
                  }`}
                >
                  {usernameStatus === 'checking'
                    ? isRtl
                      ? 'جارٍ التحقق من التوفر…'
                      : 'Checking availability…'
                    : usernameStatus === 'available'
                    ? isRtl
                      ? 'اسم المستخدم متاح'
                      : 'Username is available'
                    : usernameStatus === 'taken'
                    ? isRtl
                      ? 'اسم المستخدم محجوز بالفعل'
                      : 'Username is already taken'
                    : usernameStatus === 'invalid'
                    ? isRtl
                      ? 'استخدم 3–30 حرفاً (a-z، 0-9، _ فقط)'
                      : 'Use 3–30 characters (a-z, 0-9, _ only)'
                    : ''}
                </p>
              )}
            </div>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {isRtl ? 'نبذة تعريفية (اختياري)' : 'Bio (optional)'}
                </span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {bio.length}/{MAX_CREATOR_BIO}
                </span>
              </div>
              <textarea
                rows={3}
                dir="auto"
                maxLength={MAX_CREATOR_BIO}
                disabled={isSaving}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={
                  isRtl ? 'أخبر الآخرين عن اهتماماتك ومحتواك…' : 'Tell people what you share…'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:bg-white focus:border-[#087F75] resize-none"
              />
            </label>
          </div>

          {errorMsg && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-semibold text-rose-700"
            >
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || !displayName.trim() || usernameStatus === 'taken' || usernameStatus === 'invalid'}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#087F75] hover:bg-[#06685F] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-[#087F75]/20 transition-colors cursor-pointer"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {isEditMode
                ? isRtl
                  ? 'حفظ التعديلات'
                  : 'Save Profile'
                : isRtl
                ? 'إنشاء الملف والمتابعة'
                : 'Save & Continue'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
