package com.halachat.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.content.pm.PackageInfoCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Play-Protect and Play-Store compliant update notifier.
 * Displays the top header banner when a newer release exists and opens the verified
 * download link in the system browser instead of requesting REQUEST_INSTALL_PACKAGES.
 */
public class AppUpdateManager {

    private static final String VERSION_MANIFEST_URL =
        "https://github.com/isolutions365/hala-chat/releases/download/android-latest/version.json";
    private static final String TRUSTED_APK_PREFIX =
        "https://github.com/isolutions365/hala-chat/";
    private static final long CHECK_INTERVAL_MS = 30L * 60L * 1000L; // 30 minutes

    private final Activity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private long lastCheckTimeMs = 0L;
    private boolean isChecking = false;
    private boolean dismissedForSession = false;

    private String pendingVersionName = null;
    private String pendingApkUrl = null;
    private String pendingNotes = null;

    private FrameLayout bannerWrapper = null;
    private TextView titleView = null;
    private TextView subtitleView = null;
    private TextView actionButton = null;
    private TextView closeButton = null;

    public AppUpdateManager(Activity activity) {
        this.activity = activity;
    }

    public void checkOnLaunch() {
        checkForUpdate(true);
    }

    public void onResume() {
        checkForUpdate(false);
    }

    public void onDestroy() {
        executor.shutdownNow();
    }

    private void checkForUpdate(boolean force) {
        if (isChecking || dismissedForSession) {
            return;
        }
        long now = System.currentTimeMillis();
        if (!force && (now - lastCheckTimeMs) < CHECK_INTERVAL_MS) {
            return;
        }

        isChecking = true;
        lastCheckTimeMs = now;

        executor.execute(() -> {
            try {
                long installedVersionCode = getInstalledVersionCode();
                String jsonBody = fetchTextWithRedirects(VERSION_MANIFEST_URL);
                if (jsonBody == null || jsonBody.trim().isEmpty()) {
                    return;
                }

                JSONObject manifest = new JSONObject(jsonBody);
                long remoteVersionCode = manifest.optLong("versionCode", -1L);
                String remoteVersionName = manifest.optString("versionName", "").trim();
                String apkUrl = manifest.optString("apkUrl", "").trim();
                String notes = manifest.optString("notes", "").trim();

                if (
                    remoteVersionCode > installedVersionCode &&
                    !apkUrl.isEmpty() &&
                    apkUrl.startsWith(TRUSTED_APK_PREFIX)
                ) {
                    pendingVersionName = remoteVersionName.isEmpty()
                        ? ("v" + remoteVersionCode)
                        : ("v" + remoteVersionName);
                    pendingApkUrl = apkUrl;
                    pendingNotes = notes;
                    mainHandler.post(this::showUpdateBanner);
                }
            } catch (Exception ignored) {
                // Silent failure when offline or release not yet published
            } finally {
                isChecking = false;
            }
        });
    }

    private long getInstalledVersionCode() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return PackageInfoCompat.getLongVersionCode(info);
        } catch (Exception e) {
            return 1L;
        }
    }

    private void showUpdateBanner() {
        if (activity.isFinishing() || activity.isDestroyed() || dismissedForSession) {
            return;
        }

        if (bannerWrapper == null) {
            createBannerView();
        }

        if (titleView != null) {
            titleView.setText("Hala Chat " + pendingVersionName + " available");
        }
        if (subtitleView != null) {
            subtitleView.setText(
                pendingNotes != null && !pendingNotes.isEmpty()
                    ? pendingNotes
                    : "Tap Update to download the latest version"
            );
        }
        if (actionButton != null) {
            actionButton.setText("Update");
            actionButton.setEnabled(true);
            actionButton.setAlpha(1f);
        }
        if (bannerWrapper != null) {
            bannerWrapper.setVisibility(View.VISIBLE);
        }
    }

    private void createBannerView() {
        ViewGroup contentRoot = activity.findViewById(android.R.id.content);
        if (contentRoot == null) {
            return;
        }

        final int padH = dp(12);
        final int padTopBase = dp(10);

        bannerWrapper = new FrameLayout(activity);
        FrameLayout.LayoutParams wrapperParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        );
        bannerWrapper.setLayoutParams(wrapperParams);
        bannerWrapper.setPadding(padH, padTopBase, padH, dp(6));
        bannerWrapper.setElevation(dp(12));

        // Respect status bar / notch inset so banner sits cleanly below system icons
        ViewCompat.setOnApplyWindowInsetsListener(bannerWrapper, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars());
            v.setPadding(padH, bars.top + padTopBase, padH, dp(6));
            return windowInsets;
        });

        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(12), dp(12));
        GradientDrawable cardBg = new GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            new int[] { Color.parseColor("#119160"), Color.parseColor("#086643") }
        );
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(dp(1), Color.parseColor("#33FFFFFF"));
        card.setBackground(cardBg);
        card.setElevation(dp(8));

        LinearLayout topRow = new LinearLayout(activity);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout textCol = new LinearLayout(activity);
        textCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textColParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        textColParams.setMarginEnd(dp(10));
        textCol.setLayoutParams(textColParams);

        titleView = new TextView(activity);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);

        subtitleView = new TextView(activity);
        subtitleView.setTextColor(Color.parseColor("#E2F7EE"));
        subtitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);

        textCol.addView(titleView);
        textCol.addView(subtitleView);

        actionButton = new TextView(activity);
        actionButton.setText("Update");
        actionButton.setTextColor(Color.parseColor("#086643"));
        actionButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        actionButton.setTypeface(Typeface.DEFAULT_BOLD);
        actionButton.setPadding(dp(14), dp(7), dp(14), dp(7));
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.WHITE);
        btnBg.setCornerRadius(dp(20));
        actionButton.setBackground(btnBg);
        actionButton.setOnClickListener(v -> onUpdateClicked());

        closeButton = new TextView(activity);
        closeButton.setText("\u2715");
        closeButton.setTextColor(Color.parseColor("#D5F2E6"));
        closeButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        closeButton.setPadding(dp(10), dp(4), dp(4), dp(4));
        closeButton.setOnClickListener(v -> {
            dismissedForSession = true;
            if (bannerWrapper != null) {
                bannerWrapper.setVisibility(View.GONE);
            }
        });

        topRow.addView(textCol);
        topRow.addView(actionButton);
        topRow.addView(closeButton);

        card.addView(topRow);
        bannerWrapper.addView(card);
        contentRoot.addView(bannerWrapper);
        ViewCompat.requestApplyInsets(bannerWrapper);
    }

    private void onUpdateClicked() {
        if (pendingApkUrl == null || !pendingApkUrl.startsWith(TRUSTED_APK_PREFIX)) {
            return;
        }
        try {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(pendingApkUrl));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(browserIntent);
            if (subtitleView != null) {
                subtitleView.setText("Opening download in browser...");
            }
        } catch (Exception e) {
            if (subtitleView != null) {
                subtitleView.setText("Unable to open download link. Please try again.");
            }
        }
    }

    private HttpURLConnection openConnectionFollowingRedirects(String urlString) throws IOException {
        String current = urlString;
        for (int hops = 0; hops < 6; hops++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(30_000);
            conn.setRequestProperty("Accept", "*/*");
            conn.setRequestProperty("Cache-Control", "no-cache");
            int code = conn.getResponseCode();
            if (
                code == HttpURLConnection.HTTP_MOVED_PERM ||
                code == HttpURLConnection.HTTP_MOVED_TEMP ||
                code == HttpURLConnection.HTTP_SEE_OTHER ||
                code == 307 ||
                code == 308
            ) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new IOException("Redirect without Location header");
                }
                current = new URL(new URL(current), location).toString();
                if (!current.startsWith("https://")) {
                    throw new IOException("Blocked non-HTTPS redirect");
                }
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect();
                throw new IOException("HTTP error " + code);
            }
            return conn;
        }
        throw new IOException("Too many redirects");
    }

    private String fetchTextWithRedirects(String urlString) throws IOException {
        HttpURLConnection conn = openConnectionFollowingRedirects(urlString);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } finally {
            conn.disconnect();
        }
    }

    private int dp(int value) {
        return Math.round(
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                activity.getResources().getDisplayMetrics()
            )
        );
    }
}
