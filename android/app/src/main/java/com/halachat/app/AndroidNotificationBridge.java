package com.halachat.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import org.json.JSONObject;

public class AndroidNotificationBridge {

    public static final int REQUEST_CODE_POST_NOTIFICATIONS = 4102;
    private static final String PREFS_NAME = "hala_android_notifications";
    private static final String KEY_FCM_TOKEN = "fcm_token";

    private final MainActivity activity;

    public AndroidNotificationBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isSupported() {
        return true;
    }

    @JavascriptInterface
    public String getPermissionStatus() {
        if (NotificationHelper.hasNotificationPermission(activity)) {
            return "granted";
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return "default";
        }
        return "denied";
    }

    @JavascriptInterface
    public void requestPermission() {
        activity.runOnUiThread(() -> {
            NotificationHelper.ensureNotificationChannels(activity);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (!NotificationHelper.hasNotificationPermission(activity)) {
                    ActivityCompat.requestPermissions(
                        activity,
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        REQUEST_CODE_POST_NOTIFICATIONS
                    );
                    return;
                }
            }
            notifyPermissionResult(getPermissionStatus());
        });
    }

    @JavascriptInterface
    public void showNotification(String title, String body, String tag, String chatId) {
        activity.runOnUiThread(() ->
            NotificationHelper.showMessageNotification(activity, title, body, tag, chatId)
        );
    }

    @JavascriptInterface
    public void showIncomingCallNotification(String callerName, String callType, String callId) {
        activity.runOnUiThread(() ->
            NotificationHelper.showIncomingCallNotification(activity, callerName, callType, callId)
        );
    }

    @JavascriptInterface
    public void cancelCallNotification(String callId) {
        activity.runOnUiThread(() -> NotificationHelper.cancelCallNotification(activity, callId));
    }

    @JavascriptInterface
    public String getFcmToken() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, MainActivity.MODE_PRIVATE);
        return prefs.getString(KEY_FCM_TOKEN, "");
    }

    public static void saveFcmToken(android.content.Context context, String token) {
        if (token == null || token.trim().isEmpty()) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_FCM_TOKEN, token.trim()).apply();
    }

    public void dispatchFcmTokenToWeb(String token) {
        if (token == null || token.trim().isEmpty()) {
            return;
        }
        saveFcmToken(activity, token);
        final String quotedToken = JSONObject.quote(token.trim());
        activity.runOnUiThread(() -> {
            WebView webView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('hala-android-fcm-token', { detail: { token: " +
                    quotedToken +
                    " } }));",
                    null
                );
            }
        });
    }

    public void notifyPermissionResult(String status) {
        final String quotedStatus = JSONObject.quote(status != null ? status : "default");
        activity.runOnUiThread(() -> {
            WebView webView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('hala-android-notification-permission', { detail: { status: " +
                    quotedStatus +
                    " } }));",
                    null
                );
            }
        });
    }
}
