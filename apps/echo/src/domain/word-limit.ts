// The word limit is arithmetic, so it is code, not prompt (HAR-06).
export const MAX_WORDS = 25;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wordLimit(text: string, max = MAX_WORDS): { ok: boolean; words: number } {
  const words = countWords(text);
  return { ok: words > 0 && words <= max, words };
}
