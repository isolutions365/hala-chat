import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Send, ChevronLeft, ChevronRight, Square, Play, Pause, RotateCcw, AlertCircle } from 'lucide-react';
import { Language } from '../types';

interface VoiceRecorderBarProps {
  language: Language;
  onSendVoice: (audioBlob: Blob, durationSeconds: number) => void;
  onCancelRecording: () => void;
  slideOffset?: number;
}

export const VoiceRecorderBar: React.FC<VoiceRecorderBarProps> = ({
  language,
  onSendVoice,
  onCancelRecording,
  slideOffset = 0,
}) => {
  const isRtl = language === 'ar';

  // Recording & State
  const [isRecording, setIsRecording] = useState(true);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([20, 35, 60, 45, 80, 55, 70, 40, 65, 50, 75, 30]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preview Mode State
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const animationFrameRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize recording with Web Audio API
  const initRecording = async () => {
    cleanupAudio();
    setIsRecording(true);
    setIsPreviewMode(false);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setRecordingSeconds(0);
    setErrorMessage(null);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      startTimeRef.current = Date.now();

      // Web Audio API Setup for live frequency & waveform analysis
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }

          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.75;
          source.connect(analyser);
          analyserRef.current = analyser;

          const numBars = 12;
          const updateVisualizer = () => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);

            const levels: number[] = [];
            for (let i = 0; i < numBars; i++) {
              // Sample frequency bands with human speech emphasis
              const sampleIndex = Math.min(dataArray.length - 1, Math.floor((i + 1) * 1.8));
              const val = dataArray[sampleIndex] || 0;
              // Map to height percentage (min 15%, max 100%)
              const normalized = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
              levels.push(normalized);
            }
            setAudioLevels(levels);
            animationFrameRef.current = requestAnimationFrame(updateVisualizer);
          };
          updateVisualizer();
        }
      } catch (analyserErr) {
        console.warn('Web Audio API Analyser initialization note:', analyserErr);
      }

      // Determine best supported container format
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);

      // Duration counter
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone access denied or failed:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setErrorMessage(
        isDenied
          ? (isRtl ? 'تم رفض إذن الميكروفون. يرجى تفعيله من إعدادات المتصفح.' : 'Microphone access denied. Please enable permission.')
          : (isRtl ? 'تعذر تشغيل الميكروفون' : 'Could not access microphone')
      );
    }
  };

  useEffect(() => {
    initRecording();

    return () => {
      cleanupAudio();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  const cleanupAudio = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
  };

  // Switch from recording to Preview Mode
  const handleStopToPreview = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    const dur = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    setPreviewDuration(dur);
    setIsRecording(false);

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      cleanupAudio();

      if (audioBlob.size > 0) {
        const url = URL.createObjectURL(audioBlob);
        setPreviewBlob(audioBlob);
        setPreviewUrl(url);
        setIsPreviewMode(true);
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

    recorder.stop();
  };

  // Immediate Send from recording or preview
  const handleSend = () => {
    if (isPreviewMode && previewBlob) {
      cleanupAudio();
      onSendVoice(previewBlob, previewDuration);
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      onCancelRecording();
      return;
    }

    const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      cleanupAudio();
      if (audioBlob.size > 0) {
        onSendVoice(audioBlob, duration);
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

    recorder.stop();
  };

  // Cancel / Discard
  const handleCancel = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        cleanupAudio();
        onCancelRecording();
      };
      recorder.stop();
    } else {
      cleanupAudio();
      onCancelRecording();
    }
  };

  // Preview Playback Toggle
  const togglePreviewPlay = () => {
    if (!previewUrl) return;

    if (!previewAudioRef.current) {
      const audio = new Audio(previewUrl);
      previewAudioRef.current = audio;

      audio.ontimeupdate = () => {
        setPreviewCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setIsPreviewPlaying(false);
        setPreviewCurrentTime(0);
      };

      audio.onerror = () => {
        setIsPreviewPlaying(false);
      };
    }

    const audio = previewAudioRef.current;
    if (isPreviewPlaying) {
      audio.pause();
      setIsPreviewPlaying(false);
    } else {
      if (audio.ended || audio.currentTime >= previewDuration) {
        audio.currentTime = 0;
      }
      audio.play().then(() => {
        setIsPreviewPlaying(true);
      }).catch(() => {
        setIsPreviewPlaying(false);
      });
    }
  };

  const formatTimer = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = Math.floor(secs % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const cancelOpacity = Math.max(0.15, 1 - Math.abs(slideOffset) / 80);

  // If permission error occurred
  if (errorMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 w-full bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 shadow-md"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-2 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
        >
          {isRtl ? 'إغلاق' : 'Close'}
        </button>
      </motion.div>
    );
  }

  // Preview Mode UI
  if (isPreviewMode) {
    const progressPercent = previewDuration > 0
      ? Math.min(100, (previewCurrentTime / previewDuration) * 100)
      : 0;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="flex items-center justify-between gap-1.5 sm:gap-3 w-full max-w-full bg-slate-900 text-white rounded-2xl px-2.5 sm:px-3.5 py-2 sm:py-2.5 shadow-lg border border-slate-800 overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Discard & Re-record */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title={isRtl ? 'حذف التسجيل' : 'Discard recording'}
          >
            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            onClick={initRecording}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-teal-300 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title={isRtl ? 'إعادة التسجيل' : 'Re-record'}
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePreviewPlay}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md hover:bg-[#06685F] active:scale-95 transition-all cursor-pointer shrink-0"
          title={isPreviewPlaying ? (isRtl ? 'إيقاف مؤقت' : 'Pause') : (isRtl ? 'تشغيل' : 'Play')}
        >
          {isPreviewPlaying ? (
            <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Progress Timeline & Timer */}
        <div className="flex-1 flex flex-col justify-center gap-0.5 sm:gap-1 min-w-0 px-1 sm:px-2 overflow-hidden" dir="ltr">
          <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-400 rounded-full transition-all duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-300 font-mono">
            <span>{formatTimer(isPreviewPlaying ? previewCurrentTime : previewDuration)}</span>
            <span className="text-[9px] sm:text-[10px] text-slate-400 truncate">
              {isRtl ? 'معاينة صوتية' : 'Voice preview'}
            </span>
          </div>
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#087F75] hover:bg-[#06685F] text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
          title={isRtl ? 'إرسال الرسالة الصوتية' : 'Send voice message'}
        >
          <Send className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRtl ? '-scale-x-100' : ''}`} />
        </button>
      </motion.div>
    );
  }

  // Active Live Recording UI
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center justify-between gap-1.5 sm:gap-3 w-full max-w-full bg-teal-50/95 border border-teal-200/90 rounded-2xl px-2.5 sm:px-3.5 py-2 sm:py-2.5 shadow-md overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Recording indicator & timer */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-red-500"></span>
        </span>
        <span className="text-xs font-bold text-teal-900 tracking-wider font-mono min-w-[32px] sm:min-w-[36px]">
          {formatTimer(recordingSeconds)}
        </span>
      </div>

      {/* Real-time Web Audio API Dynamic Frequency Waveform */}
      <div className="flex items-center gap-0.5 sm:gap-1 h-5 sm:h-6 flex-1 min-w-0 max-w-[80px] sm:max-w-[140px] justify-center px-0.5 overflow-hidden" dir="ltr">
        {audioLevels.map((lvl, idx) => (
          <div
            key={idx}
            className="w-0.5 sm:w-1 bg-[#087F75] rounded-full transition-all duration-75 shrink-0"
            style={{
              height: `${lvl}%`,
              opacity: Math.max(0.4, lvl / 100),
            }}
          />
        ))}
      </div>

      {/* Slide to cancel hint */}
      <div
        className="hidden md:flex items-center gap-1 text-slate-500 text-xs font-medium shrink-0 select-none transition-opacity"
        style={{ opacity: cancelOpacity }}
      >
        {isRtl ? (
          <>
            <ChevronRight className="w-4 h-4 animate-pulse text-slate-400" />
            <span>اسحب للإلغاء</span>
          </>
        ) : (
          <>
            <ChevronLeft className="w-4 h-4 animate-pulse text-slate-400" />
            <span>Slide to cancel</span>
          </>
        )}
      </div>

      {/* Action Buttons: Cancel, Pause/Preview, and Direct Send */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleCancel}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-100 transition-colors cursor-pointer shrink-0"
          title={isRtl ? 'إلغاء التسجيل' : 'Cancel recording'}
        >
          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Pause/Review Button */}
        <button
          type="button"
          onClick={handleStopToPreview}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[#087F75] hover:bg-teal-100 transition-colors cursor-pointer shrink-0"
          title={isRtl ? 'معاينة واستماع' : 'Stop & preview'}
        >
          <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" />
        </button>

        {/* Direct Send Button */}
        <button
          type="button"
          onClick={handleSend}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md hover:bg-[#06685F] active:scale-95 transition-all cursor-pointer shrink-0"
          title={isRtl ? 'إرسال الرسالة الصوتية' : 'Send voice note'}
        >
          <Send className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRtl ? '-scale-x-100' : ''}`} />
        </button>
      </div>
    </motion.div>
  );
};
