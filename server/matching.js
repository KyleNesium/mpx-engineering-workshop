import { broaderSkills } from "./skills.js";

function normalized(value) {
  return value.trim().toLowerCase();
}

export function scoreJob(job, candidate) {
  const candidateSkills = new Set(candidate.skills.map(normalized));
  const skillBreakdown = job.skills.map((skill) => {
    const matched = candidateSkills.has(normalized(skill));
    const relatedSkill = matched ? undefined : Object.entries(broaderSkills).find(
      ([candidateSkill, parents]) => candidateSkills.has(normalized(candidateSkill))
        && parents.some((parent) => normalized(parent) === normalized(skill)),
    )?.[0];
    const matchType = matched ? "exact" : relatedSkill ? "related" : "missing";
    const credit = matched ? 1 : relatedSkill ? 0.5 : 0;

    return {
      skill,
      matched,
      matchType,
      matchedSkill: matched ? skill : relatedSkill ?? null,
      credit,
      points: credit * 80 / job.skills.length,
      reason: matched ? "Exact skill" : relatedSkill ? `${relatedSkill} → ${skill} (50% credit)` : "Not found",
    };
  });
  const matchedCount = skillBreakdown.filter((item) => item.matched).length;
  const relatedCount = skillBreakdown.filter((item) => item.matchType === "related").length;
  const skillScore = job.skills.length ? (matchedCount + relatedCount * 0.5) / job.skills.length : 0;
  const locationFits = job.location === candidate.location || job.workMode === "Remote";
  const locationScore = locationFits ? 20 : 0;
  const score = Math.round(skillScore * 80 + locationScore);

  return {
    score,
    matchedCount,
    relatedCount,
    requiredCount: job.skills.length,
    locationFits,
    locationScore,
    skillBreakdown,
  };
}

export function rankJobs(jobs, candidate) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, candidate) }))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));
}
