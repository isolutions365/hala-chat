import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Eye, Send, Trash2, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Language, UserProfile, StoryModel, StoryViewItem, TextOverlayData } from '../types';
import { markStoryAsViewed, deleteStory } from '../lib/firebase';
import { formatMessageTime } from '../lib/formatters';

export interface UserStoryGroup {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  userPhone?: string;
  stories: StoryModel[];
}

interface StoryViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  storyGroups: UserStoryGroup[];
  initialGroupIndex?: number;
  initialStoryIndex?: number;
  onSendStoryReply?: (recipientId: string, replyText: string, storyMediaUrl: string) => void;
  onStoryDeleted?: () => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
  storyGroups,
  initialGroupIndex = 0,
  initialStoryIndex = 0,
  onSendStoryReply,
  onStoryDeleted,
}) => {
  const isRtl = language === 'ar';

  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(initialStoryIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Viewers list drawer state (for story owner)
  const [showViewersDrawer, setShowViewersDrawer] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset indices on modal open
  useEffect(() => {
    if (isOpen) {
      setGroupIndex(Math.min(initialGroupIndex, Math.max(0, storyGroups.length - 1)));
      setStoryIndex(initialStoryIndex);
      setProgress(0);
      setIsPaused(false);
      setShowViewersDrawer(false);
      setReplyText('');
    }
  }, [isOpen, initialGroupIndex, initialStoryIndex, storyGroups.length]);

  const activeGroup = storyGroups[groupIndex];
  const activeStory = activeGroup?.stories[storyIndex];
  const isOwnStory = activeStory?.userId === currentUserId;

  // Mark story as viewed when displayed
  useEffect(() => {
    if (isOpen && activeStory && !isOwnStory) {
      markStoryAsViewed({
        storyId: activeStory.id,
        viewerId: currentUserId,
        viewerName: currentUserProfile.name,
        viewerAvatar: currentUserProfile.avatarUrl,
      });
    }
  }, [isOpen, activeStory?.id, isOwnStory, currentUserId, currentUserProfile]);

  // Handle auto-advance timer for photos
  useEffect(() => {
    if (!isOpen || !activeStory || isPaused || showViewersDrawer) return;

    // For videos, video ended listener will trigger advance
    if (activeStory.mediaType === 'video') return;

    const DURATION_MS = 5000;
    const INTERVAL_MS = 50;
    const step = (INTERVAL_MS / DURATION_MS) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + step;
      });
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isOpen, activeStory?.id, isPaused, showViewersDrawer, groupIndex, storyIndex]);

  if (!isOpen || !activeGroup || !activeStory) return null;

  const handleNextStory = () => {
    if (storyIndex < activeGroup.stories.length - 1) {
      setStoryIndex((prev) => prev + 1);
      setProgress(0);
    } else if (groupIndex < storyGroups.length - 1) {
      setGroupIndex((prev) => prev + 1);
      setStoryIndex(0);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrevStory = () => {
    if (storyIndex > 0) {
      setStoryIndex((prev) => prev - 1);
      setProgress(0);
    } else if (groupIndex > 0) {
      const prevGroup = storyGroups[groupIndex - 1];
      setGroupIndex((prev) => prev - 1);
      setStoryIndex(prevGroup.stories.length - 1);
      setProgress(0);
    }
  };

  const handleDeleteCurrentStory = async () => {
    if (!activeStory || !isOwnStory) return;
    try {
      await deleteStory(activeStory.id);
      onStoryDeleted?.();
      handleNextStory();
    } catch (err) {
      console.warn('Delete story error:', err);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !onSendStoryReply) return;
    setIsSendingReply(true);

    try {
      await onSendStoryReply(activeStory.userId, replyText.trim(), activeStory.mediaUrl);
      setReplyText('');
      alert(isRtl ? 'تم إرسال الرد بنجاح' : 'Reply sent successfully');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Extract text overlay data
  let textObj: TextOverlayData | null = null;
  if (activeStory.textOverlay) {
    if (typeof activeStory.textOverlay === 'string') {
      textObj = { text: activeStory.textOverlay, color: '#FFFFFF' };
    } else {
      textObj = activeStory.textOverlay as TextOverlayData;
    }
  }

  // Get viewers array if own story
  const viewersList: StoryViewItem[] = Object.values(activeStory.views || {});

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col justify-between overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Top Story Header & Segmented Progress Bars */}
        <div className="absolute top-0 left-0 right-0 p-4 z-30 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {/* Segmented Progress Bar */}
          <div className="flex gap-1 mb-3">
            {activeGroup.stories.map((s, idx) => {
              let barWidth = '0%';
              if (idx < storyIndex) barWidth = '100%';
              else if (idx === storyIndex) barWidth = `${progress}%`;

              return (
                <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-75"
                    style={{ width: barWidth }}
                  />
                </div>
              );
            })}
          </div>

          {/* User Info Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-sm ring-2 ring-[#087F75]">
                {activeStory.userAvatar ? (
                  <img
                    src={activeStory.userAvatar}
                    alt={activeStory.userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{activeStory.userName.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <div>
                <h4 className="font-bold text-white text-sm drop-shadow-sm">
                  {isOwnStory ? (isRtl ? 'حالتك' : 'Your status') : activeStory.userName}
                </h4>
                <p className="text-[11px] text-white/70 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatMessageTime(activeStory.createdAt, language)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isOwnStory && (
                <button
                  type="button"
                  onClick={handleDeleteCurrentStory}
                  className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  title={isRtl ? 'حذف الحالة' : 'Delete status'}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Media Container with Left/Right Click Nav */}
        <div
          className="relative flex-1 flex items-center justify-center overflow-hidden select-none"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          {/* Media View */}
          <div className="relative w-full max-w-sm aspect-[9/16] max-h-[80vh] rounded-3xl overflow-hidden bg-black flex items-center justify-center shadow-2xl">
            {activeStory.mediaType === 'image' ? (
              <img
                src={activeStory.mediaUrl || undefined}
                alt="Story content"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                ref={videoRef}
                src={activeStory.mediaUrl || undefined}
                autoPlay
                playsInline
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    const current = videoRef.current.currentTime;
                    const duration = videoRef.current.duration || 1;
                    setProgress((current / duration) * 100);
                  }
                }}
                onEnded={handleNextStory}
                className="w-full h-full object-cover"
              />
            )}

            {/* Drawing Canvas Overlay */}
            {activeStory.drawingOverlay && (
              <img
                src={activeStory.drawingOverlay}
                alt="Drawing overlay"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />
            )}

            {/* Text Overlay */}
            {textObj && textObj.text && (
              <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                <div
                  className="px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-xs text-center font-bold text-xl drop-shadow-md break-words max-w-full"
                  style={{ color: textObj.color || '#FFFFFF' }}
                >
                  {textObj.text}
                </div>
              </div>
            )}
          </div>

          {/* Touch Nav Areas (Left 35% prev, Right 65% next) */}
          <button
            type="button"
            onClick={handlePrevStory}
            className="absolute left-0 top-16 bottom-16 w-1/3 z-20 cursor-pointer opacity-0 hover:opacity-100 flex items-center justify-start pl-4 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center">
              <ChevronLeft className="w-6 h-6" />
            </div>
          </button>

          <button
            type="button"
            onClick={handleNextStory}
            className="absolute right-0 top-16 bottom-16 w-2/3 z-20 cursor-pointer opacity-0 hover:opacity-100 flex items-center justify-end pr-4 transition-opacity"
          >
            <div className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center">
              <ChevronRight className="w-6 h-6" />
            </div>
          </button>
        </div>

        {/* Bottom Interactive Area */}
        <div className="p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-30">
          {isOwnStory ? (
            /* Story Owner Viewers Button */
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowViewersDrawer(true)}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-2 backdrop-blur-md transition-colors cursor-pointer shadow-lg"
              >
                <Eye className="w-4 h-4 text-[#087F75]" />
                <span>
                  {isRtl
                    ? `مشاهدة بواسطة ${viewersList.length}`
                    : `Seen by ${viewersList.length}`}
                </span>
              </button>
            </div>
          ) : (
            /* Viewer Quick Reactions + Reply Input */
            <div className="max-w-md mx-auto space-y-3">
              {/* Quick Emoji Reactions */}
              <div className="flex items-center justify-center gap-3 bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/10">
                {['❤️', '🔥', '👏', '😂', '😮', '😍'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    disabled={isSendingReply}
                    onClick={async () => {
                      if (!onSendStoryReply) return;
                      setIsSendingReply(true);
                      try {
                        await onSendStoryReply(activeStory.userId, emoji, activeStory.mediaUrl);
                      } catch (err) {
                        console.error('Failed to send reaction:', err);
                      } finally {
                        setIsSendingReply(false);
                      }
                    }}
                    className="text-xl hover:scale-125 transition-transform active:scale-95 p-1 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Text Reply Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                  placeholder={
                    isRtl ? `رد على ${activeStory.userName}...` : `Reply to ${activeStory.userName}...`
                  }
                  className="flex-1 bg-white/10 border border-white/20 rounded-full px-5 py-3 text-white placeholder-white/50 text-sm focus:outline-none focus:border-[#087F75] backdrop-blur-md"
                />

                <button
                  type="button"
                  disabled={!replyText.trim() || isSendingReply}
                  onClick={handleSendReply}
                  className="w-11 h-11 rounded-full bg-[#087F75] hover:bg-[#06685F] text-white flex items-center justify-center transition-all cursor-pointer shadow-lg disabled:opacity-50 shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Viewers List Bottom Sheet Drawer (For Story Owner) */}
        <AnimatePresence>
          {showViewersDrawer && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 rounded-t-3xl max-h-[60vh] overflow-hidden flex flex-col z-40 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Eye className="w-4 h-4 text-[#087F75]" />
                  <span>{isRtl ? 'المشاهدات' : 'Story Viewers'} ({viewersList.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowViewersDrawer(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-3 pr-1">
                {viewersList.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-6">
                    {isRtl ? 'لم يشاهد أحد حالتك بعد' : 'No views yet'}
                  </p>
                ) : (
                  viewersList.map((v) => (
                    <div key={v.viewerId} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center font-bold text-xs overflow-hidden">
                          {v.viewerAvatar ? (
                            <img src={v.viewerAvatar} alt={v.viewerName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{v.viewerName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{v.viewerName}</p>
                          <p className="text-[10px] text-slate-400">{formatMessageTime(v.viewedAt, language)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};
