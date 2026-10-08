const prefix = 'hala.communityDraft.';
export function readCommunityDraft(uid: string): string {
 if (!uid) return '';
 try { const value = JSON.parse(localStorage.getItem(prefix + uid) || 'null'); return typeof value === 'string' ? value.slice(0, 2000) : ''; } catch { return ''; }
}
export function saveCommunityDraft(uid: string, text: string): boolean {
 if (!uid) return false;
 try { if (text) localStorage.setItem(prefix + uid, JSON.stringify(text.slice(0, 2000))); else localStorage.removeItem(prefix + uid); return true; } catch { return false; }
}
