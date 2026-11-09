// STABLE: text decrypt. Dusre kaam ke liye is file ko mat chhedo.
import { useState, useEffect } from 'react';
import { MessageModel, Language } from '../types';
import { decryptTextContent } from '../lib/crypto';

export function useDecryptedTexts(
  messages: MessageModel[],
  conversationKey: CryptoKey | null,
  language: Language
) {
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const isRtl = language === 'ar';
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  useEffect(() => {
    if (!conversationKey || messages.length === 0) return;

    try {
      const start = performance.now();
      const textsToDecrypt = messages.filter(msg => 
        (msg.content?.startsWith('e2ee:v1:') && !decryptedTexts[msg.id]) ||
        (msg.caption?.startsWith('e2ee:v1:') && !decryptedTexts[`${msg.id}_caption`])
      );

      if (textsToDecrypt.length === 0) return;

      textsToDecrypt.forEach(async (msg) => {
        // Content decryption
        if (msg.content?.startsWith('e2ee:v1:') && !decryptedTexts[msg.id]) {
          try {
            if (isDebug) console.log(`[Debug] Text decrypt before: ${performance.now()}ms`);
            const plain = await decryptTextContent(msg.content, conversationKey, language === 'ar' ? 'ar' : 'en', msg.id);
            if (plain) {
              setDecryptedTexts(prev => ({ ...prev, [msg.id]: plain }));
              const afterTime = performance.now();
              if (isDebug) console.log(`[Debug] Text decrypt after: ${afterTime}ms | Duration: ${afterTime - start}ms: ${msg.id}`);
            } else {
              setDecryptedTexts(prev => ({ ...prev, [msg.id]: isRtl ? '🔒 خطأ في فك التشفير' : '🔒 Decryption error' }));
            }
          } catch (e) {
            setDecryptedTexts(prev => ({ ...prev, [msg.id]: isRtl ? '🔒 خطأ في فك التشفير' : '🔒 Decryption error' }));
          }
        }
        // Caption decryption
        if (msg.caption?.startsWith('e2ee:v1:') && !decryptedTexts[`${msg.id}_caption`]) {
          try {
            const plain = await decryptTextContent(msg.caption, conversationKey, language === 'ar' ? 'ar' : 'en', `${msg.id}_caption`);
            if (plain) {
              setDecryptedTexts(prev => ({ ...prev, [`${msg.id}_caption`]: plain }));
            }
          } catch (e) {
            setDecryptedTexts(prev => ({ ...prev, [`${msg.id}_caption`]: '' }));
          }
        }
      });
    } catch (err) {
      console.error('[useDecryptedTexts] Error:', err);
    }
  }, [messages, conversationKey, language, isRtl, decryptedTexts, isDebug]);

  return decryptedTexts;
}
