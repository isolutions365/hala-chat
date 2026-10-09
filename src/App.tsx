import React, { useState, useEffect, lazy, Suspense } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { confirmPhoneOtp, requireOtpSession } from './lib/phoneAuth';
import { AnimatePresence } from 'motion/react';
import { SplashScreen } from './components/SplashScreen';
import { WelcomeScreen } from './components/WelcomeScreen';
import { PhoneAuthScreen } from './components/PhoneAuthScreen';
import { OtpVerificationScreen } from './components/OtpVerificationScreen';
import { ProfileSetupScreen } from './components/ProfileSetupScreen';
const ChatListScreen = lazy(() => import('./components/ChatListScreen').then(module => ({ default: module.ChatListScreen })));
const ConversationScreen = lazy(() => import('./components/ConversationScreen').then(module => ({ default: module.ConversationScreen })));
import { TermsPrivacyModal } from './components/TermsPrivacyModal';
import { Language, Screen, Country, UserProfile, ChatModel, CallModel, CallType } from './types';
import { ALL_COUNTRIES, GULF_COUNTRIES } from './lib/countries';
import { createSessionRestorer } from './lib/sessionRestore';
import {
  updateProfilePhoto,
  USING_EMULATORS,
  requestPhoneOtp,
  checkUserExists,
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
const ActiveCallScreen = lazy(() => import('./components/ActiveCallScreen').then(module => ({ default: module.ActiveCallScreen })));
import { Smartphone, Monitor } from 'lucide-react';

const isPublishMode =
  import.meta.env.PROD ||
  (typeof window !== 'undefined' &&
    (window.location.hostname.includes('ais-pre') ||
     window.location.hostname.includes('web.app') ||
     window.location.hostname.includes('firebaseapp.com')));

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('hala.interfaceLanguage') === 'en' ? 'en' : 'ar'; }
    catch { return 'ar'; }
  });
  useEffect(() => {
    try { localStorage.setItem('hala.interfaceLanguage', language); } catch { /* Storage may be unavailable in private browsing. */ }
  }, [language]);
  const [selectedCountry, setSelectedCountry] = useState<Country>(GULF_COUNTRIES.find(country => country.code === 'SA')!);
  const [fullPhoneNumber, setFullPhoneNumber] = useState<string>('');
  const [authenticatedUid, setAuthenticatedUid] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeChat, setActiveChat] = useState<ChatModel | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sessionRetry, setSessionRetry] = useState(0);

  // Calling States
  const [incomingCall, setIncomingCall] = useState<CallModel | null>(null);
  const [activeCall, setActiveCall] = useState<CallModel | null>(null);

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
        setCurrentScreen('welcome');
        return;
      }
      const { user, profile } = state;
      const phone = user.phoneNumber || profile?.phone || '';
      const country = ALL_COUNTRIES.find(item => phone.startsWith(item.dialCode))
        || GULF_COUNTRIES.find(item => item.code === 'SA')!;
      setAuthenticatedUid(user.uid);
      setFullPhoneNumber(phone);
      setSelectedCountry(country);
      setActiveChat(null);
      if (profile) {
        setUserProfile({
          id: user.uid, name: profile.name, avatarUrl: profile.avatar_url,
          phoneNumber: phone, status: profile.status, country,
          createdAt: profile.created_at, lastSeen: profile.last_seen,
          blockedUsers: profile.blockedUsers || profile.blocked_users || [],
          privacySettings: profile.privacy_settings, twoFactor: profile.two_factor,
          preferredLanguage: profile.preferred_language,
          autoTranslateEnabled: profile.auto_translate_enabled,
          publicKey: profile.public_key,
          isFlagged: profile.is_flagged || false, flaggedReason: profile.flagged_reason || '',
        });
        setCurrentScreen('chats');
        void setUserPresence(user.uid, true);
      } else {
        setUserProfile(null);
        setCurrentScreen('profile');
      }
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
    setIsLoading(true);
    setConfirmationResult(null);
    setFullPhoneNumber(phoneNumberWithCode);
    setSelectedCountry(country);

    try {
      const res = await requestPhoneOtp(phoneNumberWithCode);
      setConfirmationResult(requireOtpSession(res));
      setCurrentScreen('otp');
      return { success: true };
    } catch (err: any) {
      console.warn('Error sending OTP:', err);
      return { success: false, error: err?.message || 'Error communicating with Firebase' };
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpCode = async (
    otpCode: string
  ): Promise<{ success: boolean; isExistingUser?: boolean; error?: string }> => {
    try {
      await confirmPhoneOtp(confirmationResult, otpCode);
      // The auth observer loads the profile and chooses chats or profile setup.
      return { success: true };
    } catch (err: any) {
      console.warn('Firebase OTP verification failed:', err);
      let errorMsg = err?.message || 'Verification failed';
      if (err?.code === 'auth/invalid-verification-code') {
        errorMsg = language === 'ar' ? 'رمز التحقق غير صحيح' : 'Invalid verification code';
      } else if (err?.code === 'auth/code-expired') {
        errorMsg = language === 'ar' ? 'انتهت صلاحية الرمز، يرجى طلب رمز جديد' : 'Code expired, please request a new one';
      }
      return { success: false, error: errorMsg };
    }
  };

  const handleResendOtp = async (): Promise<{ success: boolean; error?: string }> => {
    if (!fullPhoneNumber) return { success: false, error: 'Phone number not set' };
    try {
      const res = await requestPhoneOtp(fullPhoneNumber);
      setConfirmationResult(requireOtpSession(res));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to resend' };
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

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-0 sm:p-4 font-sans text-slate-900 select-none">
      {/* Top Desktop Navigation & Backend Status Bar (Hidden in publish / production mode) */}
      {!isPublishMode && (
        <header className="hidden sm:flex items-center justify-between w-full max-w-md px-4 py-2 bg-slate-800 text-slate-300 rounded-t-2xl text-xs font-medium border-b border-slate-700/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#087F75]"></span>
            <span className="font-semibold text-white">Hala Chat</span>
            <span className="text-slate-400">| Your space. Your way.</span>
          </div>

          <div className="flex items-center gap-2">
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
        {sessionStatus !== 'ready' && (
          <div role={sessionStatus === 'error' ? 'alert' : 'status'} aria-live="polite"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
            <span className="text-4xl font-bold text-[#087F75]">هلا</span>
            <p>{sessionStatus === 'loading'
              ? (language === 'ar' ? 'جارٍ تحميل حسابك…' : 'Loading your account…')
              : (language === 'ar' ? 'تعذر تحميل الحساب. تحقق من اتصالك وحاول مجدداً.' : 'Could not load your account. Check your connection and retry.')}</p>
            {sessionStatus === 'error' && <button type="button"
              onClick={() => { setSessionStatus('loading'); setSessionRetry(value => value + 1); }}
              className="rounded-xl bg-[#087F75] px-6 py-3 text-white">
              {language === 'ar' ? 'حاول مجدداً' : 'Retry'}
            </button>}
          </div>
        )}
        <Suspense fallback={<div role="status" className="flex h-full items-center justify-center p-8 text-[#087F75]">{language === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</div>}>
        {sessionStatus === 'ready' && <AnimatePresence mode="wait">
          {currentScreen === 'splash' && (
            <SplashScreen
              key="splash"
              onComplete={() => setCurrentScreen(userProfile ? 'chats' : 'welcome')}
            />
          )}

          {currentScreen === 'welcome' && (
            <WelcomeScreen
              key="welcome"
              language={language}
              onLanguageChange={(lang) => setLanguage(lang)}
              onGetStarted={() => setCurrentScreen('phone')}
              onOpenTerms={() => setIsTermsOpen(true)}
            />
          )}

          {currentScreen === 'phone' && (
            <PhoneAuthScreen
              key="phone"
              initialCountry={selectedCountry}
              language={language}
              onBack={() => setCurrentScreen('welcome')}
              onSendOtp={handleSendOtp}
              isLoading={isLoading}
              onOpenTerms={() => setIsTermsOpen(true)}
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
            onCallEnded={() => setActiveCall(null)}
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

        </Suspense>

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
