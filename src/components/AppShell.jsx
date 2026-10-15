import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { computeUserAssignmentStats, getDisplayStatus, isWorkLesson } from "../lib/discipleshipAssignments";
import { parseNotificationLaunchParams } from "../lib/notificationRouting.js";
import {
  dismissPushPermissionPrompt,
  getBrowserNotificationPermission,
  isPushSupported,
  listenForNotificationClicks,
  recordMeaningfulInteraction,
  refreshPushSubscriptionActivity,
  shouldShowPushPermissionPrompt,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications
} from "../lib/pushNotifications.js";
import { supabase } from "../lib/supabase";
import {
  AnnouncementReactions,
  AnnouncementReplyReactions,
  getAnnouncementReactionTotals
} from "./announcements/AnnouncementReactions.jsx";
import { BrandLogo } from "./BrandLogo";
import { DiscipleshipAssignments } from "./DiscipleshipAssignments.jsx";
import { CellGroupManagementSection } from "./management/CellGroupManagementSection";
import { BibleStudySection } from "./BibleStudySection";
import { NotificationCenter } from "./NotificationCenter.jsx";
import { NotificationPreferences } from "./NotificationPreferences.jsx";
import { PushPermissionPrompt } from "./PushPermissionPrompt.jsx";
const communityBackgrounds = [
  `${import.meta.env.BASE_URL}community/a.jpeg`,
  `${import.meta.env.BASE_URL}community/b.jpeg`,
  `${import.meta.env.BASE_URL}community/c.jpeg`,
  `${import.meta.env.BASE_URL}community/d.jpeg`,
  `${import.meta.env.BASE_URL}community/e.jpeg`,
  `${import.meta.env.BASE_URL}community/fellowship.webp`
];

const sections = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Home", icon: "home" },
  { id: "announcements", label: "Announcements & Trends", shortLabel: "Trends", icon: "chat" },
  { id: "events", label: "Events", shortLabel: "Events", icon: "calendar" },
  { id: "prayer", label: "Prayer", shortLabel: "Prayer", icon: "prayer" },
  { id: "resources", label: "Resources", shortLabel: "Files", icon: "book-open" },
  { id: "bible-study", label: "Bible Study", shortLabel: "Bible", icon: "scripture" },
  { id: "assignments", label: "Assignments", shortLabel: "Assignments", icon: "clipboard-list" },
  { id: "meetings", label: "Virtual Meetings", shortLabel: "Meet", icon: "video" },
  { id: "messages", label: "Messages", shortLabel: "Messages", icon: "messages" },
  { id: "members", label: "Members", shortLabel: "People", icon: "users" },
  {
    id: "management",
    label: "Super Admin",
    shortLabel: "Admin",
    icon: "management",
    adminOnly: true
  },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: "settings" }
];

const navigationGroups = [
  { label: "Main", ids: ["dashboard"] },
  { label: "Community", ids: ["announcements", "messages", "members", "events", "meetings"] },
  { label: "Spiritual Growth", ids: ["bible-study", "prayer", "resources"] },
  { label: "My Activity", ids: ["notifications", "assignments", "settings"] },
  { label: "Administration", ids: ["management"] }
];
const quickNavigationIds = ["dashboard", "bible-study", "announcements", "messages"];

function getNavigationGroups(availableSections) {
  const sectionById = new Map(availableSections.map((section) => [section.id, section]));
  return navigationGroups.map((group) => ({
    ...group,
    items: group.ids.map((id) => id === "notifications"
      ? { id, label: "Notifications", icon: "bell" }
      : sectionById.get(id)).filter(Boolean)
  })).filter((group) => group.items.length);
}

const emptyEventForm = {
  title: "",
  description: "",
  location: "",
  starts_at: "",
  ends_at: ""
};

const emptyTaskForm = {
  title: "",
  details: "",
  assignee_id: "",
  due_at: ""
};

const emptyMessageForm = {
  title: "",
  content: "",
  recipient_id: ""
};

const emptyPrayerForm = {
  title: "",
  details: "",
  is_anonymous: false
};

const emptyResourceForm = {
  title: "",
  description: "",
  resource_type: "note",
  note_content: "",
  external_url: ""
};

const emptyLeadershipForm = {
  assignment_type: "prayer_session",
  assignment_date: "",
  leader_id: "",
  title: "",
  notes: ""
};

const emptyMeetingForm = {
  title: "",
  description: "",
  meet_url: "",
  starts_at: "",
  ends_at: "",
  leader_id: ""
};

const emptyAnnouncementForm = { title: "", body: "", pinned: false };

const emptyPasswordForm = {
  password: "",
  confirmPassword: ""
};

function getInitials(name) {
  if (!name) {
    return "?";
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getFileExtension(fileName) {
  const segments = fileName.split(".");
  return segments.length > 1 ? segments.at(-1).toLowerCase() : "png";
}

function formatDateTime(value) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function ProgressBar({ value, label }) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className="progress-block">
      <div className="progress-label-row">
        <span>{label}</span>
        <strong>{safeValue}%</strong>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) {
    return "No deadline";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function formatClockTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function getGreeting(date) {
  const hour = new Date(date).getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function truncateText(value, maxLength = 88) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getCountdownLabel(targetTime, now) {
  const diffMs = new Date(targetTime).getTime() - new Date(now).getTime();

  if (Number.isNaN(diffMs)) {
    return "Time not available";
  }

  if (diffMs <= 0) {
    return "Happening now";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(minutes, 1)}m`;
}

function buildEventCalendarFile(eventRecord) {
  const toUtcDateToken = (value) =>
    new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const escapeIcsText = (value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const dtStart = toUtcDateToken(eventRecord.starts_at);
  const dtEnd = toUtcDateToken(
    eventRecord.ends_at ||
      new Date(new Date(eventRecord.starts_at).getTime() + 60 * 60 * 1000).toISOString()
  );
  const nowToken = toUtcDateToken(new Date().toISOString());
  const uid = `${eventRecord.id}@glory-carriers`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Glory Carriers//Events//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${nowToken}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(eventRecord.title || "Glory Carriers event")}`,
    `DESCRIPTION:${escapeIcsText(eventRecord.description || "")}`,
    `LOCATION:${escapeIcsText(eventRecord.location || "")}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function getFriendlyActionError(error, action) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unexpected error");
  const normalizedMessage = message.toLowerCase();

  if (
    action === "delete-user" &&
    (normalizedMessage.includes("admin_delete_user") ||
      normalizedMessage.includes("function public.admin_delete_user") ||
      normalizedMessage.includes("does not exist"))
  ) {
    return new Error(
      "User deletion requires the latest database function. Rerun `supabase/schema.sql` and try again."
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function toLocalDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function toIsoString(value) {
  return value ? new Date(value).toISOString() : null;
}

function Avatar({ member, size = "medium" }) {
  const label = member?.full_name || member?.email || "Member";

  if (member?.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={`${label} avatar`}
        className={`avatar ${size}`}
      />
    );
  }

  return (
    <div className={`avatar avatar-fallback ${size}`} aria-hidden="true">
      {getInitials(label)}
    </div>
  );
}

function NavIcon({ name }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (name) {
    case "home":
      return (
        <svg {...commonProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
          <path d="M9.5 20v-5h5v5" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...commonProps}>
          <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
          <path d="m18.5 3 .7 1.8L21 5.5l-1.8.7-.7 1.8-.7-1.8L16 5.5l1.8-.7.7-1.8Z" />
          <path d="m18.5 16 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
        </svg>
      );
    case "check-square":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
          <path d="m8 12 2.5 2.5L16 9" />
        </svg>
      );
    case "chat":
      return (
        <svg {...commonProps}>
          <path d="M6 18.5 3.5 20V6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 17H8.5L6 18.5Z" />
          <path d="M8 9h8" />
          <path d="M8 12.5h5" />
        </svg>
      );
    case "messages":
      return (
        <svg {...commonProps}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h10A2.5 2.5 0 0 1 19 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-4.5 3V5.5Z" />
          <path d="M8 8h7M8 11h4" />
          <path d="M8 17h9.5a2.5 2.5 0 0 0 2.5-2.5V9" />
        </svg>
      );
    case "prayer":
      return (
        <svg {...commonProps}>
          <path d="M12 20c4.6-3.5 7-7.3 7-10.5A3.5 3.5 0 0 0 15.5 6c-1.4 0-2.7.8-3.5 2-0.8-1.2-2.1-2-3.5-2A3.5 3.5 0 0 0 5 9.5C5 12.7 7.4 16.5 12 20Z" />
          <path d="M12 9.5v4.5" />
          <path d="M9.8 12h4.4" />
        </svg>
      );
    case "book-open":
      return (
        <svg {...commonProps}>
          <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h4.5a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H7a2.5 2.5 0 0 0-2.5 2.5V6.5Z" />
          <path d="M19.5 6.5A2.5 2.5 0 0 0 17 4h-4.5a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3H17a2.5 2.5 0 0 1 2.5 2.5V6.5Z" />
        </svg>
      );
    case "scripture":
      return (
        <svg {...commonProps}>
          <path d="M5 4.5h8.2A2.8 2.8 0 0 1 16 7.3V20H7.2A2.2 2.2 0 0 0 5 22V4.5Z" />
          <path d="M16 7.3A2.8 2.8 0 0 1 18.8 4.5H20v15.3A2.2 2.2 0 0 0 17.8 22H16" />
          <path d="M10.5 8v8M7.8 11.5h5.4" />
        </svg>
      );
    case "discipleship":
      return (
        <svg {...commonProps}>
          <path d="M12 3v18" />
          <path d="M7 8h10" />
          <path d="M8 13h8" />
          <path d="M9.5 18h5" />
          <path d="M5 5.5 7 4l2 1.5" />
          <path d="M19 5.5 17 4l-2 1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M7.5 3.5v3" />
          <path d="M16.5 3.5v3" />
          <path d="M3.5 9.5h17" />
          <path d="M8 13h3" />
          <path d="M13.5 13h3" />
          <path d="M8 16.5h3" />
        </svg>
      );
    case "video":
      return (
        <svg {...commonProps}>
          <path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h8a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 15 19H7a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
          <path d="M17.5 10 21 8v8l-3.5-2" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16.5 19a4.5 4.5 0 0 0-9 0" />
          <circle cx="12" cy="9" r="3.25" />
          <path d="M20.5 19a3.5 3.5 0 0 0-3-3.46" />
          <path d="M17.5 5.8a3.2 3.2 0 0 1 0 6.4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...commonProps}>
          <path d="M6.5 16.5h11l-1.2-1.4a2.8 2.8 0 0 1-.8-1.9v-2.1a3.5 3.5 0 0 0-7 0v2.1c0 .7-.3 1.4-.8 1.9L6.5 16.5Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "menu":
      return (
        <svg {...commonProps}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "management":
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h7M14 17.5h7M14 21h4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 1 1 3.6 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 1 1 0 3.6h-.2a1 1 0 0 0-.9.7Z" />
        </svg>
      );
    default:
      return null;
  }
}

function Panel({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, caption, accent = "blue" }) {
  return (
    <div className={`stat-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function NavigationItem({ section, activeSection, onSelect, onOpenNotifications, unreadCount, className = "", onAfterSelect }) {
  const isNotificationItem = section.id === "notifications";
  const active = !isNotificationItem && activeSection === section.id;
  const label = isNotificationItem && unreadCount
    ? "Notifications, " + unreadCount + " unread"
    : section.label;
  return (
    <button
      type="button"
      className={"sidebar-link " + className + (active ? " active" : "")}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={section.label}
      onClick={() => {
        if (isNotificationItem) onOpenNotifications();
        else onSelect(section.id);
        onAfterSelect?.();
      }}
    >
      <span className="sidebar-link-icon" aria-hidden="true"><NavIcon name={section.icon} /></span>
      <span>{section.label}</span>
      {isNotificationItem && unreadCount ? <span className="navigation-unread-count">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </button>
  );
}

function MobileSectionNav({ sections: navSections, activeSection, onSelect, open, onOpenChange, menuButtonRef, unreadCount, onOpenNotifications }) {
  const drawerRef = useRef(null);
  const wasDrawerOpenRef = useRef(false);
  const mobilePrimary = quickNavigationIds
    .map((id) => navSections.find((section) => section.id === id))
    .filter(Boolean);
  const groups = getNavigationGroups(navSections);
  const closeDrawer = () => {
    onOpenChange(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) {
      if (wasDrawerOpenRef.current) {
        wasDrawerOpenRef.current = false;
        menuButtonRef.current?.focus({ preventScroll: true });
      }
      return undefined;
    }

    wasDrawerOpenRef.current = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector("button")?.focus();
    const handleDrawerKeys = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(drawerRef.current?.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])') ?? [])];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDrawerKeys);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handleDrawerKeys);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        {mobilePrimary.map((section) => <button
          type="button"
          key={section.id}
          className={activeSection === section.id ? "mobile-bottom-link active" : "mobile-bottom-link"}
          aria-current={activeSection === section.id ? "page" : undefined}
          onClick={() => onSelect(section.id)}
        ><NavIcon name={section.icon}/><span>{section.shortLabel}</span></button>)}
      </nav>
      {open ? <button type="button" className="mobile-drawer-scrim" aria-label="Close navigation menu" onClick={closeDrawer}/> : null}
      <aside
        id="mobile-navigation-drawer"
        ref={drawerRef}
        className={open ? "mobile-drawer open" : "mobile-drawer"}
        aria-label="Main navigation"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="mobile-drawer-header">
          <BrandLogo compact/>
          <button type="button" className="ghost-button compact mobile-drawer-close" onClick={closeDrawer} aria-label="Close navigation menu">Close</button>
        </div>
        <nav className="mobile-drawer-nav" aria-label="Pages">
          {groups.map((group) => <section className="mobile-drawer-group" key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((section) => <NavigationItem
              key={section.id}
              section={section}
              activeSection={activeSection}
              onSelect={onSelect}
              onOpenNotifications={onOpenNotifications}
              unreadCount={unreadCount}
              className="mobile-drawer-link"
              onAfterSelect={closeDrawer}
            />)}
          </section>)}
        </nav>
      </aside>
    </>
  );
}

function SidebarNav({
  sections: navSections,
  activeSection,
  onSelect,
  theme,
  onThemeToggle,
  roleLabel,
  currentMember,
  onSignOut,
  unreadCount,
  onOpenNotifications
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  useEffect(() => {
    if (!accountOpen) return undefined;
    const close = (event) => { if (!accountRef.current?.contains(event.target)) setAccountOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setAccountOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [accountOpen]);

  const groups = getNavigationGroups(navSections);

  return (
    <aside className="sidebar desktop-nav" aria-label="Main navigation">
      <div className="desktop-nav-inner">
        <div className="desktop-nav-left"><BrandLogo compact/></div>
        <nav className="desktop-nav-links" aria-label="Pages">
          {groups.map((group) => <section className="desktop-nav-group" key={group.label}>
            <h2 className="desktop-nav-section-label">{group.label}</h2>
            {group.items.map((section) => <NavigationItem
              key={section.id}
              section={section}
              activeSection={activeSection}
              onSelect={onSelect}
              onOpenNotifications={onOpenNotifications}
              unreadCount={unreadCount}
              className="desktop-nav-link"
            />)}
          </section>)}
        </nav>
        <div className="desktop-nav-right">
          <div className="desktop-account" ref={accountRef}>
            <button type="button" className="desktop-profile-trigger" aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen((open) => !open)} title={currentMember?.full_name || "Account menu"}>
              <Avatar member={currentMember} size="small"/>
              <span className="desktop-profile-copy"><strong>{currentMember?.full_name || "Member"}</strong><small>{roleLabel}</small></span>
              <span className="desktop-account-caret" aria-hidden="true"/>
            </button>
            {accountOpen ? <div className="desktop-account-menu" role="menu" aria-label="Account menu">
              <button type="button" role="menuitem" onClick={() => { onSelect("settings"); setAccountOpen(false); }}>Profile &amp; settings</button>
              <button type="button" role="menuitem" onClick={() => { onThemeToggle(); setAccountOpen(false); }}>{theme === "light" ? "Switch to dark theme" : "Switch to light theme"}</button>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onSignOut(); }}>Sign out</button>
            </div> : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function AppShell() {
  const {
    user,
    profile,
    signOut,
    refreshProfile,
    authNotice,
    clearAuthNotice,
    updatePassword
  } = useAuth();
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const mobileAccountMenuRef = useRef(null);
  const [activeSection, setActiveSection] = useState(() => {
    const requested = window.location.hash.replace(/^#\/?/, "");
    const normalized = requested === "leadership" ? "assignments" : requested;
    return sections.some((section) => section.id === normalized) && (normalized !== "management" || profile?.role === "admin") ? normalized : "dashboard";
  });

  useEffect(() => {
    const currentSection = window.location.hash.replace(/^#\/?/, "");
    if (currentSection !== activeSection) {
      window.history.pushState({ section: activeSection }, "", `#${activeSection}`);
    }
  }, [activeSection]);

  useEffect(() => {
    if (!mobileAccountOpen) return undefined;
    const close = (event) => { if (!mobileAccountMenuRef.current?.contains(event.target)) setMobileAccountOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setMobileAccountOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [mobileAccountOpen]);

  useEffect(() => {
    function restoreSectionFromHistory() {
      const requested = window.location.hash.replace(/^#\/?/, "");
      const normalized = requested === "leadership" ? "assignments" : requested;
      setActiveSection(sections.some((section) => section.id === normalized) ? normalized : "dashboard");
    }
    window.addEventListener("popstate", restoreSectionFromHistory);
    return () => window.removeEventListener("popstate", restoreSectionFromHistory);
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef(null);
  const [communityBackgroundIndex, setCommunityBackgroundIndex] = useState(0);
  const [theme, setTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem("glory-carriers-theme");

    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return undefined;
    const rotation = window.setInterval(() => {
      setCommunityBackgroundIndex((current) => (current + 1) % communityBackgrounds.length);
    }, 14000);
    return () => window.clearInterval(rotation);
  }, []);
  const communityBackdrop = communityBackgrounds[communityBackgroundIndex];
  const [events, setEvents] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [votes, setVotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [prayerPoints, setPrayerPoints] = useState([]);
  const [resources, setResources] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementReplies, setAnnouncementReplies] = useState([]);
  const [announcementRepliesAvailable, setAnnouncementRepliesAvailable] = useState(true);
  const [leadershipAssignments, setLeadershipAssignments] = useState([]);
  const [eventCheckIns, setEventCheckIns] = useState([]);
  const [prayerReminders, setPrayerReminders] = useState([]);
  const [virtualMeetings, setVirtualMeetings] = useState([]);
  const [virtualMeetingAttendance, setVirtualMeetingAttendance] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [discipleshipClasses, setDiscipleshipClasses] = useState([]);
  const [discipleshipSessions, setDiscipleshipSessions] = useState([]);
  const [discipleshipEnrollments, setDiscipleshipEnrollments] = useState([]);
  const [discipleshipLessons, setDiscipleshipLessons] = useState([]);
  const [discipleshipLessonCompletions, setDiscipleshipLessonCompletions] = useState([]);
  const [discipleshipAssignmentSubmissions, setDiscipleshipAssignmentSubmissions] = useState([]);
  const [discipleshipSubmissionHistory, setDiscipleshipSubmissionHistory] = useState([]);
  const [discipleshipMemberNotes, setDiscipleshipMemberNotes] = useState([]);
  const [discipleshipSessionAttendance, setDiscipleshipSessionAttendance] = useState([]);
  const [discipleshipDiscussions, setDiscipleshipDiscussions] = useState([]);
  const [bibleStudyReadings, setBibleStudyReadings] = useState([]);
  const [bibleStudyTakeaways, setBibleStudyTakeaways] = useState([]);
  const [bibleStudyReplies, setBibleStudyReplies] = useState([]);
  const [bibleStudyQuestions, setBibleStudyQuestions] = useState([]);
  const [bibleStudyAnswers, setBibleStudyAnswers] = useState([]);
  const [bibleStudyCompletions, setBibleStudyCompletions] = useState([]);
  const [biblePartnerStreaks, setBiblePartnerStreaks] = useState([]);
  const [cellGroup, setCellGroup] = useState(null);
  const [selectedAssignmentClassId, setSelectedAssignmentClassId] = useState("");
  const [icebreaker, setIcebreaker] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [messageForm, setMessageForm] = useState(emptyMessageForm);
  const [prayerForm, setPrayerForm] = useState(emptyPrayerForm);
  const [resourceForm, setResourceForm] = useState(emptyResourceForm);
  const [leadershipForm, setLeadershipForm] = useState(emptyLeadershipForm);
  const [meetingForm, setMeetingForm] = useState(emptyMeetingForm);
  const [announcementForm, setAnnouncementForm] = useState(emptyAnnouncementForm);
  const [announcementFeedFilter, setAnnouncementFeedFilter] = useState("all");
  const [announcementReplyDrafts, setAnnouncementReplyDrafts] = useState({});
  const [announcementPhotos, setAnnouncementPhotos] = useState([]);
  const [uploadingAnnouncementPhotos, setUploadingAnnouncementPhotos] = useState(false);
  const [editingEventId, setEditingEventId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [editingResourceId, setEditingResourceId] = useState("");
  const [editingLeadershipId, setEditingLeadershipId] = useState("");
  const [editingAnnouncementId, setEditingAnnouncementId] = useState("");
  const [editingMeetingId, setEditingMeetingId] = useState("");
  const [ideaDraft, setIdeaDraft] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    avatar_url: ""
  });
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [replyingToMessageId, setReplyingToMessageId] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() =>
    getBrowserNotificationPermission()
  );
  const [toastNotifications, setToastNotifications] = useState([]);
  const [showNotificationTray, setShowNotificationTray] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState(null);
  const [pushDeviceCount, setPushDeviceCount] = useState(0);
  const [savingNotificationPreferences, setSavingNotificationPreferences] = useState(false);
  const [selectedResourceFile, setSelectedResourceFile] = useState(null);
  const [resourceFileName, setResourceFileName] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState("");
  const avatarInputRef = useRef(null);
  const resourceFileInputRef = useRef(null);
  const notificationTrayRef = useRef(null);
  const notificationTimeoutsRef = useRef(new Map());
  const [onlineMemberIds, setOnlineMemberIds] = useState(() => new Set());
  const knownRealtimeIdsRef = useRef({
    events: new Set(),
    event_ideas: new Set(),
    tasks: new Set(),
    messages: new Set(),
    prayer_points: new Set(),
    leadership_assignments: new Set(),
    notifications: new Set(),
    event_check_ins: new Set(),
    announcements: new Set(),
    prayer_reminders: new Set(),
    virtual_meetings: new Set(),
    reactions: new Set(),
    discipleship_classes: new Set(),
    discipleship_lessons: new Set(),
    discipleship_discussions: new Set(),
    bible_study_takeaways: new Set(),
    bible_study_takeaway_replies: new Set(),
    bible_study_questions: new Set(),
    bible_study_question_answers: new Set()
  });
  const hasSeededRealtimeIdsRef = useRef(false);

  const isAdmin = profile?.role === "admin";
  const canManageCellGroup = isAdmin || cellGroup?.leader_id === user?.id;
  const navSections = useMemo(
    () => sections.filter((section) => section.adminOnly ? isAdmin : (!section.leaderOnly || canManageCellGroup)),
    [canManageCellGroup, isAdmin]
  );
  useEffect(() => {
    if (activeSection === "management" && !isAdmin) setActiveSection("dashboard");
  }, [activeSection, isAdmin]);
  const sortedEvents = [...events].sort(
    (left, right) => new Date(left.starts_at) - new Date(right.starts_at)
  );
  const selectedEvent =
    sortedEvents.find((event) => event.id === selectedEventId) ?? null;
  const editingResource =
    resources.find((resource) => resource.id === editingResourceId) ?? null;
  const selectedIdeas = ideas
    .filter((idea) => idea.event_id === selectedEventId)
    .sort((left, right) => {
      const voteDifference =
        votes.filter((vote) => vote.idea_id === right.id).length -
        votes.filter((vote) => vote.idea_id === left.id).length;

      if (voteDifference !== 0) {
        return voteDifference;
      }

      return new Date(right.created_at) - new Date(left.created_at);
    });
  const selectedTasks = tasks
    .filter((task) => task.event_id === selectedEventId)
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "pending" ? -1 : 1;
      }

      if (!left.due_at && !right.due_at) {
        return new Date(right.created_at) - new Date(left.created_at);
      }

      if (!left.due_at) {
        return 1;
      }

      if (!right.due_at) {
        return -1;
      }

      return new Date(left.due_at) - new Date(right.due_at);
    });
  const selectedRsvps = rsvps.filter((rsvp) => rsvp.event_id === selectedEventId);
  const attendingMembers = selectedRsvps.filter((rsvp) => rsvp.status === "going");
  const selectedCheckIns = eventCheckIns
    .filter((checkIn) => checkIn.event_id === selectedEventId)
    .sort((left, right) => new Date(right.checked_in_at) - new Date(left.checked_in_at));
  const currentUserCheckIn =
    selectedCheckIns.find((checkIn) => checkIn.user_id === user.id) ?? null;
  const adminCount = profiles.filter((member) => member.role === "admin").length;
  const activeMembers = profiles.filter((member) => member.is_active);
  const pausedMembersCount = profiles.filter((member) => !member.is_active).length;
  const memberUserCount = profiles.filter((member) => member.role === "user").length;
  const unreadNotifications = notifications.filter(
    (notification) => !notification.read_at && !notification.archived_at
  );
  const inboxMessages = [...messages]
    .filter(
      (message) =>
        isAdmin ||
        message.sender_id === user.id ||
        message.recipient_id === user.id ||
        message.recipient_id === null
    )
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
  const orderedMessages = [...inboxMessages].sort(
    (left, right) => new Date(left.created_at) - new Date(right.created_at)
  );
  const currentMember = profiles.find((member) => member.id === user.id) ?? profile;
  const currentDisplayName =
    currentMember?.full_name ||
    currentMember?.email?.split("@")[0] ||
    user.email?.split("@")[0] ||
    "Friend";
  const greetingMessage = `${getGreeting(liveNow)}, ${currentDisplayName}`;
  const liveDateLabel = formatFullDate(liveNow);
  const liveTimeLabel = formatClockTime(liveNow);
  const messageRecipients = activeMembers.filter((member) => member.id !== user.id);
  const myPendingTasks = tasks.filter(
    (task) => task.assignee_id === user.id && task.status === "pending"
  ).length;
  const sortedPrayerPoints = [...prayerPoints].sort(
    (left, right) => new Date(right.created_at) - new Date(left.created_at)
  );
  const sortedResources = [...resources].sort(
    (left, right) => new Date(right.created_at) - new Date(left.created_at)
  );
  const sortedAnnouncements = [...announcements].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    return new Date(right.created_at) - new Date(left.created_at);
  });
  const announcementEngagement = getAnnouncementReactionTotals(
    reactions,
    announcements.map((announcement) => announcement.id)
  );
  const sortedLeadershipAssignments = [...leadershipAssignments].sort(
    (left, right) => new Date(left.assignment_date) - new Date(right.assignment_date)
  );
  const nextUpcomingEvent =
    sortedEvents.find((eventRecord) => new Date(eventRecord.starts_at) > new Date(liveNow)) ?? null;
  const nextEventCountdown = nextUpcomingEvent
    ? getCountdownLabel(nextUpcomingEvent.starts_at, liveNow)
    : "No upcoming event";
  const attendanceRate = events.length
    ? Math.round((rsvps.filter((rsvp) => rsvp.status === "going").length / events.length) * 100)
    : 0;
  const completedTasks = tasks.filter((task) => task.status === "completed").length;
  const taskCompletionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const activeParticipantIds = new Set([
    ...ideas.map((idea) => idea.user_id),
    ...rsvps.map((rsvp) => rsvp.user_id),
    ...messages.map((message) => message.sender_id),
    ...tasks.filter((task) => task.assignee_id).map((task) => task.assignee_id)
  ]);
  const participationRate = activeMembers.length
    ? Math.round((activeParticipantIds.size / activeMembers.length) * 100)
    : 0;
  const tomorrowDateToken = new Date(
    new Date(liveNow).getTime() + 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
  const myLeadershipTomorrow = leadershipAssignments.find(
    (assignment) => assignment.leader_id === user.id && assignment.assignment_date === tomorrowDateToken
  );
  const nextStepPrompts = [
    myPendingTasks
      ? `You have ${myPendingTasks} pending task${myPendingTasks === 1 ? "" : "s"}.`
      : "Great work: no pending tasks assigned to you.",
    nextUpcomingEvent
      ? `Next event in ${nextEventCountdown}: ${nextUpcomingEvent.title || "Upcoming event"}.`
      : "No event scheduled yet. Ask an admin to create one.",
    myLeadershipTomorrow
      ? `You are leading ${myLeadershipTomorrow.assignment_type === "bible_study" ? "Bible study" : "prayer"} tomorrow.`
      : "No leadership assignment for tomorrow.",
    (() => {
      const approvedCount = discipleshipEnrollments.filter(
        (row) => row.user_id === user.id && row.status === "approved"
      ).length;
      const myClassIds = new Set(
        discipleshipEnrollments
          .filter((row) => row.user_id === user.id && row.status === "approved")
          .map((row) => row.class_id)
      );
      const pendingAssignments = discipleshipLessons.filter((lesson) => {
        if (!isWorkLesson(lesson) || !myClassIds.has(lesson.class_id)) {
          return false;
        }

        const submission = discipleshipAssignmentSubmissions.find(
          (row) => row.lesson_id === lesson.id && row.user_id === user.id
        );
        const status = getDisplayStatus(submission);

        return status === "not_submitted" || status === "revision_requested";
      }).length;

      if (!approvedCount && !discipleshipClasses.filter((item) => item.status !== "draft").length) {
        return "Discipleship classes will appear here when published.";
      }

      if (!approvedCount) {
        return "Browse Discipleship to join a class and view guidelines.";
      }

      return pendingAssignments
        ? `Discipleship: ${pendingAssignments} assignment${pendingAssignments === 1 ? "" : "s"} still pending.`
        : "Discipleship: you are up to date on assignments.";
    })()
  ];
  const recentActivity = [
    ...events.map((eventRecord) => ({
      id: `event-${eventRecord.id}`,
      title: eventRecord.title || "Untitled event",
      meta: formatDateTime(eventRecord.starts_at),
      kind: "Event",
      createdAt: eventRecord.created_at || eventRecord.starts_at,
      action: () => {
        setSelectedEventId(eventRecord.id);
        setActiveSection("events");
      }
    })),
    ...tasks.map((taskRecord) => ({
      id: `task-${taskRecord.id}`,
      title: taskRecord.title || "Untitled task",
      meta: taskRecord.assignee_id ? getMemberLabel(taskRecord.assignee_id) : "Unassigned",
      kind: "Task",
      createdAt: taskRecord.created_at,
      action: () => {
        setSelectedEventId(taskRecord.event_id);
        setActiveSection("dashboard");
      }
    })),
    ...messages.map((message) => ({
      id: `message-${message.id}`,
      title: message.title || truncateText(message.content, 44) || "New message",
      meta: `From ${getMemberLabel(message.sender_id)}`,
      kind: "Message",
      createdAt: message.created_at,
      action: () => setActiveSection("messages")
    })),
    ...prayerPoints.map((prayer) => ({
      id: `prayer-${prayer.id}`,
      title: prayer.title,
      meta: prayer.is_anonymous
        ? "Shared anonymously"
        : `Shared by ${getMemberLabel(prayer.created_by)}`,
      kind: "Prayer",
      createdAt: prayer.created_at,
      action: () => setActiveSection("prayer")
    })),
    ...discipleshipClasses.map((classItem) => ({
      id: `discipleship-${classItem.id}`,
      title: classItem.title || "Discipleship class",
      meta: classItem.starts_at
        ? formatDateTime(classItem.starts_at)
        : "Schedule coming soon",
      kind: "Discipleship",
      createdAt: classItem.created_at,
      action: () => {
        setSelectedAssignmentClassId(classItem.id);
        setActiveSection("assignments");
      }
    }))
  ]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5);
  const dashboardHighlights = [
    {
      label: "Next event",
      value: nextUpcomingEvent?.title || "Nothing scheduled",
      caption: nextUpcomingEvent
        ? `${formatDateTime(nextUpcomingEvent.starts_at)} • In ${nextEventCountdown}`
        : "Create the first event to get started."
    },
    {
      label: "Recent planning",
      value: ideas[0] ? truncateText(ideas[0].content, 34) : "No ideas yet",
      caption: ideas[0]
        ? `Shared by ${getMemberLabel(ideas[0].user_id)}`
        : "Suggestions will appear here as people contribute."
    },
    {
      label: isAdmin ? "Team attention" : "Your focus",
      value: isAdmin
        ? `${tasks.filter((task) => task.status === "pending").length} open tasks`
        : `${myPendingTasks} pending tasks`,
      caption: isAdmin
        ? "A quick view of unfinished work across the workspace."
        : "A quick view of the work currently assigned to you."
    },
    {
      label: "Class learning",
      value: (() => {
        const enrolled = discipleshipEnrollments.filter(
          (row) => row.user_id === user.id && row.status === "approved"
        ).length;

        if (enrolled) {
          return `${enrolled} class${enrolled === 1 ? "" : "es"} enrolled`;
        }

        const openClasses = discipleshipClasses.filter(
          (item) => item.status !== "draft"
        ).length;

        return openClasses ? `${openClasses} class${openClasses === 1 ? "" : "es"} open` : "Not enrolled";
      })(),
      caption: "Class assignments and progress."
    }
  ];
  const bibleToday = bibleStudyReadings.find((reading) => reading.reading_date === new Date().toISOString().slice(0, 10)) || bibleStudyReadings.filter((reading) => reading.reading_date <= new Date().toISOString().slice(0, 10)).at(-1) || bibleStudyReadings[0];
  const completedReadingIds = new Set(bibleStudyCompletions.filter((row) => row.user_id === user.id).map((row) => row.reading_id));
  let myBibleStreak = 0;
  for (const reading of [...bibleStudyReadings].filter((item) => item.reading_date <= new Date().toISOString().slice(0, 10)).sort((left, right) => right.reading_date.localeCompare(left.reading_date))) {
    if (!completedReadingIds.has(reading.id)) break;
    myBibleStreak += 1;
  }
  const bibleCommunityActivity = [
    ...bibleStudyTakeaways.map((item) => ({ id: item.id, kind: "Takeaway", content: item.content, userId: item.user_id, createdAt: item.created_at })),
    ...bibleStudyReplies.map((item) => ({ id: item.id, kind: "Reply", content: item.content, userId: item.user_id, createdAt: item.created_at })),
    ...bibleStudyQuestions.map((item) => ({ id: item.id, kind: "Question", content: item.content, userId: item.user_id, createdAt: item.created_at })),
    ...bibleStudyAnswers.map((item) => ({ id: item.id, kind: "Answer", content: item.content, userId: item.user_id, createdAt: item.created_at }))
  ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 4);
  const myPartnerStreaks = biblePartnerStreaks.filter((item) => item.status === "active" && (item.member_one_id === user.id || item.member_two_id === user.id));
  const pendingPartnerInvites = biblePartnerStreaks.filter((item) => item.status === "pending" && item.invited_user_id === user.id);
  const partnerDashboardCards = myPartnerStreaks.slice(0, 2).map((item) => {
    const partnerId = item.member_one_id === user.id ? item.member_two_id : item.member_one_id;
    const partner = profiles.find((person) => person.id === partnerId);
    const scheduled = bibleStudyReadings.filter((reading) => reading.reading_date >= item.started_on && reading.reading_date <= new Date().toISOString().slice(0, 10));
    let streak = 0;
    for (const reading of [...scheduled].reverse()) {
      const both = bibleStudyCompletions.some((row) => row.reading_id === reading.id && row.user_id === user.id) && bibleStudyCompletions.some((row) => row.reading_id === reading.id && row.user_id === partnerId);
      if (!both) break;
      streak += 1;
    }
    const mine = bibleToday && bibleStudyCompletions.some((row) => row.reading_id === bibleToday.id && row.user_id === user.id);
    const theirs = bibleToday && bibleStudyCompletions.some((row) => row.reading_id === bibleToday.id && row.user_id === partnerId);
    return { id: item.id, partner, streak, mine, theirs };
  });
  const replyingToMessage = replyingToMessageId
    ? messages.find((message) => message.id === replyingToMessageId) ?? null
    : null;
  const activeSectionLabel = sections.find((section) => section.id === activeSection)?.label ?? "Dashboard";

  function getMember(memberId) {
    return profiles.find((member) => member.id === memberId) ?? null;
  }

  function getMemberLabel(memberId) {
    const member = getMember(memberId);

    if (!member) {
      return "Unknown member";
    }

    return member.full_name || member.email || "Unnamed member";
  }

  function getIdeaVoteCount(ideaId) {
    return votes.filter((vote) => vote.idea_id === ideaId).length;
  }

  function hasUserVoted(ideaId) {
    return votes.some((vote) => vote.idea_id === ideaId && vote.user_id === user.id);
  }

  function getEventTaskCounts(eventId) {
    const eventTasks = tasks.filter((task) => task.event_id === eventId);
    const completed = eventTasks.filter((task) => task.status === "completed").length;

    return {
      total: eventTasks.length,
      completed
    };
  }

  function getEventRsvpCount(eventId) {
    return rsvps.filter(
      (rsvp) => rsvp.event_id === eventId && rsvp.status === "going"
    ).length;
  }

  function getMessageRecipientLabel(message) {
    if (!message.recipient_id) {
      return "All members";
    }

    return getMemberLabel(message.recipient_id);
  }

  function getMessageReplySource(message) {
    if (!message?.reply_to_message_id) {
      return null;
    }

    return messages.find((entry) => entry.id === message.reply_to_message_id) ?? null;
  }

  function getReplyTargetId(message) {
    if (message.sender_id === user.id) {
      return message.recipient_id ?? "";
    }

    return message.sender_id;
  }

  function canReplyToMessage(message) {
    return Boolean(getReplyTargetId(message));
  }

  function canDeleteMessage(message) {
    return isAdmin || message.sender_id === user.id;
  }

  function dismissToastNotification(notificationId) {
    const timeout = notificationTimeoutsRef.current.get(notificationId);

    if (timeout) {
      window.clearTimeout(timeout);
      notificationTimeoutsRef.current.delete(notificationId);
    }

    setToastNotifications((current) =>
      current.filter((notification) => notification.id !== notificationId)
    );
  }

  function showToastNotification(notification) {
    const notificationId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToastNotifications((current) =>
      [...current, { id: notificationId, ...notification }].slice(-5)
    );

    const timeout = window.setTimeout(() => {
      dismissToastNotification(notificationId);
    }, 7000);

    notificationTimeoutsRef.current.set(notificationId, timeout);
  }

  function showDeviceNotification(title, body) {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      notificationPermission !== "granted" ||
      !window.document.hidden
    ) {
      return;
    }

    const notification = new window.Notification(title, {
      body,
      icon: currentMember?.avatar_url || undefined
    });

    window.setTimeout(() => {
      notification.close();
    }, 7000);
  }

  function announceActivity({ title, body, tone = "info" }) {
    showToastNotification({ title, body, tone });
    showDeviceNotification(title, body);
  }

  function handleRealtimeInsert(table, record) {
    if (!record?.id) {
      return;
    }

    const knownIds = knownRealtimeIdsRef.current[table];

    if (knownIds?.has(record.id)) {
      return;
    }

    knownIds?.add(record.id);

    if (table === "discipleship_assignment_submissions") {
      announceActivity({
        title: "Assignment submission update",
        body: "A student submitted or updated coursework.",
        tone: "info"
      });
      return;
    }

    if (table === "discipleship_discussions") {
      announceActivity({
        title: "New class discussion",
        body: truncateText(record.content, 96),
        tone: "success"
      });
      return;
    }

    if (table === "event_ideas") {
      announceActivity({
        title: "New planning idea",
        body: `${getMemberLabel(record.user_id)}: ${truncateText(record.content)}`,
        tone: "accent"
      });
      return;
    }

    if (table === "prayer_points") {
      announceActivity({
        title: "New prayer request",
        body: truncateText(record.title, 96),
        tone: "accent"
      });
      return;
    }

    if (table === "notifications") {
      if (record.user_id !== user.id) {
        return;
      }

      announceActivity({
        title: record.title || "New notification",
        body: truncateText(record.body, 96),
        tone: "info"
      });
      return;
    }

    if (table === "leadership_assignments") {
      announceActivity({
        title: "Leadership schedule updated",
        body: `${record.assignment_type === "bible_study" ? "Bible study" : "Prayer session"} • ${record.assignment_date}`,
        tone: "warning"
      });
      return;
    }

    if (table === "event_check_ins") {
      announceActivity({
        title: "New check-in",
        body: `${getMemberLabel(record.user_id)} checked in.`,
        tone: "success"
      });
    }
  }

  function clearFeedback() {
    setErrorMessage("");
    setStatusMessage("");
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("glory-carriers-theme", theme);
  }, [theme]);

  useEffect(() => {
    const hour = liveNow.getHours();
    const timeOfDay = hour >= 6 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "day" : "night";
    document.documentElement.dataset.timeOfDay = timeOfDay;
  }, [liveNow]);

  useEffect(() => {
    setNotificationPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!currentMember) {
      return;
    }

    setProfileForm({
      full_name: currentMember.full_name ?? "",
      avatar_url: currentMember.avatar_url ?? ""
    });
  }, [currentMember?.avatar_url, currentMember?.full_name]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeSection]);

  useEffect(() => {
    if (!statusMessage && !errorMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setStatusMessage("");
      setErrorMessage("");
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [statusMessage, errorMessage]);

  useEffect(() => {
    return () => {
      notificationTimeoutsRef.current.forEach((timeout) => {
        window.clearTimeout(timeout);
      });
      notificationTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!notificationTrayRef.current?.contains(event.target)) {
        setShowNotificationTray(false);
      }
    }

    if (showNotificationTray) {
      window.addEventListener("mousedown", handleDocumentClick);
    }

    return () => {
      window.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [showNotificationTray]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void loadNotificationPreferences();
    void refreshPushSubscriptionActivity(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    recordMeaningfulInteraction();
    setShowPushPrompt(shouldShowPushPermissionPrompt());
  }, [activeSection, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    return listenForNotificationClicks((payload) => {
      openNotificationFromPayload(payload);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") {
      return;
    }

    const launch = parseNotificationLaunchParams(new URLSearchParams(window.location.search));

    if (!launch) {
      return;
    }

    openNotificationFromPayload({
      section: launch.section,
      notificationId: launch.notificationId,
      entityTable: launch.entityTable,
      entityId: launch.entityId,
      notificationType: launch.notificationType,
      discipleshipTab: launch.discipleshipTab
    });

    const nextUrl = new URL(window.location.href);
    nextUrl.search = "";
    window.history.replaceState({}, "", nextUrl.pathname + nextUrl.hash);
  }, [user?.id]);

  useEffect(() => {
    hasSeededRealtimeIdsRef.current = false;
    knownRealtimeIdsRef.current = {
      events: new Set(),
      event_ideas: new Set(),
      tasks: new Set(),
      messages: new Set(),
      prayer_points: new Set(),
      leadership_assignments: new Set(),
      notifications: new Set(),
      event_check_ins: new Set(),
      announcements: new Set(),
      prayer_reminders: new Set(),
      virtual_meetings: new Set(),
      reactions: new Set(),
      discipleship_classes: new Set(),
      discipleship_lessons: new Set(),
      discipleship_discussions: new Set(),
      bible_study_takeaways: new Set(),
      bible_study_takeaway_replies: new Set(),
      bible_study_questions: new Set(),
      bible_study_question_answers: new Set()
    };
    setToastNotifications([]);
  }, [user?.id]);

  async function loadAppData(options = {}) {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }

    if (options.showLoader) {
      setLoading(true);
    }

    const results = await Promise.all([
      supabase.from("events").select("*").order("starts_at", { ascending: true }),
      supabase
        .from("event_ideas")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("idea_votes").select("*"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("rsvps").select("*"),
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("messages").select("*").order("created_at", { ascending: false }),
      supabase
        .from("prayer_points")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("resources").select("*").order("created_at", { ascending: false }),
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("leadership_assignments")
        .select("*")
        .order("assignment_date", { ascending: true }),
      supabase
        .from("event_check_ins")
        .select("*")
        .order("checked_in_at", { ascending: false }),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("prayer_reminders").select("*").order("created_at", { ascending: false }),
      supabase
        .from("virtual_meetings")
        .select("*")
        .order("starts_at", { ascending: true }),
      supabase
        .from("virtual_meeting_attendance")
        .select("*")
        .order("joined_at", { ascending: false }),
      supabase.from("reactions").select("*").order("created_at", { ascending: false }),
      supabase
        .from("discipleship_classes")
        .select("*")
        .order("starts_at", { ascending: true }),
      supabase
        .from("discipleship_class_sessions")
        .select("*")
        .order("starts_at", { ascending: true }),
      supabase.from("discipleship_enrollments").select("*"),
      supabase
        .from("discipleship_lessons")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase.from("discipleship_lesson_completions").select("*"),
      supabase.from("discipleship_assignment_submissions").select("*"),
      supabase
        .from("discipleship_submission_history")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("discipleship_member_notes").select("*"),
      supabase.from("discipleship_session_attendance").select("*"),
      supabase
        .from("discipleship_discussions")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase.from("bible_study_readings").select("*").order("sort_order"),
      supabase.from("bible_study_takeaways").select("*").order("created_at", { ascending: false }),
      supabase.from("bible_study_takeaway_replies").select("*").order("created_at", { ascending: false }),
      supabase.from("bible_study_questions").select("*").order("created_at", { ascending: false }),
      supabase.from("bible_study_question_answers").select("*").order("created_at", { ascending: false }),
      supabase.from("bible_study_completions").select("*"),
      supabase.from("bible_study_partner_streaks").select("*").order("created_at", { ascending: false }),
      supabase.from("announcement_replies").select("*").order("created_at", { ascending: true })
    ]);

    const failingResult = results.find((result, index) => result.error && index !== 34);

    if (failingResult?.error) {
      setErrorMessage(failingResult.error.message);
      setLoading(false);
      return;
    }

    startTransition(() => {
      setEvents(results[0].data ?? []);
      setIdeas(results[1].data ?? []);
      setVotes(results[2].data ?? []);
      setTasks(results[3].data ?? []);
      setRsvps(results[4].data ?? []);
      setProfiles(results[5].data ?? []);
      setMessages(results[6].data ?? []);
      setPrayerPoints(results[7].data ?? []);
      setResources(results[8].data ?? []);
      setNotifications(results[9].data ?? []);
      setLeadershipAssignments(results[10].data ?? []);
      setEventCheckIns(results[11].data ?? []);
      setAnnouncements(results[12].data ?? []);
      setPrayerReminders(results[13].data ?? []);
      setVirtualMeetings(results[14].data ?? []);
      setVirtualMeetingAttendance(results[15].data ?? []);
      setReactions(results[16].data ?? []);
      setDiscipleshipClasses(results[17].data ?? []);
      setDiscipleshipSessions(results[18].data ?? []);
      setDiscipleshipEnrollments(results[19].data ?? []);
      setDiscipleshipLessons(results[20].data ?? []);
      setDiscipleshipLessonCompletions(results[21].data ?? []);
      setDiscipleshipAssignmentSubmissions(results[22].data ?? []);
      setDiscipleshipSubmissionHistory(results[23].data ?? []);
      setDiscipleshipMemberNotes(results[24].data ?? []);
      setDiscipleshipSessionAttendance(results[25].data ?? []);
      setDiscipleshipDiscussions(results[26].data ?? []);
      setBibleStudyReadings(results[27].data ?? []);
      setBibleStudyTakeaways(results[28].data ?? []);
      setBibleStudyReplies(results[29].data ?? []);
      setBibleStudyQuestions(results[30].data ?? []);
      setBibleStudyAnswers(results[31].data ?? []);
      setBibleStudyCompletions(results[32].data ?? []);
      setBiblePartnerStreaks(results[33].data ?? []);
      setAnnouncementReplies(results[34]?.data ?? []);
      setAnnouncementRepliesAvailable(!results[34]?.error);
    });

    if (!hasSeededRealtimeIdsRef.current) {
      knownRealtimeIdsRef.current = {
        events: new Set((results[0].data ?? []).map((event) => event.id)),
        event_ideas: new Set((results[1].data ?? []).map((idea) => idea.id)),
        tasks: new Set((results[3].data ?? []).map((task) => task.id)),
        messages: new Set((results[6].data ?? []).map((message) => message.id)),
        prayer_points: new Set((results[7].data ?? []).map((prayer) => prayer.id)),
        leadership_assignments: new Set(
          (results[10].data ?? []).map((assignment) => assignment.id)
        ),
        notifications: new Set(
          (results[9].data ?? []).map((notification) => notification.id)
        ),
        event_check_ins: new Set((results[11].data ?? []).map((checkIn) => checkIn.id)),
        announcements: new Set((results[12].data ?? []).map((announcement) => announcement.id)),
        prayer_reminders: new Set((results[13].data ?? []).map((reminder) => reminder.id)),
        virtual_meetings: new Set((results[14].data ?? []).map((meeting) => meeting.id)),
        discipleship_classes: new Set(
          (results[17].data ?? []).map((classItem) => classItem.id)
        ),
        discipleship_lessons: new Set(
          (results[20].data ?? []).map((lesson) => lesson.id)
        ),
        discipleship_assignment_submissions: new Set(
          (results[22].data ?? []).map((submission) => submission.id)
        ),
        discipleship_discussions: new Set(
          (results[26].data ?? []).map((post) => post.id)
        ),
        bible_study_takeaways: new Set((results[28].data ?? []).map((item) => item.id)),
        bible_study_takeaway_replies: new Set((results[29].data ?? []).map((item) => item.id)),
        bible_study_questions: new Set((results[30].data ?? []).map((item) => item.id)),
        bible_study_question_answers: new Set((results[31].data ?? []).map((item) => item.id))
      };
      knownRealtimeIdsRef.current.reactions = new Set(
        (results[16].data ?? []).map((reaction) => reaction.id)
      );
      hasSeededRealtimeIdsRef.current = true;
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadAppData({ showLoader: true });
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      return;
    }

    async function loadCellGroup() {
      await supabase.rpc("ensure_default_cell_group");
      const { data } = await supabase
        .from("cell_groups")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        setCellGroup(data);
      }
    }

    void loadCellGroup();
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) {
      return undefined;
    }

    let isMounted = true;
    const presenceChannel = supabase.channel("glory-carriers-presence", {
      config: { presence: { key: user.id } }
    });

    const syncPresenceState = () => {
      if (!isMounted) {
        return;
      }

      const state = presenceChannel.presenceState();
      const ids = new Set(Object.keys(state || {}));
      setOnlineMemberIds(ids);
    };

    presenceChannel.on("presence", { event: "sync" }, syncPresenceState);
    presenceChannel.on("presence", { event: "join" }, syncPresenceState);
    presenceChannel.on("presence", { event: "leave" }, syncPresenceState);

    presenceChannel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") {
        return;
      }

      await presenceChannel.track({
        online_at: new Date().toISOString()
      });
    });

    const pingLastSeen = async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) {
        console.error("Failed to update last seen", error);
      }
    };

    void pingLastSeen();
    const interval = window.setInterval(() => {
      void pingLastSeen();
    }, 60_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void pingLastSeen();
        void presenceChannel.track({ online_at: new Date().toISOString() });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
      void supabase.removeChannel(presenceChannel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user) {
      return undefined;
    }

    const runReminderSync = async () => {
      const { error } = await supabase.rpc("create_scheduled_reminders");

      if (error) {
        console.error("Failed to create scheduled reminders", error);
      }
    };

    void runReminderSync();
    const interval = window.setInterval(() => {
      void runReminderSync();
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user) {
      return undefined;
    }

    const channel = supabase.channel(`glory-carriers-live-${user.id}`);
    const tables = [
      "events",
      "event_ideas",
      "idea_votes",
      "tasks",
      "rsvps",
      "profiles",
      "messages",
      "prayer_points",
      "resources",
      "notifications",
      "leadership_assignments",
      "virtual_meetings",
      "virtual_meeting_attendance",
      "reactions",
      "event_check_ins",
      "announcements",
      "prayer_reminders",
      "discipleship_classes",
      "discipleship_class_sessions",
      "discipleship_enrollments",
      "discipleship_lessons",
      "discipleship_lesson_completions",
      "discipleship_assignment_submissions",
      "discipleship_submission_history",
      "discipleship_member_notes",
      "discipleship_session_attendance",
      "discipleship_discussions",
      "bible_study_takeaways",
      "bible_study_takeaway_replies",
      "bible_study_questions",
      "bible_study_question_answers"
    ];
    if (announcementRepliesAvailable) {
      // Older deployments can continue running until the additive community migration is applied.
      tables.push("announcement_replies");
    }
    const notifiableTables = [
      "events",
      "event_ideas",
      "tasks",
      "messages",
      "prayer_points",
      "notifications",
      "leadership_assignments",
      "virtual_meetings",
      "event_check_ins",
      "announcements",
      "discipleship_classes",
      "discipleship_lessons",
      "discipleship_discussions",
      "bible_study_takeaways",
      "bible_study_takeaway_replies",
      "bible_study_questions",
      "bible_study_question_answers"
    ];

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void loadAppData();
        }
      );
    });

    notifiableTables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table },
        (payload) => {
          handleRealtimeInsert(table, payload.new);
        }
      );
    });

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, profiles, messages, notificationPermission, announcementRepliesAvailable]);

  useEffect(() => {
    if (!events.length) {
      if (selectedEventId) {
        setSelectedEventId("");
      }

      return;
    }

    if (!selectedEventId || !events.some((event) => event.id === selectedEventId)) {
      const firstEvent = [...events].sort(
        (left, right) => new Date(left.starts_at) - new Date(right.starts_at)
      )[0];

      if (firstEvent) {
        setSelectedEventId(firstEvent.id);
      }
    }
  }, [events, selectedEventId]);

  async function runAction(action, successText) {
    setSubmitting(true);
    clearFeedback();

    try {
      await action();
      if (successText) {
        setStatusMessage(successText);
      }
      await loadAppData();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEventSubmit(event) {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    if (eventForm.ends_at && eventForm.ends_at < eventForm.starts_at) {
      setErrorMessage("End time must be after the start time.");
      return;
    }

    const payload = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim(),
      location: eventForm.location.trim(),
      starts_at: toIsoString(eventForm.starts_at),
      ends_at: toIsoString(eventForm.ends_at)
    };

    await runAction(async () => {
      const query = editingEventId
        ? supabase.from("events").update(payload).eq("id", editingEventId)
        : supabase.from("events").insert({
            ...payload,
            created_by: user.id
          });

      const { error } = await query;

      if (error) {
        throw error;
      }

      setEventForm(emptyEventForm);
      setEditingEventId("");
    }, editingEventId ? "Event updated successfully." : "Event created successfully.");
  }

  function beginEventEdit(eventRecord) {
    setEditingEventId(eventRecord.id);
    setEventForm({
      title: eventRecord.title ?? "",
      description: eventRecord.description ?? "",
      location: eventRecord.location ?? "",
      starts_at: toLocalDateTimeInput(eventRecord.starts_at),
      ends_at: toLocalDateTimeInput(eventRecord.ends_at)
    });
    setActiveSection("events");
    clearFeedback();
  }

  async function deleteEvent(eventId) {
    if (!isAdmin) {
      return;
    }

    if (!window.confirm("Delete this event and all related ideas, tasks, and RSVPs?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("events").delete().eq("id", eventId);

      if (error) {
        throw error;
      }
    }, "Event deleted.");
  }

  async function handleIdeaSubmit(event) {
    event.preventDefault();

    if (!selectedEventId) {
      setErrorMessage("Select an event before suggesting an idea.");
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("event_ideas").insert({
        event_id: selectedEventId,
        user_id: user.id,
        content: ideaDraft.trim()
      });

      if (error) {
        throw error;
      }

      setIdeaDraft("");
    }, "Idea shared with the group.");
  }

  async function toggleIdeaVote(ideaId) {
    const existingVote = votes.find(
      (vote) => vote.idea_id === ideaId && vote.user_id === user.id
    );

    await runAction(async () => {
      if (existingVote) {
        const { error } = await supabase
          .from("idea_votes")
          .delete()
          .eq("idea_id", ideaId)
          .eq("user_id", user.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("idea_votes").insert({
          idea_id: ideaId,
          user_id: user.id
        });

        if (error) {
          throw error;
        }
      }
    }, existingVote ? "Vote removed." : "Idea upvoted.");
  }

  async function deleteIdea(ideaId) {
    if (!window.confirm("Remove this idea from the planning list?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("event_ideas").delete().eq("id", ideaId);

      if (error) {
        throw error;
      }
    }, "Idea deleted.");
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    if (!selectedEventId) {
      setErrorMessage("Create or select an event before adding tasks.");
      return;
    }

    const payload = {
      event_id: selectedEventId,
      title: taskForm.title.trim(),
      details: taskForm.details.trim(),
      assignee_id: taskForm.assignee_id || null,
      due_at: toIsoString(taskForm.due_at)
    };

    await runAction(async () => {
      const query = editingTaskId
        ? supabase.from("tasks").update(payload).eq("id", editingTaskId)
        : supabase.from("tasks").insert({
            ...payload,
            created_by: user.id
          });

      const { error } = await query;

      if (error) {
        throw error;
      }

      setTaskForm(emptyTaskForm);
      setEditingTaskId("");
    }, editingTaskId ? "Task updated." : "Task assigned.");
  }

  function beginTaskEdit(taskRecord) {
    setEditingTaskId(taskRecord.id);
    setTaskForm({
      title: taskRecord.title ?? "",
      details: taskRecord.details ?? "",
      assignee_id: taskRecord.assignee_id ?? "",
      due_at: toLocalDateTimeInput(taskRecord.due_at)
    });
    setActiveSection("events");
    clearFeedback();
  }

  async function deleteTask(taskId) {
    if (!isAdmin) {
      return;
    }

    if (!window.confirm("Delete this task?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);

      if (error) {
        throw error;
      }
    }, "Task deleted.");
  }

  async function toggleTaskStatus(taskRecord) {
    await runAction(async () => {
      const nextStatus =
        taskRecord.status === "completed" ? "pending" : "completed";

      const { error } = await supabase.rpc("toggle_task_completion", {
        target_task: taskRecord.id,
        next_status: nextStatus
      });

      if (error) {
        throw error;
      }
    }, "Task status updated.");
  }

  async function updateRsvp(status, eventId = selectedEventId) {
    if (!eventId) {
      setErrorMessage("Select an event before sending an RSVP.");
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("rsvps").upsert(
        {
          event_id: eventId,
          user_id: user.id,
          status
        },
        {
          onConflict: "event_id,user_id"
        }
      );

      if (error) {
        throw error;
      }
    }, "RSVP updated.");
  }

  async function changeRole(memberId, nextRole) {
    if (!isAdmin) {
      return;
    }

    if (memberId === user.id && nextRole !== "admin" && adminCount === 1) {
      setErrorMessage("Keep at least one admin account in the system.");
      return;
    }

    await runAction(async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ role: nextRole })
        .eq("id", memberId);

      if (error) {
        throw error;
      }

      if (memberId === user.id) {
        await refreshProfile();
      }
    }, nextRole === "admin" ? "Member promoted to admin." : "Admin privileges updated.");
  }

  async function toggleMemberAccess(memberId, nextState) {
    if (!isAdmin) {
      return;
    }

    const member = getMember(memberId);

    if (!member) {
      return;
    }

    if (memberId === user.id && !nextState && adminCount === 1) {
      setErrorMessage("Keep the last admin active so the workspace stays manageable.");
      return;
    }

    await runAction(async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: nextState })
        .eq("id", memberId);

      if (error) {
        throw error;
      }
    }, nextState ? "Member access restored." : "Member access paused.");
  }

  async function deleteUser(memberId) {
    if (!isAdmin) {
      return;
    }

    if (memberId === user.id) {
      setErrorMessage("Use another admin account before deleting your own user.");
      return;
    }

    if (!window.confirm("Delete this user from authentication and remove their profile?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.rpc("admin_delete_user", {
        target_user_id: memberId
      });

      if (error) {
        throw getFriendlyActionError(error, "delete-user");
      }
    }, "User deleted.");
  }

  async function saveProfileDetails(event) {
    event.preventDefault();

    await runAction(async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profileForm.full_name.trim(),
          avatar_url: profileForm.avatar_url.trim() || null
        })
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      await refreshProfile();
    }, "Profile updated.");
  }

  async function handleAvatarUpload(event) {
    const avatarFile = event.target.files?.[0];

    if (!avatarFile) {
      return;
    }

    setAvatarFileName(avatarFile.name);

    if (!avatarFile.type.startsWith("image/")) {
      setErrorMessage("Please choose an image file for the profile picture.");
      return;
    }

    if (avatarFile.size > 1024 * 1024) {
      setErrorMessage("Profile pictures must be 1MB or smaller.");
      return;
    }

    setUploadingAvatar(true);
    clearFeedback();

    try {
      const filePath = `${user.id}/avatar-${Date.now()}.${getFileExtension(
        avatarFile.name
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, avatarFile, {
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) {
        const lowerCaseMessage = uploadError.message.toLowerCase();

        if (
          lowerCaseMessage.includes("policy") ||
          lowerCaseMessage.includes("row-level security") ||
          lowerCaseMessage.includes("permission")
        ) {
          throw new Error(
            "Avatar upload is blocked by Supabase Storage permissions. Rerun the latest `supabase/schema.sql` so the avatars bucket policies are applied."
          );
        }

        throw uploadError;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", user.id);

      if (profileError) {
        throw profileError;
      }

      setProfileForm((current) => ({
        ...current,
        avatar_url: data.publicUrl
      }));
      await refreshProfile();
      await loadAppData();
      setStatusMessage("Profile picture updated.");
      setAvatarFileName("");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  }

  async function changeMyPassword(event) {
    event.preventDefault();

    if (passwordForm.password.length < 6) {
      setErrorMessage("Use a password with at least 6 characters.");
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    clearFeedback();

    try {
      await updatePassword(passwordForm.password);
      setPasswordForm(emptyPasswordForm);
      setStatusMessage("Password updated successfully.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openMessageComposer(
    recipientId = "",
    title = "",
    content = "",
    nextReplyingToMessageId = ""
  ) {
    setMessageForm({
      recipient_id: recipientId,
      title,
      content
    });
    setReplyingToMessageId(nextReplyingToMessageId);
    setActiveSection("messages");
    clearFeedback();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function replyToMessage(message) {
    const replyTargetId = getReplyTargetId(message);

    if (!replyTargetId) {
      setErrorMessage("Broadcast messages can be read by everyone, but replies go to a person.");
      return;
    }

    openMessageComposer(
      replyTargetId,
      message.title ? `Re: ${message.title}` : "Re: Message",
      "",
      message.id
    );
    setStatusMessage(`Replying to ${getMemberLabel(replyTargetId)}.`);
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!messageForm.content.trim()) {
      setErrorMessage("Write a message before sending it.");
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("messages").insert({
        sender_id: user.id,
        recipient_id: messageForm.recipient_id || null,
        title: messageForm.title.trim(),
        content: messageForm.content.trim(),
        reply_to_message_id: replyingToMessageId || null
      });

      if (error) {
        throw error;
      }

      setMessageForm(emptyMessageForm);
      setReplyingToMessageId("");
    }, "Message sent.");
  }

  async function deleteMessage(message) {
    if (!canDeleteMessage(message)) {
      return;
    }

    if (!window.confirm("Delete this message?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("messages").delete().eq("id", message.id);

      if (error) {
        throw error;
      }
    }, "Message deleted.");
  }

  async function loadNotificationPreferences() {
    if (!supabase || !user?.id) {
      return;
    }

    const { data: preferences, error } = await supabase.rpc("ensure_notification_preferences");

    if (error) {
      console.error(error);
      return;
    }

    setNotificationPreferences(preferences);

    const { count } = await supabase
      .from("push_subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    setPushDeviceCount(count ?? 0);
  }

  async function updateNotificationPreference(key, value) {
    if (!supabase || !user?.id || !notificationPreferences) {
      return;
    }

    const nextPreferences = {
      ...notificationPreferences,
      [key]: value,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    };

    setNotificationPreferences(nextPreferences);
    setSavingNotificationPreferences(true);

    try {
      const { error } = await supabase
        .from("notification_preferences")
        .update({
          [key]: value,
          timezone: nextPreferences.timezone
        })
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }
    } catch (error) {
      setNotificationPreferences(notificationPreferences);
      setErrorMessage(error.message);
    } finally {
      setSavingNotificationPreferences(false);
    }
  }

  async function enableNotifications() {
    if (!isPushSupported()) {
      setErrorMessage("This browser does not support push notifications. In-app alerts will still appear.");
      return;
    }

    try {
      const result = await subscribeToPushNotifications(user.id);
      setNotificationPermission(getBrowserNotificationPermission());

      if (result.ok) {
        setStatusMessage("Push notifications enabled on this device.");
        setShowPushPrompt(false);
        dismissPushPermissionPrompt();
        await loadNotificationPreferences();
        return;
      }

      if (result.reason === "denied") {
        setErrorMessage("Notifications are blocked. Enable them in your browser settings to receive push alerts.");
        return;
      }

      if (result.reason === "missing-vapid-key") {
        setErrorMessage("Push is not configured yet. Add VITE_VAPID_PUBLIC_KEY to your environment.");
        return;
      }

      setStatusMessage("Notification permission request closed. In-app alerts remain active.");
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function disablePushNotifications() {
    try {
      await unsubscribeFromPushNotifications(user.id);
      setNotificationPermission(getBrowserNotificationPermission());
      setPushDeviceCount(0);
      if (notificationPreferences) {
        await updateNotificationPreference("push_enabled", false);
      }
      setStatusMessage("Push notifications turned off for this device.");
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handlePrayerSubmit(event) {
    event.preventDefault();

    await runAction(async () => {
      const { error } = await supabase.from("prayer_points").insert({
        title: prayerForm.title.trim(),
        details: prayerForm.details.trim(),
        is_anonymous: prayerForm.is_anonymous,
        created_by: user.id
      });

      if (error) {
        throw error;
      }

      setPrayerForm(emptyPrayerForm);
    }, "Prayer point shared.");
  }

  async function updatePrayerStatus(prayerPoint, nextStatus) {
    await runAction(async () => {
      const { error } = await supabase
        .from("prayer_points")
        .update({ status: nextStatus })
        .eq("id", prayerPoint.id);

      if (error) {
        throw error;
      }
    }, "Prayer status updated.");
  }

  async function deletePrayerPoint(prayerId) {
    if (!window.confirm("Delete this prayer point?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("prayer_points").delete().eq("id", prayerId);

      if (error) {
        throw error;
      }
    }, "Prayer point removed.");
  }

  function beginResourceEdit(resource) {
    setEditingResourceId(resource.id);
    setResourceForm({
      title: resource.title ?? "",
      description: resource.description ?? "",
      resource_type: resource.resource_type ?? "note",
      note_content: resource.note_content ?? "",
      external_url: resource.external_url ?? ""
    });
    setResourceFileName(resource.file_name ?? "");
    setSelectedResourceFile(null);
    setActiveSection("resources");
  }

  async function handleResourceSubmit(event) {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    await runAction(async () => {
      let uploadedFileMeta = null;

      if (resourceForm.resource_type === "pdf" && selectedResourceFile) {
        const filePath = `${user.id}/resource-${Date.now()}-${selectedResourceFile.name.replace(/\s+/g, "-")}`;
        const { error: uploadError } = await supabase.storage
          .from("resources")
          .upload(filePath, selectedResourceFile, {
            cacheControl: "3600",
            upsert: false
          });

        if (uploadError) {
          throw uploadError;
        }

        uploadedFileMeta = {
          file_path: filePath,
          file_name: selectedResourceFile.name
        };
      }

      const payload = {
        title: resourceForm.title.trim(),
        description: resourceForm.description.trim(),
        resource_type: resourceForm.resource_type,
        note_content:
          resourceForm.resource_type === "note" ? resourceForm.note_content.trim() : "",
        external_url:
          resourceForm.resource_type === "link"
            ? resourceForm.external_url.trim() || null
            : null,
        ...(resourceForm.resource_type === "pdf"
          ? {
              file_path: uploadedFileMeta?.file_path ?? editingResource?.file_path ?? null,
              file_name: uploadedFileMeta?.file_name ?? editingResource?.file_name ?? null
            }
          : {
              file_path: null,
              file_name: null
            })
      };

      const query = editingResourceId
        ? supabase.from("resources").update(payload).eq("id", editingResourceId)
        : supabase.from("resources").insert({
            ...payload,
            created_by: user.id
          });

      const { error } = await query;

      if (error) {
        throw error;
      }

      setResourceForm(emptyResourceForm);
      setEditingResourceId("");
      setSelectedResourceFile(null);
      setResourceFileName("");
    }, editingResourceId ? "Resource updated." : "Resource shared.");
  }

  async function deleteResource(resource) {
    if (!isAdmin) {
      return;
    }

    if (!window.confirm("Delete this resource?")) {
      return;
    }

    await runAction(async () => {
      if (resource.file_path) {
        await supabase.storage.from("resources").remove([resource.file_path]);
      }

      const { error } = await supabase.from("resources").delete().eq("id", resource.id);

      if (error) {
        throw error;
      }
    }, "Resource deleted.");
  }

  function openResource(resource) {
    if (resource.resource_type === "pdf" && resource.file_path) {
      const { data } = supabase.storage.from("resources").getPublicUrl(resource.file_path);
      window.open(data.publicUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (resource.resource_type === "link" && resource.external_url) {
      window.open(resource.external_url, "_blank", "noopener,noreferrer");
    }
  }

  function beginLeadershipEdit(assignment) {
    setEditingLeadershipId(assignment.id);
    setLeadershipForm({
      assignment_type: assignment.assignment_type ?? "prayer_session",
      assignment_date: assignment.assignment_date ?? "",
      leader_id: assignment.leader_id ?? "",
      title: assignment.title ?? "",
      notes: assignment.notes ?? ""
    });
    setActiveSection("assignments");
  }

  async function handleLeadershipSubmit(event) {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    await runAction(async () => {
      const payload = {
        assignment_type: leadershipForm.assignment_type,
        assignment_date: leadershipForm.assignment_date,
        leader_id: leadershipForm.leader_id,
        title: leadershipForm.title.trim(),
        notes: leadershipForm.notes.trim()
      };

      const query = editingLeadershipId
        ? supabase
            .from("leadership_assignments")
            .update(payload)
            .eq("id", editingLeadershipId)
        : supabase.from("leadership_assignments").insert({
            ...payload,
            created_by: user.id
          });

      const { error } = await query;

      if (error) {
        throw error;
      }

      setLeadershipForm(emptyLeadershipForm);
      setEditingLeadershipId("");
    }, editingLeadershipId ? "Leadership assignment updated." : "Leadership assigned.");
  }

  async function deleteLeadershipAssignment(assignmentId) {
    if (!window.confirm("Delete this leadership assignment?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase
        .from("leadership_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) {
        throw error;
      }
    }, "Leadership assignment deleted.");
  }

  async function markNotificationRead(notificationId, read) {
    await runAction(async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: read ? new Date().toISOString() : null })
        .eq("id", notificationId);

      if (error) {
        throw error;
      }
    }, read ? "Notification marked as read." : "Notification marked as unread.");
  }

  async function markAllNotificationsRead() {
    const unreadIds = unreadNotifications.map((notification) => notification.id);

    if (!unreadIds.length) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);

      if (error) {
        throw error;
      }
    }, "All notifications marked as read.");
  }

  async function deleteNotification(notificationId) {
    await runAction(async () => {
      const { error } = await supabase.from("notifications").delete().eq("id", notificationId);

      if (error) {
        throw error;
      }
    }, "Notification deleted.");
  }

  async function archiveNotification(notificationId, archived) {
    await runAction(async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", notificationId);

      if (error) {
        throw error;
      }
    }, archived ? "Notification archived." : "Notification restored.");
  }

  function openNotificationFromPayload(payload = {}) {
    if (payload.section) {
      setActiveSection(payload.section);
    }

    openNotificationTarget({
      id: payload.notificationId,
      entity_table: payload.entityTable,
      entity_id: payload.entityId,
      notification_type: payload.notificationType
    });

    if (payload.discipleshipTab) {
      setDiscipleshipTabFocus(payload.discipleshipTab);
    }
  }

  function openNotificationTarget(notification) {
    if (!notification) {
      return;
    }

    const targetTable = notification.entity_table;
    const targetId = notification.entity_id;

    if (targetTable === "events" && targetId) {
      setSelectedEventId(targetId);
      setActiveSection("events");
    } else if (targetTable === "event_ideas" && targetId) {
      const linkedIdea = ideas.find((idea) => idea.id === targetId);
      if (linkedIdea?.event_id) {
        setSelectedEventId(linkedIdea.event_id);
      }
      setActiveSection("events");
    } else if (targetTable === "tasks" && targetId) {
      const linkedTask = tasks.find((task) => task.id === targetId);
      if (linkedTask?.event_id) {
        setSelectedEventId(linkedTask.event_id);
      }
      setActiveSection("events");
    } else if (targetTable === "messages") {
      setActiveSection("messages");
    } else if (targetTable === "prayer_points") {
      setActiveSection("prayer");
    } else if (targetTable === "resources") {
      setActiveSection("resources");
    } else if (targetTable === "leadership_assignments") {
      setActiveSection("assignments");
    } else if (targetTable === "discipleship_classes" && targetId) {
      setSelectedAssignmentClassId(targetId);
      setActiveSection("assignments");
    } else if (targetTable === "virtual_meetings") {
      setActiveSection("meetings");
    } else if (targetTable === "discipleship_lessons" && targetId) {
      const linkedLesson = discipleshipLessons.find((lesson) => lesson.id === targetId);
      setSelectedAssignmentClassId(linkedLesson?.class_id ?? "");
      setActiveSection("assignments");
    } else if (targetTable === "announcements") {
      setActiveSection("announcements");
    } else if (targetTable === "event_check_ins" && targetId) {
      const linkedCheckIn = eventCheckIns.find((checkIn) => checkIn.id === targetId);
      if (linkedCheckIn?.event_id) {
        setSelectedEventId(linkedCheckIn.event_id);
      }
      setActiveSection("events");
    } else {
      setActiveSection("events");
    }

    if (!notification.read_at) {
      void supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id);
    }

    setShowNotificationTray(false);
    setShowNotificationCenter(false);
  }

  async function saveAnnouncement(event) {
    event.preventDefault();

    if (!user?.id || !announcementRepliesAvailable || (!isAdmin && editingAnnouncementId)) {
      return;
    }

    await runAction(async () => {
      setUploadingAnnouncementPhotos(true);
      const uploadedPaths = [];
      const uploadedUrls = [];
      try {
        for (const photo of announcementPhotos) {
          const path = `${user.id}/${crypto.randomUUID()}-${photo.file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
          const { error: uploadError } = await supabase.storage.from("announcement-images").upload(path, photo.file, { contentType: photo.file.type, upsert: false });
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
          uploadedUrls.push(supabase.storage.from("announcement-images").getPublicUrl(path).data.publicUrl);
        }
      const payload = {
        title: announcementForm.title.trim() || "Community update",
        body: announcementForm.body.trim(),
        pinned: isAdmin ? announcementForm.pinned : false,
        attachments: [
          ...(editingAnnouncementId ? announcements.find((item) => item.id === editingAnnouncementId)?.attachments ?? [] : []),
          ...uploadedUrls
        ]
      };
      const query = editingAnnouncementId
        ? supabase.from("announcements").update(payload).eq("id", editingAnnouncementId)
        : supabase.from("announcements").insert({
            ...payload,
            created_by: user.id
          });
      const { error } = await query;

      if (error) {
        throw error;
      }

      setAnnouncementForm(emptyAnnouncementForm);
      setEditingAnnouncementId("");
      announcementPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      setAnnouncementPhotos([]);
      } catch (error) {
        if (uploadedPaths.length) await supabase.storage.from("announcement-images").remove(uploadedPaths);
        throw error;
      } finally {
        setUploadingAnnouncementPhotos(false);
      }
    }, editingAnnouncementId ? "Announcement updated." : "Announcement posted.");
  }

  function beginAnnouncementEdit(announcement) {
    if (!announcement) {
      return;
    }

    setEditingAnnouncementId(announcement.id);
    setAnnouncementForm({
      title: announcement.title ?? "",
      body: announcement.body ?? "",
      pinned: Boolean(announcement.pinned)
    });
  }

  async function deleteAnnouncement(announcementId) {
    const target = announcements.find((item) => item.id === announcementId);
    if (!target || (!isAdmin && target.created_by !== user?.id)) {
      return;
    }

    if (!window.confirm("Delete this announcement?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("announcements").delete().eq("id", announcementId);

      if (error) {
        throw error;
      }
    }, "Announcement deleted.");
  }

  async function submitAnnouncementReply(event, announcementId) {
    event.preventDefault();
    const body = (announcementReplyDrafts[announcementId] ?? "").trim();
    if (!body) return;
    await runAction(async () => {
      const { error } = await supabase.from("announcement_replies").insert({ announcement_id: announcementId, user_id: user.id, body });
      if (error) throw error;
      setAnnouncementReplyDrafts((current) => ({ ...current, [announcementId]: "" }));
    }, "Reply posted.");
  }

  async function manageAnnouncementReply(reply, mode) {
    if (!isAdmin && reply.user_id !== user?.id) return;
    if (mode === "delete" && !window.confirm("Delete this reply?")) return;
    const nextBody = mode === "edit" ? window.prompt("Edit your reply", reply.body) : null;
    if (mode === "edit" && (!nextBody?.trim() || nextBody.trim() === reply.body)) return;
    await runAction(async () => {
      const query = mode === "delete"
        ? supabase.from("announcement_replies").delete().eq("id", reply.id)
        : supabase.from("announcement_replies").update({ body: nextBody.trim() }).eq("id", reply.id);
      const { error } = await query;
      if (error) throw error;
    }, mode === "delete" ? "Reply deleted." : "Reply updated.");
  }

  async function togglePrayerReminder(prayerPointId) {
    const existingReminder = prayerReminders.find(
      (reminder) => reminder.user_id === user.id && reminder.prayer_point_id === prayerPointId
    );

    await runAction(async () => {
      if (existingReminder) {
        const { error } = await supabase
          .from("prayer_reminders")
          .delete()
          .eq("id", existingReminder.id);

        if (error) {
          throw error;
        }

        return;
      }

      const now = new Date();
      const reminderTime = new Date(now.getTime() + 60 * 60 * 1000);
      const remindAt = `${String(reminderTime.getHours()).padStart(2, "0")}:${String(
        reminderTime.getMinutes()
      ).padStart(2, "0")}:00`;
      const { error } = await supabase.from("prayer_reminders").upsert(
        {
          user_id: user.id,
          prayer_point_id: prayerPointId,
          frequency: "daily",
          remind_at: remindAt,
          is_active: true
        },
        { onConflict: "user_id,prayer_point_id,frequency" }
      );

      if (error) {
        throw error;
      }
    }, existingReminder ? "Prayer reminder removed." : "Prayer reminder enabled.");
  }

  async function markPrayerReminderPrayed(prayerPointId) {
    const existingReminder = prayerReminders.find(
      (reminder) => reminder.user_id === user.id && reminder.prayer_point_id === prayerPointId
    );

    if (!existingReminder) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase
        .from("prayer_reminders")
        .update({ last_prayed_at: new Date().toISOString() })
        .eq("id", existingReminder.id);

      if (error) {
        throw error;
      }
    }, "Marked as prayed.");
  }

  function downloadEventCalendar(eventRecord) {
    if (!eventRecord?.starts_at) {
      return;
    }

    const icsBody = buildEventCalendarFile(eventRecord);
    const blob = new Blob([icsBody], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(eventRecord.title || "event").replace(/\s+/g, "-").toLowerCase()}.ics`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function renderAnnouncementsSection() {
    const cutoff = new Date(liveNow).getTime() - 7 * 24 * 60 * 60 * 1000;
    const feedAnnouncements = sortedAnnouncements.filter((announcement) => {
      if (announcementFeedFilter === "mine") return announcement.created_by === user?.id;
      if (announcementFeedFilter === "recent") return new Date(announcement.created_at).getTime() >= cutoff;
      return true;
    });
    return (
      <div className="section-stack community-feed">
        <header className="page-intro page-intro--art">
          <div>
            <p className="eyebrow">Community</p>
            <h1>Announcements &amp; Trends</h1>
            <p>Updates, encouragement, and moments from the Glory Carriers community.</p>
          </div>
        </header>

        {!announcementRepliesAvailable ? <div className="banner info">Community posting, replies, and image attachments require the additive announcements migration in <code>supabase/announcements-community-migration.sql</code>.</div> : null}

        <Panel title="Share with the community" subtitle="Keep your group encouraged and informed.">
          <form className="stack-form announcement-composer" onSubmit={saveAnnouncement}>
            <label className="field">
              <span>Headline <small>(optional)</small></span>
              <input value={announcementForm.title} maxLength={180} placeholder="A short headline" onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="field">
              <span>Your update</span>
              <textarea value={announcementForm.body} maxLength={2500} rows={4} placeholder="Share an update with Glory Carriers..." required onChange={(event) => setAnnouncementForm((current) => ({ ...current, body: event.target.value }))} />
            </label>
            <label className="field announcement-photo-field">
              <span>Add photos</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadingAnnouncementPhotos || !announcementRepliesAvailable} onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                const valid = selected.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024);
                if (valid.length !== selected.length) setErrorMessage("Choose JPEG, PNG, or WebP photos up to 8 MB each.");
                const prepared = valid.map((file) => ({ file, preview: URL.createObjectURL(file) })); const room = Math.max(0, 5 - announcementPhotos.length); prepared.slice(room).forEach((photo) => URL.revokeObjectURL(photo.preview)); setAnnouncementPhotos((current) => [...current, ...prepared.slice(0, room)]);
                event.target.value = "";
              }} />
              {announcementPhotos.length ? <div className="announcement-photo-previews">{announcementPhotos.map((photo, index) => <div key={`${photo.file.name}-${index}`}><img src={photo.preview} alt={`Selected photo ${index + 1}`} /><button type="button" className="ghost-button compact" aria-label={`Remove ${photo.file.name}`} onClick={() => { URL.revokeObjectURL(photo.preview); setAnnouncementPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}>Remove</button></div>)}</div> : null}
            </label>
            <div className="form-actions">
              {isAdmin ? <label className="inline-checkbox"><input type="checkbox" checked={announcementForm.pinned} onChange={(event) => setAnnouncementForm((current) => ({ ...current, pinned: event.target.checked }))} /> Pin announcement</label> : null}
              <button type="submit" className="primary-button" disabled={!announcementRepliesAvailable || submitting || uploadingAnnouncementPhotos}>{uploadingAnnouncementPhotos ? "Uploading photos…" : submitting ? "Publishing…" : editingAnnouncementId ? "Save changes" : "Publish update"}</button>
              {editingAnnouncementId ? <button type="button" className="ghost-button" onClick={() => { setEditingAnnouncementId(""); setAnnouncementForm(emptyAnnouncementForm); }}>Cancel</button> : null}
            </div>
          </form>
        </Panel>

        <div className="announcement-feed-toolbar" role="group" aria-label="Filter announcements">
          {[['all','All'],['recent','Recent'],['mine','My posts']].map(([value,label]) => <button key={value} type="button" className={announcementFeedFilter===value?'active':''} aria-pressed={announcementFeedFilter===value} onClick={()=>setAnnouncementFeedFilter(value)}>{label}</button>)}
        </div>
        <div className="community-feed-list">
          {feedAnnouncements.length ? feedAnnouncements.map((announcement) => {
            const author = profiles.find((member) => member.id === announcement.created_by);
            const canManage = isAdmin || announcement.created_by === user?.id;
            return <article key={announcement.id} className="community-post">
              <header className="community-post-header">
                <Avatar member={author} size="small" />
                <div className="community-post-author"><strong>{author?.full_name || author?.email || "Community member"}</strong><time dateTime={announcement.created_at}>{formatDateTime(announcement.created_at)}{announcement.updated_at && announcement.updated_at !== announcement.created_at ? " · Edited" : ""}</time></div>
                {announcement.pinned ? <span className="pill info">Pinned</span> : null}
                {canManage ? <div className="community-post-actions"><button type="button" className="ghost-button compact" onClick={() => beginAnnouncementEdit(announcement)}>Edit</button><button type="button" className="ghost-button compact danger" onClick={() => deleteAnnouncement(announcement.id)}>Delete</button></div> : null}
              </header>
              {announcement.title ? <h2>{announcement.title}</h2> : null}
              <p className="community-post-body">{announcement.body}</p>
              {Array.isArray(announcement.attachments) && announcement.attachments.length ? <div className={`community-post-gallery count-${Math.min(announcement.attachments.length, 4)}`}>{announcement.attachments.map((url, index) => <img key={`${url}-${index}`} src={url} alt={`Announcement attachment ${index + 1}`} loading="lazy" />)}</div> : null}
              <AnnouncementReactions announcementId={announcement.id} reactions={reactions} profiles={profiles} userId={user?.id} disabled={submitting} onToggle={toggleAnnouncementReaction} onMessageShortcut={() => setActiveSection("messages")} />
              <section className="community-replies" aria-label="Replies">
                {announcementReplies.filter((reply) => reply.announcement_id === announcement.id).map((reply) => {
                  const replyAuthor = profiles.find((member) => member.id === reply.user_id);
                  return <article className="community-reply" key={reply.id}><Avatar member={replyAuthor} size="small" /><div className="community-reply-content"><strong>{replyAuthor?.full_name || replyAuthor?.email || "Member"}</strong><p>{reply.body}</p><time dateTime={reply.created_at}>{formatDateTime(reply.created_at)}</time><AnnouncementReplyReactions replyId={reply.id} reactions={reactions} userId={user?.id} disabled={submitting} onToggle={toggleAnnouncementReaction} /></div>{(isAdmin || reply.user_id === user?.id) ? <div className="community-post-actions"><button type="button" className="ghost-button compact" onClick={() => manageAnnouncementReply(reply, "edit")}>Edit</button><button type="button" className="ghost-button compact danger" onClick={() => manageAnnouncementReply(reply, "delete")}>Delete</button></div> : null}</article>;
                })}
                <form className="community-reply-form" onSubmit={(event) => submitAnnouncementReply(event, announcement.id)}><input aria-label="Write a reply" maxLength={2000} value={announcementReplyDrafts[announcement.id] ?? ""} onChange={(event) => setAnnouncementReplyDrafts((current) => ({ ...current, [announcement.id]: event.target.value }))} placeholder="Write a reply…" /><button type="submit" className="secondary-button compact" disabled={submitting || !(announcementReplyDrafts[announcement.id] ?? "").trim()}>Reply</button></form>
              </section>
            </article>;
          }) : <EmptyState title={announcements.length ? "No posts match this view" : "A fresh beginning"} description={announcements.length ? "Try another filter to see more community updates." : "There are no announcements yet. Share the first update with your community."} />}
        </div>
      </div>
    );
  }

  function renderEventsDirectorySection() {
    const upcoming = sortedEvents.filter((item) => new Date(item.starts_at) >= new Date(liveNow));
    const past = sortedEvents.filter((item) => new Date(item.starts_at) < new Date(liveNow)).reverse();
    const eventCard = (eventRecord) => <article key={eventRecord.id} className="event-directory-card">
      <div className="event-date-block"><strong>{new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(new Date(eventRecord.starts_at))}</strong><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(eventRecord.starts_at))}</span></div>
      <div className="event-directory-copy"><h3>{eventRecord.title}</h3><p>{formatDateTime(eventRecord.starts_at)}{eventRecord.location ? ` · ${eventRecord.location}` : ""}</p>{eventRecord.description ? <p className="muted-text">{eventRecord.description}</p> : null}</div>
      <div className="event-directory-actions"><span className={`pill ${new Date(eventRecord.starts_at) >= new Date(liveNow) ? "success" : ""}`}>{new Date(eventRecord.starts_at) >= new Date(liveNow) ? "Upcoming" : "Past"}</span>{new Date(eventRecord.starts_at) >= new Date(liveNow) ? <button type="button" className={rsvps.some((row) => row.event_id === eventRecord.id && row.user_id === user.id && row.status === "going") ? "accent-button compact" : "secondary-button compact"} onClick={() => void updateRsvp("going", eventRecord.id)}>{rsvps.some((row) => row.event_id === eventRecord.id && row.user_id === user.id && row.status === "going") ? "Going" : "RSVP"}</button> : null}<button type="button" className="ghost-button compact" onClick={() => setSelectedEventId(eventRecord.id)}>Details</button><button type="button" className="ghost-button compact" onClick={() => downloadEventCalendar(eventRecord)}>Calendar</button>{isAdmin ? <><button type="button" className="ghost-button compact" onClick={() => beginEventEdit(eventRecord)}>Edit</button><button type="button" className="ghost-button compact danger" onClick={() => deleteEvent(eventRecord.id)}>Delete</button></> : null}</div>
    </article>;
    return <div className="section-stack">
      <header className="page-intro page-intro--art"><div><p className="eyebrow">Gather together</p><h1>Events</h1><p>Find the next opportunity to worship, serve, and grow together.</p></div></header>
      {isAdmin ? <Panel title={editingEventId ? "Edit event" : "Create an event"} subtitle="Keep your community gatherings in one shared calendar." action={editingEventId ? <button type="button" className="ghost-button" onClick={() => { setEditingEventId(""); setEventForm(emptyEventForm); }}>Cancel</button> : null}>
        <form className="grid-form two-column" onSubmit={handleEventSubmit}>
          <label className="field"><span>Event title</span><input required maxLength={180} value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder="Prayer night, outreach, fellowship…" /></label>
          <label className="field"><span>Location or meeting link</span><input value={eventForm.location} onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))} placeholder="Church hall or online" /></label>
          <label className="field"><span>Starts</span><input required type="datetime-local" value={eventForm.starts_at} onChange={(event) => setEventForm((current) => ({ ...current, starts_at: event.target.value }))} /></label>
          <label className="field"><span>Ends</span><input type="datetime-local" value={eventForm.ends_at} onChange={(event) => setEventForm((current) => ({ ...current, ends_at: event.target.value }))} /></label>
          <label className="field field-wide"><span>Description</span><textarea rows={3} value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} placeholder="Share what members can expect." /></label>
          <div className="form-actions wide"><button type="submit" className="primary-button" disabled={submitting}>{editingEventId ? "Save event" : "Create event"}</button></div>
        </form>
      </Panel> : null}
      <Panel title="Upcoming events" subtitle="Your group's next gatherings.">{upcoming.length ? <div className="event-directory-list">{upcoming.map(eventCard)}</div> : <EmptyState title="Nothing scheduled yet" description="New gatherings will appear here when they're planned." />}</Panel>
      {past.length ? <Panel title="Past events" subtitle="Previous gatherings from your community."><div className="event-directory-list">{past.map(eventCard)}</div></Panel> : null}
      {selectedEvent ? <>
        <Panel title={selectedEvent.title} subtitle={`${formatDateTime(selectedEvent.starts_at)} · ${selectedEvent.location || "Location to be confirmed"}`}>
          {selectedEvent.description ? <p className="event-detail-description">{selectedEvent.description}</p> : null}
          <div className="event-detail-actions"><button type="button" className={rsvps.some((row) => row.event_id === selectedEvent.id && row.user_id === user.id && row.status === "going") ? "accent-button" : "primary-button"} onClick={() => void updateRsvp("going", selectedEvent.id)}>{rsvps.some((row) => row.event_id === selectedEvent.id && row.user_id === user.id && row.status === "going") ? "You're going" : "RSVP · Going"}</button><button type="button" className="secondary-button" onClick={() => void updateRsvp("not_going", selectedEvent.id)}>Can't attend</button><button type="button" className={currentUserCheckIn ? "accent-button" : "secondary-button"} disabled={checkingIn} onClick={() => void handleEventCheckIn(selectedEvent.id)}>{checkingIn ? "Checking in…" : currentUserCheckIn ? "Update check-in" : "Check in"}</button><button type="button" className="ghost-button" onClick={() => downloadEventCalendar(selectedEvent)}>Add to calendar</button></div>
          <div className="event-attendance-summary"><span>{attendingMembers.length} attending</span><span>{selectedCheckIns.length} checked in</span></div>
        </Panel>
        <div className="content-grid"><Panel title="Who's attending" subtitle="Member responses for this gathering.">{attendingMembers.length ? <div className="people-list">{attendingMembers.map((rsvp) => <div key={rsvp.user_id} className="person-row"><Avatar member={getMember(rsvp.user_id)} size="small" /><strong>{getMemberLabel(rsvp.user_id)}</strong><span className="pill success">Going</span></div>)}</div> : <EmptyState title="No RSVPs yet" description="Member responses will appear here." />}</Panel>
          <Panel title="Arrival check-ins" subtitle="See who has arrived.">{selectedCheckIns.length ? <div className="people-list">{selectedCheckIns.map((checkIn) => <div key={checkIn.id} className="person-row"><Avatar member={getMember(checkIn.user_id)} size="small" /><div><strong>{getMemberLabel(checkIn.user_id)}</strong><p>{formatDateTime(checkIn.checked_in_at)}</p></div><span className="pill success">Checked in</span></div>)}</div> : <EmptyState title="No check-ins yet" description="Members can check in when they arrive." />}</Panel></div>
        <div className="content-grid"><Panel title="Event ideas" subtitle={`Suggestions for ${selectedEvent.title}.`}><form className="community-reply-form" onSubmit={handleIdeaSubmit}><input aria-label="Suggest an event idea" maxLength={1000} value={ideaDraft} onChange={(event) => setIdeaDraft(event.target.value)} placeholder="Share an idea for this gathering…"/><button type="submit" className="secondary-button compact" disabled={submitting || !ideaDraft.trim()}>Suggest</button></form>{selectedIdeas.length ? <div className="event-idea-list">{selectedIdeas.map((idea) => <article key={idea.id}><div><strong>{getMemberLabel(idea.user_id)}</strong><p>{idea.content}</p></div><button type="button" className={hasUserVoted(idea.id) ? "accent-button compact" : "ghost-button compact"} onClick={() => toggleIdeaVote(idea.id)}>{hasUserVoted(idea.id) ? "Voted" : "Support"} · {getIdeaVoteCount(idea.id)}</button></article>)}</div> : <p className="inline-help">Share the first idea for this event.</p>}</Panel>
          <Panel title="Event responsibilities" subtitle="Tasks remain connected to their event.">{isAdmin ? <form className="event-task-form" onSubmit={handleTaskSubmit}><label className="field"><span>{editingTaskId ? "Task title" : "Assign a responsibility"}</span><input required value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} placeholder="Prepare the welcome table" /></label><label className="field"><span>Assigned to</span><select value={taskForm.assignee_id} onChange={(event) => setTaskForm((current) => ({ ...current, assignee_id: event.target.value }))}><option value="">Unassigned</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}</select></label><label className="field"><span>Due date</span><input type="datetime-local" value={taskForm.due_at} onChange={(event) => setTaskForm((current) => ({ ...current, due_at: event.target.value }))} /></label><label className="field"><span>Details</span><textarea rows={2} value={taskForm.details} onChange={(event) => setTaskForm((current) => ({ ...current, details: event.target.value }))} /></label><button type="submit" className="secondary-button compact" disabled={submitting}>{editingTaskId ? "Save task" : "Add task"}</button>{editingTaskId ? <button type="button" className="ghost-button compact" onClick={() => { setEditingTaskId(""); setTaskForm(emptyTaskForm); }}>Cancel</button> : null}</form> : null}{selectedTasks.length ? <div className="event-task-list">{selectedTasks.map((task) => <div key={task.id}><span><strong>{task.title}</strong><small>{task.assignee_id ? getMemberLabel(task.assignee_id) : "Unassigned"}{task.due_at ? ` · Due ${formatDate(task.due_at)}` : ""}</small></span><span className="event-task-actions">{isAdmin ? <><button type="button" className="ghost-button compact" onClick={() => beginTaskEdit(task)}>Edit</button><button type="button" className="ghost-button compact danger" onClick={() => deleteTask(task.id)}>Delete</button></> : null}<button type="button" className={task.status === "completed" ? "accent-button compact" : "secondary-button compact"} disabled={!isAdmin && task.assignee_id !== user.id} onClick={() => void toggleTaskStatus(task)}>{task.status === "completed" ? "Reopen" : "Mark done"}</button></span></div>)}</div> : <EmptyState title="No responsibilities yet" description="There are no tasks linked to this event." />}</Panel></div>
      </> : null}
    </div>;
  }

  async function recommendLeader(assignmentType) {
    if (!isAdmin) {
      return;
    }

    await runAction(async () => {
      const { data, error } = await supabase.rpc("recommend_next_leader", {
        target_type: assignmentType
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("No active members available for rotation.");
      }

      setLeadershipForm((current) => ({
        ...current,
        leader_id: data
      }));
    }, "Recommended leader selected.");
  }

  async function handleEventCheckIn(eventId = selectedEventId) {
    if (!eventId) {
      setErrorMessage("Choose an event before checking in.");
      return;
    }

    setCheckingIn(true);
    clearFeedback();

    try {
      const position = await new Promise((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (result) => resolve(result),
          () => resolve(null),
          {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60_000
          }
        );
      });

      const { error } = await supabase.from("event_check_ins").upsert(
        {
          event_id: eventId,
          user_id: user.id,
          location_label: position ? "Shared from device location" : "Checked in without location",
          latitude: position?.coords?.latitude ?? null,
          longitude: position?.coords?.longitude ?? null,
          checked_in_at: new Date().toISOString()
        },
        {
          onConflict: "event_id,user_id"
        }
      );

      if (error) {
        throw error;
      }

      setStatusMessage("Checked in successfully.");
      await loadAppData();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setCheckingIn(false);
    }
  }

  function renderEventSection() {
    return (
      <div className="section-stack">
        <div className="dashboard-grid">
          <Panel
            title="Quick insights"
            subtitle="A simple overview of what needs attention now."
          >
            <div className="insight-grid">
              {dashboardHighlights.map((item) => (
                <article key={item.label} className="insight-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.caption}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title="Recent activity"
            subtitle="Latest items across the workspace, ready to jump back into."
          >
            {recentActivity.length ? (
              <div className="recent-list">
                {recentActivity.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="recent-item"
                    onClick={item.action}
                  >
                    <span className="recent-item-kind">{item.kind}</span>
                    <strong>{item.title}</strong>
                    <p>{item.meta}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No recent activity yet"
                description="As events, tasks, ideas, and messages arrive, the latest items will appear here."
              />
            )}
          </Panel>
        </div>

        <Panel
          className="dashboard-bible-panel"
          title="Bible Study community"
          subtitle={bibleToday ? `Today: ${bibleToday.book} ${bibleToday.chapter} • Read, share, and grow together.` : "Shared reading and conversations from the community."}
          action={<button type="button" className="accent-button" onClick={() => setActiveSection("bible-study")}>Open Bible Study</button>}
        >
          <div className="dashboard-bible-summary">
            <span className="dashboard-bible-icon"><NavIcon name="scripture" /></span>
            <div><strong>{bibleToday ? `${bibleToday.book} ${bibleToday.chapter}` : "Reading plan coming soon"}</strong><p>{bibleStudyTakeaways.length} takeaways · {bibleStudyReplies.length} replies · {bibleStudyQuestions.length} open questions</p></div>
            <span className="dashboard-bible-live"><i /> LIVE</span>
          </div>
          <div className="dashboard-partner-streaks">
            <div><strong>Partner Streaks</strong><span>{pendingPartnerInvites.length ? `${pendingPartnerInvites.length} invitation${pendingPartnerInvites.length === 1 ? "" : "s"} waiting` : myPartnerStreaks.length ? "Stay consistent together" : "Invite someone to study together"}</span></div>
            {partnerDashboardCards.length ? <div className="dashboard-partner-list">{partnerDashboardCards.map((item) => <button type="button" key={item.id} onClick={() => setActiveSection("bible-study")}><span className="dashboard-partner-mark">◆</span><span className="dashboard-partner-avatar">{item.partner?.avatar_url ? <img src={item.partner.avatar_url} alt=""/> : (item.partner?.full_name || "P").slice(0, 1)}</span><span><strong>You & {item.partner?.full_name || "Partner"}</strong><small>{item.streak} day{item.streak === 1 ? "" : "s"} · {item.mine && item.theirs ? "Completed together" : item.mine ? `Waiting on ${item.partner?.full_name || "partner"}` : "Your reading is waiting"}</small></span><b>Open</b></button>)}</div> : <button type="button" className="dashboard-partner-start" onClick={() => setActiveSection("bible-study")}>Start a Partner Streak</button>}
          </div>
          {bibleCommunityActivity.length ? <div className="dashboard-bible-activity">{bibleCommunityActivity.map((item) => <button type="button" key={`${item.kind}-${item.id}`} onClick={() => setActiveSection("bible-study")}><span className="dashboard-bible-activity-kind">{item.kind}</span><div><small>{item.kind} · {getMemberLabel(item.userId)}</small><strong>{truncateText(item.content, 110)}</strong></div><b>View <span aria-hidden="true">→</span></b></button>)}</div> : <div className="dashboard-bible-empty">Be the first to share a Bible Study takeaway or question.</div>}
        </Panel>

        <Panel
          title="Class learning"
          subtitle="Keep up with class sessions, assignments, and your learning progress."
          action={
            <button
              type="button"
              className="primary-button"
              onClick={() => setActiveSection("assignments")}
            >
              Open assignments
            </button>
          }
        >
          {(() => {
            const myClassIds = new Set(
              discipleshipEnrollments
                .filter((row) => row.user_id === user.id && row.status === "approved")
                .map((row) => row.class_id)
            );
            const workLessons = discipleshipLessons.filter(
              (lesson) => isWorkLesson(lesson) && myClassIds.has(lesson.class_id)
            );
            const assignmentStats = computeUserAssignmentStats({
              workLessons,
              submissions: discipleshipAssignmentSubmissions,
              userId: user.id,
              classIds: myClassIds,
              now: new Date(liveNow)
            });
            const pendingAssignments = assignmentStats.pending.length;
            const projectLessons = workLessons.filter(
              (lesson) => lesson.lesson_type === "project"
            );
            const projectComplete = projectLessons.some((lesson) => {
              const submission = discipleshipAssignmentSubmissions.find(
                (row) => row.lesson_id === lesson.id && row.user_id === user.id
              );
              const status = getDisplayStatus(submission);
              return status === "completed" || status === "reviewed";
            });
            const nextSession = [...discipleshipSessions]
              .filter(
                (session) =>
                  myClassIds.has(session.class_id) &&
                  new Date(session.starts_at) > new Date(liveNow)
              )
              .sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at))[0];

            return (
              <div className="insight-grid">
                <article className="insight-card">
                  <span>Enrollment</span>
                  <strong>
                    {myClassIds.size
                      ? `${myClassIds.size} active class${myClassIds.size === 1 ? "" : "es"}`
                      : "Not enrolled yet"}
                  </strong>
                  <p>
                    {myClassIds.size
                      ? "Review guidelines and stay current on assignments."
                      : "Class enrollment and assignments will appear here when available."}
                  </p>
                </article>
                <article className="insight-card">
                  <span>Assignments</span>
                  <strong>
                    {myClassIds.size
                      ? pendingAssignments
                        ? `${pendingAssignments} pending`
                        : "All caught up"
                      : "—"}
                  </strong>
                  <p>
                    {myClassIds.size
                      ? `${assignmentStats.progress.percent}% complete • ${assignmentStats.upcomingDeadlines.length} upcoming deadline${assignmentStats.upcomingDeadlines.length === 1 ? "" : "s"}`
                      : "Weekly tasks with timely submission and integrity."}
                  </p>
                </article>
                <article className="insight-card">
                  <span>Class project</span>
                  <strong>
                    {!myClassIds.size
                      ? "—"
                      : !projectLessons.length
                        ? "Not published"
                        : projectComplete
                          ? "Complete"
                          : "Required"}
                  </strong>
                  <p>Mandatory for graduation from Discipleship 1.</p>
                </article>
                <article className="insight-card">
                  <span>Next session</span>
                  <strong>
                    {nextSession ? truncateText(nextSession.title, 28) : "No session scheduled"}
                  </strong>
                  <p>
                    {nextSession
                      ? formatDateTime(nextSession.starts_at)
                      : "Sessions appear when leaders schedule them."}
                  </p>
                </article>
              </div>
            );
          })()}
        </Panel>

        {(() => {
          const myClassIds = new Set(
            discipleshipEnrollments
              .filter((row) => row.user_id === user.id && row.status === "approved")
              .map((row) => row.class_id)
          );

          if (!myClassIds.size) {
            return null;
          }

          const workLessons = discipleshipLessons.filter(
            (lesson) => isWorkLesson(lesson) && myClassIds.has(lesson.class_id)
          );
          const assignmentStats = computeUserAssignmentStats({
            workLessons,
            submissions: discipleshipAssignmentSubmissions,
            userId: user.id,
            classIds: myClassIds,
            now: new Date(liveNow)
          });

          return (
            <Panel
              className="assignment-summary-panel"
              title="Assignment summary"
              subtitle="Pending work, upcoming deadlines, and recently graded submissions."
              action={
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveSection("assignments")}
                >
                  View assignments
                </button>
              }
            >
              <div className="assignment-summary-hero">
                <ProgressBar
                  value={assignmentStats.progress.percent}
                  label={`${assignmentStats.progress.completed} of ${assignmentStats.progress.total} assignments reviewed or completed`}
                />
              </div>
              <div className="assignment-dashboard-grid">
                <article className="assignment-dashboard-card tone-warning">
                  <span>Pending</span>
                  <strong>{assignmentStats.pending.length}</strong>
                  {assignmentStats.pending.length ? (
                    <ul>
                      {assignmentStats.pending.slice(0, 3).map((lesson) => (
                        <li key={lesson.id}>{lesson.title}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inline-help">You are caught up on submissions.</p>
                  )}
                </article>
                <article className="assignment-dashboard-card tone-info">
                  <span>Upcoming deadlines</span>
                  <strong>{assignmentStats.upcomingDeadlines.length}</strong>
                  {assignmentStats.upcomingDeadlines.length ? (
                    <ul>
                      {assignmentStats.upcomingDeadlines.slice(0, 3).map((lesson) => (
                        <li key={lesson.id}>
                          {lesson.title} • {formatDateTime(lesson.due_at)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inline-help">No due dates in the next while.</p>
                  )}
                </article>
                <article className="assignment-dashboard-card tone-success">
                  <span>Recently graded</span>
                  <strong>{assignmentStats.recentlyGraded.length}</strong>
                  {assignmentStats.recentlyGraded.length ? (
                    <ul>
                      {assignmentStats.recentlyGraded.slice(0, 3).map(({ lesson, submission }) => (
                        <li key={lesson.id}>
                          {lesson.title}
                          {submission.score != null ? ` • ${submission.score}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inline-help">Feedback will appear here after review.</p>
                  )}
                </article>
              </div>
            </Panel>
          );
        })()}

        <div className="content-grid">
          <Panel
            title="Your next steps"
            subtitle="Simple prompts to keep you engaged and prepared."
          >
            <div className="recent-list">
              {nextStepPrompts.map((prompt) => (
                <article key={prompt} className="insight-card">
                  <strong>{prompt}</strong>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title="Announcements"
            subtitle="Pinned updates stay visible so everyone stays aligned."
          >
            {sortedAnnouncements.length ? (
              <div className="card-list">
                {sortedAnnouncements.slice(0, 6).map((announcement) => {
                  const author =
                    profiles.find((profile) => profile.id === announcement.created_by) ?? null;

                  return (
                    <article key={announcement.id} className="idea-card announcement-card">
                      <div className="idea-header">
                        <div className="announcement-meta">
                          <h3>{announcement.title}</h3>
                          {author ? (
                            <p className="announcement-author">
                              {author.full_name || author.email || "Admin"}
                            </p>
                          ) : null}
                          <p>{formatDateTime(announcement.created_at)}</p>
                        </div>
                        {announcement.pinned ? <span className="pill info">Pinned</span> : null}
                      </div>
                      <p className="idea-text">{announcement.body}</p>
                      <AnnouncementReactions
                        announcementId={announcement.id}
                        reactions={reactions}
                        profiles={profiles}
                        userId={user?.id}
                        disabled={submitting}
                        onToggle={toggleAnnouncementReaction}
                        onMessageShortcut={() => setActiveSection("messages")}
                      />
                      {isAdmin ? (
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => beginAnnouncementEdit(announcement)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => deleteAnnouncement(announcement.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No announcements yet"
                description="Admins can post reminders and pinned updates for everyone."
              />
            )}
          </Panel>
        </div>

        {isAdmin ? (
          <Panel
            title="Engagement insights"
            subtitle="A lightweight view of attendance, execution, and participation."
          >
            <div className="insight-grid">
              <article className="insight-card">
                <span>Attendance trend</span>
                <strong>{attendanceRate}% avg going</strong>
                <p>Based on total RSVPs marked going across scheduled events.</p>
              </article>
              <article className="insight-card">
                <span>Task completion</span>
                <strong>{taskCompletionRate}% complete</strong>
                <p>{completedTasks} completed out of {tasks.length} tasks.</p>
              </article>
              <article className="insight-card">
                <span>Participation level</span>
                <strong>{participationRate}% active</strong>
                <p>{activeParticipantIds.size} members interacted in current workspace activity.</p>
              </article>
              <article className="insight-card">
                <span>Announcement reactions</span>
                <strong>{announcementEngagement.total}</strong>
                <p>
                  {announcementEngagement.uniqueReactors} members reacted across{" "}
                  {announcements.length} announcements.
                </p>
              </article>
            </div>
          </Panel>
        ) : null}

        {isAdmin ? (
          <Panel
            title={editingAnnouncementId ? "Edit announcement" : "Post announcement"}
            subtitle="Share important updates and pin what should stay at the top."
            action={
              editingAnnouncementId ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingAnnouncementId("");
                    setAnnouncementForm(emptyAnnouncementForm);
                  }}
                >
                  Cancel edit
                </button>
              ) : null
            }
          >
            <form className="stack-form" onSubmit={saveAnnouncement}>
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  placeholder="This week prayer focus..."
                  required
                />
              </label>
              <label className="field">
                <span>Announcement</span>
                <textarea
                  value={announcementForm.body}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      body: event.target.value
                    }))
                  }
                  rows={4}
                  placeholder="Share what everyone should see now."
                  required
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={announcementForm.pinned}
                  onChange={(event) =>
                    setAnnouncementForm((current) => ({
                      ...current,
                      pinned: event.target.checked
                    }))
                  }
                />
                <span>Pin this announcement</span>
              </label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {editingAnnouncementId ? "Save announcement" : "Post announcement"}
                </button>
              </div>
            </form>
          </Panel>
        ) : null}

        {isAdmin ? (
          <Panel
            title={editingEventId ? "Edit Event" : "Create Event"}
            subtitle="Admins can create, adjust, and remove every event in the group calendar."
            action={
              editingEventId ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingEventId("");
                    setEventForm(emptyEventForm);
                  }}
                >
                  Cancel edit
                </button>
              ) : null
            }
          >
            <form className="grid-form two-column" onSubmit={handleEventSubmit}>
              <label className="field">
                <span>Event title</span>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(event) =>
                    setEventForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  placeholder="Prayer night, outreach, fellowship..."
                  required
                />
              </label>

              <label className="field">
                <span>Location</span>
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(event) =>
                    setEventForm((current) => ({
                      ...current,
                      location: event.target.value
                    }))
                  }
                  placeholder="Home, church hall, online..."
                />
              </label>

              <label className="field">
                <span>Start date & time</span>
                <input
                  type="datetime-local"
                  value={eventForm.starts_at}
                  onChange={(event) =>
                    setEventForm((current) => ({
                      ...current,
                      starts_at: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>End date & time</span>
                <input
                  type="datetime-local"
                  value={eventForm.ends_at}
                  onChange={(event) =>
                    setEventForm((current) => ({
                      ...current,
                      ends_at: event.target.value
                    }))
                  }
                />
              </label>

              <label className="field wide">
                <span>Description</span>
                <textarea
                  value={eventForm.description}
                  onChange={(event) =>
                    setEventForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  rows={4}
                  placeholder="Add the purpose, agenda, or important details."
                />
              </label>

              <div className="form-actions wide">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {editingEventId ? "Save changes" : "Create event"}
                </button>
              </div>
            </form>
          </Panel>
        ) : null}

        <div className="content-grid">
          <Panel
            title="Events Dashboard"
            subtitle="Everything begins empty, so the first event you add becomes the shared focus for planning."
          >
            {sortedEvents.length ? (
              <div className="card-list event-dashboard-list">
                {sortedEvents.map((eventRecord) => {
                  const taskCounts = getEventTaskCounts(eventRecord.id);
                  const suggestionCount = ideas.filter(
                    (idea) => idea.event_id === eventRecord.id
                  ).length;

                  return (
                    <article
                      key={eventRecord.id}
                      className={
                        selectedEventId === eventRecord.id
                          ? "event-card selected"
                          : "event-card"
                      }
                    >
                      <div className="event-card-header">
                        <div>
                          <h3>{eventRecord.title}</h3>
                          <p>{formatDateTime(eventRecord.starts_at)}</p>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setSelectedEventId(eventRecord.id)}
                        >
                          {selectedEventId === eventRecord.id ? "Focused" : "Focus"}
                        </button>
                      </div>

                      <p className="event-description">
                        {eventRecord.description || "No description yet."}
                      </p>

                      <div className="event-meta">
                        <span>{eventRecord.location || "Location to be confirmed"}</span>
                        <span>Starts in {getCountdownLabel(eventRecord.starts_at, liveNow)}</span>
                        <span>{getEventRsvpCount(eventRecord.id)} going</span>
                        <span>{suggestionCount} ideas</span>
                        <span>
                          {taskCounts.completed}/{taskCounts.total} tasks done
                        </span>
                      </div>

                      <div className="inline-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => downloadEventCalendar(eventRecord)}
                        >
                          Add to calendar
                        </button>
                      </div>

                      {isAdmin ? (
                        <div className="inline-actions event-card-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => beginEventEdit(eventRecord)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => deleteEvent(eventRecord.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No events yet"
                description="Admins can add the first gathering here, and everyone will see it instantly across devices."
              />
            )}
          </Panel>

        <Panel
          title="RSVP Live"
            subtitle={
              selectedEvent
                ? `Live attendance for ${selectedEvent.title}.`
                : "Choose an event to begin collecting RSVPs."
            }
          >
            {selectedEvent ? (
              <div className="rsvp-panel">
                <div className="rsvp-actions">
                  <button
                    type="button"
                    className={
                      selectedRsvps.some(
                        (rsvp) => rsvp.user_id === user.id && rsvp.status === "going"
                      )
                        ? "primary-button"
                        : "secondary-button"
                    }
                    onClick={() => updateRsvp("going")}
                    disabled={submitting}
                  >
                    Going
                  </button>
                  <button
                    type="button"
                    className={
                      selectedRsvps.some(
                        (rsvp) =>
                          rsvp.user_id === user.id && rsvp.status === "not_going"
                      )
                        ? "accent-button"
                        : "secondary-button"
                    }
                    onClick={() => updateRsvp("not_going")}
                    disabled={submitting}
                  >
                    Not going
                  </button>
                </div>

                {attendingMembers.length ? (
                  <div className="people-list">
                    {attendingMembers.map((rsvp) => {
                      const member = getMember(rsvp.user_id);

                      return (
                        <div key={rsvp.user_id} className="person-row">
                          <div>
                            <strong>{getMemberLabel(rsvp.user_id)}</strong>
                            <p>{member?.email || "No email available"}</p>
                          </div>
                          <span className="pill success">Going</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No one has RSVP'd yet"
                    description="The live attendee list will appear here as members respond."
                  />
                )}
              </div>
            ) : (
              <EmptyState
                title="Pick an event"
                description="The RSVP panel updates in real time once an event is selected."
              />
            )}
          </Panel>

          <Panel
            title="Check-In"
            subtitle={
              selectedEvent
                ? `Let everyone know you have arrived for ${selectedEvent.title}.`
                : "Select an event to enable live arrival check-ins."
            }
          >
            {selectedEvent ? (
              <div className="section-stack">
                <div className="inline-actions">
                  <button
                    type="button"
                    className={currentUserCheckIn ? "accent-button" : "primary-button"}
                    onClick={() => {
                      void handleEventCheckIn();
                    }}
                    disabled={checkingIn}
                  >
                    {checkingIn
                      ? "Checking in..."
                      : currentUserCheckIn
                        ? "Update my check-in"
                        : "Check in now"}
                  </button>
                  <span className="inline-help">
                    Location is optional and only used lightly when the browser allows it.
                  </span>
                </div>

                {selectedCheckIns.length ? (
                  <div className="people-list">
                    {selectedCheckIns.map((checkIn) => (
                      <div key={checkIn.id} className="person-row">
                        <div>
                          <strong>{getMemberLabel(checkIn.user_id)}</strong>
                          <p>{formatDateTime(checkIn.checked_in_at)}</p>
                        </div>
                        <span className="pill success">Checked in</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No one has checked in yet"
                    description="The live arrival list will appear here as members arrive."
                  />
                )}
              </div>
            ) : (
              <EmptyState
                title="No event selected"
                description="Choose an event first, then members can check in live."
              />
            )}
          </Panel>
        </div>
      </div>
    );
  }

  function renderDashboardSection() {
    const latestAnnouncements = sortedAnnouncements.slice(0, 2);
    const nextEvents = sortedEvents.filter((item) => new Date(item.starts_at) >= new Date(liveNow)).slice(0, 2);
    return <div className="section-stack dashboard-overview">
      <section className="dashboard-welcome-card"><BrandLogo compact /><p className="eyebrow">{liveDateLabel}</p><h1>{greetingMessage}</h1><p>Make room for fellowship, Scripture, and the people God has placed around you.</p><div><button type="button" className="primary-button" onClick={() => setActiveSection("bible-study")}>Continue Bible Study</button><button type="button" className="secondary-button" onClick={() => setActiveSection("events")}>Explore events</button><button type="button" className="ghost-button dashboard-notifications-button" onClick={() => setShowNotificationCenter(true)}><NavIcon name="bell" />Notifications {unreadNotifications.length ? <span className="notification-count">{unreadNotifications.length}</span> : null}</button></div></section>
      <div className="dashboard-overview-grid">
        <Panel title="Today's focus" subtitle={bibleToday ? `Today's reading · ${bibleToday.book} ${bibleToday.chapter}` : "Your shared Scripture reading plan."} action={<button type="button" className="text-button" onClick={() => setActiveSection("bible-study")}>Open Bible Study</button>}>
          <div className="dashboard-focus-reading"><span><NavIcon name="scripture" /></span><div><strong>{bibleToday ? `${bibleToday.book} ${bibleToday.chapter}` : "No reading scheduled"}</strong><p>{bibleToday ? `${bibleToday.reading_date} · ${bibleStudyTakeaways.length} community reflections` : "Visit Bible Study to see the reading plan."}</p></div></div>
          <p className="dashboard-personal-progress">Your current reading streak: <strong>{myBibleStreak} day{myBibleStreak === 1 ? "" : "s"}</strong></p>
        </Panel>
        <Panel title="Coming up" subtitle="Gather with the community." action={<button type="button" className="text-button" onClick={() => setActiveSection("events")}>All events</button>}>
          {nextEvents.length ? <div className="dashboard-compact-list">{nextEvents.map((eventRecord) => <button type="button" key={eventRecord.id} onClick={() => setActiveSection("events")}><span className="event-date-block"><strong>{new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(new Date(eventRecord.starts_at))}</strong><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(eventRecord.starts_at))}</span></span><span><strong>{eventRecord.title}</strong><small>{formatDateTime(eventRecord.starts_at)} · {eventRecord.location || "Location to be confirmed"}</small></span></button>)}</div> : <EmptyState title="No upcoming gatherings" description="New group events will appear here when scheduled." />}
        </Panel>
        <Panel title="Community updates" subtitle="A few recent notes from your group." action={<button type="button" className="text-button" onClick={() => setActiveSection("announcements")}>All announcements</button>}>
          {latestAnnouncements.length ? <div className="dashboard-announcement-list">{latestAnnouncements.map((item) => { const author = profiles.find((member) => member.id === item.created_by); return <button type="button" key={item.id} onClick={() => setActiveSection("announcements")}><span className="dashboard-announcement-author"><Avatar member={author} size="small" /></span><span><strong>{item.title}</strong><small>{author?.full_name || "Community member"} · {formatDateTime(item.created_at)}</small><p>{truncateText(item.body, 120)}</p></span></button>; })}</div> : <EmptyState title="No announcements yet" description="Updates from the community will show here." />}
        </Panel>
        <Panel title="Your activity" subtitle="A quick look at what is waiting for you.">
          <div className="dashboard-activity-summary"><div><span>Unread notifications</span><strong>{unreadNotifications.length}</strong><button type="button" className="text-button" onClick={() => setShowNotificationCenter(true)}>Review notifications</button></div><div><span>Pending tasks</span><strong>{myPendingTasks}</strong><small>Event responsibilities assigned to you</small></div></div>
          <div className="dashboard-shortcuts"><button type="button" onClick={() => setActiveSection("prayer")}><NavIcon name="prayer" />Prayer</button><button type="button" onClick={() => setActiveSection("members")}><NavIcon name="users" />Meet members</button><button type="button" onClick={() => setActiveSection("messages")}><NavIcon name="chat" />Messages</button></div>
        </Panel>
      </div>
    </div>;
  }

  function renderPlanningSection() {
    return (
      <div className="content-grid">
        <Panel
          title="Planning Ideas"
          subtitle={
            selectedEvent
              ? `Share ideas for ${selectedEvent.title}.`
              : "Select an event to start collecting ideas."
          }
        >
          {selectedEvent ? (
            <>
              <form className="stack-form" onSubmit={handleIdeaSubmit}>
                <label className="field">
                  <span>Suggested idea</span>
                  <textarea
                    value={ideaDraft}
                    onChange={(event) => setIdeaDraft(event.target.value)}
                    rows={4}
                    placeholder="What should happen at this event? Share an agenda item, activity, or improvement."
                    required
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={submitting}>
                    Suggest idea
                  </button>
                </div>
              </form>

              {selectedIdeas.length ? (
                <div className="card-list">
                  {selectedIdeas.map((idea) => {
                    const canDelete = isAdmin || idea.user_id === user.id;

                    return (
                      <article key={idea.id} className="idea-card">
                        <div className="idea-header">
                          <div>
                            <h3>{getMemberLabel(idea.user_id)}</h3>
                            <p>{formatDateTime(idea.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            className={
                              hasUserVoted(idea.id) ? "accent-button compact" : "ghost-button"
                            }
                            onClick={() => toggleIdeaVote(idea.id)}
                          >
                            {hasUserVoted(idea.id)
                              ? `Upvoted · ${getIdeaVoteCount(idea.id)}`
                              : `Upvote · ${getIdeaVoteCount(idea.id)}`}
                          </button>
                        </div>
                        <p className="idea-text">{idea.content}</p>
                        {canDelete ? (
                          <div className="inline-actions">
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() => deleteIdea(idea.id)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No suggestions yet"
                  description="The planning board starts empty so every idea here comes from your group."
                />
              )}
            </>
          ) : (
            <EmptyState
              title="No event selected"
              description="Choose an event from the dashboard to collect suggestions and upvotes."
            />
          )}
        </Panel>
      </div>
    );
  }

  function renderTaskSection() {
    const backlogTasks = selectedTasks.filter(
      (task) => task.status !== "completed" && !task.assignee_id
    );
    const inProgressTasks = selectedTasks.filter(
      (task) => task.status !== "completed" && task.assignee_id
    );
    const doneTasks = selectedTasks.filter((task) => task.status === "completed");

    return (
      <div className="content-grid">
        {isAdmin ? (
          <Panel
            title={editingTaskId ? "Edit Task" : "Assign Task"}
            subtitle={
              selectedEvent
                ? `Assign work for ${selectedEvent.title}.`
                : "Select an event before assigning responsibilities."
            }
            action={
              editingTaskId ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingTaskId("");
                    setTaskForm(emptyTaskForm);
                  }}
                >
                  Cancel edit
                </button>
              ) : null
            }
          >
            {selectedEvent ? (
              <form className="grid-form two-column" onSubmit={handleTaskSubmit}>
                <label className="field">
                  <span>Task title</span>
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Prepare venue, lead worship, bring snacks..."
                    required
                  />
                </label>

                <label className="field">
                  <span>Assign to</span>
                  <select
                    value={taskForm.assignee_id}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        assignee_id: event.target.value
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {profiles
                      .filter((member) => member.is_active)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.full_name || member.email}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field wide">
                  <span>Details</span>
                  <textarea
                    value={taskForm.details}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        details: event.target.value
                      }))
                    }
                    rows={4}
                    placeholder="Add any instructions or expectations."
                  />
                </label>

                <label className="field">
                  <span>Due date & time</span>
                  <input
                    type="datetime-local"
                    value={taskForm.due_at}
                    onChange={(event) =>
                      setTaskForm((current) => ({
                        ...current,
                        due_at: event.target.value
                      }))
                    }
                  />
                </label>

                <div className="form-actions wide">
                  <button type="submit" className="primary-button" disabled={submitting}>
                    {editingTaskId ? "Save task" : "Assign task"}
                  </button>
                </div>
              </form>
            ) : (
              <EmptyState
                title="No event selected"
                description="Pick an event to assign responsibilities to the group."
              />
            )}
          </Panel>
        ) : null}

        <Panel
          title="Task Tracker"
          subtitle={
            selectedEvent
              ? `Monitor progress for ${selectedEvent.title}.`
              : "Select an event to see its tasks."
          }
        >
          {selectedEvent ? (
            selectedTasks.length ? (
              theme === "dark" ? (
                <section className="kanban-shell" aria-label="Task board">
                  <div className="kanban-board">
                    <KanbanColumn
                      title="Backlog"
                      count={backlogTasks.length}
                      tasks={backlogTasks}
                      tone="muted"
                      isAdmin={isAdmin}
                      userId={user.id}
                      getMemberLabel={getMemberLabel}
                      formatDate={formatDate}
                      onToggle={toggleTaskStatus}
                      onEdit={beginTaskEdit}
                      onDelete={deleteTask}
                    />
                    <KanbanColumn
                      title="In progress"
                      count={inProgressTasks.length}
                      tasks={inProgressTasks}
                      tone="active"
                      isAdmin={isAdmin}
                      userId={user.id}
                      getMemberLabel={getMemberLabel}
                      formatDate={formatDate}
                      onToggle={toggleTaskStatus}
                      onEdit={beginTaskEdit}
                      onDelete={deleteTask}
                    />
                    <KanbanColumn
                      title="Done"
                      count={doneTasks.length}
                      tasks={doneTasks}
                      tone="done"
                      isAdmin={isAdmin}
                      userId={user.id}
                      getMemberLabel={getMemberLabel}
                      formatDate={formatDate}
                      onToggle={toggleTaskStatus}
                      onEdit={beginTaskEdit}
                      onDelete={deleteTask}
                    />
                  </div>
                </section>
              ) : (
                <div className="card-list">
                  {selectedTasks.map((task) => {
                    const canToggle = isAdmin || task.assignee_id === user.id;

                    return (
                      <article key={task.id} className="task-card">
                        <div className="task-header">
                          <div>
                            <h3>{task.title}</h3>
                            <p>
                              Assigned to{" "}
                              {task.assignee_id ? getMemberLabel(task.assignee_id) : "no one yet"}
                            </p>
                          </div>
                          <span
                            className={
                              task.status === "completed" ? "pill success" : "pill warning"
                            }
                          >
                            {task.status === "completed" ? "Completed" : "Pending"}
                          </span>
                        </div>

                        <p className="task-details">
                          {task.details || "No extra instructions yet."}
                        </p>

                        <div className="event-meta">
                          <span>Due {formatDate(task.due_at)}</span>
                          <span>Created by {getMemberLabel(task.created_by)}</span>
                        </div>

                        <div className="inline-actions">
                          {canToggle ? (
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => toggleTaskStatus(task)}
                            >
                              Mark as {task.status === "completed" ? "pending" : "completed"}
                            </button>
                          ) : null}
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => beginTaskEdit(task)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="ghost-button danger"
                                onClick={() => deleteTask(task.id)}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : (
              <EmptyState
                title="No tasks yet"
                description="Tasks appear here after an admin assigns responsibilities."
              />
            )
          ) : (
            <EmptyState
              title="No event selected"
              description="Use the event selector above to focus the task board."
            />
          )}
        </Panel>
      </div>
    );
  }

  function KanbanColumn({
    title,
    count,
    tasks,
    tone,
    isAdmin,
    userId,
    getMemberLabel,
    formatDate,
    onToggle,
    onEdit,
    onDelete
  }) {
    return (
      <section className={`kanban-col ${tone}`}>
        <header className="kanban-col-header">
          <div className="kanban-col-title">
            <strong>{title}</strong>
            <span className="kanban-count" aria-label={`${count} tasks`}>
              {count}
            </span>
          </div>
          <span className="kanban-col-hint">Drag-ready layout</span>
        </header>

        <div className="kanban-col-body" role="list">
          {tasks.length ? (
            tasks.map((task) => {
              const canToggle = isAdmin || task.assignee_id === userId;
              const assigneeLabel = task.assignee_id
                ? getMemberLabel(task.assignee_id)
                : "Unassigned";

              return (
                <article key={task.id} className="kanban-card" role="listitem" tabIndex={0}>
                  <div className="kanban-card-top">
                    <div className="kanban-card-title">{task.title}</div>
                    <span className="kanban-pill">{assigneeLabel}</span>
                  </div>
                  <div className="kanban-card-meta">
                    <span>Due {formatDate(task.due_at)}</span>
                    <span>Created by {getMemberLabel(task.created_by)}</span>
                  </div>
                  {task.details ? <p className="kanban-card-body">{task.details}</p> : null}

                  <div className="kanban-card-actions">
                    {canToggle ? (
                      <button type="button" className="kanban-action" onClick={() => onToggle(task)}>
                        {task.status === "completed" ? "Reopen" : "Complete"}
                      </button>
                    ) : (
                      <span className="kanban-action muted" aria-hidden="true">
                        View only
                      </span>
                    )}

                    {isAdmin ? (
                      <>
                        <button type="button" className="kanban-action" onClick={() => onEdit(task)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="kanban-action danger"
                          onClick={() => onDelete(task.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="kanban-empty">Nothing here yet.</div>
          )}
        </div>
      </section>
    );
  }

  function renderMessagesSection() {
    return (
      <div className="section-stack">
        <div className="messages-layout">
          <Panel
            title="Conversation Thread"
            subtitle={
              orderedMessages.length
                ? "A clean live thread for direct messages, replies, and group broadcasts."
                : "Your conversations will appear here in real time."
            }
          >
            {orderedMessages.length ? (
              <div className="message-thread">
                {orderedMessages.map((message) => {
                  const isOwnMessage = message.sender_id === user.id;
                  const replySource = getMessageReplySource(message);

                  return (
                    <article
                      key={message.id}
                      className={isOwnMessage ? "message-row own" : "message-row"}
                    >
                      {!isOwnMessage ? (
                        <Avatar member={getMember(message.sender_id)} size="small" />
                      ) : null}

                      <div className="message-stack">
                        <div className="message-line">
                          <strong>{isOwnMessage ? "You" : getMemberLabel(message.sender_id)}</strong>
                          <span>{formatDateTime(message.created_at)}</span>
                        </div>

                        <div
                          className={
                            isOwnMessage
                              ? "message-bubble own"
                              : message.recipient_id
                                ? "message-bubble direct"
                                : "message-bubble broadcast"
                          }
                        >
                          {replySource ? (
                            <div className="reply-preview-card">
                              <span>Replying to {getMemberLabel(replySource.sender_id)}</span>
                              <p>{truncateText(replySource.content, 120)}</p>
                            </div>
                          ) : null}

                          {message.title ? (
                            <p className="message-title">{message.title}</p>
                          ) : null}

                          <p className="message-content">{message.content}</p>
                        </div>

                        <div className="message-footer">
                          <div className="member-pills">
                            <span
                              className={
                                message.recipient_id ? "pill info" : "pill success"
                              }
                            >
                              {message.recipient_id ? "Direct message" : "Broadcast"}
                            </span>
                            <span className="pill">To {getMessageRecipientLabel(message)}</span>
                          </div>

                          <ReactionBar entityTable="messages" entityId={message.id} />

                          {canReplyToMessage(message) || canDeleteMessage(message) ? (
                            <div className="inline-actions">
                              {canReplyToMessage(message) ? (
                                <button
                                  type="button"
                                  className="ghost-button compact"
                                  onClick={() => replyToMessage(message)}
                                >
                                  Reply
                                </button>
                              ) : null}
                              {canDeleteMessage(message) ? (
                                <button
                                  type="button"
                                  className="ghost-button danger compact"
                                  onClick={() => deleteMessage(message)}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {isOwnMessage ? (
                        <Avatar member={currentMember} size="small" />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No messages yet"
                description={
                  isAdmin
                    ? "Start a conversation with a member or send a broadcast to the whole group."
                    : "When someone sends you a message, your thread will appear here beautifully."
                }
              />
            )}
          </Panel>

          <Panel
            title={replyingToMessage ? "Reply & Send" : "New Message"}
            subtitle={
              isAdmin
                ? "Send direct messages or group broadcasts from a cleaner compose area."
                : "Choose a member, write clearly, and send your note instantly."
            }
            action={
              messageForm.recipient_id ||
              messageForm.title ||
              messageForm.content ||
              replyingToMessage ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setMessageForm(emptyMessageForm);
                    setReplyingToMessageId("");
                  }}
                >
                  Clear draft
                </button>
              ) : null
            }
          >
            <div className="section-stack">
              {replyingToMessage ? (
                <div className="reply-banner">
                  <div>
                    <strong>Replying to {getMemberLabel(replyingToMessage.sender_id)}</strong>
                    <p>{truncateText(replyingToMessage.content, 140)}</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setReplyingToMessageId("")}
                  >
                    Cancel reply
                  </button>
                </div>
              ) : null}

              <form className="stack-form" onSubmit={sendMessage}>
                <label className="field">
                  <span>Send to</span>
                  <select
                    value={messageForm.recipient_id}
                    onChange={(event) =>
                      setMessageForm((current) => ({
                        ...current,
                        recipient_id: event.target.value
                      }))
                    }
                  >
                    <option value="">
                      All members (broadcast)
                    </option>
                    {messageRecipients.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={messageForm.title}
                    onChange={(event) =>
                      setMessageForm((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Short subject line"
                  />
                </label>

                <label className="field">
                  <span>Message</span>
                  <textarea
                    value={messageForm.content}
                    onChange={(event) =>
                      setMessageForm((current) => ({
                        ...current,
                        content: event.target.value
                      }))
                    }
                    rows={7}
                    placeholder="Share an encouragement, reminder, update, or thoughtful reply."
                    required
                  />
                </label>

                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={submitting}>
                    {replyingToMessage ? "Send reply" : "Send message"}
                  </button>
                  <span className="inline-help">
                    Leave recipient empty when you want to broadcast to everyone.
                  </span>
                </div>
              </form>

              <div className="quick-recipient-grid">
                {messageRecipients.length ? (
                  messageRecipients.slice(0, 8).map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="recipient-chip"
                      onClick={() => openMessageComposer(member.id, "", "")}
                    >
                      <Avatar member={member} />
                      <span>{member.full_name || member.email}</span>
                    </button>
                  ))
                ) : (
                  <div className="inline-help">
                    More members will appear here as soon as they join the workspace.
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  function renderPrayerSection() {
    return (
      <div className="content-grid">
        <Panel
          title="Prayer Wall"
          subtitle="Share prayer needs gently, anonymously if needed, and update each request as the group prays together."
        >
          <form className="stack-form" onSubmit={handlePrayerSubmit}>
            <label className="field">
              <span>Prayer title</span>
              <input
                type="text"
                value={prayerForm.title}
                onChange={(event) =>
                  setPrayerForm((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                placeholder="Healing, provision, family, exams..."
                required
              />
            </label>

            <label className="field">
              <span>Details</span>
              <textarea
                value={prayerForm.details}
                onChange={(event) =>
                  setPrayerForm((current) => ({
                    ...current,
                    details: event.target.value
                  }))
                }
                rows={5}
                placeholder="Optional context for the group."
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={prayerForm.is_anonymous}
                onChange={(event) =>
                  setPrayerForm((current) => ({
                    ...current,
                    is_anonymous: event.target.checked
                  }))
                }
              />
              <span>Share this prayer anonymously</span>
            </label>

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={submitting}>
                Share prayer point
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Shared Prayer Requests"
          subtitle="Every request updates instantly so the group can stay in step together."
        >
          {sortedPrayerPoints.length ? (
            <div className="card-list">
              {sortedPrayerPoints.map((prayerPoint) => {
                const canDelete = isAdmin || prayerPoint.created_by === user.id;
                const reminder = prayerReminders.find(
                  (item) => item.user_id === user.id && item.prayer_point_id === prayerPoint.id
                );
                return (
                  <article key={prayerPoint.id} className="idea-card prayer-card">
                    <div className="idea-header">
                      <div>
                        <h3>{prayerPoint.title}</h3>
                        <p>
                          {prayerPoint.is_anonymous
                            ? "Anonymous"
                            : getMemberLabel(prayerPoint.created_by)}
                          {" • "}
                          {formatDateTime(prayerPoint.created_at)}
                        </p>
                      </div>
                      <span
                        className={
                          prayerPoint.status === "answered"
                            ? "pill success"
                            : prayerPoint.status === "prayed"
                              ? "pill info"
                              : "pill warning"
                        }
                      >
                        {prayerPoint.status}
                      </span>
                    </div>

                    <p className="idea-text">
                      {prayerPoint.details || "No extra details shared for this prayer request."}
                    </p>

                    <ReactionBar entityTable="prayer_points" entityId={prayerPoint.id} />

                    <div className="inline-actions">
                      <button
                        type="button"
                        className={reminder ? "secondary-button" : "ghost-button"}
                        onClick={() => togglePrayerReminder(prayerPoint.id)}
                      >
                        {reminder ? "Reminder on" : "Set reminder"}
                      </button>
                      {reminder ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => markPrayerReminderPrayed(prayerPoint.id)}
                        >
                          Mark prayed today
                        </button>
                      ) : null}
                      {prayerPoint.status !== "prayed" ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => updatePrayerStatus(prayerPoint, "prayed")}
                        >
                          Mark prayed
                        </button>
                      ) : null}
                      {prayerPoint.status !== "answered" ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => updatePrayerStatus(prayerPoint, "answered")}
                        >
                          Mark answered
                        </button>
                      ) : null}
                      {prayerPoint.status !== "open" ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => updatePrayerStatus(prayerPoint, "open")}
                        >
                          Reopen
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() => deletePrayerPoint(prayerPoint.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No prayer points yet"
              description="The prayer wall begins empty and fills in as members share requests."
            />
          )}
        </Panel>
      </div>
    );
  }

  function renderResourcesSection() {
    return (
      <div className="content-grid">
        {isAdmin ? (
          <Panel
            title={editingResourceId ? "Edit Resource" : "Add Resource"}
            subtitle="Share notes, PDFs, and helpful links with the whole group."
            action={
              editingResourceId ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingResourceId("");
                    setResourceForm(emptyResourceForm);
                    setSelectedResourceFile(null);
                    setResourceFileName("");
                  }}
                >
                  Cancel edit
                </button>
              ) : null
            }
          >
            <form className="stack-form" onSubmit={handleResourceSubmit}>
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={resourceForm.title}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  placeholder="Weekly notes, study guide, PDF handout..."
                  required
                />
              </label>

              <label className="field">
                <span>Type</span>
                <select
                  value={resourceForm.resource_type}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      resource_type: event.target.value
                    }))
                  }
                >
                  <option value="note">Note</option>
                  <option value="pdf">PDF</option>
                  <option value="link">External link</option>
                </select>
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  value={resourceForm.description}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                  rows={4}
                  placeholder="Optional summary or context."
                />
              </label>

              {resourceForm.resource_type === "note" ? (
                <label className="field">
                  <span>Note content</span>
                  <textarea
                    value={resourceForm.note_content}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        note_content: event.target.value
                      }))
                    }
                    rows={8}
                    placeholder="Write the resource notes here."
                    required
                  />
                </label>
              ) : null}

              {resourceForm.resource_type === "link" ? (
                <label className="field">
                  <span>External URL</span>
                  <input
                    type="url"
                    value={resourceForm.external_url}
                    onChange={(event) =>
                      setResourceForm((current) => ({
                        ...current,
                        external_url: event.target.value
                      }))
                    }
                    placeholder="https://..."
                    required
                  />
                </label>
              ) : null}

              {resourceForm.resource_type === "pdf" ? (
                <label className="field">
                  <span>PDF file</span>
                  <input
                    ref={resourceFileInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSelectedResourceFile(file);
                      setResourceFileName(file?.name ?? "");
                    }}
                  />
                  <div className="upload-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => resourceFileInputRef.current?.click()}
                    >
                      Choose PDF
                    </button>
                    <span className="file-chip">
                      {resourceFileName || "Choose a PDF to upload to Supabase Storage"}
                    </span>
                  </div>
                </label>
              ) : null}

              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {editingResourceId ? "Save resource" : "Publish resource"}
                </button>
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel
          title="Shared Resources"
          subtitle="Notes, handouts, and links stay available from any device."
        >
          {sortedResources.length ? (
            <div className="card-list">
              {sortedResources.map((resource) => (
                <article key={resource.id} className="task-card resource-card">
                  <div className="task-header">
                    <div>
                      <h3>{resource.title}</h3>
                      <p>{formatDateTime(resource.created_at)}</p>
                    </div>
                    <span className="pill info">{resource.resource_type}</span>
                  </div>

                  <p className="task-details">
                    {resource.description ||
                      (resource.resource_type === "note"
                        ? truncateText(resource.note_content, 180)
                        : "Shared resource for the group.")}
                  </p>

                  <div className="inline-actions">
                    {resource.resource_type === "note" ? null : (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => openResource(resource)}
                      >
                        {resource.resource_type === "pdf" ? "Open PDF" : "Open link"}
                      </button>
                    )}
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => beginResourceEdit(resource)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() => deleteResource(resource)}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>

                  {resource.resource_type === "note" ? (
                    <details className="details-block">
                      <summary>Read note</summary>
                      <p className="message-content">{resource.note_content}</p>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No resources yet"
              description="Admins can upload notes, PDFs, and links for the whole group here."
            />
          )}
        </Panel>
      </div>
    );
  }

  function renderLeadershipSection() {
    return (
      <div className="content-grid">
        {isAdmin ? (
          <Panel
            title={editingLeadershipId ? "Edit Leadership Assignment" : "Assign Leader"}
            subtitle="Plan who is leading prayer sessions and Bible study fellowships."
            action={
              editingLeadershipId ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingLeadershipId("");
                    setLeadershipForm(emptyLeadershipForm);
                  }}
                >
                  Cancel edit
                </button>
              ) : null
            }
          >
            <form className="stack-form" onSubmit={handleLeadershipSubmit}>
              <label className="field">
                <span>Assignment type</span>
                <select
                  value={leadershipForm.assignment_type}
                  onChange={(event) =>
                    setLeadershipForm((current) => ({
                      ...current,
                      assignment_type: event.target.value
                    }))
                  }
                >
                  <option value="prayer_session">Prayer session</option>
                  <option value="bible_study">Bible study</option>
                </select>
              </label>

              <label className="field">
                <span>Date</span>
                <input
                  type="date"
                  value={leadershipForm.assignment_date}
                  onChange={(event) =>
                    setLeadershipForm((current) => ({
                      ...current,
                      assignment_date: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Leader</span>
                <select
                  value={leadershipForm.leader_id}
                  onChange={(event) =>
                    setLeadershipForm((current) => ({
                      ...current,
                      leader_id: event.target.value
                    }))
                  }
                  required
                >
                  <option value="">Choose a leader</option>
                  {activeMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={leadershipForm.title}
                  onChange={(event) =>
                    setLeadershipForm((current) => ({
                      ...current,
                      title: event.target.value
                    }))
                  }
                  placeholder="Theme or session title"
                />
              </label>

              <label className="field">
                <span>Notes</span>
                <textarea
                  value={leadershipForm.notes}
                  onChange={(event) =>
                    setLeadershipForm((current) => ({
                      ...current,
                      notes: event.target.value
                    }))
                  }
                  rows={4}
                  placeholder="Optional notes for the assignment."
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {editingLeadershipId ? "Save assignment" : "Assign leader"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void recommendLeader(leadershipForm.assignment_type);
                  }}
                  disabled={submitting}
                >
                  Recommend next leader
                </button>
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel
          title="Leadership Schedule"
          subtitle="Everyone can see who is leading each prayer session or Bible study."
        >
          {sortedLeadershipAssignments.length ? (
            <div className="card-list">
              {sortedLeadershipAssignments.map((assignment) => (
                <article key={assignment.id} className="task-card">
                  <div className="task-header">
                    <div>
                      <h3>{assignment.title || getMemberLabel(assignment.leader_id)}</h3>
                      <p>{assignment.assignment_date}</p>
                    </div>
                    <span className="pill info">
                      {assignment.assignment_type === "bible_study"
                        ? "Bible study"
                        : "Prayer session"}
                    </span>
                  </div>

                  <p className="task-details">
                    Led by {getMemberLabel(assignment.leader_id)}
                    {assignment.notes ? ` • ${assignment.notes}` : ""}
                  </p>

                  {isAdmin ? (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => beginLeadershipEdit(assignment)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger"
                        onClick={() => deleteLeadershipAssignment(assignment.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No leadership assignments yet"
              description="Admins can schedule leaders here for prayer sessions and Bible studies."
            />
          )}
        </Panel>
      </div>
    );
  }

  function renderAssignmentsSection() {
    const visibleClasses = discipleshipClasses.filter((classItem) => {
      if (isAdmin || classItem.leader_id === user?.id) return true;
      if (classItem.status !== "draft") return true;
      return discipleshipEnrollments.some(
        (row) => row.class_id === classItem.id && row.user_id === user?.id && row.status === "approved"
      );
    });
    const selectedClass =
      visibleClasses.find((classItem) => classItem.id === selectedAssignmentClassId) ?? visibleClasses[0] ?? null;
    const isApprovedEnrolled = Boolean(selectedClass && discipleshipEnrollments.some(
      (row) => row.class_id === selectedClass.id && row.user_id === user?.id && row.status === "approved"
    ));
    const manageMode = Boolean(selectedClass && (isAdmin || selectedClass.leader_id === user?.id));

    return (
      <div className="page-stack assignments-page">
        <div className="page-intro">
          <div>
            <p className="eyebrow">Learning together</p>
            <h1>Assignments</h1>
            <p>Review class work, submit your assignments, and follow feedback from your class leader.</p>
          </div>
          {visibleClasses.length > 1 ? (
            <label className="field assignments-class-picker">
              <span>Class</span>
              <select value={selectedClass?.id ?? ""} onChange={(event) => setSelectedAssignmentClassId(event.target.value)}>
                {visibleClasses.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.title}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {selectedClass && !manageMode && !isApprovedEnrolled ? (
          <Panel title={selectedClass.title} subtitle={selectedClass.description || "Class details and enrollment."}>
            {(() => {
              const enrollment = discipleshipEnrollments.find((row) => row.class_id === selectedClass.id && row.user_id === user?.id);
              const canJoin = selectedClass.status !== "draft" && (!selectedClass.ends_at || new Date(selectedClass.ends_at) >= new Date(liveNow));
              return <div className="assignment-enrollment-card">
                {selectedClass.starts_at ? <p><strong>Starts:</strong> {formatDateTime(selectedClass.starts_at)}</p> : null}
                {selectedClass.leader_id ? <p><strong>Class leader:</strong> {getMemberLabel(selectedClass.leader_id)}</p> : null}
                {enrollment?.status === "pending" ? <p className="pill warning">Enrollment request pending</p> : null}
                {canJoin && !enrollment ? <button type="button" className="primary-button" disabled={submitting} onClick={() => void runAction(async () => {
                  const status = selectedClass.requires_approval ? "pending" : "approved";
                  const now = new Date().toISOString();
                  const { error } = await supabase.from("discipleship_enrollments").upsert({
                    class_id: selectedClass.id,
                    user_id: user.id,
                    status,
                    enrolled_at: now,
                    ...(status === "approved" ? { approved_by: user.id, approved_at: now } : {})
                  }, { onConflict: "class_id,user_id" });
                  if (error) throw error;
                }, selectedClass.requires_approval ? "Enrollment request sent." : "You joined the class.")}>{selectedClass.requires_approval ? "Request to join" : "Join class"}</button> : null}
              </div>;
            })()}
          </Panel>
        ) : selectedClass ? (
          <DiscipleshipAssignments
            user={user}
            profiles={profiles}
            selectedClass={selectedClass}
            lessons={discipleshipLessons}
            submissions={discipleshipAssignmentSubmissions}
            submissionHistory={discipleshipSubmissionHistory}
            enrollments={discipleshipEnrollments}
            runAction={runAction}
            submitting={submitting}
            manageMode={manageMode}
            isApprovedEnrolled={isApprovedEnrolled}
            liveNow={liveNow}
          />
        ) : (
          <Panel title="No class assignments yet" subtitle="Assignments appear here when you are enrolled in a class or lead one.">
            <EmptyState title="Nothing to work on yet" description="Your class assignments and feedback will be available here once a class is active." />
          </Panel>
        )}
        <div className="assignments-leadership-schedule">
          <h2>Leader schedule</h2>
          {renderLeadershipSection()}
        </div>
      </div>
    );
  }

  function formatCountdown(targetDate) {
    if (!targetDate) {
      return "";
    }

    const diffMs = Math.max(0, targetDate.getTime() - liveNow.getTime());
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function getVirtualMeetingEnd(meeting) {
    const start = new Date(meeting.starts_at);

    if (meeting.ends_at) {
      return new Date(meeting.ends_at);
    }

    return new Date(start.getTime() + 60 * 60 * 1000);
  }

  function getVirtualMeetingStatus(meeting) {
    const start = new Date(meeting.starts_at);
    const end = getVirtualMeetingEnd(meeting);

    if (liveNow < start) {
      return "upcoming";
    }

    if (liveNow <= end) {
      return "live";
    }

    return "ended";
  }

  function canJoinVirtualMeeting(meeting) {
    const start = new Date(meeting.starts_at);
    const end = getVirtualMeetingEnd(meeting);
    const joinOpensAt = new Date(start.getTime() - 10 * 60 * 1000);
    const joinClosesAt = new Date(end.getTime() + 15 * 60 * 1000);

    return liveNow >= joinOpensAt && liveNow <= joinClosesAt;
  }

  const reactionMeta = [
    { reaction: "like", emoji: "👍", label: "Like" },
    { reaction: "pray", emoji: "🙏", label: "Pray" },
    { reaction: "love", emoji: "❤️", label: "Love" }
  ];

  function getReactionStats(entityTable, entityId) {
    const rows = reactions.filter(
      (row) => row.entity_table === entityTable && row.entity_id === entityId
    );

    const stats = {
      total: rows.length,
      byType: rows.reduce((acc, row) => {
        acc[row.reaction] = (acc[row.reaction] ?? 0) + 1;
        return acc;
      }, {})
    };

    return { rows, stats };
  }

  async function toggleReaction({ entityTable, entityId, reaction }) {
    if (!supabase || !user?.id) {
      return;
    }

    const existing = reactions.find(
      (row) =>
        row.entity_table === entityTable &&
        row.entity_id === entityId &&
        row.reaction === reaction &&
        row.user_id === user.id
    );

    setSubmitting(true);
    clearFeedback();

    try {
      if (existing) {
        const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("reactions").insert([
          {
            user_id: user.id,
            entity_table: entityTable,
            entity_id: entityId,
            reaction
          }
        ]);
        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function isOptimisticReactionId(id) {
    return String(id).startsWith("optimistic-");
  }

  async function deleteAnnouncementReactionRow({ entityTable, entityId, reaction, row }) {
    if (isOptimisticReactionId(row?.id)) {
      return supabase
        .from("reactions")
        .delete()
        .eq("entity_table", entityTable)
        .eq("entity_id", entityId)
        .eq("user_id", user.id)
        .eq("reaction", reaction);
    }

    return supabase.from("reactions").delete().eq("id", row.id);
  }

  async function toggleAnnouncementReaction({ entityTable = "announcements", entityId, announcementId, reaction }) {
    if (!supabase || !user?.id) {
      return false;
    }

    const targetId = entityId ?? announcementId;
    if (!targetId) return false;

    const userRows = reactions.filter(
      (row) =>
        row.entity_table === entityTable &&
        row.entity_id === targetId &&
        row.user_id === user.id
    );
    const existingSame = userRows.find((row) => row.reaction === reaction);
    const previousReactions = reactions;
    const optimisticId = `optimistic-${entityTable}-${targetId}-${reaction}`;

    let nextReactions = reactions;

    if (existingSame) {
      nextReactions = reactions.filter((row) => row.id !== existingSame.id);
    } else {
      nextReactions = [
        {
          id: optimisticId,
          user_id: user.id,
          entity_table: entityTable,
          entity_id: targetId,
          reaction,
          created_at: new Date().toISOString()
        },
        ...reactions.filter(
          (row) =>
            !(
              row.entity_table === entityTable &&
              row.entity_id === targetId &&
              row.user_id === user.id
            )
        )
      ];
    }

    setReactions(nextReactions);

    try {
      if (existingSame) {
        const { error } = await deleteAnnouncementReactionRow({
          entityTable,
          entityId: targetId,
          reaction,
          row: existingSame
        });

        if (error) {
          throw error;
        }
      } else {
        if (userRows.length) {
          const { error: deleteError } = await supabase
            .from("reactions")
            .delete()
            .eq("entity_table", entityTable)
            .eq("entity_id", targetId)
            .eq("user_id", user.id);

          if (deleteError) {
            throw deleteError;
          }
        }

        const { data: insertedRow, error } = await supabase
          .from("reactions")
          .insert([
            {
              user_id: user.id,
              entity_table: entityTable,
              entity_id: targetId,
              reaction
            }
          ])
          .select()
          .single();

        if (error) {
          throw error;
        }

        if (insertedRow) {
          setReactions((current) =>
            current.map((row) => (row.id === optimisticId ? insertedRow : row))
          );
        }
      }

      return true;
    } catch (error) {
      setReactions(previousReactions);
      setErrorMessage(error.message);
      return false;
    }
  }

  function ReactionBar({ entityTable, entityId }) {
    const { stats } = getReactionStats(entityTable, entityId);

    return (
      <div className="reaction-bar" role="group" aria-label="Quick reactions">
        {reactionMeta.map((item) => {
          const count = stats.byType[item.reaction] ?? 0;
          const isSelected = reactions.some(
            (row) =>
              row.entity_table === entityTable &&
              row.entity_id === entityId &&
              row.reaction === item.reaction &&
              row.user_id === user.id
          );

          return (
            <button
              key={item.reaction}
              type="button"
              className={isSelected ? "reaction-chip active" : "reaction-chip"}
              onClick={() =>
                toggleReaction({
                  entityTable,
                  entityId,
                  reaction: item.reaction
                })
              }
              disabled={submitting}
              aria-pressed={isSelected}
              title={item.label}
            >
              <span className="reaction-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="reaction-count">{count}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function resetMeetingComposer() {
    setEditingMeetingId("");
    setMeetingForm(emptyMeetingForm);
  }

  function beginMeetingEdit(meeting) {
    setEditingMeetingId(meeting.id);
    setMeetingForm({
      title: meeting.title ?? "",
      description: meeting.description ?? "",
      meet_url: meeting.meet_url ?? "",
      starts_at: toLocalDateTimeInput(meeting.starts_at),
      ends_at: meeting.ends_at ? toLocalDateTimeInput(meeting.ends_at) : "",
      leader_id: meeting.leader_id ?? ""
    });
    setActiveSection("meetings");
  }

  async function handleMeetingSubmit(event) {
    event.preventDefault();

    const payload = {
      title: meetingForm.title.trim(),
      description: meetingForm.description.trim(),
      meet_url: meetingForm.meet_url.trim(),
      starts_at: toIsoString(meetingForm.starts_at),
      ends_at: toIsoString(meetingForm.ends_at),
      leader_id: meetingForm.leader_id || null
    };

    await runAction(async () => {
      if (!payload.starts_at) {
        throw new Error("Please choose a start date & time.");
      }

      if (!payload.meet_url) {
        throw new Error("Please paste the Google Meet link.");
      }

      if (editingMeetingId) {
        const { error } = await supabase
          .from("virtual_meetings")
          .update(payload)
          .eq("id", editingMeetingId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from("virtual_meetings")
          .insert([{ ...payload, created_by: user.id }]);

        if (error) {
          throw error;
        }
      }

      resetMeetingComposer();
    }, editingMeetingId ? "Meeting updated." : "Meeting scheduled.");
  }

  async function deleteMeeting(meetingId) {
    await runAction(async () => {
      const { error } = await supabase.from("virtual_meetings").delete().eq("id", meetingId);

      if (error) {
        throw error;
      }

      if (editingMeetingId === meetingId) {
        resetMeetingComposer();
      }
    }, "Meeting deleted.");
  }

  async function joinMeeting(meeting) {
    if (!meeting?.meet_url) {
      setErrorMessage("This meeting does not have a Google Meet link yet.");
      return;
    }

    setSubmitting(true);
    clearFeedback();

    try {
      const { error } = await supabase.from("virtual_meeting_attendance").upsert(
        [
          {
            meeting_id: meeting.id,
            user_id: user.id,
            joined_at: new Date().toISOString()
          }
        ],
        { onConflict: "meeting_id,user_id" }
      );

      if (error) {
        throw error;
      }
    } catch (error) {
      setErrorMessage(error.message);
      return;
    } finally {
      setSubmitting(false);
    }

    window.location.assign(meeting.meet_url);
  }

  function renderMeetingsSection() {
    const sortedMeetings = [...virtualMeetings].sort(
      (left, right) => new Date(left.starts_at) - new Date(right.starts_at)
    );
    const liveMeeting = sortedMeetings.find(
      (meeting) => getVirtualMeetingStatus(meeting) === "live" && canJoinVirtualMeeting(meeting)
    );
    const onlineMembers = activeMembers.filter((member) => onlineMemberIds.has(member.id));

    const icebreakers = [
      { type: "question", text: "What’s one thing you’re grateful for today?" },
      { type: "question", text: "What’s one prayer request you’re comfortable sharing?" },
      { type: "question", text: "What’s one highlight from your week so far?" },
      { type: "question", text: "What’s one thing God has been teaching you recently?" },
      { type: "activity", text: "30-second round: share your name + one word for how you’re feeling." },
      { type: "activity", text: "Two minutes of silent prayer, then one sentence each: what stood out?" },
      { type: "activity", text: "Pick one member to encourage in one sentence (keep it short)." }
    ];

    const pickIcebreaker = () => {
      const next = icebreakers[Math.floor(Math.random() * icebreakers.length)];
      setIcebreaker(next);
    };

    return (
      <div className="section-stack">
        {liveMeeting ? (
          <div className="live-now-banner">
            <div>
              <span className="live-dot" aria-hidden="true" />
              <strong>Live meeting now</strong>
              <span className="muted-text">{liveMeeting.title}</span>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => joinMeeting(liveMeeting)}
              disabled={submitting}
            >
              Join now
            </button>
          </div>
        ) : null}

        <Panel
          title="Online now"
          subtitle="Presence updates live while members keep the app open."
        >
          {onlineMembers.length ? (
            <div className="avatar-stack-row">
              <div className="avatar-stack">
                {onlineMembers.slice(0, 12).map((member) => (
                  <div key={member.id} className="avatar-online" title={member.full_name || member.email}>
                    <Avatar member={member} size="small" />
                    <span className="online-dot" aria-hidden="true" />
                  </div>
                ))}
              </div>
              <span className="pill success">{onlineMembers.length} online</span>
            </div>
          ) : (
            <div className="inline-help">No one is online right now.</div>
          )}
        </Panel>

        {liveMeeting ? (
          <Panel
            title="Icebreaker (Live)"
            subtitle="A single prompt to keep the meeting warm and engaging."
            action={
              <button type="button" className="ghost-button" onClick={pickIcebreaker} disabled={submitting}>
                Generate
              </button>
            }
          >
            <div className="icebreaker-card">
              <div className="pill info">
                {icebreaker
                  ? icebreaker.type === "activity"
                    ? "Activity"
                    : "Question"
                  : "Icebreaker"}
              </div>
              <h3>{icebreaker?.text || "Tap Generate for a quick icebreaker prompt."}</h3>
              {icebreaker ? (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      navigator?.clipboard?.writeText?.(icebreaker.text);
                      setStatusMessage("Icebreaker copied.");
                    }}
                  >
                    Copy
                  </button>
                  <button type="button" className="ghost-button" onClick={pickIcebreaker}>
                    Another one
                  </button>
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}

        {isAdmin ? (
          <Panel
            title={editingMeetingId ? "Edit virtual meeting" : "Schedule a virtual meeting"}
            subtitle="Paste a Google Meet link, pick a leader, and everyone will see it in real time."
          >
            <form className="form-grid" onSubmit={handleMeetingSubmit}>
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={meetingForm.title}
                  onChange={(event) =>
                    setMeetingForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Weekly check-in"
                  required
                />
              </label>

              <label className="field">
                <span>Date & time</span>
                <input
                  type="datetime-local"
                  value={meetingForm.starts_at}
                  onChange={(event) =>
                    setMeetingForm((current) => ({ ...current, starts_at: event.target.value }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>Ends at (optional)</span>
                <input
                  type="datetime-local"
                  value={meetingForm.ends_at}
                  onChange={(event) =>
                    setMeetingForm((current) => ({ ...current, ends_at: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span>Google Meet link</span>
                <input
                  type="url"
                  value={meetingForm.meet_url}
                  onChange={(event) =>
                    setMeetingForm((current) => ({ ...current, meet_url: event.target.value }))
                  }
                  placeholder="https://meet.google.com/xxx-yyyy-zzz"
                  required
                />
              </label>

              <label className="field">
                <span>Leader / host</span>
                <select
                  value={meetingForm.leader_id}
                  onChange={(event) =>
                    setMeetingForm((current) => ({ ...current, leader_id: event.target.value }))
                  }
                >
                  <option value="">Unassigned</option>
                  {activeMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  value={meetingForm.description}
                  onChange={(event) =>
                    setMeetingForm((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={4}
                  placeholder="Agenda, prayer points, discussion theme…"
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {editingMeetingId ? "Save meeting" : "Schedule meeting"}
                </button>
                {editingMeetingId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={resetMeetingComposer}
                    disabled={submitting}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel
          title="Virtual Meetings"
          subtitle="Join scheduled Google Meet sessions with one click. The Join button activates 10 minutes before start."
        >
          {sortedMeetings.length ? (
            <div className="card-list">
              {sortedMeetings.map((meeting) => {
                const status = getVirtualMeetingStatus(meeting);
                const leaderLabel = meeting.leader_id ? getMemberLabel(meeting.leader_id) : "TBD";
                const attendeeRows = virtualMeetingAttendance.filter(
                  (row) => row.meeting_id === meeting.id
                );
                const hasJoined = attendeeRows.some((row) => row.user_id === user.id);
                const joinEnabled = canJoinVirtualMeeting(meeting);
                const startDate = new Date(meeting.starts_at);

                const statusPillClass =
                  status === "live"
                    ? "pill success"
                    : status === "ended"
                      ? "pill"
                      : "pill warning";

                return (
                  <article key={meeting.id} className="task-card">
                    <div className="task-header">
                      <div>
                        <h3>{meeting.title}</h3>
                        <p>{formatDateTime(meeting.starts_at)}</p>
                      </div>
                      <span className={statusPillClass}>
                        {status === "live" ? "Live" : status === "ended" ? "Ended" : "Upcoming"}
                      </span>
                    </div>

                    <p className="task-details">
                      Leader: {leaderLabel}
                      {meeting.description ? ` • ${truncateText(meeting.description, 140)}` : ""}
                    </p>

                    {status === "upcoming" ? (
                      <div className="inline-help">
                        Starts in <strong>{formatCountdown(startDate)}</strong>
                      </div>
                    ) : null}

                    <ReactionBar entityTable="virtual_meetings" entityId={meeting.id} />

                    <div className="inline-actions">
                      <button
                        type="button"
                        className={joinEnabled ? "primary-button" : "secondary-button"}
                        onClick={() => joinMeeting(meeting)}
                        disabled={submitting || !joinEnabled}
                        title={
                          joinEnabled
                            ? "Join the Google Meet session"
                            : "Join opens 10 minutes before start"
                        }
                      >
                        {hasJoined ? "Re-join meeting" : "Join meeting"}
                      </button>

                      <span className="pill info">{attendeeRows.length} joined</span>

                      {isAdmin ? (
                        <>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => beginMeetingEdit(meeting)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => deleteMeeting(meeting.id)}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>

                    {attendeeRows.length ? (
                      <div className="inline-help">
                        {attendeeRows
                          .slice(0, 6)
                          .map((row) => getMemberLabel(row.user_id))
                          .join(", ")}
                        {attendeeRows.length > 6 ? "…" : ""}
                      </div>
                    ) : (
                      <div className="inline-help">No one has joined yet.</div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No virtual meetings scheduled"
              description={isAdmin ? "Schedule your first meeting above." : "Check back soon."}
            />
          )}
        </Panel>
      </div>
    );
  }

  function renderMembersSection() {
    const visibleMembers = profiles.filter((member) => {
      if (!isAdmin && !member.is_active) return false;
      if (memberStatusFilter === "active" && !member.is_active) return false;
      if (memberStatusFilter === "paused" && member.is_active) return false;
      const query = memberSearch.trim().toLowerCase();
      return !query || [member.full_name, member.email, member.role].some((value) => value?.toLowerCase().includes(query));
    });
    return (
      <div className="section-stack">
        <header className="page-intro"><div><p className="eyebrow">Our community</p><h1>Members</h1><p>{activeMembers.length} active member{activeMembers.length === 1 ? "" : "s"} in Glory Carriers.</p></div></header>
        {isAdmin ? (
          <div className="member-overview-grid">
            <StatCard
              label="Admins"
              value={adminCount}
              caption="Admins can promote members, manage access, and delete accounts."
            />
            <StatCard
              label="Members"
              value={memberUserCount}
              caption="Regular members can collaborate, RSVP, message, and suggest ideas."
              accent="orange"
            />
            <StatCard
              label="Active Accounts"
              value={activeMembers.length}
              caption="These accounts can currently access the workspace."
            />
            <StatCard
              label="Paused Accounts"
              value={pausedMembersCount}
              caption="Paused users stay in the system until you restore or delete them."
              accent="orange"
            />
          </div>
        ) : null}

        <Panel
          title={isAdmin ? "Member Management" : "Members"}
          subtitle={
            isAdmin
              ? "Promote members to admin, pause access, delete users, or message people from one clean control center."
              : "See who is part of the planning space and start a conversation with any active member."
          }
        >
          <div className="member-directory-controls"><label className="field"><span>Search members</span><input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Name, email, or role" /></label>{isAdmin ? <label className="field"><span>Account status</span><select value={memberStatusFilter} onChange={(event) => setMemberStatusFilter(event.target.value)}><option value="all">All accounts</option><option value="active">Active</option><option value="paused">Paused</option></select></label> : null}<span className="inline-help">{visibleMembers.length} shown</span></div>
          {visibleMembers.length ? (
            <div className="members-grid">
              {visibleMembers.map((member) => (
                <article key={member.id} className="member-card">
                  <div className="member-card-top">
                    <div className="member-summary">
                      <Avatar member={member} />
                      <div>
                        <strong>{member.full_name || "Unnamed member"}</strong>
                        <p>{member.email}</p>
                      </div>
                    </div>
                    <div className="member-pills">
                      <span className={member.role === "admin" ? "pill info" : "pill"}>
                        {member.role}
                      </span>
                      <span
                        className={
                          onlineMemberIds.has(member.id) ? "pill success" : "pill warning"
                        }
                      >
                        {onlineMemberIds.has(member.id) ? "Online" : "Offline"}
                      </span>
                      <span
                        className={member.is_active ? "pill success" : "pill warning"}
                      >
                        {member.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                  </div>

                  {!onlineMemberIds.has(member.id) ? (
                    <p className="member-last-seen">
                      Last seen{" "}
                      {member.last_seen_at ? formatDateTime(member.last_seen_at) : "unknown"}
                    </p>
                  ) : null}

                  <p className="member-note">
                    {member.id === user.id
                      ? "This is your account profile."
                      : member.role === "admin"
                        ? "This account already has admin privileges and can manage the workspace."
                        : "This member can collaborate normally and can be promoted by an admin."}
                  </p>

                  <div className="member-actions">
                    {member.id !== user.id && member.is_active ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => openMessageComposer(member.id, "", "")}
                      >
                        Message
                      </button>
                    ) : null}

                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          className={member.role === "admin" ? "secondary-button" : "primary-button"}
                          onClick={() =>
                            changeRole(member.id, member.role === "admin" ? "user" : "admin")
                          }
                        >
                          {member.role === "admin" ? "Set as member" : "Promote to admin"}
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => toggleMemberAccess(member.id, !member.is_active)}
                        >
                          {member.is_active ? "Pause access" : "Restore access"}
                        </button>

                        {member.id !== user.id ? (
                          <button
                            type="button"
                            className="ghost-button danger"
                            onClick={() => deleteUser(member.id)}
                          >
                            Delete user
                          </button>
                        ) : (
                          <span className="inline-help">
                            Your own account cannot be deleted here.
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={memberSearch || memberStatusFilter !== "all" ? "No matching members" : "No members yet"}
              description={memberSearch || memberStatusFilter !== "all" ? "Try another name or account status." : "User accounts will appear here after people sign up."}
            />
          )}

          {isAdmin ? (
            <p className="inline-help member-footnote">
              Account deletion, role promotion, and access control all apply instantly
              through realtime updates.
            </p>
          ) : null}
        </Panel>
      </div>
    );
  }

  function renderSettingsSection() {
    return (
      <div className="section-stack">
        <div className="content-grid">
          <Panel
            title="Profile Settings"
            subtitle="Keep your name, photo, and profile details up to date."
          >
            <div className="profile-panel">
              <div className="profile-hero settings-hero-card">
                <Avatar member={currentMember} size="large" />
                <div>
                  <h3>{currentMember?.full_name || "Unnamed member"}</h3>
                  <p>{currentMember?.email || user.email}</p>
                  <div className="member-pills">
                    <span className={isAdmin ? "pill info" : "pill"}>
                      {isAdmin ? "Admin account" : "Member account"}
                    </span>
                    <span className="pill success">{liveTimeLabel}</span>
                  </div>
                </div>
              </div>

              <form className="stack-form" onSubmit={saveProfileDetails}>
                <label className="field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        full_name: event.target.value
                      }))
                    }
                    placeholder="How your name should appear"
                    required
                  />
                </label>

                <label className="field">
                  <span>Profile picture</span>
                  <input
                    ref={avatarInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                  <div className="upload-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? "Uploading..." : "Choose image"}
                    </button>
                    <span className="file-chip">
                      {avatarFileName || "PNG, JPG, WEBP, or GIF up to 1MB"}
                    </span>
                  </div>
                </label>

                <label className="field">
                  <span>Profile picture URL</span>
                  <input
                    type="url"
                    value={profileForm.avatar_url}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        avatar_url: event.target.value
                      }))
                    }
                    placeholder="Optional public image URL"
                  />
                </label>

                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={submitting}>
                    Save profile
                  </button>
                  <span className="inline-help">
                    {uploadingAvatar
                      ? "Uploading avatar..."
                      : "Image uploads use the Supabase avatars bucket."}
                  </span>
                </div>
              </form>
            </div>
          </Panel>

          <Panel
            title="Security & Appearance"
            subtitle="Manage your password, theme, and account view from one place."
          >
            <div className="section-stack">
              <div className="settings-grid">
                <div className="setting-tile">
                  <span>Signed in as</span>
                  <strong>{currentMember?.email || user.email}</strong>
                  <p>
                    Your account stays synced in Supabase so you can sign in from any
                    device.
                  </p>
                </div>

                <div className="setting-tile">
                  <span>Theme</span>
                  <strong>{theme === "light" ? "Light mode" : "Dark mode"}</strong>
                  <p>Blue and orange stay consistent while the workspace adapts.</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setTheme((current) => (current === "light" ? "dark" : "light"))
                    }
                  >
                    {theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                  </button>
                </div>

                <NotificationPreferences
                  preferences={notificationPreferences}
                  pushSupported={isPushSupported()}
                  pushPermission={notificationPermission}
                  deviceCount={pushDeviceCount}
                  onChange={updateNotificationPreference}
                  onEnablePush={() => {
                    void enableNotifications();
                  }}
                  onDisablePush={() => {
                    void disablePushNotifications();
                  }}
                  saving={savingNotificationPreferences}
                />
              </div>

              <form className="stack-form profile-password-form" onSubmit={changeMyPassword}>
                <label className="field">
                  <span>New password</span>
                  <input
                    type="password"
                    value={passwordForm.password}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        password: event.target.value
                      }))
                    }
                    placeholder="At least 6 characters"
                    minLength={6}
                    required
                  />
                </label>

                <label className="field">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value
                      }))
                    }
                    placeholder="Re-enter the new password"
                    minLength={6}
                    required
                  />
                </label>

                <div className="form-actions">
                  <button type="submit" className="secondary-button" disabled={submitting}>
                    Update password
                  </button>
                </div>
              </form>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const selfManagedSections = new Set(["management", "bible-study"]);
  const isManagementSection = activeSection === "management";
  const deferSectionForGlobalLoad = loading && !selfManagedSections.has(activeSection);
  const showDashboardChrome = activeSection !== "dashboard" && !selfManagedSections.has(activeSection);

  const sectionContent = deferSectionForGlobalLoad ? null : activeSection === "dashboard"
    ? renderDashboardSection()
    : activeSection === "announcements"
      ? renderAnnouncementsSection()
      : activeSection === "events"
        ? renderEventsDirectorySection()
      : activeSection === "prayer"
        ? renderPrayerSection()
          : activeSection === "resources"
            ? renderResourcesSection()
            : activeSection === "bible-study"
              ? <BibleStudySection user={user} profile={profile} profiles={profiles} isAdmin={isAdmin} />
            : activeSection === "assignments"
              ? renderAssignmentsSection()
              : activeSection === "meetings"
                ? renderMeetingsSection()
              : activeSection === "messages"
                ? renderMessagesSection()
                : activeSection === "members"
                  ? renderMembersSection()
                  : activeSection === "management"
                    ? (
                      isAdmin ? <CellGroupManagementSection
                        user={user}
                        isAdmin={isAdmin}
                        profiles={profiles}
                        onNavigateSection={setActiveSection}
                      />
                      : <EmptyState title="Access restricted" description="This control center is available to authorized administrators." />
                    )
                  : activeSection === "settings"
                    ? renderSettingsSection()
                    : null;

  return (
    <div className="app-shell">
      <SidebarNav
        sections={navSections}
        activeSection={activeSection}
        onSelect={setActiveSection}
        theme={theme}
        onThemeToggle={() =>
          setTheme((current) => (current === "light" ? "dark" : "light"))
        }
        roleLabel={isAdmin ? "Admin access" : "Member access"}
        currentMember={currentMember}
        unreadCount={unreadNotifications.length}
        onOpenNotifications={() => setShowNotificationCenter(true)}
        onSignOut={() => signOut()}
      />

      <main className={`main-content${isManagementSection ? " main-content--management" : ""}`}>
        <header className="mobile-app-header">
          <BrandLogo compact />
          <span className="mobile-app-page-title">{activeSectionLabel}</span>
          <button ref={mobileMenuTriggerRef} type="button" className={"mobile-app-menu-trigger" + (mobileMenuOpen || !quickNavigationIds.includes(activeSection) ? " active" : "")} aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation-drawer" onClick={() => setMobileMenuOpen((open) => !open)}>
            <NavIcon name="menu" />
          </button>
          <button type="button" className="mobile-app-icon-button" aria-label={`Notifications${unreadNotifications.length ? `, ${unreadNotifications.length} unread` : ""}`} onClick={() => setShowNotificationCenter(true)}>
            <NavIcon name="bell" />{unreadNotifications.length ? <span>{unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}</span> : null}
          </button>
          <div className="mobile-account-menu-wrap" ref={mobileAccountMenuRef}>
            <button type="button" className="mobile-profile-button" aria-label="Open profile menu" aria-expanded={mobileAccountOpen} aria-haspopup="menu" onClick={() => setMobileAccountOpen((open) => !open)}><Avatar member={currentMember} size="small" /></button>
            {mobileAccountOpen ? <div className="mobile-profile-menu" role="menu" aria-label="Profile menu">
              <strong>{currentMember?.full_name || "Member"}</strong><small>{isAdmin ? "Admin access" : "Member access"}</small>
              <button type="button" role="menuitem" onClick={() => { setActiveSection("settings"); setMobileAccountOpen(false); }}>Profile &amp; settings</button>
              {notificationPermission !== "granted" && notificationPermission !== "unsupported" && isPushSupported() ? <button type="button" role="menuitem" onClick={() => { setShowPushPrompt(true); setMobileAccountOpen(false); }}>Enable notifications</button> : null}
              <button type="button" role="menuitem" onClick={() => { setTheme((current) => current === "light" ? "dark" : "light"); setMobileAccountOpen(false); }}>{theme === "light" ? "Switch to dark theme" : "Switch to light theme"}</button>
              <button type="button" role="menuitem" onClick={() => { setMobileAccountOpen(false); void signOut(); }}>Sign out</button>
            </div> : null}
          </div>
        </header>
        {showDashboardChrome ? <header className="topbar">
          <div className="mobile-brand"><BrandLogo compact /></div>
          <div className="topbar-hero">
            <div className="avatar-orb">
              <Avatar member={currentMember} size="large" />
              <span className="presence-dot" aria-hidden="true" />
            </div>

            <div className="topbar-copy">
              <p className="eyebrow">{activeSectionLabel}</p>
                <h2>
                {greetingMessage}
              </h2>
              <p className="muted-text">
                Welcome back! Let&apos;s plan something meaningful together.
              </p>

              <div className="welcome-chip-row">
                <span className="pill">{activeSectionLabel}</span>
                <span className={isAdmin ? "pill info" : "pill"}>
                  {isAdmin ? "Admin access" : "Member access"}
                </span>
                <span className="pill">{activeMembers.length} active members</span>
                <span className="pill">{messages.length} live messages</span>
                <span
                  className={
                    notificationPermission === "granted" ? "pill success" : "pill warning"
                  }
                >
                  {notificationPermission === "granted"
                    ? "Alerts on"
                    : "In-app alerts only"}
                </span>
              </div>
            </div>
          </div>

          <div className="topbar-side">
            <div className="time-card">
              <span>Local time</span>
              <strong>{liveTimeLabel}</strong>
              <p>{liveDateLabel}</p>
              <small>24-hour clock</small>
            </div>

            <div className="topbar-actions">
              <button
                type="button"
                className="ghost-button mobile-only"
                onClick={() => setMobileMenuOpen(true)}
              >
                <span className="sidebar-link-icon" aria-hidden="true">
                  <NavIcon name="menu" />
                </span>
                <span>Menu</span>
              </button>

              <div className="notification-shell" ref={notificationTrayRef}>
                <button
                  type="button"
                  className="ghost-button notification-bell"
                  onClick={() => setShowNotificationCenter(true)}
                >
                  <span className="sidebar-link-icon" aria-hidden="true">
                    <NavIcon name="bell" />
                  </span>
                  <span>Alerts</span>
                  {unreadNotifications.length ? (
                    <span className="notification-count">{unreadNotifications.length}</span>
                  ) : null}
                </button>
              </div>

              {notificationPermission !== "granted" &&
              notificationPermission !== "unsupported" &&
              isPushSupported() ? (
                <button
                  type="button"
                  className="accent-button"
                  onClick={() => setShowPushPrompt(true)}
                >
                  Enable push
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-button mobile-only"
                onClick={() =>
                  setTheme((current) => (current === "light" ? "dark" : "light"))
                }
              >
                {theme === "light" ? "Dark mode" : "Light mode"}
              </button>
              <button
                type="button"
                className="ghost-button mobile-only"
                onClick={() => signOut()}
              >
                Sign out
              </button>
            </div>
          </div>
        </header> : null}

        {toastNotifications.length ? (
          <div className="toast-stack" aria-live="polite" aria-atomic="false">
            {toastNotifications.map((notification) => (
              <article
                key={notification.id}
                className={`toast-card ${notification.tone || "info"}`}
              >
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                </div>
                <button
                  type="button"
                  className="ghost-button compact"
                  onClick={() => dismissToastNotification(notification.id)}
                >
                  Dismiss
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
        {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
        {authNotice ? (
          <div className="banner success">
            {authNotice}
            <button type="button" className="text-button inline-text-button" onClick={clearAuthNotice}>
              Dismiss
            </button>
          </div>
        ) : null}

        {loading && !selfManagedSections.has(activeSection) ? (
          <Panel title="Loading workspace" subtitle="Pulling the latest data from Supabase.">
            <div className="loading-inline">
              <div className="spinner" aria-hidden="true" />
            </div>
          </Panel>
        ) : null}

        {(!loading || selfManagedSections.has(activeSection)) ? (
          <div
            className={`section-stage${[
              "dashboard",
              "events",
              "announcements",
              "prayer",
              "resources",
              "assignments",
              "meetings",
              "messages",
              "members",
              "settings"
            ].includes(activeSection) ? ` workspace-page workspace-page--${activeSection}` : ""}`}
            style={{
              "--dashboard-art": `url("${communityBackdrop}")`,
              "--page-art": `url("${communityBackdrop}")`
            }}
            key={activeSection}
          >
            {!(["dashboard", "events", "announcements"].includes(activeSection)) ? (
              <div className="section-art-strip" aria-hidden="true" />
            ) : null}
            {sectionContent}
          </div>
        ) : null}
      </main>

      <footer className="app-footer">
        <span>Glory Carries 2026 &copy;</span>
      </footer>

      <NotificationCenter
        notifications={notifications}
        isOpen={showNotificationCenter}
        onClose={() => setShowNotificationCenter(false)}
        onOpenNotification={openNotificationTarget}
        onMarkRead={(notificationId, read) => {
          void markNotificationRead(notificationId, read);
        }}
        onMarkAllRead={() => {
          void markAllNotificationsRead();
        }}
        onDelete={(notificationId) => {
          void deleteNotification(notificationId);
        }}
        onArchive={(notificationId, archived) => {
          void archiveNotification(notificationId, archived);
        }}
        formatDateTime={formatDateTime}
      />

      <PushPermissionPrompt
        isOpen={showPushPrompt}
        onEnable={() => {
          void enableNotifications();
        }}
        onDismiss={() => {
          setShowPushPrompt(false);
          dismissPushPermissionPrompt();
        }}
      />

      <MobileSectionNav
        sections={navSections}
        activeSection={activeSection}
        onSelect={setActiveSection}
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        menuButtonRef={mobileMenuTriggerRef}
        unreadCount={unreadNotifications.length}
        onOpenNotifications={() => setShowNotificationCenter(true)}
      />
    </div>
  );
}
