import React, { useState, useEffect, useRef, useCallback } from 'react';
import { applyTypography, readTypography } from './lib/typography';
import type { ConfirmationResult } from 'firebase/auth';
import { confirmPhoneOtp, requireOtpSession } from './lib/phoneAuth';
import { AnimatePresence } from 'motion/react';
import { SplashScreen } from './components/SplashScreen';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PhoneAuthScreen } from './components/PhoneAuthScreen';
import { OtpVerificationScreen } from './components/OtpVerificationScreen';
import { ProfileSetupScreen } from './components/ProfileSetupScreen';
import { ChatListScreen } from './components/ChatListScreen';
import { ConversationScreen } from './components/ConversationScreen';
import { RestoreChatsScreen } from './components/RestoreChatsScreen';
import { TermsPrivacyModal } from './components/TermsPrivacyModal';
import { Language, Screen, Country, UserProfile, ChatModel, CallModel, CallType } from './types';
import { ALL_COUNTRIES, GULF_COUNTRIES } from './lib/countries';
import { createSessionRestorer } from './lib/sessionRestore';
import {
  updateProfilePhoto,
  USING_EMULATORS,
  requestPhoneOtp,
  requestNotificationPermission,
  clearRecaptchaVerifier,
  checkUserExists,
  verifyCachedAuthSession,
  clearCachedUserProfile,
  saveUserProfileToDatabase,
  onAuthUserChanged,
  logoutUser,
  initiateCall,
  updateCallStatus,
  answerCall,
  subscribeToIncomingCalls,
  saveCallRating,
  setTwoStepPin,
  verifyTwoStepPin,
  isTwoStepEnabled,
  fetchEncryptedKeyBackup,
  ensureUserE2EEKeyPair,
  clearCryptoKeyCache,
} from './lib/firebase';
import { usePresenceHeartbeat } from './hooks/usePresenceHeartbeat';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { CallRatingModal } from './components/CallRatingModal';
import { Smartphone, Monitor } from 'lucide-react';
import { PWAInstallButton } from './components/PWAInstallButton';
import { TestVersionBanner } from './components/TestVersionBanner';

const isPublishMode =
  import.meta.env.PROD ||
  (typeof window !== 'undefined' &&
    (window.location.hostname.includes('ais-pre') ||
     window.location.hostname.includes('web.app') ||
     window.location.hostname.includes('firebaseapp.com') ||
     (!window.location.hostname.includes('ais-dev') &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1'))));

export default function App() {
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  // Splash screen must run strictly once per app launch
  const [splashDone, setSplashDone] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('hala.splashCompleted') === 'true';
    } catch {
      return false;
    }
  });
  const hasCompletedSplashRef = useRef<boolean>(splashDone);

  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    try {
      if (sessionStorage.getItem('hala.splashCompleted') === 'true') {
        return 'welcome';
      }
    } catch {}
    return 'splash';
  });
  const currentScreenRef = useRef<Screen>(currentScreen);
  currentScreenRef.current = currentScreen;

  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('hala.interfaceLanguage');
      if (saved === 'en' || saved === 'ar') return saved;
      return 'ar';
    } catch {
      return 'ar';
    }
  });
  useEffect(() => {
    if (isDebug) console.log('[Debug][Language] Current language:', language);
    try { localStorage.setItem('hala.interfaceLanguage', language); } catch { /* Storage may be unavailable in private browsing. */ }
  }, [language]);

  useEffect(() => {
    const syncTypography = () => applyTypography(readTypography());
    syncTypography();
    window.addEventListener('storage', syncTypography);
    window.addEventListener('hala-typography-changed', syncTypography);
    return () => {
      window.removeEventListener('storage', syncTypography);
      window.removeEventListener('hala-typography-changed', syncTypography);
    };
  }, []);

  const [selectedCountry, setSelectedCountry] = useState<Country>(GULF_COUNTRIES.find(country => country.code === 'SA')!);
  const [fullPhoneNumber, setFullPhoneNumber] = useState<string>('');
  const [authenticatedUid, setAuthenticatedUid] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const isVerifyingOtpRef = useRef<boolean>(false);
  const isSendingOtpRef = useRef<boolean>(false);

  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeChat, setActiveChat] = useState<ChatModel | null>(null);
  const [sessionStatus, _setSessionStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const isExplicitLogoutRef = useRef<boolean>(false);
  const [sessionRetry, setSessionRetry] = useState(0);

  // 'ready' is terminal until explicit logout
  const setSessionStatus = useCallback((next: 'loading' | 'ready' | 'error' | ((prev: 'loading' | 'ready' | 'error') => 'loading' | 'ready' | 'error')) => {
    _setSessionStatus(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (prev === 'ready' && resolved !== 'ready' && !isExplicitLogoutRef.current) {
        if (isDebug) console.log('[Debug][Session] Blocked transition from terminal ready to:', resolved);
        return 'ready';
      }
      return resolved;
    });
  }, [isDebug]);

  // Single authoritative presence heartbeat writer (60s interval while visible & online)
  usePresenceHeartbeat(userProfile?.id);

  // Calling States
  const [incomingCall, setIncomingCall] = useState<CallModel | null>(null);
  const [activeCall, setActiveCall] = useState<CallModel | null>(null);
  const handledCallIdsRef = useRef<Set<string>>(new Set());
  const isStartingCallRef = useRef<boolean>(false);
  const [isVerifyingBackground, setIsVerifyingBackground] = useState<boolean>(false);
  const [isPinRequired, setIsPinRequired] = useState<boolean>(false);
  const [isRestoreRequired, setIsRestoreRequired] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken;

  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const isRestoreRequiredRef = useRef(isRestoreRequired);
  isRestoreRequiredRef.current = isRestoreRequired;
  const isPinRequiredRef = useRef(isPinRequired);
  isPinRequiredRef.current = isPinRequired;

  const applyRestoredSession = useCallback(async (user: { uid: string; phoneNumber?: string | null }, profile: any | null) => {
    if (isDebug) console.log('[Debug][Session] applyRestoredSession started for UID:', user.uid);
    const phone = user.phoneNumber || profile?.phone || '';
    const country = ALL_COUNTRIES.find(item => phone.startsWith(item.dialCode))
      || GULF_COUNTRIES.find(item => item.code === 'SA')!;
    setAuthenticatedUid(user.uid);
    setFullPhoneNumber(phone);
    setSelectedCountry(country);
    setActiveChat(null);

    const twoStepEnabled = profile?.two_factor?.enabled === true;
    setIsPinRequired(twoStepEnabled && !sessionTokenRef.current);

    // Step 1: Check E2EE Key Pair
    try {
      // NEVER auto-fresh if a key exists on server. Force user to see warning screen.
      await ensureUserE2EEKeyPair(user.uid, false);
    } catch (err: any) {
      if (err.message === 'RESTORE_REQUIRED') {
        setIsRestoreRequired(true);
        setSessionStatus('ready');
        setCurrentScreen('restore_pin');
        return;
      }
      console.error('[App] E2EE ensure error:', err);
    }

    // Step 2: Check 2FA PIN Gate
    if (twoStepEnabled && !sessionTokenRef.current) {
      setSessionStatus('ready');
      setCurrentScreen('restore_pin');
      return;
    }

    setSessionStatus('ready');
    if (profile) {
      const restoredUser: UserProfile = {
        id: user.uid,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        phoneNumber: phone,
        status: profile.status,
        country,
        createdAt: profile.created_at,
        lastSeen: profile.last_seen,
        blockedUsers: profile.blockedUsers || profile.blocked_users || [],
        privacySettings: profile.privacy_settings,
        twoFactor: profile.two_factor,
        preferredLanguage: profile.preferred_language,
        autoTranslateEnabled: profile.auto_translate_enabled,
        publicKey: profile.public_key,
        isFlagged: profile.is_flagged || false,
        flaggedReason: profile.flagged_reason || '',
      };
      setUserProfile(restoredUser);
      if (hasCompletedSplashRef.current) {
        setCurrentScreen('chats');
      }
    } else {
      setUserProfile(null);
      if (hasCompletedSplashRef.current) {
        setCurrentScreen('profile');
      }
    }
  }, [setSessionStatus, isDebug]);

  const handleSplashComplete = useCallback(async () => {
    if (hasCompletedSplashRef.current) return;
    hasCompletedSplashRef.current = true;
    setSplashDone(true);
    try {
      sessionStorage.setItem('hala.splashCompleted', 'true');
    } catch {}
    if (isDebug) console.log('[Debug][Splash] handleSplashComplete executed');

    if (userProfileRef.current) {
      setCurrentScreen('chats');
      return;
    }
    if (isRestoreRequiredRef.current || isPinRequiredRef.current) {
      setCurrentScreen('restore_pin');
      return;
    }

    try {
      const cached = await verifyCachedAuthSession(1800);
      if (cached.isAuthenticated && cached.user) {
        await applyRestoredSession(cached.user, cached.profile);
        return;
      }
    } catch (err) {
      if (isDebug) console.warn('[Debug][Splash] verifyCachedAuthSession warning:', err);
    }

    setCurrentScreen('welcome');
  }, [applyRestoredSession, isDebug]);

  const handleGetStarted = useCallback(async () => {
    if (isVerifyingBackground) return;
    setIsVerifyingBackground(true);
    let isExplicitLogout = false;
    try {
      isExplicitLogout = localStorage.getItem('hala.explicitLogout') === 'true';
    } catch {}

    if (isExplicitLogout) {
      try { localStorage.removeItem('hala.explicitLogout'); } catch {}
      setIsVerifyingBackground(false);
      setCurrentScreen('phone');
      return;
    }

    try {
      const cached = await verifyCachedAuthSession(2200);
      if (cached.isAuthenticated && cached.user) {
        await applyRestoredSession(cached.user, cached.profile);
        return;
      }
    } catch (err) {
      console.warn('[App] Proactive background verification before phone auth:', err);
    } finally {
      setIsVerifyingBackground(false);
    }
    // Only proceed to PhoneAuthScreen if no cached session exists
    setCurrentScreen('phone');
  }, [isVerifyingBackground, applyRestoredSession]);

  // Store latest callbacks in refs so the restorer effect has zero changing dependencies
  const applyRestoredSessionRef = useRef(applyRestoredSession);
  applyRestoredSessionRef.current = applyRestoredSession;
  const setSessionStatusRef = useRef(setSessionStatus);
  setSessionStatusRef.current = setSessionStatus;
  const restorerRef = useRef<ReturnType<typeof createSessionRestorer<any>> | null>(null);

  // Initialize session restorer and onAuthUserChanged listener strictly ONCE on mount
  useEffect(() => {
    const restorer = createSessionRestorer(checkUserExists, state => {
      if (isDebug) console.log('[Debug][Auth] Session restorer state changed to:', state.status);
      if (state.status === 'loading' || state.status === 'error') {
        setSessionStatusRef.current(state.status);
        return;
      }
      setSessionStatusRef.current('ready');
      if (state.status === 'signed-out') {
        setAuthenticatedUid('');
        setUserProfile(null);
        setActiveChat(null);
        setActiveCall(null);
        setIncomingCall(null);
        setFullPhoneNumber('');
        setConfirmationResult(null);
        confirmationResultRef.current = null;
        setCurrentScreen(curr => (curr === 'splash' && !hasCompletedSplashRef.current ? curr : 'welcome'));
        return;
      }
      let isExplicitLogout = false;
      try { isExplicitLogout = localStorage.getItem('hala.explicitLogout') === 'true'; } catch {}
      if (isExplicitLogout) {
        return;
      }
      void applyRestoredSessionRef.current(state.user, state.profile);
    });

    restorerRef.current = restorer;

    const unsubscribe = onAuthUserChanged(user => {
      if (isDebug) console.log('[Debug][Auth] onAuthUserChanged fired, user UID:', user?.uid || 'signed-out');
      void restorer.restore(user);
    });

    return () => {
      restorer.dispose();
      restorerRef.current = null;
      unsubscribe();
    };
  }, []);

  // Handle manual session retry without re-subscribing onAuthUserChanged
  useEffect(() => {
    if (sessionRetry === 0) return;
    if (restorerRef.current) {
      if (isDebug) console.log('[Debug][Auth] Manual session retry triggered (attempt ' + sessionRetry + ')');
      void verifyCachedAuthSession(2000).then(cached => {
        if (cached.user && restorerRef.current) {
          void restorerRef.current.restore(cached.user);
        } else {
          setSessionStatusRef.current('error');
        }
      });
    }
  }, [sessionRetry]);

  // Failsafe timeout to prevent blank/loading screen lockup on mobile startup
  // ONLY active when genuinely loading, clears immediately upon transition to 'ready'
  useEffect(() => {
    if (sessionStatus !== 'loading') {
      if (isDebug) console.log('[Debug][Timer] sessionStatus is not loading (' + sessionStatus + '), timer inactive');
      return;
    }

    if (isDebug) console.log('[Debug][Timer] Starting 3500ms failsafe timer (genuinely loading)');
    const timer = setTimeout(() => {
      if (isDebug) console.log('[Debug][Timer] 3500ms failsafe timer fired');
      setSessionStatus(prev => {
        if (prev !== 'loading') return prev;
        // Only set ready if we are on splash or welcome to avoid blank screens.
        // NEVER bypass PIN verification or restore warning screens!
        const screen = currentScreenRef.current;
        if (screen === 'splash' || screen === 'welcome') {
          if (isDebug) console.log('[Debug][Timer] Failsafe transitioned loading -> ready for screen:', screen);
          return 'ready';
        }
        return prev;
      });
    }, 3500);

    return () => {
      if (isDebug) console.log('[Debug][Timer] Clearing failsafe timer immediately on transition or unmount');
      clearTimeout(timer);
    };
  }, [sessionStatus, setSessionStatus, isDebug]);

  // Listen to incoming calls for the authenticated user and register FCM push token
  useEffect(() => {
    if (!userProfile) return;
    const currentUserId =
      userProfile.id || `user_${userProfile.phoneNumber.replace(/\D/g, '')}`;

    // Auto-register FCM push token for logged in user
    void requestNotificationPermission(currentUserId);

    const unsub = subscribeToIncomingCalls(currentUserId, (incoming) => {
      if (incoming && !activeCall) {
        if (handledCallIdsRef.current.has(incoming.id)) {
          console.log(`[App] Incoming call ${incoming.id} already handled or ended. Ignoring.`);
          return;
        }
        setIncomingCall(incoming);

        // Native browser/PWA alert for incoming call
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const notif = new Notification(`Incoming ${incoming.type} call`, {
              body: `Call from ${incoming.callerName}`,
              icon: incoming.callerAvatar || '/icons/icon-192.png',
              tag: `call-${incoming.id}`,
              requireInteraction: true,
            });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch (e) {
            console.warn('[App] Native call notification warning:', e);
          }
        }
      } else if (!incoming) {
        setIncomingCall(null);
      }
    });

    return () => unsub();
  }, [userProfile, activeCall]);

  const handleSendOtp = async (
    phoneNumberWithCode: string,
    country: Country
  ): Promise<{ success: boolean; error?: string }> => {
    if (isSendingOtpRef.current) {
      console.log('[App] OTP send already in flight, ignoring duplicate call');
      return { success: false, error: 'OTP request in progress' };
    }
    isSendingOtpRef.current = true;
    setIsLoading(true);
    setConfirmationResult(null);
    confirmationResultRef.current = null;
    setFullPhoneNumber(phoneNumberWithCode);
    setSelectedCountry(country);

    try {
      const res = await requestPhoneOtp(phoneNumberWithCode, 2, language);
      const session = requireOtpSession(res);
      confirmationResultRef.current = session;
      setConfirmationResult(session);
      setCurrentScreen('otp');
      return { success: true };
    } catch (err: any) {
      console.warn('Error sending OTP:', err);
      clearRecaptchaVerifier('recaptcha-container');
      return { success: false, error: err?.message || 'Error communicating with Firebase' };
    } finally {
      setIsLoading(false);
      isSendingOtpRef.current = false;
    }
  };

  const handleVerifyOtpCode = async (
    otpCode: string
  ): Promise<{ success: boolean; isExistingUser?: boolean; error?: string }> => {
    if (isVerifyingOtpRef.current) {
      console.log('[App] Verification already in progress, ignoring duplicate submit');
      return { success: true };
    }
    isVerifyingOtpRef.current = true;

    try {
      const activeSession = confirmationResultRef.current || confirmationResult;
      if (!activeSession) {
        throw new Error(
          language === 'ar'
            ? 'انتهت جلسة التحقق، يرجى طلب رمز جديد'
            : 'Verification session missing. Please request a new code.'
        );
      }

      // Clear explicit logout flag so new session is stored and restored properly
      try { localStorage.removeItem('hala.explicitLogout'); } catch {}

      await confirmPhoneOtp(activeSession, otpCode);
      // The auth observer loads the profile and chooses chats or profile setup.
      return { success: true };
    } catch (err: any) {
      console.warn('Firebase OTP verification failed:', err);

      // Check if user is already authenticated in Firebase Auth (e.g. race condition on double confirmation)
      try {
        const { getFirebaseAuth } = await import('./lib/firebase');
        const authInst = getFirebaseAuth();
        if (authInst?.currentUser) {
          try { localStorage.removeItem('hala.explicitLogout'); } catch {}
          console.log('[App] User is already authenticated after verification attempt, resolving as success');
          return { success: true };
        }
      } catch {}

      let errorMsg = err?.message || 'Verification failed';
      if (err?.code === 'auth/invalid-verification-code') {
        errorMsg = language === 'ar' ? 'رمز التحقق غير صحيح، يرجى التأكد من الأرقام المدخلة' : 'Invalid verification code. Please check the digits.';
      } else if (err?.code === 'auth/code-expired') {
        errorMsg = language === 'ar'
          ? 'انتهت صلاحية هذا الرمز أو تم استخدامه بالفعل. يرجى الضغط على "إعادة إرسال الرمز" للحصول على رمز جديد.'
          : 'This code has expired or was already used. Please click "Resend code" to get a new code.';
      }
      return { success: false, error: errorMsg };
    } finally {
      // Delay releasing lock slightly to absorb rapid duplicate triggers
      setTimeout(() => {
        isVerifyingOtpRef.current = false;
      }, 1500);
    }
  };

  const handleResendOtp = async (): Promise<{ success: boolean; error?: string }> => {
    if (!fullPhoneNumber) return { success: false, error: 'Phone number not set' };
    if (isSendingOtpRef.current) {
      return { success: false, error: 'Resend already in progress' };
    }
    isSendingOtpRef.current = true;
    try {
      const res = await requestPhoneOtp(fullPhoneNumber, 2, language);
      const session = requireOtpSession(res);
      confirmationResultRef.current = session;
      setConfirmationResult(session);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to resend' };
    } finally {
      isSendingOtpRef.current = false;
    }
  };


  const handleCompleteProfile = async (profileData: UserProfile) => {
    console.log('[App] handleCompleteProfile started for profile:', profileData.name);
    try {
      if (!authenticatedUid) throw new Error('Please verify your phone number before creating a profile.');
      const uid = authenticatedUid;
      console.log('[App] Saving user profile to database with UID:', uid);
      const savedUser = await saveUserProfileToDatabase({
        uid,
        phoneNumber: fullPhoneNumber,
        name: profileData.name,
        avatarDataUrl: profileData.avatarUrl,
        status: profileData.status || "Hey there, I'm using Hala",
      });

      console.log('[App] Profile saved successfully in Firestore:', savedUser);
      setUserProfile({
        id: savedUser.id,
        name: savedUser.name,
        avatarUrl: savedUser.avatar_url,
        phoneNumber: savedUser.phone,
        status: savedUser.status,
        country: selectedCountry,
        createdAt: savedUser.created_at,
        lastSeen: savedUser.last_seen,
        isFlagged: false,
        flaggedReason: '',
      });

      // Navigate to Chat List Screen
      console.log('[App] Navigating to "chats" screen now!');
      setCurrentScreen('chats');
    } catch (err: any) {
      console.error('[App] handleCompleteProfile encountered an error:', err);
      throw err;
    }
  };

  const handleRestartOnboarding = useCallback(async () => {
    isExplicitLogoutRef.current = true;
    try { localStorage.setItem('hala.explicitLogout', 'true'); } catch {}
    _setSessionStatus('loading');
    clearCryptoKeyCache();
    if (authenticatedUid) {
      clearCachedUserProfile(authenticatedUid);
    }
    await logoutUser();
    setUserProfile(null);
    setActiveChat(null);
    setFullPhoneNumber('');
    setAuthenticatedUid('');
    setConfirmationResult(null);
    confirmationResultRef.current = null;
    setCurrentScreen('welcome');
    setTimeout(() => {
      isExplicitLogoutRef.current = false;
    }, 500);
  }, [authenticatedUid]);

  const handleOpenConversation = (chat: ChatModel) => {
    setActiveChat(chat);
    setCurrentScreen('conversation');
  };

  const handleStartCall = async (
    contact: { id: string; name: string; avatarUrl?: string | null; phone?: string },
    type: CallType
  ) => {
    if (isStartingCallRef.current) {
      console.log('[App] Call initiation already in progress. Ignoring duplicate click.');
      return;
    }
    isStartingCallRef.current = true;
    setTimeout(() => {
      isStartingCallRef.current = false;
    }, 2000);

    if (!userProfile) return;
    const currentUserId =
      userProfile.id || `user_${userProfile.phoneNumber.replace(/\D/g, '')}`;

    try {
      const callId = await initiateCall({
        chatId: activeChat?.id,
        callerProfile: userProfile,
        calleeId: contact.id,
        calleeProfile: {
          name: contact.name,
          avatarUrl: contact.avatarUrl,
          phone: contact.phone,
        },
        type,
      });

      handledCallIdsRef.current.add(callId);

      const initiatedCall: CallModel = {
        id: callId,
        chatId: activeChat?.id,
        callerId: currentUserId,
        callerName: userProfile.name,
        callerAvatar: userProfile.avatarUrl,
        callerPhone: userProfile.phoneNumber,
        calleeId: contact.id,
        calleeName: contact.name,
        calleeAvatar: contact.avatarUrl || null,
        calleePhone: contact.phone,
        type,
        status: 'ringing',
        startedAt: new Date().toISOString(),
      };

      setActiveCall(initiatedCall);
    } catch (err) {
      console.error('Failed to initiate call:', err);
    }
  };

  const handleAcceptIncomingCall = async () => {
    if (!incomingCall) return;
    handledCallIdsRef.current.add(incomingCall.id);
    try {
      await answerCall(incomingCall.id);
      setActiveCall({
        ...incomingCall,
        status: 'ongoing',
      });
      setIncomingCall(null);
    } catch (err) {
      console.error('Error accepting incoming call:', err);
    }
  };

  const handleDeclineIncomingCall = async () => {
    if (!incomingCall) return;
    handledCallIdsRef.current.add(incomingCall.id);
    try {
      await updateCallStatus({
        callId: incomingCall.id,
        status: 'declined',
      });
      setIncomingCall(null);
    } catch (err) {
      console.error('Error declining incoming call:', err);
    }
  };

  const [lastEndedCall, setLastEndedCall] = useState<CallModel | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  const handleActiveCallEnded = () => {
    const endedCall = activeCall;
    if (endedCall?.id) {
      handledCallIdsRef.current.add(endedCall.id);
      setLastEndedCall(endedCall);
    }
    
    // Clear primary call states first
    setActiveCall(null);
    setIncomingCall(null);
    
    // Trigger rating modal if there was an actual call
    if (endedCall?.id) {
      setShowRatingModal(true);
    }
  };

  const handleSaveCallRating = async (callId: string, rating: number) => {
    try {
      await saveCallRating(callId, rating);
      setShowRatingModal(false);
      setLastEndedCall(null);
    } catch (error) {
      console.error('Failed to save call rating:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-0 sm:p-4 font-sans text-slate-900 select-none">
      {/* Top Desktop Navigation & Backend Status Bar (Hidden in publish / production mode) */}
      {!isPublishMode && (
        <header className="hidden sm:flex items-center justify-between w-full max-w-md px-4 py-2 bg-slate-800 text-slate-300 rounded-t-2xl text-xs font-medium border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#087F75]"></span>
            <span className="font-semibold text-white">Hala Chat</span>
            <TestVersionBanner language={language} variant="pill" />
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton language={language} variant="header" />
            <button
              type="button"
              onClick={() => setIsMobileFrame(!isMobileFrame)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              {isMobileFrame ? (
                <>
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Full Screen</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile Frame</span>
                </>
              )}
            </button>
          </div>
        </header>
      )}

      {USING_EMULATORS && <p role="status" className="bg-amber-100 text-amber-950 px-4 py-2 text-sm w-full text-center">Local test · No real SMS or production data</p>}
      {/* Keep reCAPTCHA mounted across the phone and OTP screens for resends. */}
      <div id="recaptcha-container" />
      {/* Main Container */}
      <div
        className={`w-full bg-[#071318] flex flex-col relative overflow-hidden transition-all duration-300 ${
          isMobileFrame
            ? `sm:max-w-[410px] sm:h-[780px] ${!isPublishMode ? 'sm:rounded-b-3xl sm:rounded-t-none sm:border-x sm:border-b' : 'sm:rounded-3xl sm:border'} sm:shadow-2xl sm:border-slate-800 min-h-screen h-screen h-[100dvh]`
            : 'w-full min-h-screen h-screen h-[100dvh] sm:rounded-none'
        }`}
      >
        {currentScreen !== 'welcome' && currentScreen !== 'splash' && (
          <div className="shrink-0 z-40">
            <TestVersionBanner language={language} variant="banner" />
            <PWAInstallButton language={language} variant="banner" />
          </div>
        )}
        {sessionStatus !== 'ready' && currentScreen !== 'splash' && (
          <div role={sessionStatus === 'error' ? 'alert' : 'status'} aria-live="polite"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#071318] text-white p-8 text-center">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-teal-500/20 border-t-[#087F75] animate-spin"></div>
              <span className="absolute text-xl font-extrabold text-[#087F75]">هلا</span>
            </div>
            <p className="text-xs text-teal-200/80 tracking-wider uppercase font-semibold">{sessionStatus === 'loading'
              ? (language === 'ar' ? 'جارٍ تحميل حسابك…' : 'Loading your account…')
              : (language === 'ar' ? 'تعذر تحميل الحساب. تحقق من اتصالك وحاول مجدداً.' : 'Could not load your account. Check your connection and retry.')}</p>
            {sessionStatus === 'error' && <button type="button"
              onClick={() => { setSessionStatus('loading'); setSessionRetry(value => value + 1); }}
              className="rounded-xl bg-[#087F75] px-6 py-3 text-white cursor-pointer">
              {language === 'ar' ? 'حاول مجدداً' : 'Retry'}
            </button>}
          </div>
        )}
        {(sessionStatus === 'ready' || currentScreen === 'splash') && (
          <div className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
            <AnimatePresence mode="wait">
          {!splashDone && currentScreen === 'splash' && (
            <SplashScreen
              key="splash"
              language={language}
              onComplete={handleSplashComplete}
            />
          )}

          {currentScreen === 'welcome' && (
            <WelcomeScreen
              key="welcome"
              language={language}
              onLanguageChange={(lang) => setLanguage(lang)}
              onGetStarted={handleGetStarted}
              onOpenTerms={() => setIsTermsOpen(true)}
              isVerifyingSession={isVerifyingBackground}
            />
          )}

          {currentScreen === 'phone' && (
            <PhoneAuthScreen
              key="phone"
              initialCountry={selectedCountry}
              language={language}
              onBack={() => {
                clearRecaptchaVerifier('recaptcha-container');
                setCurrentScreen('welcome');
              }}
              onSendOtp={handleSendOtp}
              isLoading={isLoading}
              onOpenTerms={() => setIsTermsOpen(true)}
              onSessionRestored={(user, profile) => applyRestoredSession(user, profile)}
            />
          )}

          {currentScreen === 'otp' && (
            <OtpVerificationScreen
              key="otp"
              language={language}
              fullPhoneNumber={fullPhoneNumber}
              country={selectedCountry}
              onEditPhoneNumber={() => {
                setConfirmationResult(null);
                clearRecaptchaVerifier('recaptcha-container');
                setCurrentScreen('phone');
              }}
              onVerifyOtpCode={handleVerifyOtpCode}
              onResendOtp={handleResendOtp}
            />
          )}


          {currentScreen === 'profile' && (
            <ProfileSetupScreen
              key="profile"
              language={language}
              phoneNumber={fullPhoneNumber}
              country={selectedCountry}
              onCompleteProfile={handleCompleteProfile}
            />
          )}

          {currentScreen === 'restore_pin' && authenticatedUid && (
            <RestoreChatsScreen
              key="restore_pin"
              uid={authenticatedUid}
              language={language}
              isRestoreOnly={isRestoreRequired}
              isPinActive={isPinRequired}
              onSuccess={(token) => {
                if (token) setSessionToken(token);
                setIsPinRequired(false);
                setIsRestoreRequired(false);
                // Re-trigger session restore to proceed to chats
                void verifyCachedAuthSession(1000).then(res => {
                   if (res.user) applyRestoredSession(res.user, res.profile);
                });
              }}
              onStartFresh={async () => {
                try {
                  setSessionStatus('loading');
                  // Force new key generation and overwrite public_key
                  await ensureUserE2EEKeyPair(authenticatedUid, true);
                  setIsRestoreRequired(false);
                  setIsPinRequired(false);
                  setCurrentScreen('chats');
                } catch (err) {
                  console.error('[App] Start fresh error:', err);
                  setSessionStatus('ready');
                }
              }}
              onLogout={handleRestartOnboarding}
            />
          )}

          {currentScreen === 'chats' && userProfile && (
            <ChatListScreen
              key="chats"
              language={language}
              profile={userProfile}
              onPhotoSave={async (dataUrl) => {
                if (!userProfile.id) throw new Error('Please sign in again.');
                const avatarUrl = await updateProfilePhoto(userProfile.id, dataUrl);
                setUserProfile(current => current ? { ...current, avatarUrl } : current);
              }}
              onLanguageChange={(lang) => setLanguage(lang)}
              onRestartOnboarding={handleRestartOnboarding}
              onOpenConversation={handleOpenConversation}
              onInitiateCall={handleStartCall}
            />
          )}

          {currentScreen === 'conversation' && userProfile && activeChat && (
            <ConversationScreen
              key={`conversation_${activeChat.id}`}
              language={language}
              chat={activeChat}
              currentUserProfile={userProfile}
              onBack={() => setCurrentScreen('chats')}
              onStartCall={handleStartCall}
              onUserProfileUpdated={(updated) => setUserProfile(updated)}
            />
          )}
        </AnimatePresence>
      </div>
    )}

        {/* Global Call Rating Modal */}
        {lastEndedCall && (
          <CallRatingModal
            callId={lastEndedCall.id}
            isOpen={showRatingModal}
            onClose={() => {
              setShowRatingModal(false);
              setLastEndedCall(null);
            }}
            onSave={handleSaveCallRating}
            language={language}
          />
        )}

        {/* Active Full-Screen Voice / Video Call */}
        {activeCall && userProfile && (
          <ActiveCallScreen
            call={activeCall}
            currentUser={userProfile}
            language={language}
            onCallEnded={handleActiveCallEnded}
          />
        )}

        {/* Incoming Call Modal Overlay */}
        {incomingCall && !activeCall && (
          <IncomingCallModal
            call={incomingCall}
            language={language}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        )}

        {/* Global Terms & Privacy Modal */}
        <TermsPrivacyModal
          isOpen={isTermsOpen}
          onClose={() => setIsTermsOpen(false)}
          language={language}
        />
      </div>
    </div>
  );
}
