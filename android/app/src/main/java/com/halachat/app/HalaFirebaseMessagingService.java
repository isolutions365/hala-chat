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

        String callId = data.get("callId");
        if (callId != null && !callId.trim().isEmpty()) {
            String callerName = data.get("callerName");
            if ((callerName == null || callerName.trim().isEmpty()) && notification != null && notification.getBody() != null) {
                callerName = notification.getBody().replace("Call from ", "").trim();
            }
            String callType = data.get("type");
            NotificationHelper.showIncomingCallNotification(
                getApplicationContext(),
                callerName,
                callType != null ? callType : "voice",
                callId
            );
            return;
        }

        String title = notification != null && notification.getTitle() != null
            ? notification.getTitle()
            : data.get("senderName");
        String body = notification != null && notification.getBody() != null
            ? notification.getBody()
            : data.get("body");
        String chatId = data.get("chatId");
        String messageId = data.get("messageId");
        String tag = chatId != null ? ("chat-" + chatId) : (messageId != null ? ("msg-" + messageId) : "hala-fcm");

        NotificationHelper.showMessageNotification(
            getApplicationContext(),
            title != null ? title : "Hala Chat",
            body != null ? body : "New message",
            tag,
            chatId
        );
    }
}
