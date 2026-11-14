import React, { useState, useEffect } from 'react';
import { Plus, Camera } from 'lucide-react';
import { Language, UserProfile, StoryModel } from '../types';
import { subscribeToActiveStories } from '../lib/firebase';
import { StoryViewerModal, UserStoryGroup } from './StoryViewerModal';
import { LazyImage } from './LazyImage';

interface StoriesBarProps {
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onOpenCreateStory: () => void;
  onSendStoryReply?: (recipientId: string, replyText: string, storyMediaUrl: string) => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  language,
  currentUserId,
  currentUserProfile,
  onOpenCreateStory,
  onSendStoryReply,
}) => {
  const isRtl = language === 'ar';
  const [activeStories, setActiveStories] = useState<StoryModel[]>([]);
  const [isViewerModalOpen, setIsViewerModalOpen] = useState(false);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);

  useEffect(() => {
    const unsub = subscribeToActiveStories((stories) => {
      setActiveStories(stories);
    });
    return () => unsub();
  }, []);

  const groupedMap = new Map<string, UserStoryGroup>();
  activeStories.forEach((story) => {
    if (!groupedMap.has(story.userId)) {
      groupedMap.set(story.userId, {
        userId: story.userId,
        userName: story.userName,
        userAvatar: story.userAvatar,
        userPhone: story.userPhone,
        stories: [],
      });
    }
    groupedMap.get(story.userId)!.stories.push(story);
  });

  const allStoryGroups = Array.from(groupedMap.values());
  const ownStoryGroup = allStoryGroups.find((g) => g.userId === currentUserId);
  const contactStoryGroups = allStoryGroups.filter((g) => g.userId !== currentUserId);

  const isGroupUnviewed = (group: UserStoryGroup) =>
    group.stories.some((s) => !s.views?.[currentUserId]);

  const handleOpenGroup = (groupIdx: number) => {
    if (groupIdx < 0) return;
    setSelectedGroupIdx(groupIdx);
    setIsViewerModalOpen(true);
  };

  return (
    <>
      <section
        aria-label={isRtl ? 'القصص' : 'Stories'}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full bg-white border-b border-slate-100 px-3.5 sm:px-4 pt-1.5 pb-2 shrink-0"
      >
        <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pt-2 pb-1 px-1">
          {/* Current User's Story Item */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 w-16">
            <button
              type="button"
              onClick={() => {
                if (ownStoryGroup && ownStoryGroup.stories.length > 0) {
                  const ownIdx = allStoryGroups.findIndex((g) => g.userId === currentUserId);
                  handleOpenGroup(ownIdx);
                } else {
                  onOpenCreateStory();
                }
              }}
              className="relative w-14 h-14 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087F75] cursor-pointer"
              aria-label={
                ownStoryGroup && ownStoryGroup.stories.length > 0
                  ? isRtl
                    ? 'عرض قصتي'
                    : 'View my story'
                  : isRtl
                  ? 'إضافة قصة'
                  : 'Add story'
              }
            >
              <div
                className={`w-14 h-14 rounded-2xl bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-base ${
                  ownStoryGroup && ownStoryGroup.stories.length > 0
                    ? 'ring-2 ring-[#087F75] ring-offset-2 ring-offset-white'
                    : 'border border-slate-200'
                }`}
              >
                {currentUserProfile.avatarUrl ? (
                  <LazyImage
                    src={currentUserProfile.avatarUrl}
                    alt={currentUserProfile.name}
                    aspectRatio="1/1"
                    containerClassName="w-full h-full rounded-2xl"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{currentUserProfile.name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              {(!ownStoryGroup || ownStoryGroup.stories.length === 0) && (
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#087F75] text-white flex items-center justify-center border-2 border-white shadow-xs">
                  <Plus className="w-3 h-3" />
                </span>
              )}
            </button>
            <span className="text-[11px] font-medium text-slate-600 truncate w-full text-center">
              {isRtl ? 'قصتي' : 'Your story'}
            </span>
          </div>

          {/* Contact Story Items */}
          {contactStoryGroups.map((group) => {
            const groupIdx = allStoryGroups.findIndex((g) => g.userId === group.userId);
            const unviewed = isGroupUnviewed(group);
            const firstName = (group.userName || '').trim().split(/\s+/)[0] || (isRtl ? 'مستخدم' : 'User');
            const newestStory = group.stories[0];

            return (
              <div key={group.userId} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
                <button
                  type="button"
                  onClick={() => handleOpenGroup(groupIdx)}
                  className="relative w-14 h-14 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087F75] cursor-pointer"
                  aria-label={group.userName}
                >
                  <div
                    className={`w-14 h-14 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center overflow-hidden font-bold text-base ${
                      unviewed
                        ? 'ring-2 ring-[#087F75] ring-offset-2 ring-offset-white'
                        : 'ring-2 ring-slate-200 ring-offset-2 ring-offset-white'
                    }`}
                  >
                    {group.userAvatar ? (
                      <LazyImage
                        src={group.userAvatar}
                        alt={group.userName}
                        aspectRatio="1/1"
                        containerClassName="w-full h-full rounded-2xl"
                        className="w-full h-full object-cover"
                      />
                    ) : newestStory?.mediaType === 'image' && newestStory.mediaUrl ? (
                      <LazyImage
                        src={newestStory.mediaUrl}
                        alt={group.userName}
                        aspectRatio="1/1"
                        containerClassName="w-full h-full rounded-2xl"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                </button>
                <span
                  className={`text-[11px] truncate w-full text-center ${
                    unviewed ? 'font-semibold text-slate-900' : 'font-medium text-slate-500'
                  }`}
                >
                  {firstName}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {isViewerModalOpen && allStoryGroups.length > 0 && (
        <StoryViewerModal
          isOpen={isViewerModalOpen}
          onClose={() => setIsViewerModalOpen(false)}
          language={language}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
          storyGroups={allStoryGroups}
          initialGroupIndex={selectedGroupIdx}
          onSendStoryReply={onSendStoryReply}
        />
      )}
    </>
  );
};
