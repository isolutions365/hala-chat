import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  X,
  User,
  Phone,
  Check,
  MessageSquare,
  QrCode,
  ScanLine,
  UserPlus,
  BookUser,
  Share2,
  Shield,
  Loader2,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { Language, ContactItem, UserProfile } from '../types';
import { fetchUsersForContactPicker, saveUserContact } from '../lib/firebase';
import { LazyImage } from './LazyImage';
import {
  isContactPickerSupported,
  pickPhoneContacts,
  normalizeToE164,
  matchContactsCallable,
  shareContactInvite,
  getWhatsAppInviteUrl,
  getRandomInviteMessage,
  getPublicAppUrl,
  UnmatchedContact,
} from '../services/contactsImport';

interface ContactPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  currentUserProfile?: UserProfile;
  onSelectContact: (contact: ContactItem) => void;
  onOpenQrModal?: (tab: 'my_code' | 'scan') => void;
}

const CONSENT_STORAGE_KEY = 'hala_contacts_consent_ack';

export const ContactPickerModal: React.FC<ContactPickerModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  currentUserProfile,
  onSelectContact,
  onOpenQrModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [unmatchedContacts, setUnmatchedContacts] = useState<UnmatchedContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Manual phone entry toggle (default shown if Contact Picker API not supported)
  const contactPickerSupported = isContactPickerSupported();
  const [showManualAdd, setShowManualAdd] = useState(!contactPickerSupported);
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');

  // Consent modal state
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'picker' | 'manual' | null>(null);

  // Status banners
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const isRtl = language === 'ar';

  const userDialCode =
    currentUserProfile?.country?.dialCode ||
    (currentUserProfile?.phoneNumber?.startsWith('+92')
      ? '+92'
      : currentUserProfile?.phoneNumber?.startsWith('+91')
      ? '+91'
      : '+966');

  const hasAcknowledgedConsent = () => {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true';
  };

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSearchQuery('');
      setSelectedId(null);
      setStatusMessage(null);
      fetchUsersForContactPicker(currentUserId)
        .then((items) => {
          setContacts(items);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, currentUserId]);

  const handleContactClick = (contact: ContactItem) => {
    setSelectedId(contact.id);
    setTimeout(() => {
      onSelectContact(contact);
    }, 150);
  };

  const handleConsentAccept = () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'true');
    setShowConsentModal(false);
    if (pendingAction === 'picker') {
      runPickerImport();
    } else if (pendingAction === 'manual') {
      runManualAdd();
    }
    setPendingAction(null);
  };

  const handleConsentCancel = () => {
    setShowConsentModal(false);
    setPendingAction(null);
  };

  // Trigger Contact Picker API with consent check
  const onImportPhoneContactsClick = () => {
    if (!hasAcknowledgedConsent()) {
      setPendingAction('picker');
      setShowConsentModal(true);
      return;
    }
    runPickerImport();
  };

  const runPickerImport = async () => {
    setStatusMessage(null);
    setIsMatching(true);
    try {
      const rawPicked = await pickPhoneContacts();
      if (!rawPicked || rawPicked.length === 0) {
        setIsMatching(false);
        return;
      }

      const numberToName = new Map<string, string>();
      const validNumbers: string[] = [];

      for (const item of rawPicked) {
        const norm = normalizeToE164(item.phone, userDialCode);
        if (norm && norm !== currentUserProfile?.phoneNumber) {
          numberToName.set(norm, item.name || 'Contact');
          validNumbers.push(norm);
        }
      }

      const uniqueNumbers = Array.from(new Set(validNumbers));
      if (uniqueNumbers.length === 0) {
        setStatusMessage({
          type: 'info',
          text: isRtl
            ? 'لم يتم العثور على أرقام هواتف صالحة'
            : 'No valid phone numbers found.',
        });
        setIsMatching(false);
        return;
      }

      // Max 200 per call
      const batch = uniqueNumbers.slice(0, 200);
      const matches = await matchContactsCallable(batch);

      const matchedPhones = new Set<string>();
      const newlySaved: ContactItem[] = [];

      for (const match of matches) {
        matchedPhones.add(match.phone);
        const contactName = numberToName.get(match.phone) || match.name || 'Contact';
        const contactItem: ContactItem = {
          id: match.uid,
          name: contactName,
          phone: match.phone,
          avatar_url: match.avatar_url,
          status: "Hey there, I'm using Hala",
          public_key: match.public_key || undefined,
        };

        await saveUserContact(currentUserId, contactItem);
        newlySaved.push(contactItem);
      }

      // Update on-Hala list
      setContacts((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const toAdd = newlySaved.filter((c) => !existingIds.has(c.id));
        return [...toAdd, ...prev];
      });

      // Filter unmatched contacts
      const newUnmatched: UnmatchedContact[] = [];
      const existingUnmatchedPhones = new Set(unmatchedContacts.map((u) => u.phone));
      for (const num of uniqueNumbers) {
        if (!matchedPhones.has(num) && !existingUnmatchedPhones.has(num)) {
          newUnmatched.push({
            name: numberToName.get(num) || 'Contact',
            phone: num,
          });
        }
      }

      if (newUnmatched.length > 0) {
        setUnmatchedContacts((prev) => [...newUnmatched, ...prev]);
      }

      setStatusMessage({
        type: 'success',
        text: isRtl
          ? `تم العثور على ${matches.length} على هلا، و${newUnmatched.length} متاح للدعوة`
          : `Found ${matches.length} on Hala, ${newUnmatched.length} to invite`,
      });
    } catch (err: any) {
      console.error('[Contacts] Picker import error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || (isRtl ? 'تعذر استيراد جهات الاتصال' : 'Could not import contacts.'),
      });
    } finally {
      setIsMatching(false);
    }
  };

  // Manual Add Form Submission
  const onManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPhone.trim()) return;

    if (!hasAcknowledgedConsent()) {
      setPendingAction('manual');
      setShowConsentModal(true);
      return;
    }
    runManualAdd();
  };

  const runManualAdd = async () => {
    setStatusMessage(null);
    const normalized = normalizeToE164(manualPhone, userDialCode);
    if (!normalized) {
      setStatusMessage({
        type: 'error',
        text: isRtl
          ? 'يرجى إدخال رقم هاتف صحيح مع رمز الدولة'
          : 'Please enter a valid phone number with country code.',
      });
      return;
    }

    if (normalized === currentUserProfile?.phoneNumber) {
      setStatusMessage({
        type: 'error',
        text: isRtl ? 'لا يمكنك إضافة رقم هاتفك الخاص' : 'You cannot add your own number.',
      });
      return;
    }

    setIsMatching(true);
    try {
      const matches = await matchContactsCallable([normalized]);
      const match = matches[0];
      const contactName = manualName.trim() || match?.name || normalized;

      if (match) {
        const contactItem: ContactItem = {
          id: match.uid,
          name: contactName,
          phone: match.phone,
          avatar_url: match.avatar_url,
          status: "Hey there, I'm using Hala",
          public_key: match.public_key || undefined,
        };
        await saveUserContact(currentUserId, contactItem);
        setContacts((prev) => {
          if (prev.some((c) => c.id === match.uid)) return prev;
          return [contactItem, ...prev];
        });
        setStatusMessage({
          type: 'success',
          text: isRtl
            ? `تم العثور على ${contactName} على هلا وتمت إضافته إلى جهات اتصالك!`
            : `Found ${contactName} on Hala and added to contacts!`,
        });
        setManualPhone('');
        setManualName('');
      } else {
        const unmatchedItem: UnmatchedContact = {
          name: contactName,
          phone: normalized,
        };
        setUnmatchedContacts((prev) => {
          if (prev.some((u) => u.phone === normalized)) return prev;
          return [unmatchedItem, ...prev];
        });
        setStatusMessage({
          type: 'info',
          text: isRtl
            ? `${contactName} ليس على هلا بعد. يمكنك دعوته الآن أدناه!`
            : `${contactName} is not on Hala yet. You can invite them below!`,
        });
        setManualPhone('');
        setManualName('');
      }
    } catch (err: any) {
      console.error('[Contacts] Manual check error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || (isRtl ? 'تعذر التحقق من الرقم' : 'Could not check phone number.'),
      });
    } finally {
      setIsMatching(false);
    }
  };

  const handleInvite = async (unmatched: UnmatchedContact) => {
    try {
      await shareContactInvite(unmatched, language);
    } catch (err) {
      console.error('[Contacts] Invite error:', err);
    }
  };

  // Filtered contacts based on search query
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.status && c.status.toLowerCase().includes(q))
    );
  });

  const filteredUnmatched = unmatchedContacts.filter((u) => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.phone.includes(q);
  });

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
          className="w-full sm:max-w-md h-[90vh] sm:h-[680px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#087F75]/10 text-[#087F75] flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base leading-tight">
                  {isRtl ? 'محادثة جديدة' : 'New Chat'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isRtl ? 'اختر جهة اتصال لبدء الدردشة' : 'Select a contact to start messaging'}
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

          {/* Action and Search Controls */}
          <div className="p-3 bg-slate-50 border-b border-slate-100 shrink-0 space-y-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search
                className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 ${
                  isRtl ? 'right-3' : 'left-3'
                }`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isRtl ? 'بحث بالاسم أو رقم الهاتف...' : 'Search by name or phone...'}
                className={`w-full h-10 ${
                  isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                } bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#087F75] focus:ring-1 focus:ring-[#087F75]/20 transition-all`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className={`absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'left-3' : 'right-3'
                  } text-slate-400 hover:text-slate-600`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Import Contacts & Add by Phone Action Row */}
            <div className="flex items-center gap-2">
              {contactPickerSupported ? (
                <button
                  type="button"
                  disabled={isMatching}
                  onClick={onImportPhoneContactsClick}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-[#087F75] hover:bg-[#06635c] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  {isMatching ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BookUser className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isRtl ? 'استيراد من جهات اتصال الهاتف' : 'Import from phone contacts'}
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setShowManualAdd((prev) => !prev)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 ${
                  showManualAdd
                    ? 'bg-teal-50 border-[#087F75] text-[#087F75]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                } border rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer ${
                  contactPickerSupported ? '' : 'flex-1'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isRtl ? 'إضافة برقم الهاتف' : 'Add by phone number'}</span>
              </button>
            </div>

            {/* Manual Phone Input Form */}
            {showManualAdd && (
              <form
                onSubmit={onManualAddSubmit}
                className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>{isRtl ? 'إضافة جهة اتصال برقم الهاتف' : 'Add contact by phone number'}</span>
                  <span className="text-[10px] text-slate-400">
                    {isRtl ? `الرمز الافتراضي: ${userDialCode}` : `Default: ${userDialCode}`}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder={isRtl ? 'رقم الهاتف (مثال: 0501234567)' : 'Phone number (e.g. 0501234567)'}
                    className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#087F75]"
                    dir="ltr"
                  />
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder={isRtl ? 'الاسم (اختياري)' : 'Name (optional)'}
                    className="w-28 sm:w-32 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#087F75]"
                  />
                  <button
                    type="submit"
                    disabled={isMatching || !manualPhone.trim()}
                    className="px-3.5 h-9 bg-[#087F75] hover:bg-[#06635c] text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    {isMatching ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      isRtl ? 'تحقق' : 'Check'
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {isRtl
                    ? 'سوف يتحقق هلا من جهات الاتصال المحددة لمعرفة من يستخدم هلا. لا يتم حفظ الأرقام.'
                    : 'Hala will check which of your selected contacts use Hala. Numbers are not stored.'}
                </p>
              </form>
            )}

            {/* Scan QR Quick Actions */}
            {onOpenQrModal && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQrModal('scan');
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-teal-50/60 hover:bg-teal-100/60 border border-[#087F75]/20 text-[#087F75] rounded-xl text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'مسح رمز QR لجهة اتصال' : 'Scan Contact QR'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQrModal('my_code');
                  }}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isRtl ? 'رمزي' : 'My Code'}</span>
                </button>
              </div>
            )}

            {/* Notification / Status Message */}
            {statusMessage && (
              <div
                className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : statusMessage.type === 'error'
                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}
              >
                <span>{statusMessage.text}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Contacts List Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                <div className="w-6 h-6 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">
                  {isRtl ? 'جاري تحميل جهات الاتصال...' : 'Loading contacts...'}
                </span>
              </div>
            ) : filteredContacts.length === 0 && filteredUnmatched.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-slate-400 gap-1.5 p-6 text-center">
                <User className="w-9 h-9 stroke-[1.5] text-slate-300 mb-1" />
                <span className="text-xs font-semibold text-slate-700">
                  {isRtl ? 'لم يتم العثور على جهات اتصال' : 'No contacts found'}
                </span>
                <span className="text-[11px] text-slate-400 max-w-xs">
                  {isRtl
                    ? 'استورد من جهات اتصال هاتفك أو أضف برقم الهاتف لبدء المحادثة'
                    : 'Import from phone contacts or add by phone number to start chatting'}
                </span>
              </div>
            ) : (
              <>
                {/* On Hala Section */}
                {filteredContacts.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#087F75]" />
                        {isRtl ? 'على هلا' : 'On Hala'}
                      </span>
                      <span className="text-[10px] bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                        {filteredContacts.length}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {filteredContacts.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => handleContactClick(contact)}
                          className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer min-h-[56px] ${
                            selectedId === contact.id ? 'bg-[#087F75]/5' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center overflow-hidden text-sm">
                                {contact.avatar_url ? (
                                  <LazyImage
                                    src={contact.avatar_url}
                                    alt={contact.name}
                                    aspectRatio="1/1"
                                    containerClassName="w-full h-full rounded-full"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span>{contact.name.charAt(0).toUpperCase()}</span>
                                )}
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 text-sm truncate">
                                  {contact.name}
                                </span>
                                {contact.id.startsWith('hala_support') && (
                                  <span className="bg-[#087F75]/10 text-[#087F75] text-[10px] px-1.5 py-0.2 rounded-md font-medium">
                                    {isRtl ? 'رسمي' : 'Official'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                                <span className="truncate">{contact.status || contact.phone}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {selectedId === contact.id ? (
                              <div className="w-6 h-6 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-xs">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <span className="text-[11px] font-mono text-slate-400" dir="ltr">
                                {contact.phone}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invite to Hala Section */}
                {filteredUnmatched.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                      <span className="flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5 text-slate-500" />
                        {isRtl ? 'دعوة إلى هلا' : 'Invite to Hala'}
                      </span>
                      <span className="text-[10px] bg-slate-200/70 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                        {filteredUnmatched.length}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {filteredUnmatched.map((unmatched, idx) => (
                        <div
                          key={`unmatched-${idx}-${unmatched.phone}`}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-bold flex items-center justify-center shrink-0 text-xs">
                              {unmatched.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800 text-sm truncate">
                                {unmatched.name}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono truncate" dir="ltr">
                                {unmatched.phone}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Native Share / Invite Button */}
                            <button
                              type="button"
                              onClick={() => handleInvite(unmatched)}
                              className="flex items-center gap-1 py-1.5 px-3 bg-teal-50 hover:bg-teal-100 border border-[#087F75]/30 text-[#087F75] rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
                            >
                              <Share2 className="w-3 h-3" />
                              <span>{isRtl ? 'دعوة' : 'Invite'}</span>
                            </button>

                            {/* Direct WhatsApp Share Fallback Button */}
                            <a
                              href={getWhatsAppInviteUrl(
                                unmatched.phone,
                                `${getRandomInviteMessage(language)} ${getPublicAppUrl()}`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition cursor-pointer"
                              title={isRtl ? 'دعوة عبر واتساب' : 'Invite via WhatsApp'}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Consent Modal Dialog */}
          {showConsentModal && (
            <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl text-center space-y-4"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="w-12 h-12 rounded-full bg-teal-50 text-[#087F75] mx-auto flex items-center justify-center shadow-inner">
                  <Shield className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-base">
                    {isRtl ? 'استكشاف جهات الاتصال' : 'Contact Discovery'}
                  </h4>
                  <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                    {isRtl
                      ? 'سوف يتحقق هلا من جهات الاتصال المحددة لمعرفة من يستخدم هلا. لا يتم حفظ الأرقام.'
                      : 'Hala will check which of your selected contacts use Hala. Numbers are not stored.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleConsentCancel}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer"
                  >
                    {isRtl ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConsentAccept}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#087F75] hover:bg-[#06635c] text-white font-semibold text-xs shadow-md transition cursor-pointer"
                  >
                    {isRtl ? 'متابعة' : 'Continue'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
