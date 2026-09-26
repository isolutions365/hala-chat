import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  QrCode,
  ScanLine,
  Share2,
  Download,
  Copy,
  Check,
  Camera,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Phone,
  Video,
  UserPlus,
  Flashlight,
  FlashlightOff,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { Language, UserProfile, ContactItem, CallType } from '../types';
import {
  generateContactQrDataUrl,
  parseContactQrPayload,
  scanQrFromVideoFrame,
  scanQrFromImageFile,
} from '../lib/qrCode';
import { saveUserContact, fetchUserByIdOrPhone } from '../lib/firebase';

interface ProfileQRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  profile: UserProfile;
  initialTab?: 'my_code' | 'scan';
  onStartChat?: (contact: ContactItem) => void;
  onInitiateCall?: (
    contact: { id: string; name: string; avatarUrl?: string | null; phone?: string },
    type: CallType
  ) => void;
}

export const ProfileQRCodeModal: React.FC<ProfileQRCodeModalProps> = ({
  isOpen,
  onClose,
  language,
  profile,
  initialTab = 'my_code',
  onStartChat,
  onInitiateCall,
}) => {
  const isRtl = language === 'ar';
  const currentUserId = profile.id || `user_${profile.phoneNumber.replace(/\D/g, '')}`;

  const [activeTab, setActiveTab] = useState<'my_code' | 'scan'>(initialTab);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Scanned contact state
  const [scannedContact, setScannedContact] = useState<ContactItem | null>(null);
  const [isSavedToContacts, setIsSavedToContacts] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Reset tab and states on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setScannedContact(null);
      setIsSavedToContacts(false);
      setCameraError(null);
    } else {
      stopCamera();
    }
  }, [isOpen, initialTab]);

  // Generate QR code when in "my_code" tab
  useEffect(() => {
    if (isOpen && activeTab === 'my_code') {
      setIsGeneratingQr(true);
      generateContactQrDataUrl(profile, { size: 600, darkColor: '#0f172a' })
        .then((url) => {
          setQrDataUrl(url);
        })
        .catch((err) => {
          console.error('Failed to generate QR code:', err);
        })
        .finally(() => {
          setIsGeneratingQr(false);
        });
    }
  }, [isOpen, activeTab, profile]);

  // Start camera when entering scan tab
  useEffect(() => {
    if (isOpen && activeTab === 'scan' && !scannedContact) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, scannedContact, facingMode]);

  const startCamera = async () => {
    stopCamera();
    setCameraError(null);
    setIsCameraActive(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          isRtl
            ? 'الكاميرا غير مدعومة على هذا المتصفح'
            : 'Camera is not supported on this browser'
        );
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsCameraActive(true);

        // Check torch support
        try {
          const track = stream.getVideoTracks()[0];
          const capabilities: any = track.getCapabilities?.();
          if (capabilities && 'torch' in capabilities) {
            setHasTorch(true);
          } else {
            setHasTorch(false);
          }
        } catch {
          setHasTorch(false);
        }

        // Start scanning loop
        scanLoop();
      }
    } catch (err: any) {
      console.warn('Camera access failed:', err);
      setIsCameraActive(false);
      const msg =
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? isRtl
            ? 'يرجى السماح بالوصول إلى الكاميرا لمسح الرمز'
            : 'Please allow camera access to scan QR codes'
          : isRtl
          ? 'تعذر تشغيل الكاميرا. يمكنك رفع صورة الرمز بدلاً من ذلك'
          : 'Could not access camera. You can upload a QR image instead';
      setCameraError(msg);
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Failed to toggle torch:', err);
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const scanLoop = () => {
    if (!videoRef.current || !canvasRef.current) return;

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const result = scanQrFromVideoFrame(videoRef.current, canvasRef.current);
      if (result && result.data) {
        handleQrDecoded(result.data);
        return; // stop loop
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanLoop);
  };

  const handleQrDecoded = async (rawData: string) => {
    // Vibrate haptic feedback
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 40, 50]);
      }
    } catch {}

    stopCamera();

    const parsed = parseContactQrPayload(rawData);
    if (!parsed) {
      showToast(isRtl ? 'رمز QR غير صالح أو غير معروف' : 'Invalid or unrecognized QR code');
      // Restart camera after short pause
      setTimeout(() => {
        if (activeTab === 'scan' && isOpen) {
          startCamera();
        }
      }, 1500);
      return;
    }

    // Try fetching updated details from Firestore if user is in database
    let resolvedContact: ContactItem = {
      id: parsed.id || `user_${parsed.phone?.replace(/\D/g, '') || Date.now()}`,
      name: parsed.name || 'Hala Contact',
      phone: parsed.phone || '',
      avatar_url: parsed.avatar_url || null,
      status: parsed.status || "Hey there, I'm using Hala",
    };

    try {
      const liveUser = await fetchUserByIdOrPhone(resolvedContact.id || resolvedContact.phone);
      if (liveUser) {
        resolvedContact = {
          ...resolvedContact,
          name: liveUser.name || resolvedContact.name,
          phone: liveUser.phone || resolvedContact.phone,
          avatar_url: liveUser.avatar_url || resolvedContact.avatar_url,
          status: liveUser.status || resolvedContact.status,
          public_key: liveUser.public_key,
        };
      }
    } catch (err) {
      console.warn('Error fetching live user on scan:', err);
    }

    setScannedContact(resolvedContact);
    setIsSavedToContacts(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      const decodedText = await scanQrFromImageFile(file);
      if (decodedText) {
        await handleQrDecoded(decodedText);
      } else {
        showToast(
          isRtl
            ? 'لم يتم العثور على رمز QR في الصورة المحددة'
            : 'No QR code found in selected image'
        );
      }
    } catch (err) {
      console.warn('Error reading QR from image:', err);
      showToast(
        isRtl
          ? 'تعذر قراءة الصورة. يرجى تجربة صورة أخرى'
          : 'Could not read image. Please try another one'
      );
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveContact = async () => {
    if (!scannedContact) return;
    setIsSavingContact(true);
    try {
      await saveUserContact(currentUserId, scannedContact);
      setIsSavedToContacts(true);
      showToast(
        isRtl
          ? `تمت إضافة ${scannedContact.name} إلى جهات اتصالك بنجاح!`
          : `Saved ${scannedContact.name} to your contacts!`
      );
    } catch (err) {
      console.error('Failed to save contact:', err);
      showToast(
        isRtl ? 'حدث خطأ أثناء حفظ جهة الاتصال' : 'Failed to save contact. Please try again'
      );
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleStartChatFromScan = () => {
    if (!scannedContact) return;
    // Save contact in background if not already
    saveUserContact(currentUserId, scannedContact).catch(() => {});
    onClose();
    if (onStartChat) {
      onStartChat(scannedContact);
    }
  };

  const handleCallFromScan = (type: CallType) => {
    if (!scannedContact) return;
    saveUserContact(currentUserId, scannedContact).catch(() => {});
    onClose();
    if (onInitiateCall) {
      onInitiateCall(
        {
          id: scannedContact.id,
          name: scannedContact.name,
          avatarUrl: scannedContact.avatar_url,
          phone: scannedContact.phone,
        },
        type
      );
    }
  };

  const handleCopyLink = () => {
    const rawPayload = `hala://contact?id=${encodeURIComponent(
      currentUserId
    )}&name=${encodeURIComponent(profile.name)}&phone=${encodeURIComponent(
      profile.phoneNumber
    )}`;
    navigator.clipboard.writeText(rawPayload);
    setCopied(true);
    showToast(isRtl ? 'تم نسخ رابط جهة الاتصال' : 'Contact link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const shareData = {
      title: `${profile.name} on Hala Messenger`,
      text: isRtl
        ? `تواصل معي على تطبيق هلا: ${profile.name} (${profile.phoneNumber})`
        : `Connect with me on Hala Messenger: ${profile.name} (${profile.phoneNumber})`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;

    // Create a styled canvas card to download as clean image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 760;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 760);
    bgGrad.addColorStop(0, '#ffffff');
    bgGrad.addColorStop(1, '#f8fafc');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 640, 760);

    // Top Header Banner
    ctx.fillStyle = '#D85A30';
    ctx.beginPath();
    ctx.roundRect(24, 24, 592, 100, 20);
    ctx.fill();

    // App Branding in Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HALA MESSENGER', 320, 70);

    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(
      isRtl ? 'امسح الرمز لإضافتي على تطبيق هلا' : 'Scan to connect on Hala',
      320,
      98
    );

    // Load QR Image
    const qrImg = new Image();
    qrImg.onload = () => {
      // Draw white card for QR
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      ctx.beginPath();
      ctx.roundRect(70, 145, 500, 500, 24);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Draw QR
      ctx.drawImage(qrImg, 95, 170, 450, 450);

      // Contact Info at bottom
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(profile.name, 320, 680);

      ctx.fillStyle = '#64748b';
      ctx.font = '16px monospace';
      ctx.fillText(profile.phoneNumber, 320, 712);

      // Trigger download
      const link = document.createElement('a');
      link.download = `hala-qr-${profile.name.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(isRtl ? 'تم حفظ بطاقة رمز QR' : 'QR card downloaded');
    };
    qrImg.src = qrDataUrl;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Top Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#D85A30]/10 text-[#D85A30] flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {isRtl ? 'رمز QR الشخصي' : 'Contact QR Code'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isRtl
                    ? 'شارك أو امسح الرمز للتواصل السريع'
                    : 'Share or scan to connect instantly'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="p-3 bg-slate-50 border-b border-slate-100 shrink-0">
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setScannedContact(null);
                  setActiveTab('my_code');
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'my_code'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-[#D85A30]" />
                <span>{isRtl ? 'رمزي الشخصي' : 'My Code'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScannedContact(null);
                  setActiveTab('scan');
                }}
                className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'scan'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ScanLine className="w-3.5 h-3.5 text-[#D85A30]" />
                <span>{isRtl ? 'مسح رمز' : 'Scan Code'}</span>
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 overflow-y-auto flex-1 flex flex-col items-center justify-start min-h-[380px]">
            {/* TAB 1: MY QR CODE */}
            {activeTab === 'my_code' && (
              <div className="w-full flex flex-col items-center space-y-5">
                {/* QR Card Presentation */}
                <div className="w-full max-w-xs bg-linear-to-b from-slate-50 to-orange-50/30 p-5 rounded-3xl border border-slate-200/80 shadow-md flex flex-col items-center text-center relative overflow-hidden">
                  {/* Subtle corner badge */}
                  <div className="absolute -top-10 -right-10 w-24 h-24 bg-[#D85A30]/10 rounded-full blur-xl pointer-events-none" />

                  {/* User Profile Header */}
                  <div className="flex flex-col items-center mb-3">
                    <div className="w-16 h-16 rounded-full bg-[#D85A30] text-white flex items-center justify-center overflow-hidden font-bold text-xl shadow-md ring-4 ring-white mb-2">
                      {profile.avatarUrl ? (
                        <img
                          src={profile.avatarUrl}
                          alt={profile.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{profile.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-slate-900 text-base">{profile.name}</h4>
                      <ShieldCheck className="w-4 h-4 text-[#D85A30]" />
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                      {profile.country?.flag} {profile.phoneNumber}
                    </p>
                  </div>

                  {/* QR Image Container */}
                  <div className="w-56 h-56 bg-white p-3 rounded-2xl shadow-inner border border-slate-200/80 flex items-center justify-center relative">
                    {isGeneratingQr ? (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-8 h-8 border-2 border-[#D85A30] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[11px]">
                          {isRtl ? 'جاري إنشاء الرمز...' : 'Generating QR...'}
                        </span>
                      </div>
                    ) : qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="My Contact QR Code"
                        className="w-full h-full object-contain rounded-lg"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">
                        {isRtl ? 'فشل إنشاء الرمز' : 'Failed to generate QR'}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-3 max-w-[220px]">
                    {isRtl
                      ? 'رمزك الشخصي خاص بك. يمكن لأي شخص مسحه لإضافتك مباشرة.'
                      : 'Your QR code is private. Anyone who scans it can add you to their Hala contacts.'}
                  </p>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-4 h-4 text-[#D85A30]" />
                    <span className="text-[11px] font-bold">
                      {isRtl ? 'مشاركة' : 'Share'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span className="text-[11px] font-bold">
                      {isRtl ? 'حفظ كصورة' : 'Save Image'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-sky-600" />
                    )}
                    <span className="text-[11px] font-bold">
                      {copied
                        ? isRtl
                          ? 'تم النسخ'
                          : 'Copied'
                        : isRtl
                        ? 'نسخ الرابط'
                        : 'Copy Link'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: SCAN QR CODE */}
            {activeTab === 'scan' && (
              <div className="w-full flex flex-col items-center space-y-4">
                {/* CASE A: A Contact has been scanned and resolved */}
                {scannedContact ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-sm flex flex-col items-center space-y-4"
                  >
                    {/* Success Tag */}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{isRtl ? 'تم مسح جهة الاتصال بنجاح' : 'Contact QR Recognized'}</span>
                    </div>

                    {/* Scanned Contact Card */}
                    <div className="w-full bg-slate-50 border border-slate-200/80 rounded-3xl p-5 flex flex-col items-center text-center shadow-xs">
                      <div className="w-20 h-20 rounded-full bg-[#D85A30] text-white flex items-center justify-center overflow-hidden font-bold text-2xl shadow-md mb-3 ring-4 ring-[#D85A30]/10">
                        {scannedContact.avatar_url ? (
                          <img
                            src={scannedContact.avatar_url}
                            alt={scannedContact.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{scannedContact.name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      <h4 className="text-lg font-bold text-slate-900">{scannedContact.name}</h4>
                      {scannedContact.phone && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                          {scannedContact.phone}
                        </p>
                      )}

                      <p className="text-xs text-slate-600 bg-white px-3.5 py-1.5 rounded-full border border-slate-200 mt-2.5 max-w-[240px] truncate">
                        "{scannedContact.status || "Hey there, I'm using Hala"}"
                      </p>
                    </div>

                    {/* Actions for Scanned Contact */}
                    <div className="w-full space-y-2">
                      {/* Primary Chat Button */}
                      <button
                        type="button"
                        onClick={handleStartChatFromScan}
                        className="w-full py-3 bg-[#D85A30] hover:bg-[#c24c25] text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>{isRtl ? 'بدء المحادثة الآن' : 'Start Messaging'}</span>
                      </button>

                      {/* Calls row */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCallFromScan('voice')}
                          className="py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{isRtl ? 'مكالمة صوتية' : 'Voice Call'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCallFromScan('video')}
                          className="py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{isRtl ? 'مكالمة فيديو' : 'Video Call'}</span>
                        </button>
                      </div>

                      {/* Save Contact / Saved Status */}
                      <button
                        type="button"
                        onClick={handleSaveContact}
                        disabled={isSavedToContacts || isSavingContact}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          isSavedToContacts
                            ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-default'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        {isSavedToContacts ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>
                              {isRtl ? 'تم الحفظ في جهات الاتصال' : 'Saved to Contacts'}
                            </span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4 text-[#D85A30]" />
                            <span>
                              {isSavingContact
                                ? isRtl
                                  ? 'جاري الحفظ...'
                                  : 'Saving...'
                                : isRtl
                                ? 'حفظ في جهات الاتصال'
                                : 'Save to Contacts'}
                            </span>
                          </>
                        )}
                      </button>

                      {/* Scan Another Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setScannedContact(null);
                          startCamera();
                        }}
                        className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer pt-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{isRtl ? 'مسح رمز آخر' : 'Scan another code'}</span>
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  /* CASE B: Active Camera Scanner Viewport */
                  <div className="w-full max-w-xs flex flex-col items-center space-y-4">
                    {/* Viewport Frame */}
                    <div className="relative w-64 h-64 bg-black rounded-3xl overflow-hidden shadow-xl border-2 border-slate-800 flex items-center justify-center">
                      {/* Video Stream Element */}
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        autoPlay
                      />

                      {/* Hidden canvas for decoding frames */}
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Overlay Viewfinder Graphics */}
                      {isCameraActive && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          {/* Dark vignette outer */}
                          <div className="absolute inset-0 bg-black/20" />

                          {/* Scanner Framing Box */}
                          <div className="relative w-48 h-48 border-2 border-dashed border-white/60 rounded-2xl flex items-center justify-center">
                            {/* Glowing Corners */}
                            <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-[#D85A30] rounded-tl-lg" />
                            <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-[#D85A30] rounded-tr-lg" />
                            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-[#D85A30] rounded-bl-lg" />
                            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-[#D85A30] rounded-br-lg" />

                            {/* Animated Laser Scanning Line */}
                            <motion.div
                              animate={{ y: [-80, 80, -80] }}
                              transition={{
                                repeat: Infinity,
                                duration: 2.2,
                                ease: 'easeInOut',
                              }}
                              className="w-full h-0.5 bg-linear-to-r from-transparent via-[#D85A30] to-transparent shadow-[0_0_12px_#D85A30]"
                            />
                          </div>
                        </div>
                      )}

                      {/* Camera Loading or Error State */}
                      {!isCameraActive && !cameraError && (
                        <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white gap-2 p-4 text-center">
                          <div className="w-8 h-8 border-2 border-[#D85A30] border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-slate-300">
                            {isRtl ? 'جاري فتح الكاميرا...' : 'Starting camera...'}
                          </span>
                        </div>
                      )}

                      {cameraError && (
                        <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 p-5 text-center">
                          <AlertCircle className="w-8 h-8 text-amber-400 mb-1" />
                          <p className="text-xs text-slate-200">{cameraError}</p>
                          <button
                            type="button"
                            onClick={startCamera}
                            className="mt-2 px-3 py-1.5 bg-[#D85A30] text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            {isRtl ? 'إعادة المحاولة' : 'Try Again'}
                          </button>
                        </div>
                      )}

                      {/* Torch & Camera Switch Floating Controls */}
                      {isCameraActive && (
                        <div className="absolute top-3 right-3 flex items-center gap-2">
                          {hasTorch && (
                            <button
                              type="button"
                              onClick={toggleTorch}
                              className={`p-2 rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                                isTorchOn
                                  ? 'bg-amber-400 text-slate-900'
                                  : 'bg-black/40 text-white hover:bg-black/60'
                              }`}
                            >
                              {isTorchOn ? (
                                <Flashlight className="w-4 h-4" />
                              ) : (
                                <FlashlightOff className="w-4 h-4" />
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={toggleFacingMode}
                            className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-md transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 text-center max-w-[240px]">
                      {isRtl
                        ? 'وجّه الكاميرا نحو رمز QR لجهة الاتصال لمسحه تلقائياً'
                        : 'Align the camera over a contact QR code to scan automatically'}
                    </p>

                    {/* Or Scan from Image Gallery */}
                    <div className="w-full pt-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingFile}
                        className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-200"
                      >
                        {isProcessingFile ? (
                          <div className="w-4 h-4 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-[#D85A30]" />
                        )}
                        <span>
                          {isProcessingFile
                            ? isRtl
                              ? 'جاري فحص الصورة...'
                              : 'Analyzing image...'
                            : isRtl
                            ? 'مسح من معرض الصور'
                            : 'Upload from Photos / Gallery'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toast Notification */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none text-center whitespace-nowrap"
              >
                {toastMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
