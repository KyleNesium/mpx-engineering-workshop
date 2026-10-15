import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogSummary, getJobById, listJobs } from "../server/catalog.js";

test("catalog baseline contains the seeded duplicate role", () => {
  const jobs = listJobs();
  const copies = jobs.filter((job) => job.canonicalId === "role-101");
  assert.equal(copies.length, 2);
  assert.equal(getCatalogSummary().visibleListings, 8);
  assert.equal(getCatalogSummary().uniqueRoles, 7);
});

test("catalog can filter by query, category, and location", () => {
  assert.equal(listJobs({ query: "Security" }).length, 1);
  assert.equal(listJobs({ category: "Data" }).length, 1);
  assert.equal(listJobs({ location: "Lausanne" }).some((job) => job.id === "job-103"), true);
  assert.equal(listJobs({ location: "Bern" }).some((job) => job.id === "job-106"), true);
  assert.equal(getJobById("job-102")?.title, "Data Platform Engineer");
});
