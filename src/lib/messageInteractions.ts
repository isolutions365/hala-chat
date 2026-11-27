import type { PollData } from '../types';
// Old records remain readable; a UID's new value overrides only that UID.
export function projectReactions(legacy: Record<string,string[]> = {}, own: Record<string,string> = {}) {
 const result: Record<string,string[]> = {};
 for (const [emoji,users] of Object.entries(legacy)) {
  if (Array.isArray(users)) result[emoji] = users.filter(uid => !(uid in own));
 }
 for (const [uid,emoji] of Object.entries(own)) if (typeof emoji === 'string' && emoji) (result[emoji] ||= []).push(uid);
 return Object.fromEntries(Object.entries(result).filter(([,users]) => users.length));
}
export function projectPoll(poll: PollData | undefined, own: Record<string,string[]> = {}): PollData | undefined {
 if (!poll || !Array.isArray(poll.options)) return undefined;
 const voters = new Set<string>();
 const options = poll.options.map(option => {
  const votes = [...new Set([...(Array.isArray(option.votes) ? option.votes.filter(uid => !(uid in own)) : []), ...Object.entries(own).filter(([,ids]) => Array.isArray(ids) && ids.includes(option.id)).map(([uid]) => uid)])];
  votes.forEach(uid => voters.add(uid));
  return {...option,votes};
 });
 return {...poll,options,totalVotes:voters.size};
}
