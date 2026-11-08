import { buildPersonalFishingAnalysis } from "../../ai/personalFishingAnalysis.js";

// Compatibility for existing consumers; the full Home card also exposes the
// ranked evidence and optional, separately consented AI interpretation.
export function buildHomeInsight(catches, options) {
  const report = buildPersonalFishingAnalysis(catches, options);
  return { ...report.strongest, message: report.strongest.observation, basedOnRecords: report.recordCount,
    fingerprint: report.fingerprint, candidates: report.candidates };
}
