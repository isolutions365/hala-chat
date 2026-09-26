import React, { useState, useEffect } from 'react';
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
import { GULF_COUNTRIES } from './lib/countries';
import {
  setupRecaptcha,
  requestPhoneOtp,
  checkUserExists,
  saveUserProfileToDatabase,
  setUserPresence,
  onAuthUserChanged,
  logoutUser,
  testFirestoreConnection,
  initiateCall,
  updateCallStatus,
  answerCall,
  subscribeToIncomingCalls,
} from './lib/firebase';
import { IncomingCallModal } from './components/IncomingCallModal';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { Smartphone, Monitor, Database, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [language, setLanguage] = useState<Language>('ar'); // Default to Arabic for Middle East market
  const [selectedCountry, setSelectedCountry] = useState<Country>(GULF_COUNTRIES[0]);
  const [fullPhoneNumber, setFullPhoneNumber] = useState<string>('');
  const [authenticatedUid, setAuthenticatedUid] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDemo, setIsDemo] = useState<boolean>(true);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isMobileFrame, setIsMobileFrame] = useState<boolean>(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeChat, setActiveChat] = useState<ChatModel | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);

  // Calling States
  const [incomingCall, setIncomingCall] = useState<CallModel | null>(null);
  const [activeCall, setActiveCall] = useState<CallModel | null>(null);

  // Test Firestore connection on mount
  useEffect(() => {
    testFirestoreConnection().then((connected) => {
      setIsBackendConnected(connected);
    });

    // Listen to Firebase Auth state
    const unsubscribe = onAuthUserChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setAuthenticatedUid(firebaseUser.uid);
        if (firebaseUser.phoneNumber) {
          setFullPhoneNumber(firebaseUser.phoneNumber);
        }
      }
    });

    return () => unsubscribe();
  }, []);

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

  // Setup reCAPTCHA when entering phone screen
  useEffect(() => {
    if (currentScreen === 'phone') {
      setupRecaptcha('recaptcha-container');
    }
  }, [currentScreen]);

  const handleSendOtp = async (
    phoneNumberWithCode: string,
    country: Country
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setFullPhoneNumber(phoneNumberWithCode);
    setSelectedCountry(country);

    try {
      const res = await requestPhoneOtp(phoneNumberWithCode, (window as any).recaptchaVerifier || null);

      if (res.confirmationResult) {
        setConfirmationResult(res.confirmationResult);
        setIsDemo(false);
        setCurrentScreen('otp');
        return { success: true };
      } else if (res.isDemo) {
        setIsDemo(true);
        setCurrentScreen('otp');
        return { success: true };
      } else {
        return { success: false, error: res.error || 'Failed to send OTP' };
      }
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
      let currentUid = '';
      let verifiedPhone = fullPhoneNumber;

      if (confirmationResult) {
        const userCredential = await confirmationResult.confirm(otpCode);
        const fbUser = userCredential.user;
        currentUid = fbUser.uid;
        verifiedPhone = fbUser.phoneNumber || fullPhoneNumber;
      } else if (otpCode === '123456' || otpCode.length === 6) {
        // Test UID derived from phone for demo simulation
        currentUid = `uid_${verifiedPhone.replace(/\D/g, '') || 'hala_user'}`;
      } else {
        return {
          success: false,
          error: language === 'ar' ? 'رمز التحقق غير صحيح' : 'Invalid verification code',
        };
      }

      setAuthenticatedUid(currentUid);

      // Check database: does user document already exist?
      const existingUserDoc = await checkUserExists(currentUid);

      if (existingUserDoc) {
        // User already exists in database → Skip profile setup, go directly to chats
        setUserProfile({
          id: existingUserDoc.id,
          name: existingUserDoc.name,
          avatarUrl: existingUserDoc.avatar_url,
          phoneNumber: existingUserDoc.phone,
          status: existingUserDoc.status,
          country: selectedCountry,
          createdAt: existingUserDoc.created_at,
          lastSeen: existingUserDoc.last_seen,
          blockedUsers: existingUserDoc.blockedUsers || existingUserDoc.blocked_users || [],
          isFlagged: existingUserDoc.is_flagged || false,
          flaggedReason: existingUserDoc.flagged_reason || '',
        });

        await setUserPresence(currentUid, true);
        setCurrentScreen('chats');
        return { success: true, isExistingUser: true };
      } else {
        // New user → Navigate to Screen 5: Profile Setup
        setCurrentScreen('profile');
        return { success: true, isExistingUser: false };
      }
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
      const res = await requestPhoneOtp(fullPhoneNumber, (window as any).recaptchaVerifier || null);
      if (res.confirmationResult) {
        setConfirmationResult(res.confirmationResult);
        setIsDemo(false);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to resend' };
    }
  };

  const handleCompleteProfile = async (profileData: UserProfile) => {
    console.log('[App] handleCompleteProfile started for profile:', profileData.name);
    try {
      const uid = authenticatedUid || `user_${Date.now()}`;
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
    setCurrentScreen('splash');
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
      {/* Top Desktop Navigation & Backend Status Bar */}
      <header className="hidden sm:flex items-center justify-between w-full max-w-md px-4 py-2 bg-slate-800 text-slate-300 rounded-t-2xl text-xs font-medium border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D85A30]"></span>
          <span className="font-semibold text-white">Hala Chat</span>
          <span className="text-slate-400">| Firebase Connected</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40">
            <Database className="w-3 h-3 text-emerald-400" />
            <span>Firestore</span>
          </div>

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

      {/* Main Container */}
      <div
        className={`w-full bg-slate-50 relative overflow-hidden transition-all duration-300 ${
          isMobileFrame
            ? 'sm:max-w-[410px] sm:h-[780px] sm:rounded-b-3xl sm:rounded-t-none sm:shadow-2xl sm:border-x sm:border-b sm:border-slate-800 h-screen'
            : 'w-full min-h-screen sm:rounded-none'
        }`}
      >
        <AnimatePresence mode="wait">
          {currentScreen === 'splash' && (
            <SplashScreen
              key="splash"
              onComplete={() => setCurrentScreen('welcome')}
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
              isDemo={isDemo}
              onEditPhoneNumber={() => setCurrentScreen('phone')}
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
