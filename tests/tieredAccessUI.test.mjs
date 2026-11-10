import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Gating logic tests for Tiered Access UI.
 * Mocks the decision logic used in App.tsx and ChatListScreen.tsx.
 */

// Mock logic from App.tsx:applyRestoredSession
function getGatingState(user, profile) {
  // isEmailUser: check if provider is 'password'
  const isEmailUser = user?.providerData?.some(p => p.providerId === 'password');
  // hasPhone: check if user has phone number in auth or profile
  const hasPhone = !!(user?.phoneNumber || profile?.phone);
  // emailVerified: check if email is verified
  const emailVerified = user?.emailVerified;

  if (isEmailUser && !hasPhone && !emailVerified) {
    return 'show_verification';
  }
  return 'show_app';
}

// Mock logic from ChatListScreen.tsx:tab gating
function getTabGating(isPhoneVerified, tabId) {
  // Discover is always active
  if (tabId === 'discover') return 'active';
  // Other tabs are locked if phone is not verified
  if (!isPhoneVerified) {
    return 'locked';
  }
  return 'active';
}

test('1. Email-only unverified user is gated by verification screen', () => {
  const user = { 
    providerData: [{ providerId: 'password' }], 
    emailVerified: false 
  };
  const profile = { phone: '' };
  assert.equal(getGatingState(user, profile), 'show_verification');
});

test('2. Verified email user is NOT gated by verification screen', () => {
  const user = { 
    providerData: [{ providerId: 'password' }], 
    emailVerified: true 
  };
  const profile = { phone: '' };
  assert.equal(getGatingState(user, profile), 'show_app');
});

test('3. Phone user is NOT gated by verification screen even if email unverified', () => {
  const user = { 
    providerData: [{ providerId: 'phone' }], 
    phoneNumber: '+123456789' 
  };
  const profile = { phone: '+123456789' };
  assert.equal(getGatingState(user, profile), 'show_app');
});

test('4. Non-phone user has locked tabs except Discover', () => {
  assert.equal(getTabGating(false, 'chats'), 'locked');
  assert.equal(getTabGating(false, 'calls'), 'locked');
  assert.equal(getTabGating(false, 'status'), 'locked');
  assert.equal(getTabGating(false, 'channels'), 'locked');
  assert.equal(getTabGating(false, 'discover'), 'active');
});

test('5. Phone verified user has all tabs active', () => {
  assert.equal(getTabGating(true, 'chats'), 'active');
  assert.equal(getTabGating(true, 'calls'), 'active');
  assert.equal(getTabGating(true, 'discover'), 'active');
});
