import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Trash2, Loader2, MessageCircle } from 'lucide-react';
import { Language } from '../../types';
import {
  addReelComment,
  deleteReelComment,
  MAX_REEL_COMMENT_LENGTH,
  ReelCommentModel,
  watchReelComments,
} from '../../services/reels';
import { getCreatorProfilesByIds, type CreatorProfile } from '../../services/creatorProfiles';

interface ReelCommentsSheetProps {
  isOpen: boolean;
  reelId: string | null;
  reelAuthorId: string;
  commentsCount: number;
  currentUserId: string;
  currentUserName: string;
  language: Language;
  onClose: () => void;
  onOpenCreatorProfile?: (authorId: string) => void;
}

export const ReelCommentsSheet: React.FC<ReelCommentsSheetProps> = ({
  isOpen,
  reelId,
  reelAuthorId,
  commentsCount,
  currentUserId,
  currentUserName,
  language,
  onClose,
  onOpenCreatorProfile,
}) => {
  const isRtl = language === 'ar';
  const [comments, setComments] = useState<ReelCommentModel[]>([]);
  const [creatorMap, setCreatorMap] = useState<Record<string, CreatorProfile | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const activeGenerationRef = useRef(0);

  useEffect(() => {
    if (!isOpen || !reelId) {
      setComments([]);
      setText('');
      setActionError('');
      setConfirmDeleteId(null);
      return;
    }

    const gen = ++activeGenerationRef.current;
    setLoading(true);
    setLoadError(false);

    const unsubscribe = watchReelComments(
      reelId,
      (items) => {
        if (gen !== activeGenerationRef.current) return;
        setComments(items);
        setLoading(false);
        const authorIds = items.map((c) => c.authorId).filter(Boolean);
        if (authorIds.length > 0) {
          void getCreatorProfilesByIds(authorIds).then((map) => {
            if (gen === activeGenerationRef.current) {
              setCreatorMap((prev) => ({ ...prev, ...map }));
            }
          });
        }
      },
      () => {
        if (gen !== activeGenerationRef.current) return;
        setLoadError(true);
        setLoading(false);
      }
    );

    return () => {
      activeGenerationRef.current++;
      unsubscribe();
    };
  }, [isOpen, reelId, retryTick]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reelId || submitting || !text.trim()) return;
    setSubmitting(true);
    setActionError('');
    try {
      await addReelComment(reelId, currentUserName, text);
      setText('');
    } catch {
      setActionError(
        isRtl
          ? 'تعذر إرسال التعليق. تحقق من الاتصال وحاول مجدداً.'
          : 'Could not post comment. Check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!reelId || submitting) return;
    setSubmitting(true);
    setActionError('');
    try {
      await deleteReelComment(reelId, commentId);
      setConfirmDeleteId(null);
    } catch {
      setActionError(
        isRtl ? 'تعذر حذف التعليق.' : 'Could not delete comment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && reelId && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={isRtl ? 'التعليقات' : 'Comments'}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="w-full sm:max-w-md bg-white text-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[78dvh] overflow-hidden"
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-2.5 sm:hidden" aria-hidden="true" />

            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <MessageCircle className="w-4 h-4 text-[#087F75] shrink-0" />
                <h3 className="text-sm font-bold text-[#112330] truncate">
                  {isRtl ? 'التعليقات' : 'Comments'} ·{' '}
                  <span className="tabular-nums">{commentsCount}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={isRtl ? 'إغلاق' : 'Close'}
                className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {loading && (
                <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-[#087F75]" />
                  <span>{isRtl ? 'جارٍ تحميل التعليقات…' : 'Loading comments…'}</span>
                </div>
              )}

              {loadError && !loading && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center space-y-2">
                  <p className="text-xs font-medium text-rose-800">
                    {isRtl ? 'تعذر تحميل التعليقات.' : 'Could not load comments.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryTick((n) => n + 1)}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    {isRtl ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                </div>
              )}

              {!loading && !loadError && comments.length === 0 && (
                <p className="text-center text-xs text-slate-500 py-8">
                  {isRtl ? 'لا توجد تعليقات بعد. ابدأ المحادثة.' : 'No comments yet. Be the first to comment.'}
                </p>
              )}

              {comments.map((comment) => {
                const canDelete = comment.authorId === currentUserId || reelAuthorId === currentUserId;
                const resolvedAuthorName =
                  creatorMap[comment.authorId]?.displayName || (isRtl ? 'مبدع' : 'Creator');
                return (
                  <article key={comment.id} className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (comment.authorId && onOpenCreatorProfile) {
                            onClose();
                            onOpenCreatorProfile(comment.authorId);
                          }
                        }}
                        className="text-xs font-bold text-[#112330] truncate hover:underline cursor-pointer text-start"
                      >
                        {resolvedAuthorName}
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <time className="text-[11px] text-slate-400">
                          {comment.createdAt?.toDate().toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                          }) || ''}
                        </time>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => setConfirmDeleteId(comment.id)}
                            aria-label={isRtl ? 'حذف التعليق' : 'Delete comment'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed" dir="auto">
                      {comment.text}
                    </p>

                    {confirmDeleteId === comment.id && (
                      <div className="pt-1.5 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
                        >
                          {isRtl ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleDelete(comment.id)}
                          className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                        >
                          {isRtl ? 'حذف' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {actionError && (
              <p role="alert" className="px-4 py-1.5 text-xs text-rose-600 bg-rose-50 border-t border-rose-100">
                {actionError}
              </p>
            )}

            <form
              onSubmit={handleSubmit}
              className="px-4 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:pb-3.5 border-t border-slate-100 bg-white flex items-center gap-2 shrink-0"
            >
              <input
                type="text"
                dir="auto"
                maxLength={MAX_REEL_COMMENT_LENGTH}
                value={text}
                disabled={submitting}
                onChange={(e) => setText(e.target.value)}
                placeholder={isRtl ? 'أضف تعليقاً…' : 'Add a comment…'}
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-[#087F75]"
              />
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                aria-label={isRtl ? 'إرسال' : 'Send'}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#087F75] hover:bg-[#06685F] disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
