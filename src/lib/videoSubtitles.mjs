export const SUBTITLE_MAX_BYTES = 24000;
export const SUBTITLE_MAX_CHARS = 12000;
export const SUBTITLE_LANGUAGES = ['ar','en','ur'];

function timestamp(value) {
 const match=/^(?:(\d{2}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
 if(!match)throw Error('subtitle-format');
 return Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;
}
function format(seconds) {
 const ms=Math.round(seconds*1000);
 return `00:${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
}
// Deliberately support plain, non-overlapping cues only: no styles, markup or positioning.
export function normalizeSubtitles(input,duration) {
 if(typeof input!=='string'||input.length>SUBTITLE_MAX_CHARS||!Number.isFinite(duration)||duration<=0||duration>30)throw Error('subtitle-format');
 const source=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source))throw Error('subtitle-format');
 const blocks=source.split(/\n[ \t]*\n/);
 if(blocks.shift()!=='WEBVTT'||!blocks.length||blocks.length>60)throw Error('subtitle-format');
 let previousEnd=0;
 const cues=blocks.map(block=>{
  const lines=block.split('\n');
  if(!lines[0].includes('-->'))lines.shift(); // Optional cue identifier.
  const timing=/^(\S+) --> (\S+)$/.exec(lines.shift()||'');
  if(!timing)throw Error('subtitle-format');
  const start=timestamp(timing[1]),end=timestamp(timing[2]),text=lines.join('\n').trim();
  if(start<previousEnd||end<=start||end>duration+0.001||!text||text.length>1000||/[<>]/.test(text))throw Error('subtitle-format');
  previousEnd=end;
  return `${format(start)} --> ${format(end)}\n${text}`;
 });
 const vtt=`WEBVTT\n\n${cues.join('\n\n')}\n`;
 if(vtt.length>SUBTITLE_MAX_CHARS)throw Error('subtitle-format');
 return {vtt,count:cues.length};
}
