import React, { useEffect, useState } from 'react';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { collection, doc, query, where, getDocs, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export function FollowButton({ followingId, isRtl }: { followingId: string, isRtl: boolean }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const followerId = getFirebaseAuth().currentUser?.uid;

  useEffect(() => {
    if (!followerId) return;
    async function checkFollowing() {
      const db = getFirebaseDb();
      const q = query(collection(db, 'follows'), where('followerId', '==', followerId), where('followingId', '==', followingId));
      const snapshot = await getDocs(q);
      setIsFollowing(!snapshot.empty);
    }
    checkFollowing();
  }, [followerId, followingId]);

  async function toggleFollow() {
    if (!followerId) return;
    setBusy(true);
    try {
      const db = getFirebaseDb();
      if (isFollowing) {
        // Remove both legacy auto-ID records and newer deterministic records.
        const q = query(
          collection(db, 'follows'),
          where('followerId', '==', followerId),
          where('followingId', '==', followingId)
        );
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map((followDoc) => deleteDoc(followDoc.ref)));
        setIsFollowing(false);
      } else {
        const followRef = doc(db, 'follows', `${followerId}_${followingId}`);
        await setDoc(followRef, {
          followerId,
          followingId,
          createdAt: serverTimestamp()
        });
        setIsFollowing(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!followerId || followerId === followingId) return null;

  return (
    <button
        onClick={(e) => { e.stopPropagation(); toggleFollow(); }}
        disabled={busy}
        className={`px-3 py-1 rounded-lg text-sm font-semibold ${isFollowing ? 'bg-slate-200 text-slate-800' : 'bg-[#087F75] text-white'}`}
    >
      {isFollowing ? (isRtl ? 'إلغاء المتابعة' : 'Unfollow') : (isRtl ? 'متابعة' : 'Follow')}
    </button>
  );
}
