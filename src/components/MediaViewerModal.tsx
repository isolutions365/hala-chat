import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { X, ZoomIn, ZoomOut, Maximize2, Download, ChevronLeft, ChevronRight, Share2, Info } from 'lucide-react';
import { Language } from '../types';

interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  senderName?: string;
  timestamp?: string;
  caption?: string;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  language,
  mediaUrl,
  mediaType,
  senderName,
  timestamp,
  caption,
}) => {
  const isRtl = language === 'ar';
  const [scale, setScale] = useState(1);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controls = useAnimation();

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale((prev) => Math.max(prev - 0.5, 1));
  };

  const handleResetZoom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setScale(1);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = `hala_${mediaType}_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleControls = () => setIsControlsVisible(!isControlsVisible);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/95 backdrop-blur-md z-100 flex flex-col overflow-hidden select-none"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Top Navigation Bar */}
          <motion.div
            animate={{ opacity: isControlsVisible ? 1 : 0, y: isControlsVisible ? 0 : -20 }}
            className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-50 bg-gradient-to-b from-black/60 to-transparent"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-white">
                <p className="text-sm font-bold truncate max-w-[150px] sm:max-w-xs">{senderName || (isRtl ? 'وسائط' : 'Media')}</p>
                {timestamp && (
                  <p className="text-[10px] text-white/60">
                    {new Date(timestamp).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {mediaType === 'image' && (
                <div className="hidden sm:flex items-center gap-1 mr-2">
                  <button onClick={handleZoomOut} className="p-2 text-white hover:bg-white/10 rounded-full cursor-pointer"><ZoomOut className="w-4 h-4" /></button>
                  <span className="text-[10px] font-bold text-white min-w-[32px] text-center">{Math.round(scale * 100)}%</span>
                  <button onClick={handleZoomIn} className="p-2 text-white hover:bg-white/10 rounded-full cursor-pointer"><ZoomIn className="w-4 h-4" /></button>
                </div>
              )}
              <button
                type="button"
                onClick={handleDownload}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title={isRtl ? 'تنزيل' : 'Download'}
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </motion.div>

          {/* Main Content Area (Lightbox) */}
          <div 
            className="flex-1 flex items-center justify-center relative touch-none"
            onClick={toggleControls}
          >
            <motion.div
              drag={scale === 1 ? 'y' : true}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={scale === 1 ? 0.4 : 0.1}
              onDragEnd={(_, info) => {
                if (scale === 1 && Math.abs(info.offset.y) > 120) {
                  onClose();
                }
              }}
              animate={controls}
              className="w-full h-full flex items-center justify-center p-4"
            >
              {mediaType === 'image' ? (
                <motion.img
                  src={mediaUrl}
                  alt="Full screen preview"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale, opacity: 1 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
                  onDoubleClick={() => setScale(scale > 1 ? 1 : 2)}
                  style={{ cursor: scale > 1 ? 'move' : 'default' }}
                />
              ) : (
                <video
                  src={mediaUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-full shadow-2xl rounded-sm"
                />
              )}
            </motion.div>
          </div>

          {/* Bottom Caption Overlay */}
          <AnimatePresence>
            {caption && isControlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent flex justify-center pointer-events-none"
              >
                <div className="max-w-xl w-full px-6 py-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-center pointer-events-auto shadow-xl">
                  <p className="text-white text-sm leading-relaxed font-medium">
                    {caption}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Helpful Tip for Mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isControlsVisible ? 0.4 : 0 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white font-medium pointer-events-none uppercase tracking-[0.2em]"
          >
            {isRtl ? 'اسحب للأعلى أو للأسفل للإغلاق' : 'Swipe up or down to dismiss'}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
