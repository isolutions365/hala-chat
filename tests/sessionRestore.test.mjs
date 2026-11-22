import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRestorer } from '../src/lib/sessionRestore.ts';
const user = { uid: 'alice', phoneNumber: '+966500000000' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('persisted account restores its profile; only absent profiles start setup', async () => {
  const states = [];
  const profile = { name: 'Alice' };
  let requestedUid;
  const loader = createSessionRestorer(async uid => { requestedUid = uid; return profile; }, s => states.push(s));
  await loader.restore(user);
  assert.equal(requestedUid, user.uid);
  assert.deepEqual(states, [{status:'loading'}, {status:'ready',user,profile}]);
  const missing = [];
  await createSessionRestorer(async () => null, s => missing.push(s)).restore(user);
  assert.equal(missing.at(-1).profile, null);
  assert.equal(missing.at(-1).status, 'ready');
});

test('lookup failure is an error, never new-profile setup; retry recovers', async () => {
  const states = []; let fail = true;
  const loader = createSessionRestorer(async () => { if (fail) throw Error('offline'); return {name:'Alice'}; }, s => states.push(s));
  await loader.restore(user);
  assert.deepEqual(states.at(-1), {status:'error'});
  assert.equal(states.some(s => s.status === 'ready'), false);
  fail = false;
  await loader.restore(user);
  assert.equal(states.at(-1).profile.name, 'Alice');
});

test('sign-out invalidates an in-flight profile lookup', async () => {
  const pending = deferred(); const states = [];
  const loader = createSessionRestorer(() => pending.promise, s => states.push(s));
  const request = loader.restore(user);
  await loader.restore(null);
  pending.resolve({name:'Alice'}); await request;
  assert.deepEqual(states.at(-1), {status:'signed-out'});
  assert.equal(states.some(s => s.status === 'ready'), false);
});

test('account switch ignores previous account result', async () => {
  const pending = deferred(); const states = [];
  const bob = {uid:'bob',phoneNumber:null};
  const loader = createSessionRestorer(uid => uid === 'alice' ? pending.promise : Promise.resolve({name:'Bob'}), s => states.push(s));
  const request = loader.restore(user);
  await loader.restore(bob); pending.resolve({name:'Alice'}); await request;
  assert.equal(states.at(-1).user.uid, 'bob');
  assert.equal(states.filter(s => s.status === 'ready').length, 1);
});

test('unmount suppresses late state updates', async () => {
  const pending = deferred(); const states = [];
  const loader = createSessionRestorer(() => pending.promise, s => states.push(s));
  const request = loader.restore(user); loader.dispose(); pending.resolve({}); await request;
  assert.deepEqual(states, [{status:'loading'}]);
});

test('hung lookup becomes a retryable error and late response is ignored', async () => {
  const pending = deferred(); const states = [];
  const loader = createSessionRestorer(() => pending.promise, s => states.push(s), 5);
  await loader.restore(user); pending.resolve({}); await Promise.resolve();
  assert.deepEqual(states, [{status:'loading'}, {status:'error'}]);
});
