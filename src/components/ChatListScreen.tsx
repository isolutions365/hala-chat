import { MajlisDraft } from './MajlisDraft';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  Plus,
  Search,
  Settings,
  Check,
  CheckCheck,
  Clock,
  Sparkles,
  X,
  UserPlus,
  Users,
  Radio,
  Globe,
  Compass,
  Image as ImageIcon,
  Video as VideoIcon,
  BarChart2,
  Phone,
  PhoneCall,
  CircleDot,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  QrCode,
  ScanLine,
} from 'lucide-react';
import { Language, UserProfile, ChatModel, ContactItem, CallType } from '../types';
import {
  subscribeToUserChats,
  findOrCreateOneOnOneChat,
  sendChatMessage,
  togglePinChat,
  toggleArchiveChat,
} from '../lib/firebase';
import { formatChatListTime } from '../lib/formatters';
import { ContactPickerModal } from './ContactPickerModal';
import { NewGroupModal } from './NewGroupModal';
import { NewChannelModal } from './NewChannelModal';
import { ChannelDiscoveryModal } from './ChannelDiscoveryModal';
import { SettingsModal } from './SettingsModal';
import { ProfileQRCodeModal } from './ProfileQRCodeModal';
import { CallLogScreen } from './CallLogScreen';
import { StatusTab } from './StatusTab';

interface ChatListScreenProps {
  language: Language;
  profile: UserProfile;
  onPhotoSave: (dataUrl: string) => Promise<void>;
  onLanguageChange: (lang: Language) => void;
  onRestartOnboarding: () => void;
  onOpenConversation: (chat: ChatModel) => void;
  onInitiateCall: (
    contact: { id: string; name: string; avatarUrl?: string | null; phone?: string },
    type: CallType
  ) => void;
}

export const ChatListScreen: React.FC<ChatListScreenProps> = ({
  language,
  profile,
  onPhotoSave,
  onLanguageChange,
  onRestartOnboarding,
  onOpenConversation,
  onInitiateCall,
}) => {
  const currentUserId = profile.id || `user_${profile.phoneNumber.replace(/\D/g, '')}`;
  const isRtl = language === 'ar';

  const [chats, setChats] = useState<ChatModel[]>([]);
  const [mainNavTab, setMainNavTab] = useState<'chats' | 'status' | 'calls' | 'discover'>('chats');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'channels'>('all');

  const handleSendStoryReply = async (recipientId: string, replyText: string, storyMediaUrl: string) => {
    try {
      const contactItem: ContactItem = { id: recipientId, name: 'Contact', phone: '' };
      const chatId = await findOrCreateOneOnOneChat(currentUserId, profile, contactItem);
      await sendChatMessage({
        chatId,
        senderId: currentUserId,
        senderName: profile.name,
        content: `${isRtl ? 'رد على القصة:' : 'Replying to status:'}\n${storyMediaUrl}\n\n${replyText}`,
        type: 'text',
      });
      const updatedChat = chats.find((c) => c.id === chatId);
      if (updatedChat) {
        onOpenConversation(updatedChat);
      }
    } catch (err) {
      console.warn('Failed to send story reply message:', err);
    }
  };
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  const handleOpenChannelChat = (channelId: string) => {
    setMainNavTab('chats');
    setActiveTab('channels');
    setPendingChannelId(channelId);
  };
  useEffect(() => {
    if (!pendingChannelId) return;
    const channel = chats.find(chat => chat.id === pendingChannelId);
    if (channel) { setPendingChannelId(null); onOpenConversation(channel); }
  }, [chats, pendingChannelId, onOpenConversation]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [isChannelDiscoveryOpen, setIsChannelDiscoveryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrModalTab, setQrModalTab] = useState<'my_code' | 'scan'>('my_code');
  const [isLoading, setIsLoading] = useState(true);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);
  const [contextMenuChat, setContextMenuChat] = useState<ChatModel | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pin / Unpin chat handler
  const handleTogglePinChat = async (targetChat: ChatModel) => {
    const isCurrentlyPinned = targetChat.pinnedBy?.includes(currentUserId) || false;
    const willPin = !isCurrentlyPinned;

    // Optimistic local state update
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== targetChat.id) return c;
        const currentPins = c.pinnedBy || [];
        const nextPins = willPin
          ? Array.from(new Set([...currentPins, currentUserId]))
          : currentPins.filter((id) => id !== currentUserId);
        return { ...c, pinnedBy: nextPins };
      })
    );

    try {
      await togglePinChat({
        chatId: targetChat.id,
        userId: currentUserId,
        isPinned: willPin,
      });
    } catch (err) {
      console.warn('Failed to toggle pin on chat:', err);
    }
  };

  // Archive / Unarchive chat handler
  const handleToggleArchiveChat = async (targetChat: ChatModel) => {
    const isCurrentlyArchived = targetChat.archivedBy?.includes(currentUserId) || false;
    const willArchive = !isCurrentlyArchived;

    // Optimistic local state update
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== targetChat.id) return c;
        const currentArchives = c.archivedBy || [];
        const nextArchives = willArchive
          ? Array.from(new Set([...currentArchives, currentUserId]))
          : currentArchives.filter((id) => id !== currentUserId);
        return { ...c, archivedBy: nextArchives };
      })
    );

    try {
      await toggleArchiveChat({
        chatId: targetChat.id,
        userId: currentUserId,
        isArchived: willArchive,
      });
    } catch (err) {
      console.warn('Failed to toggle archive on chat:', err);
    }
  };

  // Long-press detection for chat rows
  const handleTouchStartChat = (targetChat: ChatModel) => {
    longPressTimerRef.current = setTimeout(() => {
      setContextMenuChat(targetChat);
    }, 450);
  };

  const handleTouchEndChat = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const [recentNewMessageChatIds, setRecentNewMessageChatIds] = useState<Record<string, number>>({});
  const prevChatsRef = useRef<Record<string, { lastMsgId?: string; lastMsgTime?: string; unread?: number }>>({});
  const isFirstLoadRef = useRef(true);

  // Real-time listener for user chats
  useEffect(() => {
    if (!currentUserId) return;
    setIsLoading(true);
    const unsubscribe = subscribeToUserChats(currentUserId, (updatedChats) => {
      if (!isFirstLoadRef.current) {
        const newlyNotified: Record<string, number> = {};
        const now = Date.now();

        updatedChats.forEach((chat) => {
          const prev = prevChatsRef.current[chat.id];
          const currMsg = chat.lastMessage;
          const currUnread = chat.unreadCount?.[currentUserId] || 0;

          if (prev && currMsg) {
            const hasNewMsg =
              (currMsg.id && currMsg.id !== prev.lastMsgId) ||
              (currMsg.timestamp && currMsg.timestamp !== prev.lastMsgTime);
            const unreadIncreased = currUnread > (prev.unread || 0);
            const isFromOther = currMsg.senderId !== currentUserId;

            if ((hasNewMsg && isFromOther) || unreadIncreased) {
              newlyNotified[chat.id] = now;
            }
          }
        });

        if (Object.keys(newlyNotified).length > 0) {
          setRecentNewMessageChatIds((prev) => ({
            ...prev,
            ...newlyNotified,
          }));

          // Clean up animation flags after glow duration
          setTimeout(() => {
            setRecentNewMessageChatIds((prev) => {
              const next = { ...prev };
              Object.keys(newlyNotified).forEach((id) => {
                delete next[id];
              });
              return next;
            });
          }, 3000);
        }
      } else {
        isFirstLoadRef.current = false;
      }

      // Record snapshot for next diff
      const currentMap: Record<string, { lastMsgId?: string; lastMsgTime?: string; unread?: number }> = {};
      updatedChats.forEach((c) => {
        currentMap[c.id] = {
          lastMsgId: c.lastMessage?.id,
          lastMsgTime: c.lastMessage?.timestamp,
          unread: c.unreadCount?.[currentUserId] || 0,
        };
      });
      prevChatsRef.current = currentMap;

      setChats(updatedChats);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  // Handle contact selection to start or open 1-on-1 chat
  const handleSelectContact = async (contact: ContactItem) => {
    setIsContactPickerOpen(false);
    try {
      const chatId = await findOrCreateOneOnOneChat(currentUserId, profile, contact);
      const existing = chats.find((c) => c.id === chatId);
      if (existing) {
        onOpenConversation(existing);
      } else {
        const newChat: ChatModel = {
          id: chatId,
          type: '1-1',
          participants: [currentUserId, contact.id],
          participantDetails: {
            [currentUserId]: {
              name: profile.name,
              avatarUrl: profile.avatarUrl,
              phone: profile.phoneNumber,
            },
            [contact.id]: {
              name: contact.name,
              avatarUrl: contact.avatar_url || null,
              phone: contact.phone,
            },
          },
          unreadCount: {
            [currentUserId]: 0,
            [contact.id]: 0,
          },
          typing: {
            [currentUserId]: false,
            [contact.id]: false,
          },
          lastMessage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        onOpenConversation(newChat);
      }
    } catch (err) {
      console.warn('Failed to start chat with contact:', err);
    }
  };

  // Handle group created
  const handleGroupCreated = (groupId: string) => {
    setIsNewGroupOpen(false);
    const existing = chats.find((c) => c.id === groupId);
    if (existing) {
      onOpenConversation(existing);
    }
  };

  // Handle channel created
  const handleChannelCreated = (channelId: string) => {
    setIsNewChannelOpen(false);
    const existing = chats.find((c) => c.id === channelId);
    if (existing) {
      onOpenConversation(existing);
    }
  };

  // Filter chats by tab and query
  const filteredChats = chats.filter((chat) => {
    // Tab filter
    if (activeTab === 'direct' && chat.type !== '1-1') return false;
    if (activeTab === 'groups' && chat.type !== 'group') return false;
    if (activeTab === 'channels' && chat.type !== 'channel') return false;

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    if (chat.type === 'group') {
      const groupName = (chat.name || chat.title || '').toLowerCase();
      const lastContent = (chat.lastMessage?.content || '').toLowerCase();
      // Match group name or any participant's contact name/phone
      const participantMatches = Object.values(chat.participantDetails || {}).some(
        (details) => {
          const det = details as { name?: string; phone?: string } | undefined;
          return Boolean(
            det?.name?.toLowerCase().includes(q) ||
            det?.phone?.toLowerCase().includes(q)
          );
        }
      );
      return groupName.includes(q) || lastContent.includes(q) || participantMatches;
    } else if (chat.type === 'channel') {
      const channelName = (chat.name || chat.title || '').toLowerCase();
      const desc = (chat.description || '').toLowerCase();
      const lastContent = (chat.lastMessage?.content || '').toLowerCase();
      return channelName.includes(q) || desc.includes(q) || lastContent.includes(q);
    } else {
      const otherId = chat.participants.find((p) => p !== currentUserId) || '';
      const details = chat.participantDetails?.[otherId];
      const name = (details?.name || '').toLowerCase();
      const phone = (details?.phone || '').toLowerCase();
      const lastContent = (chat.lastMessage?.content || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || lastContent.includes(q);
    }
  });

  // Split into archived and active chats
  const archivedChats = filteredChats.filter((chat) => chat.archivedBy?.includes(currentUserId));
  const archivedUnreadTotal = archivedChats.reduce(
    (sum, c) => sum + (c.unreadCount?.[currentUserId] || 0),
    0
  );

  const activeChats = filteredChats.filter((chat) => !chat.archivedBy?.includes(currentUserId));

  // Sort active chats: pinned first, then by lastMessage timestamp / updatedAt desc
  const sortedActiveChats = [...activeChats].sort((a, b) => {
    const aPinned = Boolean(a.pinnedBy?.includes(currentUserId));
    const bPinned = Boolean(b.pinnedBy?.includes(currentUserId));
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const timeA = new Date(a.lastMessage?.timestamp || a.updatedAt).getTime();
    const timeB = new Date(b.lastMessage?.timestamp || b.updatedAt).getTime();
    return timeB - timeA;
  });

  // Render Single Chat Row
  const renderChatRow = (chat: ChatModel, isArchivedSection = false) => {
    const isGroup = chat.type === 'group';
    const isChannel = chat.type === 'channel';
    const isPinned = chat.pinnedBy?.includes(currentUserId) || false;
    const isArchived = chat.archivedBy?.includes(currentUserId) || false;
    const isRecentlyNotified = Boolean(recentNewMessageChatIds[chat.id]);

    const otherId = !isGroup && !isChannel ? chat.participants.find((p) => p !== currentUserId) || '' : '';
    const details = !isGroup && !isChannel ? chat.participantDetails?.[otherId] || {
      name: isRtl ? 'مستخدم هلا' : 'Hala User',
      avatarUrl: null,
      phone: '',
    } : null;

    const displayName = isChannel
      ? chat.name || chat.title || (isRtl ? 'قناة' : 'Channel')
      : isGroup
      ? chat.name || chat.title || (isRtl ? 'مجموعة' : 'Group')
      : details?.name || 'User';

    const displayAvatar = isChannel || isGroup ? chat.avatarUrl : details?.avatarUrl;

    const unread = chat.unreadCount?.[currentUserId] || 0;
    const lastMsg = chat.lastMessage;
    const timeStr = lastMsg?.timestamp
      ? formatChatListTime(lastMsg.timestamp, language)
      : formatChatListTime(chat.updatedAt, language);

    const isOwnLastMsg = lastMsg?.senderId === currentUserId;
    const typingUsers = isChannel
      ? []
      : isGroup
      ? chat.participants.filter((p) => p !== currentUserId && chat.typing?.[p])
      : chat.typing?.[otherId]
      ? [otherId]
      : [];
    const isTyping = typingUsers.length > 0;
    const typingText = !isGroup
      ? isRtl ? 'يكتب الآن...' : 'typing...'
      : typingUsers.length === 1
      ? `${chat.participantDetails?.[typingUsers[0]]?.name?.split(' ')[0] || (isRtl ? 'عضو' : 'Member')} ${isRtl ? 'يكتب الآن...' : 'is typing...'}`
      : `${typingUsers.length} ${isRtl ? 'أشخاص يكتبون...' : 'people typing...'}`;

    return (
      <motion.div
        key={chat.id}
        layout
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          backgroundColor: isRecentlyNotified
            ? [
                'rgba(216, 90, 48, 0.14)',
                'rgba(216, 90, 48, 0.06)',
                isPinned && !isArchivedSection ? 'rgba(255, 247, 237, 0.6)' : 'rgba(255, 255, 255, 0)',
              ]
            : isPinned && !isArchivedSection
            ? 'rgba(255, 247, 237, 0.6)'
            : 'rgba(255, 255, 255, 0)',
        }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
        transition={{
          layout: { type: 'spring', stiffness: 360, damping: 32 },
          backgroundColor: { duration: 2.4, ease: 'easeOut' },
          opacity: { duration: 0.2 },
        }}
        onTouchStart={() => handleTouchStartChat(chat)}
        onTouchEnd={handleTouchEndChat}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuChat(chat);
        }}
        className={`w-full px-4 py-3.5 flex items-center justify-between hover:bg-white transition-colors text-left group min-h-[68px] relative ${
          isPinned && !isArchivedSection ? 'bg-teal-50/30' : ''
        }`}
      >
        {/* Subtle new message glow ring/pulse indicator */}
        {isRecentlyNotified && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.3 }}
            animate={{ opacity: [1, 0.8, 0], scaleY: [0.3, 1, 1] }}
            transition={{ duration: 2.4, ease: 'easeOut' }}
            className={`absolute top-0 ${isRtl ? 'right-0' : 'left-0'} bottom-0 w-1 bg-[#087F75] rounded-full`}
          />
        )}

        {/* Main Clickable Area to Open Conversation */}
        <button
          type="button"
          onClick={() => onOpenConversation(chat)}
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer text-left"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden text-base shadow-2xs font-bold ${
                isChannel
                  ? 'bg-gradient-to-tr from-[#087F75] to-teal-400 text-white'
                  : isGroup
                  ? 'bg-gradient-to-tr from-amber-500 to-[#087F75] text-white'
                  : 'bg-slate-200 text-slate-700 rounded-full'
              }`}
            >
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : isChannel ? (
                <Radio className="w-6 h-6" />
              ) : isGroup ? (
                <Users className="w-6 h-6" />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
          </div>

          {/* Name & Last Message Preview */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-slate-900 text-sm truncate group-hover:text-[#087F75] transition-colors">
                  {displayName}
                </span>

                {/* Pin Icon Indicator */}
                {isPinned && (
                  <Pin className="w-3.5 h-3.5 text-[#087F75] fill-[#087F75] shrink-0 ml-0.5" />
                )}

                {/* Badges for Channel or Group */}
                {isChannel && (
                  <span className="px-1.5 py-0.2 bg-teal-100 text-[#087F75] rounded-md text-[10px] font-bold shrink-0 flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5" />
                    <span>{chat.subscriberCount || chat.participants.length}</span>
                  </span>
                )}
                {isGroup && (
                  <span className="px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded text-[10px] font-medium shrink-0">
                    {chat.participants.length}
                  </span>
                )}
              </div>

              <span
                className={`text-[11px] shrink-0 ml-2 font-medium ${
                  unread > 0 ? 'text-[#087F75] font-bold' : 'text-slate-400'
                }`}
              >
                {timeStr}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                {isTyping ? (
                  <span className="text-[#087F75] font-semibold animate-pulse flex items-center gap-1">
                    <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                      <span className="w-1 h-1 rounded-full bg-[#087F75] animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1 h-1 rounded-full bg-[#087F75] animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1 h-1 rounded-full bg-[#087F75] animate-bounce" />
                    </span>
                    <span className="truncate">{typingText}</span>
                  </span>
                ) : lastMsg ? (
                  <>
                    {isOwnLastMsg && (
                      <span className="shrink-0 text-slate-400" dir="ltr">
                        {lastMsg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline" />
                        ) : lastMsg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-slate-400 inline" />
                        )}
                      </span>
                    )}

                    {/* In group or channel chat, show sender prefix if not own */}
                    {(isGroup || isChannel) && !isOwnLastMsg && lastMsg.senderName && (
                      <span className="font-medium text-slate-700 shrink-0">
                        {lastMsg.senderName.split(' ')[0]}:
                      </span>
                    )}

                    <span className="truncate">
                      {lastMsg.isDeletedForEveryone
                        ? isRtl ? '🚫 تم حذف الرسالة' : '🚫 This message was deleted'
                        : lastMsg.type === 'voice'
                        ? isRtl ? '🎤 رسالة صوتية' : '🎤 Voice message'
                        : lastMsg.type === 'image'
                        ? isRtl ? '📷 صورة' : '📷 Photo'
                        : lastMsg.type === 'video'
                        ? isRtl ? '🎥 فيديو' : '🎥 Video'
                        : lastMsg.type === 'sticker'
                        ? isRtl ? '🎨 ملصق' : '🎨 Sticker'
                        : lastMsg.type === 'poll'
                        ? isRtl ? '📊 استطلاع رأي' : '📊 Poll'
                        : lastMsg.content?.startsWith('e2ee:v1:')
                        ? isRtl ? '🔒 رسالة مشفرة' : '🔒 Encrypted message'
                        : lastMsg.content}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 italic">
                    {isChannel
                      ? isRtl ? 'قناة جديدة' : 'New channel'
                      : isRtl ? 'محادثة جديدة' : 'New chat'}
                  </span>
                )}
              </p>

              {/* Unread message count badge with pop animation */}
              {unread > 0 && (
                <motion.span
                  key={`unread_${unread}`}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: [1, 1.25, 1], opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="shrink-0 ml-2 min-w-[20px] h-5 px-1.5 rounded-full bg-[#087F75] text-white text-[11px] font-bold flex items-center justify-center shadow-xs"
                >
                  {unread > 99 ? '99+' : unread}
                </motion.span>
              )}
            </div>
          </div>
        </button>

        {/* Hover / Quick Actions */}
        <div className="hidden sm:flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePinChat(chat);
            }}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isPinned
                ? 'text-[#087F75] bg-teal-100 hover:bg-teal-200'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title={isPinned ? (isRtl ? 'إلغاء التثبيت' : 'Unpin chat') : (isRtl ? 'تثبيت المحادثة' : 'Pin chat')}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleArchiveChat(chat);
            }}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isArchived
                ? 'text-[#087F75] bg-teal-100 hover:bg-teal-200'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title={isArchived ? (isRtl ? 'إلغاء الأرشفة' : 'Unarchive chat') : (isRtl ? 'أرشفة المحادثة' : 'Archive chat')}
          >
            {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuChat(chat);
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title={isRtl ? 'المزيد من الخيارات' : 'More options'}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="w-full h-full flex flex-col justify-between bg-slate-50 text-slate-900 min-h-0 relative overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={() => {
        if (isFabMenuOpen) setIsFabMenuOpen(false);
      }}
    >
      <header className="bg-[#F8FAFC] px-5 pt-5 pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-3xl font-extrabold text-[#087F75]">{isRtl ? 'هلا' : 'hala'}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMainNavTab('calls')} aria-label={isRtl ? 'المكالمات' : 'Calls'} className="p-3 rounded-2xl bg-teal-50 text-teal-800"><Phone className="w-5 h-5" /></button>
            <button type="button" onClick={() => {setQrModalTab('my_code'); setIsQrModalOpen(true);}} aria-label={isRtl ? 'رمز QR' : 'QR code'} className="p-3 rounded-2xl bg-teal-50 text-teal-800"><QrCode className="w-5 h-5" /></button>
            <button type="button" onClick={() => setIsSettingsOpen(true)} aria-label={isRtl ? 'حسابي' : 'My profile'} className="w-11 h-11 overflow-hidden rounded-2xl bg-teal-700 text-white font-bold">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" /> : profile.name.charAt(0).toUpperCase()}
            </button>
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-[#112330]">{mainNavTab === 'chats' ? (isRtl ? 'أهلاً، ' : 'Hello, ') + profile.name : mainNavTab === 'status' ? (isRtl ? 'لحظاتك' : 'Your moments') : mainNavTab === 'discover' ? (isRtl ? 'اكتشف' : 'Discover') : (isRtl ? 'المكالمات' : 'Calls')}</h1>
        {mainNavTab === 'chats' && <><p className="text-sm text-slate-500">{isRtl ? 'مساحة تجمع أحاديثك ولحظاتك.' : 'A space for your conversations and moments.'}</p><MajlisDraft uid={currentUserId} isRtl={isRtl} chats={chats} /></>}
        {/* Chats-only Filter and Search Bar */}
        {mainNavTab === 'chats' && (
          <>
            {profile.isFlagged && (
              <div className="mx-4 mb-3 p-3.5 rounded-2xl bg-rose-50 border border-rose-200/60 text-rose-800 text-[11px] leading-relaxed flex flex-col gap-1 shadow-2xs">
                <div className="font-bold flex items-center gap-1.5 text-rose-900 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                  {isRtl ? 'تم تقييد الحساب' : 'Account Suspended / Restricted'}
                </div>
                <div>
                  {isRtl
                    ? `تم رصد نشاط مريب يخرق سياسة الاستخدام (إرسال رسائل متكررة لجهات غير مسجلة). السبب: ${profile.flaggedReason || 'انتهاك سياسة الاستخدام'}`
                    : `Suspicious high-frequency activity detected. Reason: ${profile.flaggedReason || 'Spam Policy Violation'}`}
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div className="relative">
              <Search
                className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${
                  isRtl ? 'right-3' : 'left-3'
                }`}
              />
              <input
                type="text"
                aria-label={isRtl ? 'البحث في المحادثات' : 'Search conversations'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                  }
                }}
                placeholder={
                  isRtl
                    ? 'البحث في المحادثات باسم جهة الاتصال...'
                    : 'Search conversations by contact name...'
                }
                className={`w-full h-10 ${
                  isRtl ? 'pr-9 pl-9' : 'pl-9 pr-9'
                } bg-slate-100 hover:bg-slate-100/80 border border-slate-200/60 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-[#087F75]/50 focus:ring-2 focus:ring-[#087F75]/15 transition-all`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={isRtl ? 'مسح البحث' : 'Clear search'}
                  className={`absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'left-2.5' : 'right-2.5'
                  } p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter Tabs & Search Result Counter */}
            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isRtl ? 'الكل' : 'All'}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('direct')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'direct'
                      ? 'bg-[#087F75] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isRtl ? 'محادثات فردية' : 'Direct'}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('groups')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'groups'
                      ? 'bg-[#087F75] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isRtl ? 'المجموعات' : 'Groups'}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('channels')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                    activeTab === 'channels'
                      ? 'bg-[#087F75] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Radio className="w-3 h-3" />
                  <span>{isRtl ? 'القنوات' : 'Channels'}</span>
                </button>
              </div>

              {searchQuery.trim() && (
                <div className="flex items-center gap-1 text-[11px] text-[#087F75] font-semibold shrink-0 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200/50">
                  <span>
                    {filteredChats.length}{' '}
                    {isRtl
                      ? filteredChats.length === 1
                        ? 'محادثة'
                        : 'محادثات'
                      : filteredChats.length === 1
                      ? 'result'
                      : 'results'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </header>

      {/* Main Body: Calls vs Status vs Chats */}
      {mainNavTab === 'discover' ? (
        <ChannelDiscoveryModal embedded isOpen onClose={() => {}} language={language}
          currentUserId={currentUserId} currentUserProfile={profile}
          userJoinedChatIds={chats.map(chat => chat.id)}
          onOpenChannelChat={handleOpenChannelChat}
          onOpenCreateChannel={() => setIsNewChannelOpen(true)} />
      ) : mainNavTab === 'calls' ? (
        <CallLogScreen
          currentUser={profile}
          language={language}
          onInitiateCall={onInitiateCall}
        />
      ) : mainNavTab === 'status' ? (
        <StatusTab
          language={language}
          currentUserId={currentUserId}
          currentUserProfile={profile}
          onSendStoryReply={handleSendStoryReply}
        />
      ) : (
        <>
          {/* Main Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                <div className="w-6 h-6 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">{isRtl ? 'جاري مزامنة المحادثات...' : 'Syncing chats...'}</span>
              </div>
            ) : filteredChats.length === 0 ? (
              /* Empty State */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[380px]">
                <div className="w-20 h-20 rounded-full bg-[#087F75]/10 text-[#087F75] flex items-center justify-center mb-4 shadow-xs">
                  <MessageSquare className="w-10 h-10 stroke-[1.5]" />
                </div>

                <h3 className="text-xl font-bold text-slate-800 mb-1">
                  {searchQuery.trim()
                    ? isRtl
                      ? `لم يتم العثور على نتائج لـ "${searchQuery.trim()}"`
                      : `No conversations found for "${searchQuery.trim()}"`
                    : activeTab === 'channels'
                    ? isRtl
                      ? 'لا توجد قنوات بعد'
                      : 'No channels yet'
                    : isRtl
                    ? 'لا توجد محادثات بعد'
                    : 'No chats yet'}
                </h3>

                <p className="text-sm text-slate-500 max-w-xs mb-6 leading-relaxed">
                  {searchQuery.trim()
                    ? isRtl
                      ? 'جرّب البحث باسم جهة اتصال مختلف أو ابدأ محادثة جديدة.'
                      : 'Try searching with a different contact name or start a new conversation.'
                    : activeTab === 'channels'
                    ? isRtl
                      ? 'استكشف القنوات العامة أو أنشئ قناتك الخاصة لمشاركة التحديثات!'
                      : 'Discover public channels or create your own broadcast channel!'
                    : isRtl
                    ? 'ابدأ المحادثة الأولى مع أصدقائك أو أنشئ قناة جديدة بالضغط على الزر بالأسفل (+)'
                    : 'Tap the new conversation button (+) to start a chat, group, or channel'}
                </p>

                <div className="flex items-center gap-2.5 flex-wrap justify-center">
                  {searchQuery.trim() ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>{isRtl ? 'مسح البحث وعرض الكل' : 'Clear Filter & Show All'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsContactPickerOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-[#087F75] hover:bg-[#06685F] text-white rounded-xl text-xs font-bold shadow-md shadow-[#087F75]/20 transition-all cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{isRtl ? 'محادثة جديدة' : 'New Chat'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsContactPickerOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-[#087F75] hover:bg-[#06685F] text-white rounded-xl text-xs font-bold shadow-md shadow-[#087F75]/20 transition-all cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{isRtl ? 'محادثة جديدة' : 'New Chat'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsNewChannelOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-teal-100 hover:bg-teal-200 text-[#087F75] rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Radio className="w-4 h-4" />
                        <span>{isRtl ? 'قناة جديدة' : 'New Channel'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsChannelDiscoveryOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Compass className="w-4 h-4" />
                        <span>{isRtl ? 'استكشاف القنوات' : 'Discover'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Archived Chats Row (Collapsible at Top) */}
                {archivedChats.length > 0 && (
                  <div className="bg-slate-100/60 border-b border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setIsArchivedExpanded((prev) => !prev)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-200/50 transition-colors cursor-pointer text-left"
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-100 text-[#087F75] flex items-center justify-center shadow-2xs">
                          <Archive className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">
                            {isRtl ? 'المحادثات المؤرشفة' : 'Archived'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {archivedChats.length}{' '}
                            {isRtl
                              ? archivedChats.length === 1
                                ? 'محادثة'
                                : 'محادثات'
                              : archivedChats.length === 1
                              ? 'chat'
                              : 'chats'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {/* Subtle unread notification badge on archived section */}
                        {archivedUnreadTotal > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-[#087F75] text-white text-[11px] font-bold shadow-2xs">
                            {archivedUnreadTotal} {isRtl ? 'جديدة' : 'new'}
                          </span>
                        )}
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400">
                          {isArchivedExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Archived Chats List */}
                    <AnimatePresence>
                      {isArchivedExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="divide-y divide-slate-100 bg-slate-50 border-t border-slate-200/50 overflow-hidden"
                        >
                          <AnimatePresence initial={false}>
                            {archivedChats.map((archivedChat) =>
                              renderChatRow(archivedChat, true)
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Active Chat Rows (Pinned on Top) with Smooth Layout Transitions */}
                <motion.div layout className="divide-y divide-slate-100">
                  <AnimatePresence initial={false}>
                    {sortedActiveChats.map((chat) => renderChatRow(chat, false))}
                  </AnimatePresence>
                </motion.div>
              </>
            )}
          </div>

      {/* Floating Action Button (FAB) with Speed Dial / Option Menu */}
      <div
        className={`px-5 py-2 flex flex-col ${
          isRtl ? 'items-start' : 'items-end'
        } z-30 pointer-events-none relative`}
      >
        <AnimatePresence>
          {isFabMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className={`mb-3 flex flex-col gap-1.5 pointer-events-auto bg-white p-2 rounded-2xl shadow-xl border border-slate-200/80 min-w-[180px]`}
            >
              {/* New Channel Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFabMenuOpen(false);
                  setIsNewChannelOpen(true);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-teal-50 text-slate-700 hover:text-[#087F75] text-xs font-bold transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-full bg-teal-100 text-[#087F75] flex items-center justify-center shrink-0">
                  <Radio className="w-3.5 h-3.5" />
                </div>
                <span>{isRtl ? 'قناة جديدة (بث)' : 'New Channel'}</span>
              </button>

              {/* New Group Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFabMenuOpen(false);
                  setIsNewGroupOpen(true);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span>{isRtl ? 'مجموعة جديدة' : 'New Group'}</span>
              </button>

              {/* New 1-on-1 Chat Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFabMenuOpen(false);
                  setIsContactPickerOpen(true);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <UserPlus className="w-3.5 h-3.5" />
                </div>
                <span>{isRtl ? 'محادثة فردية' : 'New Chat'}</span>
              </button>

              {/* Scan Contact QR Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFabMenuOpen(false);
                  setQrModalTab('scan');
                  setIsQrModalOpen(true);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-emerald-50 text-emerald-700 text-xs font-bold transition-colors cursor-pointer text-left"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ScanLine className="w-3.5 h-3.5" />
                </div>
                <span>{isRtl ? 'مسح رمز QR' : 'Scan Contact QR'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            setIsFabMenuOpen((prev) => !prev);
          }}
          className={`w-14 h-14 rounded-full ${
            isFabMenuOpen ? 'bg-slate-800' : 'bg-[#087F75]'
          } hover:bg-[#06685F] text-white flex items-center justify-center shadow-lg shadow-[#087F75]/35 cursor-pointer transition-all pointer-events-auto`}
          aria-label={isRtl ? 'خيارات المحادثة' : 'Chat options'}
        >
          <motion.div animate={{ rotate: isFabMenuOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus className="w-7 h-7" />
          </motion.div>
        </motion.button>
      </div>
      </>
      )}

      <nav aria-label={isRtl ? 'التنقل الرئيسي' : 'Main navigation'} className="grid grid-cols-4 shrink-0 bg-[#112330] text-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {([{id:'chats', ar:'أحاديثك', en:'Chats', Icon:MessageSquare}, {id:'status', ar:'لحظات', en:'Moments', Icon:ImageIcon}, {id:'discover', ar:'اكتشف', en:'Discover', Icon:Compass}, {id:'profile', ar:'حسابي', en:'Profile', Icon:Users}] as const).map(({id,ar,en,Icon}) => <button key={id} type="button" aria-current={id === mainNavTab ? 'page' : undefined} onClick={() => {setIsFabMenuOpen(false); if(id==='profile') setIsSettingsOpen(true); else setMainNavTab(id);}} className={`min-h-16 rounded-xl flex flex-col items-center justify-center gap-1 text-xs ${id===mainNavTab ? 'text-[#8FE8D0] bg-white/5' : 'text-slate-100 hover:bg-white/10'}`}><Icon className="w-6 h-6"/><span>{isRtl ? ar : en}</span></button>)}
      </nav>
      {/* Contact Picker Modal (1-on-1) */}
      <ContactPickerModal
        isOpen={isContactPickerOpen}
        onClose={() => setIsContactPickerOpen(false)}
        language={language}
        currentUserId={currentUserId}
        onSelectContact={handleSelectContact}
        onOpenQrModal={(tab) => {
          setQrModalTab(tab);
          setIsQrModalOpen(true);
        }}
      />

      {/* New Group Modal */}
      <NewGroupModal
        isOpen={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={profile}
        onGroupCreated={handleGroupCreated}
      />

      {/* New Channel Modal */}
      <NewChannelModal
        isOpen={isNewChannelOpen}
        onClose={() => setIsNewChannelOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={profile}
        onChannelCreated={handleChannelCreated}
      />

      {/* Public Channel Discovery Modal */}
      <ChannelDiscoveryModal
        isOpen={isChannelDiscoveryOpen}
        onClose={() => setIsChannelDiscoveryOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={profile}
        userJoinedChatIds={chats.map((c) => c.id)}
        onOpenChannelChat={handleOpenChannelChat}
        onOpenCreateChannel={() => setIsNewChannelOpen(true)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        language={language}
        profile={profile}
        onPhotoSave={onPhotoSave}
        onLanguageChange={onLanguageChange}
        onRestartOnboarding={onRestartOnboarding}
        onOpenQrModal={(tab) => {
          setQrModalTab(tab);
          setIsQrModalOpen(true);
        }}
      />

      {/* Personal QR Code & Scanner Modal */}
      <ProfileQRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        language={language}
        profile={profile}
        initialTab={qrModalTab}
        onStartChat={handleSelectContact}
        onInitiateCall={onInitiateCall}
      />

      {/* Chat Options Context Menu Bottom Sheet / Modal */}
      <AnimatePresence>
        {contextMenuChat && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
            onClick={() => setContextMenuChat(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 border border-slate-200 space-y-4 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {/* Header */}
              {(() => {
                const isGroup = contextMenuChat.type === 'group';
                const isChannel = contextMenuChat.type === 'channel';
                const otherId = !isGroup && !isChannel
                  ? contextMenuChat.participants.find((p) => p !== currentUserId) || ''
                  : '';
                const details = !isGroup && !isChannel
                  ? contextMenuChat.participantDetails?.[otherId]
                  : null;
                const displayName = isChannel
                  ? contextMenuChat.name || contextMenuChat.title || (isRtl ? 'قناة' : 'Channel')
                  : isGroup
                  ? contextMenuChat.name || contextMenuChat.title || (isRtl ? 'مجموعة' : 'Group')
                  : details?.name || 'User';
                const isPinned = contextMenuChat.pinnedBy?.includes(currentUserId) || false;
                const isArchived = contextMenuChat.archivedBy?.includes(currentUserId) || false;

                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-100 text-[#087F75] flex items-center justify-center font-bold">
                          {isChannel ? <Radio className="w-5 h-5" /> : isGroup ? <Users className="w-5 h-5" /> : displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{displayName}</h4>
                          <span className="text-[11px] text-slate-400">
                            {isChannel
                              ? isRtl ? 'قناة' : 'Channel'
                              : isGroup
                              ? isRtl ? 'مجموعة' : 'Group'
                              : isRtl ? 'محادثة خاصة' : 'Direct Chat'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setContextMenuChat(null)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {/* Pin/Unpin */}
                      <button
                        type="button"
                        onClick={() => {
                          const chat = contextMenuChat;
                          setContextMenuChat(null);
                          handleTogglePinChat(chat);
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-teal-50 text-slate-700 hover:text-[#087F75] font-semibold text-sm transition-colors cursor-pointer text-left"
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPinned ? 'bg-teal-200 text-[#087F75]' : 'bg-slate-100 text-slate-600'}`}>
                          {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        </div>
                        <span>
                          {isPinned
                            ? isRtl ? 'إلغاء تثبيت المحادثة' : 'Unpin chat'
                            : isRtl ? 'تثبيت المحادثة في الأعلى' : 'Pin chat to top'}
                        </span>
                      </button>

                      {/* Archive/Unarchive */}
                      <button
                        type="button"
                        onClick={() => {
                          const chat = contextMenuChat;
                          setContextMenuChat(null);
                          handleToggleArchiveChat(chat);
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-teal-50 text-slate-700 hover:text-[#087F75] font-semibold text-sm transition-colors cursor-pointer text-left"
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isArchived ? 'bg-teal-200 text-[#087F75]' : 'bg-slate-100 text-slate-600'}`}>
                          {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </div>
                        <span>
                          {isArchived
                            ? isRtl ? 'إلغاء الأرشفة ونقل للمحادثات الرئيسية' : 'Unarchive chat'
                            : isRtl ? 'أرشفة المحادثة' : 'Archive chat'}
                        </span>
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
