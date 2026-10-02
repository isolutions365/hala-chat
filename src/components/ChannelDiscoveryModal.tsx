import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  Radio,
  Users,
  Check,
  Plus,
  Loader2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Flame,
} from 'lucide-react';
import { Language, UserProfile, ChannelModel, ChatModel } from '../types';
import { subscribeToPublicChannels, joinChannel } from '../lib/firebase';

interface ChannelDiscoveryModalProps {
  embedded?: boolean;
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  userJoinedChatIds: string[];
  onOpenChannelChat: (channelId: string) => void;
  onOpenCreateChannel: () => void;
}

export const ChannelDiscoveryModal: React.FC<ChannelDiscoveryModalProps> = ({
  embedded = false,
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
  userJoinedChatIds,
  onOpenChannelChat,
  onOpenCreateChannel,
}) => {
  const isRtl = language === 'ar';
  const [channels, setChannels] = useState<ChannelModel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to public channels
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    const unsubscribe = subscribeToPublicChannels((list) => {
      setChannels(list);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter channels by query
  const filteredChannels = channels.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
  });

  const handleJoinOrOpen = async (channel: ChannelModel) => {
    const isAlreadyMember = userJoinedChatIds.includes(channel.id);
    if (isAlreadyMember) {
      onClose();
      onOpenChannelChat(channel.id);
      return;
    }

    // Join channel
    setJoinError('');
    setJoiningId(channel.id);
    try {
      await joinChannel({
        channelId: channel.id,
        userId: currentUserId,
        userProfile: currentUserProfile,
      });
      onClose();
      onOpenChannelChat(channel.id);
    } catch (err) {
      setJoinError(isRtl ? 'تعذر الانضمام. حاول مرة أخرى.' : 'Could not join this channel. Please try again.');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div
      className={embedded ? "flex-1 min-h-0 flex flex-col" : "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"}
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className={embedded ? "flex-1 min-h-0 w-full bg-white overflow-hidden flex flex-col" : "w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]"}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-teal-50 via-white to-teal-50/40 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#087F75]/10 text-[#087F75] flex items-center justify-center font-bold shadow-xs">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                {isRtl ? 'استكشاف القنوات العامة' : 'Discover Channels'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {isRtl ? 'تابع قنوات الأخبار والاهتمامات' : 'Find and follow topics you love'}
              </p>
            </div>
          </div>
          {!embedded && <button
            type="button"
            aria-label={isRtl ? 'إغلاق' : 'Close'}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>}
        </div>

        {/* Search Bar & Create Button */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5 shrink-0">
          <div className="relative flex-1">
            <Search className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3' : 'left-3'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={isRtl ? 'البحث عن قناة' : 'Search channels'}
              placeholder={isRtl ? 'البحث عن قنوات...' : 'Search public channels...'}
              className={`w-full py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:border-[#087F75] ${
                isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreateChannel();
            }}
            className="px-3 py-2 rounded-xl bg-[#087F75]/10 hover:bg-[#087F75]/20 text-[#087F75] text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isRtl ? 'قناة جديدة' : 'Create'}</span>
          </button>
        </div>

        {joinError && <p role="alert" className="px-5 py-3 text-sm text-red-700">{joinError}</p>}
        {/* Channels List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
              <p className="text-xs font-medium">{isRtl ? 'جاري تحميل القنوات...' : 'Loading channels...'}</p>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#087F75] flex items-center justify-center mb-3">
                <Radio className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                {searchQuery ? (isRtl ? 'لم يتم العثور على قنوات' : 'No channels found') : (isRtl ? 'لا توجد قنوات عامة بعد' : 'No public channels yet')}
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mb-4">
                {isRtl
                  ? 'كن أول من ينشئ قناة عامة ويبث أحدث المنشورات!'
                  : 'Be the first to create a public channel and share updates!'}
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCreateChannel();
                }}
                className="px-4 py-2 rounded-xl bg-[#087F75] text-white text-xs font-bold shadow-md hover:bg-[#06685F] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{isRtl ? 'إنشاء أول قناة' : 'Create first channel'}</span>
              </button>
            </div>
          ) : (
            filteredChannels.map((channel) => {
              const isJoined = userJoinedChatIds.includes(channel.id);
              const isJoining = joiningId === channel.id;

              return (
                <motion.div
                  key={channel.id}
                  whileHover={{ y: -1 }}
                  className="p-3.5 bg-white rounded-2xl border border-slate-200/80 hover:border-[#087F75]/40 hover:shadow-md transition-all flex items-center justify-between gap-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-teal-100 text-[#087F75] flex items-center justify-center overflow-hidden shrink-0 font-bold border border-teal-200/60 shadow-2xs">
                      {channel.avatar_url ? (
                        <img
                          src={channel.avatar_url}
                          alt={channel.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Radio className="w-6 h-6" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-slate-900 truncate">{channel.name}</h4>
                        <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-teal-50 text-[#087F75] text-[10px] font-bold">
                          {channel.subscriber_count || 1} {isRtl ? 'مشترك' : 'subscribers'}
                        </span>
                      </div>
                      {channel.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{channel.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => handleJoinOrOpen(channel)}
                    disabled={isJoining}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                      isJoined
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        : 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-xs'
                    }`}
                  >
                    {isJoining ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isJoined ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isRtl ? 'فتح القناة' : 'Open'}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isRtl ? 'اشتراك' : 'Join'}</span>
                      </>
                    )}
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
};
