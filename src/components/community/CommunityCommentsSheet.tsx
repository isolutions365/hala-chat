import React, { useEffect, useState } from 'react';
import { Loader2, Send, Trash2, X } from 'lucide-react';
import { Language } from '../../types';
import {
  type CommunityAuthorProfile,
  type CommunityPost,
  type CommunityPostComment,
  MAX_COMMUNITY_COMMENT_TEXT,
  addCommunityPostComment,
  deleteCommunityPostComment,
  watchCommunityComments,
} from '../../services/community';

interface CommunityCommentsSheetProps {
  post: CommunityPost;
  currentUser: CommunityAuthorProfile;
  language: Language;
  isGroupStaff?: boolean;
  onClose: () => void;
  onCommentCountChanged?: (postId: string, delta: number) => void;
}

export const CommunityCommentsSheet: React.FC<CommunityCommentsSheetProps> = ({
  post,
  currentUser,
  language,
  isGroupStaff = false,
  onClose,
  onCommentCountChanged,
}) => {
  const isRtl = language === 'ar';
  const [comments, setComments] = useState<CommunityPostComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setIsLoading(true);
    const unsub = watchCommunityComments(
      post.id,
      (list) => {
        setComments(list);
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [post.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await addCommunityPostComment(post.id, currentUser, trimmed);
      setText('');
      onCommentCountChanged?.(post.id, 1);
    } catch (err: any) {
      setErrorMsg(err?.message || (isRtl ? 'تعذر إرسال التعليق.' : 'Failed to post comment.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (comment: CommunityPostComment) => {
    if (deletingId) return;
    setDeletingId(comment.id);
    try {
      await deleteCommunityPostComment(post.id, comment.id);
      onCommentCountChanged?.(post.id, -1);
    } catch (err: any) {
      setErrorMsg(err?.message || (isRtl ? 'تعذر حذف التعليق.' : 'Failed to delete comment.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isRtl ? 'التعليقات' : 'Comments'}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[82vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-[#112330]">
            {isRtl ? 'التعليقات' : 'Comments'}{' '}
            <span className="text-slate-400 font-semibold text-sm">({comments.length})</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={isRtl ? 'إغلاق' : 'Close'}
            className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/70">
          {isLoading ? (
            <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#087F75]" />
              <span className="text-xs">{isRtl ? 'جاري التحميل...' : 'Loading comments...'}</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              {isRtl ? 'لا توجد تعليقات بعد. كن أول من يعلق.' : 'No comments yet. Start the conversation.'}
            </div>
          ) : (
            comments.map((c) => {
              const canDeleteComment =
                c.authorId === currentUser.id ||
                post.authorId === currentUser.id ||
                (Boolean(post.groupId) && isGroupStaff);
              return (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0 overflow-hidden">
                    {c.authorAvatar ? (
                      <img src={c.authorAvatar} alt={c.authorName} className="w-full h-full object-cover" />
                    ) : (
                      c.authorName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0 bg-white border border-slate-200/80 rounded-2xl px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#112330] truncate">
                        {c.authorName}
                      </span>
                      {canDeleteComment && (
                        <button
                          type="button"
                          disabled={deletingId === c.id}
                          onClick={() => handleDelete(c)}
                          aria-label={isRtl ? 'حذف التعليق' : 'Delete comment'}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-1"
                        >
                          {deletingId === c.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap break-words mt-0.5">
                      {c.text}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="px-3.5 pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))] bg-white border-t border-slate-200 shrink-0 space-y-1.5"
        >
          {errorMsg && <p className="text-xs text-rose-600 px-1">{errorMsg}</p>}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_COMMUNITY_COMMENT_TEXT}
              placeholder={isRtl ? 'اكتب تعليقاً...' : 'Write a comment...'}
              className="flex-1 min-w-0 min-h-[44px] px-4 py-2 rounded-2xl bg-slate-100 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30"
            />
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              aria-label={isRtl ? 'إرسال' : 'Send'}
              className="min-w-[44px] min-h-[44px] rounded-2xl bg-[#087F75] hover:bg-[#06685F] text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
