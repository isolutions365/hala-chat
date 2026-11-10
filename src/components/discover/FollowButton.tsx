import React, { useEffect, useState } from 'react';
import { getFirebaseDb, getFirebaseAuth } from '../../lib/firebase';
import { collection, addDoc, query, where, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

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
    const db = getFirebaseDb();
    if (isFollowing) {
        const q = query(collection(db, 'follows'), where('followerId', '==', followerId), where('followingId', '==', followingId));
        const snapshot = await getDocs(q);
        const promises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(promises);
        setIsFollowing(false);
    } else {
        await addDoc(collection(db, 'follows'), {
            followerId,
            followingId,
            createdAt: serverTimestamp()
        });
        setIsFollowing(true);
    }
    setBusy(false);
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
