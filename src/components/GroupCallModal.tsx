import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Video, Users, X, User } from 'lucide-react';
import { Language, CallType, ChatModel, UserProfile } from '../types';

interface GroupCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: ChatModel;
  currentUser: UserProfile;
  language: Language;
  onStartGroupCall: (type: CallType) => void;
  onCallIndividualMember?: (member: { id: string; name: string; avatarUrl?: string | null; phone?: string }, type: CallType) => void;
}

export const GroupCallModal: React.FC<GroupCallModalProps> = ({
  isOpen,
  onClose,
  chat,
  currentUser,
  language,
  onStartGroupCall,
  onCallIndividualMember,
}) => {
  const isRtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<'group' | 'members'>('group');
  const [isStarting, setIsStarting] = useState(false);

  if (!isOpen) return null;

  const currentUserId = currentUser.id || `user_${currentUser.phoneNumber?.replace(/\D/g, '')}`;
  const memberList = (chat.participants || [])
    .filter((uid) => uid !== currentUserId)
    .map((uid) => {
      const details = chat.participantDetails?.[uid];
      return {
        id: uid,
        name: details?.name || uid,
        avatarUrl: details?.avatarUrl || null,
        phone: details?.phone,
      };
    });

  const handleGroupAction = (type: CallType) => {
    if (isStarting) return;
    setIsStarting(true);
    onStartGroupCall(type);
    onClose();
    setTimeout(() => setIsStarting(false), 2000);
  };

  const handleMemberAction = (member: typeof memberList[0], type: CallType) => {
    if (!onCallIndividualMember || isStarting) return;
    setIsStarting(true);
    onCallIndividualMember(member, type);
    onClose();
    setTimeout(() => setIsStarting(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#1B242D] border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl text-white overflow-hidden z-10"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Group Header Info */}
          <div className="flex flex-col items-center text-center mt-1 mb-5">
            <div className="relative mb-3">
              {chat.avatarUrl ? (
                <img
                  src={chat.avatarUrl}
                  alt={chat.name || 'Group'}
                  className="w-18 h-18 rounded-full object-cover border-2 border-teal-500/50 shadow-lg"
                />
              ) : (
                <div className="w-18 h-18 rounded-full bg-gradient-to-tr from-teal-600 via-[#087F75] to-emerald-400 text-white flex items-center justify-center text-2xl font-bold shadow-lg border border-white/20">
                  <Users className="w-8 h-8" />
                </div>
              )}
            </div>

            <h3 className="text-lg font-extrabold text-white truncate max-w-[280px]">
              {chat.name || chat.title || (isRtl ? 'مجموعة' : 'Group Chat')}
            </h3>
            <p className="text-xs text-teal-400 font-medium mt-0.5">
              {chat.participants.length} {isRtl ? 'أعضاء في المجموعة' : 'group members'}
            </p>
          </div>

          {/* Tab Switcher: Group Call vs Direct Member */}
          <div className="flex bg-slate-800/80 p-1 rounded-xl mb-5 border border-slate-700/60">
            <button
              type="button"
              onClick={() => setActiveTab('group')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'group'
                  ? 'bg-[#087F75] text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isRtl ? 'مكالمة جماعية للكل' : 'All Members Call'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'members'
                  ? 'bg-[#087F75] text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{isRtl ? 'اتصال بعضو محدد' : 'Direct Member'}</span>
            </button>
          </div>

          {activeTab === 'group' ? (
            /* Group Call Options (Telegram style) */
            <div className="space-y-3">
              {/* Group Voice Chat Button */}
              <button
                type="button"
                onClick={() => handleGroupAction('voice')}
                disabled={isStarting}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-850 hover:from-teal-950/40 hover:to-slate-800 border border-slate-700/70 hover:border-teal-500/50 transition-all cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div className="text-left" dir={isRtl ? 'rtl' : 'ltr'}>
                    <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                      {isRtl ? 'بدء محادثة صوتية جماعية' : 'Start Voice Chat'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isRtl
                        ? 'محادثة صوتية مباشرة لجميع أعضاء المجموعة'
                        : 'Live voice room for all group members'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/15 shrink-0">
                  {isRtl ? 'بدء' : 'Start'}
                </span>
              </button>

              {/* Group Video Call Button */}
              <button
                type="button"
                onClick={() => handleGroupAction('video')}
                disabled={isStarting}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-slate-800/90 to-slate-850 hover:from-teal-950/40 hover:to-slate-800 border border-slate-700/70 hover:border-teal-500/50 transition-all cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#087F75]/25 text-teal-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Video className="w-6 h-6" />
                  </div>
                  <div className="text-left" dir={isRtl ? 'rtl' : 'ltr'}>
                    <h4 className="text-sm font-bold text-white group-hover:text-teal-300 transition-colors">
                      {isRtl ? 'بدء مكالمة فيديو جماعية' : 'Start Group Video Call'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isRtl
                        ? 'مكالمة فيديو وكاميرا حية متعددة'
                        : 'Live group video with camera feeds'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-teal-300 px-2.5 py-1 rounded-full bg-teal-500/15 shrink-0">
                  {isRtl ? 'بدء' : 'Start'}
                </span>
              </button>
            </div>
          ) : (
            /* Direct Member Call Options */
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {memberList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  {isRtl ? 'لا يوجد أعضاء آخرين في المجموعة' : 'No other members in this group'}
                </p>
              ) : (
                memberList.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate max-w-[150px]">
                          {member.name}
                        </p>
                        {member.phone && (
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            {member.phone}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMemberAction(member, 'voice')}
                        className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center transition cursor-pointer"
                        title={isRtl ? 'اتصال صوتي' : 'Voice Call'}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMemberAction(member, 'video')}
                        className="w-8 h-8 rounded-full bg-[#087F75]/20 text-[#087F75] hover:bg-[#087F75]/30 flex items-center justify-center transition cursor-pointer"
                        title={isRtl ? 'اتصال فيديو' : 'Video Call'}
                      >
                        <Video className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
