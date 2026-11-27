/**
 * Pluggable Notifications Service
 * Abstracts browser Notification API and Push Messaging behind a clean interface
 * so it can be swapped for Capacitor Push Notifications or native plugins later.
 */

export interface NotificationAdapter {
  isSupported(): boolean;
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  showNotification(title: string, options?: NotificationOptions): void;
}

export interface HalaAndroidNotificationsBridge {
  isSupported(): boolean;
  getPermissionStatus(): string;
  requestPermission(): void;
  showNotification(title: string, body: string, tag: string, chatId: string): void;
  showIncomingCallNotification(callerName: string, callType: string, callId: string): void;
  cancelCallNotification(callId: string): void;
  getFcmToken(): string;
}

export function getAndroidNotificationBridge(): HalaAndroidNotificationsBridge | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { HalaAndroidNotifications?: HalaAndroidNotificationsBridge })
    .HalaAndroidNotifications;
  if (candidate && typeof candidate.showNotification === 'function') {
    return candidate;
  }
  return null;
}

function normalizeAndroidPermission(raw: string | null | undefined): NotificationPermission {
  if (raw === 'granted') return 'granted';
  if (raw === 'denied') return 'denied';
  return 'default';
}

export const androidNativeNotificationAdapter: NotificationAdapter = {
  isSupported(): boolean {
    return Boolean(getAndroidNotificationBridge());
  },
  getPermission(): NotificationPermission {
    const bridge = getAndroidNotificationBridge();
    if (!bridge) return 'default';
    try {
      return normalizeAndroidPermission(bridge.getPermissionStatus());
    } catch {
      return 'default';
    }
  },
  async requestPermission(): Promise<NotificationPermission> {
    const bridge = getAndroidNotificationBridge();
    if (!bridge) return 'denied';
    try {
      const current = normalizeAndroidPermission(bridge.getPermissionStatus());
      if (current === 'granted') return 'granted';

      return await new Promise<NotificationPermission>((resolve) => {
        let settled = false;
        const finish = (status: NotificationPermission) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('hala-android-notification-permission', onResult as EventListener);
          resolve(status);
        };
        const onResult = (event: Event) => {
          const detail = (event as CustomEvent<{ status?: string }>).detail;
          finish(normalizeAndroidPermission(detail?.status));
        };
        window.addEventListener('hala-android-notification-permission', onResult as EventListener);
        bridge.requestPermission();
        setTimeout(() => {
          try {
            finish(normalizeAndroidPermission(bridge.getPermissionStatus()));
          } catch {
            finish('default');
          }
        }, 15000);
      });
    } catch (err) {
      console.warn('[NotificationsService] Android permission request error:', err);
      return 'default';
    }
  },
  showNotification(title: string, options?: NotificationOptions): void {
    const bridge = getAndroidNotificationBridge();
    if (!bridge) return;
    try {
      const body = typeof options?.body === 'string' ? options.body : '';
      const tag = typeof options?.tag === 'string' ? options.tag : '';
      const rawData = options?.data as { chatId?: unknown } | undefined;
      const chatId = typeof rawData?.chatId === 'string' ? rawData.chatId : '';
      bridge.showNotification(title, body, tag, chatId);
    } catch (err) {
      console.warn('[NotificationsService] Android showNotification error:', err);
    }
  },
};

export const webNotificationAdapter: NotificationAdapter = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },
  getPermission(): NotificationPermission {
    if (this.isSupported()) {
      return Notification.permission;
    }
    return 'default';
  },
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission !== 'denied') {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  },
  showNotification(title: string, options?: NotificationOptions): void {
    if (!this.isSupported() || Notification.permission !== 'granted') return;
    try {
      const notif = new Notification(title, {
        icon: './icons/icon-192.png',
        badge: './icons/notification-badge-96.png',
        ...options,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (err) {
      console.warn('[NotificationsService] Show notification warning:', err);
    }
  },
};

let customAdapter: NotificationAdapter | null = null;

function resolveActiveAdapter(): NotificationAdapter {
  if (customAdapter) return customAdapter;
  if (getAndroidNotificationBridge()) return androidNativeNotificationAdapter;
  return webNotificationAdapter;
}

export function setNotificationAdapter(adapter: NotificationAdapter): void {
  customAdapter = adapter;
}

export function isNotificationSupported(): boolean {
  return resolveActiveAdapter().isSupported();
}

export function getNotificationPermission(): NotificationPermission {
  return resolveActiveAdapter().getPermission();
}

export async function requestAppNotificationPermission(): Promise<boolean> {
  const perm = await resolveActiveAdapter().requestPermission();
  return perm === 'granted';
}

export function showAppNotification(title: string, options?: NotificationOptions): void {
  resolveActiveAdapter().showNotification(title, options);
}
