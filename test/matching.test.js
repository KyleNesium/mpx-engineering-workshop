import assert from "node:assert/strict";
import test from "node:test";
import { scoreJob, rankJobs } from "../server/matching.js";
import { primaryJobs } from "../server/seed-data.js";
import { getCandidateById } from "../server/candidates.js";

test("exact skill matches and location produce an explainable score", () => {
  const job = { location: "Zurich", workMode: "Hybrid", skills: ["React", "TypeScript", "API design", "Unrelated"] };
  const result = scoreJob(job, getCandidateById("candidate-001"));
  assert.equal(result.score, 80);
  assert.equal(result.matchedCount, 3);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matched), [true, true, true, false]);
  assert.equal(result.locationFits, true);
  assert.equal(result.relatedCount, 0);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "exact", "exact", "missing"]);
});

test("a direct related skill receives half credit with evidence", () => {
  const job = { location: "Bern", workMode: "Hybrid", skills: ["Frontend development"] };
  const candidate = { location: "Zurich", skills: ["React"] };
  const result = scoreJob(job, candidate);
  assert.equal(result.score, 40);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.relatedCount, 1);
  assert.deepEqual(result.skillBreakdown[0], {
    skill: "Frontend development", matched: false, matchType: "related", matchedSkill: "React",
    credit: 0.5, points: 40, reason: "React → Frontend development (50% credit)",
  });
});

test("Maya's existing exact contributions remain and related credit explains the new total", () => {
  const result = scoreJob(primaryJobs[0], getCandidateById("candidate-001"));
  assert.equal(result.score, 90);
  assert.equal(result.matchedCount, 3);
  assert.equal(result.relatedCount, 1);
  assert.deepEqual(result.skillBreakdown.map((item) => item.points), [20, 20, 20, 10]);
  assert.equal(result.locationScore, 20);
});

test("unrelated, reverse, and sibling relationships receive no credit", () => {
  for (const [required, candidateSkill] of [["Frontend development", "SQL"], ["React", "Frontend development"], ["Python", "TypeScript"]]) {
    const result = scoreJob({ location: "Bern", skills: [required] }, { location: "Zurich", skills: [candidateSkill] });
    assert.equal(result.score, 0);
    assert.equal(result.relatedCount, 0);
    assert.equal(result.skillBreakdown[0].matchType, "missing");
    assert.equal(result.skillBreakdown[0].points, 0);
  }
});

test("exact takes precedence and multiple related skills do not stack", () => {
  const job = { location: "Bern", skills: ["Data engineering"] };
  const candidate = { location: "Zurich", skills: ["SQL", "Data pipelines", "SQL"] };
  const related = scoreJob(job, candidate);
  assert.equal(related.score, 40);
  assert.equal(related.relatedCount, 1);
  assert.deepEqual(scoreJob(job, { ...candidate, skills: [...candidate.skills].reverse() }), related);
  const exact = scoreJob(job, { ...candidate, skills: [...candidate.skills, "Data engineering"] });
  assert.equal(exact.score, 80);
  assert.equal(exact.matchedCount, 1);
  assert.equal(exact.relatedCount, 0);
});

test("normalization, remote location credit, rounding, and bounds remain deterministic", () => {
  const candidate = { location: "Zurich", skills: [" react "] };
  const job = { location: "Bern", workMode: "Remote", skills: [" frontend DEVELOPMENT ", "React", "Missing"] };
  const result = scoreJob(job, candidate);
  assert.equal(result.score, 60);
  assert.equal(result.locationScore, 20);
  assert.deepEqual(result.skillBreakdown.map((item) => item.credit), [0.5, 1, 0]);
  assert.equal(result.score, Math.round(result.skillBreakdown.reduce((sum, item) => sum + item.points, 0) + result.locationScore));
  assert.deepEqual(scoreJob(job, candidate), result);
  for (const skills of [[], ["Missing"], ["React"], ["Frontend development"]]) {
    const scored = scoreJob({ ...job, skills }, candidate);
    assert.ok(scored.score >= 0 && scored.score <= 100);
    assert.ok(Number.isInteger(scored.score));
  }
  const tied = [{ ...job, id: "b", title: "Beta" }, { ...job, id: "a", title: "Alpha" }];
  assert.deepEqual(rankJobs(tied, candidate).map((item) => item.id), ["a", "b"]);
});

test("remote roles count as a location fit and ranking is stable", () => {
  const candidate = getCandidateById("candidate-003");
  const ranked = rankJobs(primaryJobs, candidate);
  assert.equal(ranked[0].id, "job-103");
  assert.equal(ranked[0].match.locationFits, true);
});
