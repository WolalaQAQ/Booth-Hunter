import { buildCandidateExplanation } from "./explanations";
import { DEFAULT_FUSION_WEIGHTS, fuseSearchEvidence, FusionWeights } from "./fusion";
import { SearchCandidate, SearchEvidence } from "./types";

export function groupSearchCandidates(
  evidence: SearchEvidence[],
  options: {
    limit?: number;
    weights?: FusionWeights;
  } = {}
): SearchCandidate[] {
  const weighted = fuseSearchEvidence(evidence, options.weights || DEFAULT_FUSION_WEIGHTS);
  const groups = new Map<string, SearchCandidate>();

  for (const entry of weighted) {
    const title = typeof entry.metadata?.title === "string" ? entry.metadata.title : undefined;
    const itemUrl = typeof entry.metadata?.itemUrl === "string" ? entry.metadata.itemUrl : undefined;
    const current = groups.get(entry.itemId) || {
      itemId: entry.itemId,
      score: 0,
      evidence: [],
      title,
      itemUrl,
    };

    current.score += entry.weightedScore;
    current.title = current.title || title;
    current.itemUrl = current.itemUrl || itemUrl;
    current.evidence.push({
      itemId: entry.itemId,
      assetId: entry.assetId,
      score: entry.score,
      source: entry.source,
      matchedFields: entry.matchedFields,
      metadata: {
        ...(entry.metadata || {}),
        weight: entry.weight,
        weightedScore: entry.weightedScore,
      },
    });
    groups.set(entry.itemId, current);
  }

  return Array.from(groups.values())
    .map((candidate) => ({
      ...candidate,
      evidence: [...candidate.evidence].sort((left, right) => {
        const leftWeighted = Number(left.metadata?.weightedScore || left.score);
        const rightWeighted = Number(right.metadata?.weightedScore || right.score);
        return rightWeighted - leftWeighted;
      }),
    }))
    .sort((left, right) => right.score - left.score || left.itemId.localeCompare(right.itemId))
    .slice(0, options.limit ?? 10)
    .map((candidate) => ({
      ...candidate,
      explanation: buildCandidateExplanation(candidate),
    }));
}
