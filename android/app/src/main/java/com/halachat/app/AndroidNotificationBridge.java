package com.halachat.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import java.lang.ref.WeakReference;
import org.json.JSONArray;
import org.json.JSONObject;

public class AndroidNotificationBridge {

    public static final int REQUEST_CODE_POST_NOTIFICATIONS = 4102;
    private static final String PREFS_NAME = "hala_android_notifications";
    private static final String KEY_FCM_TOKEN = "fcm_token";
    private static final String KEY_PENDING_ACTIONS = "pending_actions";

    private static WeakReference<AndroidNotificationBridge> activeBridgeRef = new WeakReference<>(null);

    private final MainActivity activity;
    private volatile boolean webReadyForActions = false;

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
                // Keep queue bounded
                while (arr.length() > 15) {
                    arr.remove(0);
                }
                prefs.edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply();
            } catch (Throwable ignored) {
                // Ignore corrupt preferences
            }
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
        } catch (Throwable ignored) {
            // Safe guard
        }
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
        } catch (Throwable ignored) {
            // Safe guard
        }
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
        } catch (Throwable ignored) {
            // Safe guard
        }
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
            } catch (Throwable ignored) {
                // Safe guard
            }
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
