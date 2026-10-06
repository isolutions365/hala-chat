import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPoll,projectReactions } from '../src/lib/messageInteractions.ts';
test('new reactions override own legacy reaction and preserve other voters',()=>{
 assert.deepEqual(projectReactions({'like':['alice','bob']},{alice:'',eve:'love'}),{like:['bob'],love:['eve']});
});
test('poll projection keeps legacy voters and applies own changed selection',()=>{
 const p=projectPoll({question:'Q',allowMultiple:false,options:[{id:'a',text:'A',votes:['alice','bob']},{id:'b',text:'B',votes:[]}]},{alice:['b']});
 assert.deepEqual(p.options.map(o=>o.votes),[['bob'],['alice']]); assert.equal(p.totalVotes,2);
});
