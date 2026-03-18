import { cosineSimilarity } from '../embed/text';

export type RankedResult = {
  itemId: string;
  score: number;
};

export function rankTextMatches(queryVector: number[], documents: { itemId: string; vector: number[] }[], limit = 10): RankedResult[] {
  return documents
    .map((document) => ({ itemId: document.itemId, score: cosineSimilarity(queryVector, document.vector) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function rankHybridMatches(textMatches: RankedResult[], imageMatches: RankedResult[], textWeight = 0.7, imageWeight = 0.3, limit = 10): RankedResult[] {
  const scores = new Map<string, number>();
  for (const match of textMatches) {
    scores.set(match.itemId, (scores.get(match.itemId) || 0) + match.score * textWeight);
  }
  for (const match of imageMatches) {
    scores.set(match.itemId, (scores.get(match.itemId) || 0) + match.score * imageWeight);
  }
  return Array.from(scores.entries())
    .map(([itemId, score]) => ({ itemId, score }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
