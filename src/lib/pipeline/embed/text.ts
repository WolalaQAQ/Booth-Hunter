import { cosineSimilarity } from "../../search/scoring";

const DEFAULT_DIMENSION = 256;

function tokenize(text: string): string[] {
  const latin = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const cjkChars = Array.from(text).filter((char) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char));
  return [...latin, ...cjkChars];
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (const char of token) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function embedTextLocal(text: string, dimension = DEFAULT_DIMENSION): number[] {
  const vector = new Array(dimension).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % dimension;
    vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export { cosineSimilarity };
