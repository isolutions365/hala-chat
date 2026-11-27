package com.halachat.app;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseException;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.PhoneAuthCredential;
import com.google.firebase.auth.PhoneAuthOptions;
import com.google.firebase.auth.PhoneAuthProvider;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Native Android Firebase Phone Auth bridge.
 * Uses Android Play Integrity / native Firebase SDK for background phone verification
 * without WebView reCAPTCHA image challenges.
 */
public class AndroidPhoneAuthBridge {

    private final MainActivity activity;

    public AndroidPhoneAuthBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        try {
            return !FirebaseApp.getApps(activity).isEmpty();
        } catch (Throwable ignored) {
            return false;
        }
    }

    @JavascriptInterface
    public void sendOtp(final String phoneNumber, final String requestId) {
        activity.runOnUiThread(() -> {
            if (!isAvailable()) {
                dispatchEvent(requestId, "error", "auth/not-configured", "Native Firebase is not initialized", null, null);
                return;
            }
            if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
                dispatchEvent(requestId, "error", "auth/invalid-phone-number", "Invalid phone number", null, null);
                return;
            }

            try {
                FirebaseAuth auth = FirebaseAuth.getInstance();
                PhoneAuthProvider.OnVerificationStateChangedCallbacks callbacks =
                    new PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                        @Override
                        public void onVerificationCompleted(@NonNull PhoneAuthCredential credential) {
                            signInWithNativeCredential(credential, requestId, "autoVerified");
                        }

                        @Override
                        public void onVerificationFailed(@NonNull FirebaseException e) {
                            String code = mapFirebaseErrorCode(e);
                            dispatchEvent(requestId, "error", code, e.getMessage(), null, null);
                        }

                        @Override
                        public void onCodeSent(
                            @NonNull String verificationId,
                            @NonNull PhoneAuthProvider.ForceResendingToken token
                        ) {
                            dispatchEvent(requestId, "codeSent", null, null, verificationId, null);
                        }
                    };

                PhoneAuthOptions options = PhoneAuthOptions
                    .newBuilder(auth)
                    .setPhoneNumber(phoneNumber.trim())
                    .setTimeout(60L, TimeUnit.SECONDS)
                    .setActivity(activity)
                    .setCallbacks(callbacks)
                    .build();

                PhoneAuthProvider.verifyPhoneNumber(options);
            } catch (Throwable t) {
                dispatchEvent(requestId, "error", "auth/internal-error", t.getMessage(), null, null);
            }
        });
    }

    @JavascriptInterface
    public void verifyCode(final String verificationId, final String smsCode, final String requestId) {
        activity.runOnUiThread(() -> {
            if (!isAvailable()) {
                dispatchEvent(requestId, "error", "auth/not-configured", "Native Firebase is not initialized", null, null);
                return;
            }
            if (verificationId == null || verificationId.trim().isEmpty() || smsCode == null || smsCode.trim().isEmpty()) {
                dispatchEvent(requestId, "error", "auth/invalid-verification-code", "Invalid verification code", null, null);
                return;
            }
            try {
                PhoneAuthCredential credential = PhoneAuthProvider.getCredential(verificationId.trim(), smsCode.trim());
                signInWithNativeCredential(credential, requestId, "verified");
            } catch (Throwable t) {
                dispatchEvent(requestId, "error", "auth/invalid-verification-code", t.getMessage(), null, null);
            }
        });
    }

    @JavascriptInterface
    public void signOutNative() {
        activity.runOnUiThread(() -> {
            try {
                if (isAvailable()) {
                    FirebaseAuth.getInstance().signOut();
                }
            } catch (Throwable ignored) {}
        });
    }

    private void signInWithNativeCredential(
        PhoneAuthCredential credential,
        String requestId,
        String successEvent
    ) {
        try {
            FirebaseAuth auth = FirebaseAuth.getInstance();
            auth
                .signInWithCredential(credential)
                .addOnSuccessListener(authResult -> {
                    FirebaseUser user = authResult != null ? authResult.getUser() : auth.getCurrentUser();
                    if (user == null) {
                        dispatchEvent(requestId, "error", "auth/internal-error", "No native Firebase user", null, null);
                        return;
                    }
                    user
                        .getIdToken(true)
                        .addOnSuccessListener(tokenResult -> {
                            String idToken = tokenResult != null ? tokenResult.getToken() : null;
                            if (idToken == null || idToken.trim().isEmpty()) {
                                dispatchEvent(requestId, "error", "auth/internal-error", "Empty native ID token", null, null);
                                return;
                            }
                            dispatchEvent(requestId, successEvent, null, null, null, idToken);
                        })
                        .addOnFailureListener(e ->
                            dispatchEvent(requestId, "error", mapFirebaseErrorCode(e), e.getMessage(), null, null)
                        );
                })
                .addOnFailureListener(e ->
                    dispatchEvent(requestId, "error", mapFirebaseErrorCode(e), e.getMessage(), null, null)
                );
        } catch (Throwable t) {
            dispatchEvent(requestId, "error", "auth/internal-error", t.getMessage(), null, null);
        }
    }

    private String mapFirebaseErrorCode(Exception e) {
        if (e instanceof FirebaseAuthException) {
            String raw = ((FirebaseAuthException) e).getErrorCode();
            if (raw != null && !raw.isEmpty()) {
                switch (raw) {
                    case "ERROR_INVALID_PHONE_NUMBER":
                        return "auth/invalid-phone-number";
                    case "ERROR_INVALID_VERIFICATION_CODE":
                        return "auth/invalid-verification-code";
                    case "ERROR_SESSION_EXPIRED":
                        return "auth/code-expired";
                    case "ERROR_TOO_MANY_REQUESTS":
                    case "ERROR_QUOTA_EXCEEDED":
                        return "auth/too-many-requests";
                    case "ERROR_APP_NOT_AUTHORIZED":
                        return "auth/app-not-authorized";
                    case "ERROR_MISSING_CLIENT_IDENTIFIER":
                        return "auth/missing-client-identifier";
                    default:
                        return "auth/" + raw.toLowerCase().replace("error_", "").replace('_', '-');
                }
            }
        }
        String msg = e != null && e.getMessage() != null ? e.getMessage() : "";
        if (msg.contains("MISSING_CLIENT_IDENTIFIER") || msg.contains("Play Integrity") || msg.contains("not authorized")) {
            return "auth/app-not-authorized";
        }
        return "auth/internal-error";
    }

    private void dispatchEvent(
        String requestId,
        String event,
        String code,
        String message,
        String verificationId,
        String idToken
    ) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("requestId", requestId != null ? requestId : "");
            payload.put("event", event != null ? event : "");
            if (code != null) payload.put("code", code);
            if (message != null) payload.put("message", message);
            if (verificationId != null) payload.put("verificationId", verificationId);
            if (idToken != null) payload.put("idToken", idToken);

            final String json = payload.toString();
            activity.runOnUiThread(() -> {
                WebView webView = activity.getBridge() != null ? activity.getBridge().getWebView() : null;
                if (webView != null) {
                    webView.evaluateJavascript(
                        "window.__halaNativePhoneAuthCallback && window.__halaNativePhoneAuthCallback(" + json + ");",
                        null
                    );
                }
            });
        } catch (Throwable ignored) {}
    }
}
