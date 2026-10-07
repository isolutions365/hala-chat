import {test} from 'node:test';
import assert from 'node:assert/strict';
import {callErrorMessage} from '../src/lib/callErrors.ts';
test('call failures provide localized recovery without exposing raw errors',()=>{
 for(const name of ['NotAllowedError','NotFoundError','NotReadableError','NotSupportedError','private error']) {
  const en=callErrorMessage(name,false),ar=callErrorMessage(name,true);
  assert.ok(en.length>30);assert.match(ar,/[\u0600-\u06ff]/);assert.ok(!en.includes('private error'));
 }
 assert.match(callErrorMessage('NotAllowedError',false),/browser settings/);
 assert.match(callErrorMessage('NotReadableError',false),/Close other apps/);
});
