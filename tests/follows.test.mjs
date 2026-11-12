import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

let env;
const db = id => id ? env.authenticatedContext(id, { phone_number: '+966500000000' }).firestore() : env.unauthenticatedContext().firestore();

before(async()=>{ env=await initializeTestEnvironment({projectId:'demo-hala-rules',firestore:{host:'127.0.0.1',port:8088,rules:await readFile('firestore.rules','utf8')}}); });
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{ await env.clearFirestore(); });

test('follows collection security', async()=>{
    const a = db('alice'), b = db('bob'), anon = db(null);
    const follow = { followerId: 'alice', followingId: 'bob', createdAt: serverTimestamp() };

    await assertSucceeds(setDoc(doc(a, 'follows', 'alice_bob'), follow));
    await assertFails(setDoc(doc(b, 'follows', 'bob_alice'), follow));
    await assertFails(setDoc(doc(a, 'follows', 'alice_bob'), { ...follow, followerId: 'eve' }));
    await assertSucceeds(setDoc(doc(a, 'follows', 'alice_eve'), { followerId: 'alice', followingId: 'eve', createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(a, 'follows', 'alice_bob')));

    // Existing production follow records used addDoc() and therefore random IDs.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'follows', 'legacy-random-id'), {
        followerId: 'alice', followingId: 'bob', createdAt: new Date()
      });
    });
    const legacyQuery = query(
      collection(a, 'follows'),
      where('followerId', '==', 'alice'),
      where('followingId', '==', 'bob')
    );
    const legacyRecords = await getDocs(legacyQuery);
    assert.equal(legacyRecords.size, 1);
    await assertSucceeds(deleteDoc(legacyRecords.docs[0].ref));
});
