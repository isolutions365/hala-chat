import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Trash2,
  Send,
  RefreshCw,
  Square,
  Play,
  Pause,
  AlertCircle,
  Video as VideoIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Language } from '../types';

export interface VideoMessageRecorderProps {
  language?: Language;
  onSendVideo: (videoBlob: Blob, durationSeconds: number) => void;
  onCancelRecording: () => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  slideOffset?: number;
}

const MAX_VIDEO_NOTE_SECONDS = 60;

function pickSupportedVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

export const VideoMessageRecorder: React.FC<VideoMessageRecorderProps> = ({
  language = 'ar',
  onSendVideo,
  onCancelRecording,
  onRecordingStateChange,
  slideOffset = 0,
}) => {
  const isRtl = language === 'ar';

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isRecording, setIsRecording] = useState(true);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  // Preview state
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(performance.now());
  const isInitializingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const reportedRecordingRef = useRef<boolean>(false);
  const previewUrlRef = useRef<string | null>(null);
  const handleStopToPreviewRef = useRef<() => void>(() => {});
  const isFinalizingRef = useRef<boolean>(false);

  const notifyRecordingState = useCallback(
    (active: boolean) => {
      if (reportedRecordingRef.current !== active) {
        reportedRecordingRef.current = active;
        onRecordingStateChange?.(active);
      }
    },
    [onRecordingStateChange]
  );

  const stopTracksAndTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, []);

  const requestVideoStream = async (targetFacing: 'user' | 'environment'): Promise<MediaStream> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API is unavailable in this browser');
    }

    const attempts: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { exact: targetFacing },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      },
      {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: true,
      },
      {
        video: { facingMode: { ideal: targetFacing } },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Could not open camera');
  };

  const startRecordingSession = useCallback(
    async (targetFacing: 'user' | 'environment') => {
      if (isInitializingRef.current) return;
      isInitializingRef.current = true;
      stopTracksAndTimer();

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      setIsRecording(true);
      setIsPreviewMode(false);
      setPreviewBlob(null);
      setPreviewUrl(null);
      setRecordingSeconds(0);
      setErrorMessage(null);
      chunksRef.current = [];

      try {
        const stream = await requestVideoStream(targetFacing);
        if (!isMountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }

        const mimeType = pickSupportedVideoMimeType();
        const recorderOptions: MediaRecorderOptions = {
          ...(mimeType ? { mimeType } : {}),
          videoBitsPerSecond: 1200000,
          audioBitsPerSecond: 96000,
        };

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, recorderOptions);
        } catch {
          recorder = new MediaRecorder(stream);
        }

        mediaRecorderRef.current = recorder;
        startTimeRef.current = performance.now();

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.start(200);
        notifyRecordingState(true);

        timerIntervalRef.current = setInterval(() => {
          const elapsed = Math.floor((performance.now() - startTimeRef.current) / 1000);
          setRecordingSeconds(elapsed);
          if (elapsed >= MAX_VIDEO_NOTE_SECONDS) {
            handleStopToPreviewRef.current();
          }
        }, 200);
      } catch (err: any) {
        notifyRecordingState(false);
        setIsRecording(false);
        const isDenied =
          err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
        setErrorMessage(
          isDenied
            ? isRtl
              ? 'تم رفض إذن الكاميرا أو الميكروفون. يرجى تفعيله من إعدادات المتصفح.'
              : 'Camera or microphone permission denied. Please enable it in browser settings.'
            : isRtl
            ? 'تعذر تشغيل الكاميرا لتسجيل رسالة فيديو.'
            : 'Could not start camera for video message.'
        );
      } finally {
        isInitializingRef.current = false;
        setIsSwitchingCamera(false);
      }
    },
    [isRtl, notifyRecordingState, stopTracksAndTimer]
  );

  const handleStopToPreview = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive' || isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    const dur = Math.max(1, Math.round((performance.now() - startTimeRef.current) / 1000));
    setPreviewDuration(dur);
    setIsRecording(false);
    notifyRecordingState(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    recorder.onstop = () => {
      const rawMime =
        recorder.mimeType ||
        chunksRef.current.find((c) => c.type)?.type ||
        'video/webm';
      const baseMime = rawMime.split(';')[0].trim().toLowerCase() || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: baseMime });
      isFinalizingRef.current = false;
      stopTracksAndTimer();

      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewBlob(blob);
        setPreviewUrl(url);
        setIsPreviewMode(true);
        setIsPreviewPlaying(true);
      } else {
        onCancelRecording();
      }
    };

    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
    } catch {
      // ignore
    }
    try {
      recorder.stop();
    } catch {
      stopTracksAndTimer();
      onCancelRecording();
    }
  }, [notifyRecordingState, onCancelRecording, stopTracksAndTimer]);

  useEffect(() => {
    handleStopToPreviewRef.current = handleStopToPreview;
  }, [handleStopToPreview]);

  useEffect(() => {
    isMountedRef.current = true;
    void startRecordingSession('user');

    return () => {
      isMountedRef.current = false;
      notifyRecordingState(false);
      stopTracksAndTimer();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const handleFlipCamera = async () => {
    if (isInitializingRef.current || isSwitchingCamera || isPreviewMode) return;
    setIsSwitchingCamera(true);
    const nextFacing: 'user' | 'environment' = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    await startRecordingSession(nextFacing);
  };

  const handleSend = () => {
    if (isFinalizingRef.current) return;
    notifyRecordingState(false);

    if (isPreviewMode && previewBlob) {
      isFinalizingRef.current = true;
      stopTracksAndTimer();
      onSendVideo(previewBlob, Math.max(1, previewDuration));
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      stopTracksAndTimer();
      onCancelRecording();
      return;
    }

    isFinalizingRef.current = true;
    const dur = Math.max(1, Math.round((performance.now() - startTimeRef.current) / 1000));
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    recorder.onstop = () => {
      const rawMime =
        recorder.mimeType ||
        chunksRef.current.find((c) => c.type)?.type ||
        'video/webm';
      const baseMime = rawMime.split(';')[0].trim().toLowerCase() || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: baseMime });
      isFinalizingRef.current = false;
      stopTracksAndTimer();
      console.log('[VideoMessageRecorder] Recorded blob ready:', {
        rawMime,
        baseMime,
        sizeBytes: blob.size,
        durationSeconds: dur,
        chunkCount: chunksRef.current.length,
      });
      if (blob.size > 0) {
        onSendVideo(blob, dur);
      } else {
        onCancelRecording();
      }
    };

    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
    } catch {
      // ignore
    }
    try {
      recorder.stop();
    } catch {
      isFinalizingRef.current = false;
      stopTracksAndTimer();
      onCancelRecording();
    }
  };

  const handleCancel = () => {
    notifyRecordingState(false);
    stopTracksAndTimer();
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    onCancelRecording();
  };

  const togglePreviewPlay = () => {
    const vid = previewVideoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().then(() => setIsPreviewPlaying(true)).catch(() => setIsPreviewPlaying(false));
    } else {
      vid.pause();
      setIsPreviewPlaying(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressRatio = Math.min(1, recordingSeconds / MAX_VIDEO_NOTE_SECONDS);
  const ringRadius = 118;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressRatio);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-between p-5 sm:p-8 select-none"
    >
      {/* Top Status Timer */}
      <div className="w-full max-w-md flex items-center justify-center pt-2">
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/55 border border-white/15 text-white shadow-lg">
          {isRecording && !errorMessage ? (
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          ) : (
            <VideoIcon className="w-4 h-4 text-[#0B9488]" />
          )}
          <span className="font-mono text-sm font-bold tabular-nums">
            {formatTimer(isPreviewMode ? previewDuration : recordingSeconds)}
          </span>
          <span className="text-[11px] text-white/60 tabular-nums">
            / {formatTimer(MAX_VIDEO_NOTE_SECONDS)}
          </span>
        </div>
      </div>

      {/* Center Circular Viewfinder or Error Card */}
      <div
        className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-4"
        style={{ transform: slideOffset ? `translateX(${slideOffset}px)` : undefined }}
      >
        {errorMessage ? (
          <div className="w-full max-w-xs rounded-3xl bg-slate-900 border border-rose-500/30 p-6 text-center text-white shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold leading-relaxed">{errorMessage}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void startRecordingSession(facingMode)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold cursor-pointer"
              >
                {isRtl ? 'إعادة المحاولة' : 'Retry'}
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-60 h-60 sm:w-64 sm:h-64 flex items-center justify-center">
            {/* Circular Progress Ring */}
            <svg
              className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
              viewBox="0 0 256 256"
            >
              <circle
                cx="128"
                cy="128"
                r={ringRadius}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="6"
                fill="none"
              />
              {!isPreviewMode && (
                <circle
                  cx="128"
                  cy="128"
                  r={ringRadius}
                  stroke="#0B9488"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  fill="none"
                  className="transition-[stroke-dashoffset] duration-200"
                />
              )}
            </svg>

            {/* Circular Video Container */}
            <div className="w-[220px] h-[220px] sm:w-[232px] sm:h-[232px] rounded-full overflow-hidden bg-black shadow-2xl border-2 border-white/20 relative flex items-center justify-center">
              {isPreviewMode && previewUrl ? (
                <>
                  <video
                    ref={previewVideoRef}
                    src={previewUrl}
                    autoPlay
                    loop
                    playsInline
                    onClick={togglePreviewPlay}
                    className={`w-full h-full object-cover cursor-pointer ${
                      facingMode === 'user' ? '-scale-x-100' : ''
                    }`}
                  />
                  {!isPreviewPlaying && (
                    <button
                      type="button"
                      onClick={togglePreviewPlay}
                      className="absolute inset-0 bg-black/35 flex items-center justify-center cursor-pointer"
                      aria-label={isRtl ? 'تشغيل المعاينة' : 'Play preview'}
                    >
                      <span className="w-14 h-14 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </span>
                    </button>
                  )}
                </>
              ) : (
                <video
                  ref={liveVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? '-scale-x-100' : ''
                  }`}
                />
              )}
            </div>
          </div>
        )}

        {!errorMessage && !isPreviewMode && (
          <div className="mt-5 flex items-center gap-1.5 text-xs text-white/75 font-medium">
            {isRtl ? (
              <ChevronRight className="w-4 h-4 animate-pulse" />
            ) : (
              <ChevronLeft className="w-4 h-4 animate-pulse" />
            )}
            <span>
              {isRtl ? 'اسحب للإلغاء أو أوقف للمعاينة' : 'Slide to cancel or stop to preview'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Controls Capsule */}
      {!errorMessage && (
        <div className="w-full max-w-sm rounded-3xl bg-slate-900/90 border border-white/15 px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
          {/* Cancel */}
          <button
            type="button"
            onClick={handleCancel}
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={isRtl ? 'حذف التسجيل' : 'Discard video'}
            aria-label={isRtl ? 'إلغاء' : 'Cancel'}
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {/* Center Action: Flip Camera & Stop/Preview or Play/Pause */}
          <div className="flex items-center gap-3">
            {!isPreviewMode ? (
              <>
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  disabled={isSwitchingCamera}
                  className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                  title={isRtl ? 'تبديل الكاميرا' : 'Flip camera'}
                  aria-label={isRtl ? 'تبديل الكاميرا' : 'Flip camera'}
                >
                  <RefreshCw className={`w-5 h-5 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleStopToPreview}
                  className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                  title={isRtl ? 'إيقاف ومعاينة' : 'Stop and preview'}
                  aria-label={isRtl ? 'معاينة' : 'Preview'}
                >
                  <Square className="w-5 h-5 fill-current" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={togglePreviewPlay}
                className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                title={isPreviewPlaying ? (isRtl ? 'إيقاف مؤقت' : 'Pause') : (isRtl ? 'تشغيل' : 'Play')}
                aria-label={isPreviewPlaying ? (isRtl ? 'إيقاف مؤقت' : 'Pause') : (isRtl ? 'تشغيل' : 'Play')}
              >
                {isPreviewPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
            )}
          </div>

          {/* Send */}
          <button
            type="button"
            onClick={handleSend}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0B9488] via-[#087F75] to-[#06685F] text-white flex items-center justify-center shadow-lg shadow-[#087F75]/40 hover:brightness-110 transition-all cursor-pointer shrink-0"
            title={isRtl ? 'إرسال رسالة الفيديو' : 'Send video message'}
            aria-label={isRtl ? 'إرسال' : 'Send'}
          >
            <Send className={`w-5 h-5 ${isRtl ? '-scale-x-100 -translate-x-0.5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}
    </motion.div>
  );
};
