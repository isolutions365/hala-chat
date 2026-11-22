import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Camera, Clock, Eye, Sparkles } from 'lucide-react';
import { Language, UserProfile, StoryModel } from '../types';
import { subscribeToActiveStories } from '../lib/firebase';
import { formatMessageTime } from '../lib/formatters';
import { CreateStoryModal } from './CreateStoryModal';
import { StoryViewerModal, UserStoryGroup } from './StoryViewerModal';
import { LazyImage } from './LazyImage';

interface StatusTabProps {
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onSendStoryReply?: (recipientId: string, replyText: string, storyMediaUrl: string) => void;
}

export const StatusTab: React.FC<StatusTabProps> = ({
  language,
  currentUserId,
  currentUserProfile,
  onSendStoryReply,
}) => {
  const isRtl = language === 'ar';

  const [activeStories, setActiveStories] = useState<StoryModel[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewerModalOpen, setIsViewerModalOpen] = useState(false);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);

  // Subscribe to all active stories (< 24h old)
  useEffect(() => {
    const unsub = subscribeToActiveStories((stories) => {
      setActiveStories(stories);
    });

    return () => unsub();
  }, []);

  // Group active stories by userId
  const groupedMap = new Map<string, UserStoryGroup>();

  activeStories.forEach((s) => {
    if (!groupedMap.has(s.userId)) {
      groupedMap.set(s.userId, {
        userId: s.userId,
        userName: s.userName,
        userAvatar: s.userAvatar,
        userPhone: s.userPhone,
        stories: [],
      });
    }
    groupedMap.get(s.userId)!.stories.push(s);
  });

  const allStoryGroups = Array.from(groupedMap.values());

  // User's own story group vs contacts' story groups
  const ownStoryGroup = allStoryGroups.find((g) => g.userId === currentUserId);
  const contactStoryGroups = allStoryGroups.filter((g) => g.userId !== currentUserId);

  // Check if a group has any unviewed stories for current user
  const isGroupUnviewed = (group: UserStoryGroup) => {
    return group.stories.some((s) => !s.views?.[currentUserId]);
  };

  const handleOpenGroupViewer = (groupIdxInAll: number) => {
    setSelectedGroupIdx(groupIdxInAll);
    setIsViewerModalOpen(true);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* My Status Section */}
      <div>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3 px-1">
          {isRtl ? 'لحظاتي' : 'My moments'}
        </span>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="flex items-center justify-between">
            <div
              onClick={() => {
                if (ownStoryGroup && ownStoryGroup.stories.length > 0) {
                  const ownIdx = allStoryGroups.findIndex((g) => g.userId === currentUserId);
                  handleOpenGroupViewer(ownIdx);
                } else {
                  setIsCreateModalOpen(true);
                }
              }}
              className="flex items-center gap-3.5 cursor-pointer flex-1"
            >
              <div className="relative">
                {/* Avatar Ring: Coral if user has active stories */}
                <div
                  className={`w-14 h-14 rounded-2xl bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-lg p-0.5 ${
                    ownStoryGroup && ownStoryGroup.stories.length > 0
                      ? 'ring-2 ring-[#087F75] ring-offset-2 ring-offset-white'
                      : 'border-2 border-slate-200'
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

                {/* Add '+' Icon Overlay */}
                <button
                  type="button"
                  aria-label={isRtl ? 'إضافة لحظة' : 'Add moment'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCreateModalOpen(true);
                  }}
                  className="absolute bottom-0 right-0 w-5 h-5 bg-[#087F75] text-white rounded-2xl flex items-center justify-center border-2 border-white shadow-xs hover:bg-[#06685F] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {isRtl ? 'لحظاتي' : 'My moments'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ownStoryGroup && ownStoryGroup.stories.length > 0
                    ? isRtl
                      ? `${ownStoryGroup.stories.length} تحديثات نشطة (انقر للعرض)`
                      : `${ownStoryGroup.stories.length} active updates (tap to view)`
                    : isRtl
                    ? 'انقر لإضافة حالة جديدة'
                    : 'Tap to add status update'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="p-3 bg-teal-50 hover:bg-teal-100/80 text-[#087F75] rounded-2xl transition-colors cursor-pointer"
              title={isRtl ? 'إضافة حالة' : 'Add Status'}
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Updates Section */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
            {isRtl ? 'التحديثات الأخيرة' : 'Recent Updates'}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            {contactStoryGroups.length} {isRtl ? 'مشارك' : 'people'}
          </span>
        </div>

        {contactStoryGroups.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 text-[#087F75] flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 stroke-[1.75]" />
            </div>
            <p className="font-bold text-slate-800 text-sm">
              {isRtl ? 'لا توجد حالات متاحة حالياً' : 'No status updates available'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {isRtl
                ? 'تظهر اللحظات المتاحة هنا لمدة 24 ساعة'
                : 'Available moments appear here for 24 hours'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {contactStoryGroups.map(group => {
              const newestStory = group.stories[0];
              const groupIdx = allStoryGroups.findIndex(g => g.userId === group.userId);
              return <button type="button" key={group.userId} onClick={() => handleOpenGroupViewer(groupIdx)} className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-start hover:border-teal-500 focus-visible:outline-teal-700">
                {newestStory.mediaType === 'image' ? <LazyImage src={newestStory.mediaUrl} alt={group.userName} aspectRatio="4/3" containerClassName="w-full" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full aspect-[4/3] bg-[#112330] text-[#8FE8D0] flex items-center justify-center"><Camera className="w-10 h-10" /></div>}
                <div className="p-3"><h4 className="font-bold text-sm truncate">{group.userName}</h4><p className="text-xs text-slate-500 mt-1">{formatMessageTime(newestStory.createdAt, language)}</p>
                {isGroupUnviewed(group) && <span className="inline-block mt-2 text-xs text-teal-800 bg-teal-50 px-2 py-1 rounded-lg">{isRtl ? 'لحظة جديدة' : 'New moment'}</span>}</div>
              </button>;
            })}
          </div>
        )}
      </div>

      {/* Create Story Modal */}
      <CreateStoryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={currentUserProfile}
      />

      {/* Story Viewer Modal */}
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
    </div>
  );
};
