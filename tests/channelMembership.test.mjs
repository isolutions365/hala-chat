import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareChannelLeave,prepareChannelJoin} from '../src/lib/channelMembership.mjs';
const channel={type:'channel',createdBy:'alice',ownerId:'alice',participants:['alice','bob'],participantDetails:{alice:{role:'admin'},bob:{role:'member'}}};
test('channel leave removes only own membership/details and computes count without mutating input',()=>{
 const next=prepareChannelLeave(channel,'bob');assert.deepEqual(next,{participants:['alice'],participantDetails:{alice:{role:'admin'}},subscriberCount:1});assert.equal(channel.participants.length,2);assert.ok(channel.participantDetails.bob);
 assert.deepEqual(prepareChannelLeave({...channel,...next},'bob'),next);
});
test('owners and invalid targets cannot leave through membership helper',()=>{
 assert.throws(()=>prepareChannelLeave(channel,'alice'),/owner-cannot-leave/);
 for(const [data,id] of [[null,'bob'],[{...channel,type:'group'},'bob'],[channel,'']])assert.throws(()=>prepareChannelLeave(data,id),/unavailable/);
});

test('joining is idempotent and preserves an existing owner role',()=>{
 const owner=prepareChannelJoin(channel,'alice',{name:'Renamed'});assert.deepEqual(owner.participants,channel.participants);assert.equal(owner.participantDetails.alice.role,'admin');
 const joined=prepareChannelJoin(channel,'eve',{name:'Eve'});assert.equal(joined.subscriberCount,3);assert.equal(joined.participantDetails.eve.role,'member');assert.deepEqual(prepareChannelJoin({...channel,...joined},'eve',{name:'Other'}),joined);
 assert.equal(channel.participants.length,2);
});
test('full channels reject new joins but permit existing members to retry',()=>{
 const full={...channel,participants:Array.from({length:100},(_,i)=>String(i))};assert.throws(()=>prepareChannelJoin(full,'new',{name:'New'}),/channel-full/);assert.equal(prepareChannelJoin(full,'0',{name:'Existing'}).subscriberCount,100);
});
