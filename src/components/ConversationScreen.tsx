import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Clock,
  User,
  Users,
  Radio,
  Smile,
  MoreVertical,
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  Loader2,
  X,
  Mic,
  Trash2,
  Edit3,
  Info,
  Ban,
  BarChart2,
  Sparkles,
  Timer,
  Lock,
  Phone,
  Globe,
  AlertCircle,
  Pin,
  PinOff,
  Palette,
} from 'lucide-react';
import { translateMessageText, getLanguageName } from '../lib/translation';
import {
  Language,
  UserProfile,
  ChatModel,
  MessageModel,
  PresenceModel,
  StickerItem,
  PollData,
  CallType,
} from '../types';
import {
  subscribeToChatMessages,
  subscribeToSingleChat,
  sendChatMessage,
  sendChatTextMessage,
  setChatTyping,
  markChatAsRead,
  subscribeToUserPresence,
  subscribeToUserProfile,
  toggleBlockUser,
  toggleMessageReaction,
  editChatMessage,
  deleteChatMessageForMe,
  deleteChatMessageForEveryone,
  togglePinMessage,
  voteInPoll,
  getFirebaseDb,
} from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  derive1on1SessionKey,
  decryptGroupSymmetricKey,
  decryptTextContent,
  decryptBlobData,
  encryptBlobData,
} from '../lib/crypto';
import { formatMessageTime, formatPresenceStatus } from '../lib/formatters';
import { compressImage, uploadChatMedia, uploadVoiceNote } from '../lib/media';
import { ChatInfoModal } from './ChatInfoModal';
import { MediaPreviewModal } from './MediaPreviewModal';
import { MediaViewerModal } from './MediaViewerModal';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { VoiceRecorderBar } from './VoiceRecorderBar';
import { ReactionPicker } from './ReactionPicker';
import { MessageContextMenu } from './MessageContextMenu';
import { MessageInfoModal } from './MessageInfoModal';
import { ReactionDetailsModal } from './ReactionDetailsModal';
import { StickerPicker } from './StickerPicker';
import { CreatePollModal } from './CreatePollModal';
import { PollCard } from './PollCard';
import { CallTypeModal } from './CallTypeModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { ChatWallpaperModal } from './ChatWallpaperModal';
import { resolveWallpaperStyle } from '../lib/wallpaperPresets';

interface ConversationScreenProps {
  language: Language;
  chat: ChatModel;
  currentUserProfile: UserProfile;
  onBack: () => void;
  onStartCall?: (
    contact: { id: string; name: string; avatarUrl?: string | null; phone?: string },
    type: CallType
  ) => void;
  onUserProfileUpdated?: (profile: UserProfile) => void;
}

export const ConversationScreen: React.FC<ConversationScreenProps> = ({
  language,
  chat,
  currentUserProfile,
  onBack,
  onStartCall,
  onUserProfileUpdated,
}) => {
  const currentUserId = currentUserProfile.id || `user_${currentUserProfile.phoneNumber.replace(/\D/g, '')}`;
  const isRtl = language === 'ar';
  const isGroup = chat.type === 'group';
  const isChannel = chat.type === 'channel';
  const isOneOnOne = chat.type === '1-1';

  // Check channel admin permissions
  const isChannelAdmin = isChannel
    ? activeChatOwnerOrAdmin(chat, currentUserId)
    : true;

  function activeChatOwnerOrAdmin(c: ChatModel, uid: string) {
    if (c.createdBy === uid || c.ownerId === uid) return true;
    if (c.adminIds && c.adminIds.includes(uid)) return true;
    if (c.participantDetails?.[uid]?.role === 'admin') return true;
    if (c.allowMemberPosts === true) return true;
    return false;
  }

  // 1-on-1 Recipient details
  const recipientId = isGroup || isChannel
    ? ''
    : chat.participants.find((p) => p !== currentUserId) || chat.participants[0] || '';
  const recipientDetails = chat.participantDetails?.[recipientId] || {
    name: isRtl ? 'مستخدم هلا' : 'Hala User',
    avatarUrl: null,
    phone: '',
  };

  // Group / Channel details
  const groupTitle = chat.name || chat.title || (isChannel ? (isRtl ? 'قناة جديدة' : 'Channel') : (isRtl ? 'مجموعة جديدة' : 'Group'));
  const groupAvatar = chat.avatarUrl || null;
  const subscriberCount = chat.subscriberCount || chat.participants.length || 1;

  const [activeChat, setActiveChat] = useState<ChatModel>(chat);
  const [messages, setMessages] = useState<MessageModel[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [otherPresence, setOtherPresence] = useState<PresenceModel | null>(null);

  // State-managed progress for voice note uploads
  const [voiceUploadProgresses, setVoiceUploadProgresses] = useState<Record<string, number>>({});

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Edit message state
  const [editingMessage, setEditingMessage] = useState<MessageModel | null>(null);

  // Blocked user state
  const [blockedUsers, setBlockedUsers] = useState<string[]>(
    currentUserProfile.blockedUsers || []
  );
  const [isBlockedByOther, setIsBlockedByOther] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isBlockingLoading, setIsBlockingLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals and popovers
  const [contextMenuMessage, setContextMenuMessage] = useState<MessageModel | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [messageInfoMessage, setMessageInfoMessage] = useState<MessageModel | null>(null);
  const [reactionDetailsMessage, setReactionDetailsMessage] = useState<MessageModel | null>(null);
  const [isChatInfoOpen, setIsChatInfoOpen] = useState(false);

  // Stickers & Polls
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
  const [isCallTypeModalOpen, setIsCallTypeModalOpen] = useState(false);

  // Attachment and media states
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [selectedMediaFile, setSelectedMediaFile] = useState<{
    fileOrBlob: Blob | File;
    previewUrl: string;
    type: 'image' | 'video';
  } | null>(null);
  const [isMediaPreviewOpen, setIsMediaPreviewOpen] = useState(false);
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState(false);

  // Active chat wallpaper resolution (checks user-specific preference then chat-wide)
  const activeWallpaper =
    activeChat.wallpaperBy?.[currentUserId] || activeChat.wallpaper || 'default';
  const wallpaperInfo = useMemo(() => resolveWallpaperStyle(activeWallpaper), [activeWallpaper]);

  // Full-screen viewer state
  const [viewerMedia, setViewerMedia] = useState<{
    url: string;
    type: 'image' | 'video';
    senderName?: string;
    timestamp?: string;
    caption?: string;
  } | null>(null);

  // E2EE Cryptographic session key state & decrypted maps
  const [conversationKey, setConversationKey] = useState<CryptoKey | null>(null);
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const [decryptedMediaUrls, setDecryptedMediaUrls] = useState<Record<string, string>>({});

  // Auto-Translation state map: [msgId] -> { translatedText, sourceLang, showOriginal, isLoading }
  const [translations, setTranslations] = useState<
    Record<
      string,
      {
        translatedText: string;
        sourceLang: string;
        showOriginal: boolean;
        isLoading: boolean;
      }
    >
  >({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const cameraPickerRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<any>(null);

  // Payload store for retry operations
  const pendingPayloadsRef = useRef<Record<string, {
    type: 'text' | 'voice' | 'image' | 'video';
    text?: string;
    audioBlob?: Blob;
    fileOrBlob?: Blob | File;
    durationSeconds?: number;
    caption?: string;
    previewUrl?: string;
  }>>({});

  // Sync active chat when prop updates
  useEffect(() => {
    setActiveChat(chat);
  }, [chat]);

  // Subscribe to real-time chat document (typing indicators, participant updates, metadata)
  useEffect(() => {
    if (!activeChat.id) return;
    const unsubscribe = subscribeToSingleChat(activeChat.id, (realtimeChat) => {
      if (realtimeChat) {
        setActiveChat((prev) => ({
          ...prev,
          ...realtimeChat,
          participantDetails: {
            ...prev.participantDetails,
            ...realtimeChat.participantDetails,
          },
        }));
      }
    });

    return () => unsubscribe();
  }, [activeChat.id]);

  // Cleanup typing status when leaving screen or unmounting
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (activeChat.id && currentUserId) {
        setChatTyping(activeChat.id, currentUserId, false);
      }
    };
  }, [activeChat.id, currentUserId]);

  // Mark chat as read on open
  useEffect(() => {
    if (activeChat.id && currentUserId) {
      markChatAsRead(activeChat.id, currentUserId, messages);
    }
  }, [activeChat.id, currentUserId]);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!activeChat.id) return;
    const unsubscribe = subscribeToChatMessages(activeChat.id, (realtimeMsgs) => {
      setMessages(realtimeMsgs);
      markChatAsRead(activeChat.id, currentUserId, realtimeMsgs);
    });

    return () => unsubscribe();
  }, [activeChat.id, currentUserId]);

  // Derive / Retrieve E2EE Session Key for Chat
  useEffect(() => {
    let isMounted = true;
    async function initCryptoKey() {
      if (!activeChat.id || !currentUserId) return;

      try {
        if (isOneOnOne) {
          // 1-on-1 Chat Key Exchange
          let peerPubKeyJwk = (recipientDetails as any)?.publicKey;
          if (!peerPubKeyJwk && recipientId) {
            const firestore = getFirebaseDb();
            const userSnap = await getDoc(doc(firestore, 'users_public', recipientId));
            if (userSnap.exists()) {
              peerPubKeyJwk = userSnap.data().public_key;
            }
          }

          if (peerPubKeyJwk) {
            const derivedKey = await derive1on1SessionKey({
              currentUserId,
              peerPublicKeyJwk: peerPubKeyJwk,
              chatId: activeChat.id,
            });
            if (isMounted) setConversationKey(derivedKey);
          }
        } else if (isGroup) {
          // Group Chat Key Exchange
          const grpEncPkg = activeChat.encryptedGroupKeys?.[currentUserId];
          if (grpEncPkg) {
            const decryptedGrpKey = await decryptGroupSymmetricKey({
              currentUserId,
              encryptedPackage: grpEncPkg,
              chatId: activeChat.id,
            });
            if (isMounted && decryptedGrpKey) {
              setConversationKey(decryptedGrpKey);
            }
          }
        }
      } catch (cryptoErr) {
        console.warn('E2EE Session Key Init warning:', cryptoErr);
      }
    }

    initCryptoKey();
    return () => {
      isMounted = false;
    };
  }, [activeChat.id, currentUserId, isOneOnOne, isGroup, recipientId, (recipientDetails as any)?.publicKey]);

  // Decrypt incoming message texts and media array buffers
  useEffect(() => {
    if (!conversationKey || messages.length === 0) return;

    let isMounted = true;
    async function decryptAllMessages() {
      const newDecryptedTexts: Record<string, string> = {};
      const newDecryptedMedia: Record<string, string> = {};

      for (const msg of messages) {
        // Decrypt text content if encrypted
        if (msg.content && msg.content.startsWith('e2ee:v1:')) {
          try {
            const plainText = await decryptTextContent(msg.content, conversationKey);
            if (plainText) {
              newDecryptedTexts[msg.id] = plainText;
            } else {
              newDecryptedTexts[msg.id] = isRtl ? '🔒 لا يمكن فك التشفير' : '🔒 Older messages can’t be decrypted';
            }
          } catch {
            newDecryptedTexts[msg.id] = isRtl ? '🔒 خطأ التشفير' : '🔒 Decryption error';
          }
        }

        // Decrypt caption if encrypted
        if (msg.caption && msg.caption.startsWith('e2ee:v1:')) {
          try {
            const plainCap = await decryptTextContent(msg.caption, conversationKey);
            if (plainCap) {
              newDecryptedTexts[`${msg.id}_caption`] = plainCap;
            }
          } catch {
            newDecryptedTexts[`${msg.id}_caption`] = '';
          }
        }

        // Decrypt media blob arrayBuffer if mediaIv present
        if (msg.mediaIv && msg.content && (msg.content.startsWith('http') || msg.content.startsWith('data:')) && !decryptedMediaUrls[msg.id]) {
          try {
            let arrayBuffer: ArrayBuffer;
            if (msg.content.startsWith('data:')) {
              const base64Parts = msg.content.split(',');
              const base64Data = base64Parts[1] || base64Parts[0];
              const binaryString = window.atob(base64Data);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              arrayBuffer = bytes.buffer;
            } else {
              const res = await fetch(msg.content);
              arrayBuffer = await res.arrayBuffer();
            }
            const mimeType = msg.type === 'video' ? 'video/mp4' : msg.type === 'voice' ? 'audio/webm' : 'image/jpeg';
            const decryptedUrl = await decryptBlobData(arrayBuffer, msg.mediaIv, mimeType, conversationKey);
            if (decryptedUrl) {
              newDecryptedMedia[msg.id] = decryptedUrl;
            }
          } catch (mediaDecErr) {
            console.warn('Failed to decrypt media blob:', mediaDecErr);
          }
        }
      }

      if (isMounted) {
        if (Object.keys(newDecryptedTexts).length > 0) {
          setDecryptedTexts((prev) => ({ ...prev, ...newDecryptedTexts }));
        }
        if (Object.keys(newDecryptedMedia).length > 0) {
          setDecryptedMediaUrls((prev) => ({ ...prev, ...newDecryptedMedia }));
        }
      }
    }

    decryptAllMessages();

    return () => {
      isMounted = false;
    };
  }, [messages, conversationKey, isRtl]);

  // Private messages are never sent to translation services automatically.
  // A future translation action must explain the provider and request explicit opt-in.

  // Disappearing messages live client-side filter trigger every 10 seconds
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to recipient presence (for 1-on-1 chats)
  useEffect(() => {
    if (isGroup || isChannel || !recipientId) return;
    const unsubscribe = subscribeToUserPresence(recipientId, (presence) => {
      setOtherPresence(presence);
    });

    return () => unsubscribe();
  }, [isGroup, isChannel, recipientId]);

  // Real-time listener for current user's profile to sync blockedUsers
  useEffect(() => {
    if (!currentUserId) return;
    const unsub = subscribeToUserProfile(currentUserId, (profile) => {
      if (profile?.blockedUsers) {
        setBlockedUsers(profile.blockedUsers);
      }
    });
    return () => unsub();
  }, [currentUserId]);

  // Recipient block lists are private. Message rules enforce blocking server-side.


  const isBlockedByMe = isOneOnOne && Boolean(recipientId && blockedUsers.includes(recipientId));

  // Toggle block/unblock handler
  const handleToggleBlock = async () => {
    if (!recipientId || !currentUserId || isBlockingLoading) return;
    setIsBlockingLoading(true);
    try {
      const nextBlockedState = !isBlockedByMe;
      await toggleBlockUser({
        currentUserId,
        targetUserId: recipientId,
        isBlocked: nextBlockedState,
      });

      const updatedList = nextBlockedState
        ? Array.from(new Set([...blockedUsers, recipientId]))
        : blockedUsers.filter((id) => id !== recipientId);

      setBlockedUsers(updatedList);
      setIsBlockModalOpen(false);

      const updatedProfile: UserProfile = {
        ...currentUserProfile,
        blockedUsers: updatedList,
      };
      onUserProfileUpdated?.(updatedProfile);

      setToastMessage(
        nextBlockedState
          ? (isRtl ? 'تم حظر المستخدم بنجاح' : 'User blocked successfully')
          : (isRtl ? 'تم إلغاء حظر المستخدم' : 'User unblocked successfully')
      );
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error('Failed to toggle block user:', err);
      setToastMessage(
        isRtl ? 'حدث خطأ أثناء تحديث حالة الحظر' : 'Failed to update block status'
      );
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsBlockingLoading(false);
    }
  };

  // Extract all members currently typing (excluding current user)
  const typingUserIds = useMemo(() => {
    if (!activeChat?.typing || isChannel) return [];
    return activeChat.participants.filter(
      (pid) => pid !== currentUserId && Boolean(activeChat.typing?.[pid])
    );
  }, [activeChat?.typing, activeChat.participants, currentUserId, isChannel]);

  const isOtherTyping = typingUserIds.length > 0;

  // Determine typing label for header
  const typingText = useMemo(() => {
    if (typingUserIds.length === 0) return '';
    if (!isGroup) {
      return isRtl ? 'يكتب الآن...' : 'is typing...';
    }
    if (typingUserIds.length === 1) {
      const typingUser = typingUserIds[0];
      const memberName =
        activeChat.participantDetails?.[typingUser]?.name?.split(' ')[0] ||
        (isRtl ? 'عضو' : 'Member');
      return isRtl ? `${memberName} يكتب الآن...` : `${memberName} is typing...`;
    }
    return isRtl
      ? `${typingUserIds.length} أشخاص يكتبون الآن...`
      : `${typingUserIds.length} people are typing...`;
  }, [typingUserIds, isGroup, isRtl, activeChat.participantDetails]);

  // Auto-scroll to bottom smoothly
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, isOtherTyping]);

  // Handle Typing indicator broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }

    if (activeChat.id && currentUserId && !editingMessage && !isChannel) {
      setChatTyping(activeChat.id, currentUserId, true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setChatTyping(activeChat.id, currentUserId, false);
      }, 2500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Send or Edit Message
  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend || isSending) return;

    if (isBlockedByMe || isBlockedByOther) {
      setToastMessage(
        isBlockedByMe
          ? (isRtl ? 'قم بإلغاء الحظر أولاً لإرسال الرسائل' : 'Unblock user to send messages')
          : (isRtl ? 'لا يمكنك مراسلة هذا المستخدم' : 'Cannot send messages to this contact')
      );
      return;
    }

    // Reset input
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (activeChat.id && currentUserId) {
      setChatTyping(activeChat.id, currentUserId, false);
    }

    // Editing mode
    if (editingMessage) {
      const msgId = editingMessage.id;
      setEditingMessage(null);
      try {
        await editChatMessage({
          chatId: activeChat.id,
          messageId: msgId,
          newContent: textToSend,
        });
      } catch (err) {
        console.warn('Failed to edit message:', err);
      }
      return;
    }

    // Normal new message
    setIsSending(true);
    const tempId = `temp_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const disappearingDuration = activeChat.disappearingMessagesDuration || 0;
    const expiresAt = disappearingDuration > 0
      ? new Date(Date.now() + disappearingDuration * 1000).toISOString()
      : undefined;

    // Cache payload for retry if send fails
    pendingPayloadsRef.current[tempId] = {
      type: 'text',
      text: textToSend,
    };

    const optimisticMessage: MessageModel = {
      id: tempId,
      chatId: activeChat.id,
      senderId: currentUserId,
      senderName: currentUserProfile.name,
      content: textToSend,
      type: 'text',
      status: 'sending',
      timestamp: nowIso,
      expiresAt,
      reactions: {},
      deletedFor: [],
      readBy: { [currentUserId]: nowIso },
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const textSendTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Text message send timed out (15s limit)')), 15000)
      );

      await Promise.race([
        sendChatTextMessage({
          chatId: activeChat.id,
          senderId: currentUserId,
          senderName: currentUserProfile.name,
          content: textToSend,
          disappearingDuration,
          recipientId: isGroup || isChannel ? undefined : recipientId,
          isGroup: isGroup || isChannel,
          otherParticipantIds: activeChat.participants,
          conversationKey,
        }),
        textSendTimeout,
      ]);

      // Successfully sent - clear from retry cache
      delete pendingPayloadsRef.current[tempId];

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))
      );
    } catch (err) {
      console.error('[Text Message Flow] Error sending text message:', err);
      // Mark as failed and keep payload in pendingPayloadsRef for retry
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    } finally {
      setIsSending(false);
    }
  };

  // Send Sticker
  const handleSelectSticker = async (sticker: StickerItem) => {
    setIsStickerPickerOpen(false);
    if (isBlockedByMe || isBlockedByOther) {
      setToastMessage(
        isBlockedByMe
          ? (isRtl ? 'قم بإلغاء الحظر أولاً لإرسال الملصقات' : 'Unblock user to send stickers')
          : (isRtl ? 'لا يمكنك مراسلة هذا المستخدم' : 'Cannot send messages to this contact')
      );
      return;
    }
    const tempId = `sticker_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const disappearingDuration = activeChat.disappearingMessagesDuration || 0;
    const expiresAt = disappearingDuration > 0
      ? new Date(Date.now() + disappearingDuration * 1000).toISOString()
      : undefined;

    const optimisticMessage: MessageModel = {
      id: tempId,
      chatId: activeChat.id,
      senderId: currentUserId,
      senderName: currentUserProfile.name,
      content: sticker.svgOrEmoji,
      stickerUrl: sticker.svgOrEmoji,
      type: 'sticker',
      status: 'sending',
      timestamp: nowIso,
      expiresAt,
      reactions: {},
      deletedFor: [],
      readBy: { [currentUserId]: nowIso },
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      await sendChatMessage({
        chatId: activeChat.id,
        senderId: currentUserId,
        senderName: currentUserProfile.name,
        content: sticker.svgOrEmoji,
        stickerUrl: sticker.svgOrEmoji,
        type: 'sticker',
        disappearingDuration,
        recipientId: isGroup || isChannel ? undefined : recipientId,
        isGroup: isGroup || isChannel,
        otherParticipantIds: activeChat.participants,
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))
      );
    } catch (err) {
      console.warn('Failed to send sticker:', err);
    }
  };

  // Send Poll
  const handleSubmitPoll = async (pollData: PollData) => {
    setIsCreatePollOpen(false);
    if (isBlockedByMe || isBlockedByOther) {
      setToastMessage(
        isBlockedByMe
          ? (isRtl ? 'قم بإلغاء الحظر أولاً لإنشاء استطلاع' : 'Unblock user to create a poll')
          : (isRtl ? 'لا يمكنك مراسلة هذا المستخدم' : 'Cannot send messages to this contact')
      );
      return;
    }
    const tempId = `poll_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const disappearingDuration = activeChat.disappearingMessagesDuration || 0;
    const expiresAt = disappearingDuration > 0
      ? new Date(Date.now() + disappearingDuration * 1000).toISOString()
      : undefined;

    const optimisticMessage: MessageModel = {
      id: tempId,
      chatId: activeChat.id,
      senderId: currentUserId,
      senderName: currentUserProfile.name,
      content: pollData.question,
      pollData,
      type: 'poll',
      status: 'sending',
      timestamp: nowIso,
      expiresAt,
      reactions: {},
      deletedFor: [],
      readBy: { [currentUserId]: nowIso },
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      await sendChatMessage({
        chatId: activeChat.id,
        senderId: currentUserId,
        senderName: currentUserProfile.name,
        content: pollData.question,
        pollData,
        type: 'poll',
        disappearingDuration,
        recipientId: isGroup || isChannel ? undefined : recipientId,
        isGroup: isGroup || isChannel,
        otherParticipantIds: activeChat.participants,
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m))
      );
    } catch (err) {
      console.warn('Failed to send poll:', err);
    }
  };

  // Vote in Poll
  const handleVotePoll = async (messageId: string, optionId: string, allowMultiple: boolean) => {
    try {
      await voteInPoll({
        chatId: activeChat.id,
        messageId,
        optionId,
        userId: currentUserId,
        allowMultiple,
      });
    } catch (err) {
      console.warn('Failed to vote in poll:', err);
    }
  };

  // Send Voice Note Handler
  const handleSendVoiceNote = async (audioBlob: Blob, durationSeconds: number) => {
    setIsRecordingVoice(false);
    setSlideOffset(0);

    if (isBlockedByMe || isBlockedByOther) {
      setToastMessage(
        isBlockedByMe
          ? (isRtl ? 'قم بإلغاء الحظر أولاً لإرسال رسائل صوتية' : 'Unblock user to send voice notes')
          : (isRtl ? 'لا يمكنك مراسلة هذا المستخدم' : 'Cannot send messages to this contact')
      );
      return;
    }

    const tempMessageId = `voice_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const localAudioUrl = URL.createObjectURL(audioBlob);
    const disappearingDuration = activeChat.disappearingMessagesDuration || 0;
    const expiresAt = disappearingDuration > 0
      ? new Date(Date.now() + disappearingDuration * 1000).toISOString()
      : undefined;

    // Save payload to retry cache before starting
    pendingPayloadsRef.current[tempMessageId] = {
      type: 'voice',
      audioBlob,
      durationSeconds,
    };

    const optimisticMessage: MessageModel = {
      id: tempMessageId,
      chatId: activeChat.id,
      senderId: currentUserId,
      senderName: currentUserProfile.name,
      content: localAudioUrl,
      type: 'voice',
      duration: durationSeconds,
      status: 'sending',
      timestamp: nowIso,
      expiresAt,
      uploadProgress: 10, // Initialize with 10% progress immediately
      reactions: {},
      deletedFor: [],
      readBy: { [currentUserId]: nowIso },
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    // Pipeline (a): raw audio blob size/type
    console.log(`[ConversationScreen - Pipeline (a)] Raw audio blob - Size: ${audioBlob.size} bytes, Type: "${audioBlob.type}"`);

    const startOverall = performance.now();
    let startEncryption = performance.now();

    try {
      // Pipeline (b): encrypted blob size/type
      if (conversationKey) {
        try {
          const testEnc = await encryptBlobData(audioBlob, conversationKey);
          if (testEnc) {
            console.log(`[ConversationScreen - Pipeline (b)] Encrypted blob - Size: ${testEnc.encryptedBlob.size} bytes, Type: "${testEnc.encryptedBlob.type}"`);
          } else {
            console.log('[ConversationScreen - Pipeline (b)] Encrypted blob was null/empty.');
          }
        } catch (encErr) {
          console.error('[ConversationScreen - Pipeline (b)] Failed to encrypt audio blob for logging:', encErr);
        }
      } else {
        console.log('[ConversationScreen - Pipeline (b)] Skip encryption log: No active conversationKey.');
      }

      // Pipeline (c): Firestore storage upload request initiation
      console.log(`[ConversationScreen - Pipeline (c)] Firestore storage upload request initiation. Chat ID: "${activeChat.id}", Temp Message ID: "${tempMessageId}"`);
      
      const uploadTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Voice upload timed out (30s limits)')), 30000)
      );

      const uploadRes = await Promise.race([
        uploadVoiceNote({
          chatId: activeChat.id,
          messageId: tempMessageId,
          audioBlob,
          dataUrlFallback: localAudioUrl,
          conversationKey,
          onProgress: (progress) => {
            console.log(`[Voice Note Profiling] Upload progress updated: ${progress}%`);
            setVoiceUploadProgresses((prev) => ({ ...prev, [tempMessageId]: progress }));
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempMessageId ? { ...m, uploadProgress: progress } : m
              )
            );
          },
        }),
        uploadTimeout,
      ]) as { downloadUrl: string; mediaIv?: string };

      const endEncryptionAndUpload = performance.now();
      console.log(`[Voice Note Profiling] Encryption & Storage Upload finished in ${(endEncryptionAndUpload - startEncryption).toFixed(2)}ms`);

      // Step B: Firestore Writing
      const startFirestore = performance.now();
      console.log('[Voice Note Profiling] Writing message document to Firestore via sendChatMessage...');
      await sendChatMessage({
        chatId: activeChat.id,
        senderId: currentUserId,
        senderName: currentUserProfile.name,
        content: uploadRes.downloadUrl,
        type: 'voice',
        duration: durationSeconds,
        disappearingDuration,
        recipientId: isGroup || isChannel ? undefined : recipientId,
        isGroup: isGroup || isChannel,
        otherParticipantIds: activeChat.participants,
        conversationKey,
        mediaIv: uploadRes.mediaIv,
      });

      const endFirestore = performance.now();
      console.log(`[Voice Note Flow - Step d] Firestore message document write SUCCEEDED in ${(endFirestore - startFirestore).toFixed(2)}ms.`);
      console.log(`[Voice Note Profiling] Overall Send Process completed in ${(performance.now() - startOverall).toFixed(2)}ms`);

      // Success - delete from payloads
      delete pendingPayloadsRef.current[tempMessageId];

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMessageId ? { ...m, content: uploadRes.downloadUrl, status: 'sent', uploadProgress: 100 } : m
        )
      );
    } catch (err) {
      console.error('[ConversationScreen - Pipeline (d)] Final caught error object in handleSendVoiceNote:', err);
      // Map to failed state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMessageId ? { ...m, status: 'failed', uploadProgress: undefined } : m
        )
      );
    }
  };

  // Voice button Pointer & Drag handlers
  const handleVoicePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    setSlideOffset(0);
    setIsRecordingVoice(true);
  };

  const handleVoicePointerMove = (e: React.PointerEvent) => {
    if (!isRecordingVoice || !touchStartPosRef.current) return;
    const currentX = e.clientX;
    const startX = touchStartPosRef.current.x;
    const diff = currentX - startX;

    const cancelOffset = isRtl ? Math.max(0, diff) : Math.min(0, diff);
    setSlideOffset(cancelOffset);

    if (Math.abs(cancelOffset) > 70) {
      setIsRecordingVoice(false);
      setSlideOffset(0);
      touchStartPosRef.current = null;
    }
  };

  // Reaction Selection Handler
  const handleSelectReaction = async (message: MessageModel, emoji: string) => {
    setReactionPickerMessageId(null);
    try {
      await toggleMessageReaction({
        chatId: activeChat.id,
        messageId: message.id,
        emoji,
        userId: currentUserId,
      });
    } catch (err) {
      console.warn('Failed to toggle reaction:', err);
    }
  };

  // Delete message handlers
  const handleDeleteForMe = async (message: MessageModel) => {
    try {
      const isTemp = message.id.startsWith('temp_') || message.id.startsWith('voice_') || message.id.startsWith('media_');
      if (!isTemp && message.status !== 'failed' && message.status !== 'sending') {
        await deleteChatMessageForMe({
          chatId: activeChat.id,
          messageId: message.id,
          userId: currentUserId,
        });
      }
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      // Also clear from retry cache if present
      delete pendingPayloadsRef.current[message.id];
    } catch (err) {
      console.warn('Error deleting message for me:', err);
      // Fallback: delete locally anyway
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    }
  };

  const handleDeleteForEveryone = async (message: MessageModel) => {
    try {
      const isLast = messages[messages.length - 1]?.id === message.id;
      const deletedPlaceholder = isRtl ? 'تم حذف هذه الرسالة' : 'This message was deleted';
      await deleteChatMessageForEveryone({
        chatId: activeChat.id,
        messageId: message.id,
        deletedText: deletedPlaceholder,
        isLastMessage: isLast,
      });
    } catch (err) {
      console.warn('Error deleting message for everyone:', err);
    }
  };

  // Pin / Unpin message handler
  const handleTogglePinMessage = async (message: MessageModel) => {
    const willPin = !message.isPinned;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              isPinned: willPin,
              pinnedAt: willPin ? new Date().toISOString() : undefined,
              pinnedBy: willPin ? currentUserId : undefined,
            }
          : m
      )
    );

    try {
      await togglePinMessage({
        chatId: activeChat.id,
        messageId: message.id,
        userId: currentUserId,
        isPinned: willPin,
      });
    } catch (err) {
      console.warn('Error toggling pin message:', err);
    }
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(messageId);
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2500);
    }
  };

  // Long-press detection for selecting emoji reaction & message context menu
  const handleTouchStartMessage = (msg: MessageModel) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(30);
        } catch {
          // ignore
        }
      }
      setReactionPickerMessageId(msg.id);
      setContextMenuMessage(msg);
    }, 380);
  };

  const handleTouchEndMessage = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Handle File Input from Photo/Video or Camera
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAttachmentMenuOpen(false);

    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');

    if (isImage) {
      try {
        const { blob, dataUrl } = await compressImage(file, 1440, 1440, 0.78);
        setSelectedMediaFile({
          fileOrBlob: blob,
          previewUrl: dataUrl,
          type: 'image',
        });
        setIsMediaPreviewOpen(true);
      } catch (err) {
        console.warn('Image compression fallback:', err);
        const dataUrl = URL.createObjectURL(file);
        setSelectedMediaFile({
          fileOrBlob: file,
          previewUrl: dataUrl,
          type: 'image',
        });
        setIsMediaPreviewOpen(true);
      }
    } else if (isVideo) {
      const dataUrl = URL.createObjectURL(file);
      setSelectedMediaFile({
        fileOrBlob: file,
        previewUrl: dataUrl,
        type: 'video',
      });
      setIsMediaPreviewOpen(true);
    }

    if (filePickerRef.current) filePickerRef.current.value = '';
    if (cameraPickerRef.current) cameraPickerRef.current.value = '';
  };

  // Handle Photo Captured via In-App Camera Modal
  const handlePhotoCaptured = async (blob: Blob, dataUrl: string) => {
    if (isBlockedByMe || isBlockedByOther) {
      setToastMessage(
        isBlockedByMe
          ? (isRtl ? 'قم بإلغاء الحظر أولاً لإرسال الصور' : 'Unblock user to send photos')
          : (isRtl ? 'لا يمكنك مراسلة هذا المستخدم' : 'Cannot send messages to this contact')
      );
      return;
    }

    try {
      const compressed = await compressImage(blob, 1440, 1440, 0.82);
      setSelectedMediaFile({
        fileOrBlob: compressed.blob,
        previewUrl: compressed.dataUrl,
        type: 'image',
      });
    } catch {
      setSelectedMediaFile({
        fileOrBlob: blob,
        previewUrl: dataUrl,
        type: 'image',
      });
    }
    setIsMediaPreviewOpen(true);
  };

  // Send Media Message after Preview Confirmation
  const handleSendMedia = async (caption: string) => {
    if (!selectedMediaFile) return;

    if (isBlockedByMe || isBlockedByOther) {
      setIsMediaPreviewOpen(false);
      setSelectedMediaFile(null);
      setToastMessage(
        isBlockedByMe
          ? (isRtl ? 'قم بإلغاء الحظر أولاً لإرسال الوسائط' : 'Unblock user to send media')
          : (isRtl ? 'لا يمكنك مراسلة هذا المستخدم' : 'Cannot send messages to this contact')
      );
      return;
    }

    const media = selectedMediaFile;
    setIsMediaPreviewOpen(false);
    setSelectedMediaFile(null);

    const tempMessageId = `media_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const disappearingDuration = activeChat.disappearingMessagesDuration || 0;
    const expiresAt = disappearingDuration > 0
      ? new Date(Date.now() + disappearingDuration * 1000).toISOString()
      : undefined;

    // Save to payload retry store
    pendingPayloadsRef.current[tempMessageId] = {
      type: media.type,
      fileOrBlob: media.fileOrBlob,
      previewUrl: media.previewUrl,
      caption,
    };

    const optimisticMessage: MessageModel = {
      id: tempMessageId,
      chatId: activeChat.id,
      senderId: currentUserId,
      senderName: currentUserProfile.name,
      content: media.previewUrl,
      caption: caption || undefined,
      type: media.type,
      status: 'sending',
      timestamp: nowIso,
      expiresAt,
      uploadProgress: 15,
      reactions: {},
      deletedFor: [],
      readBy: { [currentUserId]: nowIso },
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const uploadTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Media upload timed out (30s limits)')), 30000)
      );

      const uploadRes = await Promise.race([
        uploadChatMedia({
          chatId: activeChat.id,
          messageId: tempMessageId,
          fileOrBlob: media.fileOrBlob,
          dataUrlFallback: media.previewUrl,
          conversationKey,
          onProgress: (progress) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempMessageId ? { ...m, uploadProgress: progress } : m
              )
            );
          },
        }),
        uploadTimeout,
      ]) as { downloadUrl: string; mediaIv?: string };

      await sendChatMessage({
        chatId: activeChat.id,
        senderId: currentUserId,
        senderName: currentUserProfile.name,
        content: uploadRes.downloadUrl,
        caption: caption || undefined,
        type: media.type,
        disappearingDuration,
        recipientId: isGroup || isChannel ? undefined : recipientId,
        isGroup: isGroup || isChannel,
        otherParticipantIds: activeChat.participants,
        conversationKey,
        mediaIv: uploadRes.mediaIv,
      });

      // Clear from payload cache on success
      delete pendingPayloadsRef.current[tempMessageId];

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMessageId
            ? { ...m, content: uploadRes.downloadUrl, status: 'sent', uploadProgress: 100 }
            : m
        )
      );
    } catch (err) {
      console.warn('Error sending media:', err);
      // Map to failed state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMessageId ? { ...m, status: 'failed', uploadProgress: undefined } : m
        )
      );
    }
  };

  // Retry Failed Message Handler
  const handleRetryMessage = async (messageId: string) => {
    let payload = pendingPayloadsRef.current[messageId];
    if (!payload) {
      const msg = messages.find((m) => m.id === messageId);
      if (msg && msg.type === 'text' && msg.content) {
        payload = { type: 'text', text: msg.content };
        pendingPayloadsRef.current[messageId] = payload;
      } else {
        console.warn('[Retry] No cached payload found for message:', messageId);
        return;
      }
    }

    console.log('[Retry] Retrying message send:', messageId, payload);

    // Transition back to sending state
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, status: 'sending', uploadProgress: payload.type === 'voice' ? 10 : 15 }
          : m
      )
    );

    const disappearingDuration = activeChat.disappearingMessagesDuration || 0;

    if (payload.type === 'text' && payload.text) {
      const textToSend = payload.text;
      try {
        const textSendTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Text message retry timed out (15s limit)')), 15000)
        );

        await Promise.race([
          sendChatTextMessage({
            chatId: activeChat.id,
            senderId: currentUserId,
            senderName: currentUserProfile.name,
            content: textToSend,
            disappearingDuration,
            recipientId: isGroup || isChannel ? undefined : recipientId,
            isGroup: isGroup || isChannel,
            otherParticipantIds: activeChat.participants,
            conversationKey,
          }),
          textSendTimeout,
        ]);

        delete pendingPayloadsRef.current[messageId];

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'sent' } : m))
        );
      } catch (err) {
        console.error('[Retry Text Message Flow] Failed retry send for text message:', err);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'failed' } : m))
        );
      }
    } else if (payload.type === 'voice' && payload.audioBlob) {
      const audioBlob = payload.audioBlob;
      const durationSeconds = payload.durationSeconds || 0;
      const localAudioUrl = URL.createObjectURL(audioBlob);

      // Pipeline (a): raw audio blob size/type
      console.log(`[ConversationScreen - Retry Pipeline (a)] Raw audio blob - Size: ${audioBlob.size} bytes, Type: "${audioBlob.type}"`);

      try {
        // Pipeline (b): encrypted blob size/type
        if (conversationKey) {
          try {
            const testEnc = await encryptBlobData(audioBlob, conversationKey);
            if (testEnc) {
              console.log(`[ConversationScreen - Retry Pipeline (b)] Encrypted blob - Size: ${testEnc.encryptedBlob.size} bytes, Type: "${testEnc.encryptedBlob.type}"`);
            } else {
              console.log('[ConversationScreen - Retry Pipeline (b)] Encrypted blob was null/empty.');
            }
          } catch (encErr) {
            console.error('[ConversationScreen - Retry Pipeline (b)] Failed to encrypt audio blob for logging:', encErr);
          }
        } else {
          console.log('[ConversationScreen - Retry Pipeline (b)] Skip encryption log: No active conversationKey.');
        }

        // Pipeline (c): Firestore storage upload request initiation
        console.log(`[ConversationScreen - Retry Pipeline (c)] Firestore storage upload request initiation. Chat ID: "${activeChat.id}", Message ID: "${messageId}"`);

        const uploadTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Voice upload retry timed out (30s limit)')), 30000)
        );

        const uploadRes = await Promise.race([
          uploadVoiceNote({
            chatId: activeChat.id,
            messageId,
            audioBlob,
            dataUrlFallback: localAudioUrl,
            conversationKey,
            onProgress: (progress) => {
              setVoiceUploadProgresses((prev) => ({ ...prev, [messageId]: progress }));
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? { ...m, uploadProgress: progress } : m
                )
              );
            },
          }),
          uploadTimeout,
        ]) as { downloadUrl: string; mediaIv?: string };

        await sendChatMessage({
          chatId: activeChat.id,
          senderId: currentUserId,
          senderName: currentUserProfile.name,
          content: uploadRes.downloadUrl,
          type: 'voice',
          duration: durationSeconds,
          disappearingDuration,
          recipientId: isGroup || isChannel ? undefined : recipientId,
          isGroup: isGroup || isChannel,
          otherParticipantIds: activeChat.participants,
          conversationKey,
          mediaIv: uploadRes.mediaIv,
        });

        // Delete cache upon retry success
        delete pendingPayloadsRef.current[messageId];

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: uploadRes.downloadUrl, status: 'sent', uploadProgress: 100 } : m
          )
        );
      } catch (err) {
        console.error('[ConversationScreen - Retry Pipeline (d)] Final caught error object in retry handler:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: 'failed', uploadProgress: undefined } : m
          )
        );
      }
    } else if ((payload.type === 'image' || payload.type === 'video') && payload.fileOrBlob) {
      const fileOrBlob = payload.fileOrBlob;
      const previewUrl = payload.previewUrl || '';
      const caption = payload.caption || '';

      try {
        const uploadTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Media upload retry timed out (30s limit)')), 30000)
        );

        const uploadRes = await Promise.race([
          uploadChatMedia({
            chatId: activeChat.id,
            messageId,
            fileOrBlob,
            dataUrlFallback: previewUrl,
            conversationKey,
            onProgress: (progress) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId ? { ...m, uploadProgress: progress } : m
                )
              );
            },
          }),
          uploadTimeout,
        ]) as { downloadUrl: string; mediaIv?: string };

        await sendChatMessage({
          chatId: activeChat.id,
          senderId: currentUserId,
          senderName: currentUserProfile.name,
          content: uploadRes.downloadUrl,
          caption: caption || undefined,
          type: payload.type,
          disappearingDuration,
          recipientId: isGroup || isChannel ? undefined : recipientId,
          isGroup: isGroup || isChannel,
          otherParticipantIds: activeChat.participants,
          conversationKey,
          mediaIv: uploadRes.mediaIv,
        });

        // Delete cache upon retry success
        delete pendingPayloadsRef.current[messageId];

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: uploadRes.downloadUrl, status: 'sent', uploadProgress: 100 } : m
          )
        );
      } catch (err) {
        console.warn('[Retry] Failed media upload retry:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: 'failed', uploadProgress: undefined } : m
          )
        );
      }
    }
  };

  // Map messages to auto-resolve orphaned/stuck 'sending' states
  const resolvedMessages = messages.map((m) => {
    if (m.status === 'sending') {
      const msgTime = new Date(m.timestamp).getTime();
      const isOlderThan15s = !isNaN(msgTime) && (Date.now() - msgTime > 15000);
      if (!pendingPayloadsRef.current[m.id] || isOlderThan15s) {
        return { ...m, status: 'failed' as const };
      }
    }
    return m;
  });

  // Filter messages deleted for current user and filter out expired disappearing messages
  const visibleMessages = resolvedMessages.filter((m) => {
    if (m.deletedFor?.includes(currentUserId)) return false;
    if (m.expiresAt) {
      const isExpired = new Date(m.expiresAt).getTime() <= Date.now();
      if (isExpired) return false;
    }
    return true;
  });

  // Pinned messages list
  const pinnedMessages = visibleMessages.filter((m) => Boolean(m.isPinned) && !m.isDeletedForEveryone);

  // Render Status Checkmarks
  const renderStatusIcon = (msg: MessageModel) => {
    if (msg.status === 'sending') {
      return (
        <span title={isRtl ? 'جاري الإرسال...' : 'Sending...'}>
          <Clock className="w-3 h-3 text-white/70 inline animate-spin" />
        </span>
      );
    }

    if (msg.status === 'failed') {
      return (
        <span title={isRtl ? 'فشل الإرسال. اضغط لإعادة المحاولة' : 'Failed to send. Tap to retry.'}>
          <AlertCircle className="w-3.5 h-3.5 text-red-300 inline cursor-pointer animate-pulse" />
        </span>
      );
    }

    // Determine read status and timestamp from Firestore read receipts
    let isRead = false;
    let readTimeStr = '';

    if (msg.status === 'read') {
      isRead = true;
    }

    if (isOneOnOne && recipientId && msg.readBy && msg.readBy[recipientId]) {
      isRead = true;
      try {
        const d = new Date(msg.readBy[recipientId]);
        readTimeStr = d.toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        readTimeStr = '';
      }
    } else if (isGroup && msg.readBy) {
      const otherReadIds = Object.keys(msg.readBy).filter((id) => id !== currentUserId);
      if (otherReadIds.length > 0) {
        isRead = true;
        try {
          const firstOtherTime = msg.readBy[otherReadIds[0]];
          if (firstOtherTime) {
            const d = new Date(firstOtherTime);
            readTimeStr = d.toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
            });
          }
        } catch {
          readTimeStr = '';
        }
      }
    }

    // Double Blue Check for Read status
    if (isRead) {
      const readTooltip = readTimeStr
        ? (isRtl ? `تمت القراءة: ${readTimeStr}` : `Read: ${readTimeStr}`)
        : (isRtl ? 'تمت القراءة' : 'Read');

      return (
        <span title={readTooltip} className="inline-flex items-center">
          <CheckCheck className="w-3.5 h-3.5 text-sky-300 drop-shadow-[0_0_2px_rgba(56,189,248,0.6)] inline transition-all" />
        </span>
      );
    }

    // Single Check for Delivered status using Firestore timestamp
    const deliveredTime = msg.timestamp ? formatMessageTime(msg.timestamp, language) : '';
    const deliveredTooltip = deliveredTime
      ? (isRtl ? `تم التسليم: ${deliveredTime}` : `Delivered: ${deliveredTime}`)
      : (isRtl ? 'تم التسليم' : 'Delivered');

    return (
      <span title={deliveredTooltip} className="inline-flex items-center">
        <Check className="w-3.5 h-3.5 text-white/80 inline" />
      </span>
    );
  };

  // Header Subtitle status text
  const statusText = isChannel
    ? `${subscriberCount} ${isRtl ? 'مشترك' : 'Subscribers'}`
    : isGroup
    ? `${activeChat.participants.length} ${isRtl ? 'أعضاء' : 'Members'}`
    : formatPresenceStatus(otherPresence?.online, otherPresence?.lastSeen, isOtherTyping, language);

  // Disappearing messages label
  const disappearingDurationSeconds = activeChat.disappearingMessagesDuration || 0;
  const disappearingLabel =
    disappearingDurationSeconds === 86400
      ? isRtl ? '24 ساعة' : '24 hours'
      : disappearingDurationSeconds === 604800
      ? isRtl ? '7 أيام' : '7 days'
      : disappearingDurationSeconds === 7776000
      ? isRtl ? '90 يوماً' : '90 days'
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: isRtl ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isRtl ? -20 : 20 }}
      transition={{ duration: 0.18 }}
      className="w-full h-full flex flex-col justify-between bg-slate-50 text-slate-900 min-h-[580px] relative overflow-hidden select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={() => {
        setIsAttachmentMenuOpen(false);
        setReactionPickerMessageId(null);
        setIsStickerPickerOpen(false);
      }}
    >
      {/* Hidden File and Camera Inputs */}
      <input
        type="file"
        ref={filePickerRef}
        onChange={handleFileSelected}
        accept="image/*,video/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraPickerRef}
        onChange={handleFileSelected}
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
      />

      {/* Top Header */}
      <header className="bg-white px-4 py-3 border-b border-slate-200/80 shadow-2xs flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Back Button */}
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label={isRtl ? 'رجوع' : 'Back'}
          >
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>

          {/* Avatar & Title Clickable area */}
          <button
            type="button"
            onClick={() => setIsChatInfoOpen(true)}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-2xs overflow-hidden text-sm ${
                  isChannel
                    ? 'bg-gradient-to-tr from-[#087F75] to-teal-400'
                    : isGroup
                    ? 'bg-gradient-to-tr from-amber-500 to-[#087F75]'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {isChannel ? (
                  groupAvatar ? (
                    <img src={groupAvatar} alt={groupTitle} className="w-full h-full object-cover" />
                  ) : (
                    <Radio className="w-5 h-5" />
                  )
                ) : isGroup ? (
                  groupAvatar ? (
                    <img src={groupAvatar} alt={groupTitle} className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-5 h-5" />
                  )
                ) : recipientDetails.avatarUrl ? (
                  <img
                    src={recipientDetails.avatarUrl}
                    alt={recipientDetails.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{recipientDetails.name.charAt(0).toUpperCase()}</span>
                )}
              </div>

              {!isGroup && !isChannel && (
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white rounded-full transition-colors shadow-2xs ${
                    otherPresence?.online ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  title={otherPresence?.online ? (isRtl ? 'متصل الآن' : 'Online') : (isRtl ? 'غير متصل' : 'Offline')}
                />
              )}
            </div>

            {/* Title & Subtitle */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-slate-900 text-sm truncate leading-tight">
                  {isChannel ? groupTitle : isGroup ? groupTitle : recipientDetails.name}
                </h3>
                {isChannel ? (
                  <span className="shrink-0 px-1.5 py-0.2 rounded-md bg-teal-100 text-[#087F75] text-[9px] font-bold">
                    {isRtl ? 'قناة' : 'Channel'}
                  </span>
                ) : (
                  <span
                    className="shrink-0 px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[9px] font-bold flex items-center gap-0.5"
                    title={isRtl ? 'محادثة خاصة' : 'Private chat'}
                  >
                    <Lock className="w-2.5 h-2.5" />
                    <span>{isRtl ? 'خاصة' : 'Private'}</span>
                  </span>
                )}
              </div>
              {isOtherTyping ? (
                <div className="flex items-center gap-1.5 text-[#087F75] font-semibold text-xs animate-pulse">
                  <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                    <span className="w-1 h-1 rounded-full bg-[#087F75] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-1 rounded-full bg-[#087F75] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-1 rounded-full bg-[#087F75] animate-bounce" />
                  </span>
                  <span className="truncate">{typingText}</span>
                </div>
              ) : isOneOnOne ? (
                <div className="flex items-center gap-1.5 text-xs truncate">
                  {otherPresence?.online ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                      <span className="text-emerald-600 font-semibold">{isRtl ? 'متصل الآن' : 'Online'}</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-slate-400 truncate">{statusText}</span>
                    </>
                  )}
                </div>
              ) : (
                <p
                  className={`text-xs truncate transition-colors ${
                    isChannel
                      ? 'text-[#087F75] font-medium'
                      : 'text-slate-400 font-medium'
                  }`}
                >
                  {statusText}
                </p>
              )}
            </div>
          </button>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1">
          {/* 1-on-1 Calling Buttons */}
          {isOneOnOne && onStartCall && !isBlockedByMe && (
            <>
              <button
                type="button"
                onClick={() => {
                  onStartCall(
                    {
                      id: recipientId,
                      name: recipientDetails.name,
                      avatarUrl: recipientDetails.avatarUrl,
                      phone: recipientDetails.phone,
                    },
                    'video'
                  );
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:text-[#087F75] hover:bg-teal-50 transition-colors cursor-pointer"
                title={isRtl ? 'مكالمة فيديو' : 'Video Call'}
                aria-label={isRtl ? 'مكالمة فيديو' : 'Video Call'}
              >
                <VideoIcon className="w-4.5 h-4.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsCallTypeModalOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                title={isRtl ? 'خيارات الاتصال' : 'Call Options'}
                aria-label={isRtl ? 'خيارات الاتصال' : 'Call Options'}
              >
                <Phone className="w-4.5 h-4.5" />
              </button>
            </>
          )}

          {disappearingLabel && (
            <div
              className="px-2 py-1 bg-teal-50 border border-[#087F75]/30 rounded-lg text-[10px] font-bold text-[#087F75] flex items-center gap-1 cursor-pointer"
              onClick={() => setIsChatInfoOpen(true)}
              title={isRtl ? `الرسائل تختفي بعد ${disappearingLabel}` : `Messages disappear after ${disappearingLabel}`}
            >
              <Timer className="w-3 h-3" />
              <span>{disappearingLabel}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsChatInfoOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title={isRtl ? 'خيارات المحادثة' : 'Chat Info'}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Pinned Messages Banner & Scrollable Strip */}
      {pinnedMessages.length > 0 && (
        <div className="bg-white/95 backdrop-blur-xs border-b border-teal-200/80 shadow-2xs px-3 py-2 z-10 shrink-0 flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0 text-[#087F75] font-semibold text-xs px-1">
            <Pin className="w-3.5 h-3.5 fill-[#087F75]" />
            <span className="hidden sm:inline">
              {isRtl ? 'رسائل مثبتة' : 'Pinned'}
            </span>
            {pinnedMessages.length > 1 && (
              <span className="w-4.5 h-4.5 rounded-full bg-teal-100 text-[#087F75] text-[10px] font-bold flex items-center justify-center">
                {pinnedMessages.length}
              </span>
            )}
          </div>

          {/* Scrollable strip of pinned messages */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth flex-1 py-0.5">
            {pinnedMessages.map((pMsg) => {
              const pSender = pMsg.senderId === currentUserId
                ? (isRtl ? 'أنت' : 'You')
                : (pMsg.senderName || activeChat.participantDetails?.[pMsg.senderId]?.name || (isRtl ? 'عضو' : 'Member'));
              
              let previewText = decryptedTexts[pMsg.id] || pMsg.content || '';
              if (pMsg.type === 'image') previewText = isRtl ? '📷 صورة' : '📷 Photo';
              else if (pMsg.type === 'video') previewText = isRtl ? '🎥 فيديو' : '🎥 Video';
              else if (pMsg.type === 'voice') previewText = isRtl ? '🎙️ رسالة صوتية' : '🎙️ Voice message';
              else if (pMsg.type === 'sticker') previewText = isRtl ? '🎨 ملصق' : '🎨 Sticker';
              else if (pMsg.type === 'poll') previewText = isRtl ? '📊 استطلاع' : '📊 Poll';
              else if (previewText.startsWith('e2ee:v1:')) previewText = isRtl ? '🔒 رسالة مشفرة' : '🔒 Encrypted message';

              return (
                <div
                  key={pMsg.id}
                  onClick={() => handleJumpToMessage(pMsg.id)}
                  className="group flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100/90 border border-teal-200/70 text-slate-800 text-xs transition-all cursor-pointer shrink-0 max-w-[210px] sm:max-w-[260px] shadow-2xs"
                  title={isRtl ? 'اضغط للانتقال إلى الرسالة' : 'Click to jump to message'}
                >
                  <div className="w-1 h-5 rounded-full bg-[#087F75] shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1 text-left" dir={isRtl ? 'rtl' : 'ltr'}>
                    <span className="font-bold text-[11px] text-[#087F75] truncate leading-tight">
                      {pSender}
                    </span>
                    <span className="text-[11px] text-slate-600 truncate leading-tight">
                      {previewText}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePinMessage(pMsg);
                    }}
                    className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 ml-0.5"
                    title={isRtl ? 'إلغاء التثبيت' : 'Unpin'}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Message Area */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 transition-colors duration-200"
        style={wallpaperInfo.style}
      >
        {/* Disappearing Messages & Security Indicator Banner */}
        {!isChannel && (
          <div className="flex justify-center my-1">
            <div className="px-3 py-1.5 bg-emerald-50/90 border border-emerald-200/80 text-emerald-800 rounded-xl text-[11px] font-medium max-w-sm text-center leading-snug flex items-center justify-center gap-1.5 shadow-2xs">
              <Lock className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>
                {isRtl
                  ? 'المحادثة متاحة لأعضائها فقط. لا تشارك روابط الملفات الخاصة خارج المحادثة.'
                  : 'Chat access is limited to its members. Keep private file links within the chat.'}
              </span>
            </div>
          </div>
        )}

        {disappearingLabel && (
          <div className="flex justify-center my-1">
            <div
              onClick={() => setIsChatInfoOpen(true)}
              className="px-3 py-1.5 bg-teal-50 border border-teal-200/80 text-[#087F75] rounded-xl text-[11px] font-bold max-w-sm text-center leading-snug flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs hover:bg-teal-100/70 transition-colors"
            >
              <Timer className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isRtl
                  ? `الرسائل ذاتية الاختفاء مفعلة (${disappearingLabel})`
                  : `Disappearing messages enabled (${disappearingLabel})`}
              </span>
            </div>
          </div>
        )}

        {/* Message List */}
        {visibleMessages.map((msg, index) => {
          const isOwn = msg.senderId === currentUserId;
          const showTime = formatMessageTime(msg.timestamp, language);
          const isMedia = msg.type === 'image' || msg.type === 'video';
          const isVoice = msg.type === 'voice';
          const isSticker = msg.type === 'sticker';
          const isPoll = msg.type === 'poll';
          const isDeleted = msg.isDeletedForEveryone;

          // Non-empty reactions list
          const activeReactions = msg.reactions
            ? Object.entries(msg.reactions).filter(([_, uids]) => Array.isArray(uids) && uids.length > 0)
            : [];

          // Sender display name for group/channel chats
          const senderDisplayName =
            msg.senderName ||
            activeChat.participantDetails?.[msg.senderId]?.name ||
            (isRtl ? 'عضو' : 'Member');

          // Decrypted content resolution
          const decryptedText = decryptedTexts[msg.id];
          const rawContent = msg.content || '';
          const displayContent =
            decryptedText ||
            (rawContent.startsWith('e2ee:v1:')
              ? isRtl
                ? '🔒 لا يمكن فك التشفير'
                : '🔒 Encrypted message'
              : rawContent);

          const decryptedCaption = decryptedTexts[`${msg.id}_caption`];
          const rawCaption = msg.caption || '';
          const displayCaption =
            decryptedCaption || (rawCaption.startsWith('e2ee:v1:') ? '' : rawCaption);

          const displayMediaUrl = decryptedMediaUrls[msg.id] || msg.content;

          return (
            <motion.div
              id={`msg-${msg.id}`}
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15 }}
              className={`flex flex-col w-full relative ${
                isOwn
                  ? isRtl
                    ? 'items-start'
                    : 'items-end'
                  : isRtl
                  ? 'items-end'
                  : 'items-start'
              }`}
            >
              {/* Message Content Container */}
              <div
                className={`relative group max-w-[85%] sm:max-w-[72%] transition-all duration-300 ${
                  highlightedMessageId === msg.id
                    ? 'ring-4 ring-[#087F75]/70 ring-offset-2 ring-offset-teal-50 rounded-2xl scale-[1.02]'
                    : ''
                }`}
                onTouchStart={() => handleTouchStartMessage(msg)}
                onTouchEnd={handleTouchEndMessage}
                onPointerDown={(e) => {
                  if (e.button === 0) handleTouchStartMessage(msg);
                }}
                onPointerUp={handleTouchEndMessage}
                onPointerLeave={handleTouchEndMessage}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setReactionPickerMessageId(msg.id);
                  setContextMenuMessage(msg);
                }}
              >
                {/* Reaction Picker Floating Popover */}
                <AnimatePresence>
                  {reactionPickerMessageId === msg.id && (
                    <ReactionPicker
                      onSelectEmoji={(emoji) => handleSelectReaction(msg, emoji)}
                      onClose={() => setReactionPickerMessageId(null)}
                      currentUserReaction={
                        Object.entries(msg.reactions || {}).find(([_, uids]) =>
                          Array.isArray(uids) && uids.includes(currentUserId)
                        )?.[0]
                      }
                      isOwn={isOwn}
                    />
                  )}
                </AnimatePresence>

                {/* STICKER RENDERING */}
                {isSticker && !isDeleted ? (
                  <div className="flex flex-col items-center p-1">
                    {/* Sender Name for Groups/Channels */}
                    {(isGroup || isChannel) && !isOwn && (
                      <span className="text-[11px] font-bold text-[#087F75] truncate block mb-1">
                        {senderDisplayName}
                      </span>
                    )}
                    <motion.div
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.95 }}
                      className="text-6xl sm:text-7xl select-none filter drop-shadow-md py-1 cursor-pointer transition-transform"
                    >
                      {msg.stickerUrl || msg.content}
                    </motion.div>

                    {/* Timestamp & Timer pill */}
                    <div
                      className="flex items-center gap-1 mt-0.5 px-2 py-0.5 bg-slate-900/40 text-white rounded-full text-[10px] select-none shadow-xs"
                      dir="ltr"
                    >
                      {msg.expiresAt && <Timer className="w-3 h-3 text-teal-300" />}
                      <span>{showTime}</span>
                      {isOwn && renderStatusIcon(msg)}
                    </div>
                  </div>
                ) : isPoll && !isDeleted && msg.pollData ? (
                  /* POLL RENDERING */
                  <div className="space-y-1">
                    {(isGroup || isChannel) && !isOwn && (
                      <span className="text-[11px] font-bold text-[#087F75] truncate block px-1">
                        {senderDisplayName}
                      </span>
                    )}
                    <PollCard
                      pollData={msg.pollData}
                      messageId={msg.id}
                      chatId={activeChat.id}
                      currentUserId={currentUserId}
                      language={language}
                      onVote={(optId) => handleVotePoll(msg.id, optId, Boolean(msg.pollData?.allowMultiple))}
                    />
                    <div
                      className={`flex items-center gap-1 px-1 text-[10px] text-slate-400 ${
                        isOwn ? 'justify-end' : 'justify-start'
                      }`}
                      dir="ltr"
                    >
                      {msg.expiresAt && <Timer className="w-3 h-3 text-amber-500 mr-0.5" />}
                      <span>{showTime}</span>
                      {isOwn && renderStatusIcon(msg)}
                    </div>
                  </div>
                ) : (
                  /* STANDARD BUBBLE RENDERING */
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm shadow-xs transition-shadow ${
                      isDeleted
                        ? 'bg-slate-200/80 text-slate-500 italic border border-slate-300'
                        : msg.status === 'failed'
                        ? 'bg-rose-50 text-rose-900 border border-rose-300 rounded-br-xs'
                        : isOwn
                        ? 'bg-[#087F75] text-white rounded-br-xs shadow-[#087F75]/20'
                        : 'bg-white text-slate-900 rounded-bl-xs border border-slate-200/80'
                    }`}
                  >
                    {/* Sender Name for Groups and Channels */}
                    {(isGroup || isChannel) && !isOwn && !isDeleted && (
                      <div className="px-1 pt-0.5 pb-1">
                        <span className="text-[11px] font-bold text-[#087F75] truncate block">
                          {senderDisplayName}
                        </span>
                      </div>
                    )}

                    {/* Deleted Message Placeholder */}
                    {isDeleted ? (
                      <div className="flex items-center gap-2 py-1 px-1 text-xs">
                        <Ban className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{msg.content || (isRtl ? 'تم حذف هذه الرسالة' : 'This message was deleted')}</span>
                      </div>
                    ) : isVoice ? (
                      (() => {
                        const voiceProgress = msg.uploadProgress !== undefined ? msg.uploadProgress : voiceUploadProgresses[msg.id];
                        return (
                          <div className="flex flex-col gap-2">
                            <VoiceMessagePlayer
                              audioUrl={displayMediaUrl}
                              duration={msg.duration}
                              isOwn={isOwn}
                              language={language}
                              uploadProgress={voiceProgress}
                              status={msg.status}
                            />
                            {/* Visual Progress Bar & Percentage */}
                            {(msg.status === 'sending' || (voiceProgress !== undefined && voiceProgress < 100)) && (
                              <div className="w-full px-1 py-0.5">
                                <div className="flex items-center justify-between text-[10px] opacity-90 mb-1 font-mono">
                                  <span>{isRtl ? 'جاري ضغط ورفع الصوت...' : 'Compressing & uploading voice...'}</span>
                                  <span className="font-bold">{voiceProgress ? Math.round(voiceProgress) : 10}%</span>
                                </div>
                                <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-white transition-all duration-300"
                                    style={{ width: `${voiceProgress || 10}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : isMedia ? (
                      <div className="relative group">
                        <div
                          onClick={() => {
                            if (msg.status !== 'sending') {
                              setViewerMedia({
                                url: displayMediaUrl,
                                type: msg.type as 'image' | 'video',
                                senderName: isOwn ? currentUserProfile.name : senderDisplayName,
                                timestamp: msg.timestamp,
                                caption: displayCaption,
                              });
                            }
                          }}
                          className="relative rounded-xl overflow-hidden cursor-pointer bg-slate-900/10 min-h-[140px] max-h-[300px] flex items-center justify-center"
                        >
                          {msg.type === 'image' ? (
                            <img
                              src={displayMediaUrl}
                              alt="Shared photo"
                              className="w-full h-auto max-h-[300px] object-cover rounded-xl"
                              loading="lazy"
                            />
                          ) : (
                            <div className="relative w-full h-full flex items-center justify-center">
                              <video
                                src={displayMediaUrl}
                                className="w-full h-auto max-h-[300px] object-cover rounded-xl"
                                preload="metadata"
                              />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg">
                                  <Play className="w-5 h-5 fill-current ml-0.5" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Upload Progress Overlay */}
                          {msg.uploadProgress !== undefined && msg.uploadProgress < 100 && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-white">
                              <div className="w-10 h-10 relative flex items-center justify-center">
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                  <path
                                    className="text-white/20"
                                    strokeWidth="3"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                  <path
                                    className="text-[#087F75]"
                                    strokeDasharray={`${msg.uploadProgress}, 100`}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                </svg>
                                <span className="text-[10px] font-bold absolute">
                                  {msg.uploadProgress}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Caption if provided */}
                        {displayCaption && (
                          <p className="px-2 pt-2 pb-1 text-sm whitespace-pre-wrap break-words leading-relaxed select-text text-start" dir="auto">
                            {displayCaption}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="whitespace-pre-wrap break-words leading-relaxed select-text text-start" dir="auto">
                          {translations[msg.id] &&
                          !translations[msg.id].showOriginal &&
                          translations[msg.id].translatedText
                            ? translations[msg.id].translatedText
                            : displayContent}
                        </p>

                        {/* Translation link */}
                        {translations[msg.id] &&
                          !translations[msg.id].isLoading &&
                          translations[msg.id].translatedText &&
                          translations[msg.id].translatedText !== displayContent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTranslations((prev) => ({
                                  ...prev,
                                  [msg.id]: {
                                    ...prev[msg.id],
                                    showOriginal: !prev[msg.id].showOriginal,
                                  },
                                }));
                              }}
                              className={`mt-1.5 text-[10px] font-bold flex items-center gap-1 transition-opacity hover:opacity-100 cursor-pointer ${
                                isOwn
                                  ? 'text-white/90 underline'
                                  : 'text-[#087F75] hover:text-[#06685F] underline'
                              }`}
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span>
                                {translations[msg.id].showOriginal
                                  ? isRtl
                                    ? 'عرض الترجمة'
                                    : 'See translation'
                                  : isRtl
                                  ? `مترجم من ${getLanguageName(
                                      translations[msg.id].sourceLang,
                                      isRtl
                                    )} · عرض الأصل`
                                  : `Translated from ${getLanguageName(
                                      translations[msg.id].sourceLang,
                                      isRtl
                                    )} · See original`}
                              </span>
                            </button>
                          )}
                      </div>
                    )}

                    {/* Footer Info: Timer Icon, Edited tag, Time & Status Tick */}
                    <div
                      className={`flex items-center gap-1 mt-1 px-1 pb-0.5 text-[10px] select-none cursor-pointer ${
                        msg.status === 'failed'
                          ? 'text-rose-700 justify-end'
                          : isOwn
                          ? 'text-white/80 justify-end'
                          : 'text-slate-400 justify-start'
                      }`}
                      dir="ltr"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMessageInfoMessage(msg);
                      }}
                      title="Click for message info"
                    >
                      {msg.expiresAt && !isDeleted && (
                        <Timer
                          className={`w-3 h-3 inline ${
                            isOwn ? 'text-teal-200' : 'text-amber-500'
                          } mr-0.5`}
                        />
                      )}
                      {msg.isEdited && !isDeleted && (
                        <span className="text-[9px] opacity-85 font-medium italic mr-0.5">
                          {isRtl ? 'معدلة' : 'edited'}
                        </span>
                      )}
                      {msg.isPinned && !isDeleted && (
                        <Pin
                          className={`w-3 h-3 inline ${
                            isOwn ? 'text-teal-200 fill-teal-200' : 'text-[#087F75] fill-[#087F75]'
                          } mr-0.5`}
                        />
                      )}
                      <span>{showTime}</span>
                      {isOwn && !isDeleted && renderStatusIcon(msg)}
                    </div>

                    {msg.status === 'failed' && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pendingPayloadsRef.current[msg.id] || msg.type === 'text') {
                            handleRetryMessage(msg.id);
                          } else {
                            handleDeleteForMe(msg);
                          }
                        }}
                        className="mt-2 pt-1.5 border-t border-rose-200 flex items-center justify-between text-[11px] font-bold text-red-600 hover:text-red-700 transition-colors cursor-pointer select-none"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500 animate-pulse" />
                          {(pendingPayloadsRef.current[msg.id] || msg.type === 'text')
                            ? (isRtl ? 'فشل الإرسال. اضغط لإعادة المحاولة.' : 'Failed to send. Tap to retry.')
                            : (isRtl ? 'فشل الإرسال. اضغط للحذف.' : 'Orphaned message. Tap to delete.')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Quick Reaction Hover Button */}
                {!isDeleted && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionPickerMessageId((prev) => (prev === msg.id ? null : msg.id));
                    }}
                    className={`absolute top-1/2 -translate-y-1/2 ${
                      isOwn ? '-left-8' : '-right-8'
                    } w-6 h-6 rounded-full bg-white/90 shadow-xs border border-slate-200 flex items-center justify-center text-slate-400 hover:text-[#087F75] hover:scale-110 opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10`}
                    title="React"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Reaction Pills Below Bubble */}
              {activeReactions.length > 0 && !isDeleted && (
                <div
                  className={`flex flex-wrap gap-1 mt-1 px-1 z-10 ${
                    isOwn
                      ? isRtl
                        ? 'justify-start'
                        : 'justify-end'
                      : isRtl
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >
                  {activeReactions.map(([emoji, uids]) => {
                    const uidList = (uids as string[]) || [];
                    const isMyReaction = uidList.includes(currentUserId);
                    const count = uidList.length;

                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectReaction(msg, emoji);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setReactionDetailsMessage(msg);
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shadow-2xs border transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                          isMyReaction
                            ? 'bg-[#087F75]/15 border-[#087F75]/50 text-[#087F75]'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                        title={isRtl ? 'انقر للتبديل، اضغط مطولاً لمعرفة المتفاعلين' : 'Click to toggle, long-press to view reactors'}
                      >
                        <span className="leading-none text-sm">{emoji}</span>
                        {count > 1 && <span className="text-[11px] font-bold">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Typing Indicator Bubble */}
        <AnimatePresence>
          {isOtherTyping && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className={`flex w-full ${isRtl ? 'justify-end' : 'justify-start'}`}
            >
              <div className="bg-white border border-slate-200/80 px-4 py-3 rounded-2xl rounded-bl-xs shadow-2xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#087F75] animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-2 h-2 rounded-full bg-[#087F75] animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2 h-2 rounded-full bg-[#087F75] animate-bounce"></span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Attachment Selection Menu Popover */}
      <AnimatePresence>
        {isAttachmentMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className={`absolute bottom-20 ${
              isRtl ? 'right-4' : 'left-4'
            } bg-white rounded-2xl shadow-xl border border-slate-200/80 p-2 z-30 flex flex-col gap-1 w-52`}
          >
            {/* Photo / Video */}
            <button
              type="button"
              onClick={() => filePickerRef.current?.click()}
              className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <ImageIcon className="w-4 h-4" />
              </div>
              <span>{isRtl ? 'صورة أو فيديو' : 'Photo / Video'}</span>
            </button>

            {/* Camera */}
            <button
              type="button"
              onClick={() => {
                setIsAttachmentMenuOpen(false);
                setIsCameraModalOpen(true);
              }}
              className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Camera className="w-4 h-4" />
              </div>
              <span>{isRtl ? 'الكاميرا' : 'Camera'}</span>
            </button>

            {/* Poll */}
            <button
              type="button"
              onClick={() => {
                setIsAttachmentMenuOpen(false);
                setIsCreatePollOpen(true);
              }}
              className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-teal-50 text-slate-700 hover:text-[#087F75] text-sm font-semibold transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-teal-50 text-[#087F75] flex items-center justify-center">
                <BarChart2 className="w-4 h-4" />
              </div>
              <span>{isRtl ? 'استطلاع رأي' : 'Create Poll'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Sticker Picker Panel */}
      <AnimatePresence>
        {isStickerPickerOpen && (
          <div className="absolute bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
            <StickerPicker
              language={language}
              onSelectSticker={handleSelectSticker}
              onClose={() => setIsStickerPickerOpen(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Input Bar */}
      <footer className="bg-white p-3 border-t border-slate-200 shadow-lg shrink-0 z-20">
        {/* Editing Banner if in message edit mode */}
        <AnimatePresence>
          {editingMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-amber-900"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Edit3 className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold block">
                    {isRtl ? 'تعديل الرسالة' : 'Editing Message'}
                  </span>
                  <span className="text-amber-700 truncate block text-[11px]">
                    {editingMessage.content}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMessage(null);
                  setInputText('');
                }}
                className="w-6 h-6 rounded-full hover:bg-amber-200/60 flex items-center justify-center text-amber-700 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Channel One-Way Posting Restriction or Blocked User states */}
        {isBlockedByMe ? (
          /* Current User has Blocked this Contact */
          <div className="p-3.5 bg-red-50/95 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-red-900 shadow-2xs">
            <div className="flex items-center gap-2 text-center sm:text-left">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-semibold">
                {isRtl
                  ? 'لقد قمت بحظر هذا المستخدم. لن تتمكن من إرسال أو استقبال الرسائل.'
                  : 'You have blocked this contact. Messages cannot be sent or received.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsBlockModalOpen(true)}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              {isRtl ? 'إلغاء الحظر' : 'Unblock'}
            </button>
          </div>
        ) : isBlockedByOther ? (
          /* Contact has Blocked Current User */
          <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-600">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="font-medium">
              {isRtl
                ? 'لا يمكنك إرسال رسائل إلى هذا المستخدم.'
                : 'You cannot send messages to this contact.'}
            </span>
          </div>
        ) : currentUserProfile?.isFlagged ? (
          <div className="py-4 px-4 bg-rose-50 border border-rose-200/60 rounded-2xl flex flex-col items-center justify-center gap-1 text-center shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-rose-850 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              {isRtl ? 'تم تقييد الحساب مؤقتاً' : 'Account Temporarily Restricted'}
            </div>
            <p className="text-[11px] text-rose-600 max-w-xs leading-relaxed">
              {isRtl
                ? `تم رصد نشاط مريب يخرق سياسة الاستخدام (إرسال رسائل متكررة لجهات غير مسجلة). السبب: ${currentUserProfile.flaggedReason || 'انتهاك سياسة الاستخدام'}`
                : `Suspicious high-frequency activity detected. Reason: ${currentUserProfile.flaggedReason || 'Spam Policy Violation'}`}
            </p>
          </div>
        ) : isChannel && !isChannelAdmin ? (
          <div className="py-3 px-4 bg-slate-100/90 rounded-2xl flex items-center justify-center gap-2 text-slate-500 text-xs font-bold border border-slate-200/80">
            <Lock className="w-4 h-4 text-slate-400" />
            <span>
              {isRtl
                ? 'يمكن للمشرفين فقط النشر في هذه القناة'
                : 'Only channel admins can post messages'}
            </span>
          </div>
        ) : isRecordingVoice ? (
          /* Live Voice Recording UI */
          <VoiceRecorderBar
            language={language}
            onSendVoice={handleSendVoiceNote}
            onCancelRecording={() => {
              setIsRecordingVoice(false);
              setSlideOffset(0);
            }}
            slideOffset={slideOffset}
          />
        ) : (
          /* Normal Message Input Bar */
          <div className="flex items-end gap-1.5 max-w-full">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => setIsAttachmentMenuOpen((prev) => !prev)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isAttachmentMenuOpen
                  ? 'bg-[#087F75]/10 text-[#087F75]'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
              title={isRtl ? 'إرفاق وسائط أو استطلاع' : 'Attach media or poll'}
            >
              <Paperclip className="w-5 h-5 -rotate-45" />
            </button>

            {/* Quick Camera Button */}
            <button
              type="button"
              onClick={() => setIsCameraModalOpen(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-[#087F75] hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              title={isRtl ? 'التقاط صورة بالكاميرا' : 'Take a photo'}
              aria-label={isRtl ? 'الكاميرا' : 'Camera'}
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Sticker Button */}
            <button
              type="button"
              onClick={() => setIsStickerPickerOpen((prev) => !prev)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isStickerPickerOpen
                  ? 'bg-[#087F75]/10 text-[#087F75]'
                  : 'text-slate-400 hover:text-[#087F75] hover:bg-slate-100'
              }`}
              title={isRtl ? 'ملصقات هلا' : 'Hala Stickers'}
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Textarea Field */}
            <div className="flex-1 min-h-[44px] bg-slate-100 rounded-2xl px-3.5 py-2.5 flex items-center border border-transparent focus-within:border-slate-300 focus-within:bg-white transition-all">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={isRtl ? 'اكتب رسالتك...' : 'Type a message...'}
                rows={1}
                className="w-full bg-transparent resize-none text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden max-h-[120px] leading-relaxed text-start"
                dir="auto"
              />
            </div>

            {/* Microphone Button vs Send Button */}
            {inputText.trim() || editingMessage ? (
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isSending}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                  inputText.trim()
                    ? 'bg-[#087F75] text-white shadow-md shadow-[#087F75]/30 hover:bg-[#06685F]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                aria-label={isRtl ? 'إرسال' : 'Send'}
              >
                <Send className={`w-5 h-5 ${isRtl ? '-scale-x-100' : ''}`} />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onPointerDown={handleVoicePointerDown}
                onPointerMove={handleVoicePointerMove}
                className="w-11 h-11 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-md shadow-[#087F75]/30 hover:bg-[#06685F] transition-all shrink-0 cursor-pointer select-none touch-none"
                aria-label={isRtl ? 'تسجيل رسالة صوتية' : 'Record voice message'}
                title={isRtl ? 'اضغط وسجل رسالة صوتية' : 'Press & hold to record voice message'}
              >
                <Mic className="w-5 h-5" />
              </motion.button>
            )}
          </div>
        )}
      </footer>

      {/* Create Poll Modal */}
      <CreatePollModal
        isOpen={isCreatePollOpen}
        onClose={() => setIsCreatePollOpen(false)}
        language={language}
        onSubmitPoll={handleSubmitPoll}
      />

      {/* Message Context Menu */}
      {contextMenuMessage && (
        <MessageContextMenu
          isOpen={Boolean(contextMenuMessage)}
          onClose={() => setContextMenuMessage(null)}
          message={contextMenuMessage}
          isOwn={contextMenuMessage.senderId === currentUserId}
          language={language}
          onSelectReaction={(emoji) => handleSelectReaction(contextMenuMessage, emoji)}
          onEditMessage={() => {
            setEditingMessage(contextMenuMessage);
            setInputText(contextMenuMessage.content);
            if (textareaRef.current) {
              setTimeout(() => {
                textareaRef.current?.focus();
              }, 50);
            }
          }}
          onDeleteForMe={() => handleDeleteForMe(contextMenuMessage)}
          onDeleteForEveryone={() => handleDeleteForEveryone(contextMenuMessage)}
          onTogglePin={() => handleTogglePinMessage(contextMenuMessage)}
          onShowInfo={() => setMessageInfoMessage(contextMenuMessage)}
        />
      )}

      {/* Message Info Modal */}
      {messageInfoMessage && (
        <MessageInfoModal
          isOpen={Boolean(messageInfoMessage)}
          onClose={() => setMessageInfoMessage(null)}
          message={messageInfoMessage}
          chat={activeChat}
          currentUserId={currentUserId}
          language={language}
        />
      )}

      {/* Reaction Details Modal */}
      {reactionDetailsMessage && (
        <ReactionDetailsModal
          isOpen={Boolean(reactionDetailsMessage)}
          onClose={() => setReactionDetailsMessage(null)}
          message={reactionDetailsMessage}
          chat={activeChat}
          currentUserId={currentUserId}
          language={language}
        />
      )}

      {/* Media Preview Modal */}
      {selectedMediaFile && (
        <MediaPreviewModal
          isOpen={isMediaPreviewOpen}
          onClose={() => {
            setIsMediaPreviewOpen(false);
            setSelectedMediaFile(null);
          }}
          language={language}
          mediaType={selectedMediaFile.type}
          mediaPreviewUrl={selectedMediaFile.previewUrl}
          onSend={handleSendMedia}
        />
      )}

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        language={language}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* Full-Screen Media Viewer */}
      {viewerMedia && (
        <MediaViewerModal
          isOpen={Boolean(viewerMedia)}
          onClose={() => setViewerMedia(null)}
          language={language}
          mediaUrl={viewerMedia.url}
          mediaType={viewerMedia.type}
          senderName={viewerMedia.senderName}
          timestamp={viewerMedia.timestamp}
          caption={viewerMedia.caption}
        />
      )}

      {/* Comprehensive Chat Info Modal (1-on-1, Group, Channel, Disappearing Messages) */}
      <ChatInfoModal
        isOpen={isChatInfoOpen}
        onClose={() => setIsChatInfoOpen(false)}
        language={language}
        chat={activeChat}
        currentUserId={currentUserId}
        currentUserProfile={currentUserProfile}
        onChatUpdated={(updated) => setActiveChat(updated)}
        onLeftChat={() => onBack()}
      />

      {/* Call Type Modal */}
      {isOneOnOne && onStartCall && (
        <CallTypeModal
          isOpen={isCallTypeModalOpen}
          onClose={() => setIsCallTypeModalOpen(false)}
          contactName={recipientDetails.name}
          contactAvatar={recipientDetails.avatarUrl}
          phoneNumber={recipientDetails.phone}
          language={language}
          onSelectCallType={(type) => {
            onStartCall(
              {
                id: recipientId,
                name: recipientDetails.name,
                avatarUrl: recipientDetails.avatarUrl,
                phone: recipientDetails.phone,
              },
              type
            );
          }}
        />
      )}

      {/* Block / Unblock Confirmation Modal */}
      <AnimatePresence>
        {isBlockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 overflow-hidden text-slate-900 border border-slate-100"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center gap-3 mb-3.5">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                    isBlockedByMe ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}
                >
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 leading-tight">
                    {isBlockedByMe
                      ? (isRtl ? `إلغاء حظر ${recipientDetails.name}؟` : `Unblock ${recipientDetails.name}?`)
                      : (isRtl ? `حظر ${recipientDetails.name}؟` : `Block ${recipientDetails.name}?`)}
                  </h3>
                  {recipientDetails.phone && (
                    <p className="text-xs text-slate-500 mt-0.5" dir="ltr">
                      {recipientDetails.phone}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-5">
                {isBlockedByMe
                  ? (isRtl
                      ? 'سيتمكن هذا المستخدم من مراسلتك والاتصال بك ورؤية حالتك بمجرد إلغاء الحظر.'
                      : 'This contact will be able to send you messages, call you, and view your presence once unblocked.')
                  : (isRtl
                      ? 'لن يتمكن هذا المستخدم من إرسال رسائل أو الاتصال بك أو رؤية آخر ظهور لك. لن يتم إشعارهم بحظرهم.'
                      : 'Blocked contacts will no longer be able to send you messages, call you, or see your online status.')}
              </p>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  disabled={isBlockingLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleBlock}
                  disabled={isBlockingLoading}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5 ${
                    isBlockedByMe
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isBlockingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {isBlockedByMe
                      ? (isRtl ? 'إلغاء الحظر' : 'Unblock')
                      : (isRtl ? 'حظر المستخدم' : 'Block User')}
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action Feedback Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-2 pointer-events-none"
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Wallpaper Customization Modal */}
      {isWallpaperModalOpen && (
        <ChatWallpaperModal
          isOpen={isWallpaperModalOpen}
          onClose={() => setIsWallpaperModalOpen(false)}
          language={language}
          chat={activeChat}
          currentUserId={currentUserId}
          onWallpaperChanged={(newWallpaper) => {
            setActiveChat((prev) => ({
              ...prev,
              wallpaper: newWallpaper,
              wallpaperBy: {
                ...(prev.wallpaperBy || {}),
                [currentUserId]: newWallpaper || 'default',
              },
            }));
            setToastMessage(
              language === 'ar'
                ? 'تم تحديث خلفية المحادثة بنجاح'
                : 'Chat wallpaper updated successfully'
            );
            setTimeout(() => setToastMessage(null), 2500);
          }}
        />
      )}

      {/* Hidden File Picker Inputs */}
      <input
        ref={filePickerRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={cameraPickerRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
    </motion.div>
  );
};
