export function PortalSessionsView({
  sessions,
  selectedClass,
  getMemberLabel,
  formatDateTime,
  isSessionLive,
  now,
  onJoin,
  manageForm
}) {
  const upcoming = [];
  const live = [];
  const completed = [];

  sessions.forEach((session) => {
    const start = new Date(session.starts_at);
    const end = session.ends_at
      ? new Date(session.ends_at)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000);

    if (isSessionLive(session, selectedClass, now)) {
      live.push(session);
    } else if (end < now) {
      completed.push(session);
    } else {
      upcoming.push(session);
    }
  });

  function renderSessionCard(session, variant) {
    const host = selectedClass.leader_id ? getMemberLabel(selectedClass.leader_id) : "TBD";

    return (
      <article key={session.id} className={`dp-session-card ${variant}`}>
        {variant === "live" ? <span className="dp-live-badge">LIVE</span> : null}
        <h3>{session.title}</h3>
        <p className="dp-session-meta">
          {formatDateTime(session.starts_at)}
          {session.ends_at ? ` – ${formatDateTime(session.ends_at)}` : ""}
        </p>
        <p className="dp-session-host">Host: {host}</p>
        {session.meet_url || selectedClass.meet_url ? (
          <button
            type="button"
            className="dp-btn-primary"
            onClick={() => onJoin(session.meet_url || selectedClass.meet_url)}
          >
            Join session
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <div className="dp-page">
      {manageForm}

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Live sessions</h2>
          <p>Sessions happening now.</p>
        </div>
        {live.length ? (
          <div className="dp-session-grid">{live.map((s) => renderSessionCard(s, "live"))}</div>
        ) : (
          <p className="dp-empty-copy">No live sessions right now.</p>
        )}
      </section>

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Upcoming sessions</h2>
        </div>
        {upcoming.length ? (
          <div className="dp-session-grid">
            {upcoming.map((s) => renderSessionCard(s, "upcoming"))}
          </div>
        ) : (
          <p className="dp-empty-copy">No upcoming sessions scheduled.</p>
        )}
      </section>

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Completed sessions</h2>
        </div>
        {completed.length ? (
          <div className="dp-session-grid">
            {completed.map((s) => renderSessionCard(s, "completed"))}
          </div>
        ) : (
          <p className="dp-empty-copy">Completed sessions will appear here.</p>
        )}
      </section>
    </div>
  );
}
