import { useState, useEffect } from 'react';
import { safeLocalStorageSet } from './safeStorage';

export type BandwidthTier = 'low' | 'medium' | 'high';
export type ResolutionPreference = 'auto' | 'low' | 'high';

export interface BandwidthState {
  tier: BandwidthTier;
  effectiveResolution: 'low' | 'high';
  preference: ResolutionPreference;
  estimatedKbps: number;
  rttMs: number;
  effectiveType: string;
  isDataSaver: boolean;
  sampleCount: number;
}

class BandwidthEstimatorService {
  private preference: ResolutionPreference = 'auto';
  private estimatedKbps: number = 3000; // Default baseline ~3 Mbps (healthy connection)
  private rttMs: number = 50;
  private effectiveType: string = '4g';
  private isDataSaver: boolean = false;
  private sampleCount: number = 0;
  private listeners: Set<(state: BandwidthState) => void> = new Set();
  private storageKey = 'hala_bandwidth_res_pref';

  constructor() {
    this.loadPreference();
    this.initNetworkInfo();
  }

  private loadPreference() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(this.storageKey) as ResolutionPreference;
        if (saved && (saved === 'auto' || saved === 'low' || saved === 'high')) {
          this.preference = saved;
        }
      }
    } catch {}
  }

  private initNetworkInfo() {
    if (typeof window === 'undefined') return;

    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

    if (conn) {
      this.updateFromConnection(conn);
      try {
        conn.addEventListener('change', () => {
          this.updateFromConnection(conn);
          this.notify();
        });
      } catch {}
    }
  }

  private updateFromConnection(conn: any) {
    if (conn.downlink) {
      // conn.downlink is in Megabits per second; convert to kbps
      const connKbps = Math.round(conn.downlink * 1000);
      if (this.sampleCount === 0) {
        this.estimatedKbps = connKbps;
      } else {
        // Blend browser connection API signal with measured transfers
        this.estimatedKbps = Math.round(0.2 * connKbps + 0.8 * this.estimatedKbps);
      }
    }
    if (conn.rtt) {
      this.rttMs = conn.rtt;
    }
    if (conn.effectiveType) {
      this.effectiveType = conn.effectiveType;
    }
    if (typeof conn.saveData === 'boolean') {
      this.isDataSaver = conn.saveData;
    }
  }

  /**
   * Record a real-world media download sample to calibrate bandwidth estimation.
   * @param bytesTransferred Bytes downloaded
   * @param durationMs Milliseconds taken for transfer
   */
  public recordSample(bytesTransferred: number, durationMs: number): void {
    if (bytesTransferred < 1024 || durationMs < 15) return;

    const seconds = durationMs / 1000;
    const instantKbps = Math.round((bytesTransferred * 8) / seconds / 1024);

    if (instantKbps > 0) {
      // Exponential Moving Average (EMA) with alpha = 0.35
      const alpha = 0.35;
      if (this.sampleCount === 0) {
        this.estimatedKbps = instantKbps;
      } else {
        this.estimatedKbps = Math.round(alpha * instantKbps + (1 - alpha) * this.estimatedKbps);
      }
      this.sampleCount++;
      this.notify();
    }
  }

  public getTier(): BandwidthTier {
    if (this.isDataSaver) return 'low';
    if (this.effectiveType === 'slow-2g' || this.effectiveType === '2g') return 'low';
    if (this.estimatedKbps < 650) return 'low';
    if (this.estimatedKbps < 2200 || this.effectiveType === '3g') return 'medium';
    return 'high';
  }

  public getEffectiveResolution(): 'low' | 'high' {
    if (this.preference === 'low') return 'low';
    if (this.preference === 'high') return 'high';
    // 'auto' mode: adaptive based on current bandwidth tier
    return this.getTier() === 'low' ? 'low' : 'high';
  }

  public getPreference(): ResolutionPreference {
    return this.preference;
  }

  public setPreference(pref: ResolutionPreference): void {
    if (this.preference === pref) return;
    this.preference = pref;
    try {
      safeLocalStorageSet(this.storageKey, pref);
    } catch {}
    this.notify();
  }

  public getState(): BandwidthState {
    return {
      tier: this.getTier(),
      effectiveResolution: this.getEffectiveResolution(),
      preference: this.preference,
      estimatedKbps: this.estimatedKbps,
      rttMs: this.rttMs,
      effectiveType: this.effectiveType,
      isDataSaver: this.isDataSaver,
      sampleCount: this.sampleCount,
    };
  }

  public subscribe(listener: (state: BandwidthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }
}

export const bandwidthEstimator = new BandwidthEstimatorService();

export function useNetworkBandwidth(): BandwidthState & {
  setPreference: (pref: ResolutionPreference) => void;
  recordSample: (bytes: number, durationMs: number) => void;
} {
  const [state, setState] = useState<BandwidthState>(() => bandwidthEstimator.getState());

  useEffect(() => {
    setState(bandwidthEstimator.getState());
    return bandwidthEstimator.subscribe(setState);
  }, []);

  return {
    ...state,
    setPreference: (pref) => bandwidthEstimator.setPreference(pref),
    recordSample: (bytes, dur) => bandwidthEstimator.recordSample(bytes, dur),
  };
}
