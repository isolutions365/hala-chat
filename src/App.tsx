import React, { useState, useEffect, useRef } from 'react';
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
import { TermsPrivacyModal } from './components/TermsPrivacyModal';
import { Language, Screen, Country, UserProfile, ChatModel, CallModel, CallType } from './types';
import { ALL_COUNTRIES, GULF_COUNTRIES } from './lib/countries';
import { createSessionRestorer } from './lib/sessionRestore';
import {
  updateProfilePhoto,
  USING_EMULATORS,
  requestPhoneOtp,
  clearRecaptchaVerifier,
  checkUserExists,
  verifyCachedAuthSession,
  clearCachedUserProfile,
  saveUserProfileToDatabase,
  setUserPresence,
  onAuthUserChanged,
  logoutUser,
  initiateCall,
  updateCallStatus,
  answerCall,
  subscribeToIncomingCalls,
} from './lib/firebase';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ActiveCallScreen } from './components/ActiveCallScreen';
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
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('hala.interfaceLanguage') === 'en' ? 'en' : 'ar'; }
    catch { return 'ar'; }
  });
  useEffect(() => {
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
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sessionRetry, setSessionRetry] = useState(0);

  // Calling States
  const [incomingCall, setIncomingCall] = useState<CallModel | null>(null);
  const [activeCall, setActiveCall] = useState<CallModel | null>(null);
  const handledCallIdsRef = useRef<Set<string>>(new Set());
  const isStartingCallRef = useRef<boolean>(false);
  const [isVerifyingBackground, setIsVerifyingBackground] = useState<boolean>(false);

  const applyRestoredSession = (user: { uid: string; phoneNumber?: string | null }, profile: any | null) => {
    const phone = user.phoneNumber || profile?.phone || '';
    const country = ALL_COUNTRIES.find(item => phone.startsWith(item.dialCode))
      || GULF_COUNTRIES.find(item => item.code === 'SA')!;
    setAuthenticatedUid(user.uid);
    setFullPhoneNumber(phone);
    setSelectedCountry(country);
    setActiveChat(null);
    setSessionStatus('ready');
    if (profile) {
      setUserProfile({
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
      });
      setCurrentScreen('chats');
      void setUserPresence(user.uid, true);
    } else {
      setUserProfile(null);
      setCurrentScreen('profile');
    }
  };

  const handleGetStarted = async () => {
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
        applyRestoredSession(cached.user, cached.profile);
        return;
      }
    } catch (err) {
      console.warn('[App] Proactive background verification before phone auth:', err);
    } finally {
      setIsVerifyingBackground(false);
    }
    // Only proceed to PhoneAuthScreen if no cached session exists
    setCurrentScreen('phone');
  };

  // Firebase Auth owns session routing, including a persisted login after reload.
  useEffect(() => {
    const restorer = createSessionRestorer(checkUserExists, state => {
      if (state.status === 'loading' || state.status === 'error') {
        setSessionStatus(state.status);
        return;
      }
      setSessionStatus('ready');
      if (state.status === 'signed-out') {
        setAuthenticatedUid('');
        setUserProfile(null);
        setActiveChat(null);
        setActiveCall(null);
        setIncomingCall(null);
        setFullPhoneNumber('');
        setConfirmationResult(null);
        confirmationResultRef.current = null;
        setCurrentScreen(curr => (curr === 'splash' ? curr : 'welcome'));
        return;
      }
      let isExplicitLogout = false;
      try { isExplicitLogout = localStorage.getItem('hala.explicitLogout') === 'true'; } catch {}
      if (isExplicitLogout) {
        return;
      }
      applyRestoredSession(state.user, state.profile);
    });
    const unsubscribe = onAuthUserChanged(user => { void restorer.restore(user); });
    return () => { restorer.dispose(); unsubscribe(); };
  }, [sessionRetry]);

  // Listen to incoming calls for the authenticated user
  useEffect(() => {
    if (!userProfile) return;
    const currentUserId =
      userProfile.id || `user_${userProfile.phoneNumber.replace(/\D/g, '')}`;

    const unsub = subscribeToIncomingCalls(currentUserId, (incoming) => {
      if (incoming && !activeCall) {
        if (handledCallIdsRef.current.has(incoming.id)) {
          console.log(`[App] Incoming call ${incoming.id} already handled or ended. Ignoring.`);
          return;
        }
        setIncomingCall(incoming);
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

  const handleRestartOnboarding = async () => {
    if (authenticatedUid) {
      clearCachedUserProfile(authenticatedUid);
    }
    await logoutUser();
    setUserProfile(null);
    setActiveChat(null);
    setFullPhoneNumber('');
    setAuthenticatedUid('');
    setConfirmationResult(null);
    setCurrentScreen('welcome');
  };

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

  const handleActiveCallEnded = () => {
    if (activeCall?.id) {
      handledCallIdsRef.current.add(activeCall.id);
    }
    setActiveCall(null);
    setIncomingCall(null);
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
        className={`w-full ${currentScreen === 'welcome' ? 'bg-[#071318]' : 'bg-slate-50'} relative overflow-hidden transition-all duration-300 ${
          isMobileFrame
            ? `sm:max-w-[410px] sm:h-[780px] ${!isPublishMode ? 'sm:rounded-b-3xl sm:rounded-t-none sm:border-x sm:border-b' : 'sm:rounded-3xl sm:border'} sm:shadow-2xl sm:border-slate-800 h-screen`
            : 'w-full h-screen sm:rounded-none'
        }`}
      >
        {currentScreen !== 'welcome' && currentScreen !== 'splash' && (
          <>
            <TestVersionBanner language={language} variant="banner" />
            <PWAInstallButton language={language} variant="banner" />
          </>
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
        {(sessionStatus === 'ready' || currentScreen === 'splash') && <AnimatePresence mode="wait">
          {currentScreen === 'splash' && (
            <SplashScreen
              key="splash"
              onComplete={async () => {
                if (userProfile) {
                  setCurrentScreen('chats');
                  return;
                }
                const cached = await verifyCachedAuthSession(1800);
                if (cached.isAuthenticated && cached.user) {
                  applyRestoredSession(cached.user, cached.profile);
                } else {
                  setCurrentScreen('welcome');
                }
              }}
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
        </AnimatePresence>}

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
