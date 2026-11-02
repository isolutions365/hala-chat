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
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
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

  // Debug mode: only show diagnostic badges and connection labels when ?debug=1 in URL
  const isDebugMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1';

  const [callState, setCallState] = useState<CallModel>(initialCall);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const [iceConnectionState, setIceConnectionState] = useState<string>('new');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Self-view swap state (swapping large and small video views)
  const [isSwapped, setIsSwapped] = useState<boolean>(false);

  // Self-view draggable position state
  const [pipPosition, setPipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialPipX: number;
    initialPipY: number;
    moved: boolean;
  } | null>(null);
  const pipRef = useRef<HTMLDivElement | null>(null);

  // Diagnostic Video Stream Indicators
  const [ontrackFiredCount, setOntrackFiredCount] = useState<number>(0);
  const [isSendingVideo, setIsSendingVideo] = useState<boolean>(false);
  const [isReceivingVideo, setIsReceivingVideo] = useState<boolean>(false);

  // Reconnection and Ending refs
  const isEndingRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const webrtcControllerRef = useRef<HalaWebRTCController | null>(null);
  const timerRef = useRef<any>(null);

  // Target user details (the other person on the call)
  const targetName = isCaller ? callState.calleeName : callState.callerName;
  const targetAvatar = isCaller ? callState.calleeAvatar : callState.callerAvatar;
  const targetUserId = isCaller ? callState.calleeId : callState.callerId;

  // Initialize PiP position to default corner (top-right or top-left in RTL)
  useEffect(() => {
    const updateDefaultPos = () => {
      const pipW = pipRef.current?.offsetWidth || 128;
      const initialX = isRtl ? 16 : Math.max(16, window.innerWidth - pipW - 16);
      setPipPosition((prev) => {
        if (!prev) return { x: initialX, y: 16 };
        const pipH = pipRef.current?.offsetHeight || 176;
        const maxX = Math.max(16, window.innerWidth - pipW - 16);
        const maxY = Math.max(16, window.innerHeight - pipH - 110);
        return {
          x: Math.min(Math.max(16, prev.x), maxX),
          y: Math.min(Math.max(16, prev.y), maxY),
        };
      });
    };

    updateDefaultPos();
    window.addEventListener('resize', updateDefaultPos);
    return () => window.removeEventListener('resize', updateDefaultPos);
  }, [isRtl]);

  // Snap PiP to nearest of the 4 screen corners
  const snapToClosestCorner = (currentX: number, currentY: number) => {
    const pipW = pipRef.current?.offsetWidth || 128;
    const pipH = pipRef.current?.offsetHeight || 176;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const topY = 16;
    const bottomY = Math.max(16, winH - pipH - 110);
    const leftX = 16;
    const rightX = Math.max(16, winW - pipW - 16);

    const corners = [
      { x: leftX, y: topY },
      { x: rightX, y: topY },
      { x: leftX, y: bottomY },
      { x: rightX, y: bottomY },
    ];

    const centerX = currentX + pipW / 2;
    const centerY = currentY + pipH / 2;

    let closest = corners[0];
    let minDistance = Infinity;

    for (const c of corners) {
      const cX = c.x + pipW / 2;
      const cY = c.y + pipH / 2;
      const dist = Math.hypot(centerX - cX, centerY - cY);
      if (dist < minDistance) {
        minDistance = dist;
        closest = c;
      }
    }

    setPipPosition({ x: closest.x, y: closest.y });
  };

  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipPosition) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPipX: pipPosition.x,
      initialPipY: pipPosition.y,
      moved: false,
    };
    setIsDragging(true);
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (Math.hypot(dx, dy) > 8) {
      dragStartRef.current.moved = true;
    }
    const pipW = pipRef.current?.offsetWidth || 128;
    const pipH = pipRef.current?.offsetHeight || 176;
    const maxX = Math.max(16, window.innerWidth - pipW - 16);
    const maxY = Math.max(16, window.innerHeight - pipH - 110);

    const newX = Math.max(16, Math.min(dragStartRef.current.initialPipX + dx, maxX));
    const newY = Math.max(16, Math.min(dragStartRef.current.initialPipY + dy, maxY));

    setPipPosition({ x: newX, y: newY });
  };

  const handlePipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const hadMoved = dragStartRef.current.moved;
    const finalX = pipPosition?.x ?? dragStartRef.current.initialPipX;
    const finalY = pipPosition?.y ?? dragStartRef.current.initialPipY;
    dragStartRef.current = null;
    setIsDragging(false);

    if (!hadMoved) {
      // Single tap without dragging -> Swap big/small video views!
      setIsSwapped((prev) => !prev);
    } else {
      snapToClosestCorner(finalX, finalY);
    }
  };

  // Helper to ensure audio playback on stream attach or user tap
  const handleUserGesturePlayAudio = () => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.play().then(() => {
        console.log('[ActiveCallScreen] Remote audio element playback started successfully via user gesture.');
      }).catch((err) => {
        console.warn('[ActiveCallScreen] Remote audio play on user gesture notice:', err);
      });
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.play().catch(() => {});
    }
  };

  // Subscribe to call document updates (status changes: ringing -> ongoing -> ended / declined / cancelled)
  useEffect(() => {
    const unsub = subscribeToCall(initialCall.id, (updatedCall) => {
      if (!updatedCall) {
        handleEndCall(false);
        return;
      }
      setCallState(updatedCall);

      if (
        updatedCall.status === 'ended' ||
        updatedCall.status === 'declined' ||
        updatedCall.status === 'missed' ||
        updatedCall.status === 'cancelled'
      ) {
        stopRingTone();
        handleEndCall(false);
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
    const controller = new HalaWebRTCController({
      callId: initialCall.id,
      currentUserId,
      targetUserId,
      isVideo,
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.onloadedmetadata = () => {
            remoteAudioRef.current?.play().catch((err) =>
              console.warn('[ActiveCallScreen] Remote audio play onloadedmetadata notice:', err)
            );
          };
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.onloadedmetadata = () => {
            remoteVideoRef.current?.play().catch((err) =>
              console.warn('[ActiveCallScreen] Remote video play onloadedmetadata notice:', err)
            );
          };
        }
      },
      onTrackEvent: (event) => {
        console.log(`[ActiveCallScreen] ontrack event fired! Track kind="${event.track.kind}", id="${event.track.id}", enabled=${event.track.enabled}`);
        setOntrackFiredCount((prev) => prev + 1);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onIceConnectionStateChange: (state) => {
        setIceConnectionState(state);
      },
      onError: (err) => {
        console.warn('WebRTC controller error:', err);
      },
    });

    webrtcControllerRef.current = controller;

    // Initialize media & offer
    controller.initMedia(isCaller).then((stream) => {
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
      stopRingTone();
      controller.close();
    };
  }, [initialCall.id]);

  // Auto-reconnect ICE restart: only when call status is active ('ongoing'), connection dropped, and max 2 attempts
  useEffect(() => {
    if (callState.status !== 'ongoing' || isEndingRef.current) return;
    const isDisconnected =
      connectionState === 'disconnected' ||
      connectionState === 'failed' ||
      iceConnectionState === 'disconnected' ||
      iceConnectionState === 'failed';

    if (isDisconnected) {
      if (reconnectAttemptsRef.current < 2) {
        reconnectAttemptsRef.current += 1;
        console.log(`[ActiveCallScreen] Auto-reconnect ICE restart attempt #${reconnectAttemptsRef.current}/2`);
        webrtcControllerRef.current?.restartIce();
      } else {
        console.warn('[ActiveCallScreen] Maximum auto-reconnect attempts (2) reached.');
      }
    }
  }, [connectionState, iceConnectionState, callState.status]);

  // Monitor local stream video tracks to determine "Video Sending" status (for debug)
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

  // Monitor remote stream video tracks to determine "Video Receiving" status (for debug)
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

  // Attach local stream to localVideoRef (handles stream init and view swaps)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log(`[ActiveCallScreen] Attaching localStream to localVideoRef. Tracks: ${localStream.getTracks().length}`);
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, isSwapped, isVideoDisabled]);

  // Attach remote stream to remoteVideoRef and remoteAudioRef
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.onloadedmetadata = () => {
        remoteAudioRef.current?.play().catch((err) => {
          console.warn('[ActiveCallScreen] Remote audio play onloadedmetadata notice:', err);
        });
      };
      remoteAudioRef.current.play().catch((err) => {
        console.warn('[ActiveCallScreen] Remote audio direct play notice:', err);
      });
    }

    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.onloadedmetadata = () => {
        remoteVideoRef.current?.play().catch(() => {});
      };
      remoteVideoRef.current.play().catch((err) => {
        console.warn('[ActiveCallScreen] Remote video play notice:', err);
      });
    }
  }, [remoteStream, isSwapped]);

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

  const handleEndCall = async (userInitiated = true) => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;
    stopRingTone();

    if (userInitiated) {
      try {
        const finalStatus =
          callState.status === 'ringing' && isCaller ? 'cancelled' : 'ended';
        await updateCallStatus({
          callId: initialCall.id,
          status: finalStatus,
          durationSeconds,
        });
        await cleanupCallSignaling(initialCall.id);
      } catch (e) {
        console.warn('Error ending call in Firestore:', e);
      }
    }

    cleanupAndExit();
  };

  const cleanupAndExit = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopRingTone();
    if (webrtcControllerRef.current) {
      webrtcControllerRef.current.close();
      webrtcControllerRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
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
    if (callState.status === 'cancelled') {
      return isRtl ? 'تم إلغاء المكالمة' : 'Call Cancelled';
    }
    return isRtl ? 'انتهت المكالمة' : 'Call Ended';
  };

  return (
    <div
      onClick={handleUserGesturePlayAudio}
      onTouchStart={handleUserGesturePlayAudio}
      className="fixed inset-0 z-[100] flex flex-col bg-[#111315] text-white select-none overflow-hidden"
    >
      {/* Dedicated Remote Audio Output Element for WebRTC Audio Tracks */}
      <audio ref={remoteAudioRef} autoPlay playsInline controls={false} className="hidden" />

      {/* ----------------- VIDEO CALL LAYOUT ----------------- */}
      {isVideo ? (
        <div className="relative w-full h-full flex flex-col justify-between">
          {/* Main Large Video Feed */}
          <div className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden">
            {!isSwapped ? (
              // Default: Remote Video as Main Fullscreen
              remoteStream ? (
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
              )
            ) : (
              // Swapped: Local Self-Video as Main Fullscreen
              !isVideoDisabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="relative mb-4">
                    {currentUser.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.name}
                        className="w-28 h-28 rounded-full object-cover border-4 border-stone-800 shadow-2xl"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-[#087F75] to-[#8c2d0f] text-white flex items-center justify-center text-3xl font-bold border-4 border-stone-800">
                        {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'ME'}
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-white">{currentUser.name}</h3>
                  <p className="text-xs text-stone-400 mt-1">
                    {isRtl ? 'الكاميرا مغلقة' : 'Camera Off'}
                  </p>
                </div>
              )
            )}
          </div>

          {/* Draggable & Swappable Picture-in-Picture Self/Remote Video Window */}
          <div
            ref={pipRef}
            onPointerDown={handlePipPointerDown}
            onPointerMove={handlePipPointerMove}
            onPointerUp={handlePipPointerUp}
            onPointerCancel={handlePipPointerUp}
            style={{
              transform: pipPosition
                ? `translate3d(${pipPosition.x}px, ${pipPosition.y}px, 0)`
                : isRtl
                ? `translate3d(16px, 16px, 0)`
                : `translate3d(calc(100vw - 128px - 16px), 16px, 0)`,
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
              touchAction: 'none',
            }}
            className="fixed top-0 left-0 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl border-2 border-stone-700/80 bg-stone-900/95 z-30 cursor-grab active:cursor-grabbing select-none"
          >
            {!isSwapped ? (
              // Default PiP: Local Self-Video
              !isVideoDisabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror scale-x-[-1] pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-800 text-stone-400 p-2 pointer-events-none">
                  <VideoOff className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">
                    {isRtl ? 'الكاميرا مغلقة' : 'Cam Off'}
                  </span>
                </div>
              )
            ) : (
              // Swapped PiP: Remote Video
              remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-800 text-stone-400 p-2 pointer-events-none">
                  {targetAvatar ? (
                    <img
                      src={targetAvatar}
                      alt={targetName}
                      className="w-12 h-12 rounded-full object-cover border border-stone-600 mb-1"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#087F75] text-white flex items-center justify-center text-sm font-bold border border-stone-600 mb-1">
                      {targetName ? targetName.charAt(0).toUpperCase() : 'H'}
                    </div>
                  )}
                  <span className="text-[10px] text-stone-300 font-medium truncate max-w-[80px]">
                    {targetName}
                  </span>
                </div>
              )
            )}

            {/* Video Sending Status Tag on PiP - Only visible when debug mode is enabled (?debug=1) */}
            {isDebugMode && (
              <div
                className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 backdrop-blur-md pointer-events-none ${
                  isSendingVideo
                    ? 'bg-emerald-900/90 text-emerald-200'
                    : 'bg-stone-900/90 text-stone-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSendingVideo ? 'bg-emerald-400' : 'bg-stone-400'
                  }`}
                />
                {isSendingVideo
                  ? isRtl
                    ? 'إرسال'
                    : 'Sending'
                  : isRtl
                  ? 'متوقف'
                  : 'Off'}
              </div>
            )}

            {/* Mic muted badge on local PiP */}
            {isMuted && !isSwapped && (
              <div className="absolute bottom-2 left-2 bg-red-600/90 p-1 rounded-full text-white shadow pointer-events-none">
                <MicOff className="w-3 h-3" />
              </div>
            )}

            {/* Swap visual indicator button */}
            <div
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 backdrop-blur-md shadow cursor-pointer transition"
              title={isRtl ? 'اضغط للتبديل' : 'Tap to swap view'}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </div>
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

              {/* Diagnostic Badges - Only visible when ?debug=1 */}
              {isDebugMode && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="px-2 py-0.5 rounded bg-stone-900/90 border border-stone-700 text-[10px] font-mono text-stone-300 flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        connectionState === 'connected'
                          ? 'bg-emerald-400'
                          : 'bg-amber-400 animate-pulse'
                      }`}
                    />
                    <span>conn: {connectionState}</span>
                  </div>
                  <div className="px-2 py-0.5 rounded bg-stone-900/90 border border-stone-700 text-[10px] font-mono text-stone-300 flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        iceConnectionState === 'connected' ||
                        iceConnectionState === 'completed'
                          ? 'bg-emerald-400'
                          : 'bg-amber-400 animate-pulse'
                      }`}
                    />
                    <span>ice: {iceConnectionState}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Video Sending & Video Receiving Status Indicators - Only visible when ?debug=1 */}
            {isDebugMode && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Video Sending Indicator */}
                <div
                  className={`px-3 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-md ${
                    isSendingVideo
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                      : 'bg-stone-900/80 text-stone-400 border-stone-700/60'
                  }`}
                >
                  <ArrowUpRight
                    className={`w-3.5 h-3.5 ${
                      isSendingVideo ? 'text-emerald-400' : 'text-stone-500'
                    }`}
                  />
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
                  <ArrowDownLeft
                    className={`w-3.5 h-3.5 ${
                      isReceivingVideo ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  />
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
            )}
          </div>

          {/* Bottom Floating Control Bar */}
          <div className="relative z-10 p-6 pb-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center gap-4 sm:gap-6">
            {/* Flip Camera */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSwitchCamera}
              aria-label="Switch Camera"
              className="p-4 rounded-full bg-stone-800/80 hover:bg-stone-700/80 text-stone-200 border border-stone-700/80 backdrop-blur-md transition shadow-lg cursor-pointer"
            >
              <SwitchCamera className="w-6 h-6" />
            </motion.button>

            {/* Toggle Video */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleToggleVideo}
              aria-label="Toggle Video"
              className={`p-4 rounded-full border backdrop-blur-md transition shadow-lg cursor-pointer ${
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
              className={`p-4 rounded-full border backdrop-blur-md transition shadow-lg cursor-pointer ${
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
              onClick={() => handleEndCall(true)}
              aria-label="End Call"
              className="p-4 sm:p-5 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-xl shadow-red-900/50 transition cursor-pointer"
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
          <div className="flex items-center justify-between z-10 pt-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-800/80 border border-stone-700/60 backdrop-blur-md text-xs font-semibold text-stone-300">
              <span className="w-2 h-2 rounded-full bg-[#087F75]" />
              <span>{isRtl ? 'مكالمة صوتية عالية الدقة' : 'HD Voice Call'}</span>
            </div>

            {/* WebRTC State Badges - Only visible when ?debug=1 */}
            {isDebugMode && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="px-2.5 py-1 rounded-lg bg-stone-900/90 border border-stone-800 text-[11px] font-mono text-stone-300 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionState === 'connected'
                        ? 'bg-emerald-400'
                        : 'bg-amber-400 animate-pulse'
                    }`}
                  />
                  <span>conn: {connectionState}</span>
                </div>

                <div className="px-2.5 py-1 rounded-lg bg-stone-900/90 border border-stone-800 text-[11px] font-mono text-stone-300 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      iceConnectionState === 'connected' ||
                      iceConnectionState === 'completed'
                        ? 'bg-emerald-400'
                        : 'bg-amber-400 animate-pulse'
                    }`}
                  />
                  <span>ice: {iceConnectionState}</span>
                </div>
              </div>
            )}
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
                className={`w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-md transition shadow-md cursor-pointer ${
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
                onClick={() => handleEndCall(true)}
                aria-label="End Call"
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white flex items-center justify-center shadow-xl shadow-red-900/50 transition cursor-pointer"
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
                className={`w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-md transition shadow-md cursor-pointer ${
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
