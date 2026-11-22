import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Minimize2,
  Maximize2,
  Users,
  Wifi,
  LayoutGrid,
  Pin,
  PinOff,
  Focus,
} from 'lucide-react';
import { GroupCallModel, GroupCallParticipant, Language, UserProfile, SignalingData } from '../types';
import {
  leaveGroupCall,
  endGroupCall,
  updateGroupCallParticipantState,
  sendGroupCallSignaling,
  subscribeToGroupCallSignaling,
} from '../lib/firebase';
import { fetchIceServers } from '../lib/webrtc';
import { requestMediaStream } from '../services/mediaDevices';
import { playTone } from '../lib/sounds';

interface ActiveGroupCallScreenProps {
  call: GroupCallModel;
  currentUser: UserProfile;
  language: Language;
  onCallEnded: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

const RemoteParticipantMedia: React.FC<{
  stream: MediaStream | undefined;
  isSpeakerOn: boolean;
  showVideo: boolean;
}> = ({ stream, isSpeakerOn, showVideo }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      if (audioRef.current.srcObject !== stream) {
        audioRef.current.srcObject = stream;
      }
      audioRef.current.muted = !isSpeakerOn;
      audioRef.current.play().catch(() => {});
    }
  }, [stream, isSpeakerOn]);

  useEffect(() => {
    if (videoRef.current && stream && showVideo) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [stream, showVideo]);

  if (!stream) return null;

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline muted={!isSpeakerOn} className="hidden" />
      {showVideo && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </>
  );
};

export const ActiveGroupCallScreen: React.FC<ActiveGroupCallScreenProps> = ({
  call,
  currentUser,
  language,
  onCallEnded,
  isMinimized = false,
  onToggleMinimize,
}) => {
  const isRtl = language === 'ar';
  const currentUserId = currentUser.id || `user_${currentUser.phoneNumber?.replace(/\D/g, '')}`;
  const isCreator = call.createdBy === currentUserId;

  // Local device media state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.type === 'voice');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakingLocal, setIsSpeakingLocal] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerStates, setPeerStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [layoutMode, setLayoutMode] = useState<'grid' | 'spotlight'>('grid');
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 800,
    height: typeof window !== 'undefined' ? window.innerHeight - 160 : 600,
  });

  // Refs for WebRTC mesh & audio analysis
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);

  // Duration timer
  useEffect(() => {
    const startMs = new Date(call.startedAt).getTime() || Date.now();
    const update = () => {
      setCallDuration(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [call.startedAt]);

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Create or get a peer connection for a remote participant
  const getOrCreatePeer = useCallback(
    async (remoteUid: string): Promise<RTCPeerConnection> => {
      const existing = peersRef.current.get(remoteUid);
      if (existing && existing.connectionState !== 'closed') {
        return existing;
      }

      if (iceServersRef.current.length === 0) {
        iceServersRef.current = await fetchIceServers();
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 6,
      });

      peersRef.current.set(remoteUid, pc);

      // Attach local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendGroupCallSignaling(call.id, {
            type: 'candidate',
            from: currentUserId,
            to: remoteUid,
            candidate: event.candidate.toJSON(),
          }).catch(() => {});
        }
      };

      pc.ontrack = (event) => {
        const incomingStream = event.streams?.[0] || new MediaStream([event.track]);
        setRemoteStreams((prev) => ({
          ...prev,
          [remoteUid]: incomingStream,
        }));
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((prev) => ({
          ...prev,
          [remoteUid]: pc.connectionState,
        }));
      };

      return pc;
    },
    [call.id, currentUserId]
  );

  // Clean up a specific peer
  const closePeer = useCallback((remoteUid: string) => {
    const pc = peersRef.current.get(remoteUid);
    if (pc) {
      try {
        pc.close();
      } catch {}
      peersRef.current.delete(remoteUid);
    }
    pendingIceRef.current.delete(remoteUid);
    setRemoteStreams((prev) => {
      if (!(remoteUid in prev)) return prev;
      const next = { ...prev };
      delete next[remoteUid];
      return next;
    });
    setPeerStates((prev) => {
      if (!(remoteUid in prev)) return prev;
      const next = { ...prev };
      delete next[remoteUid];
      return next;
    });
  }, []);

  // Initialize Local Media Stream + ICE Servers + Voice Activity Detection
  useEffect(() => {
    let isMounted = true;

    async function initMedia() {
      try {
        // Pre-fetch ICE servers in parallel with mic/cam capture
        const icePromise = fetchIceServers().then((servers) => {
          iceServersRef.current = servers;
        });

        let stream: MediaStream | null = null;
        try {
          stream = await requestMediaStream({
            audio: true,
            video: call.type === 'video' ? { facingMode: 'user' } : false,
          });
        } catch (primaryErr) {
          // If video fails, gracefully fall back to audio-only so group voice still works
          if (call.type === 'video') {
            try {
              stream = await requestMediaStream({ audio: true, video: false });
              if (isMounted) setIsVideoOff(true);
            } catch {
              throw primaryErr;
            }
          } else {
            throw primaryErr;
          }
        }

        await icePromise;

        if (!isMounted) {
          stream?.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current && call.type === 'video' && stream) {
          localVideoRef.current.srcObject = stream;
        }

        setMediaReady(true);
        setMediaError(null);

        // Web Audio VAD
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass && stream && stream.getAudioTracks().length > 0) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const buffer = new Uint8Array(analyser.frequencyBinCount);
            let lastSpeakingSent = false;
            let lastSentAt = 0;

            const checkAudio = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(buffer);
              let sum = 0;
              for (let i = 0; i < buffer.length; i++) {
                sum += buffer[i];
              }
              const average = sum / buffer.length;
              const isSpeakingNow = average > 20 && !isMutedRef.current;

              setIsSpeakingLocal(isSpeakingNow);

              const now = Date.now();
              if (isSpeakingNow !== lastSpeakingSent && now - lastSentAt > 400) {
                lastSpeakingSent = isSpeakingNow;
                lastSentAt = now;
                updateGroupCallParticipantState({
                  callId: call.id,
                  userId: currentUserId,
                  isSpeaking: isSpeakingNow,
                }).catch(() => {});
              }

              animFrameRef.current = requestAnimationFrame(checkAudio);
            };

            animFrameRef.current = requestAnimationFrame(checkAudio);
          }
        } catch (audioErr) {
          console.warn('[ActiveGroupCall] AudioContext setup notice:', audioErr);
        }
      } catch (err: any) {
        console.warn('[ActiveGroupCall] Failed to access local media devices:', err);
        if (isMounted) {
          setMediaError(
            isRtl
              ? 'تعذر الوصول إلى الميكروفون أو الكاميرا — يمكنك الاستماع للمكالمة'
              : 'Mic/Camera unavailable — joined in listen mode'
          );
          setMediaReady(true); // Still connect WebRTC so user can listen
        }
      }
    }

    initMedia();
    try {
      playTone('group');
    } catch {}

    return () => {
      isMounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      peersRef.current.forEach((pc) => {
        try {
          pc.close();
        } catch {}
      });
      peersRef.current.clear();
      pendingIceRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [call.id, call.type, currentUserId, isRtl]);

  // Attach local video element whenever video toggles on or expands from minimized
  useEffect(() => {
    if (!isMinimized && !isVideoOff && localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [isMinimized, isVideoOff, mediaReady]);

  // Subscribe to Firestore WebRTC signaling for this group call
  useEffect(() => {
    if (!mediaReady) return;

    const handleSignal = async (signal: SignalingData) => {
      const fromUid = signal.from;
      if (!fromUid || fromUid === currentUserId) return;

      try {
        if (signal.type === 'offer' && signal.sdp) {
          const pc = await getOrCreatePeer(fromUid);
          if (pc.signalingState !== 'stable') {
            await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
          }
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          const queued = pendingIceRef.current.get(fromUid) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          pendingIceRef.current.delete(fromUid);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendGroupCallSignaling(call.id, {
            type: 'answer',
            from: currentUserId,
            to: fromUid,
            sdp: { type: answer.type, sdp: answer.sdp },
          });
        } else if (signal.type === 'answer' && signal.sdp) {
          const pc = peersRef.current.get(fromUid);
          if (pc && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const queued = pendingIceRef.current.get(fromUid) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            pendingIceRef.current.delete(fromUid);
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          const pc = peersRef.current.get(fromUid);
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
          } else {
            const list = pendingIceRef.current.get(fromUid) || [];
            list.push(signal.candidate);
            pendingIceRef.current.set(fromUid, list);
          }
        }
      } catch (err) {
        console.warn('[ActiveGroupCall] Signal handling notice:', err);
      }
    };

    const unsub = subscribeToGroupCallSignaling(call.id, currentUserId, handleSignal);
    return () => unsub();
  }, [call.id, currentUserId, mediaReady, getOrCreatePeer]);

  // Synchronize WebRTC mesh connections as participants join/leave
  const participantsKey = (call.participants || []).slice().sort().join(',');
  useEffect(() => {
    if (!mediaReady) return;
    const otherUids = (call.participants || []).filter((uid) => uid !== currentUserId);
    const otherSet = new Set(otherUids);

    // Close peers who left
    Array.from(peersRef.current.keys()).forEach((uid) => {
      if (!otherSet.has(uid)) {
        closePeer(uid);
      }
    });

    // Establish connections with new peers (lexicographically smaller UID initiates offer)
    otherUids.forEach(async (remoteUid) => {
      if (peersRef.current.has(remoteUid)) return;
      if (currentUserId < remoteUid) {
        try {
          const pc = await getOrCreatePeer(remoteUid);
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          await sendGroupCallSignaling(call.id, {
            type: 'offer',
            from: currentUserId,
            to: remoteUid,
            sdp: { type: offer.type, sdp: offer.sdp },
          });
        } catch (err) {
          console.warn('[ActiveGroupCall] Offer creation notice:', err);
        }
      }
    });
  }, [participantsKey, mediaReady, call.id, currentUserId, getOrCreatePeer, closePeer]);

  // Toggle Microphone
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }
    updateGroupCallParticipantState({
      callId: call.id,
      userId: currentUserId,
      isMuted: nextMuted,
      isSpeaking: false,
    }).catch(() => {});
  };

  // Toggle Video Camera (renegotiate with peers if adding a brand-new video track)
  const toggleVideo = async () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);

    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((t) => {
          t.enabled = !nextVideoOff;
        });
      } else if (!nextVideoOff) {
        try {
          const videoStream = await requestMediaStream({
            video: { facingMode },
            audio: false,
          });
          const newTrack = videoStream.getVideoTracks()[0];
          if (newTrack) {
            localStreamRef.current.addTrack(newTrack);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
            // Add track & renegotiate with all active peers
            peersRef.current.forEach(async (pc, remoteUid) => {
              try {
                pc.addTrack(newTrack, localStreamRef.current!);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await sendGroupCallSignaling(call.id, {
                  type: 'offer',
                  from: currentUserId,
                  to: remoteUid,
                  sdp: { type: offer.type, sdp: offer.sdp },
                });
              } catch {}
            });
          }
        } catch (e) {
          console.warn('[ActiveGroupCall] Error enabling video:', e);
          setIsVideoOff(true);
          return;
        }
      }
    }

    updateGroupCallParticipantState({
      callId: call.id,
      userId: currentUserId,
      isVideoOff: nextVideoOff,
    }).catch(() => {});
  };

  // Switch Camera
  const handleSwitchCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (localStreamRef.current && !isVideoOff) {
      const oldTracks = localStreamRef.current.getVideoTracks();
      try {
        const newStream = await requestMediaStream({
          video: { facingMode: nextMode },
          audio: false,
        });
        const newTrack = newStream.getVideoTracks()[0];
        if (newTrack) {
          oldTracks.forEach((t) => {
            t.stop();
            localStreamRef.current?.removeTrack(t);
          });
          localStreamRef.current.addTrack(newTrack);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          // Replace video sender track seamlessly without renegotiation
          peersRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(newTrack).catch(() => {});
            }
          });
        }
      } catch (e) {
        console.warn('[ActiveGroupCall] Camera switch notice:', e);
      }
    }
  };

  // Leave or End Call
  const handleLeaveCall = async () => {
    try {
      await leaveGroupCall({ callId: call.id, userId: currentUserId });
    } catch (e) {
      console.warn('leaveGroupCall notice:', e);
    }
    onCallEnded();
  };

  const handleEndCallForEveryone = async () => {
    try {
      await endGroupCall(call.id);
    } catch (e) {
      console.warn('endGroupCall notice:', e);
    }
    onCallEnded();
  };

  // Observe stage container dimensions for truly adaptive Grid View sizing
  useEffect(() => {
    if (isMinimized) return;
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMinimized]);

  // Participants list derived from participantDetails or participants array
  const participantEntries: GroupCallParticipant[] = (call.participants || []).map((uid) => {
    const detail = call.participantDetails?.[uid];
    if (uid === currentUserId) {
      return {
        userId: uid,
        name: currentUser.name || 'You',
        avatarUrl: currentUser.avatarUrl,
        phone: currentUser.phoneNumber,
        joinedAt: detail?.joinedAt || new Date().toISOString(),
        isMuted,
        isVideoOff,
        isSpeaking: isSpeakingLocal,
      };
    }
    return (
      detail || {
        userId: uid,
        name: 'Member',
        joinedAt: new Date().toISOString(),
        isMuted: false,
        isVideoOff: call.type === 'voice',
        isSpeaking: false,
      }
    );
  });

  // Reset pinned user if they leave the call
  useEffect(() => {
    if (pinnedUserId && !participantEntries.some((p) => p.userId === pinnedUserId)) {
      setPinnedUserId(null);
      setLayoutMode('grid');
    }
  }, [pinnedUserId, participantEntries]);

  // Adaptive Grid View geometry computed from active participant count & stage dimensions
  const gridLayout = useMemo(() => {
    const count = participantEntries.length;
    const isLandscape = stageSize.width >= 640 && stageSize.width > stageSize.height * 0.92;
    const isUltraWide = stageSize.width >= 1024;
    const isVeryNarrow = stageSize.width < 420;

    let cols = 1;
    let rows = 1;
    let scrollable = false;
    let density: 'hero' | 'comfortable' | 'compact' = 'comfortable';

    if (count <= 1) {
      cols = 1;
      rows = 1;
      density = 'hero';
    } else if (count === 2) {
      cols = isLandscape ? 2 : 1;
      rows = isLandscape ? 1 : 2;
      density = 'hero';
    } else if (count === 3) {
      cols = isUltraWide ? 3 : 2;
      rows = isUltraWide ? 1 : 2;
      density = 'comfortable';
    } else if (count === 4) {
      cols = 2;
      rows = 2;
      density = 'comfortable';
    } else if (count <= 6) {
      cols = isLandscape ? 3 : 2;
      rows = isLandscape ? 2 : 3;
      density = 'comfortable';
    } else if (count <= 9) {
      cols = isVeryNarrow ? 2 : 3;
      rows = Math.ceil(count / cols);
      scrollable = isVeryNarrow;
      density = 'compact';
    } else {
      cols = isUltraWide ? 4 : isLandscape ? 3 : 2;
      rows = Math.ceil(count / cols);
      scrollable = true;
      density = 'compact';
    }

    return { cols, rows, scrollable, density, count };
  }, [participantEntries.length, stageSize.width, stageSize.height]);

  const effectiveSpotlightUserId = useMemo(() => {
    if (pinnedUserId && participantEntries.some((p) => p.userId === pinnedUserId)) {
      return pinnedUserId;
    }
    const speakingOther = participantEntries.find((p) => p.userId !== currentUserId && p.isSpeaking);
    if (speakingOther) return speakingOther.userId;
    const firstOther = participantEntries.find((p) => p.userId !== currentUserId);
    return firstOther?.userId || participantEntries[0]?.userId || null;
  }, [pinnedUserId, participantEntries, currentUserId]);

  // Always mount hidden remote audio elements even when minimized so audio never drops!
  const minimizedRemoteAudios = isMinimized
    ? participantEntries
        .filter((p) => p.userId !== currentUserId)
        .map((p) => (
          <RemoteParticipantMedia
            key={`min_audio_${p.userId}`}
            stream={remoteStreams[p.userId]}
            isSpeakerOn={isSpeakerOn}
            showVideo={false}
          />
        ))
    : null;

  // Minimized Telegram-style persistent live floating bar
  if (isMinimized) {
    return (
      <>
        {minimizedRemoteAudios}
        <div
          className="bg-gradient-to-r from-[#087F75] via-teal-700 to-emerald-700 text-white px-3.5 py-2 flex items-center justify-between shadow-lg z-40 shrink-0 select-none border-b border-white/15"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div
            onClick={onToggleMinimize}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/20 shrink-0">
              <Radio className="w-4 h-4 text-emerald-200 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs truncate">
                  {call.chatTitle || (isRtl ? 'محادثة صوتية جماعية' : 'Group Voice Chat')}
                </span>
                <span className="text-[10px] bg-white/20 font-mono px-1.5 py-0.5 rounded-full">
                  {formatDuration(callDuration)}
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/90 truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping inline-block" />
                <span>
                  {participantEntries.length} {isRtl ? 'في المكالمة' : 'in call'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isMuted ? 'bg-rose-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
              title={isMuted ? (isRtl ? 'إلغاء الكتم' : 'Unmute') : (isRtl ? 'كتم الصوت' : 'Mute')}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onToggleMinimize}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
              title={isRtl ? 'تكبير المكالمة' : 'Expand Call'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleLeaveCall}
              className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center text-white transition-colors cursor-pointer"
              title={isRtl ? 'مغادرة المكالمة' : 'Leave Call'}
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // Full Screen Telegram-grade Group Call Room
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0B1118] text-white select-none overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Ambient Subtle Radial Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(8,127,117,0.22),_transparent_60%)]" />

      {/* Top Header Bar */}
      <div className="relative px-4 py-3.5 flex items-center justify-between border-b border-white/10 bg-slate-900/60 backdrop-blur-xl shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title={isRtl ? 'تصغير' : 'Minimize'}
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}

          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-white truncate max-w-[200px] sm:max-w-xs">
              {call.chatTitle || (isRtl ? 'مكالمة جماعية' : 'Group Call')}
            </h2>
            <div className="flex items-center gap-2 text-xs text-teal-300 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono">{formatDuration(callDuration)}</span>
              </span>
              <span className="opacity-50">•</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {participantEntries.length} {isRtl ? 'مشاركين' : 'active'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Grid View / Spotlight View Toggle */}
          {participantEntries.length > 1 && (
            <div className="flex items-center p-0.5 rounded-full bg-white/10 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setLayoutMode('grid');
                  setPinnedUserId(null);
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  layoutMode === 'grid'
                    ? 'bg-[#087F75] text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title={isRtl ? 'عرض الشبكة' : 'Grid View'}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isRtl ? 'شبكة' : 'Grid'}</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('spotlight')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  layoutMode === 'spotlight'
                    ? 'bg-[#087F75] text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title={isRtl ? 'عرض المتحدث' : 'Speaker View'}
              >
                <Focus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isRtl ? 'التركيز' : 'Focus'}</span>
              </button>
            </div>
          )}

          <span className="px-2.5 py-1 rounded-full bg-teal-500/15 border border-teal-400/30 text-teal-300 text-[11px] font-bold flex items-center gap-1.5">
            {call.type === 'video' ? (
              <Video className="w-3.5 h-3.5" />
            ) : (
              <Radio className="w-3.5 h-3.5 animate-pulse" />
            )}
            <span className="hidden xs:inline">
              {call.type === 'video' ? (isRtl ? 'فيديو جماعي' : 'Group Video') : (isRtl ? 'صوت جماعي' : 'Voice Chat')}
            </span>
          </span>
        </div>
      </div>

      {mediaError && (
        <div className="relative z-20 mx-4 mt-3 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-200 text-xs text-center">
          {mediaError}
        </div>
      )}

      {/* Adaptive Grid View & Spotlight Stage */}
      <div
        ref={stageRef}
        className={`relative z-10 flex-1 min-h-0 p-3 sm:p-4 flex flex-col items-center justify-center ${
          gridLayout.scrollable && layoutMode === 'grid' ? 'overflow-y-auto justify-start' : 'overflow-hidden'
        }`}
      >
        {(() => {
          const renderParticipantTile = (
            participant: GroupCallParticipant,
            options: {
              tileClassName?: string;
              compact?: boolean;
              hero?: boolean;
              isPinned?: boolean;
            } = {}
          ) => {
            const isSelf = participant.userId === currentUserId;
            const speaking = isSelf ? isSpeakingLocal : participant.isSpeaking;
            const muted = isSelf ? isMuted : participant.isMuted;
            const videoOff = isSelf ? isVideoOff : participant.isVideoOff;
            const remoteStream = !isSelf ? remoteStreams[participant.userId] : undefined;
            const hasRemoteVideo = Boolean(
              remoteStream && remoteStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live') && !videoOff
            );
            const peerConnState = !isSelf ? peerStates[participant.userId] : 'connected';
            const avatarSizeClass = options.compact
              ? 'w-12 h-12 sm:w-14 sm:h-14 text-base'
              : options.hero
              ? 'w-20 h-20 sm:w-24 sm:h-24 text-2xl'
              : 'w-16 h-16 sm:w-20 sm:h-20 text-xl';

            return (
              <motion.div
                key={participant.userId}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                onDoubleClick={() => {
                  if (participantEntries.length <= 1) return;
                  if (layoutMode === 'spotlight' && pinnedUserId === participant.userId) {
                    setPinnedUserId(null);
                    setLayoutMode('grid');
                  } else {
                    setPinnedUserId(participant.userId);
                    setLayoutMode('spotlight');
                  }
                }}
                className={`group relative w-full h-full rounded-3xl bg-slate-900/85 backdrop-blur-md border overflow-hidden flex flex-col items-center justify-center p-3 transition-shadow shadow-lg ${
                  speaking
                    ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-emerald-500/20'
                    : 'border-white/10 hover:border-white/20'
                } ${options.tileClassName || ''}`}
              >
                {/* Remote Audio & Video playback */}
                {!isSelf && (
                  <RemoteParticipantMedia
                    stream={remoteStream}
                    isSpeakerOn={isSpeakerOn}
                    showVideo={hasRemoteVideo}
                  />
                )}

                {/* Local Video Feed or Avatar */}
                {isSelf && !videoOff ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover ${
                      facingMode === 'user' ? 'scale-x-[-1]' : ''
                    }`}
                  />
                ) : !hasRemoteVideo ? (
                  <div className="relative flex items-center justify-center">
                    {speaking && (
                      <>
                        <span className="absolute w-24 h-24 rounded-full bg-emerald-500/25 animate-ping" />
                        <span className="absolute w-20 h-20 rounded-full bg-emerald-400/20 animate-pulse" />
                      </>
                    )}

                    <div
                      className={`${avatarSizeClass} rounded-full flex items-center justify-center font-extrabold text-white shadow-xl transition-transform ${
                        speaking ? 'scale-105 ring-4 ring-emerald-400/80' : ''
                      } ${
                        participant.avatarUrl
                          ? 'border border-white/20'
                          : 'bg-gradient-to-tr from-[#087F75] via-teal-600 to-emerald-400'
                      }`}
                    >
                      {participant.avatarUrl ? (
                        <img
                          src={participant.avatarUrl}
                          alt={participant.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span>{participant.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Top-left Pin / Focus Button (shown when > 1 participant) */}
                {participantEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (layoutMode === 'spotlight' && options.isPinned) {
                        setPinnedUserId(null);
                        setLayoutMode('grid');
                      } else {
                        setPinnedUserId(participant.userId);
                        setLayoutMode('spotlight');
                      }
                    }}
                    className={`absolute top-2.5 left-2.5 w-7 h-7 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                      options.isPinned
                        ? 'bg-[#087F75] text-white opacity-100'
                        : 'bg-black/45 text-white/80 hover:text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 focus:opacity-100'
                    }`}
                    title={
                      options.isPinned
                        ? isRtl
                          ? 'العودة لعرض الشبكة'
                          : 'Return to Grid View'
                        : isRtl
                        ? 'تثبيت المشارك'
                        : 'Pin participant'
                    }
                  >
                    {options.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                )}

                {/* Real-time Status Indicator Pills Overlay */}
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-none">
                  {speaking && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-md animate-pulse">
                      <Radio className="w-3 h-3" />
                      {!options.compact && <span>{isRtl ? 'يتحدث' : 'Speaking'}</span>}
                    </span>
                  )}
                  {muted && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm backdrop-blur-md">
                      <MicOff className="w-3 h-3" />
                      {!options.compact && <span>{isRtl ? 'مكتوم' : 'Muted'}</span>}
                    </span>
                  )}
                  {videoOff && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-200 text-[10px] font-semibold flex items-center gap-1 shadow-sm backdrop-blur-md border border-white/10">
                      <VideoOff className="w-3 h-3" />
                      {!options.compact && <span>{isRtl ? 'بدون كاميرا' : 'Camera Off'}</span>}
                    </span>
                  )}
                </div>

                {/* Top-right Connection status badge for remote peers */}
                {!isSelf && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-[10px] font-semibold flex items-center gap-1 text-slate-200">
                    <Wifi
                      className={`w-3 h-3 ${
                        peerConnState === 'connected'
                          ? 'text-emerald-400'
                          : peerConnState === 'failed' || peerConnState === 'disconnected'
                          ? 'text-rose-400'
                          : 'text-amber-300 animate-pulse'
                      }`}
                    />
                    {!options.compact && (
                      <span>
                        {peerConnState === 'connected'
                          ? isRtl
                            ? 'متصل'
                            : 'Live'
                          : isRtl
                          ? 'جاري الاتصال...'
                          : 'Connecting...'}
                      </span>
                    )}
                  </div>
                )}

                {/* Bottom Name & Audio Status Overlay */}
                <div
                  className={`absolute bottom-2 left-2 right-2 flex items-center justify-between ${
                    options.compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
                  } rounded-2xl bg-black/55 backdrop-blur-md font-semibold border border-white/10`}
                >
                  <span className="truncate max-w-[75%] text-white">
                    {isSelf ? `${participant.name} (${isRtl ? 'أنت' : 'You'})` : participant.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {muted ? (
                      <span className="w-5 h-5 rounded-full bg-rose-500/30 text-rose-300 flex items-center justify-center">
                        <MicOff className="w-3 h-3" />
                      </span>
                    ) : speaking ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-300 flex items-center justify-center animate-pulse">
                        <Radio className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-white/15 text-slate-200 flex items-center justify-center">
                        <Mic className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          };

          // Spotlight / Focus Mode (primary speaker + scrollable filmstrip)
          if (layoutMode === 'spotlight' && participantEntries.length > 1 && effectiveSpotlightUserId) {
            const featured =
              participantEntries.find((p) => p.userId === effectiveSpotlightUserId) || participantEntries[0];
            const others = participantEntries.filter((p) => p.userId !== featured.userId);

            return (
              <div className="w-full max-w-5xl h-full flex flex-col gap-3 min-h-0">
                <div className="flex-1 min-h-0">
                  {renderParticipantTile(featured, { hero: true, isPinned: true })}
                </div>
                {others.length > 0 && (
                  <div className="h-28 sm:h-32 shrink-0 flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
                    {others.map((p) => (
                      <div key={p.userId} className="w-36 sm:w-44 h-full shrink-0">
                        {renderParticipantTile(p, { compact: true, isPinned: false })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // Adaptive Auto-Adjusting Grid View (fills viewport evenly for 1..9, scrolls cleanly for 10+)
          const isThreeCenteredLast =
            gridLayout.count === 3 && gridLayout.cols === 2 && gridLayout.rows === 2;

          return (
            <div
              className={`w-full max-w-6xl grid gap-2.5 sm:gap-3.5 transition-all ${
                gridLayout.scrollable ? 'auto-rows-[minmax(150px,1fr)]' : 'h-full'
              }`}
              style={{
                gridTemplateColumns: `repeat(${gridLayout.cols}, minmax(0, 1fr))`,
                ...(gridLayout.scrollable
                  ? {}
                  : { gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))` }),
              }}
            >
              <AnimatePresence mode="popLayout">
                {participantEntries.map((participant, idx) => {
                  const isLastCentered = isThreeCenteredLast && idx === 2;
                  return (
                    <div
                      key={participant.userId}
                      className={`min-h-0 min-w-0 flex items-center justify-center ${
                        isLastCentered ? 'col-span-2 w-full sm:w-2/3 mx-auto h-full' : 'h-full'
                      } ${
                        gridLayout.count === 1 ? 'max-w-xl max-h-[520px] w-full mx-auto my-auto' : ''
                      }`}
                    >
                      {renderParticipantTile(participant, {
                        hero: gridLayout.density === 'hero',
                        compact: gridLayout.density === 'compact',
                        isPinned: pinnedUserId === participant.userId,
                      })}
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          );
        })()}
      </div>

      {/* Waiting hint when only 1 person in the room */}
      {participantEntries.length === 1 && (
        <div className="relative z-20 px-4 pb-2 text-center">
          <p className="text-xs text-slate-400">
            {isRtl
              ? 'في انتظار انضمام أعضاء المجموعة من شريط المكالمة المباشر في الدردشة...'
              : 'Waiting for group members to tap Join from the live chat banner...'}
          </p>
        </div>
      )}

      {/* Telegram Floating Call Controls Bottom Bar */}
      <div className="relative z-20 p-4 sm:p-5 pb-[max(18px,env(safe-area-inset-bottom))] bg-slate-900/85 border-t border-white/10 backdrop-blur-xl flex flex-col items-center gap-3 shrink-0">
        <div className="flex items-center justify-center gap-3 sm:gap-5 flex-wrap">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 ${
              isMuted
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
                : 'bg-white/12 hover:bg-white/20 text-white border border-white/15'
            }`}
            title={isMuted ? (isRtl ? 'إلغاء الكتم' : 'Unmute') : (isRtl ? 'كتم المايك' : 'Mute')}
          >
            {isMuted ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
          </button>

          {/* Video Toggle Button */}
          <button
            type="button"
            onClick={toggleVideo}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 ${
              isVideoOff
                ? 'bg-white/12 hover:bg-white/20 text-slate-300 border border-white/15'
                : 'bg-[#087F75] hover:bg-teal-600 text-white shadow-teal-600/30'
            }`}
            title={
              isVideoOff
                ? isRtl
                  ? 'تشغيل الكاميرا'
                  : 'Turn on camera'
                : isRtl
                ? 'إيقاف الكاميرا'
                : 'Turn off camera'
            }
          >
            {isVideoOff ? <VideoOff className="w-5.5 h-5.5" /> : <Video className="w-5.5 h-5.5" />}
          </button>

          {/* Switch Camera */}
          {!isVideoOff && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="w-13 h-13 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95"
              title={isRtl ? 'تبديل الكاميرا' : 'Switch Camera'}
            >
              <SwitchCamera className="w-5.5 h-5.5" />
            </button>
          )}

          {/* Speaker Toggle */}
          <button
            type="button"
            onClick={() => setIsSpeakerOn((prev) => !prev)}
            className={`w-13 h-13 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md active:scale-95 border border-white/15 ${
              isSpeakerOn ? 'bg-white/12 hover:bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}
            title={isSpeakerOn ? (isRtl ? 'كتم مكبر الصوت' : 'Mute Speaker') : (isRtl ? 'تشغيل مكبر الصوت' : 'Unmute Speaker')}
          >
            {isSpeakerOn ? <Volume2 className="w-5.5 h-5.5" /> : <VolumeX className="w-5.5 h-5.5" />}
          </button>

          {/* Leave Call Button */}
          <button
            type="button"
            onClick={handleLeaveCall}
            className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-all cursor-pointer active:scale-95"
            title={isRtl ? 'مغادرة المكالمة' : 'Leave Call'}
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          {/* End for Everyone (Creator only) */}
          {isCreator && (
            <button
              type="button"
              onClick={handleEndCallForEveryone}
              className="px-3.5 py-2.5 rounded-full bg-rose-950/90 hover:bg-rose-900 border border-rose-500/40 text-rose-200 text-xs font-bold transition-all cursor-pointer"
            >
              {isRtl ? 'إنهاء للجميع' : 'End for All'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
