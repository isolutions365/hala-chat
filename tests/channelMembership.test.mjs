import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareChannelLeave} from '../src/lib/channelMembership.mjs';
const channel={type:'channel',createdBy:'alice',ownerId:'alice',participants:['alice','bob'],participantDetails:{alice:{role:'admin'},bob:{role:'member'}}};
test('channel leave removes only own membership/details and computes count without mutating input',()=>{
 const next=prepareChannelLeave(channel,'bob');assert.deepEqual(next,{participants:['alice'],participantDetails:{alice:{role:'admin'}},subscriberCount:1});assert.equal(channel.participants.length,2);assert.ok(channel.participantDetails.bob);
 assert.deepEqual(prepareChannelLeave({...channel,...next},'bob'),next);
});
test('owners and invalid targets cannot leave through membership helper',()=>{
 assert.throws(()=>prepareChannelLeave(channel,'alice'),/owner-cannot-leave/);
 for(const [data,id] of [[null,'bob'],[{...channel,type:'group'},'bob'],[channel,'']])assert.throws(()=>prepareChannelLeave(data,id),/unavailable/);
});
