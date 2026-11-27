package com.halachat.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {

    private AppUpdateManager appUpdateManager;
    private AndroidNotificationBridge notificationBridge;
    private AndroidPhoneAuthBridge phoneAuthBridge;

    @SuppressLint("JavascriptInterface")
    @Override
    protected void load() {
        NotificationHelper.ensureNotificationChannels(this);
        notificationBridge = new AndroidNotificationBridge(this);
        phoneAuthBridge = new AndroidPhoneAuthBridge(this);

        WebView preLoadWebView = findViewById(com.getcapacitor.android.R.id.webview);
        configureWebViewForAuth(preLoadWebView);
        if (preLoadWebView != null) {
            preLoadWebView.addJavascriptInterface(notificationBridge, "HalaAndroidNotifications");
            preLoadWebView.addJavascriptInterface(phoneAuthBridge, "HalaAndroidPhoneAuth");
        }

        super.load();

        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView activeWebView = this.bridge.getWebView();
            configureWebViewForAuth(activeWebView);
            if (activeWebView != preLoadWebView) {
                activeWebView.addJavascriptInterface(notificationBridge, "HalaAndroidNotifications");
                activeWebView.addJavascriptInterface(phoneAuthBridge, "HalaAndroidPhoneAuth");
            }
        }

        handleCallWakeupIntent(getIntent());
        syncNativeFcmToken();

        appUpdateManager = new AppUpdateManager(this);
        appUpdateManager.checkOnLaunch();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleCallWakeupIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (appUpdateManager != null) {
            appUpdateManager.onResume();
        }
        if (notificationBridge != null) {
            notificationBridge.clearPermissionRequestInFlight();
            notificationBridge.notifyPermissionResult(notificationBridge.getPermissionStatus());
        }
        syncNativeFcmToken();
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        if (appUpdateManager != null) {
            appUpdateManager.onDestroy();
        }
        AndroidNotificationBridge.clearActiveBridge(notificationBridge);
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == AndroidNotificationBridge.REQUEST_CODE_POST_NOTIFICATIONS && notificationBridge != null) {
            notificationBridge.onPermissionResult(grantResults);
            String status = notificationBridge.getPermissionStatus();
            notificationBridge.notifyPermissionResult(status);
            if ("granted".equals(status)) {
                syncNativeFcmToken();
            }
        }
    }

    @SuppressWarnings("deprecation")
    public void applyIncomingCallScreenFlags(boolean active) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(active);
            setTurnScreenOn(active);
        }
        if (active) {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
            CallRingtonePlayer.wakeScreenBriefly(this, 10_000L);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
                    if (km != null && km.isKeyguardLocked()) {
                        km.requestDismissKeyguard(this, null);
                    }
                } catch (Throwable ignored) {}
            }
        } else {
            getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
    }

    private void handleCallWakeupIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        if (intent.getBooleanExtra(NotificationHelper.EXTRA_INCOMING_CALL, false)) {
            applyIncomingCallScreenFlags(true);
            String callId = intent.getStringExtra(NotificationHelper.EXTRA_CALL_ID);
            String callAction = intent.getStringExtra(NotificationHelper.EXTRA_CALL_ACTION);
            if (callId != null && !callId.trim().isEmpty() && callAction != null && !callAction.trim().isEmpty()) {
                NotificationHelper.cancelCallNotification(this, callId);
                AndroidNotificationBridge.deliverOrQueueCallAction(this, callAction.trim(), callId.trim());
            }
            return;
        }

        String chatId = intent.getStringExtra(NotificationHelper.EXTRA_CHAT_ID);
        if (chatId != null && !chatId.trim().isEmpty()) {
            NotificationHelper.cancelMessageNotification(this, chatId.trim());
            AndroidNotificationBridge.deliverOrQueueOpenChatAction(this, chatId.trim());
        }
    }

    private void syncNativeFcmToken() {
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                return;
            }
            FirebaseMessaging
                .getInstance()
                .getToken()
                .addOnSuccessListener(token -> {
                    if (token != null && !token.trim().isEmpty() && notificationBridge != null) {
                        notificationBridge.dispatchFcmTokenToWeb(token);
                    }
                });
        } catch (Throwable ignored) {
            // google-services.json not bundled yet; local native notifications still work
        }
    }

    private void configureWebViewForAuth(WebView webView) {
        if (webView == null) {
            return;
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        String userAgent = settings.getUserAgentString();
        if (userAgent != null && userAgent.contains("; wv")) {
            settings.setUserAgentString(userAgent.replace("; wv", ""));
        }
    }
}
