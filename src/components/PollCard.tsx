import React from 'react';
import { motion } from 'motion/react';
import { Check, BarChart2, Users, CheckCircle2, Circle } from 'lucide-react';
import { Language, PollData } from '../types';

interface PollCardProps {
  pollData: PollData;
  messageId: string;
  chatId: string;
  currentUserId: string;
  language: Language;
  onVote: (optionId: string) => void;
}

export const PollCard: React.FC<PollCardProps> = ({
  pollData,
  currentUserId,
  language,
  onVote,
}) => {
  const isRtl = language === 'ar';
  const { question, options = [], allowMultiple = false } = pollData;

  // Calculate total votes across all options
  const totalVotesCount = options.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);

  // Check if current user voted in any option
  const hasUserVoted = options.some((opt) => opt.votes?.includes(currentUserId));

  return (
    <div
      className="w-full min-w-[240px] max-w-sm bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100/90 text-slate-900 space-y-3"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Poll Question & Type Badge */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-extrabold text-slate-900 leading-snug break-words">
            {question}
          </h4>
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-orange-50 text-[#D85A30] text-[10px] font-bold">
            <BarChart2 className="w-3 h-3 inline mr-1" />
            {isRtl ? 'استطلاع' : 'Poll'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 font-medium">
          {allowMultiple
            ? isRtl
              ? 'اختر إجابة واحدة أو أكثر'
              : 'Select one or more options'
            : isRtl
            ? 'اختر إجابة واحدة'
            : 'Select one option'}
        </p>
      </div>

      {/* Options List */}
      <div className="space-y-2">
        {options.map((opt) => {
          const voteCount = opt.votes?.length || 0;
          const percentage = totalVotesCount > 0 ? Math.round((voteCount / totalVotesCount) * 100) : 0;
          const isVotedByMe = Boolean(opt.votes?.includes(currentUserId));

          return (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => onVote(opt.id)}
              className={`w-full relative overflow-hidden rounded-xl p-2.5 border text-left flex flex-col justify-center transition-all cursor-pointer ${
                isVotedByMe
                  ? 'border-[#D85A30] bg-orange-50/40 ring-1 ring-[#D85A30]/30'
                  : 'border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/70'
              }`}
            >
              {/* Animated Progress Bar Fill */}
              {totalVotesCount > 0 && (
                <div
                  className={`absolute top-0 bottom-0 ${
                    isRtl ? 'right-0' : 'left-0'
                  } transition-all duration-500 rounded-lg opacity-25 ${
                    isVotedByMe ? 'bg-[#D85A30]' : 'bg-slate-400'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              )}

              {/* Option Text & Vote Details */}
              <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {allowMultiple ? (
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        isVotedByMe
                          ? 'border-[#D85A30] bg-[#D85A30] text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isVotedByMe && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  ) : (
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isVotedByMe
                          ? 'border-[#D85A30] bg-[#D85A30] text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isVotedByMe && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  )}
                  <span
                    className={`text-xs font-semibold truncate ${
                      isVotedByMe ? 'text-[#D85A30] font-bold' : 'text-slate-800'
                    }`}
                  >
                    {opt.text}
                  </span>
                </div>

                {/* Percentage & Vote Count */}
                <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                  {totalVotesCount > 0 && <span>{percentage}%</span>}
                  <span className="text-[10px] text-slate-400 font-normal">
                    ({voteCount})
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Footer Total Votes */}
      <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">
          {totalVotesCount} {totalVotesCount === 1 ? (isRtl ? 'صوت' : 'vote') : (isRtl ? 'أصوات' : 'votes')}
        </span>
        {hasUserVoted && (
          <span className="text-[#D85A30] font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isRtl ? 'تم تسجيل تصويتك' : 'Voted'}
          </span>
        )}
      </div>
    </div>
  );
};
