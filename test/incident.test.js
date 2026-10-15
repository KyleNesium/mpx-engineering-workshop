import test from "node:test";
import assert from "node:assert/strict";
import { getDuplicateListings } from "../src/lib/incident.js";
import { listJobs } from "../server/catalog.js";

test("incident evidence identifies the seeded duplicate role", () => {
  const groups = getDuplicateListings(listJobs());
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((job) => job.source), ["Direct", "Partner feed"]);
});

test("incident evidence resolves when the catalog contains unique roles", () => {
  const unique = [...new Map(listJobs().map((job) => [job.canonicalId, job])).values()];
  assert.deepEqual(getDuplicateListings(unique), []);
});
