import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, User, Phone, Check, Sparkles, MessageSquare, QrCode, ScanLine } from 'lucide-react';
import { Language, ContactItem } from '../types';
import { fetchUsersForContactPicker } from '../lib/firebase';

interface ContactPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  currentUserId: string;
  onSelectContact: (contact: ContactItem) => void;
  onOpenQrModal?: (tab: 'my_code' | 'scan') => void;
}

export const ContactPickerModal: React.FC<ContactPickerModalProps> = ({
  isOpen,
  onClose,
  language,
  currentUserId,
  onSelectContact,
  onOpenQrModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isRtl = language === 'ar';

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSearchQuery('');
      setSelectedId(null);
      fetchUsersForContactPicker(currentUserId)
        .then((items) => {
          setContacts(items);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, currentUserId]);

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.status && c.status.toLowerCase().includes(q))
    );
  });

  const handleContactClick = (contact: ContactItem) => {
    setSelectedId(contact.id);
    setTimeout(() => {
      onSelectContact(contact);
    }, 150);
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#087F75]/10 text-[#087F75] flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
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

          {/* Search Bar & QR Quick Actions */}
          <div className="p-3 bg-slate-50 border-b border-slate-100 shrink-0 space-y-2">
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
                className={`w-full h-11 ${
                  isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                } bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#087F75] focus:ring-1 focus:ring-[#087F75]/20 transition-all`}
                autoFocus
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

            {/* Scan QR Quick Trigger */}
            {onOpenQrModal && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenQrModal('scan');
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-teal-50 hover:bg-teal-100 border border-[#087F75]/30 text-[#087F75] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
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
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isRtl ? 'رمزي' : 'My Code'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                <div className="w-6 h-6 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">{isRtl ? 'جاري تحميل جهات الاتصال...' : 'Loading contacts...'}</span>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-1.5 p-6 text-center">
                <User className="w-8 h-8 stroke-[1.5] text-slate-300 mb-1" />
                <span className="text-xs font-semibold text-slate-700">
                  {isRtl ? 'لم يتم العثور على نتائج' : 'No contacts found'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isRtl ? 'جرب البحث باسم آخر أو رقم مختلف' : 'Try searching for a different name or number'}
                </span>
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleContactClick(contact)}
                  className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer min-h-[56px] ${
                    selectedId === contact.id ? 'bg-[#087F75]/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center overflow-hidden text-sm">
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

                    {/* Name & Status */}
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

                  {/* Phone / Selected indicator */}
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
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
