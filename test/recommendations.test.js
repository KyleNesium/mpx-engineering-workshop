import test from "node:test";
import assert from "node:assert/strict";
import { createRecommendationCache } from "../server/recommendations.js";
import { listJobs } from "../server/catalog.js";
import { candidates } from "../server/seed-data.js";

test("INC-002 baseline reuses one candidate's ranking for another", () => {
  const getRecommendations = createRecommendationCache();
  const jobs = listJobs();
  const first = getRecommendations(jobs, candidates[0]);
  const second = getRecommendations(jobs, candidates[1]);
  assert.equal(first.scoredForCandidateId, candidates[0].id);
  assert.equal(second.scoredForCandidateId, candidates[0].id);
  assert.deepEqual(second.jobs, first.jobs);
});
