import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { CallModel, Language } from '../types';
import { startIncomingRingTone, stopRingTone } from '../lib/webrtc';

interface IncomingCallModalProps {
  call: CallModel;
  onAccept: (call: CallModel) => void;
  onDecline: (call: CallModel) => void;
  language: Language;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  call,
  onAccept,
  onDecline,
  language,
}) => {
  const isRtl = language === 'ar';
  const isVideo = call.type === 'video';

  // Ringtone synthesizer trigger
  useEffect(() => {
    startIncomingRingTone();
    return () => {
      stopRingTone();
    };
  }, []);

  const handleAccept = () => {
    stopRingTone();
    onAccept(call);
  };

  const handleDecline = () => {
    stopRingTone();
    onDecline(call);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[#141619] via-[#1A1D21] to-[#0D0F11] text-white p-6 sm:p-10 select-none overflow-hidden">
      {/* Background Animated Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#D85A30]/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl" />
      </div>

      {/* Top Bar: Call Type Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 pt-8 z-10"
      >
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-stone-800/80 border border-stone-700/80 backdrop-blur-md shadow-lg">
          {isVideo ? (
            <Video className="w-4 h-4 text-[#D85A30]" />
          ) : (
            <Phone className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-xs font-semibold tracking-wide text-stone-200 uppercase">
            {isVideo
              ? isRtl
                ? 'مكالمة فيديو واردة'
                : 'Incoming Video Call'
              : isRtl
              ? 'مكالمة صوتية واردة'
              : 'Incoming Voice Call'}
          </span>
        </div>
        <span className="text-xs text-stone-400 font-medium animate-pulse">
          {isRtl ? 'يرن الآن...' : 'Ringing...'}
        </span>
      </motion.div>

      {/* Center: Caller Avatar with Rippling Glow Rings */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center my-auto z-10"
      >
        <div className="relative mb-6">
          {/* Animated Glow Rings */}
          <div className="absolute inset-0 -m-4 rounded-full border-2 border-[#D85A30]/40 animate-ping" />
          <div className="absolute inset-0 -m-8 rounded-full border border-emerald-500/30 animate-pulse" />

          {call.callerAvatar ? (
            <img
              src={call.callerAvatar}
              alt={call.callerName}
              className="w-32 h-32 sm:w-36 sm:h-36 rounded-full object-cover border-4 border-stone-800 shadow-2xl relative z-10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-[#D85A30] to-[#993414] text-white flex items-center justify-center text-4xl font-bold border-4 border-stone-800 shadow-2xl relative z-10">
              {call.callerName ? call.callerName.charAt(0).toUpperCase() : 'H'}
            </div>
          )}
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight drop-shadow-md">
          {call.callerName || 'Hala Contact'}
        </h2>
        {call.callerPhone && (
          <p className="text-stone-400 text-sm font-mono mt-1 dir-ltr">{call.callerPhone}</p>
        )}
      </motion.div>

      {/* Bottom Action Controls: Decline (Red) & Accept (Green/Coral) */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="w-full max-w-sm flex items-center justify-around pb-8 z-10"
      >
        {/* Decline Button */}
        <div className="flex flex-col items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleDecline}
            aria-label="Decline Call"
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-900/40 transition"
          >
            <PhoneOff className="w-7 h-7" />
          </motion.button>
          <span className="text-xs font-medium text-stone-300">
            {isRtl ? 'رفض' : 'Decline'}
          </span>
        </div>

        {/* Accept Button */}
        <div className="flex flex-col items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleAccept}
            aria-label="Accept Call"
            className="relative w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white flex items-center justify-center shadow-lg shadow-emerald-900/40 transition"
          >
            <div className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
            {isVideo ? <Video className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
          </motion.button>
          <span className="text-xs font-semibold text-emerald-400">
            {isRtl ? 'رد' : 'Accept'}
          </span>
        </div>
      </motion.div>
    </div>
  );
};
