import { useEffect, useState } from "react";
import Icon from "./components/Icon.jsx";
import { api } from "./lib/api.js";
import "./incident.css";

const profiles = [
  { id: "candidate-001", name: "Maya Becker" },
  { id: "candidate-002", name: "Noah Fischer" },
];

async function loadEvidence() {
  const first = await api.matches(profiles[0].id);
  const second = await api.matches(profiles[1].id);
  return [first, second];
}

export default function MatchIncidentPage() {
  const [evidence, setEvidence] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    loadEvidence()
      .then((result) => { if (active) setEvidence(result); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      setEvidence(await loadEvidence());
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setRefreshing(false);
    }
  }

  const affected = evidence?.filter((result, index) => result.candidateId !== profiles[index].id || result.scoredForCandidateId !== profiles[index].id) ?? [];
  const resolved = evidence && affected.length === 0;
  const diagnosticLogs = evidence?.flatMap((result, index) => {
    const requestedId = profiles[index].id;
    const mismatch = requestedId !== result.candidateId || requestedId !== result.scoredForCandidateId;
    return [
      { level: "INFO", message: `GET /api/matches?candidateId=${requestedId} -> 200` },
      { level: "INFO", message: `response candidateId=${result.candidateId} scoredForCandidateId=${result.scoredForCandidateId} topResult=${result.jobs[0]?.id ?? "none"}` },
      { level: mismatch ? "ERROR" : "INFO", message: `match.integrity requested=${requestedId} scoredFor=${result.scoredForCandidateId} status=${mismatch ? "MISMATCH" : "OK"}` },
    ];
  }) ?? [];

  return (
    <div className="incident-page">
      <header className="incident-header">
        <a className="incident-brand" href="/"><span className="incident-mark"><Icon name="layers" size={22} /></span><strong>JobMatch <em>Lab</em></strong></a>
        <span className="incident-demo-tag">SIMULATED P1 INCIDENT</span>
        <div className="incident-header-actions">
          <button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? "Checking..." : "Refresh evidence"}</button>
          <a href="/">Open marketplace <Icon name="arrow" size={15} /></a>
        </div>
      </header>

      <main className="incident-main">
        <section className={`incident-hero match-incident-hero ${resolved ? "is-resolved" : ""}`}>
          <div>
            <div className="incident-eyebrow"><span className="incident-pulse" /> LIVE WORKSHOP EVIDENCE</div>
            <div className="incident-badges"><span>INC-002</span><span>P1 · MATCH INTEGRITY</span><span className={resolved ? "status-resolved" : "status-open"} role="status">{resolved ? "VERIFIED RESOLVED" : "ACTIVE"}</span></div>
            <h1>{resolved ? "Each profile receives its own ranking" : "One candidate sees another's ranking"}</h1>
            <p>{resolved ? "The latest check shows recommendations calculated for each requested profile." : "After a profile switch, the marketplace may display a ranking calculated for someone else. Use the evidence and diagnostic trace below to investigate."}</p>
          </div>
          <div className="incident-hero-symbol"><Icon name={resolved ? "check" : "alert"} size={56} /></div>
        </section>

        {error && <div className="incident-error" role="alert">Could not load match evidence: {error}</div>}
        {!evidence && !error && <p className="incident-loading">Loading live match evidence...</p>}

        {evidence && <>
          <div className="incident-stat-grid">
            <div className="incident-stat"><span>Profiles checked</span><strong>2</strong><small>Sequential API requests</small></div>
            <div className="incident-stat"><span>Misattributed responses</span><strong data-testid="misattributed-count">{affected.length}</strong><small>Requested profile differs from scoring profile</small></div>
            <div className="incident-stat"><span>Severity</span><strong>P1</strong><small>Recommendation integrity</small></div>
          </div>

          <div className="incident-content-grid">
            <section className="incident-panel evidence-panel">
              <span className="incident-kicker">01 / API EVIDENCE</span>
              <h2>Compare two candidate requests</h2>
              <p>The API reports both the requested profile and the profile used to compute the score. They must be the same for every response.</p>
              <div className="match-evidence-list">
                {evidence.map((result, index) => <div className="match-evidence-card" key={result.candidateId}>
                  <div><strong>{profiles[index].name}</strong><span className={result.candidateId === result.scoredForCandidateId ? "match-ok" : "match-bad"}>{result.candidateId === result.scoredForCandidateId ? "Correct" : "Wrong profile"}</span></div>
                  <code>Requested: {result.candidateId}</code>
                  <code>Scored for: {result.scoredForCandidateId}</code>
                  <small>Top result: {result.jobs[0]?.title ?? "None"} · {result.jobs[0]?.match.score ?? 0}%</small>
                </div>)}
              </div>
              <div className={`incident-callout ${resolved ? "resolved" : ""}`}><Icon name={resolved ? "check" : "alert"} size={18} /><span>{resolved ? "Both requests use the correct candidate profile." : "A profile switch can show misleading recommendations to the wrong person."}</span></div>
            </section>

            <section className="incident-panel investigation-panel">
              <span className="incident-kicker">02 / DIAGNOSTIC TRACE</span>
              <h2>Latest match check</h2>
              <p>These log-style entries are reconstructed from the live API responses above. Refresh evidence after a server restart to compare the result.</p>
              <div className="incident-log" role="log" aria-label="P1 incident diagnostic trace">
                {diagnosticLogs.map((entry, index) => <div className={`incident-log-line ${entry.level.toLowerCase()}`} key={`${index}-${entry.message}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{entry.level}</strong><code>{entry.message}</code></div>)}
              </div>
              <h3>Questions to investigate</h3>
              <ol><li>Which request first produces a different scoring profile?</li><li>Does the result change when the request order changes?</li><li>What happens between request handling and the returned ranking?</li></ol>
            </section>
          </div>

          <section className="incident-panel incident-bottom">
            <div><span className="incident-kicker">03 / VERIFICATION</span><h2>Expected outcome</h2><p>Every response should be scored for the requested profile, regardless of which profile was requested earlier.</p></div>
            <div className="incident-steps"><span>Reproduce</span><Icon name="arrow" size={16} /><span>Fix INC-002</span><Icon name="arrow" size={16} /><span>Run tests</span><Icon name="arrow" size={16} /><span>Restart + verify</span></div>
          </section>
        </>}
        <p className="incident-footer">All profiles and results are fictional. No real hiring decisions or applicant records are involved.</p>
      </main>
    </div>
  );
}
