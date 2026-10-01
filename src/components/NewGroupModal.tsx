import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  X,
  Check,
  Camera,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { Language, ContactItem, UserProfile } from '../types';
import { fetchUsersForContactPicker, createNewGroupChat } from '../lib/firebase';
import { compressImage } from '../lib/media';

interface NewGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile: UserProfile;
  onGroupCreated: (groupId: string) => void;
}

export const NewGroupModal: React.FC<NewGroupModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
  onGroupCreated,
}) => {
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ContactItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [isLoadingContacts, setIsLoadingContacts] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedContacts([]);
      setSearchQuery('');
      setGroupName('');
      setGroupAvatar(null);
      setErrorMessage(null);
      setIsLoadingContacts(true);

      fetchUsersForContactPicker(currentUserId)
        .then((items) => {
          setContacts(items);
        })
        .finally(() => {
          setIsLoadingContacts(false);
        });
    }
  }, [isOpen, currentUserId]);

  const toggleContactSelection = (contact: ContactItem) => {
    setErrorMessage(null);
    setSelectedContacts((prev) => {
      const exists = prev.some((c) => c.id === contact.id);
      if (exists) {
        return prev.filter((c) => c.id !== contact.id);
      } else {
        return [...prev, contact];
      }
    });
  };

  const removeSelectedContact = (contactId: string) => {
    setSelectedContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.status && c.status.toLowerCase().includes(q))
    );
  });

  // Handle avatar upload with client-side compression
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { dataUrl } = await compressImage(file, 400, 400, 0.8);
      setGroupAvatar(dataUrl);
    } catch (err) {
      console.warn('Failed to compress avatar:', err);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setErrorMessage(isRtl ? 'يرجى إدخال اسم المجموعة' : 'Please enter a group name');
      return;
    }

    if (selectedContacts.length === 0) {
      setErrorMessage(isRtl ? 'يرجى اختيار عضو واحد على الأقل' : 'Please select at least 1 member');
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const groupId = await createNewGroupChat({
        creatorId: currentUserId,
        creatorProfile: currentUserProfile,
        groupName: groupName.trim(),
        groupAvatarUrl: groupAvatar,
        selectedContacts,
      });

      setIsCreating(false);
      onGroupCreated(groupId);
      onClose();
    } catch (err: any) {
      console.error('Error creating group chat:', err);
      setErrorMessage(
        err?.message || (isRtl ? 'حدث خطأ أثناء إنشاء المجموعة' : 'Failed to create group')
      );
      setIsCreating(false);
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
          className="w-full sm:max-w-md h-[85vh] sm:h-[620px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              {step === 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title={isRtl ? 'رجوع' : 'Back'}
                >
                  {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
                </button>
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#087F75]/10 text-[#087F75] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              )}

              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {step === 1
                    ? isRtl
                      ? 'مجموعة جديدة'
                      : 'New Group'
                    : isRtl
                    ? 'معلومات المجموعة'
                    : 'Group Info'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {step === 1
                    ? isRtl
                      ? `${selectedContacts.length} جهات اتصال محددة`
                      : `${selectedContacts.length} selected`
                    : isRtl
                    ? 'أدخل اسم وصورة المجموعة'
                    : 'Provide group name & photo'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* STEP 1: Select Contacts */}
          {step === 1 && (
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
              {/* Search Bar */}
              <div className="p-3 bg-white border-b border-slate-100 shrink-0">
                <div className="relative flex items-center">
                  <Search
                    className={`w-4 h-4 text-slate-400 absolute ${
                      isRtl ? 'right-3.5' : 'left-3.5'
                    } pointer-events-none`}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isRtl ? 'بحث في جهات الاتصال...' : 'Search contacts...'}
                    className={`w-full py-2 bg-slate-100 border border-transparent focus:border-[#087F75]/40 focus:bg-white text-slate-800 text-sm rounded-xl outline-hidden transition-all ${
                      isRtl ? 'pr-9.5 pl-4 text-right' : 'pl-9.5 pr-4 text-left'
                    }`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className={`absolute ${isRtl ? 'left-3' : 'right-3'} p-1 text-slate-400 hover:text-slate-600`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Contacts Tray */}
              {selectedContacts.length > 0 && (
                <div className="px-4 py-2.5 bg-white border-b border-slate-100 shrink-0 overflow-x-auto flex items-center gap-3 no-scrollbar">
                  {selectedContacts.map((contact) => (
                    <motion.div
                      key={contact.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex flex-col items-center gap-1 shrink-0 relative group"
                    >
                      <div className="relative">
                        <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm overflow-hidden ring-2 ring-[#087F75]/20">
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
                        <button
                          type="button"
                          onClick={() => removeSelectedContact(contact.id)}
                          className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-slate-700 hover:bg-rose-500 text-white rounded-full flex items-center justify-center shadow-xs cursor-pointer transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-600 font-medium max-w-[50px] truncate text-center">
                        {contact.name.split(' ')[0]}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Contact List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoadingContacts ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                    <p className="text-xs">{isRtl ? 'جاري تحميل جهات الاتصال...' : 'Loading contacts...'}</p>
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-center px-4">
                    <p className="text-xs">{isRtl ? 'لا توجد جهات اتصال مطابقة' : 'No contacts found'}</p>
                  </div>
                ) : (
                  filteredContacts.map((contact) => {
                    const isSelected = selectedContacts.some((c) => c.id === contact.id);

                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleContactSelection(contact)}
                        className={`w-full p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'bg-[#087F75]/8 border border-[#087F75]/20'
                            : 'bg-white hover:bg-slate-100/80 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar */}
                          <div className="relative">
                            <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm overflow-hidden">
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
                          </div>

                          {/* Contact Info */}
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 text-sm truncate">
                                {contact.name}
                              </span>
                              {contact.id.startsWith('hala_support') && (
                                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate">
                              {contact.status || contact.phone}
                            </p>
                          </div>
                        </div>

                        {/* Checkbox indicator */}
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? 'bg-[#087F75] text-white shadow-xs'
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

              {/* Bottom Step 1 Action Bar */}
              <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  disabled={selectedContacts.length === 0}
                  onClick={() => setStep(2)}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                    selectedContacts.length > 0
                      ? 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-[#087F75]/25'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  <span>{isRtl ? 'التالي' : 'Next'}</span>
                  {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Group Info (Avatar & Name) */}
          {step === 2 && (
            <div className="flex-1 flex flex-col justify-between p-6 bg-slate-50 overflow-y-auto">
              <div className="space-y-6">
                {/* Avatar Upload */}
                <div className="flex flex-col items-center justify-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-24 h-24 rounded-full bg-slate-200 hover:bg-slate-300 border-2 border-dashed border-[#087F75]/40 flex flex-col items-center justify-center text-slate-500 overflow-hidden cursor-pointer transition-all shadow-inner relative"
                    >
                      {groupAvatar ? (
                        <img
                          src={groupAvatar}
                          alt="Group avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <Camera className="w-7 h-7 text-[#087F75] mb-1" />
                          <span className="text-[10px] font-medium text-slate-500">
                            {isRtl ? 'صورة' : 'Photo'}
                          </span>
                        </>
                      )}
                    </button>

                    {groupAvatar && (
                      <button
                        type="button"
                        onClick={() => setGroupAvatar(null)}
                        className="absolute -top-1 -right-1 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md cursor-pointer hover:bg-rose-600"
                        title={isRtl ? 'إزالة الصورة' : 'Remove photo'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {isRtl ? 'صورة المجموعة (اختياري)' : 'Group icon (optional)'}
                  </p>
                </div>

                {/* Group Name Input */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    {isRtl ? 'اسم المجموعة' : 'Group Name'} <span className="text-[#087F75]">*</span>
                  </label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => {
                      setGroupName(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    maxLength={40}
                    placeholder={
                      isRtl ? 'مثال: الأصدقاء، العائلة، العمل...' : 'e.g. Family, Friends, Project...'
                    }
                    className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 focus:border-[#087F75] focus:bg-white text-slate-900 text-sm rounded-xl outline-hidden transition-all"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-400 px-1">
                    <span>{isRtl ? 'الاسم مطلوب' : 'Name is required'}</span>
                    <span>{groupName.length}/40</span>
                  </div>
                </div>

                {/* Members Summary */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>{isRtl ? 'الأعضاء' : 'Members'}</span>
                    <span className="text-[#087F75]">{selectedContacts.length + 1}</span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {/* Creator avatar */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="w-9 h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center font-bold text-xs ring-2 ring-[#087F75]/30">
                        {currentUserProfile.avatarUrl ? (
                          <img
                            src={currentUserProfile.avatarUrl}
                            alt={currentUserProfile.name}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          currentUserProfile.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500 font-medium truncate max-w-[44px]">
                        {isRtl ? 'أنت (مشرف)' : 'You (Admin)'}
                      </span>
                    </div>

                    {/* Selected Contacts avatars */}
                    {selectedContacts.map((c) => (
                      <div key={c.id} className="flex flex-col items-center gap-1 shrink-0">
                        <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs overflow-hidden">
                          {c.avatar_url ? (
                            <img src={c.avatar_url} alt={c.name} className="w-full h-full object-cover" />
                          ) : (
                            c.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span className="text-[9px] text-slate-500 font-medium truncate max-w-[44px]">
                          {c.name.split(' ')[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {errorMessage && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                    {errorMessage}
                  </p>
                )}
              </div>

              {/* Create Button */}
              <div className="pt-4 shrink-0">
                <button
                  type="button"
                  disabled={isCreating || !groupName.trim()}
                  onClick={handleCreateGroup}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                    groupName.trim() && !isCreating
                      ? 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-[#087F75]/30'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isRtl ? 'جاري إنشاء المجموعة...' : 'Creating group...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{isRtl ? 'إنشاء المجموعة' : 'Create Group'}</span>
                    </>
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
