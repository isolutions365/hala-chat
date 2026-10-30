import { MessageModel } from '../types';

export function getMessageStatus(message: any, receiverUid: string, isGroup?: boolean, currentUserId?: string): 'sent' | 'delivered' | 'read' {
  if (!message) return 'sent';
  
  // Support for old message format or different schema
  const readBy = Array.isArray(message.readBy) 
    ? message.readBy 
    : (typeof message.readBy === 'object' && message.readBy !== null ? Object.keys(message.readBy) : []);
    
  const deliveredTo = Array.isArray(message.deliveredTo) 
    ? message.deliveredTo 
    : (typeof message.deliveredTo === 'object' && message.deliveredTo !== null ? Object.keys(message.deliveredTo) : []);
  
  if (isGroup && currentUserId) {
    // In group, "read" if anyone other than the sender (and current user if they are the sender) has read it
    if (readBy.some(uid => uid !== currentUserId && uid !== message.senderId)) return 'read';
    if (deliveredTo.some(uid => uid !== currentUserId && uid !== message.senderId)) return 'delivered';
  } else if (receiverUid) {
    if (readBy.includes(receiverUid)) return 'read';
    if (deliveredTo.includes(receiverUid)) return 'delivered';
  }
  
  // Legacy status fallback
  if (message.status === 'read') return 'read';
  if (message.status === 'delivered') return 'delivered';
  
  return 'sent';
}


