export function prepareChannelLeave(data,uid) {
 if(!data||data.type!=='channel'||!uid||!Array.isArray(data.participants))throw Error('channel-unavailable');
 if(data.createdBy===uid||data.ownerId===uid)throw Error('channel-owner-cannot-leave');
 const participants=data.participants.filter(id=>id!==uid);
 const participantDetails={...data.participantDetails};
 delete participantDetails[uid];
 return {participants,participantDetails,subscriberCount:participants.length};
}

export function prepareChannelJoin(data,uid,profile) {
 if(!data||data.type!=='channel'||!uid||!Array.isArray(data.participants))throw Error('channel-unavailable');
 const exists=data.participants.includes(uid);
 if(!exists&&data.participants.length>=100)throw Error('channel-full');
 const participants=exists?[...data.participants]:[...data.participants,uid];
 const participantDetails={...data.participantDetails};
 if(!exists)Object.defineProperty(participantDetails,uid,{value:{name:profile.name,avatarUrl:profile.avatarUrl||null,role:'member'},enumerable:true,writable:true,configurable:true});
 return {participants,participantDetails,subscriberCount:participants.length};
}
