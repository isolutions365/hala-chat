package com.halachat.app;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class HalaFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        AndroidNotificationBridge.saveFcmToken(getApplicationContext(), token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification notification = remoteMessage.getNotification();

        String payloadType = data.get("type");
        String callId = data.get("callId");
        boolean isCallPush =
            "call".equalsIgnoreCase(payloadType) ||
            (callId != null && !callId.trim().isEmpty());

        if (isCallPush) {
            String callerName = data.get("callerName");
            if (
                (callerName == null || callerName.trim().isEmpty()) &&
                notification != null &&
                notification.getBody() != null
            ) {
                callerName = notification.getBody().replace("Call from ", "").trim();
            }
            String callType = data.get("callType");
            if (callType == null || callType.trim().isEmpty()) {
                callType = ("video".equalsIgnoreCase(payloadType) || "voice".equalsIgnoreCase(payloadType))
                    ? payloadType
                    : "voice";
            }
            NotificationHelper.showIncomingCallNotification(
                getApplicationContext(),
                callerName,
                callType,
                callId
            );
            return;
        }

        String title = data.get("senderName");
        if ((title == null || title.trim().isEmpty()) && notification != null && notification.getTitle() != null) {
            title = notification.getTitle();
        }

        String rawBody = data.get("body");
        if ((rawBody == null || rawBody.trim().isEmpty()) && notification != null && notification.getBody() != null) {
            rawBody = notification.getBody();
        }

        String messageType = data.get("messageType");
        String safeBody = formatSafeNotificationBody(rawBody, messageType);

        String chatId = data.get("chatId");
        String messageId = data.get("messageId");
        String tag = (chatId != null && !chatId.trim().isEmpty())
            ? ("chat-" + chatId.trim())
            : (messageId != null ? ("msg-" + messageId) : "hala-fcm");

        NotificationHelper.showMessageNotification(
            getApplicationContext(),
            (title != null && !title.trim().isEmpty()) ? title : "Hala Chat",
            safeBody,
            tag,
            chatId
        );
    }

    private static String formatSafeNotificationBody(String rawBody, String messageType) {
        String trimmed = rawBody != null ? rawBody.trim() : "";
        if (!trimmed.isEmpty() && !looksLikeCiphertext(trimmed)) {
            return trimmed;
        }
        if ("voice".equalsIgnoreCase(messageType)) {
            return "\uD83C\uDFA4 Voice message";
        }
        if ("image".equalsIgnoreCase(messageType)) {
            return "\uD83D\uDCF7 Photo";
        }
        if ("video".equalsIgnoreCase(messageType)) {
            return "\uD83C\uDFA5 Video";
        }
        if ("file".equalsIgnoreCase(messageType)) {
            return "\uD83D\uDCCE File";
        }
        if ("location".equalsIgnoreCase(messageType)) {
            return "\uD83D\uDCCD Location";
        }
        if ("sticker".equalsIgnoreCase(messageType)) {
            return "\u2728 Sticker";
        }
        if ("poll".equalsIgnoreCase(messageType)) {
            return "\uD83D\uDCCA Poll";
        }
        return "New message";
    }

    private static boolean looksLikeCiphertext(String text) {
        if (text == null) return false;
        String t = text.trim();
        if (t.startsWith("{") && (t.contains("\"iv\"") || t.contains("\"ciphertext\"") || t.contains("\"ct\""))) {
            return true;
        }
        if (t.startsWith("E2EE:") || t.startsWith("ENC:") || t.startsWith("v1:")) {
            return true;
        }
        // Long base64-like blob with no whitespace
        if (t.length() >= 40 && !t.contains(" ") && t.matches("^[A-Za-z0-9+/=._:-]+$")) {
            return true;
        }
        return false;
    }
}
