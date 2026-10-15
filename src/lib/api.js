async function get(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body;
}

export const api = {
  overview: () => get("/api/overview"),
  jobs: () => get("/api/jobs"),
  candidates: () => get("/api/candidates"),
  matches: (candidateId) => get(`/api/matches?candidateId=${encodeURIComponent(candidateId)}`),
};
