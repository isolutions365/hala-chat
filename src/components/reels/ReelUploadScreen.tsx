import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Film, Loader2, Scissors, Upload, X } from 'lucide-react';
import { Language } from '../../types';
import {
  MAX_REEL_CAPTION_LENGTH,
  MAX_REEL_DURATION_SECONDS,
  MAX_REEL_FILE_SIZE_BYTES,
  publishReel,
} from '../../services/reels';

interface ReelUploadScreenProps {
  language: Language;
  onBack: () => void;
  onPublished: () => void;
}

function formatDurationSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function captureThumbnailAtTime(video: HTMLVideoElement, seekSec: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    const scale = Math.min(1, 540 / Math.max(width, 1));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const drawFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, targetW, targetH);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
      } catch {
        resolve(null);
      }
    };

    if (Math.abs(video.currentTime - seekSec) < 0.15 && video.readyState >= 2) {
      drawFrame();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      drawFrame();
    };
    const onSeeked = () => finish();

    video.addEventListener('seeked', onSeeked, { once: true });
    setTimeout(finish, 700);
    try {
      video.currentTime = seekSec;
    } catch {
      finish();
    }
  });
}

export const ReelUploadScreen: React.FC<ReelUploadScreenProps> = ({
  language,
  onBack,
  onPublished,
}) => {
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [caption, setCaption] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (!videoFile) {
      setPreviewUrl('');
      setVideoDuration(0);
      setTrimStart(0);
      setTrimEnd(0);
      return;
    }
    const objectUrl = URL.createObjectURL(videoFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;

    if (!chosen.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(chosen.name)) {
      setErrorMessage(isRtl ? 'يرجى اختيار ملف فيديو صالح.' : 'Please choose a valid video file.');
      e.target.value = '';
      return;
    }
    if (chosen.size <= 0 || chosen.size > MAX_REEL_FILE_SIZE_BYTES) {
      setErrorMessage(
        isRtl
          ? 'حجم الفيديو يجب أن يكون أقل من 100 ميغابايت.'
          : 'Video file must be under 100 MB.'
      );
      e.target.value = '';
      return;
    }

    setErrorMessage('');
    setVideoFile(chosen);
  };

  const handleLoadedMetadata = () => {
    const video = previewVideoRef.current;
    if (!video) return;
    const rawDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const roundedDur = Math.max(0.5, Number(rawDur.toFixed(1)));
    setVideoDuration(roundedDur);
    setTrimStart(0);
    setTrimEnd(Math.min(roundedDur, MAX_REEL_DURATION_SECONDS));
  };

  const handlePreviewTimeUpdate = () => {
    const video = previewVideoRef.current;
    if (!video || trimEnd <= trimStart) return;
    if (video.currentTime >= trimEnd || video.currentTime < trimStart) {
      video.currentTime = trimStart;
    }
  };

  const handleStartChange = (nextStartRaw: number) => {
    const nextStart = Math.max(0, Math.min(nextStartRaw, Math.max(0, videoDuration - 1)));
    let nextEnd = trimEnd;
    if (nextEnd <= nextStart) {
      nextEnd = Math.min(videoDuration, nextStart + 1);
    }
    if (nextEnd - nextStart > MAX_REEL_DURATION_SECONDS) {
      nextEnd = Math.min(videoDuration, nextStart + MAX_REEL_DURATION_SECONDS);
    }
    setTrimStart(Number(nextStart.toFixed(1)));
    setTrimEnd(Number(nextEnd.toFixed(1)));
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = nextStart;
    }
  };

  const handleEndChange = (nextEndRaw: number) => {
    const nextEnd = Math.min(videoDuration, Math.max(nextEndRaw, trimStart + 1));
    let nextStart = trimStart;
    if (nextEnd - nextStart > MAX_REEL_DURATION_SECONDS) {
      nextStart = Math.max(0, nextEnd - MAX_REEL_DURATION_SECONDS);
    }
    setTrimStart(Number(nextStart.toFixed(1)));
    setTrimEnd(Number(nextEnd.toFixed(1)));
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = nextStart;
    }
  };

  const clearSelectedVideo = () => {
    if (isPublishing) return;
    setVideoFile(null);
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const selectedDuration = Math.max(0, trimEnd - trimStart);
  const canPublish = Boolean(
    videoFile &&
      !isPublishing &&
      selectedDuration > 0 &&
      selectedDuration <= MAX_REEL_DURATION_SECONDS + 0.05
  );

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !canPublish) return;

    setIsPublishing(true);
    setErrorMessage('');
    setUploadProgress(1);

    try {
      let thumbnailBlob: Blob | null = null;
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        thumbnailBlob = await captureThumbnailAtTime(previewVideoRef.current, trimStart);
      }

      await publishReel({
        file: videoFile,
        thumbnailBlob,
        caption,
        trimStart,
        trimEnd,
        totalDuration: videoDuration,
        onProgress: (p) => setUploadProgress(p),
      });

      onPublished();
    } catch (err: any) {
      setErrorMessage(
        err?.message && !String(err.message).startsWith('{')
          ? err.message
          : isRtl
          ? 'تعذر نشر الريل. تحقق من الاتصال وحاول مجدداً.'
          : 'Could not publish reel. Check your connection and try again.'
      );
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-50 text-slate-900"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <header className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0 pt-[max(14px,env(safe-area-inset-top))] sm:pt-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            disabled={isPublishing}
            onClick={onBack}
            aria-label={isRtl ? 'رجوع' : 'Back'}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[#112330] truncate">
            {isRtl ? 'ريل جديد' : 'New Reel'}
          </h2>
        </div>

        <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          {isRtl ? 'الحد الأقصى 60 ثانية' : '60s max'}
        </span>
      </header>

      <form
        onSubmit={handlePublish}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-lg mx-auto space-y-5">
          {!videoFile ? (
            <label className="block rounded-3xl border-2 border-dashed border-slate-300 bg-white hover:border-[#087F75] transition-colors p-8 text-center cursor-pointer">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#087F75] flex items-center justify-center mx-auto mb-3">
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-[#112330]">
                {isRtl ? 'اختر فيديو للريل' : 'Choose a video for your Reel'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {isRtl
                  ? 'MP4 أو WebM أو MOV · حتى 100 ميغابايت'
                  : 'MP4, WebM, or MOV · Up to 100 MB'}
              </p>
              <span className="inline-flex items-center justify-center mt-4 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] text-white text-xs font-semibold">
                {isRtl ? 'تحديد فيديو' : 'Select Video'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*"
                onChange={handleFileSelected}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="space-y-4">
              {/* Video preview stage */}
              <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/16] max-h-[380px] mx-auto flex items-center justify-center border border-slate-200">
                <video
                  ref={previewVideoRef}
                  src={previewUrl}
                  controls
                  playsInline
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handlePreviewTimeUpdate}
                  className="w-full h-full object-contain"
                />
                {!isPublishing && (
                  <button
                    type="button"
                    onClick={clearSelectedVideo}
                    aria-label={isRtl ? 'إزالة الفيديو' : 'Remove video'}
                    className="absolute top-3 right-3 min-w-[40px] min-h-[40px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Trim Controls (60s limit) */}
              {videoDuration > 0 && (
                <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#112330]">
                      <Scissors className="w-4 h-4 text-[#087F75]" />
                      <span>{isRtl ? 'تحديد المقطع' : 'Trim clip'}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-600 tabular-nums">
                      {formatDurationSeconds(trimStart)} – {formatDurationSeconds(trimEnd)} ·{' '}
                      {Math.round(selectedDuration)}s / {MAX_REEL_DURATION_SECONDS}s
                    </span>
                  </div>

                  {videoDuration > MAX_REEL_DURATION_SECONDS && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      {isRtl
                        ? 'يتجاوز الفيديو 60 ثانية؛ تم تحديد أول 60 ثانية ويمكنك تحريك البداية والنهاية.'
                        : 'Video is longer than 60s. Adjust the start and end sliders to pick up to 60s.'}
                    </p>
                  )}

                  <div className="space-y-2.5">
                    <label className="block text-xs font-medium text-slate-600">
                      <div className="flex justify-between mb-1">
                        <span>{isRtl ? 'البداية' : 'Start'}</span>
                        <span className="tabular-nums">{formatDurationSeconds(trimStart)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, videoDuration - 1)}
                        step={0.5}
                        disabled={isPublishing}
                        value={trimStart}
                        onChange={(e) => handleStartChange(Number.parseFloat(e.target.value))}
                        className="w-full accent-[#087F75] cursor-pointer"
                      />
                    </label>

                    <label className="block text-xs font-medium text-slate-600">
                      <div className="flex justify-between mb-1">
                        <span>{isRtl ? 'النهاية' : 'End'}</span>
                        <span className="tabular-nums">{formatDurationSeconds(trimEnd)}</span>
                      </div>
                      <input
                        type="range"
                        min={Math.min(videoDuration, trimStart + 1)}
                        max={videoDuration}
                        step={0.5}
                        disabled={isPublishing}
                        value={trimEnd}
                        onChange={(e) => handleEndChange(Number.parseFloat(e.target.value))}
                        className="w-full accent-[#087F75] cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Caption */}
              <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                <label className="block text-xs font-bold text-[#112330]">
                  {isRtl ? 'الوصف' : 'Caption'}
                  <textarea
                    rows={3}
                    dir="auto"
                    maxLength={MAX_REEL_CAPTION_LENGTH}
                    disabled={isPublishing}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder={isRtl ? 'اكتب وصفاً للريل…' : 'Write a caption for your reel…'}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-[#087F75] resize-y"
                  />
                </label>
                <div className="text-xs text-slate-500 tabular-nums text-end">
                  {caption.length}/{MAX_REEL_CAPTION_LENGTH}
                </div>
              </div>
            </div>
          )}

          {/* Upload progress bar */}
          {isPublishing && (
            <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#112330]">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#087F75]" />
                  {isRtl ? 'جارٍ رفع ونشر الريل…' : 'Uploading and publishing Reel…'}
                </span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-[#087F75] transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {errorMessage && (
            <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {errorMessage}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={isPublishing}
              onClick={onBack}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!canPublish}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadProgress}%</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>{isRtl ? 'نشر الريل' : 'Publish Reel'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
