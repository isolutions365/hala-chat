import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

let env;
const db = id => id ? env.authenticatedContext(id, { phone_number: '+966500000000' }).firestore() : env.unauthenticatedContext().firestore();

before(async()=>{ env=await initializeTestEnvironment({projectId:'demo-hala-follows-rules',firestore:{host:'127.0.0.1',port:8088,rules:await readFile('firestore.rules','utf8')}}); });
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{ await env.clearFirestore(); });

test('follows collection security and non-existent doc lookup', async()=>{
    const a = db('alice'), b = db('bob'), e = db('eve');
    const follow = { followerId: 'alice', followingId: 'bob', createdAt: serverTimestamp() };

    // Non-existent follow lookup must succeed for follower/following, fail for unrelated user
    await assertSucceeds(getDoc(doc(a, 'follows', 'alice_bob')));
    await assertSucceeds(getDoc(doc(b, 'follows', 'alice_bob')));
    await assertFails(getDoc(doc(e, 'follows', 'alice_bob')));

    await assertSucceeds(setDoc(doc(a, 'follows', 'alice_bob'), follow));
    await assertFails(setDoc(doc(b, 'follows', 'bob_alice'), follow));
    await assertFails(setDoc(doc(a, 'follows', 'alice_bob'), { ...follow, followerId: 'eve' }));
    await assertSucceeds(setDoc(doc(a, 'follows', 'alice_eve'), { followerId: 'alice', followingId: 'eve', createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(a, 'follows', 'alice_bob')));
});

test('atomic follow/unfollow updates creator_profiles followersCount and blocks tampering', async()=>{
    const a = db('alice'), b = db('bob'), e = db('eve');

    await assertSucceeds(setDoc(doc(b, 'creator_profiles', 'bob'), {
        displayName: 'Bob',
        username: 'bob_creator',
        avatarUrl: null,
        bio: 'Creator',
        followersCount: 0,
        followingCount: 0,
        reelsCount: 0,
        createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(a, 'creator_profiles', 'alice'), {
        displayName: 'Alice',
        username: 'alice_creator',
        avatarUrl: null,
        bio: 'Fan',
        followersCount: 0,
        followingCount: 0,
        reelsCount: 0,
        createdAt: serverTimestamp(),
    }));

    // Cannot spoof followersCount without creating a follow doc atomically
    await assertFails(updateDoc(doc(e, 'creator_profiles', 'bob'), { followersCount: 99 }));
    await assertFails(setDoc(doc(a, 'follows', 'alice_bob'), {
        followerId: 'alice',
        followingId: 'bob',
        createdAt: serverTimestamp(),
    }));

    // Atomic follow transaction updates follow doc + followersCount + followingCount
    await assertSucceeds(runTransaction(a, async (tx) => {
        const bobRef = doc(a, 'creator_profiles', 'bob');
        const aliceRef = doc(a, 'creator_profiles', 'alice');
        const followRef = doc(a, 'follows', 'alice_bob');
        const [fSnap, bSnap, aSnap] = await Promise.all([tx.get(followRef), tx.get(bobRef), tx.get(aliceRef)]);
        if (fSnap.exists()) throw new Error('Expected no follow yet');
        tx.set(followRef, { followerId: 'alice', followingId: 'bob', createdAt: serverTimestamp() });
        tx.update(bobRef, { followersCount: bSnap.data().followersCount + 1 });
        tx.update(aliceRef, { followingCount: aSnap.data().followingCount + 1 });
    }));

    // Atomic unfollow transaction decrements followersCount and followingCount
    await assertSucceeds(runTransaction(a, async (tx) => {
        const bobRef = doc(a, 'creator_profiles', 'bob');
        const aliceRef = doc(a, 'creator_profiles', 'alice');
        const followRef = doc(a, 'follows', 'alice_bob');
        const [fSnap, bSnap, aSnap] = await Promise.all([tx.get(followRef), tx.get(bobRef), tx.get(aliceRef)]);
        if (!fSnap.exists()) throw new Error('Expected follow to exist');
        tx.delete(followRef);
        tx.update(bobRef, { followersCount: bSnap.data().followersCount - 1 });
        tx.update(aliceRef, { followingCount: aSnap.data().followingCount - 1 });
    }));
});

