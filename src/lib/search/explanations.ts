import { SearchCandidate } from "./types";

const FIELD_LABELS: Record<string, string> = {
  compatibilityHints: "compatibility",
  styles: "style",
  parts: "part",
  ocrText: "OCR text",
  ocrTexts: "OCR text",
  captionText: "caption",
  captionTexts: "caption",
  title: "title",
  tags: "tags",
};

function labelField(field: string): string {
  return FIELD_LABELS[field] || field;
}

export function buildCandidateExplanation(candidate: Pick<SearchCandidate, "evidence"> | SearchCandidate): string {
  const segments = candidate.evidence.slice(0, 3).map((evidence) => {
    if (evidence.source === "lexical") {
      const fields = (evidence.matchedFields || []).map(labelField);
      const detail = fields.length > 0 ? ` in ${fields.join(", ")}` : "";
      return `Exact-term lexical match${detail}`;
    }

    if (evidence.source === "dense_image") {
      return "Strong visual similarity from indexed product images";
    }

    return "Strong semantic text similarity";
  });

  return Array.from(new Set(segments)).join("; ");
}
