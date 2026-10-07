import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCallConnectionWatch} from '../src/lib/callConnectionWatch.ts';
test('connection deadline is bounded and duplicate updates cannot extend it',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let failures=0;const watch=createCallConnectionWatch(()=>failures++);
 watch.update('new');t.mock.timers.tick(60000);assert.equal(failures,0);
 watch.update('connecting');t.mock.timers.tick(20000);watch.update('connecting');t.mock.timers.tick(10000);assert.equal(failures,1);watch.update('failed');assert.equal(failures,1);
});
test('temporary disconnection can recover; persistent disconnection fails once',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let failures=0;const watch=createCallConnectionWatch(()=>failures++);
 watch.update('disconnected');t.mock.timers.tick(14000);watch.update('connected');t.mock.timers.tick(10000);assert.equal(failures,0);
 watch.update('disconnected');t.mock.timers.tick(15000);assert.equal(failures,1);
});
test('hangup and disposal cancel deadlines',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let failures=0;
 for(const dispose of [true,false]){const watch=createCallConnectionWatch(()=>failures++);watch.update('connecting');if(dispose)watch.dispose();else watch.update('closed');watch.update('failed');t.mock.timers.tick(60000);}
 assert.equal(failures,0);
});
