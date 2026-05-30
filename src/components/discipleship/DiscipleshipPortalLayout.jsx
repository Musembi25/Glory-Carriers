import { useEffect, useMemo, useState } from "react";
import { portalIcons } from "./PortalIcons";

export const NAV_GROUPS = [
  {
    label: "Dashboard",
    items: [{ id: "overview", label: "Overview", icon: "home" }]
  },
  {
    label: "Learning",
    items: [
      { id: "classes", label: "Classes", icon: "library" },
      { id: "lessons", label: "Lessons", icon: "bookOpen", requiresClass: true },
      { id: "sessions", label: "Sessions", icon: "monitorPlay", requiresClass: true },
      { id: "assignments", label: "Assignments", icon: "clipboardList", requiresClass: true },
      { id: "submissions", label: "Submissions", icon: "folderCheck" }
    ]
  },
  {
    label: "Engagement",
    items: [
      { id: "discussion", label: "Discussion", icon: "messagesSquare", requiresClass: true },
      { id: "notes", label: "Notes", icon: "notebookPen", requiresClass: true },
      { id: "study-groups", label: "Study Groups", icon: "users", requiresClass: true }
    ]
  },
  {
    label: "Progress",
    items: [
      { id: "attendance", label: "Attendance", icon: "calendarCheck", requiresClass: true },
      { id: "progress", label: "Progress", icon: "chartColumn" },
      { id: "achievements", label: "Achievements", icon: "award" }
    ]
  },
  {
    label: "Resources",
    items: [
      { id: "resources", label: "Resources", icon: "folderOpen" },
      { id: "links", label: "Useful Links", icon: "link" }
    ]
  }
];

export const PORTAL_NAV = NAV_GROUPS.flatMap((group) => group.items);

const MOBILE_BOTTOM_NAV = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "classes", label: "Classes", icon: "library" },
  { id: "assignments", label: "Assignments", icon: "clipboardList", requiresClass: true },
  { id: "sessions", label: "Sessions", icon: "monitorPlay", requiresClass: true },
  { id: "more", label: "More", icon: "menu", isMore: true }
];

const MOBILE_MORE_GROUPS = [
  {
    label: "Learning",
    items: [
      { id: "lessons", label: "Lessons", icon: "bookOpen", requiresClass: true },
      { id: "submissions", label: "Submissions", icon: "folderCheck" }
    ]
  },
  {
    label: "Engagement",
    items: [
      { id: "attendance", label: "Attendance", icon: "calendarCheck", requiresClass: true },
      { id: "discussion", label: "Discussion", icon: "messagesSquare", requiresClass: true },
      { id: "notes", label: "Notes", icon: "notebookPen", requiresClass: true }
    ]
  },
  {
    label: "Progress",
    items: [
      { id: "progress", label: "Progress", icon: "chartColumn" },
      { id: "achievements", label: "Achievements", icon: "award" }
    ]
  },
  {
    label: "Resources & support",
    items: [
      { id: "resources", label: "Resources", icon: "folderOpen" },
      { id: "settings", label: "Settings", icon: "settings", action: "settings" },
      { id: "help", label: "Help", icon: "help", action: "help" }
    ]
  }
];

const MOBILE_MORE_PAGE_IDS = new Set([
  "lessons",
  "submissions",
  "attendance",
  "discussion",
  "notes",
  "progress",
  "achievements",
  "resources",
  "links",
  "profile",
  "study-groups"
]);

const PAGE_TITLES = {
  overview: "Overview",
  classes: "Classes",
  lessons: "Lessons",
  sessions: "Sessions",
  assignments: "Assignments",
  submissions: "Submissions",
  attendance: "Attendance",
  discussion: "Discussion",
  notes: "Notes",
  progress: "Progress",
  achievements: "Achievements",
  resources: "Resources",
  links: "Useful Links",
  profile: "Profile",
  "study-groups": "Study Groups"
};

function getInitials(name) {
  const parts = String(name || "S")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "S";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function NavItem({ item, active, disabled, onNavigate }) {
  return (
    <button
      type="button"
      className={`dp-nav-item${active ? " active" : ""}${disabled ? " disabled" : ""}`}
      onClick={() => !disabled && onNavigate(item.id)}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      title={disabled ? "Select a class from the course card above" : undefined}
    >
      <span className="dp-nav-item-accent" aria-hidden="true" />
      <span className="dp-nav-icon-wrap">
        <span className="dp-nav-icon">{portalIcons[item.icon]}</span>
      </span>
      <span className="dp-nav-label">{item.label}</span>
    </button>
  );
}

function isBottomNavActive(item, portalPage) {
  if (item.isMore) {
    return MOBILE_MORE_PAGE_IDS.has(portalPage);
  }

  return portalPage === item.id;
}

export function DiscipleshipPortalLayout({
  userName,
  roles,
  portalPage,
  onNavigate,
  selectedClassId,
  classes,
  onSelectClassId,
  courseTitle,
  courseProgress = 0,
  searchQuery = "",
  onSearchChange,
  notificationCount = 0,
  onNotificationsClick,
  onOpenSettings,
  onOpenHelp,
  theme = "light",
  onThemeToggle,
  userAvatarUrl,
  rightRail,
  children
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const enrolledClasses = classes.filter((item) => item.status !== "draft");
  const roleLabel = roles.teacher && roles.student
    ? "Teacher & Student"
    : roles.teacher
      ? "Teacher"
      : roles.student
        ? "Student"
        : "Learner";

  const displayClass = courseTitle || "No class selected";
  const progressValue = Math.min(100, Math.max(0, courseProgress));

  const pageTitle = useMemo(
    () => PAGE_TITLES[portalPage] ?? "Discipleship Portal",
    [portalPage]
  );

  useEffect(() => {
    setMoreOpen(false);
  }, [portalPage]);

  useEffect(() => {
    if (!moreOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  function navigateFromMobile(pageId) {
    setMoreOpen(false);
    onNavigate(pageId);
  }

  function handleMoreItemClick(item) {
    if (item.action === "settings") {
      setMoreOpen(false);
      onOpenSettings?.();
      return;
    }

    if (item.action === "help") {
      setMoreOpen(false);
      onOpenHelp?.();
      return;
    }

    navigateFromMobile(item.id);
  }

  return (
    <div className="discipleship-portal">
      <aside className="dp-sidebar" aria-label="Discipleship portal navigation">
        <header className="dp-sidebar-identity">
          <div className="dp-portal-title-row">
            <span className="dp-portal-title-icon">{portalIcons.book}</span>
            <div>
              <h2 className="dp-portal-title">Discipleship Portal</h2>
              <p className="dp-portal-subtitle">Learning · Growth · Transformation</p>
            </div>
          </div>

          <div className="dp-course-card">
            <div className="dp-course-card-head">
              <span className="dp-course-card-label">Current course</span>
              <span className="dp-course-card-pct">{progressValue}%</span>
            </div>
            <p className="dp-course-card-name">{displayClass}</p>
            <div
              className="dp-course-progress-track"
              role="progressbar"
              aria-valuenow={progressValue}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="dp-course-progress-fill" style={{ width: `${progressValue}%` }} />
            </div>
            <label className="dp-course-switcher">
              <span className="visually-hidden">Switch class</span>
              <select
                value={selectedClassId || ""}
                onChange={(event) => onSelectClassId(event.target.value)}
              >
                <option value="">Browse all classes</option>
                {enrolledClasses.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <nav className="dp-nav-scroll" aria-label="Portal sections">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="dp-nav-group">
              {groupIndex > 0 ? <div className="dp-nav-divider" aria-hidden="true" /> : null}
              <p className="dp-nav-group-label">{group.label}</p>
              <div className="dp-nav-group-items">
                {group.items.map((item) => {
                  const disabled = item.requiresClass && !selectedClassId;
                  const active =
                    portalPage === item.id ||
                    (item.id === "achievements" && portalPage === "profile");

                  return (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={active}
                      disabled={disabled}
                      onNavigate={onNavigate}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <footer className="dp-sidebar-footer">
          <div className="dp-student-card">
            <div className="dp-student-card-top">
              <div className="dp-student-avatar">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="" />
                ) : (
                  <span>{getInitials(userName)}</span>
                )}
              </div>
              <div className="dp-student-info">
                <strong>{userName}</strong>
                <span>{roleLabel}</span>
                {courseTitle ? (
                  <span className="dp-student-class">
                    {courseTitle} · {progressValue}%
                  </span>
                ) : null}
              </div>
            </div>
            <div className="dp-student-actions">
              <button
                type="button"
                className="dp-student-action-btn"
                onClick={onOpenSettings}
                aria-label="Settings"
                title="Settings"
              >
                {portalIcons.settings}
              </button>
              <button
                type="button"
                className="dp-student-action-btn"
                onClick={onNotificationsClick}
                aria-label="Notifications"
                title="Notifications"
              >
                {portalIcons.bell}
                {notificationCount > 0 ? (
                  <span className="dp-student-action-badge" />
                ) : null}
              </button>
              <button
                type="button"
                className="dp-student-action-btn"
                onClick={onOpenHelp}
                aria-label="Help"
                title="Help"
              >
                {portalIcons.help}
              </button>
            </div>
          </div>
        </footer>
      </aside>

      <div className="dp-shell">
        <header className="dp-topbar dp-desktop-only">
          <div className="dp-topbar-primary">
            <div className="dp-topbar-welcome">
              <h1 className="dp-topbar-title">Welcome back, {userName}</h1>
              <p className="dp-topbar-tagline">Continue growing in knowledge and faith.</p>
            </div>
          </div>

          <div className="dp-topbar-tools">
            <label className="dp-search">
              <span className="dp-search-icon">{portalIcons.search}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder="Search portal…"
                aria-label="Search portal"
              />
            </label>

            <button
              type="button"
              className="dp-topbar-btn"
              onClick={onThemeToggle}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? portalIcons.moon : portalIcons.sun}
            </button>
          </div>
        </header>

        <header className="dp-mobile-header">
          <div className="dp-mobile-header-brand">
            <span className="dp-mobile-header-logo" aria-hidden="true">
              {portalIcons.book}
            </span>
            <div className="dp-mobile-header-titles">
              <span className="dp-mobile-header-app">Discipleship Portal</span>
              <h1 className="dp-mobile-header-page">{pageTitle}</h1>
            </div>
          </div>

          <div className="dp-mobile-header-actions">
            <button
              type="button"
              className="dp-mobile-header-btn"
              onClick={onNotificationsClick}
              aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ""}`}
            >
              {portalIcons.bell}
              {notificationCount > 0 ? (
                <span className="dp-mobile-header-badge">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="dp-mobile-header-avatar"
              onClick={() => navigateFromMobile("profile")}
              aria-label="Open profile"
            >
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt="" />
              ) : (
                <span>{getInitials(userName)}</span>
              )}
            </button>
          </div>
        </header>

        <div className="dp-body">
          <div className="dp-content">{children}</div>
          {rightRail ? <aside className="dp-rail">{rightRail}</aside> : null}
        </div>
      </div>

      <div className="dp-mobile-nav-dock" aria-hidden={moreOpen}>
        <nav className="dp-mobile-bottom-nav" aria-label="Primary mobile navigation">
          {MOBILE_BOTTOM_NAV.map((item) => {
            const disabled = item.requiresClass && !selectedClassId && !item.isMore;
            const active = isBottomNavActive(item, portalPage);

            return (
              <button
                key={item.id}
                type="button"
                className={`dp-mobile-tab${active ? " active" : ""}${disabled ? " disabled" : ""}${item.isMore && moreOpen ? " sheet-open" : ""}`}
                onClick={() => {
                  if (item.isMore) {
                    setMoreOpen((open) => !open);
                    return;
                  }

                  if (!disabled) {
                    navigateFromMobile(item.id);
                  }
                }}
                disabled={disabled}
                aria-current={active ? "page" : undefined}
                aria-expanded={item.isMore ? moreOpen : undefined}
                aria-controls={item.isMore ? "dp-mobile-more-sheet" : undefined}
              >
                <span className="dp-mobile-tab-icon">{portalIcons[item.icon]}</span>
                <span className="dp-mobile-tab-label">{item.label}</span>
                {active ? <span className="dp-mobile-tab-indicator" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </nav>
      </div>

      {moreOpen ? (
        <div className="dp-mobile-sheet-root">
          <button
            type="button"
            className="dp-mobile-sheet-backdrop"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="dp-mobile-more-sheet"
            className="dp-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
          >
            <div className="dp-mobile-sheet-handle" aria-hidden="true" />
            <div className="dp-mobile-sheet-head">
              <h2>More</h2>
              <button
                type="button"
                className="dp-mobile-sheet-close"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="dp-mobile-sheet-course">
              <label className="dp-mobile-sheet-course-label">
                <span>Active course</span>
                <select
                  value={selectedClassId || ""}
                  onChange={(event) => onSelectClassId(event.target.value)}
                >
                  <option value="">Browse all classes</option>
                  {enrolledClasses.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.title}
                    </option>
                  ))}
                </select>
              </label>
              {selectedClassId ? (
                <p className="dp-mobile-sheet-course-meta">
                  {displayClass} · {progressValue}% complete
                </p>
              ) : null}
            </div>

            <div className="dp-mobile-sheet-body">
              {MOBILE_MORE_GROUPS.map((group) => (
                <section key={group.label} className="dp-mobile-sheet-group">
                  <h3>{group.label}</h3>
                  <ul>
                    {group.items.map((item) => {
                      const disabled = item.requiresClass && !selectedClassId;
                      const active =
                        portalPage === item.id ||
                        (item.id === "settings" && portalPage === "links");

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`dp-mobile-sheet-item${active ? " active" : ""}${disabled ? " disabled" : ""}`}
                            onClick={() => !disabled && handleMoreItemClick(item)}
                            disabled={disabled}
                          >
                            <span className="dp-mobile-sheet-item-icon">
                              {portalIcons[item.icon]}
                            </span>
                            <span className="dp-mobile-sheet-item-label">{item.label}</span>
                            {active ? (
                              <span className="dp-mobile-sheet-item-active" aria-hidden="true" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="dp-mobile-sheet-footer">
              <button
                type="button"
                className="dp-mobile-sheet-footer-btn"
                onClick={onThemeToggle}
              >
                <span>{portalIcons[theme === "light" ? "moon" : "sun"]}</span>
                {theme === "light" ? "Dark mode" : "Light mode"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { getInitials };
