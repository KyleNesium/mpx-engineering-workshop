import { useCallback, useEffect, useState } from "react";
import Icon from "./components/Icon.jsx";
import { api } from "./lib/api.js";
import { getDuplicateListings } from "./lib/incident.js";
import "./incident.css";

export default function IncidentPage() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await api.jobs();
      setJobs(result.jobs);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.jobs()
      .then((result) => { if (active) setJobs(result.jobs); })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, []);

  const duplicates = jobs ? getDuplicateListings(jobs) : [];
  const affected = duplicates[0] ?? [];
  const resolved = jobs !== null && duplicates.length === 0;
  const role = affected[0];

  return (
    <div className="incident-page">
      <header className="incident-header">
        <a className="incident-brand" href="/"><span className="incident-mark"><Icon name="layers" size={22} /></span><strong>JobMatch <em>Lab</em></strong></a>
        <span className="incident-demo-tag">SIMULATED INCIDENT</span>
        <div className="incident-header-actions">
          <button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? "Checking..." : "Refresh evidence"}</button>
          <a href="/">Open marketplace <Icon name="arrow" size={15} /></a>
        </div>
      </header>

      <main className="incident-main">
        <section className={`incident-hero ${resolved ? "is-resolved" : ""}`}>
          <div>
            <div className="incident-eyebrow"><span className="incident-pulse" /> LIVE WORKSHOP EVIDENCE</div>
            <div className="incident-badges"><span>INC-001</span><span>CATALOG QUALITY</span><span className={resolved ? "status-resolved" : "status-open"} role="status">{resolved ? "VERIFIED RESOLVED" : "OPEN"}</span></div>
            <h1>{resolved ? "Duplicate listing no longer appears" : "The same job appears twice"}</h1>
            <p>{resolved ? "The current API response contains one listing per role. The workshop fix is visible here after refresh." : "A direct job posting and its partner-feed copy appear as separate opportunities in the marketplace and match results."}</p>
          </div>
          <div className="incident-hero-symbol"><Icon name={resolved ? "check" : "bug"} size={56} /></div>
        </section>

        {error && <div className="incident-error" role="alert">Could not load catalog evidence: {error}</div>}
        {!jobs && !error && <p className="incident-loading">Loading live catalog evidence...</p>}

        {jobs && <>
          <div className="incident-stat-grid">
            <div className="incident-stat"><span>Visible listings</span><strong>{jobs.length}</strong><small>From the live catalog API</small></div>
            <div className="incident-stat"><span>Unique roles</span><strong>{new Set(jobs.map((job) => job.canonicalId)).size}</strong><small>Grouped by canonical ID</small></div>
            <div className="incident-stat"><span>Duplicate groups</span><strong data-testid="duplicate-count">{duplicates.length}</strong><small>{resolved ? "No repeated roles found" : "Repeated across source feeds"}</small></div>
          </div>

          <div className="incident-content-grid">
            <section className="incident-panel evidence-panel">
              <span className="incident-kicker">01 / USER-VISIBLE EVIDENCE</span>
              <h2>{resolved ? "Catalog now shows one role" : "Two cards, one opportunity"}</h2>
              <p>{resolved ? "Refresh the marketplace to confirm its listing count and recommendations also changed." : "These records share a canonical ID but have different feed-specific IDs. A candidate sees both in Explore jobs."}</p>
              {role ? <>
                <div className="incident-role-heading"><Icon name="briefcase" size={20} /><div><strong>{role.title}</strong><span>{role.company} · {role.location}</span></div></div>
                <div className="incident-listings">
                  {affected.map((job) => <div className="incident-listing" key={job.id}><span className="listing-source">{job.source}</span><strong>{job.title}</strong><code>{job.id}</code><small>canonicalId: {job.canonicalId}</small></div>)}
                </div>
                <div className="incident-callout"><Icon name="bug" size={18} /><span>One opportunity is counted and recommended {affected.length} times.</span></div>
              </> : <div className="incident-callout resolved"><Icon name="check" size={18} /><span>No duplicate canonical IDs in the current API response.</span></div>}
            </section>

            <section className="incident-panel investigation-panel">
              <span className="incident-kicker">02 / INVESTIGATION</span>
              <h2>Trace the catalog merge</h2>
              <p>The marketplace receives its listings from <code>GET /api/jobs</code>. Check where direct and partner feeds are combined.</p>
              <div className="incident-code"><div><span>PRIMARY SOURCE</span><code>server/seed-data.js</code></div><div><span>CATALOG LOGIC</span><code>server/catalog.js</code></div><div><span>REGRESSION TEST</span><code>test/catalog.test.js</code></div></div>
              <h3>Reproduce</h3>
              <ol><li>Open Explore jobs in the marketplace.</li><li>Search for “Senior Product Engineer”.</li><li>Compare the source IDs and canonical IDs of the returned records.</li></ol>
            </section>
          </div>

          <section className="incident-panel incident-bottom">
            <div><span className="incident-kicker">03 / WORKSHOP FIX</span><h2>Expected outcome</h2><p>Keep one listing per canonical role, prefer the direct source, and preserve search, category, and location filters.</p></div>
            <div className="incident-steps"><span>Investigate</span><Icon name="arrow" size={16} /><span>Fix BUG-001</span><Icon name="arrow" size={16} /><span>Run tests</span><Icon name="arrow" size={16} /><span>Refresh this page</span></div>
          </section>
        </>}
        <p className="incident-footer">All employers, jobs, and candidates are fictional workshop data.</p>
      </main>
    </div>
  );
}
