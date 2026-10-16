export const CREATOR_SEARCH_LIMIT = 20;
export function creatorNameRange(value) {
 const prefix = value.trim();
 if (Array.from(prefix).length < 2 || prefix.length > 100 || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(prefix)) return null;
 const points = Array.from(prefix, char => char.codePointAt(0));
 while (points.length && points.at(-1) === 0x10ffff) points.pop();
 if (!points.length) return null;
 const last = points.pop();
 points.push(last === 0xd7ff ? 0xe000 : last + 1);
 return {prefix, end: String.fromCodePoint(...points)};
}
