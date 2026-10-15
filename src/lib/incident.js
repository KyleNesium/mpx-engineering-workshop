export function getDuplicateListings(jobs) {
  const byRole = new Map();

  for (const job of jobs) {
    const listings = byRole.get(job.canonicalId) ?? [];
    listings.push(job);
    byRole.set(job.canonicalId, listings);
  }

  return [...byRole.values()].filter((listings) => listings.length > 1);
}
