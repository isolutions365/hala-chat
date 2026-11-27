const config = {
  appId: 'com.halachat.app',
  appName: 'Hala Chat',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'localhost',
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
