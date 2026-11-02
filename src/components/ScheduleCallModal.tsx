import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, Video, Phone, X, CheckCircle2 } from 'lucide-react';
import { Language, CallType, UserProfile } from '../types';
import { scheduleCall, saveScheduledCallMessage } from '../lib/firebase';

interface ScheduleCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  targetUser: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    phone?: string;
  };
  chatId: string;
  language: Language;
  onScheduled?: () => void;
}

export const ScheduleCallModal: React.FC<ScheduleCallModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUser,
  chatId,
  language,
  onScheduled,
}) => {
  if (!isOpen) return null;
  const isRtl = language === 'ar';
  const currentUserId =
    currentUser.id || `user_${currentUser.phoneNumber.replace(/\D/g, '')}`;

  const [callType, setCallType] = useState<CallType>('video');
  const [title, setTitle] = useState(isRtl ? 'مكالمة مجدولة مع ' + targetUser.name : 'Scheduled call with ' + targetUser.name);
  
  // Default date/time to 1 hour from now
  const defaultDate = new Date(Date.now() + 3600000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const defaultDateStr = `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}T${pad(defaultDate.getHours())}:${pad(defaultDate.getMinutes())}`;
  
  const [scheduledDateTime, setScheduledDateTime] = useState<string>(defaultDateStr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const scheduledDateObj = new Date(scheduledDateTime);
      if (isNaN(scheduledDateObj.getTime())) {
        alert(isRtl ? 'يرجى تحديد وقت صالح' : 'Please select a valid date and time');
        setIsSubmitting(false);
        return;
      }

      // 1. Create Firestore scheduled call document
      await scheduleCall({
        chatId,
        callerId: currentUserId,
        calleeId: targetUser.id,
        callerName: currentUser.name || 'Unknown',
        calleeName: targetUser.name,
        callerAvatar: currentUser.avatarUrl,
        calleeAvatar: targetUser.avatarUrl,
        type: callType,
        scheduledAt: scheduledDateObj.toISOString(),
        title: title.trim() || (isRtl ? 'مكالمة مجدولة' : 'Scheduled Call'),
      });

      // 2. Save chat message notifying participants
      await saveScheduledCallMessage({
        chatId,
        currentUserId,
        currentUserProfile: currentUser,
        targetUserId: targetUser.id,
        targetUserName: targetUser.name,
        callType,
        scheduledAt: scheduledDateObj.toISOString(),
        title: title.trim(),
      });

      // 3. Generate Google Calendar URL & open
      const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        title
      )}&dates=${scheduledDateObj.toISOString().replace(/-|:|\.\d\d\d/g, '')}/${new Date(
        scheduledDateObj.getTime() + 30 * 60000
      ).toISOString().replace(/-|:|\.\d\d\d/g, '')}&details=${encodeURIComponent(
        `Hala ${callType} call with ${targetUser.name}`
      )}`;

      setSuccessMessage(true);
      if (onScheduled) onScheduled();

      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMessage(false);
        onClose();
        // Optionally offer Google calendar link in new tab
        window.open(gCalUrl, '_blank');
      }, 1200);
    } catch (err) {
      console.error('Failed to schedule call:', err);
      setIsSubmitting(false);
      alert(isRtl ? 'فشل جدول المكالمة. يرجى المحاولة مرة أخرى.' : 'Failed to schedule call. Please try again.');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md bg-[#1E2024] border border-stone-800 rounded-3xl p-6 shadow-2xl text-stone-100 overflow-hidden z-10"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800/60 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {successMessage ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-stone-100">
                {isRtl ? 'تمت جدولة المكالمة بنجاح!' : 'Call Scheduled Successfully!'}
              </h3>
              <p className="text-xs text-stone-400">
                {isRtl
                  ? 'تمت إضافة المكالمة إلى التقويم وسجل المكالمات القادمة.'
                  : 'Call added to your calendar and upcoming call log.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSchedule} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-stone-800">
                <div className="w-9 h-9 rounded-xl bg-[#087F75]/20 text-[#087F75] flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-100">
                    {isRtl ? 'جدولة مكالمة مع ' + targetUser.name : 'Schedule Call with ' + targetUser.name}
                  </h3>
                  <p className="text-xs text-stone-400">
                    {isRtl ? 'إنشاء موعد مكالمة قادم' : 'Set up a future voice or video call'}
                  </p>
                </div>
              </div>

              {/* Call Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  {isRtl ? 'نوع المكالمة' : 'Call Type'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCallType('voice')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      callType === 'voice'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>{isRtl ? 'مكالمة صوتية' : 'Voice Call'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCallType('video')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      callType === 'video'
                        ? 'bg-[#087F75]/20 border-[#087F75] text-teal-300'
                        : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span>{isRtl ? 'مكالمة فيديو' : 'Video Call'}</span>
                  </button>
                </div>
              </div>

              {/* Call Title / Topic */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  {isRtl ? 'عنوان أو موضوع المكالمة' : 'Call Title / Topic'}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isRtl ? 'مثال: مناقشة المشروع الأسبوعي' : 'e.g., Weekly Project Review'}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-700/60 rounded-xl text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#087F75] transition"
                  required
                />
              </div>

              {/* Date and Time */}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                  <span>{isRtl ? 'موعد المكالمة (التاريخ والوقت)' : 'Date and Time'}</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-700/60 rounded-xl text-xs text-stone-100 focus:outline-none focus:border-[#087F75] transition font-mono dir-ltr"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#087F75] hover:bg-[#06655c] text-white text-xs font-semibold shadow-lg transition cursor-pointer disabled:opacity-50"
                >
                  <span>{isRtl ? 'تأكيد الجدول' : 'Confirm Schedule'}</span>
                </button>

              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
