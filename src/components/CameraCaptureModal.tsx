import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Camera,
  RefreshCw,
  Flashlight,
  Check,
  RotateCcw,
  AlertCircle,
  Upload,
  Sparkles,
  CircleStop,
} from 'lucide-react';
import { Language } from '../types';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onPhotoCaptured: (blob: Blob, dataUrl: string, duration?: number) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  language,
  onPhotoCaptured,
}) => {
  const isRtl = language === 'ar';

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedPhotoBlob, setCapturedPhotoBlob] = useState<Blob | null>(null);
  const [capturedDuration, setCapturedDuration] = useState<number | undefined>(undefined);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isFlashing, setIsFlashing] = useState(false);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
  const [selectedResolution, setSelectedResolution] = useState<'480p' | '720p' | '1080p'>('720p');
  const [selectedFps, setSelectedFps] = useState<30 | 60>(30);
  const [supportedResolutions, setSupportedResolutions] = useState<Array<'480p' | '720p' | '1080p'>>(['480p', '720p']);
  const [supports60Fps, setSupports60Fps] = useState(false);
  const [actualCameraMode, setActualCameraMode] = useState('');
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingAudioStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecordingVideo) {
      setRecordingSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [isRecordingVideo]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  // Play synthetic camera shutter sound via Web Audio API
  const playShutterSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {
      // Audio context might be restricted before interaction
    }
  }, []);

  // Stop current active stream
  const stopStream = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    recordingAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingAudioStreamRef.current = null;
    setIsRecordingVideo(false);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Start Camera Stream
  const startCamera = useCallback(
    async (mode: 'user' | 'environment', resolution = selectedResolution, fps = selectedFps) => {
      setIsInitializing(true);
      setCameraError(null);

      // Stop previous tracks
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          isRtl
            ? 'الكاميرا غير مدعومة في هذا المتصفح. يمكنك اختيار صورة من جهازك.'
            : 'Camera access is not supported on this browser. You can select a photo from your device.'
        );
        setIsInitializing(false);
        return;
      }

      try {
        const resolutionTargets = {
          '480p': { width: 854, height: 480 },
          '720p': { width: 1280, height: 720 },
          '1080p': { width: 1920, height: 1080 },
        } as const;
        const target = resolutionTargets[resolution];
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: target.width },
            height: { ideal: target.height },
            frameRate: { ideal: fps, max: fps },
          },
          audio: false,
        });

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Check torch support
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
        const maxWidth = Number((capabilities as any).width?.max || 1280);
        const maxHeight = Number((capabilities as any).height?.max || 720);
        const maxFps = Number((capabilities as any).frameRate?.max || 30);
        const availableResolutions: Array<'480p' | '720p' | '1080p'> = ['480p'];
        if (maxWidth >= 1280 || maxHeight >= 720) availableResolutions.push('720p');
        if (maxWidth >= 1920 || maxHeight >= 1080) availableResolutions.push('1080p');
        setSupportedResolutions(availableResolutions);
        setSupports60Fps(maxFps >= 55);
        const actual = track.getSettings();
        setActualCameraMode(`${actual.width || '?'}×${actual.height || '?'} · ${Math.round(actual.frameRate || fps)} FPS`);
        if ('torch' in capabilities) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
          setIsTorchOn(false);
        }

        setIsInitializing(false);
      } catch (err: any) {
        console.warn('Camera stream error:', err);
        let errorMsg = isRtl
          ? 'تعذر الوصول إلى الكاميرا. يرجى التأكد من منح الإذن.'
          : 'Could not access the camera. Please ensure permissions are granted.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = isRtl
            ? 'تم رفض إذن استخدام الكاميرا. يرجى السماح للتطبيق باستخدام الكاميرا.'
            : 'Camera permission denied. Please allow camera access in browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMsg = isRtl
            ? 'لم يتم العثور على كاميرا في هذا الجهاز.'
            : 'No camera found on this device.';
        }
        setCameraError(errorMsg);
        setIsInitializing(false);
      }
    },
    [isRtl, stream, selectedResolution, selectedFps]
  );

  // Initialize camera when modal opens
  useEffect(() => {
    if (isOpen) {
      setCapturedPhotoUrl(null);
      setCapturedPhotoBlob(null);
      startCamera(facingMode);
    } else {
      stopStream();
      setCapturedPhotoUrl(null);
      setCapturedPhotoBlob(null);
      setIsTorchOn(false);
    }
    return () => {
      stopStream();
    };
  }, [isOpen]);

  // Flip Front / Back Camera
  const handleCameraQualityChange = (resolution: '480p' | '720p' | '1080p', fps: 30 | 60) => {\n    setSelectedResolution(resolution);\n    setSelectedFps(fps);\n    startCamera(facingMode, resolution, fps);\n  };\n\n  const handleFlipCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Toggle Torch
  const handleToggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch constraint error:', err);
    }
  };

  // Capture Photo
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Trigger flash animation & shutter sound
    setIsFlashing(true);
    playShutterSound();
    setTimeout(() => setIsFlashing(false), 200);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror image if selfie mode
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCapturedPhotoBlob(blob);
        setCapturedPhotoUrl(url);
      },
      'image/jpeg',
      0.88
    );
  };

  // Record video using the live camera stream and microphone audio.
  const handleStartVideoRecording = async () => {
    if (!stream || !('MediaRecorder' in window)) {
      setCameraError(isRtl ? 'تسجيل الفيديو غير مدعوم في هذا المتصفح.' : 'Video recording is not supported in this browser.');
      return;
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      recordingAudioStreamRef.current = audioStream;
      const combined = new MediaStream([
        ...stream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);
      const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(combined, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setIsRecordingVideo(false);
        audioStream.getTracks().forEach((track) => track.stop());
        recordingAudioStreamRef.current = null;
        setCameraError(isRtl ? 'تعذر تسجيل الفيديو. حاول مرة أخرى.' : 'Video recording failed. Please try again.');
      };
      recorder.onstop = () => {
        const elapsedSeconds = recordingStartedAtRef.current === null
          ? undefined
          : Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        recordingStartedAtRef.current = null;
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        audioStream.getTracks().forEach((track) => track.stop());
        recordingAudioStreamRef.current = null;
        setIsRecordingVideo(false);
        if (!blob.size || blob.size > 100 * 1024 * 1024) {
          setCameraError(isRtl ? 'حجم الفيديو أكبر من 100 ميجابايت.' : 'Video exceeds the 100 MB file limit.');
          return;
        }
        const url = URL.createObjectURL(blob);
        // Use the actual recording elapsed time; Android WebM metadata can report 0.
        setCapturedDuration(elapsedSeconds);
        setCapturedPhotoBlob(blob);
        setCapturedPhotoUrl(url);
      };
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start(1000);
      setIsRecordingVideo(true);
    } catch (err) {
      console.warn('Video recording permission error:', err);
      setCameraError(isRtl ? 'اسمح باستخدام الميكروفون لتسجيل الفيديو.' : 'Allow microphone access to record video.');
    }
  };

  const handleStopVideoRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  // Retake Photo or Video
  const handleRetake = () => {
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
    }
    setCapturedPhotoUrl(null);
    setCapturedPhotoBlob(null);
    setCapturedDuration(undefined);
  };

  // Confirm Captured Photo
  const handleConfirmPhoto = () => {
    if (!capturedPhotoBlob || !capturedPhotoUrl) return;
    onPhotoCaptured(capturedPhotoBlob, capturedPhotoUrl, capturedDuration);
    onClose();
  };

  // Handle fallback file upload from device
  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setCameraError(isRtl ? 'الملف أكبر من 100 ميجابايت.' : 'File exceeds the 100 MB limit.');
      e.target.value = '';
      return;
    }
    const url = URL.createObjectURL(file);
    onPhotoCaptured(file, url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-70 bg-black flex flex-col justify-between select-none overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Shutter Flash Animation */}
        <AnimatePresence>
          {isFlashing && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-white z-50 pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Top Header Controls */}
        <div className="p-4 flex items-center justify-between z-20 shrink-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-md"
            title={isRtl ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Title / Badge */}
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/15 backdrop-blur-md rounded-full text-white text-xs font-semibold">
            <Camera className="w-3.5 h-3.5 text-[#087F75]" />
            <span>{isRtl ? 'كاميرا هلا' : 'Hala Camera'}</span>
          </div>

          {/* Torch Toggle (if supported) */}
          {hasTorch && !capturedPhotoUrl ? (
            <button
              type="button"
              onClick={handleToggleTorch}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md active:scale-95 ${
                isTorchOn
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
              title={isRtl ? 'الفلاش' : 'Flash'}
            >
              <Flashlight className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-11 h-11" />
          )}
        </div>

        {/* Viewfinder / Photo Preview Area */}
        <div className="flex-1 relative flex items-center justify-center min-h-0 bg-black overflow-hidden">
          {capturedPhotoUrl ? (
            /* Review Captured Photo */
            <div className="relative w-full h-full flex items-center justify-center p-2">
              {capturedPhotoBlob?.type.startsWith('video/') ? (
                <video src={capturedPhotoUrl} controls playsInline className="max-w-full max-h-full rounded-2xl shadow-2xl" />
              ) : (
                <img src={capturedPhotoUrl} alt="Captured Photo" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
              )}
            </div>
          ) : cameraError ? (
            /* Camera Access Error Screen with Fallback */
            <div className="px-6 py-8 text-center flex flex-col items-center justify-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-white text-base font-bold mb-2">
                {isRtl ? 'تعذر تشغيل الكاميرا' : 'Camera Unavailable'}
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed mb-6">
                {cameraError}
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="w-full py-3 bg-[#087F75] hover:bg-[#06685F] active:scale-98 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#087F75]/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{isRtl ? 'إعادة المحاولة' : 'Try Again'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fallbackInputRef.current?.click()}
                  className="w-full py-3 bg-white/15 hover:bg-white/25 active:scale-98 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer backdrop-blur-md"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isRtl ? 'اختيار صورة من المعرض' : 'Choose Photo from Gallery'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Live Camera Stream */
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                preload="metadata"
                className={`w-full h-full object-cover sm:rounded-2xl ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                }`}
              />

              {isInitializing && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-[#087F75] border-t-transparent animate-spin" />
                  <span className="text-white/80 text-xs font-medium">
                    {isRtl ? 'جاري تشغيل الكاميرا...' : 'Starting camera...'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent shrink-0 z-20">
          {capturedPhotoUrl ? (
            /* Action Bar for Captured Photo (Retake / Accept) */
            {captureMode === 'video' && (
              <div className="max-w-sm mx-auto mb-4 rounded-2xl bg-white/10 backdrop-blur-md p-3 text-white">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[11px] font-semibold">{isRtl ? 'جودة الفيديو' : 'Video quality'}</span>
                  <span className="text-[10px] text-white/70">{actualCameraMode || (isRtl ? 'جاري فحص الكاميرا' : 'Checking camera')}</span>
                </div>
                <div className="flex gap-2">
                  {(['480p', '720p', '1080p'] as const).filter((quality) => supportedResolutions.includes(quality)).map((quality) => (
                    <button key={quality} type="button" disabled={isInitializing || isRecordingVideo}
                      onClick={() => handleCameraQualityChange(quality, selectedFps)}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold ${selectedResolution === quality ? 'bg-white text-slate-900' : 'bg-white/15 text-white'} disabled:opacity-50`}>
                      {quality}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-white/70">{isRtl ? 'معدل الإطارات' : 'Frame rate'}</span>
                  {[30, 60].filter((rate) => rate === 30 || supports60Fps).map((rate) => (
                    <button key={rate} type="button" disabled={isInitializing || isRecordingVideo}
                      onClick={() => handleCameraQualityChange(selectedResolution, rate as 30 | 60)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold ${selectedFps === rate ? 'bg-white text-slate-900' : 'bg-white/15 text-white'} disabled:opacity-50`}>
                      {rate} FPS
                    </button>
                  ))}
                  {!supports60Fps && <span className="text-[10px] text-white/60">{isRtl ? '60 FPS غير مدعوم في هذه الكاميرا' : '60 FPS not reported as supported'}</span>}
                </div>
                <p className="text-[10px] text-white/60 mt-2">{isRtl ? 'قد تختلف الجودة الفعلية حسب إمكانيات الجهاز.' : 'Actual quality may vary with device capability.'}</p>
              </div>
            )}
            <div className="flex items-center justify-between max-w-sm mx-auto px-4">
              {/* Retake Button */}
              <button
                type="button"
                onClick={handleRetake}
                className="flex flex-col items-center gap-1 text-white/90 hover:text-white transition-colors cursor-pointer group"
              >
                <div className="w-13 h-13 rounded-full bg-white/15 group-hover:bg-white/25 group-active:scale-95 flex items-center justify-center backdrop-blur-md transition-all">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold">
                  {isRtl ? 'إعادة الالتقاط' : 'Retake'}
                </span>
              </button>

              {/* Confirm / Use Photo Button */}
              <button
                type="button"
                onClick={handleConfirmPhoto}
                className="flex flex-col items-center gap-1 text-white transition-colors cursor-pointer group"
              >
                <div className="w-16 h-16 rounded-full bg-[#087F75] group-hover:bg-[#06685F] group-active:scale-95 flex items-center justify-center shadow-xl shadow-[#087F75]/40 transition-all">
                  <Check className="w-8 h-8 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-white">
                  {capturedPhotoBlob?.type.startsWith('video/') ? (isRtl ? 'إرفاق الفيديو' : 'Attach Video') : (isRtl ? 'إرفاق الصورة' : 'Attach Photo')}
                </span>
              </button>
            </div>
          ) : (
            /* Live Capture Controls */
            <>
            <div className="flex justify-center gap-2 mb-5">
              <button type="button" onClick={() => setCaptureMode('photo')} disabled={isRecordingVideo} className={`px-4 py-2 rounded-full text-xs font-bold ${captureMode === 'photo' ? 'bg-white text-slate-900' : 'bg-white/15 text-white'}`}>{isRtl ? 'صورة' : 'Photo'}</button>
              <button type="button" onClick={() => setCaptureMode('video')} disabled={isRecordingVideo} className={`px-4 py-2 rounded-full text-xs font-bold ${captureMode === 'video' ? 'bg-white text-slate-900' : 'bg-white/15 text-white'}`}>{isRtl ? 'فيديو' : 'Video'}</button>
            </div>
            <div className="flex items-center justify-between max-w-sm mx-auto px-4">
              {/* Gallery Fallback Option */}
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
                title={isRtl ? 'اختيار من الجهاز' : 'Choose from files'}
              >
                <Upload className="w-5 h-5" />
              </button>

              {/* Main Shutter Button */}
              <button
                type="button"
                onClick={captureMode === 'photo' ? handleCapturePhoto : (isRecordingVideo ? handleStopVideoRecording : handleStartVideoRecording)}
                disabled={isInitializing || Boolean(cameraError)}
                className="w-20 h-20 rounded-full border-4 border-white p-1.5 flex items-center justify-center cursor-pointer active:scale-92 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                aria-label={captureMode === 'photo' ? (isRtl ? 'التقاط صورة' : 'Take photo') : (isRecordingVideo ? (isRtl ? 'إيقاف التسجيل' : 'Stop recording') : (isRtl ? 'بدء تسجيل الفيديو' : 'Start video recording'))}
              >
                <div className={`w-full h-full rounded-full ${captureMode === 'video' ? (isRecordingVideo ? 'bg-red-600' : 'bg-red-500') : 'bg-white group-hover:bg-slate-100'} transition-colors shadow-lg flex items-center justify-center`}>
                  {captureMode === 'video' && isRecordingVideo ? <CircleStop className="w-8 h-8 text-white" /> : null}
                </div>
              </button>

              {/* Switch Front/Back Camera */}
              <button
                type="button"
                onClick={handleFlipCamera}
                disabled={isInitializing || Boolean(cameraError)}
                className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer disabled:opacity-50"
                title={isRtl ? 'تبديل الكاميرا' : 'Switch Camera'}
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
            {captureMode === 'video' && <p className="text-center text-white/70 text-[11px] mt-3">{isRecordingVideo ? `${isRtl ? 'جارٍ التسجيل' : 'Recording'} · ${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')} — ${isRtl ? 'اضغط لإيقافه' : 'tap to stop'}` : (isRtl ? 'سيُطلب إذن الميكروفون لتسجيل الصوت' : 'Microphone permission is needed for video audio')}</p>}
            </>
          )}
        </div>

        {/* Hidden Fallback Input */}
        <input
          ref={fallbackInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFallbackFile}
        />
      </motion.div>
    </AnimatePresence>
  );
};
