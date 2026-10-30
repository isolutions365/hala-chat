/**
 * Hala WebRTC and Call Audio Subsystem
 * Provides WebRTC peer connection management, Firestore-backed signaling,
 * device media capture, and Web Audio API synthesized ringtones.
 */

import { SignalingData } from '../types';
import { sendCallSignaling, subscribeToCallSignaling } from './firebase';

export interface WebRTCManagerOptions {
  callId: string;
  currentUserId: string;
  targetUserId: string;
  isVideo: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onTrackEvent?: (event: RTCTrackEvent) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (error: Error) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

let activeAudioCtx: AudioContext | null = null;
let activeRingInterval: any = null;

/**
 * Web Audio Ringtone Synth for Outgoing Ringing
 */
export function startOutgoingRingTone(): void {
  stopRingTone();
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    activeAudioCtx = new AudioContextClass();
    if (activeAudioCtx.state === 'suspended') {
      activeAudioCtx.resume().catch(() => {});
    }

    const playRingPulse = () => {
      if (!activeAudioCtx || activeAudioCtx.state === 'closed') return;
      try {
        const osc1 = activeAudioCtx.createOscillator();
        const osc2 = activeAudioCtx.createOscillator();
        const gain = activeAudioCtx.createGain();

        osc1.type = 'sine';
        osc1.frequency.value = 440; // Hz
        osc2.type = 'sine';
        osc2.frequency.value = 480; // Hz

        const now = activeAudioCtx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.2);
        gain.gain.linearRampToValueAtTime(0, now + 1.3);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(activeAudioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.35);
        osc2.stop(now + 1.35);
      } catch (e) {
        console.warn('Ring pulse error:', e);
      }
    };

    playRingPulse();
    activeRingInterval = setInterval(playRingPulse, 3500);
  } catch (err) {
    console.warn('AudioContext ring error:', err);
  }
}

/**
 * Web Audio Ringtone Synth for Incoming Call Chime (Warm Middle East Marimba/Chime)
 */
export function startIncomingRingTone(): void {
  stopRingTone();
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    activeAudioCtx = new AudioContextClass();
    if (activeAudioCtx.state === 'suspended') {
      activeAudioCtx.resume().catch(() => {});
    }

    const melodyNotes = [523.25, 659.25, 783.99, 1046.5, 783.99, 880.0]; // C5, E5, G5, C6, G5, A5

    const playChimeSequence = () => {
      if (!activeAudioCtx || activeAudioCtx.state === 'closed') return;

      melodyNotes.forEach((freq, index) => {
        if (!activeAudioCtx) return;
        const now = activeAudioCtx.currentTime + index * 0.18;
        const osc = activeAudioCtx.createOscillator();
        const gain = activeAudioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(activeAudioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.55);
      });

      // Haptic vibration if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([200, 100, 200, 100, 400]);
        } catch {
          // ignore
        }
      }
    };

    playChimeSequence();
    activeRingInterval = setInterval(playChimeSequence, 2800);
  } catch (err) {
    console.warn('AudioContext incoming ring error:', err);
  }
}

/**
 * Stop any active synthesized ringtone
 */
export function stopRingTone(): void {
  if (activeRingInterval) {
    clearInterval(activeRingInterval);
    activeRingInterval = null;
  }
  if (activeAudioCtx) {
    try {
      activeAudioCtx.close();
    } catch {
      // ignore
    }
    activeAudioCtx = null;
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch {
      // ignore
    }
  }
}

/**
 * Hala WebRTC Call Session Controller
 */
export class HalaWebRTCController {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private signalingUnsubscribe: (() => void) | null = null;
  private isCaller: boolean = false;
  private options: WebRTCManagerOptions;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(options: WebRTCManagerOptions) {
    this.options = options;
  }

  /**
   * Initializes local media and creates peer connection
   */
  public async initMedia(isCaller: boolean): Promise<MediaStream | null> {
    this.isCaller = isCaller;
    const role = isCaller ? 'Caller' : 'Callee';
    console.log(`[WebRTC] [${role}] Initializing media. Requested video: ${this.options.isVideo}`);

    try {
      if (this.options.isVideo) {
        // Step 1: Try strict/ideal video constraints
        try {
          console.log(`[WebRTC] [${role}] Requesting getUserMedia with ideal video constraints...`);
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
          console.log(`[WebRTC] [${role}] getUserMedia succeeded with ideal constraints.`);
        } catch (idealErr) {
          console.warn(`[WebRTC] [${role}] Ideal video constraints failed, attempting fallback simple video constraints:`, idealErr);
          // Step 2: Try simple video constraints (without facingMode/resolution strictness)
          try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: true,
            });
            console.log(`[WebRTC] [${role}] getUserMedia succeeded with simple video constraints.`);
          } catch (simpleVideoErr) {
            console.warn(`[WebRTC] [${role}] Simple video constraints also failed, falling back to audio-only:`, simpleVideoErr);
            // Step 3: Fall back to audio-only if camera unavailable
            try {
              this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              console.log(`[WebRTC] [${role}] getUserMedia succeeded with audio-only fallback.`);
            } catch (audioErr) {
              console.error(`[WebRTC] [${role}] All getUserMedia attempts failed:`, audioErr);
              this.localStream = null;
            }
          }
        }
      } else {
        // Audio call requested
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log(`[WebRTC] [${role}] Audio getUserMedia succeeded.`);
        } catch (audioErr) {
          console.error(`[WebRTC] [${role}] Audio getUserMedia failed:`, audioErr);
          this.localStream = null;
        }
      }

      // Log track permissions & status
      if (this.localStream) {
        const tracks = this.localStream.getTracks();
        console.log(`[WebRTC] [${role}] Local MediaStream obtained with ${tracks.length} track(s):`);
        tracks.forEach((t) => {
          console.log(`  - Track kind: "${t.kind}", label: "${t.label}", enabled: ${t.enabled}, readyState: "${t.readyState}", id: ${t.id}`);
        });
      } else {
        console.warn(`[WebRTC] [${role}] Local MediaStream is null! No media tracks available.`);
      }

      this.setupPeerConnection();
      this.listenForSignaling();

      return this.localStream;
    } catch (err: any) {
      console.warn(`[WebRTC] [${role}] Error in initMedia:`, err);
      if (this.options.onError) {
        this.options.onError(err);
      }
      return null;
    }
  }

  private setupPeerConnection(): void {
    const role = this.isCaller ? 'Caller' : 'Callee';
    if (typeof RTCPeerConnection === 'undefined') {
      console.warn(`[WebRTC] [${role}] RTCPeerConnection is not supported in this environment`);
      return;
    }

    console.log(`[WebRTC] [${role}] Creating RTCPeerConnection...`);
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    this.remoteStream = new MediaStream();

    // Attach local tracks BEFORE offer/answer creation
    if (this.localStream) {
      const tracks = this.localStream.getTracks();
      console.log(`[WebRTC] [${role}] Attaching ${tracks.length} local track(s) to RTCPeerConnection BEFORE SDP negotiation:`);
      tracks.forEach((track) => {
        if (this.pc && this.localStream) {
          const sender = this.pc.addTrack(track, this.localStream);
          console.log(`[WebRTC] [${role}] -> addTrack executed for kind="${track.kind}" (id: ${track.id}, enabled: ${track.enabled}). RTCRtpSender track id: ${sender.track?.id}`);
        }
      });
    } else {
      console.warn(`[WebRTC] [${role}] WARNING: Setting up PeerConnection with NO localStream! Local tracks missing.`);
    }

    // Ensure audio transceiver direction is set to sendrecv
    try {
      if (this.pc) {
        const hasAudioSender = this.pc.getSenders().some((s) => s.track && s.track.kind === 'audio');
        if (!hasAudioSender) {
          console.log(`[WebRTC] [${role}] Adding audio transceiver with direction sendrecv`);
          this.pc.addTransceiver('audio', { direction: 'sendrecv' });
        }
      }
    } catch (e) {
      console.warn(`[WebRTC] [${role}] Transceiver addition notice:`, e);
    }

    // Handle remote tracks received from peer
    this.pc.ontrack = (event) => {
      console.log(`[WebRTC] [${role}] >>> ONTRACK EVENT FIRED! Incoming remote track kind="${event.track.kind}" (id: ${event.track.id}, enabled: ${event.track.enabled}, readyState: "${event.track.readyState}"). Streams attached: ${event.streams.length}`);

      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }

      // Re-emit a distinct MediaStream instance so React detects state update and triggers re-render
      const tracks = this.remoteStream.getTracks();
      console.log(`[WebRTC] [${role}] Remote MediaStream now contains ${tracks.length} track(s):`, tracks.map((t) => t.kind));
      const freshRemoteStream = new MediaStream(tracks);

      if (this.options.onTrackEvent) {
        this.options.onTrackEvent(event);
      }

      if (this.options.onRemoteStream) {
        console.log(`[WebRTC] [${role}] Calling onRemoteStream callback with fresh MediaStream object...`);
        this.options.onRemoteStream(freshRemoteStream);
      }
    };

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] [${role}] Generated ICE candidate: ${event.candidate.candidate}`);
        sendCallSignaling(this.options.callId, {
          type: 'candidate',
          from: this.options.currentUserId,
          to: this.options.targetUserId,
          candidate: event.candidate.toJSON(),
        }).catch((e) => console.warn(`[WebRTC] [${role}] Candidate send notice:`, e));
      } else {
        console.log(`[WebRTC] [${role}] ICE candidate gathering complete.`);
      }
    };

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        console.log(`[WebRTC] [${role}] PeerConnection state changed to: "${this.pc.connectionState}" (Signaling state: "${this.pc.signalingState}", ICE state: "${this.pc.iceConnectionState}")`);
        if (this.options.onConnectionStateChange) {
          this.options.onConnectionStateChange(this.pc.connectionState);
        }
      }
    };
  }

  /**
   * Listen for incoming signals (Offer / Answer / ICE Candidates) from peer
   */
  private listenForSignaling(): void {
    const role = this.isCaller ? 'Caller' : 'Callee';
    console.log(`[WebRTC] [${role}] Subscribing to call signaling for callId="${this.options.callId}" (targetUserId="${this.options.targetUserId}")...`);

    this.signalingUnsubscribe = subscribeToCallSignaling(
      this.options.callId,
      this.options.currentUserId,
      async (signal: SignalingData) => {
        if (!this.pc) return;

        try {
          if (signal.type === 'offer' && !this.isCaller) {
            console.log(`[WebRTC] [Callee] Incoming SDP Offer received! Offer SDP check:`);
            const offerSdp = signal.sdp.sdp || '';
            console.log(`  - Has m=audio: ${offerSdp.includes('m=audio')}`);
            console.log(`  - Has m=video: ${offerSdp.includes('m=video')}`);
            console.log(`[WebRTC] [Callee] FULL SDP Offer:\n`, offerSdp);

            // Verify local senders BEFORE creating answer
            const currentSenders = this.pc.getSenders();
            console.log(`[WebRTC] [Callee] Local senders attached BEFORE creating SDP Answer: count=${currentSenders.length}`);
            currentSenders.forEach((s, idx) => {
              console.log(`  - Sender #${idx}: track kind="${s.track?.kind}", enabled=${s.track?.enabled}, readyState="${s.track?.readyState}"`);
            });

            await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            console.log(`[WebRTC] [Callee] Remote description (Offer) set successfully.`);

            // Apply any queued candidates
            while (this.pendingCandidates.length > 0) {
              const cand = this.pendingCandidates.shift();
              if (cand) {
                console.log(`[WebRTC] [Callee] Applying buffered ICE candidate...`);
                await this.pc.addIceCandidate(new RTCIceCandidate(cand));
              }
            }

            const answer = await this.pc.createAnswer();
            const answerSdp = answer.sdp || '';
            console.log(`[WebRTC] [Callee] Created SDP Answer! Answer SDP check:`);
            console.log(`  - Has m=audio: ${answerSdp.includes('m=audio')}`);
            console.log(`  - Has m=video: ${answerSdp.includes('m=video')}`);
            console.log(`[WebRTC] [Callee] FULL SDP Answer:\n`, answerSdp);

            await this.pc.setLocalDescription(answer);
            console.log(`[WebRTC] [Callee] Local description (Answer) set successfully.`);

            await sendCallSignaling(this.options.callId, {
              type: 'answer',
              from: this.options.currentUserId,
              to: this.options.targetUserId,
              sdp: answer,
            });
            console.log(`[WebRTC] [Callee] Sent SDP Answer to signaling backend.`);
          } else if (signal.type === 'answer' && this.isCaller) {
            console.log(`[WebRTC] [Caller] Incoming SDP Answer received! Answer SDP check:`);
            const answerSdp = signal.sdp.sdp || '';
            console.log(`  - Has m=audio: ${answerSdp.includes('m=audio')}`);
            console.log(`  - Has m=video: ${answerSdp.includes('m=video')}`);
            console.log(`[WebRTC] [Caller] FULL SDP Answer:\n`, answerSdp);

            if (this.pc.signalingState !== 'stable') {
              await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              console.log(`[WebRTC] [Caller] Remote description (Answer) set successfully.`);
              while (this.pendingCandidates.length > 0) {
                const cand = this.pendingCandidates.shift();
                if (cand) {
                  console.log(`[WebRTC] [Caller] Applying buffered ICE candidate...`);
                  await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                }
              }
            }
          } else if (signal.type === 'candidate' && signal.candidate) {
            console.log(`[WebRTC] [${role}] Received ICE candidate from peer.`);
            if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
              await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
              console.log(`[WebRTC] [${role}] Added ICE candidate immediately.`);
            } else {
              console.log(`[WebRTC] [${role}] Buffering ICE candidate until remote description is set.`);
              this.pendingCandidates.push(signal.candidate);
            }
          }
        } catch (err) {
          console.warn(`[WebRTC] [${role}] Signaling processing error:`, err);
        }
      }
    );
  }

  /**
   * Caller initiates SDP offer
   */
  public async createAndSendOffer(): Promise<void> {
    if (!this.pc) return;
    try {
      console.log(`[WebRTC] [Caller] Creating SDP Offer... (isVideo: ${this.options.isVideo})`);
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.options.isVideo,
      });
      const offerSdp = offer.sdp || '';
      console.log(`[WebRTC] [Caller] SDP Offer created! Offer SDP check:`);
      console.log(`  - Has m=audio: ${offerSdp.includes('m=audio')}`);
      console.log(`  - Has m=video: ${offerSdp.includes('m=video')}`);
      console.log(`[WebRTC] [Caller] FULL SDP Offer:\n`, offerSdp);

      await this.pc.setLocalDescription(offer);
      console.log(`[WebRTC] [Caller] Local description (Offer) set successfully.`);

      await sendCallSignaling(this.options.callId, {
        type: 'offer',
        from: this.options.currentUserId,
        to: this.options.targetUserId,
        sdp: offer,
      });
      console.log(`[WebRTC] [Caller] Sent SDP Offer to signaling backend.`);
    } catch (err) {
      console.warn('[WebRTC] [Caller] Error creating offer:', err);
    }
  }

  /**
   * Mute / Unmute local microphone
   */
  public toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Enable / Disable local camera
   */
  public toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Flip camera facing mode (front vs rear)
   */
  public async switchCamera(): Promise<MediaStream | null> {
    if (!this.localStream) return null;
    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    if (!currentVideoTrack) return null;

    try {
      currentVideoTrack.stop();
      const currentFacing = currentVideoTrack.getSettings().facingMode;
      const newFacing = currentFacing === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
      });
      const newTrack = newStream.getVideoTracks()[0];

      if (this.pc) {
        const senders = this.pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newTrack);
        }
      }

      this.localStream.removeTrack(currentVideoTrack);
      this.localStream.addTrack(newTrack);
      return this.localStream;
    } catch (e) {
      console.warn('Switch camera error:', e);
      return this.localStream;
    }
  }

  /**
   * Terminate call, stop media tracks, close connections
   */
  public close(): void {
    if (this.signalingUnsubscribe) {
      this.signalingUnsubscribe();
      this.signalingUnsubscribe = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop());
      this.remoteStream = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
  }
}
