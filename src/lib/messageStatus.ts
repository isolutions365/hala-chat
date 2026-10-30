import { MessageModel } from '../types';

export function getMessageStatus(message: { readBy?: string[] | {[uid: string]: string}; deliveredTo?: string[] }, receiverUid: string): 'sent' | 'delivered' | 'read' {
  const readBy = Array.isArray(message.readBy) ? message.readBy : Object.keys(message.readBy || {});
  const deliveredTo = message.deliveredTo || [];
  
  if (readBy.includes(receiverUid)) return 'read';
  if (deliveredTo.includes(receiverUid)) return 'delivered';
  return 'sent';
}
