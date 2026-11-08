import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Image as ImageIcon, Camera, Type, Edit3, Send, Trash2, Check, RotateCcw } from 'lucide-react';
import { Language, UserProfile, TextOverlayData } from '../types';
import { uploadChatMedia } from '../lib/media';
import { compressImage } from '../lib/imageCompression';
import { createStory } from '../lib/firebase';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onStoryCreated?: () => void;
}

const COLOR_PALETTE = [
  '#FFFFFF',
  '#087F75', // Coral
  '#FACC15', // Yellow
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#A855F7', // Purple
  '#EC4899', // Pink
  '#0F172A', // Slate Dark
];

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
  onStoryCreated,
}) => {
  const isRtl = language === 'ar';

  const [selectedFile, setSelectedFile] = useState<File | Blob | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [isPosting, setIsPosting] = useState(false);

  // Text Overlay State
  const [showTextInput, setShowTextInput] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');

  // Drawing Canvas State
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [penColor, setPenColor] = useState('#087F75');
  const [penSize, setPenSize] = useState(4);
  const [hasDrawn, setHasDrawn] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // Reset modal state
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setMediaPreviewUrl(null);
      setMediaType('image');
      setIsPosting(false);
      setShowTextInput(false);
      setOverlayText('');
      setTextColor('#FFFFFF');
      setIsDrawingMode(false);
      setPenColor('#087F75');
      setHasDrawn(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const isVid = file.type.startsWith('video');
    setMediaType(isVid ? 'video' : 'image');

    const url = URL.createObjectURL(file);
    setMediaPreviewUrl(url);
  };

  // Drawing Canvas Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handlePostStory = async () => {
    if (!selectedFile && !mediaPreviewUrl) return;
    setIsPosting(true);

    try {
      let finalMediaUrl = mediaPreviewUrl || '';

      // Upload file to Firebase Storage if we have a raw file
      if (selectedFile) {
        let fileToUpload: File | Blob = selectedFile;
        if (mediaType === 'image') {
          try {
            const compressed = await compressImage(selectedFile, 1440, 1440, 0.82);
            fileToUpload = compressed.blob;
          } catch (compressErr) {
            console.warn('Story image compression fallback to original:', compressErr);
          }
        }
        const uploadRes = await uploadChatMedia({
          chatId: `story_${currentUserId}`,
          messageId: `story_${Date.now()}`,
          fileOrBlob: fileToUpload,
        });
        if (uploadRes.downloadUrl) {
          finalMediaUrl = uploadRes.downloadUrl;
        }
      }

      // Export drawing canvas as data URL if drawn (max 200,000 chars for Firestore rule)
      let drawingDataUrl: string | null = null;
      if (hasDrawn && canvasRef.current) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        if (dataUrl.length <= 200000) {
          drawingDataUrl = dataUrl;
        } else {
          console.warn('Drawing overlay exceeds Firestore document limit, skipping drawing');
        }
      }

      // Text Overlay Data
      let textOverlayObj: TextOverlayData | null = null;
      if (overlayText.trim()) {
        textOverlayObj = {
          text: overlayText.trim(),
          color: textColor,
        };
      }

      await createStory({
        userId: currentUserId,
        userName: currentUserProfile.name,
        userAvatar: currentUserProfile.avatarUrl,
        userPhone: currentUserProfile.phoneNumber,
        mediaUrl: finalMediaUrl,
        mediaType,
        textOverlay: textOverlayObj,
        drawingOverlay: drawingDataUrl,
      });

      onStoryCreated?.();
      onClose();
    } catch (err) {
      console.error('Failed to post story:', err);
      alert(isRtl ? 'فشل نشر القصة، يرجى المحاولة مرة أخرى' : 'Failed to post story, please try again');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col justify-between overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Top Action Bar */}
        <div className="p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/70 to-transparent">
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white rounded-full bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>

          {mediaPreviewUrl && (
            <div className="flex items-center gap-3">
              {/* Text Toggle */}
              <button
                type="button"
                onClick={() => {
                  setShowTextInput((prev) => !prev);
                  if (isDrawingMode) setIsDrawingMode(false);
                }}
                className={`p-2.5 rounded-full transition-all cursor-pointer ${
                  showTextInput ? 'bg-[#087F75] text-white shadow-md' : 'bg-black/40 text-white/80 hover:text-white'
                }`}
                title={isRtl ? 'إضافة نص' : 'Add Text'}
              >
                <Type className="w-5 h-5" />
              </button>

              {/* Drawing Toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsDrawingMode((prev) => !prev);
                  if (showTextInput) setShowTextInput(false);
                }}
                className={`p-2.5 rounded-full transition-all cursor-pointer ${
                  isDrawingMode ? 'bg-[#087F75] text-white shadow-md' : 'bg-black/40 text-white/80 hover:text-white'
                }`}
                title={isRtl ? 'الرسم' : 'Draw'}
              >
                <Edit3 className="w-5 h-5" />
              </button>

              {/* Clear Drawing */}
              {hasDrawn && (
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors cursor-pointer"
                  title={isRtl ? 'مسح الرسم' : 'Clear Drawing'}
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
          {!mediaPreviewUrl ? (
            /* File Picker Trigger State */
            <div className="flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/20 rounded-3xl max-w-sm w-full bg-white/5 backdrop-blur-xs">
              <div className="w-20 h-20 rounded-full bg-[#087F75]/20 text-[#087F75] flex items-center justify-center mb-4">
                <Camera className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">
                {isRtl ? 'إضافة حالة جديدة' : 'Add New Status'}
              </h3>
              <p className="text-xs text-white/60 mb-6 max-w-xs">
                {isRtl
                  ? 'شارك صورة أو مقطع فيديو ليراها أصدقاؤك لمدة 24 ساعة'
                  : 'Share a photo or video visible to your contacts for 24 hours'}
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#087F75] hover:bg-[#06685F] text-white font-bold text-sm shadow-lg shadow-[#087F75]/30 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ImageIcon className="w-5 h-5" />
                <span>{isRtl ? 'اختر صورة أو فيديو' : 'Choose Photo or Video'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            /* Media Preview & Canvas Canvas Layer */
            <div className="relative w-full max-w-sm aspect-[9/16] max-h-[70vh] rounded-3xl overflow-hidden bg-black shadow-2xl flex items-center justify-center border border-white/10">
              {mediaType === 'image' ? (
                <img
                  src={mediaPreviewUrl || undefined}
                  alt="Story preview"
                  className="w-full h-full object-cover select-none"
                />
              ) : (
                <video
                  src={mediaPreviewUrl || undefined}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
              )}

              {/* Drawing Canvas Overlay */}
              <canvas
                ref={canvasRef}
                width={360}
                height={640}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={`absolute inset-0 w-full h-full touch-none ${
                  isDrawingMode ? 'cursor-crosshair z-20' : 'pointer-events-none z-10'
                }`}
              />

              {/* Draggable/Overlay Text Display */}
              {overlayText && (
                <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-15">
                  <div
                    className="px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-xs text-center font-bold text-xl drop-shadow-md break-words max-w-full"
                    style={{ color: textColor }}
                  >
                    {overlayText}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawing & Color Controls (when drawing mode is active) */}
        {isDrawingMode && (
          <div className="p-4 bg-black/80 backdrop-blur-md flex items-center justify-center gap-3 z-30 border-t border-white/10">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPenColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                  penColor === c ? 'scale-125 border-white ring-2 ring-white/50' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        {/* Text Input Drawer (when text mode is active) */}
        {showTextInput && (
          <div className="p-4 bg-slate-900/90 backdrop-blur-md border-t border-white/10 space-y-3 z-30">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={overlayText}
                onChange={(e) => setOverlayText(e.target.value)}
                placeholder={isRtl ? 'اكتب نصاً على القصة...' : 'Type text overlay...'}
                className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-2.5 text-white placeholder-white/40 text-sm focus:outline-none focus:border-[#087F75]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowTextInput(false)}
                className="p-2.5 rounded-2xl bg-[#087F75] text-white font-bold text-xs cursor-pointer"
              >
                <Check className="w-5 h-5" />
              </button>
            </div>

            {/* Color selector for text */}
            <div className="flex items-center justify-center gap-3 pt-1">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTextColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                    textColor === c ? 'scale-125 border-white ring-2 ring-white/50' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bottom Post Bar */}
        {mediaPreviewUrl && !isDrawingMode && !showTextInput && (
          <div className="p-5 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between gap-4 z-20">
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setMediaPreviewUrl(null);
              }}
              className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>{isRtl ? 'إلغاء' : 'Discard'}</span>
            </button>

            <button
              type="button"
              disabled={isPosting}
              onClick={handlePostStory}
              className="px-6 py-3 rounded-2xl bg-[#087F75] hover:bg-[#06685F] text-white font-bold text-sm shadow-lg shadow-[#087F75]/40 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isPosting ? (
                <span>{isRtl ? 'جاري النشر...' : 'Posting...'}</span>
              ) : (
                <>
                  <span>{isRtl ? 'نشر الحالة' : 'Share Status'}</span>
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
