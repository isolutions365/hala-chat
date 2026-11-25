export type CapacitorPlatform = 'android' | 'ios' | 'web';

interface CapacitorRuntimeBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function getCapacitorBridge(): CapacitorRuntimeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorRuntimeBridge }).Capacitor;
}

export function isNative(): boolean {
  const bridge = getCapacitorBridge();
  if (bridge && typeof bridge.isNativePlatform === 'function') {
    return Boolean(bridge.isNativePlatform());
  }
  return false;
}

export function getPlatform(): CapacitorPlatform {
  const bridge = getCapacitorBridge();
  if (bridge && typeof bridge.getPlatform === 'function') {
    const platform = bridge.getPlatform();
    if (platform === 'android' || platform === 'ios' || platform === 'web') {
      return platform;
    }
  }
  return 'web';
}
