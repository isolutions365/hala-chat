import { MajlisDraft } from './MajlisDraft';
import { PersistentCallBanner } from './PersistentCallBanner';
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
  X,
  User,
  UserPlus,
  Users,
  Radio,
  Globe,
  Film,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  BarChart2,
  Camera,
  Phone,
  PhoneCall,
  CircleDot,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  MoreVertical,
  QrCode,
  SearchX,
  Inbox,
  MessageSquarePlus,
  MessageSquareHeart,
  BellOff,
  AlertCircle,
  Smartphone,
  Lock,
} from 'lucide-react';
import { Language, UserProfile, ChatModel, ContactItem, CallType, MessageModel, CallModel } from '../types';
import {
  subscribeToUserChats,
  findOrCreateOneOnOneChat,
  sendChatMessage,
  markMessagesAsDelivered,
  togglePinChat,
  toggleArchiveChat,
  requestNotificationPermission,
  getFirebaseDb,
} from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  decryptTextContent,
  derive1on1SessionKey,
  decryptGroupSymmetricKey,
  getCachedDecryptedText,
} from '../lib/crypto';
import { formatChatListTime } from '../lib/formatters';
import { ContactPickerModal } from './ContactPickerModal';
import { NewGroupModal } from './NewGroupModal';
import { NewChannelModal } from './NewChannelModal';
import { ChannelDiscoveryModal } from './ChannelDiscoveryModal';
import { SettingsModal } from './SettingsModal';
import { ProfileQRCodeModal } from './ProfileQRCodeModal';
import { CallLogScreen } from './CallLogScreen';
import { StoriesBar } from './StoriesBar';
import { CreateStoryModal } from './CreateStoryModal';
import { CreateCommunityPostScreen } from './community/CreateCommunityPostScreen';
import { ReelsFeed } from './reels/ReelsFeed';
import { ReelUploadScreen } from './reels/ReelUploadScreen';
import { CreatorProfileSetupScreen } from './creator/CreatorProfileSetupScreen';
import { CreatorProfileScreen } from './creator/CreatorProfileScreen';
import { subscribeToCreatorProfile, type CreatorProfile } from '../services/creatorProfiles';
import { FeedbackModal } from './FeedbackModal';
import { InviteModal } from './InviteModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { LazyImage } from './LazyImage';
import { PWAInstallBanner } from './PWAInstallBanner';
import { getMessageStatus } from '../lib/messageStatus';
import { MessageStatusTicks } from './MessageStatusTicks';
import { usePresence } from '../hooks/usePresence';
import { useFirestoreConnectionStatus } from '../hooks/useFirestoreConnectionStatus';
import { Share2, CloudOff, Wifi, WifiOff } from 'lucide-react';
import { chatListState } from '../lib/chatListState';
import { useResolvedTheme } from '../lib/theme';

const ChatRowPresenceDot: React.FC<{ userId?: string; language?: Language }> = ({ userId, language }) => {
  const presence = usePresence(userId, language);
  if (!presence.isOnline) return null;
  return (
    <span
      className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full ring-1 ring-white/50 dark:ring-slate-900/50"
      title="Online"
    />
  );
};

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
  notificationPermission?: NotificationPermission;
  onUserProfileUpdated?: (profile: UserProfile) => void;
  activeCall?: CallModel | null;
  isCallMinimized?: boolean;
  onRestoreCall?: () => void;
  renderCommunity?: (options?: {
    refreshSignal?: number;
    onRequestCreatePost?: (preselectedGroupId?: string) => void;
    creatorProfile?: CreatorProfile | null;
    onOpenCreatorProfile?: (authorId: string) => void;
  }) => React.ReactNode;
  isPhoneVerified?: boolean;
  showPhoneReminder?: boolean;
  onClosePhoneReminder?: () => void;
}

export const ChatListScreen: React.FC<ChatListScreenProps> = ({
  language,
  profile,
  onPhotoSave,
  onLanguageChange,
  onRestartOnboarding,
  onOpenConversation,
  onInitiateCall,
  notificationPermission,
  onUserProfileUpdated,
  activeCall,
  isCallMinimized,
  onRestoreCall,
  renderCommunity,
  isPhoneVerified = true,
  showPhoneReminder = false,
  onClosePhoneReminder,
}) => {
  const currentUserId = profile.id || `user_${profile.phoneNumber.replace(/\D/g, '')}`;
  const isRtl = language === 'ar';
  const isDarkTheme = useResolvedTheme() === 'dark';
  const connectionStatus = useFirestoreConnectionStatus(currentUserId);

  const [isNotificationHelpOpen, setIsNotificationHelpOpen] = useState(false);
  const [chats, setChats] = useState<ChatModel[]>([]);
  const [decryptedLastMessages, setDecryptedLastMessages] = useState<Record<string, string>>({});

  // Instantly populate chat list previews from LRU decryption cache on mount / update (sub-5ms)
  useEffect(() => {
    if (chats.length === 0) return;
    const cachedMap: Record<string, string> = {};
    let hasCache = false;

    for (const chat of chats) {
      const lastMsg = chat.lastMessage;
      if (lastMsg && lastMsg.content && lastMsg.content.startsWith('e2ee:v1:')) {
        const cached = getCachedDecryptedText(lastMsg.id);
        if (cached) {
          cachedMap[chat.id] = cached;
          hasCache = true;
        }
      }
    }

    if (hasCache) {
      setDecryptedLastMessages((prev) => ({ ...cachedMap, ...prev }));
    }
  }, [chats]);

  // Background E2EE decryption pipeline for chat list previews (Optimized)
  const chatKeyCacheRef = useRef<Map<string, { key: CryptoKey, peerPubKey?: string }>>(new Map());
  const processedMessageIdsRef = useRef<Map<string, string>>(new Map()); // Map<chatId, lastMsgId>

  useEffect(() => {
    let isMounted = true;
    const firestore = getFirebaseDb();

    async function decryptChatPreview(chat: ChatModel) {
      const lastMsg = chat.lastMessage;
      if (!lastMsg?.id || !lastMsg.content?.startsWith('e2ee:v1:')) return;
      
      // Skip if already processed for this message ID
      if (processedMessageIdsRef.current.get(chat.id) === lastMsg.id && decryptedLastMessages[chat.id]) {
        return;
      }

      try {
        let chatKey: CryptoKey | null = null;
        const cached = chatKeyCacheRef.current.get(chat.id);

        if (chat.type === '1-1') {
          const peerId = chat.participants.find((p) => p !== currentUserId);
          if (!peerId) return;

          let peerPubKey = (chat.participantDetails?.[peerId] as any)?.publicKey;
          
          // Check if we need to derive or if we can use cached key
          if (cached && cached.peerPubKey === peerPubKey) {
            chatKey = cached.key;
          } else {
            if (!peerPubKey) {
              try {
                const pSnap = await getDoc(doc(firestore, 'users_public', peerId));
                if (pSnap.exists()) peerPubKey = pSnap.data()?.public_key;
                if (!peerPubKey) {
                  const uSnap = await getDoc(doc(firestore, 'users', peerId));
                  if (uSnap.exists()) peerPubKey = uSnap.data()?.public_key;
                }
              } catch {}
            }
            if (peerPubKey) {
              chatKey = await derive1on1SessionKey({
                currentUserId,
                peerPublicKeyJwk: peerPubKey,
                chatId: chat.id,
              });
              if (chatKey) {
                chatKeyCacheRef.current.set(chat.id, { key: chatKey, peerPubKey });
              }
            }
          }
        } else if (chat.type === 'group') {
          if (cached) {
            chatKey = cached.key;
          } else {
            const grpEncPkg = chat.encryptedGroupKeys?.[currentUserId];
            if (grpEncPkg) {
              chatKey = await decryptGroupSymmetricKey({
                currentUserId,
                encryptedPackage: grpEncPkg,
                chatId: chat.id,
              });
              if (chatKey) {
                chatKeyCacheRef.current.set(chat.id, { key: chatKey });
              }
            }
          }
        }

        if (chatKey && isMounted) {
          const plain = await decryptTextContent(lastMsg.content, chatKey, language === 'ar' ? 'ar' : 'en', lastMsg.id);
          if (plain && isMounted) {
            processedMessageIdsRef.current.set(chat.id, lastMsg.id);
            setDecryptedLastMessages(prev => ({ ...prev, [chat.id]: plain }));
          }
        }
      } catch (err) {
        // Safe fallback
      }
    }

    if (chats.length > 0) {
      // Process all chats in parallel
      chats.forEach(chat => {
        decryptChatPreview(chat);
      });
    }

    return () => {
      isMounted = false;
    };
  }, [chats, currentUserId, language]);

  const [mainNavTab, setMainNavTab] = useState<'chats' | 'reels' | 'calls' | 'community'>(isPhoneVerified ? 'chats' : 'community');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isCreateStoryOpen, setIsCreateStoryOpen] = useState(false);
  const [activeCreateScreen, setActiveCreateScreen] = useState<'new_reel' | 'new_post' | null>(null);
  const [preselectedGroupIdForPost, setPreselectedGroupIdForPost] = useState<string>('');
  const [communityRefreshSignal, setCommunityRefreshSignal] = useState(0);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [creatorProfileLoaded, setCreatorProfileLoaded] = useState(false);
  const [selectedCreatorUid, setSelectedCreatorUid] = useState<string | null>(null);

  useEffect(() => {
    setCreatorProfileLoaded(false);
    const unsub = subscribeToCreatorProfile(
      currentUserId,
      (prof) => {
        setCreatorProfile(prof);
        setCreatorProfileLoaded(true);
      },
      () => {
        setCreatorProfileLoaded(true);
      }
    );
    return () => unsub();
  }, [currentUserId]);

  useEffect(() => {
    if (!isPhoneVerified && mainNavTab !== 'community' && mainNavTab !== 'reels') {
      setMainNavTab('community');
    }
  }, [isPhoneVerified, mainNavTab]);

  useEffect(() => {
    if (mainNavTab === 'chats' || mainNavTab === 'calls') {
      setSelectedCreatorUid(null);
    }
  }, [mainNavTab]);

  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'channels' | 'archived'>('all');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

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
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [contextMenuChat, setContextMenuChat] = useState<ChatModel | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Request notification permission and register FCM token on mount
  useEffect(() => {
    if (currentUserId) {
      void requestNotificationPermission(currentUserId);
    }
  }, [currentUserId]);

  // Pin / Unpin chat handler
  const handleTogglePinChat = async (targetChat: ChatModel) => {
    const isCurrentlyPinned = Boolean(targetChat.pinnedBy?.includes(currentUserId));
    const willPin = !isCurrentlyPinned;

    // Optimistic local state update
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== targetChat.id) return c;
        const currentPins = c.pinnedBy || [];
        const nextPins = willPin
          ? Array.from(new Set([...currentPins, currentUserId]))
          : currentPins.filter((id) => id !== currentUserId);
        return { ...c, pinned: willPin, pinnedBy: nextPins };
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
          const prev = chatListState.prevChats[chat.id];
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
      chatListState.prevChats = currentMap;

      setChats(updatedChats);
      setIsLoading(false);

      // Mark last messages as delivered for all active chats
      updatedChats.forEach((chat) => {
        if (
          chat &&
          typeof chat.id === 'string' &&
          chat.id.trim() &&
          chat.lastMessage &&
          typeof chat.lastMessage.id === 'string' &&
          chat.lastMessage.id.trim() &&
          chat.lastMessage.senderId !== currentUserId
        ) {
          const deliveredTo = Array.isArray(chat.lastMessage.deliveredTo) ? chat.lastMessage.deliveredTo : [];
          const readBy = Array.isArray(chat.lastMessage.readBy) ? chat.lastMessage.readBy : [];
          if (!deliveredTo.includes(currentUserId) && !readBy.includes(currentUserId)) {
            markMessagesAsDelivered(chat.id, currentUserId, [chat.lastMessage as any]);
          }
        }
      });
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

  // Per-folder unread & archived counts across all chats
  const activeChatsAll = chats.filter((c) => !c.archivedBy?.includes(currentUserId));
  const archivedChatsAll = chats.filter((c) => Boolean(c.archivedBy?.includes(currentUserId)));

  const allUnreadCount = activeChatsAll.reduce((sum, c) => sum + (c.unreadCount?.[currentUserId] || 0), 0);
  const directUnreadCount = activeChatsAll
    .filter((c) => c.type === '1-1')
    .reduce((sum, c) => sum + (c.unreadCount?.[currentUserId] || 0), 0);
  const groupsUnreadCount = activeChatsAll
    .filter((c) => c.type === 'group')
    .reduce((sum, c) => sum + (c.unreadCount?.[currentUserId] || 0), 0);
  const channelsUnreadCount = activeChatsAll
    .filter((c) => c.type === 'channel')
    .reduce((sum, c) => sum + (c.unreadCount?.[currentUserId] || 0), 0);
  const archivedUnreadCount = archivedChatsAll.reduce((sum, c) => sum + (c.unreadCount?.[currentUserId] || 0), 0);
  const archivedTotalCount = archivedChatsAll.length;
  const totalUnreadChats = allUnreadCount;

  // Filter chats by folder tab and query
  const filteredChats = chats.filter((chat) => {
    const isArchivedChat = Boolean(chat.archivedBy?.includes(currentUserId));

    // Folder tab filter
    if (activeTab === 'archived') {
      if (!isArchivedChat) return false;
    } else {
      if (isArchivedChat) return false;
      if (activeTab === 'direct' && chat.type !== '1-1') return false;
      if (activeTab === 'groups' && chat.type !== 'group') return false;
      if (activeTab === 'channels' && chat.type !== 'channel') return false;
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();

    // Check recent message content fields
    const lastMsg = chat.lastMessage;
    const lastContent = (lastMsg?.content || '').toLowerCase();
    const lastCaption = ((lastMsg as any)?.caption || '').toLowerCase();
    const lastSenderName = (lastMsg?.senderName || '').toLowerCase();
    const pollQuestion = ((lastMsg as any)?.pollData?.question || '').toLowerCase();

    const matchesMessageContent =
      lastContent.includes(q) ||
      lastCaption.includes(q) ||
      lastSenderName.includes(q) ||
      pollQuestion.includes(q);

    if (chat.type === 'group') {
      const groupName = (chat.name || chat.title || '').toLowerCase();
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
      return groupName.includes(q) || matchesMessageContent || participantMatches;
    } else if (chat.type === 'channel') {
      const channelName = (chat.name || chat.title || '').toLowerCase();
      const desc = (chat.description || '').toLowerCase();
      return channelName.includes(q) || desc.includes(q) || matchesMessageContent;
    } else {
      const otherId = chat.participants.find((p) => p !== currentUserId) || '';
      const details = chat.participantDetails?.[otherId];
      const name = (details?.name || '').toLowerCase();
      const phone = (details?.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || matchesMessageContent;
    }
  });

  // Sort displayed chats: pinned first, then by lastMessage timestamp / updatedAt desc
  const displayedChats = [...filteredChats].sort((a, b) => {
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
    const isPinned = Boolean(chat.pinnedBy?.includes(currentUserId));
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
                isPinned && !isArchivedSection
                  ? isDarkTheme
                    ? 'rgba(20, 184, 166, 0.12)'
                    : 'rgba(255, 247, 237, 0.6)'
                  : isDarkTheme
                  ? 'rgba(15, 23, 42, 0)'
                  : 'rgba(255, 255, 255, 0)',
              ]
            : isPinned && !isArchivedSection
            ? isDarkTheme
              ? 'rgba(20, 184, 166, 0.12)'
              : 'rgba(255, 247, 237, 0.6)'
            : isDarkTheme
            ? 'rgba(15, 23, 42, 0)'
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
        className={`w-full px-4 py-3.5 flex items-center justify-between hover:bg-white dark:hover:bg-slate-800/70 transition-colors text-left group min-h-[68px] relative ${
          isPinned && !isArchivedSection ? 'bg-teal-50/30 dark:bg-teal-950/30' : ''
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
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full'
              }`}
            >
              {displayAvatar ? (
                <LazyImage
                  src={displayAvatar}
                  alt={displayName}
                  aspectRatio="1/1"
                  containerClassName="w-full h-full rounded-2xl"
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
            {!isGroup && !isChannel && otherId && (
              <ChatRowPresenceDot userId={otherId} language={language} />
            )}
          </div>

          {/* Name & Last Message Preview */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate group-hover:text-[#087F75] dark:group-hover:text-teal-300 transition-colors">
                  {displayName}
                </span>

                {/* Pin Icon Indicator */}
                {isPinned && (
                  <Pin className="w-3.5 h-3.5 text-[#087F75] dark:text-teal-400 fill-[#087F75] dark:fill-teal-400 shrink-0 ml-0.5" />
                )}

                {/* Badges for Channel or Group */}
                {isChannel && (
                  <span className="px-1.5 py-0.2 bg-teal-100 dark:bg-teal-900/50 text-[#087F75] dark:text-teal-300 rounded-md text-[10px] font-bold shrink-0 flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5" />
                    <span>{chat.subscriberCount || chat.participants.length}</span>
                  </span>
                )}
                {isGroup && (
                  <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium shrink-0">
                    {chat.participants.length}
                  </span>
                )}
              </div>

              <span
                className={`text-[11px] shrink-0 ml-2 font-medium ${
                  unread > 0 ? 'text-[#087F75] dark:text-teal-400 font-bold' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {timeStr}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
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
                    {isOwnLastMsg && lastMsg && (
                      <MessageStatusTicks
                        chatId={chat.id}
                        message={lastMsg as any}
                        receiverUid={otherId}
                        isGroup={isGroup || isChannel}
                        currentUserId={currentUserId}
                        isRtl={isRtl}
                        variant="chatList"
                      />
                    )}

                    {/* In group or channel chat, show sender prefix if not own */}
                    {(isGroup || isChannel) && !isOwnLastMsg && lastMsg.senderName && (
                      <span className="font-medium text-slate-700 dark:text-slate-300 shrink-0">
                        {lastMsg.senderName.split(' ')[0]}:
                      </span>
                    )}

                    <span className="truncate">
                      {(() => {
                        if (lastMsg.isDeletedForEveryone) {
                          return isRtl ? '🚫 تم حذف الرسالة' : '🚫 This message was deleted';
                        }
                        if (
                          lastMsg.type === 'voice' ||
                          (lastMsg as any).mediaType === 'voice' ||
                          (lastMsg.content && (lastMsg.content.includes('voice_note') || lastMsg.content.includes('audio/webm')))
                        ) {
                          return isRtl ? '🎤 رسالة صوتية' : '🎤 Voice message';
                        }
                        if (lastMsg.type === 'image' || (lastMsg as any).mediaType === 'image') {
                          return isRtl ? '📷 صورة' : '📷 Photo';
                        }
                        if (lastMsg.type === 'video' || (lastMsg as any).mediaType === 'video') {
                          return isRtl ? '🎥 فيديو' : '🎥 Video';
                        }
                        if (lastMsg.type === 'sticker') {
                          return isRtl ? '🎨 ملصق' : '🎨 Sticker';
                        }
                        if (lastMsg.type === 'poll') {
                          return isRtl ? '📊 استطلاع رأي' : '📊 Poll';
                        }
                        if (lastMsg.type === 'file') {
                          return `📄 ${(lastMsg as any).fileName || (isRtl ? 'ملف' : 'File')}`;
                        }
                        if (lastMsg.type === 'location') {
                          if (lastMsg.content && lastMsg.content.startsWith('📍')) {
                            return lastMsg.content;
                          }
                          try {
                            const loc = lastMsg.content?.startsWith('{') ? JSON.parse(lastMsg.content) : null;
                            return `📍 ${loc?.locationName || (isRtl ? 'الموقع الجغرافي' : 'Location')}`;
                          } catch {
                            return isRtl ? '📍 الموقع الجغرافي' : '📍 Location';
                          }
                        }
                        const decryptedPreview = decryptedLastMessages[chat.id];
                        if (decryptedPreview) {
                          return decryptedPreview;
                        }
                        if (lastMsg.content?.startsWith('e2ee:v1:')) {
                          return isRtl ? '🔒 رسالة مشفرة' : '🔒 Encrypted message';
                        }
                        return lastMsg.content || '';
                      })()}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">
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
                ? 'text-[#087F75] dark:text-teal-300 bg-teal-100 dark:bg-teal-900/50 hover:bg-teal-200 dark:hover:bg-teal-800/60'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                ? 'text-[#087F75] dark:text-teal-300 bg-teal-100 dark:bg-teal-900/50 hover:bg-teal-200 dark:hover:bg-teal-800/60'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
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
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
      className="w-full h-full flex flex-col justify-between bg-slate-50 dark:bg-[#0B141A] text-slate-900 dark:text-slate-100 min-h-0 relative overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={() => {
        if (isFabMenuOpen) setIsFabMenuOpen(false);
      }}
    >
      {selectedCreatorUid ? (
        <CreatorProfileScreen
          creatorUid={selectedCreatorUid}
          currentUserId={currentUserId}
          currentCreatorName={creatorProfile?.displayName || (isRtl ? 'مبدع' : 'Creator')}
          chatAvatarUrl={profile.avatarUrl}
          language={language}
          onBack={() => setSelectedCreatorUid(null)}
          onOwnProfileUpdated={(updated) => setCreatorProfile(updated)}
          onOpenCreatorProfile={(uid) => setSelectedCreatorUid(uid)}
        />
      ) : (mainNavTab === 'reels' || mainNavTab === 'community' || activeCreateScreen === 'new_reel' || activeCreateScreen === 'new_post') && !creatorProfileLoaded ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-[#F8FAFC] dark:bg-[#0B141A] text-slate-500 dark:text-slate-400 gap-2.5">
          <div className="w-7 h-7 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">
            {isRtl ? 'جاري تحميل ملف المبدع...' : 'Loading creator profile...'}
          </span>
        </div>
      ) : (mainNavTab === 'reels' || mainNavTab === 'community' || activeCreateScreen === 'new_reel' || activeCreateScreen === 'new_post') && !creatorProfile ? (
        <CreatorProfileSetupScreen
          currentUserId={currentUserId}
          chatAvatarUrl={profile.avatarUrl}
          language={language}
          onCancel={() => {
            setActiveCreateScreen(null);
            if (isPhoneVerified) {
              setMainNavTab('chats');
            }
          }}
          onSaved={(saved) => setCreatorProfile(saved)}
        />
      ) : activeCreateScreen === 'new_reel' ? (
        <ReelUploadScreen
          language={language}
          onBack={() => setActiveCreateScreen(null)}
          onPublished={() => {
            setActiveCreateScreen(null);
            setMainNavTab('reels');
          }}
        />
      ) : activeCreateScreen === 'new_post' ? (
        <CreateCommunityPostScreen
          currentUser={{
            id: currentUserId,
            name: creatorProfile?.displayName || (isRtl ? 'مبدع' : 'Creator'),
            avatarUrl: creatorProfile?.avatarUrl || null,
          }}
          language={language}
          initialGroupId={preselectedGroupIdForPost}
          onBack={() => {
            setActiveCreateScreen(null);
            setPreselectedGroupIdForPost('');
          }}
          onPublished={() => {
            setActiveCreateScreen(null);
            setPreselectedGroupIdForPost('');
            setCommunityRefreshSignal((prev) => prev + 1);
            setMainNavTab('community');
          }}
        />
      ) : (
        <>
          {activeCall && isCallMinimized && onRestoreCall && (
            <PersistentCallBanner call={activeCall} language={language} onRestore={onRestoreCall} />
          )}
          {(mainNavTab !== 'reels' || connectionStatus.status === 'offline' || (showPhoneReminder && !isPhoneVerified)) && (
          <header className={`px-3.5 sm:px-5 pt-[max(14px,env(safe-area-inset-top))] sm:pt-4 shrink-0 w-full max-w-full overflow-hidden ${
            mainNavTab === 'reels'
              ? 'bg-[#071318] text-white pb-2.5'
              : mainNavTab === 'chats'
              ? 'bg-[#F8FAFC] dark:bg-[#0B141A] pb-2.5 space-y-2.5'
              : 'bg-[#F8FAFC] dark:bg-[#0B141A] pb-3 space-y-3'
          }`}>
        {mainNavTab !== 'reels' && (
        <div className="flex items-center justify-between gap-1.5 sm:gap-4 w-full min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
            <img src="/icons/icon-192.png" alt="Hala" className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl shadow-2xs border border-teal-600/20 shrink-0" />
            <span className="text-xl sm:text-3xl font-extrabold text-[#087F75] dark:text-teal-400 tracking-tight shrink-0">{isRtl ? 'هلا' : 'hala'}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            {mainNavTab === 'community' ? (
              <button
                type="button"
                onClick={() => setSelectedCreatorUid(currentUserId)}
                aria-label={creatorProfile?.displayName || (isRtl ? 'ملف المبدع' : 'Creator profile')}
                className="min-h-[40px] max-w-[168px] px-2 py-1 rounded-2xl flex items-center gap-2 shrink-0 active:scale-95 transition-all cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#112330] dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 shadow-2xs"
              >
                <span className="w-7 h-7 sm:w-8 sm:h-8 overflow-hidden rounded-xl bg-[#087F75] text-white font-bold flex items-center justify-center shrink-0 text-xs">
                  {creatorProfile?.avatarUrl ? (
                    <LazyImage
                      src={creatorProfile.avatarUrl}
                      alt={creatorProfile.displayName}
                      aspectRatio="1/1"
                      containerClassName="w-full h-full rounded-xl"
                    />
                  ) : (
                    (creatorProfile?.displayName || 'C').charAt(0).toUpperCase()
                  )}
                </span>
                <span className="text-xs font-bold truncate">
                  {creatorProfile?.displayName || (isRtl ? 'ملف المبدع' : 'Creator')}
                </span>
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setIsCameraModalOpen(true)} aria-label={isRtl ? 'الكاميرا' : 'Camera'} className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-teal-50 dark:bg-slate-800 text-teal-800 dark:text-teal-300 hover:bg-teal-100/80 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"><Camera className="w-4.5 h-4.5 sm:w-5 sm:h-5" /></button>
                <button type="button" onClick={() => {setQrModalTab('my_code'); setIsQrModalOpen(true);}} aria-label={isRtl ? 'رمز QR' : 'QR code'} className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-teal-50 dark:bg-slate-800 text-teal-800 dark:text-teal-300 hover:bg-teal-100/80 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"><QrCode className="w-4.5 h-4.5 sm:w-5 sm:h-5" /></button>
                <button type="button" onClick={() => setIsSettingsOpen(true)} aria-label={isRtl ? 'حسابي' : 'My profile'} className="w-8 h-8 sm:w-10 sm:h-10 overflow-hidden rounded-xl sm:rounded-2xl bg-teal-700 text-white font-bold flex items-center justify-center shrink-0 shadow-2xs hover:bg-teal-800 active:scale-95 transition-all text-xs sm:text-sm cursor-pointer">
                  {profile.avatarUrl ? (
                    <LazyImage src={profile.avatarUrl} alt={profile.name} aspectRatio="1/1" containerClassName="w-full h-full rounded-xl sm:rounded-2xl" />
                  ) : (
                    profile.name.charAt(0).toUpperCase()
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        )}

        {/* Telegram-Style Non-Intrusive Connection Status Notification */}
        <AnimatePresence>
          {connectionStatus.status !== 'online' && (
            <motion.div
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              className="px-3.5 py-2 rounded-2xl bg-[#112330]/95 backdrop-blur-md text-white text-[11px] font-semibold flex items-center justify-center gap-2 shadow-md my-1.5 border border-white/10"
            >
              <div className="w-3 h-3 border-2 border-[#0B9488] border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="tracking-wide">
                {connectionStatus.status === 'connecting'
                  ? (isRtl ? 'جاري الاتصال...' : 'Connecting...')
                  : (isRtl ? 'بانتظار الشبكة — يرجى الاتصال ببيانات الجوال' : 'Waiting for network • Offline or internet connectivity')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPhoneReminder && !isPhoneVerified && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mx-4 mb-3 p-4 rounded-2xl bg-[#087F75] text-white shadow-lg relative overflow-hidden"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-black">{isRtl ? 'افتح جميع المزايا' : 'Unlock All Features'}</h4>
                  <p className="text-[11px] text-white/80 leading-relaxed mt-0.5">
                    {isRtl 
                      ? 'أضف رقم هاتفك لتتمكن من الدردشة وإجراء المكالمات المشفرة مع أصدقائك.'
                      : 'Add your phone number to chat and make encrypted calls with your friends.'}
                  </p>
                  <button
                    onClick={() => {
                      if (mainNavTab === 'reels' || mainNavTab === 'community') {
                        setSelectedCreatorUid(currentUserId);
                      } else {
                        setIsSettingsOpen(true);
                      }
                    }}
                    className="mt-2.5 px-3 py-1.5 bg-white text-[#087F75] text-[10px] font-bold rounded-lg shadow-sm active:scale-95 transition-all"
                  >
                    {isRtl ? 'إضافة الرقم الآن' : 'Add Number Now'}
                  </button>
                </div>
                <button
                  onClick={onClosePhoneReminder}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {mainNavTab !== 'reels' && (
          <h1 className="text-2xl font-extrabold text-[#112330] dark:text-slate-100">
            {mainNavTab === 'chats'
              ? (isRtl ? 'أهلاً، ' : 'Hello, ') + profile.name
              : mainNavTab === 'community'
              ? isRtl
                ? 'المجتمع'
                : 'Community'
              : isRtl
              ? 'المكالمات'
              : 'Calls'}
          </h1>
        )}
        {mainNavTab === 'chats' && <><p className="text-sm text-slate-500 dark:text-slate-400">{isRtl ? 'مساحة تجمع أحاديثك ولحظاتك.' : 'A space for your conversations and moments.'}</p><MajlisDraft uid={currentUserId} isRtl={isRtl} chats={chats} /></>}
        {/* Chats-only Filter and Search Bar */}
        {mainNavTab === 'chats' && (
          <>
            {profile.isFlagged && (
              <div className="mx-4 mb-3 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-[11px] leading-relaxed flex flex-col gap-1 shadow-2xs">
                <div className="font-bold flex items-center gap-1.5 text-rose-900 dark:text-rose-100 text-xs">
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
            {(() => {
              const isQueryRtl = searchQuery.trim()
                ? /[\u0600-\u06FF]/.test(searchQuery)
                : isRtl;
              return (
                <div className="relative">
                  <Search
                    className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 transition-all ${
                      isQueryRtl ? 'right-3' : 'left-3'
                    }`}
                  />
                  <input
                    type="text"
                    dir="auto"
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
                        ? 'البحث بالاسم أو محتوى الرسائل الأخيرة...'
                        : 'Search by name or recent message content...'
                    }
                    className={`w-full h-10 ${
                      isQueryRtl ? 'pr-9 pl-9 text-right' : 'pl-9 pr-9 text-left'
                    } bg-slate-200/65 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/80 rounded-full text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:bg-white dark:focus:bg-slate-900 focus:border-[#087F75]/50 focus:ring-2 focus:ring-[#087F75]/15 transition-all`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label={isRtl ? 'مسح البحث' : 'Clear search'}
                      className={`absolute top-1/2 -translate-y-1/2 ${
                        isQueryRtl ? 'left-2.5' : 'right-2.5'
                      } p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Telegram-Style Capsule Folder Tabs & Search Result Counter */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div
                role="tablist"
                aria-label={isRtl ? 'مجلدات المحادثات' : 'Chat folders'}
                className="flex items-center gap-0.5 overflow-x-auto no-scrollbar flex-1 min-w-0 p-1 rounded-full bg-slate-200/65 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]"
              >
                {(
                  [
                    {
                      id: 'all',
                      ar: 'الكل',
                      en: 'All',
                      badge: allUnreadCount,
                      highlightBadge: allUnreadCount > 0,
                      Icon: null,
                    },
                    {
                      id: 'direct',
                      ar: 'فردية',
                      en: 'Direct',
                      badge: directUnreadCount,
                      highlightBadge: directUnreadCount > 0,
                      Icon: null,
                    },
                    {
                      id: 'groups',
                      ar: 'المجموعات',
                      en: 'Groups',
                      badge: groupsUnreadCount,
                      highlightBadge: groupsUnreadCount > 0,
                      Icon: null,
                    },
                    {
                      id: 'channels',
                      ar: 'القنوات',
                      en: 'Channels',
                      badge: channelsUnreadCount,
                      highlightBadge: channelsUnreadCount > 0,
                      Icon: Radio,
                    },
                    {
                      id: 'archived',
                      ar: 'المؤرشفة',
                      en: 'Archived',
                      badge: archivedUnreadCount > 0 ? archivedUnreadCount : archivedTotalCount,
                      highlightBadge: archivedUnreadCount > 0,
                      Icon: Archive,
                    },
                  ] as const
                ).map((folder) => {
                  const isSelected = activeTab === folder.id;
                  const FolderIcon = folder.Icon;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveTab(folder.id)}
                      className={`relative min-h-[38px] px-3 py-1 rounded-full flex items-center gap-1.5 text-xs sm:text-[13px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isSelected
                          ? 'text-[#087F75] dark:text-teal-300 font-bold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold'
                      }`}
                    >
                      {isSelected && (
                        <motion.span
                          layoutId="hala-chat-folder-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className="absolute inset-0 rounded-full bg-white dark:bg-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.09)] border border-slate-200/60 dark:border-slate-700"
                        />
                      )}
                      {FolderIcon && (
                        <FolderIcon
                          className={`relative z-10 w-3.5 h-3.5 shrink-0 transition-colors ${
                            isSelected ? 'text-[#087F75] dark:text-teal-300' : 'text-slate-400'
                          }`}
                        />
                      )}
                      <span className="relative z-10">{isRtl ? folder.ar : folder.en}</span>
                      {folder.badge > 0 && (
                        <span
                          className={`relative z-10 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center transition-colors ${
                            isSelected || folder.highlightBadge
                              ? 'bg-[#087F75] text-white'
                              : 'bg-slate-300/75 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {folder.badge > 99 ? '99+' : folder.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {searchQuery.trim() && (
                <div className="flex items-center gap-1 text-[11px] text-[#087F75] dark:text-teal-300 font-semibold shrink-0 bg-teal-50 dark:bg-teal-950/60 px-2.5 py-1 rounded-full border border-teal-200/60 dark:border-teal-800/60">
                  <span>
                    {displayedChats.length}{' '}
                    {isRtl
                      ? displayedChats.length === 1
                        ? 'محادثة'
                        : 'محادثات'
                      : displayedChats.length === 1
                      ? 'result'
                      : 'results'}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </header>
          )}

      {/* Main Body: Community vs Reels vs Calls vs Chats */}
      {creatorProfileLoaded && Boolean(creatorProfile) && (
        <div
          className={
            mainNavTab === 'reels'
              ? 'flex-1 min-h-0 flex flex-col'
              : 'fixed -top-[200vh] left-0 w-[360px] h-[640px] opacity-0 pointer-events-none overflow-hidden'
          }
          aria-hidden={mainNavTab !== 'reels'}
        >
          <ReelsFeed
            language={language}
            currentUserId={currentUserId}
            currentUserName={creatorProfile?.displayName || (isRtl ? 'مبدع' : 'Creator')}
            currentCreatorAvatarUrl={creatorProfile?.avatarUrl || null}
            isActive={
              mainNavTab === 'reels' &&
              !activeCreateScreen &&
              !selectedCreatorUid &&
              !isCreateSheetOpen &&
              !isSettingsOpen &&
              !isQrModalOpen &&
              !isCameraModalOpen
            }
            canCreateReel={isPhoneVerified}
            onRequestCreateReel={() => setActiveCreateScreen('new_reel')}
            onOpenCreatorProfile={(uid) => setSelectedCreatorUid(uid)}
          />
        </div>
      )}

      {mainNavTab === 'community' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {renderCommunity
            ? renderCommunity({
                refreshSignal: communityRefreshSignal,
                onRequestCreatePost: (gid) => {
                  setPreselectedGroupIdForPost(gid || '');
                  setActiveCreateScreen('new_post');
                },
                creatorProfile,
                onOpenCreatorProfile: (uid) => setSelectedCreatorUid(uid),
              })
            : null}
        </div>
      ) : mainNavTab === 'reels' ? null : mainNavTab === 'calls' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <CallLogScreen
            currentUser={profile}
            language={language}
            onInitiateCall={onInitiateCall}
          />
        </div>
      ) : (
        <>
          {/* Main Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto pb-28 divide-y divide-slate-100 dark:divide-slate-800/80">
            {/* Horizontal Stories Bar at top of Chats */}
            <StoriesBar
              language={language}
              currentUserId={currentUserId}
              currentUserProfile={profile}
              onOpenCreateStory={() => setIsCreateStoryOpen(true)}
              onSendStoryReply={handleSendStoryReply}
            />
            {/* Subtle Notification Permission Denied Banner */}
            {notificationPermission === 'denied' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <BellOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-medium truncate">
                    {isRtl
                      ? 'السماح بالتنبيهات لتلقي المكالمات والرسائل'
                      : 'Allow notifications to receive calls'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNotificationHelpOpen(true)}
                  className="shrink-0 font-bold underline text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 cursor-pointer text-xs"
                >
                  {isRtl ? 'الإعدادات' : 'Settings'}
                </button>
              </motion.div>
            )}

            {/* PWA Banner */}
            <PWAInstallBanner language={language} />

            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                <div className="w-6 h-6 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">{isRtl ? 'جاري مزامنة المحادثات...' : 'Syncing chats...'}</span>
              </div>
            ) : displayedChats.length === 0 && activeTab === 'archived' && !searchQuery.trim() ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center min-h-[320px] space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                  <Archive className="w-8 h-8 stroke-[1.6]" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {isRtl ? 'لا توجد محادثات مؤرشفة' : 'No archived chats'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {isRtl
                      ? 'اضغط مطولاً على أي محادثة أو افتح خياراتها لأرشفتها وإبقاء قائمتك مرتبة.'
                      : 'Long-press or use chat options on any conversation to archive it here.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                >
                  {isRtl ? 'العودة إلى الكل' : 'Back to All Chats'}
                </button>
              </div>
            ) : displayedChats.length === 0 ? (
              /* Empty State with Action Cards */
              <div className="flex-1 flex flex-col items-center justify-center p-4 text-center min-h-[380px] space-y-6">
                {!searchQuery.trim() && (
                  <div className="w-full max-w-md mx-auto space-y-4 my-2 text-right">
                    {/* Card 1: Invite Friends */}
                    <div className="p-5 rounded-3xl bg-gradient-to-br from-teal-800 via-[#087F75] to-teal-700 text-white shadow-md relative overflow-hidden text-right" dir={isRtl ? 'rtl' : 'ltr'}>
                      <div className="flex items-center gap-3.5 mb-3">
                        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white shrink-0 shadow-xs">
                          <UserPlus className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-base leading-snug">
                            {isRtl ? 'دعوة الأصدقاء' : 'Invite Friends'}
                          </h4>
                          <p className="text-xs text-white/80 leading-relaxed">
                            {isRtl
                              ? 'شارك رابطك الخاص للتواصل والدردشة مع أصدقائك عبر واتساب'
                              : 'Share your personal invite link via WhatsApp to connect'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsInviteModalOpen(true)}
                          className="px-4 py-2.5 rounded-xl bg-white text-[#087F75] text-xs font-bold shadow-xs hover:bg-teal-50 transition-all cursor-pointer flex items-center gap-2"
                        >
                          <Share2 className="w-4 h-4" />
                          <span>{isRtl ? 'مشاركة رابط الدعوة' : 'Share Invite Link'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Card 2: Join Suggested Rooms */}
                    <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs text-right" dir={isRtl ? 'rtl' : 'ltr'}>
                      <div className="flex items-center gap-2 mb-3">
                        <Radio className="w-5 h-5 text-[#087F75] dark:text-teal-400" />
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                          {isRtl ? 'انضم إلى الغرف المقترحة' : 'Join Suggested Rooms'}
                        </h4>
                      </div>

                      <div className="space-y-2.5">
                        {[
                          { id: 'room-general', name: isRtl ? 'هالة العامة 🌟' : 'Hala General 🌟', desc: isRtl ? 'ملتقى جميع مستخدمي هالة شات' : 'General lounge for all Hala users' },
                          { id: 'room-tech', name: isRtl ? 'التقنية السعودية 💻' : 'Saudi Tech 💻', desc: isRtl ? 'أخبار التقنية، الذكاء الاصطناعي والمبرمجين' : 'Saudi tech, AI & dev discussions' },
                          { id: 'room-coffee', name: isRtl ? 'قهوة وسوالف ☕' : 'Coffee & Vibes ☕', desc: isRtl ? 'سوالف يومية وأجواء هادئة' : 'Casual chats & daily banter' },
                          { id: 'room-sports', name: isRtl ? 'رياضة وكورة ⚽' : 'Sports & Football ⚽', desc: isRtl ? 'أخبار الدوري والرياضة' : 'League news & match talk' },
                        ].map((room) => (
                          <div
                            key={room.id}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-3 hover:border-[#087F75]/30 transition-all"
                          >
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{room.name}</h5>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{room.desc}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsChannelDiscoveryOpen(true);
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-[#087F75] text-white text-xs font-bold hover:bg-[#06685F] transition-all cursor-pointer shrink-0"
                            >
                              {isRtl ? 'انضمام' : 'Join'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="w-20 h-20 rounded-full bg-[#087F75]/10 text-[#087F75] dark:text-teal-400 flex items-center justify-center mb-2 shadow-xs">
                  {searchQuery.trim() ? (
                    <SearchX className="w-10 h-10 stroke-[1.5]" />
                  ) : (
                    <MessageSquarePlus className="w-10 h-10 stroke-[1.5]" />
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                  {searchQuery.trim()
                    ? isRtl
                      ? `لم يتم العثور على نتائج لـ "${searchQuery.trim()}"`
                      : `No conversations found for "${searchQuery.trim()}"`
                    : isRtl
                    ? 'أو ابدأ محادثة مباشرة جديدة'
                    : 'Or start a new direct conversation'}
                </h3>

                <div className="flex items-center gap-2.5 flex-wrap justify-center pt-2">
                  {searchQuery.trim() ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>{isRtl ? 'مسح البحث وعرض الكل' : 'Clear Filter & Show All'}</span>
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
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-teal-100 dark:bg-teal-900/50 hover:bg-teal-200 dark:hover:bg-teal-900/80 text-[#087F75] dark:text-teal-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Radio className="w-4 h-4" />
                        <span>{isRtl ? 'قناة جديدة' : 'New Channel'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Quick Channel Creation / Discovery Strip when filtering by Channels */}
                {activeTab === 'channels' && (
                  <div className="px-4 py-2.5 bg-teal-50/60 dark:bg-teal-950/30 border-b border-teal-100/80 dark:border-teal-900/50 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsChannelDiscoveryOpen(true)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-[#087F75] dark:hover:text-teal-300 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 text-[#087F75] dark:text-teal-400" />
                      <span>{isRtl ? 'استكشاف القنوات' : 'Discover Channels'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsNewChannelOpen(true)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'قناة جديدة' : 'New Channel'}</span>
                    </button>
                  </div>
                )}

                {/* Chat Rows (Pinned on Top) with Smooth Layout Transitions */}
                <motion.div layout className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  <AnimatePresence initial={false}>
                    {displayedChats.map((chat) => renderChatRow(chat, activeTab === 'archived'))}
                  </AnimatePresence>
                </motion.div>
              </>
            )}
          </div>

      {/* Floating Action Button (FAB) — Overlaid cleanly above the floating dock */}
      <div
        className={`absolute bottom-[calc(88px+env(safe-area-inset-bottom))] sm:bottom-24 ${
          isRtl ? 'left-4 sm:left-5 items-start' : 'right-4 sm:right-5 items-end'
        } flex flex-col z-30 pointer-events-none`}
      >
        <AnimatePresence>
          {isFabMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 460, damping: 32 }}
              className="mb-2.5 flex flex-col gap-1 pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-1.5 rounded-2xl shadow-[0_14px_34px_-10px_rgba(15,23,42,0.22)] border border-slate-200/80 dark:border-slate-700 min-w-[172px]"
            >
              {/* New 1-on-1 Chat Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFabMenuOpen(false);
                  setIsContactPickerOpen(true);
                }}
                className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-teal-50/80 dark:hover:bg-teal-950/60 text-slate-800 dark:text-slate-100 hover:text-[#087F75] dark:hover:text-teal-300 text-xs font-bold transition-colors cursor-pointer text-start"
              >
                <span className="w-7 h-7 rounded-full bg-teal-50 dark:bg-teal-950/70 text-[#087F75] dark:text-teal-300 flex items-center justify-center shrink-0">
                  <UserPlus className="w-3.5 h-3.5" />
                </span>
                <span className="whitespace-nowrap">{isRtl ? 'محادثة فردية' : 'New Chat'}</span>
              </button>

              {/* New Group Option */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFabMenuOpen(false);
                  setIsNewGroupOpen(true);
                }}
                className="min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-50/80 dark:hover:bg-amber-950/40 text-slate-800 dark:text-slate-100 hover:text-amber-700 dark:hover:text-amber-300 text-xs font-bold transition-colors cursor-pointer text-start"
              >
                <span className="w-7 h-7 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5" />
                </span>
                <span className="whitespace-nowrap">{isRtl ? 'مجموعة جديدة' : 'New Group'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            setIsFabMenuOpen((prev) => !prev);
          }}
          className={`w-12 h-12 rounded-full ${
            isFabMenuOpen
              ? 'bg-slate-800 shadow-[0_10px_24px_-6px_rgba(15,23,42,0.45)]'
              : 'bg-gradient-to-br from-[#0B9488] to-[#06685F] shadow-[0_10px_24px_-6px_rgba(8,127,117,0.5)]'
          } text-white flex items-center justify-center cursor-pointer transition-colors pointer-events-auto border border-white/20`}
          aria-label={isRtl ? 'خيارات المحادثة' : 'Chat options'}
          aria-expanded={isFabMenuOpen}
        >
          <motion.div animate={{ rotate: isFabMenuOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
            {isFabMenuOpen ? <X className="w-5 h-5" /> : <MessageSquarePlus className="w-5 h-5" />}
          </motion.div>
        </motion.button>
      </div>
      </>
      )}

      {/* Telegram-Inspired Liquid Glass Floating Navigation Capsule */}
      <div
        className={
          mainNavTab === 'reels'
            ? 'w-full flex-shrink-0 px-4 sm:px-6 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] sm:pb-3.5 z-20 select-none bg-[#071318] flex justify-center'
            : 'pointer-events-none absolute inset-x-0 bottom-0 px-4 sm:px-6 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-4 z-20 select-none flex justify-center'
        }
      >
        <nav
          aria-label={isRtl ? 'التنقل الرئيسي' : 'Main navigation'}
          className={`pointer-events-auto w-full max-w-[364px] grid grid-cols-5 items-center gap-0.5 p-1.5 rounded-full backdrop-blur-2xl transition-colors duration-200 ${
            mainNavTab === 'reels' || isDarkTheme
              ? 'bg-slate-900/88 border border-white/15 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.12)]'
              : 'bg-white/78 border border-white/90 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.18),0_2px_10px_-2px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.95)]'
          }`}
        >
          {([
            { id: 'chats', ar: 'الدردشات', en: 'Chats', Icon: MessageSquare },
            { id: 'calls', ar: 'المكالمات', en: 'Calls', Icon: PhoneCall },
            { id: 'create', ar: 'إنشاء', en: 'Create', Icon: Plus },
            { id: 'reels', ar: 'ريلز', en: 'Reels', Icon: Film },
            { id: 'community', ar: 'المجتمع', en: 'Community', Icon: Users },
          ] as const).map(({ id, ar, en, Icon }) => {
            const isCreateButton = id === 'create';
            const isActive = isCreateButton ? isCreateSheetOpen : id === mainNavTab;
            const isLocked = !isPhoneVerified && id !== 'community' && id !== 'reels';
            const isDarkSurface = mainNavTab === 'reels' || isDarkTheme;

            if (isCreateButton) {
              return (
                <div key={id} className="flex items-center justify-center">
                  <button
                    type="button"
                    disabled={isLocked}
                    aria-label={isRtl ? ar : en}
                    aria-haspopup="dialog"
                    aria-expanded={isCreateSheetOpen}
                    onClick={() => {
                      setIsFabMenuOpen(false);
                      setIsCreateSheetOpen(true);
                    }}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-92 ${
                      isLocked
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 opacity-50 cursor-not-allowed'
                        : 'bg-gradient-to-br from-[#0B9488] via-[#087F75] to-[#06685F] text-white shadow-[0_6px_18px_-4px_rgba(8,127,117,0.52)] hover:brightness-105 border border-white/25'
                    }`}
                  >
                    <motion.span
                      animate={{ rotate: isCreateSheetOpen ? 45 : 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                      className="flex items-center justify-center"
                    >
                      <Icon className="w-5 h-5 stroke-[2.5]" />
                    </motion.span>
                  </button>
                </div>
              );
            }

            return (
              <button
                key={id}
                type="button"
                disabled={isLocked}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  setIsFabMenuOpen(false);
                  if (id === 'chats') setActiveTab('all');
                  setMainNavTab(id);
                }}
                className={`relative min-h-[46px] py-1 px-1 rounded-full flex flex-col items-center justify-center transition-colors cursor-pointer min-w-0 active:scale-95 ${
                  isLocked
                    ? 'text-slate-400 opacity-40 grayscale cursor-not-allowed'
                    : isActive
                    ? isDarkSurface
                      ? 'text-[#8FE8D0] font-bold'
                      : 'text-[#087F75] font-bold'
                    : isDarkSurface
                    ? 'text-slate-400 hover:text-white font-medium'
                    : 'text-slate-600 hover:text-slate-950 font-medium'
                }`}
              >
                {isActive && !isLocked && (
                  <motion.span
                    layoutId="hala-bottom-nav-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className={`absolute inset-0 rounded-full ${
                      isDarkSurface
                        ? 'bg-white/14 border border-white/15'
                        : 'bg-[#087F75]/10 border border-[#087F75]/12'
                    }`}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <Icon className={`w-[19px] h-[19px] shrink-0 ${isActive ? 'stroke-[2.25]' : 'stroke-[1.85]'}`} />
                  {id === 'chats' && totalUnreadChats > 0 && !isLocked && (
                    <span
                      className={`absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#087F75] text-white text-[9px] font-bold leading-none flex items-center justify-center shadow-2xs ring-2 ${
                        isDarkSurface ? 'ring-slate-900' : 'ring-white'
                      }`}
                    >
                      {totalUnreadChats > 99 ? '99+' : totalUnreadChats}
                    </span>
                  )}
                  {isLocked && (
                    <span className="absolute -top-1 -right-1.5">
                      <Lock className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                    </span>
                  )}
                </span>
                <span className="relative z-10 text-[10px] sm:text-[11px] leading-tight whitespace-nowrap shrink-0 mt-0.5 tracking-tight">
                  {isRtl ? ar : en}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
        </>
      )}

      {/* Create (+) Bottom Sheet */}
      <AnimatePresence>
        {isCreateSheetOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
            onClick={() => setIsCreateSheetOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={isRtl ? 'إنشاء محتوى جديد' : 'Create new content'}
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="bg-white dark:bg-slate-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-5 border border-slate-200 dark:border-slate-800 space-y-3 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" aria-hidden="true" />
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-[#112330] dark:text-slate-100">
                  {isRtl ? 'إنشاء' : 'Create'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreateSheetOpen(false)}
                  aria-label={isRtl ? 'إغلاق' : 'Close'}
                  className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateSheetOpen(false);
                    setActiveCreateScreen('new_reel');
                  }}
                  className="w-full min-h-[52px] flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-800 dark:text-slate-100 hover:text-[#087F75] dark:hover:text-teal-300 font-semibold text-sm transition-colors cursor-pointer text-start"
                >
                  <span className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-[#087F75] dark:text-teal-300 flex items-center justify-center shrink-0">
                    <Film className="w-5 h-5" />
                  </span>
                  <span className="flex-1 truncate">{isRtl ? 'ريل جديد' : 'New Reel'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateSheetOpen(false);
                    setActiveCreateScreen('new_post');
                  }}
                  className="w-full min-h-[52px] flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-800 dark:text-slate-100 hover:text-[#087F75] dark:hover:text-teal-300 font-semibold text-sm transition-colors cursor-pointer text-start"
                >
                  <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </span>
                  <span className="flex-1 truncate">{isRtl ? 'منشور مجتمع جديد' : 'New Community Post'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreateSheetOpen(false);
                    setIsCreateStoryOpen(true);
                  }}
                  className="w-full min-h-[52px] flex items-center gap-3.5 px-4 py-3 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-800 dark:text-slate-100 hover:text-[#087F75] dark:hover:text-teal-300 font-semibold text-sm transition-colors cursor-pointer text-start"
                >
                  <span className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-[#087F75] dark:text-teal-300 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5" />
                  </span>
                  <span className="flex-1 truncate">{isRtl ? 'قصة جديدة' : 'New Story'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Existing Story Creation Flow */}
      <CreateStoryModal
        isOpen={isCreateStoryOpen}
        onClose={() => setIsCreateStoryOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={profile}
      />
      {/* Contact Picker Modal (1-on-1) */}
      <ContactPickerModal
        isOpen={isContactPickerOpen}
        onClose={() => setIsContactPickerOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={profile}
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
        isOpen={isSettingsOpen && (mainNavTab === 'chats' || mainNavTab === 'calls')}
        onClose={() => setIsSettingsOpen(false)}
        language={language}
        profile={profile}
        onPhotoSave={onPhotoSave}
        onLanguageChange={onLanguageChange}
        onRestartOnboarding={onRestartOnboarding}
        onUserProfileUpdated={onUserProfileUpdated}
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
              className="bg-white dark:bg-slate-900 w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4 pointer-events-auto"
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
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-900/50 text-[#087F75] dark:text-teal-300 flex items-center justify-center font-bold">
                          {isChannel ? <Radio className="w-5 h-5" /> : isGroup ? <Users className="w-5 h-5" /> : displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{displayName}</h4>
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
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
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
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-700 dark:text-slate-200 hover:text-[#087F75] dark:hover:text-teal-300 font-semibold text-sm transition-colors cursor-pointer text-left"
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isPinned ? 'bg-teal-200 dark:bg-teal-900/60 text-[#087F75] dark:text-teal-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
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
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-950/50 text-slate-700 dark:text-slate-200 hover:text-[#087F75] dark:hover:text-teal-300 font-semibold text-sm transition-colors cursor-pointer text-left"
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isArchived ? 'bg-teal-200 dark:bg-teal-900/60 text-[#087F75] dark:text-teal-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
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

      {/* Invite Modal */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        language={language}
        currentUserId={currentUserId}
        currentUserProfile={profile}
      />

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        language={language}
        onPhotoCaptured={(blob, dataUrl) => {
          setIsCameraModalOpen(false);
          // Optional: handle photo captured directly from header camera if needed
        }}
      />

      {/* Notification Settings Help Modal */}
      <AnimatePresence>
        {isNotificationHelpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" dir={isRtl ? 'rtl' : 'ltr'}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-100 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-[#087F75] dark:text-teal-300 font-extrabold text-base">
                  <BellOff className="w-5 h-5 text-amber-500" />
                  <span>{isRtl ? 'إعدادات التنبيهات' : 'Notification Settings'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNotificationHelpOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {isRtl
                  ? 'تم حظر التنبيهات في إعدادات المتصفح أو النظام. لتلقي مكالمات هاتفية مباشرة من أصدقائك، يرجى تفعيل التنبيهات:'
                  : 'Notifications are currently blocked by browser or system settings. To receive incoming calls, please enable notifications:'}
              </p>

              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 rounded-2xl p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-600 dark:text-amber-400">1.</span>
                  <span>{isRtl ? 'انقر على أيقونة القفل 🔒 أو الإعدادات بجانب عنوان الموقع (URL).' : 'Click the lock 🔒 or site settings icon in your address bar.'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-600 dark:text-amber-400">2.</span>
                  <span>{isRtl ? 'ابحث عن "التنبيهات" (Notifications) وقم بتغييرها إلى "سماح" (Allow).' : 'Find "Notifications" and switch permission to "Allow".'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-600 dark:text-amber-400">3.</span>
                  <span>{isRtl ? 'قم بتحديث الصفحة للتأكد من ربط الخدمة.' : 'Refresh or refocus this tab to complete registration.'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsNotificationHelpOpen(false);
                  if (typeof window !== 'undefined' && 'Notification' in window) {
                    void Notification.requestPermission();
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-[#087F75] text-white font-bold text-xs shadow-xs hover:bg-teal-700 transition-colors cursor-pointer"
              >
                {isRtl ? 'حسناً، فهمت' : 'Got it'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
