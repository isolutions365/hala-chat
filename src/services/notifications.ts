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

let activeAdapter: NotificationAdapter = webNotificationAdapter;

export function setNotificationAdapter(adapter: NotificationAdapter): void {
  activeAdapter = adapter;
}

export function isNotificationSupported(): boolean {
  return activeAdapter.isSupported();
}

export function getNotificationPermission(): NotificationPermission {
  return activeAdapter.getPermission();
}

export async function requestAppNotificationPermission(): Promise<boolean> {
  const perm = await activeAdapter.requestPermission();
  return perm === 'granted';
}

export function showAppNotification(title: string, options?: NotificationOptions): void {
  activeAdapter.showNotification(title, options);
}
