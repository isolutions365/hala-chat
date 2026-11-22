import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
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
} from 'lucide-react';
import { Language, ChatModel, ContactItem, UserProfile } from '../types';
import { updateGroupInfo, addMembersToGroup, leaveGroupChat, fetchUsersForContactPicker } from '../lib/firebase';
import { compressImage } from '../lib/media';

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  chat: ChatModel;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onGroupUpdated?: (updatedChat: ChatModel) => void;
  onLeftGroup?: () => void;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  isOpen,
  onClose,
  language,
  chat,
  currentUserId,
  currentUserProfile,
  onGroupUpdated,
  onLeftGroup,
}) => {
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin =
    chat.createdBy === currentUserId ||
    (chat.adminIds && chat.adminIds.includes(currentUserId)) ||
    chat.participantDetails?.[currentUserId]?.role === 'admin';

  const [groupName, setGroupName] = useState(chat.name || chat.title || 'Group');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(chat.avatarUrl || null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);

  // Add members sub-flow
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<ContactItem[]>([]);
  const [selectedNewMembers, setSelectedNewMembers] = useState<ContactItem[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGroupName(chat.name || chat.title || 'Group');
      setGroupAvatar(chat.avatarUrl || null);
      setIsEditingName(false);
      setIsAddMembersOpen(false);
    }
  }, [isOpen, chat]);

  // Load contacts for adding members
  const openAddMembersFlow = async () => {
    setIsAddMembersOpen(true);
    setIsLoadingContacts(true);
    setSelectedNewMembers([]);
    try {
      const all = await fetchUsersForContactPicker(currentUserId);
      // Filter out existing participants
      const nonParticipants = all.filter((c) => !chat.participants.includes(c.id));
      setAvailableContacts(nonParticipants);
    } catch (err) {
      console.warn('Failed to load contacts for group add:', err);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { dataUrl } = await compressImage(file, 400, 400, 0.8);
      setGroupAvatar(dataUrl);
      if (isAdmin) {
        await updateGroupInfo(chat.id, groupName, dataUrl);
        onGroupUpdated?.({
          ...chat,
          avatarUrl: dataUrl,
        });
      }
    } catch (err) {
      console.warn('Failed to compress group avatar:', err);
    }
  };

  const handleSaveName = async () => {
    if (!groupName.trim() || !isAdmin) return;
    setIsSavingName(true);
    try {
      await updateGroupInfo(chat.id, groupName.trim(), groupAvatar);
      setIsEditingName(false);
      onGroupUpdated?.({
        ...chat,
        name: groupName.trim(),
        title: groupName.trim(),
      });
    } catch (err) {
      console.warn('Failed to save group name:', err);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleConfirmAddMembers = async () => {
    if (selectedNewMembers.length === 0) return;
    setIsAddingMembers(true);
    try {
      await addMembersToGroup(chat.id, selectedNewMembers, chat);
      setIsAddMembersOpen(false);
      onGroupUpdated?.({
        ...chat,
        participants: [...chat.participants, ...selectedNewMembers.map((m) => m.id)],
      });
    } catch (err) {
      console.warn('Failed to add members to group:', err);
    } finally {
      setIsAddingMembers(false);
    }
  };

  const handleLeaveGroup = async () => {
    const confirmText = isRtl
      ? 'هل أنت متأكد من مغادرة هذه المجموعة؟'
      : 'Are you sure you want to leave this group?';
    if (!window.confirm(confirmText)) return;

    setIsLeaving(true);
    try {
      await leaveGroupChat(chat.id, currentUserId);
      onClose();
      onLeftGroup?.();
    } catch (err) {
      console.warn('Failed to leave group:', err);
      setIsLeaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md h-[88vh] sm:h-[640px] bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#087F75]/10 text-[#087F75] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {isRtl ? 'معلومات المجموعة' : 'Group Info'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Group Avatar & Name Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col items-center text-center relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                className="hidden"
              />

              {/* Group Avatar */}
              <div className="relative group mb-3">
                <div className="w-20 h-20 rounded-full bg-[#087F75] text-white flex items-center justify-center font-bold text-2xl overflow-hidden shadow-md">
                  {groupAvatar ? (
                    <img src={groupAvatar} alt={groupName} className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-10 h-10" />
                  )}
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 bg-slate-900 hover:bg-[#087F75] text-white rounded-full flex items-center justify-center shadow-md cursor-pointer transition-colors"
                    title={isRtl ? 'تغيير صورة المجموعة' : 'Change group photo'}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Group Name (Editable by Admin) */}
              {isEditingName ? (
                <div className="flex items-center gap-2 w-full max-w-[280px]">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    maxLength={40}
                    autoFocus
                    className="flex-1 py-1.5 px-3 text-center font-bold text-slate-900 bg-slate-50 border border-[#087F75] rounded-lg outline-hidden text-base"
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={isSavingName}
                    className="p-2 bg-[#087F75] text-white rounded-lg hover:bg-[#06685F] cursor-pointer"
                  >
                    {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{groupName}</h2>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      className="p-1 text-slate-400 hover:text-[#087F75] rounded-md transition-colors cursor-pointer"
                      title={isRtl ? 'تعديل اسم المجموعة' : 'Edit group name'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-400 mt-1">
                {isRtl
                  ? `${chat.participants.length} أعضاء`
                  : `${chat.participants.length} members`}
              </p>
            </div>

            {/* Member List Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {isRtl ? 'الأعضاء' : 'Members'} ({chat.participants.length})
                </span>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAddMembersFlow}
                    className="flex items-center gap-1 text-xs font-bold text-[#087F75] hover:text-[#06685F] cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'إضافة أعضاء' : 'Add Members'}</span>
                  </button>
                )}
              </div>

              {/* Members */}
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {chat.participants.map((pid) => {
                  const details = chat.participantDetails?.[pid];
                  const isMemberAdmin =
                    chat.createdBy === pid ||
                    chat.adminIds?.includes(pid) ||
                    details?.role === 'admin';
                  const isSelf = pid === currentUserId;

                  const displayName = isSelf
                    ? `${currentUserProfile.name} (${isRtl ? 'أنت' : 'You'})`
                    : details?.name || 'User';

                  const avatar = isSelf ? currentUserProfile.avatarUrl : details?.avatarUrl;

                  return (
                    <div key={pid} className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                          {avatar ? (
                            <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{displayName.charAt(0).toUpperCase()}</span>
                          )}
                        </div>

                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {displayName}
                            </span>
                            {pid.startsWith('hala_support') && (
                              <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {details?.phone || (isSelf ? currentUserProfile.phoneNumber : '')}
                          </p>
                        </div>
                      </div>

                      {isMemberAdmin && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-[#087F75]/10 text-[#087F75] rounded-full text-[10px] font-bold shrink-0">
                          <ShieldCheck className="w-3 h-3" />
                          <span>{isRtl ? 'مشرف' : 'Admin'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leave Group Button */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={handleLeaveGroup}
                disabled={isLeaving}
                className="w-full p-4 flex items-center justify-center gap-2 text-rose-600 hover:bg-rose-50 font-bold text-sm transition-colors cursor-pointer"
              >
                {isLeaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>{isRtl ? 'مغادرة المجموعة' : 'Leave Group'}</span>
              </button>
            </div>
          </div>

          {/* Add Members Drawer */}
          {isAddMembersOpen && (
            <div className="absolute inset-0 bg-white z-20 flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#087F75]" />
                  <h3 className="font-bold text-slate-900 text-base">
                    {isRtl ? 'إضافة أعضاء إلى المجموعة' : 'Add Members'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddMembersOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-slate-50">
                {isLoadingContacts ? (
                  <div className="h-48 flex items-center justify-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                  </div>
                ) : availableContacts.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-center px-4">
                    <p className="text-xs">
                      {isRtl
                        ? 'جميع جهات الاتصال مضافة بالفعل إلى المجموعة'
                        : 'All your contacts are already in this group'}
                    </p>
                  </div>
                ) : (
                  availableContacts.map((contact) => {
                    const isSelected = selectedNewMembers.some((m) => m.id === contact.id);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => {
                          setSelectedNewMembers((prev) =>
                            isSelected
                              ? prev.filter((m) => m.id !== contact.id)
                              : [...prev, contact]
                          );
                        }}
                        className={`w-full p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#087F75]/8 border border-[#087F75]/20'
                            : 'bg-white hover:bg-slate-100/80 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm overflow-hidden">
                            {contact.avatar_url ? (
                              <img
                                src={contact.avatar_url}
                                alt={contact.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{contact.name.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="text-left" dir="auto">
                            <span className="font-semibold text-slate-900 text-sm block">
                              {contact.name}
                            </span>
                            <span className="text-xs text-slate-400">{contact.phone}</span>
                          </div>
                        </div>

                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? 'bg-[#087F75] text-white'
                              : 'border-2 border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddMembersOpen(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={selectedNewMembers.length === 0 || isAddingMembers}
                  onClick={handleConfirmAddMembers}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                    selectedNewMembers.length > 0 && !isAddingMembers
                      ? 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-md shadow-[#087F75]/25'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isAddingMembers ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>
                      {isRtl
                        ? `إضافة (${selectedNewMembers.length})`
                        : `Add (${selectedNewMembers.length})`}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
