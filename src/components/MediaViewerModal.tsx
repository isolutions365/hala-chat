import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, Share2 } from 'lucide-react';
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

  if (!isOpen) return null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.5, 0.5));
  const handleResetZoom = () => setScale(1);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = `hala_media_${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/95 backdrop-blur-lg z-70 flex flex-col justify-between select-none"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Top Controls Bar */}
        <div className="p-4 flex items-center justify-between z-10 shrink-0 bg-gradient-to-b from-slate-950/80 to-transparent">
          {/* Close Button & Sender Info */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {senderName && (
              <div className="text-white">
                <p className="text-sm font-bold leading-tight">{senderName}</p>
                {timestamp && (
                  <p className="text-[11px] text-white/60">
                    {new Date(timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Zoom and Actions */}
          <div className="flex items-center gap-2">
            {mediaType === 'image' && (
              <>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={scale <= 0.5}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer disabled:opacity-30"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="px-2.5 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
                  title="Reset Zoom"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={scale >= 3}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer disabled:opacity-30"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media Viewing Canvas */}
        <div
          className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden"
          onClick={() => {
            if (scale > 1) setScale(1);
          }}
        >
          {mediaType === 'image' ? (
            <motion.img
              src={mediaUrl || undefined}
              alt="Full size media"
              animate={{ scale }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl cursor-grab active:cursor-grabbing"
            />
          ) : (
            <video
              src={mediaUrl || undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            />
          )}
        </div>

        {/* Caption at bottom if present */}
        {caption && (
          <div className="p-4 bg-gradient-to-t from-slate-950/90 to-transparent text-center shrink-0">
            <p className="text-white text-sm font-medium bg-black/40 backdrop-blur-md inline-block px-4 py-2 rounded-xl max-w-lg">
              {caption}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
