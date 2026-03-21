import { SearchCandidate, SearchEvidence, SearchResult, TextSearchInput, TextSearchQuery } from "../types";

export type TextRetrieverDependencies = {
  embedQuery: (query: TextSearchQuery) => Promise<number[]>;
  denseSearch: (vector: number[], query: TextSearchQuery) => Promise<SearchEvidence[]>;
  lexicalSearch?: (text: string, query: TextSearchQuery) => Promise<SearchEvidence[]>;
  groupCandidates: (evidence: SearchEvidence[], limit: number, query: TextSearchQuery) => SearchCandidate[];
};

export function createTextRetriever(dependencies: TextRetrieverDependencies) {
  return {
    async search(input: TextSearchInput): Promise<SearchResult<TextSearchQuery>> {
      const query: TextSearchQuery = {
        kind: "text",
        ...input,
      };

      const vector = await dependencies.embedQuery(query);
      const evidence = await dependencies.denseSearch(vector, query);
      const lexicalEvidence = dependencies.lexicalSearch ? await dependencies.lexicalSearch(query.text, query) : [];
      const mergedEvidence = [...evidence, ...lexicalEvidence];
      const candidates = dependencies.groupCandidates(mergedEvidence, query.limit ?? 10, query);

      return {
        query,
        candidates,
        evidence: mergedEvidence,
      };
    },
  };
}
