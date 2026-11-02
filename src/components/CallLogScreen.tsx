import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
  Calendar,
  Clock,
  Trash2,
  PhoneCall,
  User,
} from 'lucide-react';
import { CallModel, Language, UserProfile, CallType } from '../types';
import { subscribeToUserCalls } from '../lib/firebase';

interface CallLogScreenProps {
  currentUser: UserProfile;
  language: Language;
  onInitiateCall: (contact: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    phone?: string;
  }, type: CallType) => void;
}

export const CallLogScreen: React.FC<CallLogScreenProps> = ({
  currentUser,
  language,
  onInitiateCall,
}) => {
  const isRtl = language === 'ar';
  const currentUserId =
    currentUser.id || `user_${currentUser.phoneNumber.replace(/\D/g, '')}`;

  const [calls, setCalls] = useState<CallModel[]>([]);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [limitCount, setLimitCount] = useState<number>(20);

  useEffect(() => {
    setIsLoading(true);
    const unsub = subscribeToUserCalls(currentUserId, (userCalls) => {
      setCalls(userCalls);
      setIsLoading(false);
    }, limitCount);

    return () => {
      unsub();
    };
  }, [currentUserId, limitCount]);

  const loadMore = () => {
    setLimitCount((prev) => prev + 20);
  };

  const filteredCalls = calls.filter((call) => {
    const isCaller = call.callerId === currentUserId;
    const targetName = isCaller ? call.calleeName : call.callerName;
    const targetPhone = isCaller ? call.calleePhone : call.callerPhone;

    const matchesSearch =
      (targetName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (targetPhone || '').includes(searchQuery);

    if (!matchesSearch) return false;

    if (filter === 'missed') {
      return (
        call.status === 'missed' ||
        (call.status === 'declined' && !isCaller)
      );
    }
    return true;
  });

  const formatCallTimestamp = (isoDate: string): string => {
    if (!isoDate) return '';
    try {
      const d = new Date(isoDate);
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const timeStr = d.toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (isToday) {
        return timeStr;
      }
      const dateStr = d.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
      return `${dateStr} ${timeStr}`;
    } catch {
      return isoDate;
    }
  };

  const formatDuration = (totalSec?: number): string => {
    if (!totalSec || totalSec <= 0) return '';
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins === 0) {
      return isRtl ? `${secs} ث` : `${secs}s`;
    }
    return isRtl ? `${mins} د ${secs} ث` : `${mins}m ${secs}s`;
  };

  return (
    <div className="flex flex-col h-full bg-[#16181B] text-stone-100 select-none">
      {/* Search & Filter Bar */}
      <div className="p-4 border-b border-stone-800/80 bg-[#1A1D21]">
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRtl ? 'بحث في سجل المكالمات...' : 'Search call logs...'}
            className="w-full pl-10 pr-4 py-2 bg-stone-900/90 border border-stone-700/60 rounded-xl text-sm text-stone-100 placeholder-stone-400 focus:outline-none focus:border-[#087F75] transition"
          />
        </div>

        {/* Tab Pills: All vs Missed */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
              filter === 'all'
                ? 'bg-[#087F75] text-white shadow-md'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            }`}
          >
            {isRtl ? 'جميع المكالمات' : 'All Calls'}
          </button>
          <button
            onClick={() => setFilter('missed')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
              filter === 'missed'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-stone-800 text-stone-400 hover:text-stone-200'
            }`}
          >
            {isRtl ? 'المكالمات الفائتة' : 'Missed'}
          </button>
        </div>
      </div>

      {/* Call Log List */}
      <div className="flex-1 overflow-y-auto divide-y divide-stone-800/50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 text-stone-400 gap-2">
            <div className="w-6 h-6 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">{isRtl ? 'جاري تحميل المكالمات...' : 'Loading calls...'}</span>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6 text-stone-400">
            <div className="w-16 h-16 rounded-full bg-stone-800 flex items-center justify-center text-stone-500 mb-3">
              <PhoneCall className="w-8 h-8 opacity-60" />
            </div>
            <h4 className="text-base font-semibold text-stone-300">
              {isRtl ? 'لا يوجد سجل مكالمات' : 'No call history yet'}
            </h4>
            <p className="text-xs text-stone-400 mt-1 max-w-xs">
              {isRtl
                ? 'ابدأ مكالمة صوتية أو مرئية مع أي من جهات اتصالك لتظهر هنا.'
                : 'Start a voice or video call with any contact to see your activity here.'}
            </p>
          </div>
        ) : (
          filteredCalls.map((call) => {
            const isCaller = call.callerId === currentUserId;
            const targetName = isCaller ? call.calleeName : call.callerName;
            const targetAvatar = isCaller ? call.calleeAvatar : call.callerAvatar;
            const targetPhone = isCaller ? call.calleePhone : call.callerPhone;
            const targetId = isCaller ? call.calleeId : call.callerId;

            const isMissed =
              call.status === 'missed' ||
              (call.status === 'declined' && !isCaller);

            const isVideo = call.type === 'video';

            return (
              <motion.div
                key={call.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4 hover:bg-stone-800/40 transition group cursor-pointer"
                onClick={() =>
                  onInitiateCall(
                    {
                      id: targetId,
                      name: targetName,
                      avatarUrl: targetAvatar,
                      phone: targetPhone,
                    },
                    call.type
                  )
                }
              >
                {/* Left: Avatar & Info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative flex-shrink-0">
                    {targetAvatar ? (
                      <img
                        src={targetAvatar}
                        alt={targetName}
                        className="w-12 h-12 rounded-full object-cover border border-stone-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#087F75] to-[#993414] text-white flex items-center justify-center font-bold text-lg border border-stone-700">
                        {targetName ? targetName.charAt(0).toUpperCase() : 'H'}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h4
                      className={`text-sm font-semibold truncate ${
                        isMissed ? 'text-red-400' : 'text-stone-200'
                      }`}
                    >
                      {targetName || 'Hala User'}
                    </h4>

                    {/* Status indicator row */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-stone-400">
                      {isMissed ? (
                        <PhoneMissed className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      ) : isCaller ? (
                        <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <PhoneIncoming className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      )}

                      <span>
                        {isMissed
                          ? isRtl
                            ? 'مكالمة فائتة'
                            : 'Missed Call'
                          : isCaller
                          ? isRtl
                            ? 'مكالمة صادرة'
                            : 'Outgoing'
                          : isRtl
                          ? 'مكالمة واردة'
                          : 'Incoming'}
                      </span>

                      {call.durationSeconds && call.durationSeconds > 0 ? (
                        <>
                          <span>•</span>
                          <span className="font-mono text-stone-400">
                            {formatDuration(call.durationSeconds)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right: Timestamp & Direct Re-call action */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[11px] text-stone-400 font-mono">
                    {formatCallTimestamp(call.startedAt)}
                  </span>

                  {/* Re-call Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onInitiateCall(
                        {
                          id: targetId,
                          name: targetName,
                          avatarUrl: targetAvatar,
                          phone: targetPhone,
                        },
                        call.type
                      );
                    }}
                    aria-label="Re-call Contact"
                    className="p-2.5 rounded-full bg-stone-800 hover:bg-[#087F75] text-stone-300 hover:text-white transition shadow-sm"
                  >
                    {isVideo ? (
                      <Video className="w-4 h-4" />
                    ) : (
                      <Phone className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
        {filteredCalls.length > 0 && (
          <div className="p-4 text-center">
            <button
              onClick={loadMore}
              className="text-xs text-[#087F75] font-semibold hover:underline"
            >
              {isRtl ? 'تحميل المزيد' : 'Load More'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
