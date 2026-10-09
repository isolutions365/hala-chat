import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesCommunitySearch as matches} from '../src/lib/communitySearch.ts';
test('community search matches name and text with case and whitespace normalization',()=>{
 const post={authorName:'Alice',text:'Coffee in Riyadh'};
 assert.equal(matches(post,' ALICE  riyadh '),true);assert.equal(matches(post,'jeddah'),false);assert.equal(matches(post,'  '),true);assert.equal(matches(post,'coffee alice missing'),false);
});
test('Arabic search ignores vowel marks and tatweel; literal punctuation is safe',()=>{
 assert.equal(matches({authorName:'أحمد',text:'مَرْحَباً بالـرياض'},'احمد مرحبا الرياض'),true);
 assert.equal(matches({authorName:'A',text:'Hello'},'.*'),false);assert.equal(matches({authorName:'A',text:'Café'},'cafe'),true);
});
