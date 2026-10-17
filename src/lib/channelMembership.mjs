export function prepareChannelLeave(data,uid) {
 if(!data||data.type!=='channel'||!uid||!Array.isArray(data.participants))throw Error('channel-unavailable');
 if(data.createdBy===uid||data.ownerId===uid)throw Error('channel-owner-cannot-leave');
 const participants=data.participants.filter(id=>id!==uid);
 const participantDetails={...data.participantDetails};
 delete participantDetails[uid];
 return {participants,participantDetails,subscriberCount:participants.length};
}
