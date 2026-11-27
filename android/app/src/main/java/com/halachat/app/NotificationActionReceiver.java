package com.halachat.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;

public class NotificationActionReceiver extends BroadcastReceiver {

    public static final String ACTION_CALL_DECLINE = "com.halachat.app.ACTION_CALL_DECLINE";
    public static final String ACTION_MESSAGE_REPLY = "com.halachat.app.ACTION_MESSAGE_REPLY";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        String action = intent.getAction();
        if (ACTION_CALL_DECLINE.equals(action)) {
            String callId = intent.getStringExtra(NotificationHelper.EXTRA_CALL_ID);
            NotificationHelper.cancelCallNotification(context, callId);
            if (callId != null && !callId.trim().isEmpty()) {
                AndroidNotificationBridge.deliverOrQueueCallAction(context, "decline", callId.trim());
            }
            return;
        }

        if (ACTION_MESSAGE_REPLY.equals(action)) {
            String chatId = intent.getStringExtra(NotificationHelper.EXTRA_CHAT_ID);
            Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
            CharSequence replyChars = remoteInput != null
                ? remoteInput.getCharSequence(NotificationHelper.KEY_TEXT_REPLY)
                : null;
            String replyText = replyChars != null ? replyChars.toString().trim() : "";

            if (chatId != null && !chatId.trim().isEmpty()) {
                NotificationHelper.cancelMessageNotification(context, chatId.trim());
                if (!replyText.isEmpty()) {
                    AndroidNotificationBridge.deliverOrQueueReplyAction(context, chatId.trim(), replyText);
                }
            }
        }
    }
}
