import { useMemo } from 'react';
import { EmojiDictionary } from '../data/emojiKeywords';

export function useEmojiSuggestions(text: string, caretPosition: number): string[] {
  return useMemo(() => {
    if (!text || caretPosition <= 0) return [];

    // Extract substring up to caret
    const textBeforeCaret = text.slice(0, caretPosition);
    
    // Find the last word (split by whitespace or punctuation)
    const match = textBeforeCaret.match(/[\p{L}\p{N}]+$/u);
    if (!match || !match[0]) return [];

    const lastWord = match[0];
    if (lastWord.length < 1) return [];

    return EmojiDictionary.lookup(lastWord);
  }, [text, caretPosition]);
}
