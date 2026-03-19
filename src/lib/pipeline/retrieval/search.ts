import { cosineSimilarity } from '../embed/text';

export type RankedResult = {
  itemId: string;
  score: number;
};

export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimension = Math.max(...vectors.map((vector) => vector.length));
  const accumulator = new Array(dimension).fill(0);
  for (const vector of vectors) {
    for (let index = 0; index < dimension; index += 1) {
      accumulator[index] += vector[index] || 0;
    }
  }
  return normalizeVector(accumulator.map((value) => value / vectors.length));
}

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

export function rankImageMatchesByItem(queryVector: number[], documents: { imageKey: string; vector: number[] }[], limit = 10): RankedResult[] {
  const scores = new Map<string, number>();
  for (const document of documents) {
    const itemId = document.imageKey.split(':')[0];
    const score = cosineSimilarity(queryVector, document.vector);
    scores.set(itemId, Math.max(scores.get(itemId) ?? -Infinity, score));
  }

  return Array.from(scores.entries())
    .map(([itemId, score]) => ({ itemId, score }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
