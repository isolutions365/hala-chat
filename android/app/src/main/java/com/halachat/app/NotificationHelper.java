package com.halachat.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

public final class NotificationHelper {

    public static final String CHANNEL_MESSAGES = "hala_messages_v4";
    public static final String CHANNEL_CALLS = "hala_calls_v4";
    private static final String[] LEGACY_CHANNELS = new String[] {
        "hala_messages",
        "hala_messages_v2",
        "hala_messages_v3",
        "hala_calls",
        "hala_calls_v2",
        "hala_calls_v3"
    };

    public static final String EXTRA_CHAT_ID = "hala_chat_id";
    public static final String EXTRA_CALL_ID = "hala_call_id";
    public static final String EXTRA_INCOMING_CALL = "hala_incoming_call";
    public static final String EXTRA_CALL_ACTION = "hala_call_action";
    public static final String KEY_TEXT_REPLY = "hala_key_text_reply";

    private static final int CALL_NOTIFICATION_BASE_ID = 90000;
    private static final int MESSAGE_NOTIFICATION_BASE_ID = 10000;
    private static final long ACTIVE_CALL_DEDUPE_WINDOW_MS = 35_000L;

    private static volatile String activeRingingCallId = null;
    private static volatile long activeRingingCallStartedAt = 0L;

    private NotificationHelper() {}

    private static Uri getMessageToneUri(Context context) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.hala_message_tone);
    }

    private static Uri getCallRingtoneUri(Context context) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.hala_call_ringtone);
    }

    public static boolean canUseFullScreenIntent(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                NotificationManager nm = context.getSystemService(NotificationManager.class);
                return nm != null && nm.canUseFullScreenIntent();
            } catch (Throwable ignored) {
                return false;
            }
        }
        return true;
    }

    public static void ensureNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        for (String legacyId : LEGACY_CHANNELS) {
            try {
                manager.deleteNotificationChannel(legacyId);
            } catch (Throwable ignored) {}
        }

        // 1. High-priority Messages channel with dedicated Hala message tone
        NotificationChannel messagesChannel = new NotificationChannel(
            CHANNEL_MESSAGES,
            "Hala Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        messagesChannel.setDescription("New chat messages, voice notes, and mentions");
        messagesChannel.enableLights(true);
        messagesChannel.setLightColor(Color.parseColor("#0B7E52"));
        messagesChannel.enableVibration(true);
        messagesChannel.setVibrationPattern(new long[] { 0, 180, 100, 180 });
        messagesChannel.setShowBadge(true);
        messagesChannel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        AudioAttributes msgAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        messagesChannel.setSound(getMessageToneUri(context), msgAttrs);
        manager.createNotificationChannel(messagesChannel);

        // 2. High-priority Incoming Calls channel using Hala's bundled custom ringtone (NOT mobile default TYPE_RINGTONE).
        // SystemUI owns this channel playback so it rings cleanly on Android 13, 14, and 15 even when app is killed/backgrounded.
        NotificationChannel callsChannel = new NotificationChannel(
            CHANNEL_CALLS,
            "Hala Incoming Calls",
            NotificationManager.IMPORTANCE_HIGH
        );
        callsChannel.setDescription("Incoming voice and video calls");
        callsChannel.enableLights(true);
        callsChannel.setLightColor(Color.parseColor("#0B7E52"));
        callsChannel.enableVibration(true);
        callsChannel.setVibrationPattern(new long[] { 0, 500, 350, 500, 350, 500 });
        callsChannel.setShowBadge(true);
        callsChannel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        AudioAttributes callAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        callsChannel.setSound(getCallRingtoneUri(context), callAttrs);
        manager.createNotificationChannel(callsChannel);
    }

    public static boolean hasNotificationPermission(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return (
                ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            );
        }
        return true;
    }

    public static void showMessageNotification(
        Context context,
        String title,
        String body,
        String tag,
        String chatId
    ) {
        ensureNotificationChannels(context);
        if (!hasNotificationPermission(context)) {
            return;
        }

        CallRingtonePlayer.wakeScreenBriefly(context, 4500L);

        String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Hala Chat";
        String safeBody = (body != null && !body.trim().isEmpty()) ? body.trim() : "New message";
        String cleanChatId = (chatId != null && !chatId.trim().isEmpty()) ? chatId.trim() : "";

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (!cleanChatId.isEmpty()) {
            openIntent.putExtra(EXTRA_CHAT_ID, cleanChatId);
        }

        int notificationId = computeChatNotificationId(cleanChatId, tag);

        int immutableFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent pendingIntent = PendingIntent.getActivity(context, notificationId, openIntent, immutableFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(Color.parseColor("#0B7E52"))
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(getMessageToneUri(context))
            .setVibrate(new long[] { 0, 180, 100, 180 })
            .setLights(Color.parseColor("#0B7E52"), 600, 1000)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        // Inline Reply action (Direct Reply from notification shade & lockscreen)
        if (!cleanChatId.isEmpty()) {
            RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY)
                .setLabel("Reply...")
                .build();

            Intent replyIntent = new Intent(context, NotificationActionReceiver.class);
            replyIntent.setAction(NotificationActionReceiver.ACTION_MESSAGE_REPLY);
            replyIntent.putExtra(EXTRA_CHAT_ID, cleanChatId);

            int mutableFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;

            PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                context,
                notificationId + 50000,
                replyIntent,
                mutableFlags
            );

            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Reply",
                replyPendingIntent
            )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .build();

            builder.addAction(replyAction);
        }

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (Throwable ignored) {}
    }

    public static void cancelMessageNotification(Context context, String chatId) {
        if (context == null || chatId == null || chatId.trim().isEmpty()) {
            return;
        }
        NotificationManagerCompat.from(context).cancel(computeChatNotificationId(chatId.trim(), null));
    }

    public static void showIncomingCallNotification(
        Context context,
        String callerName,
        String callType,
        String callId
    ) {
        ensureNotificationChannels(context);

        String cleanCallId = (callId != null && !callId.trim().isEmpty()) ? callId.trim() : "";

        // Wake screen immediately when an incoming call arrives
        CallRingtonePlayer.wakeScreenBriefly(context, 10_000L);

        // If notification permission isn't granted, fall back to direct MediaPlayer ringtone in foreground
        if (!hasNotificationPermission(context)) {
            CallRingtonePlayer.start(context, cleanCallId);
            return;
        }

        long now = System.currentTimeMillis();
        if (
            !cleanCallId.isEmpty() &&
            cleanCallId.equals(activeRingingCallId) &&
            (now - activeRingingCallStartedAt) < ACTIVE_CALL_DEDUPE_WINDOW_MS
        ) {
            return;
        }
        activeRingingCallId = cleanCallId;
        activeRingingCallStartedAt = now;

        boolean isVideo = "video".equalsIgnoreCase(callType);
        String safeCaller = (callerName != null && !callerName.trim().isEmpty()) ? callerName.trim() : "Someone";
        String title = isVideo ? "Incoming Video Call" : "Incoming Voice Call";
        String body = safeCaller + " is calling you on Hala Chat";

        int notificationId = computeCallNotificationId(cleanCallId);
        int immutableFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        Intent openCallIntent = new Intent(context, MainActivity.class);
        openCallIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        openCallIntent.putExtra(EXTRA_INCOMING_CALL, true);
        if (!cleanCallId.isEmpty()) {
            openCallIntent.putExtra(EXTRA_CALL_ID, cleanCallId);
        }

        PendingIntent contentIntent = PendingIntent.getActivity(context, notificationId, openCallIntent, immutableFlags);
        PendingIntent fullScreenIntent = PendingIntent.getActivity(context, notificationId + 1, openCallIntent, immutableFlags);

        Intent answerIntent = new Intent(context, MainActivity.class);
        answerIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        answerIntent.putExtra(EXTRA_INCOMING_CALL, true);
        answerIntent.putExtra(EXTRA_CALL_ACTION, "answer");
        if (!cleanCallId.isEmpty()) {
            answerIntent.putExtra(EXTRA_CALL_ID, cleanCallId);
        }
        PendingIntent answerPendingIntent = PendingIntent.getActivity(
            context,
            notificationId + 2,
            answerIntent,
            immutableFlags
        );

        Intent declineIntent = new Intent(context, NotificationActionReceiver.class);
        declineIntent.setAction(NotificationActionReceiver.ACTION_CALL_DECLINE);
        if (!cleanCallId.isEmpty()) {
            declineIntent.putExtra(EXTRA_CALL_ID, cleanCallId);
        }
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId + 3,
            declineIntent,
            immutableFlags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_CALLS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(Color.parseColor("#0B7E52"))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(false)
            .setTimeoutAfter(45_000L)
            .setSound(getCallRingtoneUri(context))
            .setVibrate(new long[] { 0, 500, 350, 500, 350, 500 })
            .setContentIntent(contentIntent)
            .setFullScreenIntent(fullScreenIntent, true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent)
            .addAction(android.R.drawable.ic_menu_call, "Answer", answerPendingIntent);

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT;

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification);
        } catch (Throwable ignored) {
            CallRingtonePlayer.start(context, cleanCallId);
        }
    }

    public static void cancelCallNotification(Context context, String callId) {
        CallRingtonePlayer.stop(callId);
        if (context == null) {
            return;
        }
        String cleanCallId = (callId != null && !callId.trim().isEmpty()) ? callId.trim() : "";
        if (cleanCallId.isEmpty() || cleanCallId.equals(activeRingingCallId)) {
            activeRingingCallId = null;
            activeRingingCallStartedAt = 0L;
        }
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!cleanCallId.isEmpty()) {
            manager.cancel(computeCallNotificationId(cleanCallId));
        } else {
            manager.cancel(CALL_NOTIFICATION_BASE_ID);
        }
    }

    private static int computeChatNotificationId(String chatId, String tag) {
        if (chatId != null && !chatId.isEmpty()) {
            return MESSAGE_NOTIFICATION_BASE_ID + Math.abs(chatId.hashCode() % 30000) + 1;
        }
        if (tag != null && !tag.isEmpty()) {
            return MESSAGE_NOTIFICATION_BASE_ID + Math.abs(tag.hashCode() % 30000) + 1;
        }
        return MESSAGE_NOTIFICATION_BASE_ID + (int) (System.currentTimeMillis() % 30000) + 1;
    }

    private static int computeCallNotificationId(String callId) {
        if (callId == null || callId.trim().isEmpty()) {
            return CALL_NOTIFICATION_BASE_ID;
        }
        return CALL_NOTIFICATION_BASE_ID + Math.abs(callId.hashCode() % 9000) + 1;
    }
}
