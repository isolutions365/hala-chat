import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, Trash2, BarChart2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Language, PollData, PollOption } from '../types';

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onSubmitPoll: (pollData: PollData) => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  isOpen,
  onClose,
  language,
  onSubmitPoll,
}) => {
  const isRtl = language === 'ar';
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions((prev) => [...prev, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, val: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleSubmit = () => {
    if (!question.trim()) {
      setError(isRtl ? 'يرجى كتابة سؤال الاستطلاع' : 'Please enter the poll question');
      return;
    }

    const filledOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (filledOptions.length < 2) {
      setError(isRtl ? 'يرجى كتابة خيارين على الأقل' : 'Please provide at least 2 options');
      return;
    }

    // Check for duplicate options
    const uniqueOptions = new Set(filledOptions.map((o) => o.toLowerCase()));
    if (uniqueOptions.size < filledOptions.length) {
      setError(isRtl ? 'لا يمكن تكرار الخيارات المتطابقة' : 'Options must be unique');
      return;
    }

    const pollOptions: PollOption[] = filledOptions.map((text, idx) => ({
      id: `opt_${Date.now()}_${idx}`,
      text,
      votes: [],
    }));

    const pollData: PollData = {
      question: question.trim(),
      options: pollOptions,
      allowMultiple,
      totalVotes: 0,
    };

    onSubmitPoll(pollData);
    // Reset state
    setQuestion('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setError(null);
    onClose();
  };

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
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-orange-50 via-white to-orange-50/40 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D85A30]/10 text-[#D85A30] flex items-center justify-center font-bold shadow-xs">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                {isRtl ? 'إنشاء استطلاع رأي' : 'Create Poll'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isRtl ? 'شارك تصويتاً مع الأعضاء' : 'Ask questions and gather votes'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-semibold border border-red-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Question */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              {isRtl ? 'سؤال الاستطلاع *' : 'Question *'}
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (error) setError(null);
              }}
              placeholder={isRtl ? 'مثال: أين نقضي عطلة نهاية الأسبوع؟' : 'e.g. Where should we meet this weekend?'}
              maxLength={120}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D85A30]/30 focus:border-[#D85A30] transition-all"
            />
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                {isRtl ? 'الخيارات (2 إلى 10 خيارات)' : 'Options (2 to 10)'}
              </label>
              <span className="text-[11px] text-slate-400 font-medium">
                {options.length}/10
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={
                      isRtl
                        ? `الخيار ${idx + 1}...`
                        : `Option ${idx + 1}...`
                    }
                    maxLength={60}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D85A30]/30 focus:border-[#D85A30] transition-all"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="w-full py-2 rounded-xl border border-dashed border-slate-300 hover:border-[#D85A30] hover:bg-orange-50/50 text-slate-600 hover:text-[#D85A30] text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>{isRtl ? 'إضافة خيار آخر' : 'Add Option'}</span>
              </button>
            )}
          </div>

          {/* Allow Multiple Answers Toggle */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-800">
                {isRtl ? 'السماح باختيارات متعددة' : 'Allow multiple answers'}
              </p>
              <p className="text-[11px] text-slate-500 leading-tight">
                {isRtl ? 'يمكن للمصوت اختيار أكثر من إجابة' : 'Voters can choose more than one option'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D85A30]"></div>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-xl bg-[#D85A30] hover:bg-[#c44e27] text-white text-xs font-bold shadow-md shadow-[#D85A30]/25 flex items-center gap-2 cursor-pointer transition-all"
          >
            <BarChart2 className="w-4 h-4" />
            <span>{isRtl ? 'إرسال الاستطلاع' : 'Send Poll'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
