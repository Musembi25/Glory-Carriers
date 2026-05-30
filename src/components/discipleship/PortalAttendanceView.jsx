export function PortalAttendanceView({ progress, sessions, sessionAttendance, userId, manageContent }) {
  const myRows = sessionAttendance.filter((row) => row.user_id === userId);
  const present = myRows.filter((row) => row.status === "present").length;
  const late = myRows.filter((row) => row.status === "late").length;
  const absent = myRows.filter((row) => row.status === "absent").length;
  const percent = progress.attendancePercent;

  return (
    <div className="dp-page">
      {manageContent}

      <div className="dp-attendance-grid">
        <article className="dp-attendance-ring-card">
          <div
            className="dp-attendance-ring"
            style={{ "--ring-value": `${percent}%` }}
            aria-hidden="true"
          >
            <span>{percent}%</span>
          </div>
          <strong>Attendance rate</strong>
          <p>Based on recorded sessions</p>
        </article>

        <article className="dp-mini-stat">
          <span>Present</span>
          <strong>{present}</strong>
        </article>
        <article className="dp-mini-stat">
          <span>Late</span>
          <strong>{late}</strong>
        </article>
        <article className="dp-mini-stat">
          <span>Missed</span>
          <strong>{absent}</strong>
        </article>
        <article className="dp-mini-stat">
          <span>Sessions</span>
          <strong>{sessions.length}</strong>
        </article>
      </div>

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Attendance trend</h2>
          <p>Your presence across class sessions.</p>
        </div>
        <div className="dp-progress-block">
          <div className="dp-progress-label">
            <span>Overall attendance</span>
            <strong>{percent}%</strong>
          </div>
          <div className="dp-progress-track">
            <div className="dp-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </section>
    </div>
  );
}
