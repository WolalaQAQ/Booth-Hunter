import { groupSearchCandidates } from "../grouping";
import { FusionWeights } from "../fusion";
import { ImageSearchInput, ImageSearchQuery, SearchCandidate, SearchEvidence, SearchResult } from "../types";

export type ImageRetrieverDependencies = {
  embedQuery: (query: ImageSearchQuery) => Promise<number[]>;
  denseSearch: (vector: number[], query: ImageSearchQuery) => Promise<SearchEvidence[]>;
  lexicalSearch?: (text: string, query: ImageSearchQuery) => Promise<SearchEvidence[]>;
  groupCandidates?: (evidence: SearchEvidence[], limit: number, query: ImageSearchQuery) => SearchCandidate[];
  fusionWeights?: FusionWeights;
};

export function createImageRetriever(dependencies: ImageRetrieverDependencies) {
  return {
    async search(input: ImageSearchInput): Promise<SearchResult<ImageSearchQuery>> {
      const query: ImageSearchQuery = {
        kind: "image",
        ...input,
      };

      const vector = await dependencies.embedQuery(query);
      const evidence = await dependencies.denseSearch(vector, query);
      const lexicalEvidence =
        dependencies.lexicalSearch && query.text ? await dependencies.lexicalSearch(query.text, query) : [];
      const mergedEvidence = [...evidence, ...lexicalEvidence];
      const candidates = (dependencies.groupCandidates ||
        ((records, limit) => groupSearchCandidates(records, { limit, weights: dependencies.fusionWeights })))(
        mergedEvidence,
        query.limit ?? 10,
        query
      );

      return {
        query,
        candidates,
        evidence: mergedEvidence,
      };
    },
  };
}
