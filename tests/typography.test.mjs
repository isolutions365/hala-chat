import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTypography, readTypography, saveTypography, applyTypography, typographyFonts, defaultTypography } from '../src/lib/typography.ts';

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

test('switching fonts applies immediately on every single change with no 1-step lag or recursion', () => {
 const store = new Map();
 const cssVars = {};
 const listeners = {};
 let listenerErrors = 0;

 globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
 };
 globalThis.document = {
  documentElement: { style: { setProperty: (k, v) => { cssVars[k] = v; }, fontSize: '' } },
  body: { style: { setProperty: (k, v) => { cssVars['body:' + k] = v; } } },
 };
 globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
   this.type = type;
   this.detail = init?.detail;
  }
 };
 globalThis.window = {
  localStorage: globalThis.localStorage,
  addEventListener: (t, fn) => { (listeners[t] ??= []).push(fn); },
  removeEventListener: (t, fn) => {
   if (listeners[t]) listeners[t] = listeners[t].filter(f => f !== fn);
  },
  dispatchEvent: (evt) => {
   for (const fn of (listeners[evt.type] || [])) {
    try { fn(evt); } catch { listenerErrors++; }
   }
   return true;
  },
 };

 // Mirror App.tsx typography listener
 const syncTypography = (event) => applyTypography(event?.detail || readTypography());
 syncTypography();
 window.addEventListener('hala-typography-changed', syncTypography);

 try {
  assert.equal(saveTypography({ font: 'inter', size: 16, spacing: 1.5 }), true);
  assert.equal(cssVars['--hala-font'], typographyFonts.inter);

  assert.equal(saveTypography({ font: 'poppins', size: 18, spacing: 1.75 }), true);
  assert.equal(cssVars['--hala-font'], typographyFonts.poppins);
  assert.equal(document.documentElement.style.fontSize, '18px');

  assert.equal(saveTypography({ font: 'amiri', size: 20, spacing: 2 }), true);
  assert.equal(cssVars['--hala-font'], typographyFonts.amiri);
  assert.equal(cssVars['--hala-reading-line'], '2');

  assert.equal(listenerErrors, 0);
 } finally {
  delete globalThis.window;
  delete globalThis.CustomEvent;
  delete globalThis.document;
  delete globalThis.localStorage;
 }
});

