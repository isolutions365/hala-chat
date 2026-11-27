package com.halachat.app;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

public final class CallRingtonePlayer {

    private static final long MAX_RING_DURATION_MS = 45_000L;
    private static final long[] VIBRATION_PATTERN = new long[] { 0, 500, 350, 500, 900 };

    private static final Object LOCK = new Object();
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    private static MediaPlayer mediaPlayer = null;
    private static Vibrator activeVibrator = null;
    private static AudioManager audioManagerRef = null;
    private static AudioFocusRequest audioFocusRequest = null;
    private static String activeCallId = null;
    private static Runnable autoStopRunnable = null;

    private CallRingtonePlayer() {}

    @SuppressWarnings("deprecation")
    public static void wakeScreenBriefly(Context context, long durationMs) {
        if (context == null) return;
        try {
            PowerManager pm = (PowerManager) context.getApplicationContext().getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isInteractive()) {
                return;
            }
            PowerManager.WakeLock wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK |
                PowerManager.ACQUIRE_CAUSES_WAKEUP |
                PowerManager.ON_AFTER_RELEASE,
                "HalaChat:NotificationWakeLock"
            );
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(Math.max(2000L, Math.min(durationMs, 15_000L)));
        } catch (Throwable ignored) {
            try {
                PowerManager pm = (PowerManager) context.getApplicationContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isInteractive()) {
                    PowerManager.WakeLock fallback = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                        "HalaChat:FallbackWakeLock"
                    );
                    fallback.setReferenceCounted(false);
                    fallback.acquire(Math.max(2000L, Math.min(durationMs, 10_000L)));
                }
            } catch (Throwable ignoredFallback) {}
        }
    }

    public static void start(Context context, String callId) {
        if (context == null) return;
        Context appContext = context.getApplicationContext();
        String cleanCallId = (callId != null && !callId.trim().isEmpty()) ? callId.trim() : "default_call";

        synchronized (LOCK) {
            if (cleanCallId.equals(activeCallId) && isPlayingLocked()) {
                return;
            }

            stopInternalLocked();
            activeCallId = cleanCallId;

            int ringerMode = AudioManager.RINGER_MODE_NORMAL;
            try {
                AudioManager am = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
                audioManagerRef = am;
                if (am != null) {
                    ringerMode = am.getRingerMode();
                }
            } catch (Throwable ignored) {
                ringerMode = AudioManager.RINGER_MODE_NORMAL;
            }

            if (ringerMode == AudioManager.RINGER_MODE_SILENT) {
                scheduleAutoStopLocked();
                return;
            }

            startVibrationLocked(appContext);

            if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
                requestRingtoneFocusLocked(appContext);
                boolean ringZero = false;
                if (audioManagerRef != null) {
                    try {
                        ringZero = audioManagerRef.getStreamVolume(AudioManager.STREAM_RING) <= 0;
                    } catch (Throwable ignored) {}
                }
                int primaryUsage = ringZero
                    ? AudioAttributes.USAGE_MEDIA
                    : AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
                boolean started = startMediaPlayerLocked(appContext, primaryUsage);
                if (!started) {
                    startMediaPlayerLocked(appContext, AudioAttributes.USAGE_MEDIA);
                }
            }

            scheduleAutoStopLocked();
        }
    }

    public static void stop(String callId) {
        synchronized (LOCK) {
            String cleanCallId = (callId != null && !callId.trim().isEmpty()) ? callId.trim() : "";
            if (cleanCallId.isEmpty() || activeCallId == null || cleanCallId.equals(activeCallId)) {
                stopInternalLocked();
            }
        }
    }

    public static void stopAll() {
        synchronized (LOCK) {
            stopInternalLocked();
        }
    }

    private static boolean isPlayingLocked() {
        try {
            return mediaPlayer != null && mediaPlayer.isPlaying();
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static void requestRingtoneFocusLocked(Context appContext) {
        try {
            if (audioManagerRef == null) {
                audioManagerRef = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManagerRef == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attrs)
                    .setWillPauseWhenDucked(false)
                    .build();
                audioManagerRef.requestAudioFocus(audioFocusRequest);
            }
        } catch (Throwable ignored) {}
    }

    private static boolean startMediaPlayerLocked(Context appContext, int audioUsage) {
        AssetFileDescriptor afd = null;
        MediaPlayer player = null;
        try {
            afd = appContext.getResources().openRawResourceFd(R.raw.hala_call_ringtone);
            if (afd == null) {
                return false;
            }
            player = new MediaPlayer();
            player.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(audioUsage)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            player.setLooping(true);
            player.setVolume(1.0f, 1.0f);
            player.prepare();
            player.start();
            mediaPlayer = player;
            return true;
        } catch (Throwable ignored) {
            if (player != null) {
                try {
                    player.release();
                } catch (Throwable ignoredRelease) {}
            }
            return false;
        } finally {
            if (afd != null) {
                try {
                    afd.close();
                } catch (Throwable ignoredClose) {}
            }
        }
    }

    @SuppressWarnings("deprecation")
    private static void startVibrationLocked(Context appContext) {
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) appContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) appContext.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) {
                return;
            }
            activeVibrator = vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0));
            } else {
                vibrator.vibrate(VIBRATION_PATTERN, 0);
            }
        } catch (Throwable ignored) {}
    }

    private static void scheduleAutoStopLocked() {
        if (autoStopRunnable != null) {
            MAIN_HANDLER.removeCallbacks(autoStopRunnable);
        }
        autoStopRunnable = CallRingtonePlayer::stopAll;
        MAIN_HANDLER.postDelayed(autoStopRunnable, MAX_RING_DURATION_MS);
    }

    private static void stopInternalLocked() {
        if (autoStopRunnable != null) {
            MAIN_HANDLER.removeCallbacks(autoStopRunnable);
            autoStopRunnable = null;
        }
        activeCallId = null;

        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (Throwable ignored) {}
            try {
                mediaPlayer.release();
            } catch (Throwable ignored) {}
            mediaPlayer = null;
        }

        if (audioManagerRef != null && audioFocusRequest != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                audioManagerRef.abandonAudioFocusRequest(audioFocusRequest);
            } catch (Throwable ignored) {}
            audioFocusRequest = null;
        }

        if (activeVibrator != null) {
            try {
                activeVibrator.cancel();
            } catch (Throwable ignored) {}
            activeVibrator = null;
        }
    }
}
