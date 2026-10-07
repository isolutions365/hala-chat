import { callErrorMessage } from '../lib/callErrors';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
  Volume2,
  VolumeX,
  Radio,
  Wifi,
  WifiOff,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { CallModel, Language, UserProfile } from '../types';
import {
  updateCallStatus,
  subscribeToCall,
  cleanupCallSignaling,
} from '../lib/firebase';
import {
  HalaWebRTCController,
  startOutgoingRingTone,
  stopRingTone,
} from '../lib/webrtc';

interface ActiveCallScreenProps {
  call: CallModel;
  currentUser: UserProfile;
  onCallEnded: () => void;
  language: Language;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  call: initialCall,
  currentUser,
  onCallEnded,
  language,
}) => {
  const isRtl = language === 'ar';
  const currentUserId =
    currentUser.id || `user_${currentUser.phoneNumber.replace(/\D/g, '')}`;
  const isCaller = initialCall.callerId === currentUserId;
  const isVideo = initialCall.type === 'video';

  const [callState, setCallState] = useState<CallModel>(initialCall);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [callError, setCallError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Diagnostic Video Stream Indicators
  const [ontrackFiredCount, setOntrackFiredCount] = useState<number>(0);
  const [isSendingVideo, setIsSendingVideo] = useState<boolean>(false);
  const [isReceivingVideo, setIsReceivingVideo] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const webrtcControllerRef = useRef<HalaWebRTCController | null>(null);
  const timerRef = useRef<any>(null);

  // Target user details (the other person on the call)
  const targetName = isCaller ? callState.calleeName : callState.callerName;
  const targetAvatar = isCaller ? callState.calleeAvatar : callState.callerAvatar;
  const targetUserId = isCaller ? callState.calleeId : callState.callerId;

  // Subscribe to call document updates (status changes: ringing -> ongoing -> ended)
  useEffect(() => {
    const unsub = subscribeToCall(initialCall.id, (updatedCall) => {
      if (!updatedCall) {
        handleEndCall();
        return;
      }
      setCallState(updatedCall);

      if (
        updatedCall.status === 'ended' ||
        updatedCall.status === 'declined' ||
        updatedCall.status === 'missed'
      ) {
        stopRingTone();
        cleanupAndExit();
      }
    });

    return () => {
      unsub();
    };
  }, [initialCall.id]);

  // Outgoing Ringtone Handling
  useEffect(() => {
    if (isCaller && callState.status === 'ringing') {
      startOutgoingRingTone();
    } else {
      stopRingTone();
    }
    return () => {
      stopRingTone();
    };
  }, [isCaller, callState.status]);

  // Call Duration Timer
  useEffect(() => {
    if (callState.status === 'ongoing') {
      stopRingTone();
      timerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callState.status]);

  // WebRTC initialization
  useEffect(() => {
    let active = true;
    const controller = new HalaWebRTCController({
      callId: initialCall.id,
      currentUserId,
      targetUserId,
      isVideo,
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },
      onTrackEvent: (event) => {
        console.log(`[ActiveCallScreen] ontrack event fired! Track kind="${event.track.kind}", id="${event.track.id}", enabled=${event.track.enabled}`);
        setOntrackFiredCount((prev) => prev + 1);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onError: (err) => {
        if (active) { setConnectionState('failed'); setCallError(err.name || 'Error'); stopRingTone(); }
        console.warn('WebRTC controller error:', err);
      },
    });

    webrtcControllerRef.current = controller;

    // Initialize media & offer
    controller.initMedia(isCaller).then((stream) => {
      if (!active || !stream) return;
      if (stream) {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
      if (isCaller) {
        controller.createAndSendOffer();
      }
    });

    return () => {
      active = false;
      stopRingTone();
      controller.close();
    };
  }, [initialCall.id]);

  // Monitor local stream video tracks to determine "Video Sending" status
  useEffect(() => {
    if (!localStream) {
      setIsSendingVideo(false);
      return;
    }
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) {
      setIsSendingVideo(false);
      return;
    }

    const checkLocalVideoStatus = () => {
      const activeTrack = videoTracks.find((t) => t.enabled && t.readyState === 'live');
      const active = !!activeTrack && !isVideoDisabled;
      setIsSendingVideo(active);
    };

    checkLocalVideoStatus();

    videoTracks.forEach((track) => {
      track.addEventListener('mute', checkLocalVideoStatus);
      track.addEventListener('unmute', checkLocalVideoStatus);
      track.addEventListener('ended', checkLocalVideoStatus);
    });

    return () => {
      videoTracks.forEach((track) => {
        track.removeEventListener('mute', checkLocalVideoStatus);
        track.removeEventListener('unmute', checkLocalVideoStatus);
        track.removeEventListener('ended', checkLocalVideoStatus);
      });
    };
  }, [localStream, isVideoDisabled]);

  // Monitor remote stream video tracks to determine "Video Receiving" status
  useEffect(() => {
    if (!remoteStream) {
      setIsReceivingVideo(false);
      return;
    }
    const videoTracks = remoteStream.getVideoTracks();
    if (videoTracks.length === 0) {
      setIsReceivingVideo(false);
      return;
    }

    const checkRemoteVideoStatus = () => {
      const activeTrack = videoTracks.find((t) => t.enabled && t.readyState === 'live');
      setIsReceivingVideo(!!activeTrack);
    };

    checkRemoteVideoStatus();

    videoTracks.forEach((track) => {
      track.addEventListener('mute', checkRemoteVideoStatus);
      track.addEventListener('unmute', checkRemoteVideoStatus);
      track.addEventListener('ended', checkRemoteVideoStatus);
    });

    return () => {
      videoTracks.forEach((track) => {
        track.removeEventListener('mute', checkRemoteVideoStatus);
        track.removeEventListener('unmute', checkRemoteVideoStatus);
        track.removeEventListener('ended', checkRemoteVideoStatus);
      });
    };
  }, [remoteStream, ontrackFiredCount]);

  // Update local video element srcObject if localStream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log(`[ActiveCallScreen] Attaching localStream to localVideoRef. Tracks count: ${localStream.getTracks().length}`);
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  // Update remote video element srcObject if remoteStream changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log(`[ActiveCallScreen] Attaching remoteStream to remoteVideoRef. Tracks count: ${remoteStream.getTracks().length}`);
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((err) => {
        console.warn('[ActiveCallScreen] Remote video play notice:', err);
      });
    }
  }, [remoteStream]);

  const handleToggleMic = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    if (webrtcControllerRef.current) {
      webrtcControllerRef.current.toggleAudio(!nextState);
    }
  };

  const handleToggleVideo = () => {
    const nextState = !isVideoDisabled;
    setIsVideoDisabled(nextState);
    if (webrtcControllerRef.current) {
      webrtcControllerRef.current.toggleVideo(!nextState);
    }
  };

  const handleSwitchCamera = async () => {
    if (webrtcControllerRef.current) {
      const updatedStream = await webrtcControllerRef.current.switchCamera();
      if (updatedStream) {
        setLocalStream(updatedStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = updatedStream;
        }
      }
    }
  };

  const handleToggleSpeaker = () => {
    setIsSpeakerOn((prev) => !prev);
  };

  const handleEndCall = async () => {
    stopRingTone();
    try {
      const finalStatus =
        callState.status === 'ringing' && isCaller ? 'missed' : 'ended';
      await updateCallStatus({
        callId: initialCall.id,
        status: finalStatus,
        durationSeconds,
      });
      await cleanupCallSignaling(initialCall.id);
    } catch (e) {
      console.warn('Error ending call:', e);
    }
    cleanupAndExit();
  };

  const cleanupAndExit = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (webrtcControllerRef.current) {
      webrtcControllerRef.current.close();
    }
    onCallEnded();
  };

  // Format seconds to mm:ss
  const formatDuration = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusLabel = () => {
    if (callState.status === 'ringing') {
      return isCaller
        ? isRtl
          ? 'يرن عند الطرف الآخر...'
          : 'Ringing...'
        : isRtl
        ? 'مكالمة واردة...'
        : 'Incoming Call...';
    }
    if (callState.status === 'ongoing') {
      return formatDuration(durationSeconds);
    }
    if (callState.status === 'missed') {
      return isRtl ? 'لم يتم الرد' : 'Missed Call';
    }
    if (callState.status === 'declined') {
      return isRtl ? 'تم رفض المكالمة' : 'Call Declined';
    }
    return isRtl ? 'انتهت المكالمة' : 'Call Ended';
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#111315] text-white select-none overflow-hidden">
      {callError && <div role="alert" dir={isRtl ? 'rtl' : 'ltr'} className="shrink-0 z-50 bg-slate-800 border-b border-slate-600 px-5 py-4 text-sm leading-relaxed">{callErrorMessage(callError, isRtl)}</div>}
      {/* ----------------- VIDEO CALL LAYOUT ----------------- */}
      {isVideo ? (
        <div className="relative w-full h-full flex flex-col justify-between">
          {/* Main / Remote Video Feed */}
          <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <div className="relative mb-4">
                  {targetAvatar ? (
                    <img
                      src={targetAvatar}
                      alt={targetName}
                      className="w-28 h-28 rounded-full object-cover border-4 border-stone-800 shadow-2xl"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#087F75] to-[#8c2d0f] text-white flex items-center justify-center text-3xl font-bold border-4 border-stone-800">
                      {targetName ? targetName.charAt(0).toUpperCase() : 'H'}
                    </div>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white">{targetName}</h3>
                <p className="text-sm text-[#087F75] font-medium mt-1">
                  {getStatusLabel()}
                </p>
                {callState.status === 'ongoing' && !remoteStream && (
                  <p className="text-xs text-stone-400 mt-2 max-w-xs">
                    {isRtl
                      ? 'جاري استقبال تدفق الفيديو من الطرف الآخر...'
                      : 'Connecting remote video stream...'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Picture-in-Picture Local Video Feed (Top Right/Left) */}
          <div
            className={`absolute top-6 ${
              isRtl ? 'left-6' : 'right-6'
            } w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl border-2 border-stone-700/80 bg-stone-900/90 z-20 transition-all`}
          >
            {!isVideoDisabled ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-stone-800 text-stone-400 p-2">
                <VideoOff className="w-6 h-6 mb-1" />
                <span className="text-[10px]">
                  {isRtl ? 'الكاميرا مغلقة' : 'Cam Off'}
                </span>
              </div>
            )}

            {/* Video Sending Status Tag on PiP */}
            <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 backdrop-blur-md ${
              isSendingVideo ? 'bg-emerald-900/90 text-emerald-200' : 'bg-stone-900/90 text-stone-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSendingVideo ? 'bg-emerald-400' : 'bg-stone-400'}`} />
              {isSendingVideo ? (isRtl ? 'إرسال' : 'Sending') : (isRtl ? 'متوقف' : 'Off')}
            </div>

            {/* Mic muted badge on local PiP */}
            {isMuted && (
              <div className="absolute bottom-2 left-2 bg-red-600/90 p-1 rounded-full text-white shadow">
                <MicOff className="w-3 h-3" />
              </div>
            )}
          </div>

          {/* Top Status Header */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            <div>
              <h2 className="text-lg font-bold drop-shadow">{targetName}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono font-semibold text-emerald-300">
                  {getStatusLabel()}
                </span>
              </div>
            </div>

            {/* Video Sending & Video Receiving Status Indicators */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Video Sending Indicator */}
              <div
                className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-md ${
                  isSendingVideo
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                    : 'bg-stone-900/80 text-stone-400 border-stone-700/60'
                }`}
              >
                <ArrowUpRight className={`w-3.5 h-3.5 ${isSendingVideo ? 'text-emerald-400' : 'text-stone-500'}`} />
                <span>
                  {isRtl
                    ? isSendingVideo
                      ? 'إرسال الفيديو: نشط'
                      : 'إرسال الفيديو: متوقف'
                    : isSendingVideo
                    ? 'Video Sending: Active'
                    : 'Video Sending: Off'}
                </span>
              </div>

              {/* Video Receiving Indicator */}
              <div
                className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-md ${
                  isReceivingVideo
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/50 animate-pulse'
                }`}
              >
                <ArrowDownLeft className={`w-3.5 h-3.5 ${isReceivingVideo ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span>
                  {isRtl
                    ? isReceivingVideo
                      ? 'استقبال الفيديو: نشط'
                      : 'استقبال الفيديو: جاري الانتظار...'
                    : isReceivingVideo
                    ? 'Video Receiving: Active'
                    : 'Video Receiving: Waiting...'}
                </span>
              </div>

              <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs font-medium flex items-center gap-1 text-stone-300">
                <Radio className="w-3.5 h-3.5 text-[#087F75]" />
                <span>WebRTC</span>
              </div>
            </div>
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="relative z-10 p-6 pb-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center gap-4 sm:gap-6">
            {/* Flip Camera */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSwitchCamera}
              aria-label="Switch Camera"
              className="p-4 rounded-full bg-stone-800/80 hover:bg-stone-700/80 text-stone-200 border border-stone-700/80 backdrop-blur-md transition shadow-lg"
            >
              <SwitchCamera className="w-6 h-6" />
            </motion.button>

            {/* Toggle Video */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleToggleVideo}
              aria-label="Toggle Video"
              className={`p-4 rounded-full border backdrop-blur-md transition shadow-lg ${
                isVideoDisabled
                  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                  : 'bg-stone-800/80 hover:bg-stone-700/80 text-stone-200 border-stone-700/80'
              }`}
            >
              {isVideoDisabled ? (
                <VideoOff className="w-6 h-6" />
              ) : (
                <Video className="w-6 h-6" />
              )}
            </motion.button>

            {/* Toggle Mic */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleToggleMic}
              aria-label="Toggle Mic"
              className={`p-4 rounded-full border backdrop-blur-md transition shadow-lg ${
                isMuted
                  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                  : 'bg-stone-800/80 hover:bg-stone-700/80 text-stone-200 border-stone-700/80'
              }`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </motion.button>

            {/* End Call Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleEndCall}
              aria-label="End Call"
              className="p-4 sm:p-5 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-xl shadow-red-900/50 transition"
            >
              <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
            </motion.button>
          </div>
        </div>
      ) : (
        /* ----------------- VOICE CALL LAYOUT ----------------- */
        <div className="relative w-full h-full flex flex-col justify-between p-6 sm:p-10">
          {/* Subtle Ambient Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#087F75]/40 rounded-full blur-3xl animate-pulse" />
          </div>

          {/* Top Header */}
          <div className="flex items-center justify-between z-10 pt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-800/80 border border-stone-700/60 backdrop-blur-md text-xs font-semibold text-stone-300">
              <span className="w-2 h-2 rounded-full bg-[#087F75]" />
              <span>{isRtl ? 'مكالمة صوتية عالية الدقة' : 'HD Voice Call'}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">
                {connectionState === 'connected' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Wifi className="w-3.5 h-3.5" />
                    {isRtl ? 'متصل' : 'Connected'}
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Radio className="w-3.5 h-3.5 animate-spin" />
                    {connectionState}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Center: Avatar & Sound Wave Pulsar */}
          <div className="flex flex-col items-center justify-center text-center my-auto z-10">
            <div className="relative mb-6">
              {callState.status === 'ongoing' && (
                <>
                  <div className="absolute inset-0 -m-6 rounded-full border border-[#087F75]/30 animate-ping opacity-70" />
                  <div className="absolute inset-0 -m-12 rounded-full border border-stone-700/40 animate-pulse" />
                </>
              )}

              {targetAvatar ? (
                <img
                  src={targetAvatar}
                  alt={targetName}
                  className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-stone-800 shadow-2xl relative z-10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-[#087F75] to-[#8c2d0f] text-white flex items-center justify-center text-4xl sm:text-5xl font-bold border-4 border-stone-800 shadow-2xl relative z-10">
                  {targetName ? targetName.charAt(0).toUpperCase() : 'H'}
                </div>
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {targetName}
            </h2>

            {/* Timer / Ringing Status */}
            <div className="mt-3">
              <span
                className={`text-base sm:text-lg font-mono font-semibold tracking-wider ${
                  callState.status === 'ongoing'
                    ? 'text-emerald-400'
                    : 'text-[#087F75] animate-pulse'
                }`}
              >
                {getStatusLabel()}
              </span>
            </div>
          </div>

          {/* Bottom Action Controls */}
          <div className="w-full max-w-md mx-auto flex items-center justify-around pb-6 sm:pb-8 z-10">
            {/* Speaker Toggle */}
            <div className="flex flex-col items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleToggleSpeaker}
                aria-label="Speaker Toggle"
                className={`w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-md transition shadow-md ${
                  isSpeakerOn
                    ? 'bg-stone-800/90 text-stone-200 border-stone-700'
                    : 'bg-stone-900/60 text-stone-500 border-stone-800'
                }`}
              >
                {isSpeakerOn ? (
                  <Volume2 className="w-6 h-6" />
                ) : (
                  <VolumeX className="w-6 h-6" />
                )}
              </motion.button>
              <span className="text-xs text-stone-400">
                {isRtl ? 'مكبر الصوت' : 'Speaker'}
              </span>
            </div>

            {/* End Call Button */}
            <div className="flex flex-col items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleEndCall}
                aria-label="End Call"
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white flex items-center justify-center shadow-xl shadow-red-900/50 transition"
              >
                <PhoneOff className="w-8 h-8" />
              </motion.button>
              <span className="text-xs text-red-400 font-medium">
                {isRtl ? 'إنهاء' : 'End'}
              </span>
            </div>

            {/* Mute Mic */}
            <div className="flex flex-col items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleToggleMic}
                aria-label="Mute Microphone"
                className={`w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-md transition shadow-md ${
                  isMuted
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'bg-stone-800/90 text-stone-200 border-stone-700'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </motion.button>
              <span className="text-xs text-stone-400">
                {isMuted
                  ? isRtl
                    ? 'مكتوم'
                    : 'Muted'
                  : isRtl
                  ? 'كتم الصوت'
                  : 'Mute'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
