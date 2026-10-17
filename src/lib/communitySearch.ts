function normalized(value: string): string {
 return value.normalize('NFKD').replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
}
export function matchesCommunitySearch(post:{authorName:string;text:string},query:string):boolean {
 const terms=normalized(query).split(' ').filter(Boolean);
 const content=normalized(post.authorName+' '+post.text);
 return terms.every(term=>content.includes(term));
}
