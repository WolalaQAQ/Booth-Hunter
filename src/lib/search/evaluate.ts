import { ImageSearchInput, SearchEvaluationMetrics, SearchResult, TextSearchInput } from "./types";

export type Goal12TextBenchmarkCase = {
  id: string;
  kind: "text";
  query: Pick<TextSearchInput, "text" | "limit" | "filters">;
  relevantItemIds: string[];
  notes?: string;
};

export type Goal12ImageBenchmarkCase = {
  id: string;
  kind: "image";
  query: Pick<ImageSearchInput, "imagePath" | "text" | "limit" | "filters">;
  relevantItemIds: string[];
  notes?: string;
};

export type Goal12BenchmarkCase = Goal12TextBenchmarkCase | Goal12ImageBenchmarkCase;

export type Goal12Benchmark = {
  generatedAt?: string;
  dataset?: {
    dbPath?: string;
    benchmarkPath?: string;
  };
  cases: Goal12BenchmarkCase[];
};

export type Goal12CaseEvaluation = {
  id: string;
  kind: Goal12BenchmarkCase["kind"];
  relevantItemIds: string[];
  returnedItemIds: string[];
  firstRelevantRank: number | null;
  hitAtK: Record<number, boolean>;
  candidateUsefulnessAtK: Record<number, number>;
};

export type Goal12EvaluationResult = {
  generatedAt: string;
  ks: number[];
  summary: SearchEvaluationMetrics;
  caseResults: Goal12CaseEvaluation[];
};

export type Goal12SearchRunner = (benchmarkCase: Goal12BenchmarkCase) => Promise<SearchResult>;

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function findFirstRelevantRank(relevantItemIds: Set<string>, returnedItemIds: string[]): number | null {
  const index = returnedItemIds.findIndex((itemId) => relevantItemIds.has(itemId));
  return index === -1 ? null : index + 1;
}

function evaluateCaseAtK(relevantItemIds: Set<string>, returnedItemIds: string[], k: number) {
  const topK = returnedItemIds.slice(0, k);
  const relevantHits = topK.filter((itemId) => relevantItemIds.has(itemId)).length;

  return {
    hit: relevantHits > 0,
    usefulness: topK.length > 0 ? roundMetric(relevantHits / topK.length) : 0,
  };
}

export async function evaluateGoal12Benchmark(
  benchmark: Goal12Benchmark,
  runSearch: Goal12SearchRunner,
  options: { ks?: number[] } = {}
): Promise<Goal12EvaluationResult> {
  const ks = (options.ks && options.ks.length > 0 ? options.ks : [1, 3, 5, 10]).slice().sort((left, right) => left - right);
  const caseResults: Goal12CaseEvaluation[] = [];

  for (const benchmarkCase of benchmark.cases) {
    const searchResult = await runSearch(benchmarkCase);
    const relevantItemIds = new Set(benchmarkCase.relevantItemIds);
    const returnedItemIds = searchResult.candidates.map((candidate) => candidate.itemId);
    const hitAtK: Record<number, boolean> = {};
    const candidateUsefulnessAtK: Record<number, number> = {};

    for (const k of ks) {
      const metricsAtK = evaluateCaseAtK(relevantItemIds, returnedItemIds, k);
      hitAtK[k] = metricsAtK.hit;
      candidateUsefulnessAtK[k] = metricsAtK.usefulness;
    }

    caseResults.push({
      id: benchmarkCase.id,
      kind: benchmarkCase.kind,
      relevantItemIds: benchmarkCase.relevantItemIds,
      returnedItemIds,
      firstRelevantRank: findFirstRelevantRank(relevantItemIds, returnedItemIds),
      hitAtK,
      candidateUsefulnessAtK,
    });
  }

  const totalCases = caseResults.length;
  const hitRateAtK = Object.fromEntries(
    ks.map((k) => [
      k,
      totalCases > 0 ? roundMetric(caseResults.filter((result) => result.hitAtK[k]).length / totalCases) : 0,
    ])
  );
  const candidateUsefulnessAtK = Object.fromEntries(
    ks.map((k) => [
      k,
      totalCases > 0
        ? roundMetric(caseResults.reduce((sum, result) => sum + result.candidateUsefulnessAtK[k], 0) / totalCases)
        : 0,
    ])
  );

  return {
    generatedAt: new Date().toISOString(),
    ks,
    summary: {
      totalCases,
      hitRateAtK,
      candidateUsefulnessAtK,
    },
    caseResults,
  };
}
