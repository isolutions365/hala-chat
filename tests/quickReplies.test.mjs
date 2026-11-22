import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateSmartFallbacks } from '../src/server/quickReplies.ts';

test('1. Arabic greeting generates 3 natural Arabic quick replies', () => {
  const replies = generateSmartFallbacks('السلام عليكم يا أخي', 'ar');
  assert.equal(replies.length, 3);
  assert.equal(replies.includes('وعليكم السلام ورحمة الله 👋'), true);
});

test('2. Arabic question generates 3 affirmative/negative/neutral answers', () => {
  const replies = generateSmartFallbacks('هل أنت متاح للاجتماع غداً؟', 'ar');
  assert.equal(replies.length, 3);
  assert.equal(replies.includes('نعم بالتأكيد 👍'), true);
  assert.equal(replies.includes('لا، للأسف 🙏'), true);
});

test('3. Arabic gratitude generates 3 gracious Arabic responses', () => {
  const replies = generateSmartFallbacks('شكراً جزيلاً لك على المساعدة', 'ar');
  assert.equal(replies.length, 3);
  assert.equal(replies.includes('عفواً، بأي وقت! 🌸'), true);
});

test('4. English greeting generates 3 warm English quick replies', () => {
  const replies = generateSmartFallbacks('Hello, how are things going?', 'en');
  assert.equal(replies.length, 3);
  assert.equal(replies[0].length > 0, true);
});

test('5. English question generates 3 direct English response options', () => {
  const replies = generateSmartFallbacks('Can you review this document today?', 'en');
  assert.equal(replies.length, 3);
  assert.equal(replies.includes('Yes, definitely! 👍'), true);
});

test('6. English gratitude generates 3 polite English replies', () => {
  const replies = generateSmartFallbacks('Thanks so much for the update!', 'en');
  assert.equal(replies.length, 3);
  assert.equal(replies.includes('You are welcome! 😊'), true);
});

test('7. General text generates 3 concise conversational replies', () => {
  const replies = generateSmartFallbacks('I have sent the report over to the team.', 'en');
  assert.equal(replies.length, 3);
  assert.equal(replies.every(r => typeof r === 'string' && r.length > 0), true);
});
