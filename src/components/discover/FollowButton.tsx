import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { getFirebaseAuth } from '../../lib/firebase';
import { toggleFollowAuthor, watchFollowAuthor } from '../../services/reels';

export function FollowButton({ followingId, isRtl }: { followingId: string; isRtl: boolean }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const followerId = getFirebaseAuth().currentUser?.uid || '';

  useEffect(() => {
    if (!followerId || !followingId || followerId === followingId) {
      setIsFollowing(false);
      return;
    }
    return watchFollowAuthor(followerId, followingId, setIsFollowing);
  }, [followerId, followingId]);

  async function handleToggleFollow() {
    if (!followerId || !followingId || followerId === followingId || busy) return;
    setPulseKey((k) => k + 1);
    setBusy(true);
    try {
      await toggleFollowAuthor(followerId, followingId);
    } catch {
      // Centralized store automatically reverts optimistic state on error
    } finally {
      setBusy(false);
    }
  }

  if (!followerId || followerId === followingId) return null;

  return (
    <motion.button
      key={pulseKey}
      type="button"
      whileTap={{ scale: 0.9 }}
      initial={pulseKey > 0 ? { scale: 0.92 } : false}
      animate={pulseKey > 0 ? { scale: [0.92, 1.12, 0.97, 1] } : { scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onClick={(e) => {
        e.stopPropagation();
        void handleToggleFollow();
      }}
      disabled={busy}
      aria-pressed={isFollowing}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors disabled:opacity-80 ${
        isFollowing ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-[#087F75] hover:bg-[#06685F] text-white'
      }`}
    >
      {isFollowing ? (isRtl ? 'متابَع' : 'Following') : isRtl ? 'متابعة' : 'Follow'}
    </motion.button>
  );
}
