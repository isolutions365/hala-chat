export type Language = 'ar' | 'en';

export type Screen = 'splash' | 'welcome' | 'phone' | 'otp' | 'profile' | 'restore_pin' | 'key_mismatch' | 'chats' | 'conversation';

export interface Country {
  code: string;
  nameEn: string;
  nameAr: string;
  dialCode: string;
  flag: string;
  minDigits: number;
  maxDigits: number;
  placeholder: string;
}

export type PrivacyVisibility = 'everyone' | 'contacts' | 'nobody';

export interface PrivacySettings {
  lastSeen: PrivacyVisibility;
  profilePhoto: PrivacyVisibility;
  statusVisibility: PrivacyVisibility;
  about: PrivacyVisibility;
  readReceipts: boolean;
  groupAdd: 'everyone' | 'contacts';
}

export interface TwoFactorSettings {
  enabled: boolean;
  pin?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  avatarUrl: string | null;
  phoneNumber: string;
  status?: string;
  country: Country;
  createdAt?: string;
  lastSeen?: string;
  publicKey?: string;
  preferredLanguage?: string;
  autoTranslateEnabled?: boolean;
  autoTranscribeVoice?: boolean;
  blockedUsers?: string[];
  restrictVoiceMessages?: boolean;
  privacySettings?: PrivacySettings;
  twoFactor?: TwoFactorSettings;
  isFlagged?: boolean;
  flaggedReason?: string;
}

// Database Schema Interfaces
export interface UserModel {
  id: string;
  phone: string;
  name: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
  last_seen: string;
  public_key?: string;
  preferred_language?: string;
  auto_translate_enabled?: boolean;
  blockedUsers?: string[];
  blocked_users?: string[];
  restrict_voice_messages?: boolean;
  restrictVoiceMessages?: boolean;
  privacy_settings?: PrivacySettings;
  two_factor?: TwoFactorSettings;
  is_flagged?: boolean;
  flagged_reason?: string;
}

export type ReportReason = 'Spam' | 'Harassment' | 'Inappropriate content' | 'Fake account' | 'Other';

export interface ReportModel {
  id: string;
  reportedUserId: string;
  reportedByUserId: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
  status: 'pending' | 'reviewed';
}

export interface ContactModel {
  user_id: string;
  contact_user_id: string;
  added_at: string;
}

export interface GroupModel {
  id: string;
  name: string;
  avatar_url?: string | null;
  created_by: string;
  created_at: string;
  admin_ids?: string[];
}

export interface GroupMemberModel {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  name?: string;
  avatar_url?: string | null;
  phone?: string;
  joined_at: string;
}

export interface ChannelModel {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string | null;
  owner_id: string;
  admin_ids?: string[];
  is_public: boolean;
  allow_member_posts?: boolean;
  subscriber_count?: number;
  created_at: string;
}

export interface ChannelSubscriberModel {
  channel_id: string;
  user_id: string;
  joined_at: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // array of userIds who voted for this option
}

export interface PollData {
  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  totalVotes?: number;
}

export interface StickerItem {
  id: string;
  name: string;
  nameAr: string;
  category: 'greetings' | 'reactions' | 'characters';
  categoryName: string;
  categoryNameAr: string;
  svgOrEmoji: string;
  previewColor?: string;
}

export interface ChatModel {
  id: string;
  type: '1-1' | 'group' | 'channel';
  name?: string;
  title?: string;
  description?: string;
  avatarUrl?: string | null;
  createdBy?: string;
  ownerId?: string;
  adminIds?: string[];
  isPublic?: boolean;
  allowMemberPosts?: boolean;
  subscriberCount?: number;
  disappearingMessagesDuration?: number; // 0 = off, 86400 = 24h, 604800 = 7d, 7776000 = 90d
  participants: string[];
  participantDetails?: {
    [uid: string]: {
      name: string;
      avatarUrl?: string | null;
      phone?: string;
      role?: 'admin' | 'member';
    };
  };
  unreadCount?: {
    [uid: string]: number;
  };
  typing?: {
    [uid: string]: boolean;
  };
  encryptedGroupKeys?: {
    [uid: string]: {
      ciphertext: string;
      iv: string;
      senderPubKeyJwk: string;
    };
  };
  lastMessage?: {
    id?: string;
    senderId: string;
    senderName?: string;
    content: string;
    type: 'text' | 'image' | 'video' | 'voice' | 'sticker' | 'poll' | 'file' | 'location';
    timestamp: string;
    status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    isDeletedForEveryone?: boolean;
    readBy?: string[];
    deliveredTo?: string[];
  } | null;
  pinned?: boolean; // Boolean indicating if chat is pinned
  pinnedBy?: string[]; // Array of user IDs who pinned this chat
  archivedBy?: string[]; // Array of user IDs who archived this chat
  pinnedMessageIds?: string[]; // Array of pinned message IDs in this chat
  wallpaper?: string | null; // Chat-wide background wallpaper preset ID or custom image
  wallpaperBy?: {
    [uid: string]: string; // User-specific preference for this chat background wallpaper
  };
  headerTheme?: string | null; // Chat-wide header theme preset ID
  headerThemeBy?: {
    [uid: string]: string; // User-specific preference for this chat header theme
  };
  createdAt?: string;
  updatedAt: string;
}

export interface MessageModel {
  id: string;
  chatId?: string;
  senderId: string;
  senderName?: string;
  content: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'sticker' | 'poll' | 'file' | 'location';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  uploadProgress?: number;
  duration?: number;
  stickerUrl?: string;
  pollData?: PollData;
  mediaIv?: string;
  expiresAt?: string; // ISO string when disappearing message will expire
  reactions?: {
    [emoji: string]: string[];
  };
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
  isEdited?: boolean;
  editedAt?: string;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  deletedAt?: string;
  deliveredTo?: string[];
  readBy?: string[];
}

export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string | null;
  status?: string;
  created_at?: string;
  last_seen?: string;
  public_key?: string;
}

export interface PresenceModel {
  online: boolean;
  lastSeen: string;
}

export type CallType = 'voice' | 'video';
export type CallStatus = 'ringing' | 'ongoing' | 'ended' | 'missed' | 'declined' | 'cancelled';

export interface CallModel {
  id: string;
  chatId?: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  callerPhone?: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar?: string | null;
  calleePhone?: string;
  type: CallType;
  status: CallStatus;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

export interface SignalingData {
  id?: string;
  type: 'offer' | 'answer' | 'candidate';
  from: string;
  to: string;
  sdp?: any;
  candidate?: any;
  timestamp: string;
}

export interface PhoneAuthState {
  country: Country;
  phoneNumber: string;
  formattedNumber: string;
  isValid: boolean;
  validationError: string | null;
  otpSent: boolean;
  verificationId: string | null;
  confirmationResult: any | null;
}

export interface StoryViewItem {
  viewerId: string;
  viewerName: string;
  viewerAvatar?: string | null;
  viewedAt: string;
}

export interface TextOverlayData {
  text: string;
  color: string;
  xPercent?: number;
  yPercent?: number;
}

export interface StoryModel {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  userPhone?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  textOverlay?: TextOverlayData | string | null;
  drawingOverlay?: string | null;
  createdAt: string;
  expiresAt: string; // ISO string 24h after createdAt
  views?: {
    [viewerId: string]: StoryViewItem;
  };
}

export interface CallRating {
  rating: number;
  createdAt: any;
}
