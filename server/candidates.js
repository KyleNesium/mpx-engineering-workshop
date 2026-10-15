import { candidates } from "./seed-data.js";

export function listCandidateSummaries() {
  return candidates.map(({ id, name, initials, role, location, experienceYears, skills, status }) => ({
    id,
    name,
    initials,
    role,
    location,
    experienceYears,
    skills,
    status,
  }));
}

export function getCandidateById(id) {
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

export function exportCandidatesCsv() {
  const rows = [
    ["id", "name", "email", "phone", "privateNotes"],
    ...candidates.map(({ id, name, email, phone, privateNotes }) => [
      id, name, email, phone, privateNotes,
    ]),
  ];

  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
}
