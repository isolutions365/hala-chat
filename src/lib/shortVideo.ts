export const MAX_SHORT_VIDEO_SECONDS=30;
export function validateShortVideo(file:{size:number;type:string},duration:number) {
 if(!['video/mp4','video/webm'].includes(file.type)||file.size<=0||file.size>5*1024*1024)throw Error('Choose MP4 or WebM up to 5 MB.');
 if(!Number.isFinite(duration)||duration<=0||duration>MAX_SHORT_VIDEO_SECONDS)throw Error('Choose a video up to 30 seconds.');
}
export function inspectShortVideo(file:File):Promise<number> {
 return new Promise((resolve,reject)=>{
  const video=document.createElement('video');const url=URL.createObjectURL(file);
  let finished=false;
  const finish=(duration?:number)=>{if(finished)return;finished=true;clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);if(duration===undefined)reject(Error('Video could not be read.'));else{try{validateShortVideo(file,duration);resolve(duration);}catch(error){reject(error);}}};
  const timer=setTimeout(()=>finish(),12000);
  video.preload='metadata';video.onloadedmetadata=()=>finish(video.duration);video.onerror=()=>finish();video.src=url;
 });
}
