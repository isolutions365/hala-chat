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
