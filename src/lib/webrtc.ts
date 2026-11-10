/**
 * Hala WebRTC and Call Audio Subsystem
 * Provides WebRTC peer connection management, Firestore-backed signaling,
 * device media capture, and Web Audio API synthesized ringtones.
 */

import { SignalingData } from '../types.ts';
import { sendCallSignaling, subscribeToCallSignaling } from './firebase.ts';

export interface WebRTCManagerOptions {
  callId: string;
  currentUserId: string;
  targetUserId: string;
  isVideo: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onTrackEvent?: (event: RTCTrackEvent) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onError?: (error: Error) => void;
}

export interface CallSignalMetrics {
  rttMs: number | null;
  packetLossPercent: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  videoBitrateBps?: number;
  isAudioPrioritized?: boolean;
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

import { startLoopTone, stopLoopTone } from './sounds.ts';

/**
 * Web Audio Ringtone Synth for Outgoing Ringing
 */
export function startOutgoingRingTone(): void {
  startLoopTone('ringback');
}

/**
 * Web Audio Ringtone Synth for Incoming Call Chime (Warm Middle East Marimba/Chime)
 */
export function startIncomingRingTone(): void {
  startLoopTone('call');
}

/**
 * Stop any active synthesized ringtone
 */
export function stopRingTone(): void {
  stopLoopTone();
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
  private isClosed: boolean = false;

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
              frameRate: { ideal: 24 }
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
              
              // Notify UI that video requested but unavailable
              if (this.options.onError) {
                this.options.onError(new Error('CAMERA_UNAVAILABLE'));
              }
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
        if (this.options.onError) {
          this.options.onError(new Error('MEDIA_INITIALIZATION_FAILED'));
        }
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

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          if (!this.remoteStream!.getTracks().some((t) => t.id === track.id)) {
            this.remoteStream!.addTrack(track);
          }
        });
      }

      if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }

      // Re-emit a distinct MediaStream instance so React detects state update and triggers re-render
      const tracks = this.remoteStream.getTracks();
      console.log(`[WebRTC] [${role}] Remote MediaStream now contains ${tracks.length} track(s):`, tracks.map((t) => `${t.kind}:${t.id}`));
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
        console.log(`[WebRTC] [${role}] PeerConnection state changed: "${this.pc.connectionState}"`);
        if (this.options.onConnectionStateChange) {
          this.options.onConnectionStateChange(this.pc.connectionState);
        }
      }
    };

    // Handle ICE connection state changes explicitly
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc) {
        console.log(`[WebRTC] [${role}] ICE connection state changed: "${this.pc.iceConnectionState}"`);
        if (this.options.onIceConnectionStateChange) {
          this.options.onIceConnectionStateChange(this.pc.iceConnectionState);
        }
      }
    };

    // Handle Signaling state changes
    this.pc.onsignalingstatechange = () => {
      if (this.pc) {
        console.log(`[WebRTC] [${role}] Signaling state changed: "${this.pc.signalingState}"`);
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
        if (!this.pc || this.isClosed) return;

        try {
          if (signal.type === 'offer' && !this.isCaller) {
            console.log(`[WebRTC] [Callee] Incoming SDP Offer received!`);
            
            // Handle Offer when we might already be in a state (Glare)
            if (this.pc.signalingState !== 'stable') {
              console.log(`[WebRTC] [Callee] Signaling state is "${this.pc.signalingState}", rolling back for incoming offer.`);
              await Promise.all([
                this.pc.setLocalDescription({ type: 'rollback' } as any),
                this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
              ]);
            } else {
              await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            }
            
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
            
            // Prioritize H264 in the Answer SDP for better mobile compatibility (Vivo/Android)
            if (answer.sdp) {
              answer.sdp = this.prioritizeH264(answer.sdp);
            }

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
            console.log(`[WebRTC] [Caller] Incoming SDP Answer received! Current state: ${this.pc.signalingState}`);

            // The "Answer First" Fix: If the Answer arrives before we've set our local description,
            // we must wait or handle it. However, usually signaling is ordered.
            // If we are in 'have-local-offer', we can proceed.
            if (this.pc.signalingState === 'have-local-offer') {
              await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              console.log(`[WebRTC] [Caller] Remote description (Answer) set successfully.`);
              
              while (this.pendingCandidates.length > 0) {
                const cand = this.pendingCandidates.shift();
                if (cand) {
                  console.log(`[WebRTC] [Caller] Applying buffered ICE candidate...`);
                  await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                }
              }
            } else {
              console.warn(`[WebRTC] [Caller] Received Answer in unexpected state: ${this.pc.signalingState}. Ignoring or buffering.`);
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
   * Helper to prioritize H264 in SDP (often better for Android/Vivo compatibility)
   */
  private prioritizeH264(sdp: string): string {
    const lines = sdp.split('\r\n');
    const videoLineIndex = lines.findIndex(line => line.startsWith('m=video'));
    if (videoLineIndex === -1) return sdp;

    const mLine = lines[videoLineIndex];
    const parts = mLine.split(' ');
    const payloads = parts.slice(3);

    // Find H264 payload types
    const h264Payloads: string[] = [];
    lines.forEach(line => {
      if (line.startsWith('a=rtpmap:') && line.toLowerCase().includes('h264')) {
        const payload = line.split(':')[1].split(' ')[0];
        h264Payloads.push(payload);
      }
    });

    if (h264Payloads.length === 0) return sdp;

    // Reorder payloads to put H264 first
    const otherPayloads = payloads.filter(p => !h264Payloads.includes(p));
    const newPayloads = [...h264Payloads, ...otherPayloads];
    
    lines[videoLineIndex] = parts.slice(0, 3).join(' ') + ' ' + newPayloads.join(' ');
    return lines.join('\r\n');
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

      // Prioritize H264 in the Offer SDP
      if (offer.sdp) {
        offer.sdp = this.prioritizeH264(offer.sdp);
      }

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
        console.log(`[WebRTC] Local audio track "${track.id}" enabled set to: ${enabled}`);
      });
    }
    if (this.pc) {
      this.pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = enabled;
          console.log(`[WebRTC] Sender audio track "${sender.track.id}" enabled set to: ${enabled}`);
        }
      });
    }
    console.log(`[WebRTC] Microphone ${enabled ? 'unmuted (enabled)' : 'muted (disabled)'}`);
  }

  /**
   * Enable / Disable local camera
   */
  public toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
        console.log(`[WebRTC] Local video track "${track.id}" enabled set to: ${enabled}`);
      });
    }
    if (this.pc) {
      this.pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'video') {
          sender.track.enabled = enabled;
          console.log(`[WebRTC] Sender video track "${sender.track.id}" enabled set to: ${enabled}`);
        }
      });
    }
    console.log(`[WebRTC] Video camera ${enabled ? 'enabled' : 'disabled'}`);
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
   * Attempt ICE Restart if connection drops during ongoing call
   */
  public async restartIce(): Promise<void> {
    if (!this.pc || this.isClosed) return;
    try {
      console.log(`[WebRTC] [${this.isCaller ? 'Caller' : 'Callee'}] Triggering ICE restart...`);
      if (this.isCaller) {
        const offer = await this.pc.createOffer({ iceRestart: true });
        await this.pc.setLocalDescription(offer);
        await sendCallSignaling(this.options.callId, {
          type: 'offer',
          from: this.options.currentUserId,
          to: this.options.targetUserId,
          sdp: offer,
        });
        console.log(`[WebRTC] [Caller] ICE restart offer sent.`);
      }
    } catch (err) {
      console.warn('[WebRTC] ICE restart failed:', err);
    }
  }

  private prevStats: { packetsLost: number; packetsReceived: number } | null = null;
  private currentVideoMaxBitrate: number = 600000;

  /**
   * Auto-negotiation: Dynamically adjusts outgoing video bitrate based on packet loss
   * and latency to ensure audio bandwidth is prioritized over video.
   */
  public async adjustVideoBitrate(
    packetLossPercent: number,
    rttMs: number | null
  ): Promise<{ videoBitrateBps: number; isAudioPrioritized: boolean }> {
    if (!this.pc || !this.options.isVideo) {
      return { videoBitrateBps: this.currentVideoMaxBitrate, isAudioPrioritized: false };
    }

    let targetBitrate = 600000; // 600 kbps default
    let isAudioPrioritized = false;

    if (packetLossPercent >= 15 || (rttMs !== null && rttMs >= 400)) {
      // Severe network congestion: throttle video to 64 kbps to prioritize audio track
      targetBitrate = 64000;
      isAudioPrioritized = true;
    } else if (packetLossPercent >= 8 || (rttMs !== null && rttMs >= 250)) {
      // Moderate network congestion: throttle video to 180 kbps
      targetBitrate = 180000;
      isAudioPrioritized = true;
    } else if (packetLossPercent >= 3 || (rttMs !== null && rttMs >= 150)) {
      // Mild congestion: cap video to 350 kbps
      targetBitrate = 350000;
      isAudioPrioritized = false;
    } else {
      // Normal connection: restore full 600 kbps video quality
      targetBitrate = 600000;
      isAudioPrioritized = false;
    }

    if (Math.abs(this.currentVideoMaxBitrate - targetBitrate) >= 20000) {
      try {
        const senders = this.pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

        if (videoSender && typeof videoSender.getParameters === 'function') {
          const params = videoSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }

          params.encodings[0].maxBitrate = targetBitrate;
          if (targetBitrate <= 100000) {
            params.encodings[0].scaleResolutionDownBy = 2.0;
          } else {
            params.encodings[0].scaleResolutionDownBy = 1.0;
          }

          await videoSender.setParameters(params);
          this.currentVideoMaxBitrate = targetBitrate;
          console.log(
            `[WebRTC Auto-Negotiation] Adjusted video maxBitrate to ${targetBitrate} bps (Audio prioritized: ${isAudioPrioritized})`
          );
        }
      } catch (e) {
        console.warn('[WebRTC Auto-Negotiation] Bitrate adaptation notice:', e);
      }
    }

    return { videoBitrateBps: this.currentVideoMaxBitrate, isAudioPrioritized };
  }

  /**
   * Real-time network statistics (RTCStatsReport analysis for RTT latency and packet loss)
   */
  public async getNetworkStats(): Promise<CallSignalMetrics> {
    if (!this.pc || this.pc.connectionState === 'closed') {
      return { rttMs: null, packetLossPercent: 0, quality: 'unknown', videoBitrateBps: this.currentVideoMaxBitrate, isAudioPrioritized: false };
    }

    try {
      const statsReport = await this.pc.getStats();
      let rttMs: number | null = null;
      let packetsLost = 0;
      let packetsReceived = 0;

      statsReport.forEach((report) => {
        // Candidate pair stats for round trip latency
        if (
          report.type === 'candidate-pair' &&
          (report.state === 'succeeded' || report.selected || report.nominated)
        ) {
          if (typeof report.currentRoundTripTime === 'number') {
            rttMs = Math.round(report.currentRoundTripTime * 1000);
          } else if (typeof report.roundTripTime === 'number') {
            rttMs = Math.round(report.roundTripTime * 1000);
          }
        }

        // Inbound RTP stats for packet loss
        if (report.type === 'inbound-rtp' && !report.isRemote) {
          if (typeof report.packetsLost === 'number') {
            packetsLost += report.packetsLost;
          }
          if (typeof report.packetsReceived === 'number') {
            packetsReceived += report.packetsReceived;
          }
        }
      });

      let packetLossPercent = 0;
      if (this.prevStats) {
        const deltaLost = Math.max(0, packetsLost - this.prevStats.packetsLost);
        const deltaReceived = Math.max(0, packetsReceived - this.prevStats.packetsReceived);
        const totalExpected = deltaReceived + deltaLost;
        if (totalExpected > 0) {
          packetLossPercent = Math.min(100, Math.round((deltaLost / totalExpected) * 100));
        }
      }

      this.prevStats = { packetsLost, packetsReceived };

      let quality: CallSignalMetrics['quality'] = 'excellent';
      if (rttMs === null) {
        quality = 'unknown';
      } else if (rttMs >= 350 || packetLossPercent >= 10) {
        quality = 'poor';
      } else if (rttMs >= 200 || packetLossPercent >= 5) {
        quality = 'fair';
      } else if (rttMs >= 100 || packetLossPercent >= 2) {
        quality = 'good';
      } else {
        quality = 'excellent';
      }

      // Execute dynamic auto-negotiation video bitrate adaptation
      const { videoBitrateBps, isAudioPrioritized } = await this.adjustVideoBitrate(packetLossPercent, rttMs);

      return {
        rttMs,
        packetLossPercent,
        quality,
        videoBitrateBps,
        isAudioPrioritized,
      };
    } catch {
      return { rttMs: null, packetLossPercent: 0, quality: 'unknown', videoBitrateBps: this.currentVideoMaxBitrate, isAudioPrioritized: false };
    }
  }

  /**
   * Terminate call, stop media tracks, close connections
   */
  public close(): void {
    this.isClosed = true;
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
