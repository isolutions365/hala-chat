import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Trash2, Send, ChevronLeft, ChevronRight, Mic } from 'lucide-react';
import { Language } from '../types';

interface VoiceRecorderBarProps {
  language: Language;
  onSendVoice: (audioBlob: Blob, durationSeconds: number) => void;
  onCancelRecording: () => void;
  slideOffset: number;
}

export const VoiceRecorderBar: React.FC<VoiceRecorderBarProps> = ({
  language,
  onSendVoice,
  onCancelRecording,
  slideOffset,
}) => {
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([30, 60, 45, 80, 50, 70, 40, 65]);
  const isRtl = language === 'ar';

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const animationFrameRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    let isMounted = true;

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        startTimeRef.current = Date.now();

        // Audio Analyser for live wave animation
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 32;
            source.connect(analyser);
            analyserRef.current = analyser;

            const updateVisualizer = () => {
              if (!analyserRef.current) return;
              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);

              // Sample 8 visualizer bars from frequency data
              const levels: number[] = [];
              for (let i = 0; i < 8; i++) {
                const val = dataArray[i * 2] || 0;
                const normalized = Math.max(15, Math.min(100, (val / 255) * 100));
                levels.push(normalized);
              }
              setAudioLevels(levels);
              animationFrameRef.current = requestAnimationFrame(updateVisualizer);
            };
            updateVisualizer();
          }
        } catch (analyserErr) {
          console.warn('AudioAnalyser not supported, using fallback pulse:', analyserErr);
        }

        // Determine supported audio MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : '';

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start(100);

        // Timer interval
        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err: any) {
        console.error('Microphone access denied or failed:', err);
        alert(
          isRtl
            ? 'يرجى السماح بالوصول إلى الميكروفون لتسجيل الرسائل الصوتية'
            : 'Please grant microphone access to record voice messages'
        );
        onCancelRecording();
      }
    }

    startRecording();

    return () => {
      isMounted = false;
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
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
  };

  const handleStopAndSend = () => {
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
      onSendVoice(audioBlob, duration);
    };

    recorder.stop();
  };

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

  const formatTimer = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  // Calculate slide to cancel opacity based on drag offset
  const cancelOpacity = Math.max(0.2, 1 - Math.abs(slideOffset) / 80);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center justify-between gap-3 w-full bg-red-50/90 border border-red-200/80 rounded-2xl px-4 py-2.5 shadow-md"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Recording indicator & timer */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
        <span className="text-xs font-bold text-red-700 tracking-wider font-mono min-w-[36px]">
          {formatTimer(recordingSeconds)}
        </span>
      </div>

      {/* Live Oscillating Waveform Bars */}
      <div className="flex items-center gap-1 h-6 flex-1 max-w-[120px] justify-center px-1">
        {audioLevels.map((lvl, idx) => (
          <div
            key={idx}
            className="w-1 bg-red-500 rounded-full transition-all duration-75"
            style={{ height: `${lvl}%` }}
          />
        ))}
      </div>

      {/* Slide to cancel hint */}
      <div
        className="flex items-center gap-1 text-slate-500 text-xs font-medium shrink-0 select-none transition-opacity"
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

      {/* Action Buttons: Cancel (Trash) & Send */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleCancel}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
          title={isRtl ? 'إلغاء التسجيل' : 'Cancel recording'}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleStopAndSend}
          className="w-9 h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md hover:bg-[#06685F] active:scale-95 transition-all cursor-pointer"
          title={isRtl ? 'إرسال الرسالة الصوتية' : 'Send voice note'}
        >
          <Send className={`w-4 h-4 ${isRtl ? '-scale-x-100' : ''}`} />
        </button>
      </div>
    </motion.div>
  );
};
