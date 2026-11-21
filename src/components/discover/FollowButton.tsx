import React, { useEffect, useState } from 'react';
import { getFirebaseAuth } from '../../lib/firebase';
import { toggleFollowAuthor, watchFollowAuthor } from '../../services/reels';

export function FollowButton({ followingId, isRtl }: { followingId: string; isRtl: boolean }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
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
    const prev = isFollowing;
    setBusy(true);
    setIsFollowing(!prev);
    try {
      const next = await toggleFollowAuthor(followerId, followingId);
      setIsFollowing(next);
    } catch {
      setIsFollowing(prev);
    } finally {
      setBusy(false);
    }
  }

  if (!followerId || followerId === followingId) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void handleToggleFollow();
      }}
      disabled={busy}
      className={`px-3 py-1 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60 ${
        isFollowing ? 'bg-slate-200 text-slate-800' : 'bg-[#087F75] text-white'
      }`}
    >
      {isFollowing ? (isRtl ? 'متابَع' : 'Following') : isRtl ? 'متابعة' : 'Follow'}
    </button>
  );
}
