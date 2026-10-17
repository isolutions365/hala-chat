import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creatorNameRange,CREATOR_SEARCH_LIMIT} from '../src/lib/creatorNameSearch.mjs';

test('prefix validation rejects broad/invalid queries and preserves case and Arabic',()=>{
 for(const value of ['', ' ', 'A', '😀', 'a'.repeat(101), 'Al\nIce', '\ud800A']) assert.equal(creatorNameRange(value),null);
 assert.deepEqual(creatorNameRange('  Al  '),{prefix:'Al',end:'Am'});
 assert.deepEqual(creatorNameRange('مح'),{prefix:'مح',end:'مخ'});
 assert.equal(CREATOR_SEARCH_LIMIT,20);
});
test('exclusive upper bound includes emoji suffixes and handles Unicode boundaries',()=>{
 for(const prefix of ['Al','مح','😀A','A\uffff','A\u{10ffff}','A\ud7ff']) {
  const range=creatorNameRange(prefix);
  for(const suffix of ['', 'ice','علي','😀','\u{10ffff}']) {
   const name=Buffer.from(prefix+suffix);
   assert.ok(Buffer.compare(name,Buffer.from(range.prefix))>=0);
   assert.ok(Buffer.compare(name,Buffer.from(range.end))<0);
  }
 }
});
