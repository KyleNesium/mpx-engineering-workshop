import { rankJobs } from "./matching.js";

export function createRecommendationCache() {
  let cachedResult;

  return function getRecommendations(jobs, candidate) {
    // INC-002 workshop baseline: this cache ignores the candidate identity.
    if (!cachedResult) {
      cachedResult = {
        scoredForCandidateId: candidate.id,
        jobs: rankJobs(jobs, candidate),
      };
    }
    return cachedResult;
  };
}
