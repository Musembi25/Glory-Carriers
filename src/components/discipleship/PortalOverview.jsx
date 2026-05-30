import { computeUserAssignmentStats, isWorkLesson } from "../../lib/discipleshipAssignments";
import { portalIcons, PortalProgressRing } from "./PortalIcons";

export function PortalOverview({
  classes,
  lessons,
  lessonCompletions,
  assignmentSubmissions,
  sessions,
  sessionAttendance,
  userId,
  myApprovedClassIds,
  now,
  guidelines,
  onOpenClass,
  onNavigate
}) {
  const workLessons = lessons.filter(
    (lesson) => isWorkLesson(lesson) && myApprovedClassIds.has(lesson.class_id)
  );
  const stats = computeUserAssignmentStats({
    workLessons,
    submissions: assignmentSubmissions,
    userId,
    classIds: myApprovedClassIds,
    now
  });

  const myLessons = lessons.filter((lesson) => myApprovedClassIds.has(lesson.class_id));
  const completedLessons = lessonCompletions.filter(
    (row) => row.user_id === userId && myLessons.some((lesson) => lesson.id === row.lesson_id)
  ).length;
  const lessonPct = myLessons.length
    ? Math.round((completedLessons / myLessons.length) * 100)
    : 0;

  const mySessions = sessions.filter((session) => myApprovedClassIds.has(session.class_id));
  const upcomingCount = mySessions.filter((session) => new Date(session.starts_at) > now).length;

  const presentCount = sessionAttendance.filter(
    (row) =>
      row.user_id === userId &&
      row.status === "present" &&
      mySessions.some((session) => session.id === row.session_id)
  ).length;
  const attendancePct = mySessions.length
    ? Math.round((presentCount / mySessions.length) * 100)
    : 0;

  const statCards = [
    {
      icon: portalIcons.lessons,
      label: "Lessons completed",
      value: `${completedLessons}`,
      ring: lessonPct,
      hint: `Of ${myLessons.length} in your classes`
    },
    {
      icon: portalIcons.assignments,
      label: "Pending assignments",
      value: String(stats.pending.length),
      ring: workLessons.length
        ? Math.round(((workLessons.length - stats.pending.length) / workLessons.length) * 100)
        : 0,
      hint: "Due soon or awaiting upload"
    },
    {
      icon: portalIcons.attendance,
      label: "Attendance rate",
      value: `${attendancePct}%`,
      ring: attendancePct,
      hint: "Across enrolled programs"
    },
    {
      icon: portalIcons.sessions,
      label: "Upcoming sessions",
      value: String(upcomingCount),
      ring: mySessions.length
        ? Math.round(((mySessions.length - upcomingCount) / mySessions.length) * 100)
        : 0,
      hint: upcomingCount ? "Scheduled on your calendar" : "None scheduled yet"
    }
  ];

  const enrolledClasses = classes.filter((classItem) => myApprovedClassIds.has(classItem.id));

  const nextSession = [...mySessions]
    .filter((session) => new Date(session.starts_at) > now)
    .sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at))[0];

  const nextAssignment = [...stats.pending].sort((left, right) => {
    const dueA = left.due_at ? new Date(left.due_at) : null;
    const dueB = right.due_at ? new Date(right.due_at) : null;
    if (dueA && dueB) {
      return dueA - dueB;
    }

    return 0;
  })[0];

  return (
    <div className="dp-page">
      <div className="dp-metric-row">
        {statCards.map((card) => (
          <article key={card.label} className="dp-metric-card">
            <div className="dp-metric-card-top">
              <span className="dp-metric-icon">{card.icon}</span>
              <PortalProgressRing value={card.ring} size={56} label={card.label} />
            </div>
            <span className="dp-metric-label">{card.label}</span>
            <strong className="dp-metric-value">{card.value}</strong>
            <p className="dp-metric-hint">{card.hint}</p>
          </article>
        ))}
      </div>

      <div className="dp-dashboard-grid">
        <article className="dp-continue-card">
          <div className="dp-continue-card-glow" aria-hidden="true" />
          <div className="dp-continue-card-inner">
            <p className="dp-continue-eyebrow">Continue learning</p>
            {enrolledClasses.length ? (
              <>
                <h2>{enrolledClasses[0].title}</h2>
                <p className="dp-continue-meta">
                  Pick up where you left off in your discipleship journey.
                </p>
                <button
                  type="button"
                  className="dp-btn-primary dp-continue-btn"
                  onClick={() => onOpenClass?.(enrolledClasses[0].id)}
                >
                  <span className="dp-btn-icon">{portalIcons.play}</span>
                  Open class
                </button>
              </>
            ) : (
              <>
                <h2>Start your journey</h2>
                <p className="dp-continue-meta">
                  Browse available classes and enroll to access lessons, assignments, and
                  community features.
                </p>
                <button
                  type="button"
                  className="dp-btn-primary dp-continue-btn"
                  onClick={() => onNavigate?.("classes")}
                >
                  Browse classes
                </button>
              </>
            )}
          </div>
        </article>

        <section className="dp-panel dp-timeline-panel">
          <div className="dp-panel-head">
            <h2>Upcoming activities</h2>
            <p>Across all your enrolled classes.</p>
          </div>
          <ol className="dp-timeline">
            {nextSession ? (
              <li>
                <span className="dp-timeline-marker" aria-hidden="true">
                  <span className="dp-timeline-line" />
                  <span className="dp-timeline-dot">{portalIcons.video}</span>
                </span>
                <button
                  type="button"
                  className="dp-timeline-card"
                  onClick={() => onNavigate?.("sessions")}
                >
                  <span className="dp-timeline-type">Next session</span>
                  <strong>{nextSession.title}</strong>
                  <span className="dp-timeline-meta">
                    {new Date(nextSession.starts_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ) : null}
            {nextAssignment ? (
              <li>
                <span className="dp-timeline-marker" aria-hidden="true">
                  <span className="dp-timeline-dot">{portalIcons.assignments}</span>
                </span>
                <button
                  type="button"
                  className="dp-timeline-card"
                  onClick={() => onNavigate?.("assignments")}
                >
                  <span className="dp-timeline-type">Next assignment</span>
                  <strong>{nextAssignment.title}</strong>
                  <span className="dp-timeline-meta">Pending submission</span>
                </button>
              </li>
            ) : null}
            {!nextSession && !nextAssignment ? (
              <p className="dp-empty-copy">No upcoming activities — check back after enrolling.</p>
            ) : null}
          </ol>
        </section>
      </div>

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Guidelines & expectations</h2>
          <p>Essential standards for Discipleship — read before each session.</p>
        </div>
        {guidelines}
      </section>
    </div>
  );
}
