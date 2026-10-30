import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquarePlus, X, Send, Loader2 } from 'lucide-react';
import { Language } from '../types';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
}) => {
  const isRtl = language === 'ar';
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    
    // Simulate API call to save feedback
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log('Feedback submitted:', { userId: currentUserId, feedback });
    setSubmitted(true);
    setIsSubmitting(false);
    
    setTimeout(() => {
      setSubmitted(false);
      onClose();
      setFeedback('');
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-slate-900">
            {isRtl ? 'إرسال ملاحظاتك' : 'Send Feedback'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center text-[#087F75] font-bold">
            {isRtl ? 'شكراً لملاحظاتك!' : 'Thank you for your feedback!'}
          </div>
        ) : (
          <div className="space-y-4">
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={isRtl ? 'كيف يمكننا تحسين هلا؟...' : 'How can we improve Hala?...'}
              className="w-full h-32 p-3 rounded-xl border border-slate-200 text-sm focus:border-[#087F75] focus:ring-1 focus:ring-[#087F75] outline-none resize-none"
            />
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !feedback.trim()}
              className="w-full py-3 rounded-xl bg-[#087F75] text-white font-bold flex items-center justify-center gap-2 hover:bg-[#06685F] disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{isRtl ? 'إرسال' : 'Submit'}</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
