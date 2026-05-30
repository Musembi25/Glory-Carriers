import { portalIcons, PortalProgressRing } from "./PortalIcons";

export function PortalAchievements({
  lessonCompletions,
  assignmentSubmissions,
  sessionAttendance,
  userId,
  myApprovedClassIds,
  progressSummary
}) {
  const lessonsDone = lessonCompletions.filter((row) => row.user_id === userId).length;
  const submissionsApproved = assignmentSubmissions.filter(
    (row) => row.user_id === userId && row.status === "approved"
  ).length;
  const presentCount = sessionAttendance.filter(
    (row) => row.user_id === userId && row.status === "present"
  ).length;

  const badges = [
    {
      id: "first-lesson",
      title: "First steps",
      description: "Complete your first lesson",
      icon: portalIcons.lessons,
      earned: lessonsDone >= 1
    },
    {
      id: "five-lessons",
      title: "Faithful learner",
      description: "Complete 5 lessons",
      icon: portalIcons.checkCircle,
      earned: lessonsDone >= 5
    },
    {
      id: "first-submission",
      title: "Submitted",
      description: "Turn in your first assignment",
      icon: portalIcons.submissions,
      earned: assignmentSubmissions.some((row) => row.user_id === userId)
    },
    {
      id: "approved-work",
      title: "Well done",
      description: "Receive teacher approval on work",
      icon: portalIcons.achievements,
      earned: submissionsApproved >= 1
    },
    {
      id: "attendance",
      title: "Present",
      description: "Attend 3 class sessions",
      icon: portalIcons.attendance,
      earned: presentCount >= 3
    },
    {
      id: "enrolled",
      title: "Committed",
      description: "Enroll in a discipleship class",
      icon: portalIcons.classes,
      earned: myApprovedClassIds.size >= 1
    }
  ];

  const earnedCount = badges.filter((badge) => badge.earned).length;

  return (
    <div className="dp-page">
      <section className="dp-panel dp-achievements-hero">
        <div className="dp-achievements-hero-copy">
          <p className="dp-continue-eyebrow">Milestones</p>
          <h2>Your achievements</h2>
          <p>Celebrate growth in knowledge, discipline, and faithful participation.</p>
        </div>
        <PortalProgressRing
          value={badges.length ? Math.round((earnedCount / badges.length) * 100) : 0}
          size={88}
          label="Achievements unlocked"
        />
      </section>

      <div className="dp-achievement-grid">
        {badges.map((badge) => (
          <article
            key={badge.id}
            className={`dp-achievement-card${badge.earned ? " earned" : ""}`}
          >
            <span className="dp-achievement-icon">{badge.icon}</span>
            <strong>{badge.title}</strong>
            <p>{badge.description}</p>
            <span className={`dp-achievement-status${badge.earned ? " earned" : ""}`}>
              {badge.earned ? "Unlocked" : "In progress"}
            </span>
          </article>
        ))}
      </div>

      {progressSummary ? (
        <section className="dp-panel">
          <div className="dp-panel-head">
            <h2>Progress snapshot</h2>
            <p>Overall metrics across your enrolled classes.</p>
          </div>
          <div className="dp-metric-row compact">
            {progressSummary.map((item) => (
              <article key={item.label} className="dp-metric-card compact">
                <span className="dp-metric-label">{item.label}</span>
                <strong className="dp-metric-value">{item.value}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
