import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { useMessageStatus } from '../hooks/useMessageStatus';
import { MessageModel } from '../types';

interface MessageStatusTicksProps {
  chatId: string;
  message: MessageModel;
  receiverUid: string;
  isGroup: boolean;
  currentUserId: string;
  isRtl: boolean;
  variant?: 'chatList' | 'conversation';
}

export const MessageStatusTicks: React.FC<MessageStatusTicksProps> = ({
  chatId,
  message,
  receiverUid,
  isGroup,
  currentUserId,
  isRtl,
  variant = 'conversation',
}) => {
  const status = useMessageStatus(
    chatId,
    message.id,
    message,
    receiverUid,
    isGroup,
    currentUserId
  );

  if (message.status === 'sending') {
    return (
      <span title={isRtl ? 'جاري الإرسال...' : 'Sending...'}>
        <Clock className={`w-3 h-3 ${variant === 'chatList' ? 'text-slate-400' : 'text-white/70'} inline animate-spin`} />
      </span>
    );
  }

  if (message.status === 'failed') {
    return (
      <span title={isRtl ? 'فشل الإرسال. اضغط لإعادة المحاولة' : 'Failed to send. Tap to retry.'}>
        <AlertCircle className={`w-3.5 h-3.5 ${variant === 'chatList' ? 'text-red-500' : 'text-red-300'} inline cursor-pointer animate-pulse`} />
      </span>
    );
  }

  const isRead = status === 'read';
  const isDelivered = status === 'delivered';

  const tooltip = isRead 
    ? (isRtl ? 'تمت القراءة' : 'Read') 
    : isDelivered 
    ? (isRtl ? 'تم التسليم' : 'Delivered') 
    : (isRtl ? 'تم الإرسال' : 'Sent');

  if (variant === 'chatList') {
    return (
      <span className="shrink-0 text-slate-400" dir="ltr" title={tooltip}>
        {isRead ? (
          <CheckCheck className="w-3.5 h-3.5 text-sky-500 inline" />
        ) : isDelivered ? (
          <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />
        ) : (
          <Check className="w-3.5 h-3.5 text-slate-400 inline" />
        )}
      </span>
    );
  }

  // Conversation variant
  return (
    <span title={tooltip} className="inline-flex items-center">
      {isRead ? (
        <CheckCheck className="w-3.5 h-3.5 text-sky-300 drop-shadow-[0_0_2px_rgba(56,189,248,0.6)] inline transition-all" />
      ) : isDelivered ? (
        <CheckCheck className="w-3.5 h-3.5 text-white/60 inline transition-all" />
      ) : (
        <Check className="w-3.5 h-3.5 text-white/60 inline transition-all" />
      )}
    </span>
  );
};
