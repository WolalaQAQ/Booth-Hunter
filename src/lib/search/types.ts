export type SearchSource = "dense_text" | "dense_image" | "lexical";

export type SearchFilters = Record<string, string | number | boolean | string[] | undefined>;

export type SearchEvidence = {
  itemId: string;
  assetId: string;
  score: number;
  source: SearchSource;
  matchedFields?: string[];
  metadata?: Record<string, unknown>;
};

export type SearchCandidate = {
  itemId: string;
  score: number;
  evidence: SearchEvidence[];
  title?: string;
  itemUrl?: string;
  explanation?: string;
  metadata?: Record<string, unknown>;
};

export type TextSearchInput = {
  text: string;
  limit?: number;
  filters?: SearchFilters;
};

export type TextSearchQuery = TextSearchInput & {
  kind: "text";
};

export type ImageSearchInput = {
  imagePath: string;
  text?: string;
  limit?: number;
  filters?: SearchFilters;
};

export type ImageSearchQuery = ImageSearchInput & {
  kind: "image";
};

export type SearchQuery = TextSearchQuery | ImageSearchQuery;

export type SearchResult<TQuery extends SearchQuery = SearchQuery> = {
  query: TQuery;
  candidates: SearchCandidate[];
  evidence: SearchEvidence[];
};

export type EvaluationHitRate = Record<number, number>;

export type SearchEvaluationMetrics = {
  totalCases: number;
  hitRateAtK: EvaluationHitRate;
  candidateUsefulnessAtK: EvaluationHitRate;
};
