import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Radio,
  User,
  X,
  UserPlus,
  LogOut,
  Edit2,
  Check,
  ShieldCheck,
  Camera,
  Phone,
  Sparkles,
  Loader2,
  Trash2,
  Clock,
  Timer,
  Globe,
  Lock,
  ChevronDown,
  Info,
  ShieldAlert,
  Ban,
  FileText,
  Palette,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Language, ChatModel, ContactItem, UserProfile } from '../types';
import {
  updateGroupInfo,
  addMembersToGroup,
  leaveGroupChat,
  leaveChannel,
  updateChannelSettings,
  updateChatDisappearingDuration,
  fetchUsersForContactPicker,
  toggleBlockUser,
  subscribeToUserProfile,
} from '../lib/firebase';
import { compressImage } from '../lib/media';
import { ChatWallpaperModal } from './ChatWallpaperModal';
import { WALLPAPER_PRESETS, resolveWallpaperStyle } from '../lib/wallpaperPresets';

interface ChatInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  chat: ChatModel;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onChatUpdated?: (updatedChat: ChatModel) => void;
  onLeftChat?: () => void;
}

export const ChatInfoModal: React.FC<ChatInfoModalProps> = ({
  isOpen,
  onClose,
  language,
  chat,
  currentUserId,
  currentUserProfile,
  onChatUpdated,
  onLeftChat,
}) => {
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isChannel = chat.type === 'channel';
  const isGroup = chat.type === 'group';
  const isOneOnOne = chat.type === '1-1';

  const isAdmin =
    chat.createdBy === currentUserId ||
    chat.ownerId === currentUserId ||
    (chat.adminIds && chat.adminIds.includes(currentUserId)) ||
    chat.participantDetails?.[currentUserId]?.role === 'admin';

  // 1-on-1 other participant details
  const otherUserId = isOneOnOne ? chat.participants.find((p) => p !== currentUserId) || '' : '';
  const otherUserDetail = isOneOnOne && otherUserId ? chat.participantDetails?.[otherUserId] : null;

  const [title, setTitle] = useState(
    isOneOnOne
      ? otherUserDetail?.name || chat.name || 'Chat'
      : chat.name || chat.title || (isChannel ? 'Channel' : 'Group')
  );
  const [description, setDescription] = useState(chat.description || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    isOneOnOne ? otherUserDetail?.avatarUrl || null : chat.avatarUrl || null
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(false);

  // Settings
  const [isPublic, setIsPublic] = useState(chat.isPublic ?? true);
  const [allowMemberPosts, setAllowMemberPosts] = useState(chat.allowMemberPosts ?? false);
  const [disappearingDuration, setDisappearingDuration] = useState<number>(
    chat.disappearingMessagesDuration || 0
  );

  // Add members / subscribers subflow
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<ContactItem[]>([]);
  const [selectedNewMembers, setSelectedNewMembers] = useState<ContactItem[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>(
    currentUserProfile.blockedUsers || []
  );

  useEffect(() => {
    if (!currentUserId) return;
    const unsub = subscribeToUserProfile(currentUserId, (profile) => {
      if (profile?.blockedUsers) {
        setBlockedUsers(profile.blockedUsers);
      }
    });
    return () => unsub();
  }, [currentUserId]);

  const recipientId = isOneOnOne
    ? chat.participants.find((p) => p !== currentUserId) || ''
    : '';
  const isContactBlocked = Boolean(recipientId && blockedUsers.includes(recipientId));

  const handleToggleBlockContact = async () => {
    if (!recipientId || !currentUserId || isBlocking) return;
    setIsBlocking(true);
    try {
      const nextBlocked = !isContactBlocked;
      await toggleBlockUser({
        currentUserId,
        targetUserId: recipientId,
        isBlocked: nextBlocked,
      });
      setBlockedUsers((prev) =>
        nextBlocked ? [...prev, recipientId] : prev.filter((id) => id !== recipientId)
      );
    } catch (err) {
      console.warn('Failed to toggle block user:', err);
    } finally {
      setIsBlocking(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTitle(
        isOneOnOne
          ? otherUserDetail?.name || chat.name || 'Chat'
          : chat.name || chat.title || (isChannel ? 'Channel' : 'Group')
      );
      setDescription(chat.description || '');
      setAvatarUrl(isOneOnOne ? otherUserDetail?.avatarUrl || null : chat.avatarUrl || null);
      setIsPublic(chat.isPublic ?? true);
      setAllowMemberPosts(chat.allowMemberPosts ?? false);
      setDisappearingDuration(chat.disappearingMessagesDuration || 0);
      setIsEditingTitle(false);
      setIsEditingDesc(false);
      setIsAddMembersOpen(false);
    }
  }, [isOpen, chat, isOneOnOne, otherUserDetail]);

  if (!isOpen) return null;

  // Disappearing messages options
  const disappearingOptions = [
    { value: 0, labelEn: 'Off', labelAr: 'إيقاف' },
    { value: 86400, labelEn: '24 Hours', labelAr: '24 ساعة' },
    { value: 604800, labelEn: '7 Days', labelAr: '7 أيام' },
    { value: 7776000, labelEn: '90 Days', labelAr: '90 يوماً' },
  ];

  const handleDisappearingChange = async (duration: number) => {
    setDisappearingDuration(duration);
    try {
      await updateChatDisappearingDuration({
        chatId: chat.id,
        durationSeconds: duration,
      });
      onChatUpdated?.({
        ...chat,
        disappearingMessagesDuration: duration,
      });
    } catch (err) {
      console.warn('Failed to update disappearing duration:', err);
    }
  };

  const handleSaveTitle = async () => {
    if (!title.trim() || (!isAdmin && !isOneOnOne)) return;
    setSettingsError(false);
    setIsSaving(true);
    try {
      if (isChannel) {
        await updateChannelSettings({
          channelId: chat.id,
          name: title.trim(),
        });
      } else if (isGroup) {
        await updateGroupInfo(chat.id, title.trim(), avatarUrl);
      }
      setIsEditingTitle(false);
      onChatUpdated?.({
        ...chat,
        name: title.trim(),
        title: title.trim(),
      });
    } catch (err) {
      setSettingsError(true);
      console.warn('Failed to save title:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDesc = async () => {
    if (!isAdmin && !isOneOnOne) return;
    setSettingsError(false);
    setIsSaving(true);
    try {
      if (isChannel) {
        await updateChannelSettings({
          channelId: chat.id,
          description: description.trim(),
        });
      }
      setIsEditingDesc(false);
      onChatUpdated?.({
        ...chat,
        description: description.trim(),
      });
    } catch (err) {
      setSettingsError(true);
      console.warn('Failed to save description:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAllowMemberPosts = async (val: boolean) => {
    if (isSaving) return;
    setSettingsError(false);setIsSaving(true);
    try {
      await updateChannelSettings({
        channelId: chat.id,
        allowMemberPosts: val,
      });
      setAllowMemberPosts(val);
      onChatUpdated?.({
        ...chat,
        allowMemberPosts: val,
      });
    } catch (err) {
      setSettingsError(true);
      console.warn('Failed to update channel member posting setting:', err);
    } finally {setIsSaving(false);}
  };

  const handleTogglePublic = async (val: boolean) => {
    if (isSaving) return;
    setSettingsError(false);setIsSaving(true);
    try {
      await updateChannelSettings({
        channelId: chat.id,
        isPublic: val,
      });
      setIsPublic(val);
      onChatUpdated?.({
        ...chat,
        isPublic: val,
      });
    } catch (err) {
      setSettingsError(true);
      console.warn('Failed to update channel public setting:', err);
    } finally {setIsSaving(false);}
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;

    try {
      const { dataUrl } = await compressImage(file, 400, 400, 0.8);
      setAvatarUrl(dataUrl);
      if (isChannel) {
        await updateChannelSettings({
          channelId: chat.id,
          avatarUrl: dataUrl,
        });
      } else if (isGroup) {
        await updateGroupInfo(chat.id, title, dataUrl);
      }
      onChatUpdated?.({
        ...chat,
        avatarUrl: dataUrl,
      });
    } catch (err) {
      setSettingsError(true);
      console.warn('Failed to upload avatar:', err);
    }
  };

  // Leave Group or Channel
  const handleLeave = async () => {
    const confirmMsg = isChannel
      ? isRtl
        ? 'هل أنت متأكد من إلغاء الاشتراك ومغادرة هذه القناة؟'
        : 'Are you sure you want to leave this channel?'
      : isRtl
      ? 'هل أنت متأكد من مغادرة هذه المجموعة؟'
      : 'Are you sure you want to leave this group?';

    if (!window.confirm(confirmMsg)) return;

    setIsLeaving(true);
    try {
      if (isChannel) {
        await leaveChannel({ channelId: chat.id, userId: currentUserId });
      } else {
        await leaveGroupChat(chat.id, currentUserId);
      }
      onClose();
      onLeftChat?.();
    } catch (err) {
      console.warn('Failed to leave chat:', err);
      setIsLeaving(false);
    }
  };

  // Open add members contacts
  const openAddMembersFlow = async () => {
    setIsAddMembersOpen(true);
    setIsLoadingContacts(true);
    setSelectedNewMembers([]);
    try {
      const all = await fetchUsersForContactPicker(currentUserId);
      const nonParticipants = all.filter((c) => !chat.participants.includes(c.id));
      setAvailableContacts(nonParticipants);
    } catch (err) {
      console.warn('Failed to load contacts:', err);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleConfirmAddMembers = async () => {
    if (selectedNewMembers.length === 0) return;
    setIsAddingMembers(true);
    try {
      await addMembersToGroup(chat.id, selectedNewMembers, chat);
      setIsAddMembersOpen(false);
      onChatUpdated?.({
        ...chat,
        participants: [...chat.participants, ...selectedNewMembers.map((m) => m.id)],
      });
    } catch (err) {
      console.warn('Failed to add members:', err);
    } finally {
      setIsAddingMembers(false);
    }
  };

  const participantIds = chat.participants || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {settingsError&&<p role="alert" className="px-6 py-3 text-sm text-red-700">{isRtl?'تعذر حفظ الإعدادات. تحقق من الاتصال وحاول مجدداً.':'Settings could not be saved. Check your connection and retry.'}</p>}
        {/* Header Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-teal-50 via-white to-teal-50/40 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-base font-extrabold text-slate-900">
            {isChannel
              ? isRtl ? 'معلومات القناة' : 'Channel Info'
              : isGroup
              ? isRtl ? 'معلومات المجموعة' : 'Group Info'
              : isRtl ? 'معلومات جهة الاتصال' : 'Contact Info'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Avatar and Title Section */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <div
                className={`w-22 h-22 rounded-3xl flex items-center justify-center font-bold text-white shadow-md overflow-hidden text-2xl ${
                  isChannel
                    ? 'bg-gradient-to-tr from-[#087F75] to-teal-400'
                    : isGroup
                    ? 'bg-gradient-to-tr from-amber-500 to-[#087F75]'
                    : 'bg-gradient-to-tr from-slate-600 to-slate-800'
                }`}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={title} className="w-full h-full object-cover" />
                ) : isChannel ? (
                  <Radio className="w-10 h-10" />
                ) : isGroup ? (
                  <Users className="w-10 h-10" />
                ) : (
                  <User className="w-10 h-10" />
                )}
              </div>

              {isAdmin && !isOneOnOne && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-lg hover:bg-[#06685F] cursor-pointer transition-transform hover:scale-105"
                  title={isRtl ? 'تغيير الصورة' : 'Change avatar'}
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Title / Name */}
            {isEditingTitle ? (
              <div className="flex items-center gap-2 w-full max-w-xs justify-center">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-[#087F75] text-sm font-bold text-slate-900 focus:outline-none text-center"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={isSaving}
                  className="w-8 h-8 rounded-xl bg-[#087F75] text-white flex items-center justify-center hover:bg-[#06685F] cursor-pointer shrink-0"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
                {isAdmin && !isOneOnOne && (
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="p-1 text-slate-400 hover:text-[#087F75] transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Subtitle Details */}
            {isChannel ? (
              <p className="text-xs font-semibold text-[#087F75] mt-1 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5" />
                <span>
                  {chat.subscriberCount || participantIds.length}{' '}
                  {isRtl ? 'مشترك' : 'Subscribers'} • {isPublic ? (isRtl ? 'عامة' : 'Public') : (isRtl ? 'خاصة' : 'Private')}
                </span>
              </p>
            ) : isGroup ? (
              <p className="text-xs font-semibold text-slate-500 mt-1">
                {participantIds.length} {isRtl ? 'أعضاء' : 'Members'}
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-500 mt-1" dir="ltr">
                {otherUserDetail?.phone || ''}
              </p>
            )}
          </div>

          {/* Channel Description */}
          {isChannel && (
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {isRtl ? 'الوصف' : 'Description'}
                </span>
                {isAdmin && !isEditingDesc && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDesc(true)}
                    className="text-xs text-[#087F75] font-bold hover:underline cursor-pointer"
                  >
                    {isRtl ? 'تعديل' : 'Edit'}
                  </button>
                )}
              </div>

              {isEditingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full p-2 bg-white rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#087F75]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingDesc(false)}
                      className="px-2.5 py-1 text-xs text-slate-500 font-bold"
                    >
                      {isRtl ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDesc}
                      disabled={isSaving}
                      className="px-3 py-1 bg-[#087F75] text-white text-xs font-bold rounded-lg"
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : (isRtl ? 'حفظ' : 'Save')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-700 font-medium">
                  {description || (isRtl ? 'لا يوجد وصف للقناة' : 'No description provided')}
                </p>
              )}
            </div>
          )}

          {/* Contact Bio / About Section for 1-on-1 chats */}
          {isOneOnOne && (
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-center gap-2 text-[#087F75]">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  {isRtl ? 'السيرة الذاتية / نبذة' : 'Bio / About'}
                </span>
              </div>
              <p className="text-xs text-slate-700 font-medium leading-relaxed italic bg-white p-3 rounded-xl border border-slate-100 whitespace-pre-wrap break-words">
                "{otherUserDetail?.status || (isRtl ? 'لا توجد سيرة ذاتية بعد' : 'No bio provided yet')}"
              </p>
            </div>
          )}

          {/* DISAPPEARING MESSAGES SETTING */}
          <div className="p-4 bg-teal-50/50 rounded-2xl border border-[#087F75]/20 space-y-2.5">
            <div className="flex items-center gap-2.5 text-[#087F75]">
              <div className="w-8 h-8 rounded-xl bg-[#087F75]/10 flex items-center justify-center shrink-0">
                <Timer className="w-4 h-4 text-[#087F75]" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">
                  {isRtl ? 'الرسائل ذاتية الاختفاء' : 'Disappearing Messages'}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium leading-tight">
                  {isRtl
                    ? 'حذف الرسائل الجديدة تلقائياً بعد فترة محددة'
                    : 'Automatically remove new messages after duration'}
                </p>
              </div>
            </div>

            {/* Options grid */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {disappearingOptions.map((opt) => {
                const isSelected = disappearingDuration === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleDisappearingChange(opt.value)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold text-center transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[#087F75] text-white border-[#087F75] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {isRtl ? opt.labelAr : opt.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CHAT WALLPAPER SETTING */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-2xl border border-slate-300 shadow-xs flex items-center justify-center shrink-0 overflow-hidden"
                style={resolveWallpaperStyle(chat.wallpaperBy?.[currentUserId] || chat.wallpaper).style}
              >
                <Palette className="w-5 h-5 text-slate-700/70" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">
                  {isRtl ? 'خلفية المحادثة' : 'Chat Wallpaper'}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  {chat.wallpaperBy?.[currentUserId] || chat.wallpaper
                    ? (isRtl ? 'خلفية مخصصة' : 'Custom Wallpaper')
                    : (isRtl ? 'النمط الافتراضي' : 'Default Dots')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsWallpaperModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#087F75] border border-[#087F75]/30 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
            >
              <span>{isRtl ? 'تغيير' : 'Change'}</span>
              {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Channel Specific Admin Controls */}
          {isChannel && isAdmin && (
            <div className="space-y-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                {isRtl ? 'إعدادات المشرف' : 'Admin Controls'}
              </span>

              {/* Toggle Public / Private */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPublic ? <Globe className="w-4 h-4 text-[#087F75]" /> : <Lock className="w-4 h-4 text-slate-700" />}
                  <span className="text-xs font-bold text-slate-800">
                    {isRtl ? 'قناة عامة (قابلة للاكتشاف)' : 'Public Channel'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    disabled={isSaving}
                    onChange={(e) => handleTogglePublic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#087F75]"></div>
                </label>
              </div>

              {/* Allow Member Posting */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    {isRtl ? 'السماح للأعضاء بالنشر' : 'Allow Member Posting'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowMemberPosts}
                    disabled={isSaving}
                    onChange={(e) => handleToggleAllowMemberPosts(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#087F75]"></div>
                </label>
              </div>
            </div>
          )}

          {/* Group Members List */}
          {isGroup && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {participantIds.length} {isRtl ? 'المشاركون' : 'Participants'}
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAddMembersFlow}
                    className="text-xs text-[#087F75] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'إضافة أعضاء' : 'Add Members'}</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {participantIds.map((uid) => {
                  const detail = chat.participantDetails?.[uid];
                  const isUserAdmin =
                    uid === chat.createdBy ||
                    chat.adminIds?.includes(uid) ||
                    detail?.role === 'admin';
                  const isMe = uid === currentUserId;

                  return (
                    <div
                      key={uid}
                      className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs overflow-hidden">
                          {detail?.avatarUrl ? (
                            <img src={detail.avatarUrl} alt={detail.name} className="w-full h-full object-cover" />
                          ) : (
                            detail?.name?.[0] || 'U'
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            {detail?.name || (isMe ? currentUserProfile.name : 'Member')}
                            {isMe && <span className="text-[#087F75] font-medium ml-1">({isRtl ? 'أنت' : 'You'})</span>}
                          </p>
                          {detail?.phone && (
                            <p className="text-[10px] text-slate-400 font-medium" dir="ltr">
                              {detail.phone}
                            </p>
                          )}
                        </div>
                      </div>

                      {isUserAdmin && (
                        <span className="px-2 py-0.5 rounded-md bg-teal-100 text-[#087F75] text-[10px] font-bold">
                          {isRtl ? 'مشرف' : 'Admin'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leave Button for Groups / Channels */}
          {!isOneOnOne && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleLeave}
                disabled={isLeaving}
                className="w-full py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-red-200/60"
              >
                {isLeaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>
                      {isChannel
                        ? isRtl ? 'إلغاء الاشتراك ومغادرة القناة' : 'Leave Channel'
                        : isRtl ? 'مغادرة المجموعة' : 'Leave Group'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Block / Unblock Contact for 1-on-1 Chats */}
          {isOneOnOne && recipientId && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleToggleBlockContact}
                disabled={isBlocking}
                className={`w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer border ${
                  isContactBlocked
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200/60'
                }`}
              >
                {isBlocking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    <span>
                      {isContactBlocked
                        ? isRtl
                          ? `إلغاء حظر ${title}`
                          : `Unblock ${title}`
                        : isRtl
                        ? `حظر ${title}`
                        : `Block ${title}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Chat Wallpaper Customization Modal */}
      {isWallpaperModalOpen && (
        <ChatWallpaperModal
          isOpen={isWallpaperModalOpen}
          onClose={() => setIsWallpaperModalOpen(false)}
          language={language}
          chat={chat}
          currentUserId={currentUserId}
          onWallpaperChanged={(newWallpaper) => {
            onChatUpdated?.({
              ...chat,
              wallpaper: newWallpaper,
              wallpaperBy: {
                ...(chat.wallpaperBy || {}),
                [currentUserId]: newWallpaper || 'default',
              },
            });
          }}
        />
      )}
    </div>
  );
};
