export async function captureVideoCover(video:HTMLVideoElement):Promise<Blob> {
 if(video.readyState<2 || video.seeking || !video.videoWidth || !video.videoHeight)throw Error('Frame is not ready');
 const scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
 const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');
 context.drawImage(video,0,0,canvas.width,canvas.height);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>{if(!blob || !blob.size || blob.size>1024*1024)reject(Error('Cover could not be created'));else resolve(blob);},'image/jpeg',0.82));
}
