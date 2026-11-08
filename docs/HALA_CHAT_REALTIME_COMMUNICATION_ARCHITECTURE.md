# HALA CHAT — REAL-TIME COMMUNICATION ARCHITECTURE V1.0

**Document Class:** Real-Time Communication & Calling Architecture Specification  
**Author:** Real-Time Communication Engineer & Distributed Systems Engineer  
**Scope:** WebRTC Signaling, P2P Calling, SFU Node Infrastructure, and Connection Recovery  
**Status:** COMPLETE & HIGH-PERFORMANCE  

---

## 1. REAL-TIME SIGNALING & TEXT TRANSPORT

Hala Chat uses a dual-channel real-time communication model:

1. **Primary Control & Messaging Channel (Firestore `onSnapshot`):**  
   - Message creation, read receipts, reaction events, typing state, and call signaling payloads (SDP offers, SDP answers, ICE candidates) transmit over Firestore real-time listeners.
   - **Optimistic Rendering:** Client UI updates immediately upon user send action (< 50ms local render), reconciling asynchronously when Firestore confirms server timestamp.
2. **High-Frequency WebSocket Channel (Scale Phase 2):**  
   - For ultra-high frequency typing indicators and live presence heartbeats at 100K+ concurrent users, a dedicated Node.js WebSocket cluster supplements Firestore listeners to conserve database quota.

---

## 2. WEBRTC CALLING ARCHITECTURE (P2P VS. SFU)

```
+-----------------------------------------------------------------------------------+
|                           WEBRTC TOPOLOGY SELECTION                               |
+-----------------------------------------------------------------------------------+
 1. Peer-to-Peer (P2P Mesh):
    - Target: 1-on-1 Voice & Video Calls.
    - Architecture: Direct WebRTC `RTCPeerConnection` between User A and User B.
    - Bandwidth: Minimal. Media streams flow directly between endpoints.
    - Security: Encrypted via DTLS-SRTP. Zero media bytes touch servers.

 2. Selective Forwarding Unit (SFU Node Cluster):
    - Target: Group Calls (3+ members), Live Streams, Community Voice Rooms.
    - Architecture: Media streams upload to LiveKit/Mediasoup SFU instances.
    - Advantage: Each participant uploads 1 stream and receives N streams routed by SFU.
    - Bandwidth Savings: Reduces client upload bandwidth by 85% compared to Mesh.
+-----------------------------------------------------------------------------------+
```

---

## 3. NETWORK TRAVERSAL (STUN / TURN) & ADAPTIVE BITRATE

### 3.1 ICE, STUN, and TURN Infrastructure
- **STUN Servers:** Public STUN endpoints resolve public reflexive IP and port addresses for NAT traversal.
- **TURN Relay Cluster:** Co-located TURN servers (coturn) deployed in `europe-west1` and `me-south-1` provide encrypted TLS/UDP media relays when symmetric NAT or strict enterprise firewalls block direct P2P connections.
- **Fallback Guarantee:** If direct P2P candidate pairing fails within 3 seconds, ICE automatically fails over to TURN relay without dropping the call invitation.

### 3.2 Adaptive Bitrate (ABR) & Jitter Buffers
- **Dynamic Bitrate Scaling:** Video encoder adjusts output bitrate dynamically (100 kbps to 2.5 Mbps) based on real-time WebRTC RTCP sender/receiver report metrics (`packetsLost`, `jitter`, `rtt`).
- **WebAssembly Noise Suppression:** Integrated RNNoise Wasm module filters background traffic, fan noise, and room reverb before feeding PCM audio into `RTCPeerConnection`.

### 3.3 Connection Recovery Target (< 1.5 Seconds)
- If network connection switches (e.g. Wi-Fi to 4G/5G mobile data), the `useWebRTC` hook detects ICE connection state change (`iceConnectionState == 'failed' | 'disconnected'`).
- Triggers automatic **ICE Restart** with new SDP offer/answer exchange while preserving audio track context. Call re-establishes within **< 1.5 seconds**.
