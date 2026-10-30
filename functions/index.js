const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendCallNotification = functions.firestore
  .document('calls/{callId}')
  .onCreate(async (snap, context) => {
    const callData = snap.data();
    const receiverId = callData.receiverId;
    
    // Fetch tokens for receiver
    const tokensSnapshot = await admin.firestore()
      .collection('users')
      .doc(receiverId)
      .collection('fcmTokens')
      .get();
      
    const tokens = tokensSnapshot.docs.map(doc => doc.id);
    
    if (tokens.length === 0) return null;
    
    const message = {
      notification: {
        title: 'Incoming call',
        body: `Call from ${callData.callerName}`
      },
      data: {
        callId: context.params.callId,
        type: callData.type
      },
      tokens: tokens
    };
    
    return admin.messaging().sendEachForMulticast(message);
  });

exports.sendChatMessageNotification = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const messageData = snap.data();
    const chatId = context.params.chatId;

    // Fetch chat to get participants
    const chatSnap = await admin.firestore().collection('chats').doc(chatId).get();
    const chatData = chatSnap.data();
    
    // Notify all participants except the sender
    const participants = chatData.participants.filter(id => id !== messageData.senderId);

    for (const receiverId of participants) {
      const tokensSnapshot = await admin.firestore()
        .collection('users')
        .doc(receiverId)
        .collection('fcmTokens')
        .get();
        
      const tokens = tokensSnapshot.docs.map(doc => doc.id);
      
      if (tokens.length > 0) {
        const message = {
          notification: {
            title: 'New message',
            body: `${messageData.senderName}: ${messageData.content}`
          },
          data: {
            chatId: chatId,
            messageId: context.params.messageId
          },
          tokens: tokens
        };
        await admin.messaging().sendEachForMulticast(message);
      }
    }
    return null;
  });
