import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Send, ChevronLeft, ChevronRight, Square, Play, Pause, AlertCircle } from 'lucide-react';
import { Language } from '../types';

export interface VoiceMessageRecorderProps {
  language?: Language;
  onSendVoice: (audioBlob: Blob, durationSeconds: number) => void;
  onCancelRecording: () => void;
  slideOffset?: number;
}

export const VoiceMessageRecorder: React.FC<VoiceMessageRecorderProps> = ({
  language = 'ar',
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
  const startTimeRef = useRef<number>(performance.now());
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const isInitializingRef = useRef<boolean>(false);

  // Initialize recording with MediaRecorder & Web Audio API
  const initRecording = async () => {
    if (isInitializingRef.current || (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording')) {
      return;
    }
    isInitializingRef.current = true;
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
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
        },
      });

      streamRef.current = stream;

      // Web Audio API Setup for live frequency & waveform analysis (analyser only, not routed to destination)
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            // Audio visualization must never block MediaRecorder or its duration timer.
            void audioCtx.resume().catch((resumeErr) => {
              console.warn('AudioContext resume note:', resumeErr);
            });
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
              const sampleIndex = Math.min(dataArray.length - 1, Math.floor((i + 1) * 1.8));
              const val = dataArray[sampleIndex] || 0;
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

      // Determine best supported container format with explicit Opus prioritization
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) {
          mimeType = 'audio/mp4;codecs=mp4a.40.2';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorderOptions: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      };
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      // Start the timer from the actual recording start, independently of visualization.
      startTimeRef.current = performance.now();

      // Duration counter based on monotonic clock (performance.now)
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - startTimeRef.current) / 1000);
        setRecordingSeconds(elapsed);
      }, 250);
    } catch (err: any) {
      console.warn('Microphone access denied or failed:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setErrorMessage(
        isDenied
          ? (isRtl ? 'تم رفض إذن الميكروفون. يرجى تفعيله من إعدادات المتصفح.' : 'Microphone access denied. Please enable permission.')
          : (isRtl ? 'تعذر تشغيل الميكروفون' : 'Could not access microphone')
      );
    } finally {
      isInitializingRef.current = false;
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
      previewAudioRef.current.src = '';
      previewAudioRef.current = null;
    }
  };

  // Switch from recording to Preview Mode
  const handleStopToPreview = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    const dur = Math.max(1, Math.round((performance.now() - startTimeRef.current) / 1000));
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

    const duration = Math.max(1, Math.round((performance.now() - startTimeRef.current) / 1000));

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

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (errorMessage) {
    return (
      <div className="flex items-center justify-between gap-3 w-full bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
        <button
          type="button"
          onClick={onCancelRecording}
          className="p-1.5 rounded-full hover:bg-red-100 transition-colors cursor-pointer text-red-600"
          aria-label={isRtl ? 'إغلاق' : 'Close'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center justify-between gap-2 w-full bg-white border border-slate-200 p-2.5 rounded-3xl shadow-lg relative overflow-hidden"
      style={{ transform: slideOffset ? `translateX(${slideOffset}px)` : 'none' }}
    >
      {/* Cancel / Trash Button */}
      <button
        type="button"
        onClick={handleCancel}
        className="p-2.5 rounded-full bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all shrink-0 cursor-pointer"
        title={isRtl ? 'إلغاء التسجيل' : 'Cancel recording'}
        aria-label={isRtl ? 'إلغاء' : 'Cancel'}
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Main Bar: Live Recording vs Preview Mode */}
      {isPreviewMode ? (
        /* Preview Player Mode */
        <div className="flex items-center gap-3 flex-1 px-2 min-w-0">
          <button
            type="button"
            onClick={togglePreviewPlay}
            className="w-9 h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center shrink-0 shadow-sm hover:bg-[#06685F] transition-colors cursor-pointer"
          >
            {isPreviewPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-0.5" />}
          </button>

          {/* Simple Progress Track */}
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#087F75] transition-all duration-100"
                style={{
                  width: `${previewDuration > 0 ? Math.min(100, (previewCurrentTime / previewDuration) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>{formatTimer(Math.floor(previewCurrentTime))}</span>
              <span>{formatTimer(previewDuration)}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Live Recording Waveform & Pulsing Timer */
        <div className="flex items-center gap-3 flex-1 px-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-sm shadow-red-500/50" />
            <span className="font-mono text-xs font-bold text-slate-700 min-w-[36px]">
              {formatTimer(recordingSeconds)}
            </span>
          </div>

          {/* Live Waveform Bars */}
          <div className="flex items-center gap-1 flex-1 h-7 px-1 justify-center overflow-hidden">
            {audioLevels.map((lvl, idx) => (
              <motion.div
                key={idx}
                className="w-1 bg-[#087F75] rounded-full"
                animate={{ height: `${lvl}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              />
            ))}
          </div>

          {/* Slide-to-cancel hint */}
          <div className="hidden sm:flex items-center text-[11px] text-slate-400 font-medium shrink-0 gap-1 select-none">
            {isRtl ? <ChevronRight className="w-3.5 h-3.5 animate-pulse" /> : <ChevronLeft className="w-3.5 h-3.5 animate-pulse" />}
            <span>{isRtl ? 'اسحب للإلغاء' : 'Slide to cancel'}</span>
          </div>
        </div>
      )}

      {/* Action Buttons: Pause/Preview vs Send */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isRecording && !isPreviewMode && (
          <button
            type="button"
            onClick={handleStopToPreview}
            className="p-2.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            title={isRtl ? 'معاينة الصوت' : 'Preview recording'}
            aria-label={isRtl ? 'معاينة' : 'Preview'}
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        )}

        <button
          type="button"
          onClick={handleSend}
          className="w-10 h-10 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md shadow-[#087F75]/30 hover:bg-[#06685F] transition-all cursor-pointer shrink-0"
          title={isRtl ? 'إرسال الرسالة الصوتية' : 'Send voice message'}
          aria-label={isRtl ? 'إرسال' : 'Send'}
        >
          <Send className={`w-4 h-4 ${isRtl ? '-scale-x-100' : ''}`} />
        </button>
      </div>
    </motion.div>
  );
};
