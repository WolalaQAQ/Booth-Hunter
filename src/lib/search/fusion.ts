import { SearchEvidence, SearchSource } from "./types";

export type FusionWeights = Record<SearchSource, number>;

export type WeightedSearchEvidence = SearchEvidence & {
  weight: number;
  weightedScore: number;
};

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  dense_text: 1,
  dense_image: 1,
  lexical: 1.2,
};

export function fuseSearchEvidence(
  evidence: SearchEvidence[],
  weights: FusionWeights = DEFAULT_FUSION_WEIGHTS
): WeightedSearchEvidence[] {
  return evidence.map((entry) => {
    const weight = weights[entry.source] ?? 1;
    return {
      ...entry,
      weight,
      weightedScore: entry.score * weight,
    };
  });
}
