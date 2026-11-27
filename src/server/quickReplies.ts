import { GoogleGenAI, Type } from '@google/genai';

export interface QuickRepliesRequestBody {
  messageText: string;
  language?: string;
  senderName?: string;
}

/**
 * Contextual smart fallbacks based on language and message intent
 */
export function generateSmartFallbacks(text: string, language?: string): string[] {
  const isArabic = /[\u0600-\u06FF]/.test(text) || language === 'ar';
  const clean = text.trim().toLowerCase();

  if (isArabic) {
    if (/[؟?]/.test(text) || /^(هل|متى|وين|أين|كيف|شو|إيش|مين|من)/.test(clean)) {
      return ['نعم بالتأكيد 👍', 'لا، للأسف 🙏', 'سأتحقق وأخبرك ⏳'];
    }
    if (/سلام|مرحبا|أهلا|صباح|مساء|يا هلا/.test(clean)) {
      return ['وعليكم السلام ورحمة الله 👋', 'أهلاً وسهلاً بك!', 'حياك الله، كيف حالك؟'];
    }
    if (/شكرا|تسلم|يعطيك|جزاك|مشكور/.test(clean)) {
      return ['عفواً، بأي وقت! 🌸', 'الله يسلمك ويعافيك', 'في خدمتك دائماً 👍'];
    }
    return ['تمام، متفق معك 👍', 'شكراً لك على التوضيح', 'سأرد عليك بعد قليل'];
  }

  // English / other
  if (/\?/.test(text) || /^(is|are|do|does|can|could|would|will|what|when|where|why|how)/i.test(clean)) {
    return ['Yes, definitely! 👍', 'Not right now 🙏', 'Let me check and get back to you'];
  }
  if (/(hi|hello|hey|good morning|good evening)/i.test(clean)) {
    return ['Hello! How are you? 👋', 'Hey there! 😊', 'Good to hear from you!'];
  }
  if (/(thanks|thank you|appreciate)/i.test(clean)) {
    return ['You are welcome! 😊', 'Anytime! 👍', 'Glad to help!'];
  }
  return ['Sounds good! 👍', 'Got it, thanks!', 'Talk to you soon!'];
}

/**
 * Server-side handler for generating 3 AI quick replies for the last received message
 */
export async function handleQuickReplies(req: any, res: any) {
  // CORS & headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let bodyStr = '';
  req.on('data', (chunk: any) => {
    bodyStr += chunk;
  });

  req.on('end', async () => {
    let body: QuickRepliesRequestBody = { messageText: '' };
    try {
      body = bodyStr ? JSON.parse(bodyStr) : {};
    } catch {}

    const { messageText, language, senderName } = body;

    if (!messageText || !messageText.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing messageText parameter' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('[QuickReplies] GEMINI_API_KEY not configured, using smart fallbacks');
      const fallbackReplies = generateSmartFallbacks(messageText, language);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ replies: fallbackReplies, source: 'fallback' }));
      return;
    }

    try {
      // Initialize Gemini with telemetry User-Agent header
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Last received message from ${senderName || 'user'}: "${messageText}". Language context: ${language || 'auto'}. Suggest 3 quick reply options for me to reply to this message.`,
        config: {
          systemInstruction: `You are an AI assistant built into the Hala chat messaging app. Generate exactly 3 short, natural, conversational quick reply suggestions for the user to respond to the last received message.
Rules:
1. The replies must directly address the sender's message.
2. Keep each reply concise: 1 to 5 words maximum.
3. Match the language of the message: if Arabic, write natural Arabic replies. If English, write English replies.
4. Provide diverse sentiment options (e.g. affirmative/agree, polite decline/busy, inquiring/neutral).
5. Output MUST be a JSON array containing exactly 3 strings.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        },
      });

      let replies: string[] = [];
      try {
        const text = response.text || '[]';
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          replies = parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 3);
        }
      } catch (err) {
        console.warn('[QuickReplies] Failed to parse model output:', err);
      }

      if (replies.length < 3) {
        const fallbacks = generateSmartFallbacks(messageText, language);
        while (replies.length < 3 && fallbacks.length > 0) {
          const next = fallbacks.shift();
          if (next && !replies.includes(next)) replies.push(next);
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ replies: replies.slice(0, 3), source: 'gemini' }));
    } catch (err: any) {
      console.error('[QuickReplies] Error generating replies:', err?.message || err);
      const fallbackReplies = generateSmartFallbacks(messageText, language);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ replies: fallbackReplies, source: 'fallback', error: err?.message }));
    }
  });
}
