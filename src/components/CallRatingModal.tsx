import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase';

interface CallRatingModalProps {
  callId: string;
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'ar';
}

export const CallRatingModal: React.FC<CallRatingModalProps> = ({
  callId,
  isOpen,
  onClose,
  language,
}) => {
  const [rating, setRating] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRtl = language === 'ar';

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (rating === 0) return;
    setIsSubmitting(true);
    try {
      const db = getFirebaseDb();
      const ratingRef = collection(db, 'calls', callId, 'ratings');
      await addDoc(ratingRef, {
        rating,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (error) {
      console.error('Failed to submit rating:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="w-6 h-6" />
        </button>
        <h3 className="text-xl font-bold text-center mb-6">
          {isRtl ? 'كيف كانت جودة المكالمة؟' : 'How was the call quality?'}
        </h3>
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`p-1 transition-all ${rating >= star ? 'text-amber-400' : 'text-slate-300'}`}
            >
              <Star className="w-10 h-10 fill-current" />
            </button>
          ))}
        </div>
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || isSubmitting}
          className="w-full py-3 bg-[#087F75] text-white rounded-2xl font-bold disabled:opacity-50"
        >
          {isSubmitting
            ? (isRtl ? 'جاري الإرسال...' : 'Submitting...')
            : (isRtl ? 'إرسال التقييم' : 'Submit Rating')}
        </button>
      </div>
    </div>
  );
};
