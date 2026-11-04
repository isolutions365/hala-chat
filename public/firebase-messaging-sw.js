// Service Worker Cache Version: v2.1.0 (Updated Hala Branding Icons)
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

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/notification-badge-96.png',
    actions: [
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' }
    ],
    requireInteraction: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
