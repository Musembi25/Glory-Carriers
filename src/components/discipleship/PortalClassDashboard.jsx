import { computeUserAssignmentStats, formatDueDate, isWorkLesson } from "../../lib/discipleshipAssignments";
import { portalIcons, PortalProgressRing } from "./PortalIcons";

export function PortalClassDashboard({
  selectedClass,
  progress,
  learningLessons,
  myCompletedLessonIds,
  classSessions,
  lessons,
  assignmentSubmissions,
  userId,
  now,
  getMemberLabel,
  formatDateTime,
  canAccessContent,
  onResumeLesson,
  onNavigate,
  onEnroll,
  submitting,
  selectedEnrollment
}) {
  const workLessons = lessons.filter(
    (lesson) => isWorkLesson(lesson) && lesson.class_id === selectedClass.id
  );
  const assignmentStats = computeUserAssignmentStats({
    workLessons,
    submissions: assignmentSubmissions,
    userId,
    classIds: new Set([selectedClass.id]),
    now
  });

  const totalLearning = learningLessons.length;
  const completedLearning = learningLessons.filter((lesson) =>
    myCompletedLessonIds.has(lesson.id)
  ).length;
  const lessonPct = totalLearning
    ? Math.round((completedLearning / totalLearning) * 100)
    : 0;

  const upcomingSessions = classSessions.filter(
    (session) => new Date(session.starts_at) > now
  );
  const nextSession = upcomingSessions[0] ?? null;
  const nextAssignment = workLessons
    .filter((lesson) => {
      const submission = assignmentSubmissions.find(
        (row) => row.lesson_id === lesson.id && row.user_id === userId
      );
      return !submission || submission.status === "pending" || submission.status === "revision_requested";
    })
    .sort((left, right) => {
      const dueA = left.due_at ? new Date(left.due_at) : null;
      const dueB = right.due_at ? new Date(right.due_at) : null;
      if (dueA && dueB) {
        return dueA - dueB;
      }

      return left.sort_order - right.sort_order;
    })[0];

  const currentLesson =
    learningLessons.find((lesson) => !myCompletedLessonIds.has(lesson.id)) ??
    learningLessons[learningLessons.length - 1] ??
    null;

  const statCards = [
    {
      icon: portalIcons.lessons,
      label: "Lessons completed",
      value: `${completedLearning}/${totalLearning}`,
      ring: lessonPct,
      hint: `${lessonPct}% of course lessons`
    },
    {
      icon: portalIcons.assignments,
      label: "Pending assignments",
      value: String(assignmentStats.pending.length),
      ring: workLessons.length
        ? Math.round(
            ((workLessons.length - assignmentStats.pending.length) / workLessons.length) * 100
          )
        : 0,
      hint: "Awaiting your submission"
    },
    {
      icon: portalIcons.attendance,
      label: "Attendance rate",
      value: `${progress.attendancePercent}%`,
      ring: progress.attendancePercent,
      hint: "Recorded sessions"
    },
    {
      icon: portalIcons.sessions,
      label: "Upcoming sessions",
      value: String(upcomingSessions.length),
      ring: classSessions.length
        ? Math.round(
            ((classSessions.length - upcomingSessions.length) / classSessions.length) * 100
          )
        : 0,
      hint: nextSession ? formatDateTime(nextSession.starts_at) : "None scheduled"
    }
  ];

  const timeline = [
    nextSession
      ? {
          id: "session",
          type: "Session",
          title: nextSession.title,
          meta: formatDateTime(nextSession.starts_at),
          icon: portalIcons.video,
          action: () => onNavigate("sessions")
        }
      : null,
    nextAssignment
      ? {
          id: "assignment",
          type: "Assignment",
          title: nextAssignment.title,
          meta: formatDueDate(nextAssignment.due_at),
          icon: portalIcons.assignments,
          action: () => onNavigate("assignments")
        }
      : null,
    {
      id: "class",
      type: "Class",
      title: selectedClass.title,
      meta: `Led by ${selectedClass.leader_id ? getMemberLabel(selectedClass.leader_id) : "TBD"}`,
      icon: portalIcons.classes,
      action: () => onNavigate("sessions")
    }
  ].filter(Boolean);

  return (
    <div className="dp-page dp-class-dashboard">
      {selectedClass.banner_url ? (
        <div
          className="dp-class-banner"
          style={{ backgroundImage: `url(${selectedClass.banner_url})` }}
          role="img"
          aria-label={`${selectedClass.title} banner`}
        />
      ) : null}

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
            {canAccessContent && currentLesson ? (
              <>
                <h2>{currentLesson.title}</h2>
                <p className="dp-continue-meta">
                  {currentLesson.module_label || "Course module"} •{" "}
                  {myCompletedLessonIds.has(currentLesson.id) ? "Review" : "Up next"}
                </p>
                <div className="dp-progress-block">
                  <div className="dp-progress-label">
                    <span>Course progress</span>
                    <strong>{progress.overall}%</strong>
                  </div>
                  <div className="dp-progress-track">
                    <div className="dp-progress-fill" style={{ width: `${progress.overall}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  className="dp-btn-primary dp-continue-btn"
                  onClick={() => onResumeLesson(currentLesson)}
                >
                  <span className="dp-btn-icon">{portalIcons.play}</span>
                  Resume lesson
                </button>
              </>
            ) : (
              <>
                <h2>{selectedClass.title}</h2>
                <p className="dp-continue-meta">
                  {canAccessContent
                    ? "All lessons complete — keep growing through assignments and fellowship."
                    : selectedEnrollment?.status === "pending"
                      ? "Your enrollment is awaiting leader approval."
                      : "Join this class to unlock lessons, notes, and community features."}
                </p>
                {!canAccessContent && !selectedEnrollment ? (
                  <button
                    type="button"
                    className="dp-btn-primary dp-continue-btn"
                    onClick={onEnroll}
                    disabled={submitting}
                  >
                    {selectedClass.requires_approval ? "Request to join" : "Join class"}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </article>

        <section className="dp-panel dp-timeline-panel">
          <div className="dp-panel-head">
            <h2>Upcoming activities</h2>
            <p>Your next steps in this discipleship class.</p>
          </div>
          <ol className="dp-timeline">
            {timeline.map((item, index) => (
              <li key={item.id}>
                <span className="dp-timeline-marker" aria-hidden="true">
                  {index < timeline.length - 1 ? <span className="dp-timeline-line" /> : null}
                  <span className="dp-timeline-dot">{item.icon}</span>
                </span>
                <button type="button" className="dp-timeline-card" onClick={item.action}>
                  <span className="dp-timeline-type">{item.type}</span>
                  <strong>{item.title}</strong>
                  <span className="dp-timeline-meta">{item.meta}</span>
                  <span className="dp-timeline-chevron">{portalIcons.chevronRight}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {selectedClass.description ? (
        <section className="dp-panel">
          <div className="dp-panel-head">
            <h2>About this class</h2>
          </div>
          <p className="dp-class-description">{selectedClass.description}</p>
        </section>
      ) : null}
    </div>
  );
}
