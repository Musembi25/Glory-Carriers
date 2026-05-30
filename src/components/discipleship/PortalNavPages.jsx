import { DiscipleshipGuidelines } from "../DiscipleshipGuidelines";
import { portalIcons } from "./PortalIcons";

export function PortalStudyGroups({ selectedClass, getMemberLabel, classEnrollments }) {
  const members = classEnrollments.filter((row) => row.status === "approved");

  return (
    <div className="dp-page">
      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Study groups</h2>
          <p>Connect with classmates for accountability and group learning.</p>
        </div>
        {selectedClass ? (
          members.length ? (
            <ul className="dp-study-group-list">
              {members.map((row) => (
                <li key={row.user_id} className="dp-study-group-member">
                  <span className="dp-study-group-avatar">{portalIcons.user}</span>
                  <div>
                    <strong>{getMemberLabel(row.user_id)}</strong>
                    <span>Enrolled student</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dp-empty-copy">No enrolled students yet for this class.</p>
          )
        ) : (
          <p className="dp-empty-copy">Select a class from the sidebar to view your cohort.</p>
        )}
      </section>
    </div>
  );
}

export function PortalResources({ selectedClass }) {
  return (
    <div className="dp-page">
      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Course resources</h2>
          <p>Materials shared by your instructor for {selectedClass?.title || "your classes"}.</p>
        </div>
        <p className="dp-empty-copy">
          Open <strong>Lessons</strong> to access PDFs, videos, and reading materials assigned to
          each module. Class-wide resource folders will appear here as your program expands.
        </p>
      </section>
    </div>
  );
}

export function PortalUsefulLinks() {
  const links = [
    { label: "Discipleship guidelines", href: "#guidelines", internal: true },
    { label: "Submit assignments", page: "submissions" },
    { label: "Track your progress", page: "progress" }
  ];

  return (
    <div className="dp-page">
      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Useful links</h2>
          <p>Quick access to essential portal areas.</p>
        </div>
        <ul className="dp-links-list">
          {links.map((item) => (
            <li key={item.label}>
              <span className="dp-links-icon">{portalIcons.link}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="dp-panel" id="guidelines">
        <div className="dp-panel-head">
          <h2>Guidelines</h2>
        </div>
        <DiscipleshipGuidelines />
      </section>
    </div>
  );
}

export function PortalProfile({
  userName,
  roleLabel,
  courseTitle,
  courseProgress,
  userAvatarUrl,
  getInitials
}) {
  return (
    <div className="dp-page">
      <section className="dp-panel dp-profile-hero">
        <div className="dp-profile-hero-avatar">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt="" />
          ) : (
            <span>{getInitials(userName)}</span>
          )}
        </div>
        <div>
          <h2>{userName}</h2>
          <p>{roleLabel}</p>
          {courseTitle ? (
            <p className="dp-profile-course">
              {courseTitle} · {courseProgress}% complete
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
