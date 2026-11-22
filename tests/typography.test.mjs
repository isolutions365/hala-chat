import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTypography, readTypography, defaultTypography } from '../src/lib/typography.ts';
test('invalid preferences cannot inject font values or unusable sizes', () => {
 assert.deepEqual(normalizeTypography({font:'__proto__',size:900,spacing:-1}),defaultTypography);
 assert.deepEqual(normalizeTypography({font:'classic',size:20,spacing:2}),{font:'classic',size:20,spacing:2});
});
test('corrupt or unavailable storage uses safe defaults', () => {
 globalThis.localStorage = { getItem() { return '{bad'; } };
 assert.deepEqual(readTypography(),defaultTypography);
 globalThis.localStorage = { getItem() { throw Error('blocked'); } };
 assert.deepEqual(readTypography(),defaultTypography);
 delete globalThis.localStorage;
});
