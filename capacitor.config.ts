const config = {
  appId: 'com.halachat.app',
  appName: 'Hala Chat',
  webDir: 'dist',
  server: {
    url: 'https://hala-chat-topaz.vercel.app',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'hala-chat-topaz.vercel.app',
      '*.firebaseapp.com',
      '*.firebasestorage.app',
      '*.googleapis.com',
      '*.google.com',
      '*.gstatic.com',
      'www.recaptcha.net',
      'recaptcha.net',
    ],
  },
};

export default config;
