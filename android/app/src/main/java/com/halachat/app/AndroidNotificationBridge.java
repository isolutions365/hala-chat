package com.halachat.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.lang.ref.WeakReference;
import org.json.JSONArray;
import org.json.JSONObject;

public class AndroidNotificationBridge {

    public static final int REQUEST_CODE_POST_NOTIFICATIONS = 4102;
    private static final String PREFS_NAME = "hala_android_notifications";
    private static final String KEY_FCM_TOKEN = "fcm_token";
    private static final String KEY_PENDING_ACTIONS = "pending_actions";
    private static final String KEY_PERM_DENIED_FOREVER = "post_notif_denied_forever";

    private static WeakReference<AndroidNotificationBridge> activeBridgeRef = new WeakReference<>(null);

    private final MainActivity activity;
    private volatile boolean webReadyForActions = false;
    private volatile boolean permissionRequestInFlight = false;

    public AndroidNotificationBridge(MainActivity activity) {
        this.activity = activity;
        activeBridgeRef = new WeakReference<>(this);
    }

    public static void clearActiveBridge(AndroidNotificationBridge bridge) {
        AndroidNotificationBridge current = activeBridgeRef.get();
        if (current == bridge) {
            activeBridgeRef = new WeakReference<>(null);
        }
    }

    public void onPermissionResult(int[] grantResults) {
        permissionRequestInFlight = false;
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, MainActivity.MODE_PRIVATE);
        if (NotificationHelper.hasNotificationPermission(activity)) {
            prefs.edit().remove(KEY_PERM_DENIED_FOREVER).apply();
        } else if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            grantResults != null &&
            grantResults.length > 0 &&
            grantResults[0] != PackageManager.PERMISSION_GRANTED
        ) {
            boolean canAskAgain = ActivityCompat.shouldShowRequestPermissionRationale(
                activity,
                Manifest.permission.POST_NOTIFICATIONS
            );
            if (!canAskAgain) {
                prefs.edit().putBoolean(KEY_PERM_DENIED_FOREVER, true).apply();
            }
        }
    }

    public void clearPermissionRequestInFlight() {
        permissionRequestInFlight = false;
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
            SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, MainActivity.MODE_PRIVATE);
            if (prefs.getBoolean(KEY_PERM_DENIED_FOREVER, false)) {
                return "denied";
            }
            return "default";
        }
        return "denied";
    }

    @JavascriptInterface
    public boolean canUseFullScreenIntent() {
        return NotificationHelper.canUseFullScreenIntent(activity);
    }

    @JavascriptInterface
    public void openFullScreenIntentSettings() {
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 34) {
                    Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
                    intent.setData(Uri.fromParts("package", activity.getPackageName(), null));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(intent);
                    return;
                }
            } catch (Throwable ignored) {}
            openNotificationSettings();
        });
    }

    @JavascriptInterface
    public void requestPermission() {
        activity.runOnUiThread(() -> {
            NotificationHelper.ensureNotificationChannels(activity);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (!NotificationHelper.hasNotificationPermission(activity)) {
                    if (permissionRequestInFlight) {
                        return;
                    }
                    permissionRequestInFlight = true;
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
    public void openNotificationSettings() {
        activity.runOnUiThread(() -> {
            try {
                Intent intent;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
                } else {
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.fromParts("package", activity.getPackageName(), null));
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Throwable ignored) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    fallback.setData(Uri.fromParts("package", activity.getPackageName(), null));
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(fallback);
                } catch (Throwable ignoredFallback) {}
            }
        });
    }

    @JavascriptInterface
    public void setIncomingCallScreenFlags(boolean active) {
        activity.runOnUiThread(() -> activity.applyIncomingCallScreenFlags(active));
    }

    @JavascriptInterface
    public void refreshFcmToken() {
        activity.runOnUiThread(() -> {
            try {
                if (FirebaseApp.getApps(activity).isEmpty()) {
                    return;
                }
                FirebaseMessaging
                    .getInstance()
                    .getToken()
                    .addOnSuccessListener(token -> {
                        if (token != null && !token.trim().isEmpty()) {
                            dispatchFcmTokenToWeb(token);
                        }
                    });
            } catch (Throwable ignored) {}
        });
    }

    @JavascriptInterface
    public void showNotification(String title, String body, String tag, String chatId) {
        activity.runOnUiThread(() ->
            NotificationHelper.showMessageNotification(activity, title, body, tag, chatId)
        );
    }

    @JavascriptInterface
    public void cancelMessageNotification(String chatId) {
        activity.runOnUiThread(() -> NotificationHelper.cancelMessageNotification(activity, chatId));
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
    public void startCallRingtone(String callId) {
        activity.runOnUiThread(() -> CallRingtonePlayer.start(activity, callId));
    }

    @JavascriptInterface
    public void stopCallRingtone() {
        activity.runOnUiThread(CallRingtonePlayer::stopAll);
    }

    @JavascriptInterface
    public String getFcmToken() {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, MainActivity.MODE_PRIVATE);
        return prefs.getString(KEY_FCM_TOKEN, "");
    }

    @JavascriptInterface
    public String consumePendingActions() {
        synchronized (AndroidNotificationBridge.class) {
            webReadyForActions = true;
            SharedPreferences prefs = activity.getSharedPreferences(PREFS_NAME, MainActivity.MODE_PRIVATE);
            String stored = prefs.getString(KEY_PENDING_ACTIONS, "[]");
            prefs.edit().remove(KEY_PENDING_ACTIONS).apply();
            return stored != null ? stored : "[]";
        }
    }

    public static void saveFcmToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_FCM_TOKEN, token.trim()).apply();
    }

    private static void queuePendingAction(Context context, JSONObject payload) {
        synchronized (AndroidNotificationBridge.class) {
            try {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING_ACTIONS, "[]"));
                arr.put(payload);
                while (arr.length() > 15) {
                    arr.remove(0);
                }
                prefs.edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply();
            } catch (Throwable ignored) {}
        }
    }

    public static void deliverOrQueueCallAction(Context context, String action, String callId) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("kind", "call_action");
            payload.put("action", action);
            payload.put("callId", callId);

            AndroidNotificationBridge bridge = activeBridgeRef.get();
            if (bridge != null && bridge.dispatchEventIfWebViewReady("hala-android-call-action", payload)) {
                return;
            }
            queuePendingAction(context, payload);
        } catch (Throwable ignored) {}
    }

    public static void deliverOrQueueReplyAction(Context context, String chatId, String text) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("kind", "reply_action");
            payload.put("chatId", chatId);
            payload.put("text", text);

            AndroidNotificationBridge bridge = activeBridgeRef.get();
            if (bridge != null && bridge.dispatchEventIfWebViewReady("hala-android-notification-reply", payload)) {
                return;
            }
            queuePendingAction(context, payload);
        } catch (Throwable ignored) {}
    }

    public static void deliverOrQueueOpenChatAction(Context context, String chatId) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("kind", "open_chat");
            payload.put("chatId", chatId);

            AndroidNotificationBridge bridge = activeBridgeRef.get();
            if (bridge != null && bridge.dispatchEventIfWebViewReady("hala-android-open-chat", payload)) {
                return;
            }
            queuePendingAction(context, payload);
        } catch (Throwable ignored) {}
    }

    private boolean dispatchEventIfWebViewReady(String eventName, JSONObject detail) {
        if (!webReadyForActions || activity == null || activity.isFinishing() || activity.isDestroyed()) {
            return false;
        }
        WebView webView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
        if (webView == null) {
            return false;
        }
        final String js =
            "window.dispatchEvent(new CustomEvent(" +
            JSONObject.quote(eventName) +
            ", { detail: " +
            detail.toString() +
            " }));";
        activity.runOnUiThread(() -> {
            try {
                WebView activeWebView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
                if (activeWebView != null) {
                    activeWebView.evaluateJavascript(js, null);
                }
            } catch (Throwable ignored) {}
        });
        return true;
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
        final boolean fullScreenAllowed = canUseFullScreenIntent();
        activity.runOnUiThread(() -> {
            WebView webView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('hala-android-notification-permission', { detail: { status: " +
                    quotedStatus +
                    ", canUseFullScreenIntent: " +
                    fullScreenAllowed +
                    " } }));",
                    null
                );
            }
        });
    }
}
