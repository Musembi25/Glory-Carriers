import { computeUserAssignmentStats, isWorkLesson } from "../../lib/discipleshipAssignments";
import { portalIcons, PortalProgressRing } from "./PortalIcons";

export function PortalProgressView({
  classes,
  lessons,
  lessonCompletions,
  assignmentSubmissions,
  sessionAttendance,
  sessions,
  enrollments,
  userId,
  myApprovedClassIds,
  now
}) {
  const workLessons = lessons.filter(
    (lesson) => isWorkLesson(lesson) && myApprovedClassIds.has(lesson.class_id)
  );
  const assignmentStats = computeUserAssignmentStats({
    workLessons,
    submissions: assignmentSubmissions,
    userId,
    classIds: myApprovedClassIds,
    now
  });

  const lessonsDone = lessonCompletions.filter((row) => row.user_id === userId).length;

  const classProgress = classes
    .filter((classItem) => myApprovedClassIds.has(classItem.id))
    .map((classItem) => {
      const classLessonRows = lessons.filter((row) => row.class_id === classItem.id);
      const classSessionRows = sessions.filter((row) => row.class_id === classItem.id);
      const doneLessons = classLessonRows.filter((row) =>
        lessonCompletions.some(
          (completion) => completion.lesson_id === row.id && completion.user_id === userId
        )
      ).length;
      const present = sessionAttendance.filter(
        (row) =>
          row.user_id === userId &&
          row.status === "present" &&
          classSessionRows.some((session) => session.id === row.session_id)
      ).length;

      const lessonPct = classLessonRows.length
        ? Math.round((doneLessons / classLessonRows.length) * 100)
        : 0;
      const attendPct = classSessionRows.length
        ? Math.round((present / classSessionRows.length) * 100)
        : 0;

      return {
        classItem,
        lessonPct,
        attendPct,
        overall: Math.round((lessonPct + attendPct) / 2)
      };
    });

  const overallPct = classProgress.length
    ? Math.round(classProgress.reduce((sum, row) => sum + row.overall, 0) / classProgress.length)
    : 0;

  return (
    <div className="dp-page">
      <div className="dp-metric-row">
        <article className="dp-metric-card">
          <div className="dp-metric-card-top">
            <span className="dp-metric-icon">{portalIcons.progress}</span>
            <PortalProgressRing value={overallPct} size={56} label="Overall progress" />
          </div>
          <span className="dp-metric-label">Course progress</span>
          <strong className="dp-metric-value">{overallPct}%</strong>
          <p className="dp-metric-hint">Across enrolled classes</p>
        </article>
        <article className="dp-metric-card">
          <div className="dp-metric-card-top">
            <span className="dp-metric-icon">{portalIcons.assignments}</span>
            <PortalProgressRing value={assignmentStats.progress.percent} size={56} />
          </div>
          <span className="dp-metric-label">Assignment completion</span>
          <strong className="dp-metric-value">{assignmentStats.progress.percent}%</strong>
          <p className="dp-metric-hint">
            {assignmentStats.progress.completed} of {assignmentStats.progress.total} reviewed
          </p>
        </article>
        <article className="dp-metric-card">
          <div className="dp-metric-card-top">
            <span className="dp-metric-icon">{portalIcons.lessons}</span>
            <PortalProgressRing
              value={
                lessons.filter((l) => myApprovedClassIds.has(l.class_id)).length
                  ? Math.round(
                      (lessonsDone /
                        lessons.filter((l) => myApprovedClassIds.has(l.class_id)).length) *
                        100
                    )
                  : 0
              }
              size={56}
            />
          </div>
          <span className="dp-metric-label">Lessons completed</span>
          <strong className="dp-metric-value">{lessonsDone}</strong>
          <p className="dp-metric-hint">Marked complete in your classes</p>
        </article>
        <article className="dp-metric-card">
          <div className="dp-metric-card-top">
            <span className="dp-metric-icon">{portalIcons.achievements}</span>
            <PortalProgressRing
              value={Math.min(100, myApprovedClassIds.size * 25)}
              size={56}
            />
          </div>
          <span className="dp-metric-label">Programs enrolled</span>
          <strong className="dp-metric-value">{myApprovedClassIds.size}</strong>
          <p className="dp-metric-hint">Active discipleship classes</p>
        </article>
      </div>

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Course completion</h2>
          <p>Progress by class — lessons and attendance combined.</p>
        </div>
        {!classProgress.length ? (
          <p className="dp-empty-copy">Enroll in a class to track your progress.</p>
        ) : (
          <div className="dp-course-progress-list">
            {classProgress.map((row) => (
              <article key={row.classItem.id} className="dp-course-progress-row">
                <div className="dp-course-progress-head">
                  <strong>{row.classItem.title}</strong>
                  <span>{row.overall}% overall</span>
                </div>
                <div className="dp-progress-block">
                  <div className="dp-progress-label">
                    <span>Lessons</span>
                    <strong>{row.lessonPct}%</strong>
                  </div>
                  <div className="dp-progress-track">
                    <div className="dp-progress-fill" style={{ width: `${row.lessonPct}%` }} />
                  </div>
                </div>
                <div className="dp-progress-block">
                  <div className="dp-progress-label">
                    <span>Attendance</span>
                    <strong>{row.attendPct}%</strong>
                  </div>
                  <div className="dp-progress-track">
                    <div className="dp-progress-fill muted" style={{ width: `${row.attendPct}%` }} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
