package com.halachat.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public final class NotificationHelper {

    public static final String CHANNEL_MESSAGES = "hala_messages";
    public static final String CHANNEL_CALLS = "hala_calls";
    public static final String EXTRA_CHAT_ID = "hala_chat_id";
    public static final String EXTRA_CALL_ID = "hala_call_id";
    public static final String EXTRA_INCOMING_CALL = "hala_incoming_call";

    private static final int CALL_NOTIFICATION_BASE_ID = 90000;

    private NotificationHelper() {}

    public static void ensureNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        // 1. High-priority Messages channel (heads-up banner + sound + vibration)
        NotificationChannel messagesChannel = new NotificationChannel(
            CHANNEL_MESSAGES,
            "Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        messagesChannel.setDescription("New chat messages and mentions");
        messagesChannel.enableLights(true);
        messagesChannel.setLightColor(Color.parseColor("#0B7E52"));
        messagesChannel.enableVibration(true);
        messagesChannel.setVibrationPattern(new long[] { 0, 200, 120, 200 });
        messagesChannel.setShowBadge(true);
        messagesChannel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        Uri msgSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        if (msgSound != null) {
            AudioAttributes msgAttrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            messagesChannel.setSound(msgSound, msgAttrs);
        }
        manager.createNotificationChannel(messagesChannel);

        // 2. High-priority Incoming Calls channel (ringtone + full-screen intent support)
        NotificationChannel callsChannel = new NotificationChannel(
            CHANNEL_CALLS,
            "Incoming Calls",
            NotificationManager.IMPORTANCE_HIGH
        );
        callsChannel.setDescription("Incoming voice and video calls");
        callsChannel.enableLights(true);
        callsChannel.setLightColor(Color.parseColor("#0B7E52"));
        callsChannel.enableVibration(true);
        callsChannel.setVibrationPattern(new long[] { 0, 600, 400, 600, 400, 600 });
        callsChannel.setShowBadge(true);
        callsChannel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ringtoneUri != null) {
            AudioAttributes callAttrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            callsChannel.setSound(ringtoneUri, callAttrs);
        }
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

        String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Hala Chat";
        String safeBody = (body != null && !body.trim().isEmpty()) ? body.trim() : "New message";

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (chatId != null && !chatId.trim().isEmpty()) {
            openIntent.putExtra(EXTRA_CHAT_ID, chatId.trim());
        }

        int requestCode = (tag != null && !tag.isEmpty())
            ? Math.abs(tag.hashCode() % 50000) + 1000
            : (int) (System.currentTimeMillis() % 50000) + 1000;

        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent pendingIntent = PendingIntent.getActivity(context, requestCode, openIntent, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(Color.parseColor("#0B7E52"))
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        try {
            NotificationManagerCompat.from(context).notify(requestCode, builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked concurrently
        }
    }

    public static void showIncomingCallNotification(
        Context context,
        String callerName,
        String callType,
        String callId
    ) {
        ensureNotificationChannels(context);
        if (!hasNotificationPermission(context)) {
            return;
        }

        boolean isVideo = "video".equalsIgnoreCase(callType);
        String safeCaller = (callerName != null && !callerName.trim().isEmpty()) ? callerName.trim() : "Someone";
        String title = isVideo ? "Incoming Video Call" : "Incoming Voice Call";
        String body = safeCaller + " is calling you on Hala Chat";

        Intent callIntent = new Intent(context, MainActivity.class);
        callIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        callIntent.putExtra(EXTRA_INCOMING_CALL, true);
        if (callId != null && !callId.trim().isEmpty()) {
            callIntent.putExtra(EXTRA_CALL_ID, callId.trim());
        }

        int notificationId = computeCallNotificationId(callId);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent contentIntent = PendingIntent.getActivity(context, notificationId, callIntent, piFlags);
        PendingIntent fullScreenIntent = PendingIntent.getActivity(context, notificationId + 1, callIntent, piFlags);

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_CALLS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(Color.parseColor("#0B7E52"))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(45_000L)
            .setVibrate(new long[] { 0, 600, 400, 600, 400, 600 })
            .setContentIntent(contentIntent)
            .setFullScreenIntent(fullScreenIntent, true);

        if (ringtoneUri != null) {
            builder.setSound(ringtoneUri);
        }

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked concurrently
        }
    }

    public static void cancelCallNotification(Context context, String callId) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (callId != null && !callId.trim().isEmpty()) {
            manager.cancel(computeCallNotificationId(callId));
        } else {
            manager.cancel(CALL_NOTIFICATION_BASE_ID);
        }
    }

    private static int computeCallNotificationId(String callId) {
        if (callId == null || callId.trim().isEmpty()) {
            return CALL_NOTIFICATION_BASE_ID;
        }
        return CALL_NOTIFICATION_BASE_ID + Math.abs(callId.hashCode() % 9000) + 1;
    }
}
