// Service Worker Cache Version: v2.3.0 (ActiveCallScreen Notification Action Routing)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDbcjqUSDoxC3Qo1T_6OI4_c4lkvcPKHXI",
  authDomain: "gen-lang-client-0446181078.firebaseapp.com",
  projectId: "gen-lang-client-0446181078",
  storageBucket: "gen-lang-client-0446181078.firebasestorage.app",
  messagingSenderId: "944184590586",
  appId: "1:944184590586:web:52238107ee687e825f0943"
});

const messaging = firebase.messaging();

function extractNotificationOptions(payload) {
  const data = payload?.data || {};
  const notif = payload?.notification || {};
  const isCall = data.type === 'call' || data.type === 'call_wakeup' || data.type === 'incoming_call' || Boolean(data.callId) || Boolean(notif.title && notif.title.toLowerCase().includes('call'));

  const title = notif.title || data.title || (isCall ? `📞 Incoming ${data.callType === 'video' ? 'Video' : 'Voice'} Call` : 'Hala Chat');
  const body = notif.body || data.body || (data.callerName ? `${data.callerName} is calling you on Hala...` : 'New notification');
  const icon = notif.icon || data.callerAvatar || data.icon || '/icons/icon-192.png';

  return {
    title,
    options: {
      body,
      icon,
      badge: '/icons/notification-badge-96.png',
      data: {
        ...data,
        callId: data.callId || (data.url ? new URL(data.url, self.location.origin).searchParams.get('callId') : null),
        type: isCall ? 'call' : (data.type || 'message'),
      },
      actions: isCall ? [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' }
      ] : [],
      requireInteraction: isCall || Boolean(data.requireInteraction),
      renotify: isCall,
      vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500, 250, 500] : undefined,
      tag: isCall ? `call-${data.callId || Date.now()}` : `push-${Date.now()}`
    }
  };
}

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const { title, options } = extractNotificationOptions(payload);
  self.registration.showNotification(title, options);
});

// Implementation of self.addEventListener('push', ...) to parse incoming push payloads
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    let payload = {};
    try {
      payload = event.data.json();
    } catch {
      payload = { data: { body: event.data.text() } };
    }
    console.log('[firebase-messaging-sw.js] Push event received:', payload);

    const { title, options } = extractNotificationOptions(payload);
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.warn('[firebase-messaging-sw.js] Push event parse notice:', err);
  }
});

// Notification click event directing user to ActiveCallScreen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notificationData = event.notification.data || {};
  const action = event.action; // 'accept', 'decline', or ''
  const callId = notificationData.callId;

  console.log('[firebase-messaging-sw.js] Notification clicked:', { action, callId, notificationData });

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Send message to focused or open client window
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'SW_CALL_ACTION',
            action: action || 'accept',
            callId: callId,
            notificationData: notificationData,
          });
          return client.focus();
        }
      }

      // If no window is open, launch openWindow with ?callId=...&autoAnswer=true to enter ActiveCallScreen directly
      const targetUrl = callId
        ? `/?callId=${encodeURIComponent(callId)}&autoAnswer=${action === 'decline' ? 'false' : 'true'}`
        : '/';

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
