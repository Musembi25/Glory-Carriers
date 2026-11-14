import { lazy, Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { MemberInitials } from "./MemberInitials.jsx";
const AdminBibleStreakReport = lazy(() => import("./AdminBibleStreakReport.jsx").then((module) => ({ default: module.AdminBibleStreakReport })));
const AboutPage = lazy(() => import("./AboutFaqPages.jsx").then((module) => ({ default: module.AboutPage })));
const FAQPage = lazy(() => import("./AboutFaqPages.jsx").then((module) => ({ default: module.FAQPage })));
const FunZone = lazy(() => import("./FunZone.jsx").then((module) => ({ default: module.FunZone })));
const DiscipleshipAssignments = lazy(() => import("./DiscipleshipAssignments.jsx").then((module) => ({ default: module.DiscipleshipAssignments })));
const CellGroupManagementSection = lazy(() => import("./management/CellGroupManagementSection").then((module) => ({ default: module.CellGroupManagementSection })));
const BirthdayManagementSection = lazy(() => import("./management/BirthdayManagementSection.jsx").then((module) => ({ default: module.BirthdayManagementSection })));
import "../styles/admin-workspace.css";
const BibleStudySection = lazy(() => import("./BibleStudySection").then((module) => ({ default: module.BibleStudySection })));
import { NotificationCenter } from "./NotificationCenter.jsx";
import { NotificationPreferences } from "./NotificationPreferences.jsx";
import { PushPermissionPrompt } from "./PushPermissionPrompt.jsx";
const SuperAdminArea = lazy(() => import("./SuperAdminArea.jsx").then((module) => ({ default: module.SuperAdminArea })));
import { APP_NAME, CELL_GROUP_NAME } from "../lib/identity";
import { BIBLE_STREAK_MILESTONES, getLocalReadingDate, summarizePersonalReadings } from "../lib/personalBibleStudy.js";
import { formatBirthdayDate, getBirthdayOccurrence, getLocalDateKey } from "../lib/dashboardBirthday.js";
import { BirthdayCelebration, DashboardCompanion, DashboardGroupAnalytics, DashboardHeroPhotographs, DashboardPersonalJourney, DashboardScriptureHighlight } from "./DashboardExperience.jsx";
import GlobalBackground from "./GlobalBackground.jsx";
function privateStoragePath(value, bucket) {
  if (typeof value !== "string" || !value) return "";
  const markers = [`/object/public/${bucket}/`, `/object/sign/${bucket}/`, `/object/authenticated/${bucket}/`];
  for (const marker of markers) {
    const index = value.indexOf(marker);
    if (index >= 0) {
      try { return decodeURIComponent(value.slice(index + marker.length).split("?")[0]); }
      catch { return value.slice(index + marker.length).split("?")[0]; }
    }
  }
  return value.startsWith("http") ? "" : value;
}

const sections = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Home", icon: "home" },
  { id: "fun-zone", label: "Fun Zone", shortLabel: "Fun Zone", icon: "gamepad" },
  { id: "events", label: "Events", shortLabel: "Events", icon: "calendar" },
  { id: "prayer", label: "Prayer", shortLabel: "Prayer", icon: "prayer" },
  { id: "resources", label: "Resources", shortLabel: "Files", icon: "book-open" },
  { id: "faq", label: "Frequently Asked Questions", shortLabel: "FAQ", icon: "circle-help" },
  { id: "about", label: "About City on a Hill", shortLabel: "About", icon: "landmark" },
  { id: "bible-study", label: "Bible Study", shortLabel: "Bible", icon: "scripture" },
  { id: "assignments", label: "Assignments", shortLabel: "Assignments", icon: "clipboard-list" },
  { id: "meetings", label: "Virtual Meetings", shortLabel: "Meet", icon: "video" },
  { id: "messages", label: "Messages", shortLabel: "Messages", icon: "messages" },
  { id: "members", label: "Members", shortLabel: "People", icon: "users" },
  {
    id: "management",
    label: "Administration",
    shortLabel: "Admin",
    icon: "management",
    adminOnly: true
  },
  { id: "birthdays", label: "Birthdays", shortLabel: "Birthdays", icon: "calendar", adminOnly: true },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: "settings" }
];

const navigationGroups = [
  { id: "workspace", label: "Workspace", icon: "home", ids: ["dashboard"] },
  { id: "community", label: "Community", icon: "messages", ids: ["fun-zone", "messages", "members", "meetings", "notifications"] },
  { id: "ministry", label: "Ministry", icon: "scripture", ids: ["bible-study", "prayer", "events", "resources"] },
  { id: "explore", label: "Explore", icon: "compass", ids: ["faq", "about"] },
  { id: "my-space", label: "My space", icon: "clipboard-list", ids: ["assignments"] },
  { id: "administration", label: "Administration", icon: "management", ids: ["management", "birthdays"] },
  { id: "system-oversight", label: "System oversight", icon: "shield", ids: ["super-admin"] }
];

function getNavigationGroups(availableSections) {
  const sectionById = new Map(availableSections.map((section) => [section.id, section]));
  return navigationGroups.map((group) => ({
    ...group,
    items: group.ids.map((id) => id === "notifications"
      ? { id, label: "Notifications", icon: "bell" }
      : sectionById.get(id)).filter(Boolean)
  })).filter((group) => group.items.length);
}

function getAdministrativeNavigationGroups(availableSections) {
  const sectionById = new Map(availableSections.map((section) => [section.id, section]));
  const groups = [
    { id: "people", label: "People & Membership", icon: "users", ids: ["members", "management", "birthdays"] },
    { id: "ministry-management", label: "Ministry Management", icon: "scripture", ids: ["bible-study", "prayer", "events", "assignments"] },
    { id: "content-resources", label: "Content & Resources", icon: "book-open", ids: ["resources", "faq", "about"] },
    { id: "communication", label: "Communication", icon: "messages", ids: ["messages", "meetings", "fun-zone"] },
    { id: "system-administration", label: "System Administration", icon: "shield", ids: ["super-admin"] }
  ];
  return groups.map((group) => ({
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

const pulseTextThemes = [
  { id: "sunrise", label: "Sunrise" },
  { id: "ocean", label: "Ocean" },
  { id: "ember", label: "Ember" },
  { id: "paper", label: "Paper" },
  { id: "midnight", label: "Midnight" }
];

const pulseTextFonts = [
  { id: "default", label: "Default" },
  { id: "modern", label: "Modern" },
  { id: "serif", label: "Serif" },
  { id: "rounded", label: "Rounded" }
];

const pulseTextColors = [
  { id: "auto", label: "Auto" },
  { id: "ivory", label: "Ivory" },
  { id: "ink", label: "Ink" },
  { id: "gold", label: "Gold" },
  { id: "sky", label: "Sky" }
];

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
  const uid = `${eventRecord.id}@city-on-a-hill`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//Events//EN`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${nowToken}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(eventRecord.title || `${CELL_GROUP_NAME} event`)}`,
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

function IdentityBadge({ member, size = "medium", photoUrl }) {
  return <MemberInitials member={member} photoUrl={photoUrl} className={`identity identity-fallback ${size}`} />;
}

function WorkspaceImage({ src, alt, className = "", fallbackClassName = "workspace-image-fallback", ...imageProps }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [src]);
  if (!src || imageFailed) {
    return <span className={fallbackClassName} role="img" aria-label={alt || "Image unavailable"}>Photo unavailable</span>;
  }
  return <img src={src} alt={alt} className={className} onError={() => setImageFailed(true)} {...imageProps} />;
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
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4.2 4.2" />
        </svg>
      );
    case "compass":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m14.8 9.2-1.9 4-4 1.9 1.9-4 4-1.9Z" />
          <path d="M12 3v2m9 7h-2M12 21v-2m-9-7h2" />
        </svg>
      );
    case "circle-help":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.7 9a2.35 2.35 0 1 1 4.5.95c-.75 1.35-2.2 1.45-2.2 3.3" />
          <circle cx="12" cy="17" r=".65" fill="currentColor" stroke="none" />
        </svg>
      );
    case "landmark":
      return (
        <svg {...commonProps}>
          <path d="M12 3v4m-2-2h4" />
          <path d="m4 10 8-5 8 5" />
          <path d="M5 10v8m4-5v5m6-5v5m4-8v8M3.5 20h17" />
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
    case "gamepad":
      return (
        <svg {...commonProps}>
          <path d="M6.5 8h11a4 4 0 0 1 3.9 4.8l-.6 2.7a2.5 2.5 0 0 1-4.1 1.3l-2-1.7H9.3l-2 1.7a2.5 2.5 0 0 1-4.1-1.3l-.6-2.7A4 4 0 0 1 6.5 8Z" />
          <path d="M7.5 10.5v4m-2-2h4" />
          <circle cx="16" cy="11.5" r=".8" />
          <circle cx="18.5" cy="14" r=".8" />
        </svg>
      );
    case "activity":
      return (
        <svg {...commonProps}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
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
    case "clipboard-list":
      return (
        <svg {...commonProps}>
          <rect x="5" y="5" width="14" height="16" rx="2" />
          <path d="M9 5.5V4.7A1.7 1.7 0 0 1 10.7 3h2.6A1.7 1.7 0 0 1 15 4.7v.8" />
          <path d="M8.5 10h1M12 10h3.5M8.5 14h1M12 14h3.5M8.5 18h1M12 18h3.5" />
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
    case "shield":
      return (
        <svg {...commonProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
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
    case "x":
      return (
        <svg {...commonProps}>
          <path d="m18 6-12 12M6 6l12 12" />
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
    case "user":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="3.3" />
          <path d="M5 20c.6-3.7 3-5.6 7-5.6s6.4 1.9 7 5.6" />
        </svg>
      );
    case "moon":
      return (
        <svg {...commonProps}>
          <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
        </svg>
      );
    case "sun":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "logout":
      return (
        <svg {...commonProps}>
          <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" />
          <path d="M14 8l4 4-4 4M8 12h10" />
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

function PulseMediaCarousel({ attachments, title, onLike, initialIndex = 0 }) {
  const [index, setIndex] = useState(initialIndex);
  const [heart, setHeart] = useState(null);
  const tapRef = useRef(null);
  const heartTimerRef = useRef(null);
  const swipeStartRef = useRef(null);
  const count = attachments.length;
  const currentIndex = Math.min(index, Math.max(count - 1, 0));
  const move = (direction) => setIndex((current) => (current + direction + count) % count);

  useEffect(() => () => {
    window.clearTimeout(heartTimerRef.current);
  }, []);

  function handleMediaTap(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (event.pointerType === "touch" && start && Math.abs(event.clientX - start.x) > 42) {
      tapRef.current = null;
      move(event.clientX < start.x ? 1 : -1);
      return;
    }
    const now = Date.now();
    const target = event.currentTarget.getBoundingClientRect();
    const point = { x: ((event.clientX - target.left) / target.width) * 100, y: ((event.clientY - target.top) / target.height) * 100 };
    const previous = tapRef.current;
    const isDoubleTap = previous && now - previous.time < 300 && Math.hypot(point.x - previous.x, point.y - previous.y) < 15;

    if (isDoubleTap) {
      tapRef.current = null;
      setHeart({ ...point, id: now });
      window.clearTimeout(heartTimerRef.current);
      heartTimerRef.current = window.setTimeout(() => setHeart(null), 720);
      onLike?.();
      return;
    }

    tapRef.current = { ...point, time: now };
  }

  if (!count) return null;

  return (
    <div className="pulse-media-carousel" aria-label={`${count} photo${count === 1 ? "" : "s"}`}>
      <div className="pulse-media-stage" onPointerDown={(event) => { swipeStartRef.current = { x: event.clientX }; }} onPointerUp={handleMediaTap} onPointerCancel={() => { swipeStartRef.current = null; }} aria-label={`Photo ${currentIndex + 1} of ${count}. Double tap to like`}>
        <WorkspaceImage src={attachments[currentIndex]} alt={title ? `${title} · photo ${currentIndex + 1}` : `Community photo ${currentIndex + 1}`} className="pulse-media-image" fallbackClassName="pulse-media-stage-fallback" loading="lazy" decoding="async" />
      </div>
      {heart ? <span className="pulse-like-heart" style={{ "--heart-x": `${heart.x}%`, "--heart-y": `${heart.y}%` }} aria-hidden="true">♥</span> : null}
      {count > 1 ? <>
        <button type="button" className="pulse-media-control previous" onClick={() => move(-1)} aria-label="Previous photo">‹</button>
        <button type="button" className="pulse-media-control next" onClick={() => move(1)} aria-label="Next photo">›</button>
        <div className="pulse-media-pagination" aria-hidden="true">{attachments.map((_, itemIndex) => <i key={itemIndex} className={itemIndex === currentIndex ? "active" : ""} />)}</div>
        <span className="pulse-media-counter">{currentIndex + 1} / {count}</span>
      </> : null}
    </div>
  );
}

function PulseTextLikeArea({ children, onLike }) {
  const [heart, setHeart] = useState(null);
  const tapRef = useRef(null);
  const heartTimerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(heartTimerRef.current), []);

  function handleTextTap(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const now = Date.now();
    const target = event.currentTarget.getBoundingClientRect();
    const point = { x: ((event.clientX - target.left) / target.width) * 100, y: ((event.clientY - target.top) / target.height) * 100 };
    const previous = tapRef.current;
    const isDoubleTap = previous && now - previous.time < 300 && Math.hypot(point.x - previous.x, point.y - previous.y) < 18;

    if (!isDoubleTap) {
      tapRef.current = { ...point, time: now };
      return;
    }

    tapRef.current = null;
    setHeart({ ...point, id: now });
    window.clearTimeout(heartTimerRef.current);
    heartTimerRef.current = window.setTimeout(() => setHeart(null), 720);
    onLike?.();
  }

  return <p className="community-post-body pulse-text-like-area" onPointerUp={handleTextTap}>{children}{heart ? <span className="pulse-like-heart" style={{ "--heart-x": `${heart.x}%`, "--heart-y": `${heart.y}%` }} aria-hidden="true">♥</span> : null}</p>;
}

function PulseCommentsSheet({ post, replies, profiles, reactions, userId, isAdmin, submitting, draft, onDraftChange, onClose, closeButtonRef, onToggleReaction, onManageReply, onSubmit }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="gc-comments-overlay" role="presentation" onMouseDown={onClose}>
      <section className="gc-comments-sheet" role="dialog" aria-modal="true" aria-labelledby="pulse-conversation-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="gc-comments-sheet__header">
          <div>
            <p className="gc-pulse-kicker">COMMUNITY CONVERSATION</p>
            <h2 id="pulse-conversation-title">Comments</h2>
            <p>{replies.length ? `${replies.length} comment${replies.length === 1 ? "" : "s"}` : "Start the conversation"}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="gc-comments-sheet__close" aria-label="Close comments" onClick={onClose}>×</button>
        </header>
        <div className="gc-comments-sheet__thread">
          {replies.length ? replies.map((reply) => {
            const replyAuthor = profiles.find((member) => member.id === reply.user_id);
            return (
              <article className="community-reply" key={reply.id}>
                <IdentityBadge member={replyAuthor} size="small" />
                <div className="community-reply-content">
                  <strong>{replyAuthor?.full_name || replyAuthor?.email || "Member"}</strong>
                  <p>{reply.body}</p>
                  <time dateTime={reply.created_at}>{formatDateTime(reply.created_at)}</time>
                  <AnnouncementReplyReactions replyId={reply.id} reactions={reactions} userId={userId} disabled={submitting} onToggle={onToggleReaction} />
                </div>
                {(isAdmin || reply.user_id === userId) ? (
                  <div className="community-post-actions">
                    <button type="button" className="ghost-button compact" onClick={() => onManageReply(reply, "edit")}>Edit</button>
                    <button type="button" className="ghost-button compact danger" onClick={() => onManageReply(reply, "delete")}>Delete</button>
                  </div>
                ) : null}
              </article>
            );
          }) : <p className="gc-comments-sheet__empty">No comments yet. Be the first to encourage someone.</p>}
        </div>
        <form className="gc-comments-sheet__composer" onSubmit={(event) => onSubmit(event, post.id)}>
          <textarea autoFocus rows={1} aria-label="Write a comment" maxLength={2000} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="Write a thoughtful comment…" />
          <button type="submit" className="primary-button compact" disabled={submitting || !draft.trim()}>Send</button>
        </form>
      </section>
    </div>,
    document.body
  );
}

function PulseMediaViewer({ attachments, title, initialIndex = 0, onClose, closeButtonRef }) {
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const tapRef = useRef(null);
  const swipeStartRef = useRef(null);
  const count = attachments.length;
  const currentIndex = Math.min(index, Math.max(count - 1, 0));
  const move = (direction) => { setZoomed(false); setIndex((current) => (current + direction + count) % count); };

  useEffect(() => {
    function onKeyDown(event) {
      if (count > 1 && event.key === "ArrowLeft") move(-1);
      if (count > 1 && event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, onClose]);

  function handlePointerUp(event) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (event.pointerType === "touch" && start && Math.abs(event.clientX - start.x) > 48) {
      move(event.clientX < start.x ? 1 : -1);
      return;
    }
    const now = Date.now();
    const previous = tapRef.current;
    if (previous && now - previous < 280) {
      setZoomed((value) => !value);
      tapRef.current = null;
      return;
    }
    tapRef.current = now;
  }

  if (!count) return null;

  return <section className="pulse-lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onMouseDown={(event) => event.stopPropagation()}>
    <button ref={closeButtonRef} type="button" className="pulse-lightbox-close" aria-label="Close photo viewer" onClick={onClose}>×</button>
    <div className={`pulse-viewer-stage${zoomed ? " is-zoomed" : ""}`} onPointerDown={(event) => { swipeStartRef.current = { x: event.clientX }; }} onPointerUp={handlePointerUp}>
      <WorkspaceImage src={attachments[currentIndex]} alt={title ? `${title} · photo ${currentIndex + 1} of ${count}` : `Community photo ${currentIndex + 1} of ${count}`} className="pulse-viewer-image" fallbackClassName="pulse-viewer-stage-fallback" decoding="async" />
    </div>
    <span className="pulse-viewer-counter">{currentIndex + 1} / {count}</span>
    {count > 1 ? <><button type="button" className="pulse-viewer-nav previous" aria-label="Previous photo" onClick={() => move(-1)}>‹</button><button type="button" className="pulse-viewer-nav next" aria-label="Next photo" onClick={() => move(1)}>›</button></> : null}
    <span className="pulse-viewer-hint">Double tap to {zoomed ? "fit" : "zoom"}</span>
  </section>;
}

function NavigationItem({ section, activeSection, onSelect, onOpenNotifications, unreadCount, className = "", onAfterSelect, style }) {
  const isNotificationItem = section.id === "notifications";
  const active = !isNotificationItem && activeSection === section.id;
  const label = isNotificationItem && unreadCount
    ? "Notifications, " + unreadCount + " unread"
    : section.label;
  return (
    <button
      type="button"
      className={"sidebar-link " + className + (active ? " active" : "")}
      style={style}
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

function DesktopWorkspaceNavigation({ sections: availableSections, activeSection, onSelect, roleLabel, isAdminWorkspace, isSuperAdmin, theme, onThemeToggle, currentMember, unreadCount, onOpenNotifications, onSignOut }) {
  const [openMenuId, setOpenMenuId] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigationRef = useRef(null);
  const menuTriggerRefs = useRef(new Map());
  const accountTriggerRef = useRef(null);
  const sectionById = new Map(availableSections.map((section) => [section.id, section]));
  const overview = sectionById.get("dashboard");
  const dropdownGroups = isAdminWorkspace
    ? getAdministrativeNavigationGroups(availableSections)
    : [
        { id: "community", label: "Community", icon: "messages", ids: ["fun-zone", "messages", "members", "meetings"] },
        { id: "ministry", label: "Ministry", icon: "scripture", ids: ["bible-study", "prayer", "events", "resources"] },
        { id: "explore", label: "Explore", icon: "compass", ids: ["faq", "about"] },
        { id: "my-space", label: "My space", icon: "clipboard-list", ids: ["assignments"] },
        { id: "management", label: "Administration", icon: isSuperAdmin ? "shield" : "management", ids: ["management", "birthdays", "super-admin"] }
      ].map((group) => ({
        ...group,
        items: group.ids.map((id) => id === "notifications"
          ? { id, label: "Notifications", icon: "bell" }
          : sectionById.get(id)).filter(Boolean)
      })).filter((group) => group.items.length);
  const openNavigationGroup = dropdownGroups.find((group) => group.id === openMenuId);
  const activeRoute = sectionById.get(activeSection);
  const showCurrentRoute = isAdminWorkspace && activeRoute && !["dashboard", "members", "events"].includes(activeSection);

  useEffect(() => {
    const updateScrollState = () => {
      const next = window.scrollY > 14;
      setIsScrolled((current) => current === next ? current : next);
    };
    window.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState, { passive: true });
    updateScrollState();
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  useEffect(() => {
    if (!openMenuId && !accountOpen) return undefined;
    const closeOutside = (event) => {
      if (!navigationRef.current?.contains(event.target)) {
        setOpenMenuId("");
        setAccountOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (openMenuId) menuTriggerRefs.current.get(openMenuId)?.focus();
      else accountTriggerRef.current?.focus();
      setOpenMenuId("");
      setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId, accountOpen]);

  function handleMenuKeys(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menu = event.currentTarget.matches('[role="menu"]')
      ? event.currentTarget
      : event.currentTarget.querySelector('[role="menu"]');
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items[items.length - 1].focus();
    else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length].focus();
    else items[(currentIndex <= 0 ? items.length : currentIndex) - 1].focus();
  }

  function activate(section, groupId) {
    if (groupId) menuTriggerRefs.current.get(groupId)?.focus({ preventScroll: true });
    setOpenMenuId("");
    setAccountOpen(false);
    onSelect(section.id);
  }

  function renderGroupTrigger(group, className = "") {
    const active = group.items.some((section) => section.id === activeSection);
    const expanded = openMenuId === group.id;
    return <div className="workspace-nav-group" key={group.id}>
      <button
        ref={(node) => { if (node) menuTriggerRefs.current.set(group.id, node); else menuTriggerRefs.current.delete(group.id); }}
        type="button"
        className={`workspace-top-link workspace-nav-group-trigger${active ? " active" : ""}${className ? ` ${className}` : ""}`}
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={expanded ? `workspace-menu-${group.id}` : undefined}
        onClick={() => { setOpenMenuId((current) => current === group.id ? "" : group.id); setAccountOpen(false); }}
        onKeyDown={(event) => {
          if (!(event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") || expanded) return;
          event.preventDefault();
          setOpenMenuId(group.id);
          window.requestAnimationFrame(() => document.querySelector(`#workspace-menu-${group.id} [role="menuitem"]`)?.focus());
        }}
      >
        <span className="workspace-top-link-icon"><NavIcon name={group.icon} /></span>
        <span>{group.label}</span>
        <span className={`workspace-nav-caret${expanded ? " expanded" : ""}`} aria-hidden="true" />
      </button>
    </div>;
  }

  return (
    <header className={`workspace-top-navigation${isAdminWorkspace ? " is-administration" : " is-member"}${isScrolled ? " is-scrolled" : ""}${openMenuId || accountOpen ? " has-open-menu" : ""}`} ref={navigationRef}>
      <div className="workspace-top-navigation-inner">
        <div className="workspace-top-brand">
          <BrandLogo compact />
          <span className="workspace-role-badge">{roleLabel}</span>
        </div>
        <nav className={`workspace-top-links${isAdminWorkspace ? " workspace-top-links--admin-primary" : ""}`} aria-label="Main navigation">
          {overview ? <button type="button" className={`workspace-top-link workspace-overview-link${activeSection === overview.id ? " active" : ""}`} aria-current={activeSection === overview.id ? "page" : undefined} onClick={() => activate(overview)}>
            <span className="workspace-top-link-icon"><NavIcon name="home" /></span><span>Overview</span>
          </button> : null}
          {isAdminWorkspace ? ["members", "events"].map((id) => {
            const section = sectionById.get(id);
            return section ? <button key={id} type="button" className={`workspace-top-link${activeSection === id ? " active" : ""}`} aria-current={activeSection === id ? "page" : undefined} onClick={() => activate(section)}>
              <span className="workspace-top-link-icon"><NavIcon name={section.icon} /></span><span>{section.label}</span>
            </button> : null;
          }) : dropdownGroups.map((group) => {
            const active = group.items.some((section) => section.id === activeSection);
            const expanded = openMenuId === group.id;
            return <div className="workspace-nav-group" key={group.id} onKeyDown={handleMenuKeys}>
              <button
                ref={(node) => { if (node) menuTriggerRefs.current.set(group.id, node); else menuTriggerRefs.current.delete(group.id); }}
                type="button"
                className={`workspace-top-link workspace-nav-group-trigger${active ? " active" : ""}`}
                aria-haspopup="menu"
                aria-expanded={expanded}
                aria-controls={expanded ? `workspace-menu-${group.id}` : undefined}
                onClick={() => { setOpenMenuId((current) => current === group.id ? "" : group.id); setAccountOpen(false); }}
                onKeyDown={(event) => {
                  if (!(["ArrowDown", "Enter", " "].includes(event.key)) || expanded) return;
                  event.preventDefault();
                  setOpenMenuId(group.id);
                  window.requestAnimationFrame(() => document.querySelector(`#workspace-menu-${group.id} [role="menuitem"]`)?.focus());
                }}
              >
                <span className="workspace-top-link-icon"><NavIcon name={group.icon} /></span>
                <span>{group.label}</span>
                <span className={`workspace-nav-caret${expanded ? " expanded" : ""}`} aria-hidden="true" />
              </button>
              {false && expanded ? <div className="workspace-dropdown" id={`workspace-menu-${group.id}`} role="menu" aria-label={`${group.label} navigation`}>
                {group.items.map((section) => <button key={section.id} type="button" role="menuitem" className={`workspace-dropdown-item${activeSection === section.id ? " active" : ""}`} aria-current={activeSection === section.id ? "page" : undefined} onClick={() => activate(section)}>
                  <span className="workspace-dropdown-icon"><NavIcon name={section.icon} /></span>
                  <span>{section.id === "management" ? "Member management" : section.label}</span>
                  {activeSection === section.id ? <span className="workspace-dropdown-current" aria-hidden="true" /> : null}
                </button>)}
              </div> : null}
            </div>;
          })}
          {showCurrentRoute ? <span className="workspace-current-route">
            <span className="workspace-top-link-icon" aria-hidden="true"><NavIcon name={activeRoute.icon} /></span>
            <span>{activeRoute.id === "management" ? "Member management" : activeRoute.label}</span>
          </span> : null}
        </nav>
        <div className="workspace-top-actions">
          <button type="button" className="workspace-notification-button" aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} onClick={onOpenNotifications}>
            <NavIcon name="bell" />{unreadCount ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
          </button>
          <div className="workspace-account-menu">
            <button ref={accountTriggerRef} type="button" className="workspace-account-trigger" aria-expanded={accountOpen} aria-haspopup="menu" aria-controls={accountOpen ? "workspace-account-actions" : undefined} onClick={() => { setAccountOpen((current) => !current); setOpenMenuId(""); }} onKeyDown={(event) => {
              if (!(["ArrowDown", "Enter", " "].includes(event.key)) || accountOpen) return;
              event.preventDefault();
              setAccountOpen(true);
              setOpenMenuId("");
              window.requestAnimationFrame(() => document.querySelector("#workspace-account-actions [role=\"menuitem\"]")?.focus());
            }} title="Account menu">
              <IdentityBadge member={currentMember} size="small" />
              <span className="workspace-account-copy"><strong>{currentMember?.full_name || "Account"}</strong><small>{roleLabel}</small></span>
              <span className={`workspace-nav-caret${accountOpen ? " expanded" : ""}`} aria-hidden="true" />
            </button>
            {false && accountOpen ? <div className="workspace-dropdown workspace-account-dropdown" id="workspace-account-actions" role="menu" aria-label="Account actions" onKeyDown={handleMenuKeys}>
              <button type="button" role="menuitem" className="workspace-dropdown-item" aria-current={activeSection === "settings" ? "page" : undefined} onClick={() => { setAccountOpen(false); onSelect("settings"); }}><span className="workspace-dropdown-icon"><NavIcon name="user" /></span><span>Profile &amp; settings</span></button>
              <button type="button" role="menuitem" className="workspace-dropdown-item" onClick={() => { setAccountOpen(false); onThemeToggle(); }}><span className="workspace-dropdown-icon"><NavIcon name={theme === "light" ? "moon" : "sun"} /></span><span>Switch to {theme === "light" ? "dark" : "light"} theme</span></button>
              <button type="button" role="menuitem" className="workspace-dropdown-item workspace-signout-item" onClick={() => { setAccountOpen(false); onSignOut(); }}><span className="workspace-dropdown-icon"><NavIcon name="logout" /></span><span>Sign out</span></button>
            </div> : null}
          </div>
        </div>
      </div>
      {isAdminWorkspace ? <nav className="admin-secondary-navigation" aria-label={isSuperAdmin ? "Super Admin navigation categories" : "Admin navigation categories"}>
        {dropdownGroups.map((group) => renderGroupTrigger(group, "admin-secondary-navigation-trigger"))}
      </nav> : null}
      {openNavigationGroup ? <div className="workspace-navigation-panel" key={openNavigationGroup.id}>
        <nav id={`workspace-menu-${openNavigationGroup.id}`} role="menu" aria-label={`${openNavigationGroup.label} navigation`} onKeyDown={handleMenuKeys}>
          {openNavigationGroup.items.map((section) => <button key={section.id} type="button" role="menuitem" className={`workspace-dropdown-item${activeSection === section.id ? " active" : ""}`} aria-current={activeSection === section.id ? "page" : undefined} onClick={() => activate(section, openNavigationGroup.id)}>
            <span className="workspace-dropdown-icon"><NavIcon name={section.icon} /></span>
            <span>{section.id === "management" ? "Member management" : section.label}</span>
            {activeSection === section.id ? <span className="workspace-dropdown-current" aria-hidden="true" /> : null}
          </button>)}
        </nav>
      </div> : accountOpen ? <div className="workspace-navigation-panel workspace-account-actions-panel">
        <nav id="workspace-account-actions" role="menu" aria-label="Account actions" onKeyDown={handleMenuKeys}>
          <button type="button" role="menuitem" className="workspace-dropdown-item" aria-current={activeSection === "settings" ? "page" : undefined} onClick={() => { setAccountOpen(false); onSelect("settings"); }}><span className="workspace-dropdown-icon"><NavIcon name="user" /></span><span>Profile &amp; settings</span></button>
          <button type="button" role="menuitem" className="workspace-dropdown-item" onClick={() => { setAccountOpen(false); onThemeToggle(); }}><span className="workspace-dropdown-icon"><NavIcon name={theme === "light" ? "moon" : "sun"} /></span><span>Switch to {theme === "light" ? "dark" : "light"} theme</span></button>
          <button type="button" role="menuitem" className="workspace-dropdown-item workspace-signout-item" onClick={() => { setAccountOpen(false); onSignOut(); }}><span className="workspace-dropdown-icon"><NavIcon name="logout" /></span><span>Sign out</span></button>
        </nav>
      </div> : null}
    </header>
  );
}

function MobileSectionNav({ sections: navSections, activeSection, onSelect, open, onOpenChange, menuButtonRef, unreadCount, onOpenNotifications, currentMember, roleLabel, theme, onThemeToggle, onSignOut, isAdminWorkspace }) {
  const drawerRef = useRef(null);
  const wasDrawerOpenRef = useRef(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const navGroups = useMemo(() => {
    if (!isAdminWorkspace) return getNavigationGroups(navSections);
    const overview = navSections.find((section) => section.id === "dashboard");
    return [
      ...(overview ? [{ id: "overview", label: "Overview", icon: "home", items: [overview] }] : []),
      ...getAdministrativeNavigationGroups(navSections)
    ];
  }, [isAdminWorkspace, navSections]);
  const [expandedGroupId, setExpandedGroupId] = useState("");
  const navItemOrder = new Map(navGroups.flatMap((group) => group.items).map((section, index) => [section.id, index]));
  const closeDrawer = () => {
    onOpenChange(false);
  };

  useEffect(() => {
    const activeGroup = navGroups.find((group) => group.items.some((section) => section.id === activeSection));
    if (activeGroup) setExpandedGroupId(activeGroup.id);
  }, [activeSection, navGroups]);

  useEffect(() => {
    let frameId;
    let closeTimer;
    if (open) {
      setPanelMounted(true);
      frameId = window.requestAnimationFrame(() => setPanelVisible(true));
    } else {
      setPanelVisible(false);
      closeTimer = window.setTimeout(() => setPanelMounted(false), 210);
    }
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(closeTimer);
    };
  }, [open]);

  useEffect(() => {
    if (open && panelVisible) {
      drawerRef.current?.querySelector("button")?.focus({ preventScroll: true });
    }
  }, [open, panelVisible]);

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
    const appShell = document.querySelector(".app-shell");
    const wasInert = appShell?.inert ?? false;
    if (appShell) appShell.inert = true;
    document.body.style.overflow = "hidden";
    const handleDrawerKeys = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(drawerRef.current?.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])') ?? [])].filter((item) => item.getClientRects().length > 0);
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
      if (appShell) appShell.inert = wasInert;
      document.removeEventListener("keydown", handleDrawerKeys);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <div className="mobile-navigation-anchor">
        <button
          ref={menuButtonRef}
          type="button"
          className={open ? "mobile-floating-menu open" : "mobile-floating-menu"}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls={open || panelMounted ? "mobile-navigation-drawer" : undefined}
          onClick={() => onOpenChange(!open)}
        >
          <span className="mobile-hamburger" aria-hidden="true"><i /><i /><i /></span>
        </button>
      </div>
      {panelMounted ? createPortal(
        <>
          <button type="button" className={`mobile-drawer-scrim${panelVisible ? " visible" : ""}`} aria-label="Close navigation menu" aria-hidden="true" tabIndex={-1} onClick={closeDrawer}/>
          <aside
            id="mobile-navigation-drawer"
            ref={drawerRef}
            className={`mobile-drawer mobile-navigation-panel${panelVisible ? " open" : ""}`}
            aria-label="Main navigation"
            role="dialog"
            aria-modal="true"
            aria-hidden={!open}
          >
            <div className="mobile-drawer-header">
              <BrandLogo compact/>
              <button type="button" className="mobile-drawer-close" onClick={closeDrawer} aria-label="Close navigation menu"><NavIcon name="x" /></button>
            </div>
            <nav className="mobile-drawer-nav" aria-label="Pages">
              {navGroups.map((group, groupIndex) => {
                const expanded = expandedGroupId === group.id;
                const active = group.items.some((section) => section.id === activeSection);
                const groupPanelId = `mobile-nav-group-${group.id}`;
                return <section className={`mobile-drawer-group${active ? " has-active-route" : ""}${expanded ? " expanded" : ""}`} key={group.id} style={{ "--nav-group-order": groupIndex }}>
                  <button type="button" className="mobile-drawer-group-toggle" aria-expanded={expanded} aria-controls={groupPanelId} onClick={() => setExpandedGroupId((current) => current === group.id ? "" : group.id)}>
                    <span className="mobile-drawer-group-icon" aria-hidden="true"><NavIcon name={group.icon || "folder"} /></span>
                    <span>{group.label}</span>
                    {active ? <span className="mobile-drawer-group-active" aria-hidden="true" /> : null}
                    <span className={`workspace-nav-caret${expanded ? " expanded" : ""}`} aria-hidden="true" />
                  </button>
                  <div id={groupPanelId} className="mobile-drawer-group-items" hidden={!expanded}>
                    {group.items.map((section, itemIndex) => <NavigationItem
                      key={section.id}
                      section={section}
                      activeSection={activeSection}
                      onSelect={onSelect}
                      onOpenNotifications={onOpenNotifications}
                      unreadCount={unreadCount}
                      className="mobile-drawer-link"
                      style={{ "--nav-item-order": navItemOrder.get(section.id) ?? itemIndex }}
                      onAfterSelect={closeDrawer}
                    />)}
                  </div>
                </section>;
              })}
            </nav>
            <section className="mobile-drawer-account" aria-label="Account">
              <div className="mobile-account-profile">
                <IdentityBadge member={currentMember} size="small" />
                <span><strong>{currentMember?.full_name || "Member"}</strong><small>{roleLabel}</small></span>
              </div>
              <div>
                {navSections.some((section) => section.id === "settings") ? <button type="button" onClick={() => { onSelect("settings"); closeDrawer(); }}><NavIcon name="settings" /><span>Profile &amp; settings</span></button> : null}
                <button type="button" onClick={() => { onThemeToggle(); closeDrawer(); }}><NavIcon name={theme === "light" ? "moon" : "sun"} /><span>{theme === "light" ? "Dark theme" : "Light theme"}</span></button>
                <button type="button" className="mobile-account-signout" onClick={() => { closeDrawer(); onSignOut(); }}><NavIcon name="logout" /><span>Sign out</span></button>
              </div>
            </section>
          </aside>
        </>,
        document.body
      ) : null}
    </>
  );
}

export function AppShell() {
  const {
    user,
    profile,
    signOut,
    authNotice,
    clearAuthNotice,
    updatePassword
  } = useAuth();
  const [activeSection, setActiveSection] = useState(() => {
    const requested = window.location.hash.replace(/^#\/?/, "");
    const normalized = requested === "leadership" ? "assignments" : requested === "arena" ? "fun-zone" : requested;
    if (normalized === "super-admin") return normalized;
    if (normalized === "admin-login") return "management";
    return sections.some((section) => section.id === normalized) && (normalized !== "management" || !profile || profile.role === "admin") ? normalized : "dashboard";
  });
  const [birthdayFocusMemberId, setBirthdayFocusMemberId] = useState("");
  const [focusBiblePartnerStreaks, setFocusBiblePartnerStreaks] = useState(false);
  const [superAdminStatus, setSuperAdminStatus] = useState("idle");

  useEffect(() => {
    const currentSection = window.location.hash.replace(/^#\/?/, "");
    if (currentSection !== activeSection) {
      window.history.pushState({ section: activeSection }, "", `#${activeSection}`);
    }
  }, [activeSection]);

  useEffect(() => {
    function restoreSectionFromHistory() {
      const requested = window.location.hash.replace(/^#\/?/, "");
      const normalized = requested === "leadership" ? "assignments" : requested === "arena" ? "fun-zone" : requested;
      setActiveSection(normalized === "super-admin" ? normalized : normalized === "admin-login" ? "management" : sections.some((section) => section.id === normalized) ? normalized : "dashboard");
    }
    window.addEventListener("popstate", restoreSectionFromHistory);
    return () => window.removeEventListener("popstate", restoreSectionFromHistory);
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef(null);
  const previousSectionForScrollRef = useRef(activeSection);
  useEffect(() => {
    if (previousSectionForScrollRef.current === activeSection) return;
    previousSectionForScrollRef.current = activeSection;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollTo({ top: 0, behavior });
  }, [activeSection]);
  const [theme, setTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem("glory-carriers-theme");

    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  const [events, setEvents] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [votes, setVotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [prayerPoints, setPrayerPoints] = useState([]);
  const [prayerReplies, setPrayerReplies] = useState([]);
  const [prayerRepliesAvailable, setPrayerRepliesAvailable] = useState(false);
  const [prayerReplyDrafts, setPrayerReplyDrafts] = useState({});
  const [prayerReplyBusy, setPrayerReplyBusy] = useState("");
  const [prayerSubmitting, setPrayerSubmitting] = useState(false);
  const [prayerBusyIds, setPrayerBusyIds] = useState(() => new Set());
  const [resources, setResources] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementReplies, setAnnouncementReplies] = useState([]);
  const [announcementToFocus, setAnnouncementToFocus] = useState("");
  const [announcementRepliesAvailable, setAnnouncementRepliesAvailable] = useState(true);
  const [textPostThemesAvailable, setTextPostThemesAvailable] = useState(true);
  useEffect(() => {
    if (activeSection !== "announcements" || !announcementToFocus) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const post = document.getElementById(`announcement-${announcementToFocus}`);
      if (!post) return;
      post.scrollIntoView({ behavior: "smooth", block: "start" });
      post.focus({ preventScroll: true });
      setAnnouncementToFocus("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, announcementToFocus, announcements]);
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
  const [personalBibleReadings, setPersonalBibleReadings] = useState([]);
  const [personalBibleAvailable, setPersonalBibleAvailable] = useState(true);
  const [personalBibleStreakSummary, setPersonalBibleStreakSummary] = useState(null);
  const [personalBibleAchievements, setPersonalBibleAchievements] = useState([]);
  const [personalBibleStreakAvailable, setPersonalBibleStreakAvailable] = useState(true);
  const [dashboardGroupCompletionPercent, setDashboardGroupCompletionPercent] = useState(50);
  const [dashboardGroupCompletionSettingsAvailable, setDashboardGroupCompletionSettingsAvailable] = useState(true);
  const [dashboardGroupMemberships, setDashboardGroupMemberships] = useState([]);
  const [dashboardGroupMembershipsAvailable, setDashboardGroupMembershipsAvailable] = useState(false);
  const [funZoneSummary, setFunZoneSummary] = useState(null);
  const [funZoneAvailable, setFunZoneAvailable] = useState(true);
  const [biblePartnerStreaks, setBiblePartnerStreaks] = useState([]);
  const [cellGroups, setCellGroups] = useState([]);
  const [activeCellGroupId, setActiveCellGroupId] = useState("");
  const cellGroup = cellGroups.find((group) => group.id === activeCellGroupId) || null;
  const [dashboardBirthdays, setDashboardBirthdays] = useState([]);
  const [birthdayBoardLoading, setBirthdayBoardLoading] = useState(true);
  const [birthdayBoardUnavailable, setBirthdayBoardUnavailable] = useState(false);
  const [birthdayExperienceOpen, setBirthdayExperienceOpen] = useState(false);
  const [birthdayExperienceReopened, setBirthdayExperienceReopened] = useState(false);
  const birthdayClaimPromisesRef = useRef(new Map());
  const [selectedAssignmentClassId, setSelectedAssignmentClassId] = useState("");
  const [icebreaker, setIcebreaker] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [messageForm, setMessageForm] = useState(emptyMessageForm);
  const [prayerForm, setPrayerForm] = useState(emptyPrayerForm);
  const [editingPrayerId, setEditingPrayerId] = useState("");
  const [prayerSearchQuery, setPrayerSearchQuery] = useState("");
  const [prayerStatusFilter, setPrayerStatusFilter] = useState("all");
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [resourceSearchQuery, setResourceSearchQuery] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("all");
  const [resourceForm, setResourceForm] = useState(emptyResourceForm);
  const [leadershipForm, setLeadershipForm] = useState(emptyLeadershipForm);
  const [meetingForm, setMeetingForm] = useState(emptyMeetingForm);
  const [announcementForm, setAnnouncementForm] = useState(emptyAnnouncementForm);
  const [announcementFeedFilter, setAnnouncementFeedFilter] = useState("all");
  const [pulseTab, setPulseTab] = useState("feed");
  const [pulseSearchQuery, setPulseSearchQuery] = useState("");
  const [announcementReplyDrafts, setAnnouncementReplyDrafts] = useState({});
  const [pulseMessageDraft, setPulseMessageDraft] = useState("");
  const [pulseReplyTargetId, setPulseReplyTargetId] = useState("");
  const [pulseEditingMessageId, setPulseEditingMessageId] = useState("");
  const [announcementPhotos, setAnnouncementPhotos] = useState([]);
  const [uploadingAnnouncementPhotos, setUploadingAnnouncementPhotos] = useState(false);
  const [pulseComposerOpen, setPulseComposerOpen] = useState(false);
  const [pulseConversationId, setPulseConversationId] = useState("");
  const pulseOverlayCloseRef = useRef(null);
  const [announcementTextTheme, setAnnouncementTextTheme] = useState("sunrise");
  const [announcementTextFont, setAnnouncementTextFont] = useState("default");
  const [announcementTextColor, setAnnouncementTextColor] = useState("auto");
  const announcementReactionLocksRef = useRef(new Set());
  useEffect(() => {
    if (!pulseConversationId) return undefined;
    window.requestAnimationFrame(() => pulseOverlayCloseRef.current?.focus());
    const handleOverlayEscape = (event) => {
      if (event.key !== "Escape") return;
      setPulseConversationId("");
    };
    window.addEventListener("keydown", handleOverlayEscape);
    return () => window.removeEventListener("keydown", handleOverlayEscape);
  }, [pulseConversationId]);
  const [editingEventId, setEditingEventId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [editingResourceId, setEditingResourceId] = useState("");
  const [editingLeadershipId, setEditingLeadershipId] = useState("");
  const [editingAnnouncementId, setEditingAnnouncementId] = useState("");
  const [editingMeetingId, setEditingMeetingId] = useState("");
  const [ideaDraft, setIdeaDraft] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const [profileForm, setProfileForm] = useState({ full_name: "" });
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [removeProfilePhotoOnSave, setRemoveProfilePhotoOnSave] = useState(false);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [liveNow, setLiveNow] = useState(() => new Date());
  const closeBirthdayExperience = useCallback(() => setBirthdayExperienceOpen(false), []);
  const reopenBirthdayExperience = useCallback(() => {
    setBirthdayExperienceReopened(true);
    setBirthdayExperienceOpen(true);
  }, []);
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
    prayer_point_replies: new Set(),
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
  const isSuperAdmin = superAdminStatus === "authorized";
  const isAdminWorkspace = isAdmin || isSuperAdmin;
  const canManageCellGroup = isAdmin || cellGroup?.leader_id === user?.id;
  const navSections = useMemo(
    () => {
      const visibleSections = sections.filter((section) => section.adminOnly ? isAdmin || isSuperAdmin : (!section.leaderOnly || canManageCellGroup));
      return isSuperAdmin
        ? [...visibleSections, { id: "super-admin", label: "Super Admin", shortLabel: "Oversight", icon: "shield" }]
        : visibleSections;
    },
    [canManageCellGroup, isAdmin, isSuperAdmin]
  );
  useEffect(() => {
    if (["management", "birthdays"].includes(activeSection) && profile && !isAdminWorkspace) {
      setErrorMessage("Administrator access is restricted to authorized accounts.");
      setActiveSection("dashboard");
    }
  }, [activeSection, isAdminWorkspace, profile]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let current = true;
    setSuperAdminStatus("checking");
    supabase.rpc("is_super_admin").then(({ data, error }) => {
      if (!current) return;
      setSuperAdminStatus(!error && data === true ? "authorized" : "denied");
    });
    return () => { current = false; };
  }, [user?.id]);

  useEffect(() => {
    if (activeSection !== "super-admin" || superAdminStatus === "idle" || superAdminStatus === "checking" || isSuperAdmin) return;
    setErrorMessage("Super Admin access is restricted to accounts authorized in the database.");
    setActiveSection("dashboard");
  }, [activeSection, isSuperAdmin, superAdminStatus]);
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
  const activeMemberIds = new Set(activeMembers.map((member) => member.id));
  const dashboardActiveMemberships = dashboardGroupMemberships.filter((member) => member.membership_status === "active");
  const dashboardActiveMemberIds = new Set(dashboardActiveMemberships.map((member) => member.user_id).filter(Boolean));
  const dashboardActiveMembers = dashboardGroupMembershipsAvailable
    ? profiles.filter((member) => member.is_active && dashboardActiveMemberIds.has(member.id))
    : [];
  const dashboardActiveMemberCount = dashboardGroupMembershipsAvailable ? dashboardActiveMemberships.length : null;
  const pausedMembersCount = profiles.filter((member) => !member.is_active).length;
  const memberUserCount = profiles.filter((member) => member.role === "user").length;
  const unreadNotifications = notifications.filter(
    (notification) => !notification.read_at && !notification.archived_at
  );
  const inboxMessages = [...messages]
    .filter((message) =>
      Boolean(message.recipient_id) &&
      (isAdmin || message.sender_id === user.id || message.recipient_id === user.id)
    )
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
  const orderedMessages = [...inboxMessages].sort(
    (left, right) => new Date(left.created_at) - new Date(right.created_at)
  );
  const currentMember = profiles.find((member) => member.id === user.id) ?? profile;
  const myPersonalBibleReadings = personalBibleReadings.filter((reading) => reading.user_id === user.id);
  const personalBibleStats = summarizePersonalReadings(myPersonalBibleReadings, liveNow);
  const ownDashboardBirthday = dashboardBirthdays.find((member) => member.user_id === user.id) || null;
  const birthdayRecordName = ownDashboardBirthday?.full_name === "Community member" ? "" : ownDashboardBirthday?.full_name;
  const currentDisplayName =
    currentMember?.full_name?.trim() ||
    birthdayRecordName ||
    currentMember?.email?.split("@")[0] ||
    user.email?.split("@")[0] ||
    "Friend";
  const currentFirstName = currentDisplayName.trim().split(/\s+/)[0] || "Friend";
  const greetingMessage = `${getGreeting(liveNow)}, ${currentFirstName}`;
  const isBirthdayToday = Number(ownDashboardBirthday?.days_until) === 0;
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
      userId: eventRecord.created_by,
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
      userId: taskRecord.assignee_id,
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
      userId: message.sender_id,
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
      userId: prayer.is_anonymous ? null : prayer.created_by,
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
      userId: classItem.created_by,
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
  const localToday = getLocalReadingDate(liveNow);
  const visibleGroupReadings = bibleStudyReadings.filter((reading) => reading.deleted_at == null && !["draft", "archived"].includes(reading.status));
  const bibleToday = visibleGroupReadings.find((reading) => reading.reading_date === localToday) || visibleGroupReadings.filter((reading) => reading.reading_date <= localToday).at(-1) || visibleGroupReadings[0];
  const groupReadingsToDate = visibleGroupReadings.filter((reading) => reading.reading_date <= localToday);
  const groupReadingIdsToDate = new Set(groupReadingsToDate.map((reading) => reading.id));
  const groupSubmissions = dashboardGroupMembershipsAvailable
    ? bibleStudyCompletions.filter((row) => groupReadingIdsToDate.has(row.reading_id) && dashboardActiveMemberIds.has(row.user_id)).length
    : null;
  const expectedGroupSubmissions = dashboardActiveMemberCount == null ? null : dashboardActiveMemberCount * groupReadingsToDate.length;
  const groupSubmissionRate = expectedGroupSubmissions == null
    ? null
    : expectedGroupSubmissions ? Math.min(100, Math.round(groupSubmissions / expectedGroupSubmissions * 100)) : 0;
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
  const activeSectionLabel = activeSection === "super-admin" ? "Super Admin" : sections.find((section) => section.id === activeSection)?.label ?? "Dashboard";
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

    if (table === "prayer_point_replies") {
      announceActivity({
        title: "New prayer wall encouragement",
        body: truncateText(record.body, 96),
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
    const root = document.documentElement;
    if (isAdminWorkspace) root.dataset.appWorkspace = "admin";
    else root.removeAttribute("data-app-workspace");
    return () => root.removeAttribute("data-app-workspace");
  }, [isAdminWorkspace]);

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

    setProfileForm({ full_name: currentMember.full_name ?? "" });
  }, [currentMember?.full_name]);

  useEffect(() => {
    if (!profilePhotoFile) {
      setProfilePhotoPreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(profilePhotoFile);
    setProfilePhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [profilePhotoFile]);

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
      prayer_point_replies: new Set(),
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
    if (!supabase || !user || !activeCellGroupId) {
      setLoading(false);
      return;
    }

    if (options.showLoader) {
      setLoading(true);
    }

    const byGroup = (table) => supabase.from(table).select("*").eq("group_id", activeCellGroupId);
    const results = await Promise.all([
      byGroup("events").order("starts_at", { ascending: true }),
      byGroup("event_ideas").order("created_at", { ascending: false }),
      byGroup("idea_votes"),
      byGroup("tasks").order("created_at", { ascending: false }),
      byGroup("rsvps"),
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      byGroup("messages").order("created_at", { ascending: false }),
      byGroup("prayer_points").order("created_at", { ascending: false }),
      byGroup("resources").order("created_at", { ascending: false }),
      byGroup("notifications")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      byGroup("leadership_assignments").order("assignment_date", { ascending: true }),
      byGroup("event_check_ins").order("checked_in_at", { ascending: false }),
      Promise.resolve({ data: [], error: null }),
      byGroup("prayer_reminders").order("created_at", { ascending: false }),
      byGroup("virtual_meetings").order("starts_at", { ascending: true }),
      byGroup("virtual_meeting_attendance").order("joined_at", { ascending: false }),
      byGroup("reactions").order("created_at", { ascending: false }),
      byGroup("discipleship_classes").order("starts_at", { ascending: true }),
      byGroup("discipleship_class_sessions").order("starts_at", { ascending: true }),
      byGroup("discipleship_enrollments"),
      byGroup("discipleship_lessons").order("sort_order", { ascending: true }),
      byGroup("discipleship_lesson_completions"),
      byGroup("discipleship_assignment_submissions"),
      byGroup("discipleship_submission_history").order("created_at", { ascending: false }),
      byGroup("discipleship_member_notes"),
      byGroup("discipleship_session_attendance"),
      byGroup("discipleship_discussions").order("created_at", { ascending: true }),
      byGroup("bible_study_readings").order("sort_order"),
      byGroup("bible_study_takeaways").order("created_at", { ascending: false }),
      byGroup("bible_study_takeaway_replies").order("created_at", { ascending: false }),
      byGroup("bible_study_questions").order("created_at", { ascending: false }),
      byGroup("bible_study_question_answers").order("created_at", { ascending: false }),
      byGroup("bible_study_completions"),
      byGroup("bible_study_partner_streaks").order("created_at", { ascending: false }),
      Promise.resolve({ data: [], error: null }),
      byGroup("prayer_point_replies").order("created_at", { ascending: true }),
      supabase.from("personal_bible_study_readings").select("id,user_id,book,chapter,reading_date,status,completed_at,created_at").eq("user_id", user.id).order("reading_date", { ascending: true }),
      supabase.rpc("fun_zone_my_summary"),
      supabase.rpc("bible_streak_my_summary"),
      supabase.from("bible_streak_achievements").select("user_id,milestone_days,earned_on").eq("user_id", user.id).order("milestone_days"),
      supabase.rpc("bible_streak_get_settings"),
      isAdminWorkspace
        ? supabase.from("cell_group_members").select("user_id,membership_status").eq("cell_group_id", activeCellGroupId)
        : Promise.resolve({ data: [], error: null })
    ]);

    setTextPostThemesAvailable(false);

    setPersonalBibleAvailable(!results[36]?.error);
    setFunZoneAvailable(!results[37]?.error);
    setPersonalBibleStreakAvailable(!results[38]?.error && !results[39]?.error);
    const streakSettings = results[40]?.data;
    const groupCompletionPercent = Number(streakSettings?.group_completion_percent);
    setDashboardGroupCompletionSettingsAvailable(!results[40]?.error);
    setDashboardGroupCompletionPercent(groupCompletionPercent > 0 && groupCompletionPercent <= 100 ? groupCompletionPercent : 50);
    const failingResult = results.find((result, index) => result.error && index !== 34 && index !== 35 && index !== 36 && index !== 37 && index !== 38 && index !== 39 && index !== 40 && index !== 41);

    if (failingResult?.error) {
      setErrorMessage(failingResult.error.message);
      setLoading(false);
      return;
    }

    const scopedAnnouncements = await Promise.all((results[12].data ?? []).map(async (announcement) => {
      const originalAttachments = Array.isArray(announcement.attachments) ? announcement.attachments : [];
      const attachmentPaths = originalAttachments.map((attachment) => privateStoragePath(attachment, "announcement-images"));
      const attachments = await Promise.all(originalAttachments.map(async (attachment, index) => {
        const path = attachmentPaths[index];
        if (!path) return attachment;
        const { data, error } = await supabase.storage.from("announcement-images").createSignedUrl(path, 3600);
        return error ? "" : data?.signedUrl || "";
      }));
      return { ...announcement, attachment_paths: attachmentPaths, attachments: attachments.filter(Boolean) };
    }));

    startTransition(() => {
      setEvents(results[0].data ?? []);
      setIdeas(results[1].data ?? []);
      setVotes(results[2].data ?? []);
      setTasks(results[3].data ?? []);
      setRsvps(results[4].data ?? []);
      setProfiles(results[5].data ?? []);
      setMessages(results[6].data ?? []);
      setPrayerPoints(results[7].data ?? []);
      setPrayerReplies(results[35]?.data ?? []);
      setPrayerRepliesAvailable(!results[35]?.error);
      setResources(results[8].data ?? []);
      setNotifications(results[9].data ?? []);
      setLeadershipAssignments(results[10].data ?? []);
      setEventCheckIns(results[11].data ?? []);
      setAnnouncements(scopedAnnouncements);
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
      setAnnouncementRepliesAvailable(false);
      setPersonalBibleReadings(results[36]?.data ?? []);
      setFunZoneSummary(results[37]?.data?.[0] ?? results[37]?.data ?? null);
      setPersonalBibleStreakSummary(results[38]?.data?.summary ?? results[38]?.data?.[0] ?? results[38]?.data ?? null);
      setPersonalBibleAchievements(results[39]?.data ?? []);
      setDashboardGroupMemberships(results[41]?.data ?? []);
      setDashboardGroupMembershipsAvailable(isAdminWorkspace && !results[41]?.error);
    });

    if (!hasSeededRealtimeIdsRef.current) {
      knownRealtimeIdsRef.current = {
        events: new Set((results[0].data ?? []).map((event) => event.id)),
        event_ideas: new Set((results[1].data ?? []).map((idea) => idea.id)),
        tasks: new Set((results[3].data ?? []).map((task) => task.id)),
        messages: new Set((results[6].data ?? []).map((message) => message.id)),
        prayer_points: new Set((results[7].data ?? []).map((prayer) => prayer.id)),
        prayer_point_replies: new Set((results[35]?.data ?? []).map((reply) => reply.id)),
        leadership_assignments: new Set(
          (results[10].data ?? []).map((assignment) => assignment.id)
        ),
        notifications: new Set(
          (results[9].data ?? []).map((notification) => notification.id)
        ),
        event_check_ins: new Set((results[11].data ?? []).map((checkIn) => checkIn.id)),
        announcements: new Set(scopedAnnouncements.map((announcement) => announcement.id)),
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
    if (!supabase || !user?.id) {
      setCellGroups([]);
      setActiveCellGroupId("");
      return;
    }
    let current = true;
    async function loadCellGroup() {
      const { error: ensureError } = await supabase.rpc("ensure_default_cell_group");
      if (ensureError) {
        if (current) setErrorMessage(ensureError.message);
        return;
      }
      const { data, error } = await supabase
        .from("cell_groups")
        .select("id,name,is_primary,management_only,leader_id,timezone,created_at")
        .eq("is_primary", true)
        .eq("management_only", false)
        .is("archived_at", null)
        .maybeSingle();
      if (!current) return;
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      const availableGroups = data ? [data] : [];
      setCellGroups(availableGroups);
      setActiveCellGroupId(availableGroups[0]?.id || "");
    }
    void loadCellGroup();
    return () => { current = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id || !activeCellGroupId) {
      setDashboardBirthdays([]);
      setBirthdayBoardLoading(false);
      setBirthdayBoardUnavailable(false);
      return undefined;
    }

    let current = true;
    const timeZone = cellGroup?.timezone || "UTC";
    setBirthdayBoardLoading(true);

    async function loadDashboardBirthdays() {
      let birthdays = [];
      let unavailable = false;
      const { data, error } = await supabase.rpc("get_dashboard_birthdays", { p_cell_group_id: activeCellGroupId });

      if (!error && Array.isArray(data)) {
        birthdays = data.map((member) => {
          const birthMonth = Number(member.birth_month);
          const birthDay = Number(member.birth_day);
          return {
            ...member,
            days_until: Number(member.days_until),
            birth_month: birthMonth,
            birth_day: birthDay,
            display_date: formatBirthdayDate(birthMonth, birthDay)
          };
        }).filter((member) => member.user_id && member.display_date && Number.isInteger(member.days_until) && member.days_until >= 0 && member.days_until <= 30);
      } else {
        unavailable = true;
        let ownResult = await supabase
          .from("cell_group_members")
          .select("user_id,full_name,birth_day,birth_month,date_of_birth")
          .eq("cell_group_id", activeCellGroupId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (ownResult.error) {
          ownResult = await supabase
            .from("cell_group_members")
            .select("user_id,full_name,date_of_birth")
            .eq("cell_group_id", activeCellGroupId)
            .eq("user_id", user.id)
            .maybeSingle();
        }

        if (!ownResult.error && ownResult.data) {
          const occurrence = getBirthdayOccurrence(ownResult.data, new Date(), timeZone);
          if (occurrence && occurrence.daysUntil <= 30) {
            birthdays = [{
              ...ownResult.data,
              full_name: profile?.full_name || ownResult.data.full_name || "Friend",
              birth_month: occurrence.month,
              birth_day: occurrence.day,
              days_until: occurrence.daysUntil,
              display_date: formatBirthdayDate(occurrence.month, occurrence.day)
            }];
          }
        }
      }

      if (!current) return;
      setDashboardBirthdays(birthdays);
      setBirthdayBoardUnavailable(unavailable);
      setBirthdayBoardLoading(false);

      const ownBirthday = birthdays.find((member) => member.user_id === user.id && member.days_until === 0);
      if (!ownBirthday) {
        setBirthdayExperienceOpen(false);
        setBirthdayExperienceReopened(false);
        return;
      }

      const claimDate = getLocalDateKey(new Date(), timeZone);
      const claimKey = `${user.id}:${activeCellGroupId}:${claimDate}`;
      let claimPromise = birthdayClaimPromisesRef.current.get(claimKey);
      if (!claimPromise) {
        claimPromise = (async () => {
          let result;
          try {
            result = await supabase.rpc("claim_my_birthday_celebration");
          } catch {
            result = { error: true };
          }
          if (!result.error) return result.data === true;
          try {
            const localKey = `city-on-a-hill:birthday-celebration:${user.id}:${claimDate}`;
            if (window.localStorage.getItem(localKey)) return false;
            window.localStorage.setItem(localKey, "shown");
            return true;
          } catch {
            return true;
          }
        })();
        birthdayClaimPromisesRef.current.set(claimKey, claimPromise);
        void claimPromise.then(() => {
          if (birthdayClaimPromisesRef.current.get(claimKey) === claimPromise) {
            birthdayClaimPromisesRef.current.delete(claimKey);
          }
        });
      }

      const shouldOpen = await claimPromise;
      if (current && shouldOpen) {
        setBirthdayExperienceReopened(false);
        setBirthdayExperienceOpen(true);
      }
    }

    void loadDashboardBirthdays().catch((error) => {
      if (!current) return;
      setDashboardBirthdays([]);
      setBirthdayBoardUnavailable(true);
      setBirthdayBoardLoading(false);
      console.error("Could not load the dashboard birthday board", error);
    });

    return () => { current = false; };
  }, [activeCellGroupId, cellGroup?.timezone, getLocalDateKey(liveNow, cellGroup?.timezone || "UTC"), profile?.full_name, user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id || !activeCellGroupId) return;
    void loadAppData({ showLoader: true });
  }, [user?.id, activeCellGroupId]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let current = true;
    const refreshAccessibleGroups = async () => {
      const { data, error } = await supabase
        .from("cell_groups")
        .select("id,name,is_primary,management_only,leader_id,timezone,created_at")
        .eq("is_primary", true)
        .eq("management_only", false)
        .is("archived_at", null)
        .maybeSingle();
      if (!current || error) return;
      const availableGroups = data ? [data] : [];
      setCellGroups(availableGroups);
      setActiveCellGroupId(availableGroups[0]?.id || "");
    };
    const channel = supabase.channel(`cell-group-access-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_groups" }, () => void refreshAccessibleGroups())
      .subscribe();
    return () => {
      current = false;
      void supabase.removeChannel(channel);
    };
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
      "bible_study_readings",
      "bible_study_completions",
      "bible_study_takeaways",
      "bible_study_takeaway_replies",
      "bible_study_questions",
      "bible_study_question_answers"
    ];
    if (prayerRepliesAvailable) {
      tables.push("prayer_point_replies");
    }
    if (personalBibleAvailable && activeSection !== "bible-study") {
      tables.push("personal_bible_study_readings");
    }
    if (personalBibleStreakAvailable && activeSection !== "bible-study") {
      tables.push("bible_streak_achievements", "bible_streak_freeze_usage", "bible_streak_settings");
    }
    if (funZoneAvailable) {
      tables.push("fun_zone_point_transactions");
    }
    if (isAdminWorkspace) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cell_group_members", filter: `cell_group_id=eq.${activeCellGroupId}` },
        () => void loadAppData()
      );
    }
    const notifiableTables = [
      "events",
      "event_ideas",
      "tasks",
      "messages",
      "prayer_points",
      "prayer_point_replies",
      "notifications",
      "leadership_assignments",
      "virtual_meetings",
      "event_check_ins",
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
        { event: "*", schema: "public", table, ...(
          table === "profiles" || table === "bible_streak_settings" ? {} : ["personal_bible_study_readings", "bible_streak_achievements", "bible_streak_freeze_usage"].includes(table)
            ? { filter: `user_id=eq.${user.id}` }
            : { filter: `group_id=eq.${activeCellGroupId}` }
        ) },
        () => {
          void loadAppData();
        }
      );
    });

    notifiableTables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table, filter: `group_id=eq.${activeCellGroupId}` },
        (payload) => {
          handleRealtimeInsert(table, payload.new);
        }
      );
    });

    let liveChannelConnected = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (liveChannelConnected) void loadAppData();
        liveChannelConnected = true;
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, profiles, messages, notificationPermission, announcementRepliesAvailable, prayerRepliesAvailable, personalBibleAvailable, personalBibleStreakAvailable, funZoneAvailable, activeCellGroupId, activeSection, isAdminWorkspace]);

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
            group_id: activeCellGroupId,
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

  function handleProfilePhotoChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Choose an image smaller than 5 MB.");
      return;
    }
    clearFeedback();
    setProfilePhotoFile(file);
    setRemoveProfilePhotoOnSave(false);
  }

  function stageProfilePhotoRemoval() {
    setProfilePhotoFile(null);
    setProfilePhotoPreview("");
    setRemoveProfilePhotoOnSave(Boolean(currentMember?.profile_photo_path));
    clearFeedback();
  }

  async function saveProfileDetails(event) {
    event.preventDefault();
    const displayName = profileForm.full_name.trim();
    if (!displayName) {
      setErrorMessage("Enter a display name before saving.");
      return;
    }

    await runAction(async () => {
      const oldPhotoPath = currentMember?.profile_photo_path || null;
      let nextPhotoPath = oldPhotoPath;
      let uploadedPhotoPath = "";
      if (profilePhotoFile) {
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[profilePhotoFile.type];
        const uniqueName = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        uploadedPhotoPath = `${user.id}/${uniqueName}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("profile-photos").upload(uploadedPhotoPath, profilePhotoFile, {
          contentType: profilePhotoFile.type,
          cacheControl: "3600",
          upsert: false
        });
        if (uploadError) throw uploadError;
        nextPhotoPath = uploadedPhotoPath;
      } else if (removeProfilePhotoOnSave) {
        nextPhotoPath = null;
      }

      const profileUpdate = { full_name: displayName };
      if (profilePhotoFile || removeProfilePhotoOnSave) profileUpdate.profile_photo_path = nextPhotoPath;
      const { data: savedProfile, error } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (error || !savedProfile) {
        if (uploadedPhotoPath) {
          try {
            const { error: cleanupError } = await supabase.storage.from("profile-photos").remove([uploadedPhotoPath]);
            if (cleanupError) console.error("An unlinked profile photo could not be removed:", cleanupError);
          } catch (cleanupError) {
            console.error("An unlinked profile photo could not be removed:", cleanupError);
          }
        }
        throw error || new Error("Profile changes could not be saved. Check your access and try again.");
      }

      if (oldPhotoPath && oldPhotoPath !== nextPhotoPath && oldPhotoPath.startsWith(`${user.id}/`)) {
        try {
          const { error: removeError } = await supabase.storage.from("profile-photos").remove([oldPhotoPath]);
          if (removeError) console.error("The previous profile photo could not be removed:", removeError);
        } catch (removeError) {
          console.error("The previous profile photo could not be removed:", removeError);
        }
      }

      setProfiles((current) => current.map((member) => member.id === user.id
        ? { ...member, full_name: displayName, profile_photo_path: nextPhotoPath }
        : member));
      setProfileForm({ full_name: displayName });
      setProfilePhotoFile(null);
      setRemoveProfilePhotoOnSave(false);
      await refreshProfile();
    }, "Profile updated.");
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
  }

  function replyToMessage(message) {
    const replyTargetId = getReplyTargetId(message);

    if (!replyTargetId) {
      setErrorMessage("Choose a direct conversation to reply to.");
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

    if (!messageRecipients.some((member) => member.id === messageForm.recipient_id)) {
      setErrorMessage("Choose an active member to send a direct message.");
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("messages").insert({
        group_id: activeCellGroupId,
        sender_id: user.id,
        recipient_id: messageForm.recipient_id,
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
    if (prayerSubmitting) return;
    setPrayerSubmitting(true);
    clearFeedback();
    const prayerIdBeingEdited = editingPrayerId;
    const prayerPayload = {
      title: prayerForm.title.trim(),
      details: prayerForm.details.trim(),
      is_anonymous: prayerForm.is_anonymous
    };
    try {
      const result = prayerIdBeingEdited
        ? await supabase.from("prayer_points").update(prayerPayload).eq("id", prayerIdBeingEdited).eq("created_by", user.id).select("*").single()
        : await supabase.from("prayer_points").insert({
            group_id: activeCellGroupId,
            ...prayerPayload,
            created_by: user.id
          }).select("*").single();

      if (result.error) throw result.error;
      setPrayerPoints((current) => prayerIdBeingEdited
        ? current.map((item) => item.id === prayerIdBeingEdited ? result.data : item)
        : [result.data, ...current]);
      setPrayerForm(emptyPrayerForm);
      setEditingPrayerId("");
      setStatusMessage(prayerIdBeingEdited ? "Prayer request updated." : "Prayer request shared with the community.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setPrayerSubmitting(false);
    }
  }

  async function updatePrayerStatus(prayerPoint, nextStatus) {
    const actionKey = `status:${prayerPoint.id}`;
    if (prayerBusyIds.has(actionKey)) return;
    const previousStatus = prayerPoint.status;
    setPrayerBusyIds((current) => new Set(current).add(actionKey));
    setPrayerPoints((current) => current.map((item) => item.id === prayerPoint.id ? { ...item, status: nextStatus } : item));
    clearFeedback();
    try {
      const { error } = await supabase
        .from("prayer_points")
        .update({ status: nextStatus })
        .eq("id", prayerPoint.id);

      if (error) {
        throw error;
      }
      setStatusMessage(nextStatus === "answered" ? "Marked as answered. Thank you for praying." : nextStatus === "prayed" ? "Marked as prayed for." : "Prayer request reopened.");
    } catch (error) {
      setPrayerPoints((current) => current.map((item) => item.id === prayerPoint.id ? { ...item, status: previousStatus } : item));
      setErrorMessage(error.message);
    } finally {
      setPrayerBusyIds((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  }

  async function handlePrayerReplySubmit(event, prayerPointId) {
    event.preventDefault();
    const body = (prayerReplyDrafts[prayerPointId] ?? "").trim();
    if (!body || prayerReplyBusy === prayerPointId || !prayerRepliesAvailable) return;
    setPrayerReplyBusy(prayerPointId);
    clearFeedback();
    try {
      const { data, error } = await supabase.from("prayer_point_replies").insert({
        prayer_point_id: prayerPointId,
        user_id: user.id,
        body
      }).select("*").single();
      if (error) throw error;
      setPrayerReplies((current) => [...current, data]);
      setPrayerReplyDrafts((current) => ({ ...current, [prayerPointId]: "" }));
      setStatusMessage("Your encouragement was shared.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setPrayerReplyBusy("");
    }
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
        const filePath = `${activeCellGroupId}/${user.id}/resource-${Date.now()}-${selectedResourceFile.name.replace(/\s+/g, "-")}`;
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
            group_id: activeCellGroupId,
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

  async function openResource(resource) {
    if (resource.resource_type === "pdf" && resource.file_path) {
      const { data, error } = await supabase.storage.from("resources").createSignedUrl(resource.file_path, 3600);
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
            group_id: activeCellGroupId,
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
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("user_id", user.id)
        .eq("group_id", activeCellGroupId);

      if (error) {
        throw error;
      }
    }, "Notification deleted.");
  }

  async function deleteAllNotifications() {
    const ownNotificationIds = notifications
      .filter(
        (notification) =>
          notification.user_id === user.id &&
          notification.group_id === activeCellGroupId
      )
      .map((notification) => notification.id);

    if (!ownNotificationIds.length) {
      return;
    }

    if (!window.confirm(`Delete all ${ownNotificationIds.length} of your notifications? This cannot be undone.`)) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .in("id", ownNotificationIds)
        .eq("user_id", user.id)
        .eq("group_id", activeCellGroupId);

      if (error) {
        throw error;
      }
    }, "All notifications deleted.");
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
    const bibleStudyNotification = (typeof targetTable === "string" && targetTable.startsWith("bible_study_"))
      || (typeof notification.notification_type === "string" && notification.notification_type.startsWith("bible_study_"));
    const partnerStreakNotification = targetTable === "bible_study_partnerships"
      || (typeof targetTable === "string" && targetTable.startsWith("bible_study_partner_"))
      || (bibleStudyNotification && /partnership|partner|shared reading milestone|everyone completed/i.test(`${notification.title || ""} ${notification.body || ""}`));

    if (partnerStreakNotification) {
      setFocusBiblePartnerStreaks(true);
      setActiveSection("bible-study");
    } else if (bibleStudyNotification) {
      setActiveSection("bible-study");
    } else if (targetTable === "cell_group_members" && targetId) {
      setBirthdayFocusMemberId(targetId);
      setActiveSection("birthdays");
    } else if (targetTable === "events" && targetId) {
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
          const path = `${activeCellGroupId}/${user.id}/${crypto.randomUUID()}-${photo.file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
          const { error: uploadError } = await supabase.storage.from("announcement-images").upload(path, photo.file, { contentType: photo.file.type, upsert: false });
          if (uploadError) throw uploadError;
          uploadedPaths.push(path);
          uploadedUrls.push(path);
        }
      const payload = {
        // The database retains a required title for existing compatibility. `headline`
        // tells the feed whether this stored fallback is an actual visible headline.
        title: announcementForm.title.trim() || "Community update",
        body: announcementForm.body.trim(),
        pinned: isAdmin ? announcementForm.pinned : false,
        ...(textPostThemesAvailable ? {
          presentation: {
            font: announcementTextFont,
            color: announcementTextColor,
            headline: Boolean(announcementForm.title.trim()),
            ...(uploadedUrls.length || (editingAnnouncementId && announcements.find((item) => item.id === editingAnnouncementId)?.attachments?.length)
              ? {}
              : { kind: "text", theme: announcementTextTheme })
          }
        } : {}),
        attachments: [
          ...(editingAnnouncementId ? announcements.find((item) => item.id === editingAnnouncementId)?.attachment_paths ?? announcements.find((item) => item.id === editingAnnouncementId)?.attachments ?? [] : []),
          ...uploadedUrls
        ]
      };
      const query = editingAnnouncementId
        ? supabase.from("announcements").update(payload).eq("id", editingAnnouncementId)
        : supabase.from("announcements").insert({
            ...payload,
            group_id: activeCellGroupId,
            created_by: user.id
          });
      const { error } = await query;

      if (error) {
        throw error;
      }

      setAnnouncementForm(emptyAnnouncementForm);
      setAnnouncementTextTheme("sunrise");
      setAnnouncementTextFont("default");
      setAnnouncementTextColor("auto");
      setEditingAnnouncementId("");
      announcementPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      setAnnouncementPhotos([]);
      setPulseComposerOpen(false);
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
    setAnnouncementTextTheme(
      announcement.presentation?.kind === "text" ? announcement.presentation.theme || "sunrise" : "sunrise"
    );
    setAnnouncementTextFont(announcement.presentation?.font || "default");
    setAnnouncementTextColor(announcement.presentation?.color || "auto");
    setPulseComposerOpen(true);
  }

  function openCommunityPost(announcementId) {
    setAnnouncementFeedFilter("all");
    setPulseSearchQuery("");
    setAnnouncementToFocus(announcementId);
    setActiveSection("announcements");
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

  async function sendPulseLoungeMessage(event) {
    event.preventDefault();
    const content = pulseMessageDraft.trim();
    if (!content) return;
    await runAction(async () => {
      const query = pulseEditingMessageId
        ? supabase.from("messages").update({ content }).eq("id", pulseEditingMessageId).eq("sender_id", user.id)
        : supabase.from("messages").insert({
            group_id: activeCellGroupId,
            sender_id: user.id,
            recipient_id: null,
            title: "",
            content,
            reply_to_message_id: pulseReplyTargetId || null
          });
      const { error } = await query;
      if (error) throw error;
      setPulseMessageDraft("");
      setPulseReplyTargetId("");
      setPulseEditingMessageId("");
    }, pulseEditingMessageId ? "Live Lounge message updated." : "Shared in the Live Lounge.");
  }

  function renderAnnouncementsSection() {
    const isLoungePage = activeSection === "live-lounge";
    const cutoff = new Date(liveNow).getTime() - 7 * 24 * 60 * 60 * 1000;
    const feedAnnouncements = sortedAnnouncements.filter((announcement) => {
      if (announcementFeedFilter === "mine") return announcement.created_by === user?.id;
      if (announcementFeedFilter === "recent") return new Date(announcement.created_at).getTime() >= cutoff;
      return true;
    }).filter((announcement) => {
      const query = pulseSearchQuery.trim().toLocaleLowerCase();
      if (!query) return true;
      const author = profiles.find((member) => member.id === announcement.created_by);
      return [announcement.title, announcement.body, author?.full_name]
        .some((value) => value?.toLocaleLowerCase().includes(query));
    });
    const loungeMessages = messages.filter((message) => message.recipient_id === null)
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at)).slice(0, 4);
    const liveEvent = sortedEvents.find((event) => event.ends_at && new Date(event.starts_at) <= liveNow && new Date(event.ends_at) >= liveNow);
    const nextPulseEvent = sortedEvents.find((event) => new Date(event.starts_at) > liveNow);
    const currentPulseActivity = liveEvent || loungeMessages.some((message) => liveNow.getTime() - new Date(message.created_at).getTime() < 30 * 60 * 1000);
    const conversationPost = announcements.find((announcement) => announcement.id === pulseConversationId);
    const conversationReplies = announcementReplies.filter((reply) => reply.announcement_id === pulseConversationId);
    return (
      <div className="section-stack community-feed gc-pulse-page">
        <header className="gc-pulse-header">
          <div className="gc-pulse-heading-copy">
            <p className="gc-pulse-kicker">{APP_NAME.toUpperCase()} · {CELL_GROUP_NAME.toUpperCase()}</p>
            <h1>{isLoungePage ? "Live Lounge" : "GC Pulse"}</h1>
            <p>{isLoungePage ? "A relaxed place for real-time fellowship and conversation." : "Your community feed for updates, moments, and encouragement."}</p>
          </div>
          <div className="gc-pulse-header-state">
            <span className={currentPulseActivity ? "gc-pulse-live-indicator is-live" : "gc-pulse-live-indicator"}><i />{currentPulseActivity ? "Live now" : "Community space"}</span>
            {!isLoungePage && pulseTab === "feed" ? <label className="gc-pulse-search"><span className="sr-only">Search GC Pulse posts</span><input type="search" value={pulseSearchQuery} onChange={(event) => setPulseSearchQuery(event.target.value)} placeholder="Search the pulse" /><NavIcon name="search" /></label> : null}
          </div>
        </header>

        {!announcementRepliesAvailable ? <div className="banner info">Community posting, replies, and image attachments require the additive announcements migration in <code>supabase/announcements-community-migration.sql</code>.</div> : null}

        {!isLoungePage ? <nav className="gc-pulse-experience-nav" aria-label="Community destinations">
          <button type="button" className={pulseTab==="feed"?"active":""} aria-pressed={pulseTab==="feed"} onClick={()=>setPulseTab("feed")}><NavIcon name="activity"/><span>Community Feed</span></button>
          <button type="button" onClick={()=>setActiveSection("live-lounge")}><NavIcon name="messages"/><span>Open Live Lounge</span>{loungeMessages.length?<small>{loungeMessages.length>99?"99+":loungeMessages.length}</small>:null}</button>
        </nav> : null}

        {!isLoungePage && pulseTab === "feed" ? <div className="gc-pulse-layout gc-pulse-layout--feed">
        <main className="gc-pulse-main-column">
        <Panel className="gc-pulse-composer-panel" title="Share with your people" subtitle="A small moment, an encouragement, or something worth celebrating.">
          {!pulseComposerOpen ? <button type="button" className="pulse-composer-launcher" onClick={() => setPulseComposerOpen(true)}>
            <IdentityBadge member={currentMember} size="small" />
            <span>What's happening with your people?</span>
            <b aria-hidden="true">+</b>
          </button> : <form className="stack-form announcement-composer" onSubmit={saveAnnouncement}>
            <label className="field">
              <span>Headline <small>(optional)</small></span>
              <input value={announcementForm.title} maxLength={180} placeholder="A short headline" onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="field">
              <span>Your update</span>
          <textarea value={announcementForm.body} maxLength={2500} rows={4} placeholder={`Share an update with ${CELL_GROUP_NAME}...`} required onChange={(event) => setAnnouncementForm((current) => ({ ...current, body: event.target.value }))} />
            </label>
            <div className="pulse-font-picker" role="group" aria-label="Post font">
              <span>Font</span>{pulseTextFonts.map((font) => <button key={font.id} type="button" className={`pulse-font-option pulse-font-${font.id}${announcementTextFont === font.id ? " active" : ""}`} aria-pressed={announcementTextFont === font.id} disabled={!textPostThemesAvailable} onClick={() => setAnnouncementTextFont(font.id)}>{font.label}</button>)}
            </div>
            <div className="pulse-color-picker" role="group" aria-label="Post text color">
              <span>Text color</span>{pulseTextColors.map((color) => <button key={color.id} type="button" className={`pulse-color-option pulse-color-${color.id}${announcementTextColor === color.id ? " active" : ""}`} aria-pressed={announcementTextColor === color.id} disabled={!textPostThemesAvailable} onClick={() => setAnnouncementTextColor(color.id)}><i aria-hidden="true" /><b>{color.label}</b></button>)}
            </div>
            {!announcementPhotos.length ? <div className="pulse-text-post-tools">
              <div><span>Text post style</span><small>{textPostThemesAvailable ? "Choose a background for a beautiful text-only post." : "Apply the text-post migration to save background styles."}</small></div>
              <div className="pulse-theme-picker" role="group" aria-label="Text post background">
                {pulseTextThemes.map((theme) => <button key={theme.id} type="button" className={`pulse-theme-swatch ${theme.id}${announcementTextTheme === theme.id ? " active" : ""}`} aria-pressed={announcementTextTheme === theme.id} disabled={!textPostThemesAvailable} onClick={() => setAnnouncementTextTheme(theme.id)}><span aria-hidden="true" /><b>{theme.label}</b></button>)}
              </div>
              <div className={`pulse-text-preview pulse-text-theme-${announcementTextTheme} pulse-font-${announcementTextFont} pulse-color-${announcementTextColor}${announcementForm.body.trim().length > 280 ? " is-long" : ""}`}>
                {announcementForm.title.trim() ? <strong className="pulse-text-preview-headline">{announcementForm.title.trim()}</strong> : null}
                <p>{announcementForm.body.trim() || "Your words will look beautiful here."}</p>
              </div>
            </div> : null}
            <label className="field announcement-photo-field">
              <span>Add photos</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadingAnnouncementPhotos || !announcementRepliesAvailable} onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                const valid = selected.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 8 * 1024 * 1024);
                if (valid.length !== selected.length) setErrorMessage("Choose JPEG, PNG, or WebP photos up to 8 MB each.");
                const prepared = valid.map((file) => ({ file, preview: URL.createObjectURL(file) })); const room = Math.max(0, 5 - announcementPhotos.length); prepared.slice(room).forEach((photo) => URL.revokeObjectURL(photo.preview)); setAnnouncementPhotos((current) => [...current, ...prepared.slice(0, room)]);
                event.target.value = "";
              }} />
              {announcementPhotos.length ? <div className="announcement-photo-previews">{announcementPhotos.map((photo, index) => <div key={`${photo.file.name}-${index}`}><img src={photo.preview} alt={`Selected photo ${index + 1}`} /><div className="pulse-preview-actions">{index > 0 ? <button type="button" aria-label={`Move ${photo.file.name} earlier`} onClick={() => setAnnouncementPhotos((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>←</button> : null}{index < announcementPhotos.length - 1 ? <button type="button" aria-label={`Move ${photo.file.name} later`} onClick={() => setAnnouncementPhotos((current) => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>→</button> : null}<button type="button" aria-label={`Remove ${photo.file.name}`} onClick={() => { URL.revokeObjectURL(photo.preview); setAnnouncementPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); }}>×</button></div></div>)}</div> : null}
            </label>
            <div className="form-actions">
              {isAdmin ? <label className="inline-checkbox"><input type="checkbox" checked={announcementForm.pinned} onChange={(event) => setAnnouncementForm((current) => ({ ...current, pinned: event.target.checked }))} /> Pin announcement</label> : null}
              <button type="submit" className="primary-button" disabled={!announcementRepliesAvailable || submitting || uploadingAnnouncementPhotos}>{uploadingAnnouncementPhotos ? "Uploading photos…" : submitting ? "Publishing…" : editingAnnouncementId ? "Save changes" : "Publish update"}</button>
              <button type="button" className="ghost-button" onClick={() => { announcementPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview)); setAnnouncementPhotos([]); setEditingAnnouncementId(""); setAnnouncementForm(emptyAnnouncementForm); setAnnouncementTextTheme("sunrise"); setAnnouncementTextFont("default"); setAnnouncementTextColor("auto"); setPulseComposerOpen(false); }}>Cancel</button>
            </div>
          </form>}
        </Panel>

        <div className="gc-pulse-feed-heading">
          <div><p className="gc-pulse-kicker">COMMUNITY MOMENTS</p><h2>The Feed</h2></div>
          <div className="announcement-feed-toolbar" role="group" aria-label="Filter community posts">
            {[['all','All'],['recent','Recent'],['mine','My posts']].map(([value,label]) => <button key={value} type="button" className={announcementFeedFilter===value?'active':''} aria-pressed={announcementFeedFilter===value} onClick={()=>setAnnouncementFeedFilter(value)}>{label}</button>)}
          </div>
        </div>
        <div className="community-feed-list">
          {feedAnnouncements.length ? feedAnnouncements.map((announcement) => {
            const author = profiles.find((member) => member.id === announcement.created_by);
            const canManage = isAdmin || announcement.created_by === user?.id;
            const textTheme = announcement.presentation?.kind === "text" && !announcement.attachments?.length
              ? announcement.presentation.theme || "sunrise"
              : "";
            const textFont = pulseTextFonts.some((font) => font.id === announcement.presentation?.font)
              ? announcement.presentation.font
              : "default";
            const textColor = pulseTextColors.some((color) => color.id === announcement.presentation?.color)
              ? announcement.presentation.color
              : "auto";
            const hasLikedPost = reactions.some((row) => row.entity_table === "announcements" && row.entity_id === announcement.id && row.user_id === user?.id && row.reaction === "like");
            const hasHeadline = announcement.presentation?.headline ?? Boolean(announcement.title && announcement.title !== "Community update");
            const textPostLayout = textTheme && announcement.body.length > 280 ? " is-long" : "";
            return <article key={announcement.id} id={`announcement-${announcement.id}`} tabIndex={-1} className={`community-post pulse-font-${textFont} pulse-color-${textColor}${textTheme ? ` pulse-text-post pulse-text-theme-${textTheme}${textPostLayout}` : ""}`}>
              <header className="community-post-header">
                <IdentityBadge member={author} size="small" />
                <div className="community-post-author"><strong>{author?.full_name || author?.email || "Community member"}</strong><time dateTime={announcement.created_at}>{formatDateTime(announcement.created_at)}{announcement.updated_at && announcement.updated_at !== announcement.created_at ? " · Edited" : ""}</time></div>
                {announcement.pinned ? <span className="pill info">Pinned</span> : null}
                {canManage ? <div className="community-post-actions"><button type="button" className="ghost-button compact" onClick={() => beginAnnouncementEdit(announcement)}>Edit</button><button type="button" className="ghost-button compact danger" onClick={() => deleteAnnouncement(announcement.id)}>Delete</button></div> : null}
              </header>
              {hasHeadline ? <h2 className="community-post-title">{announcement.title}</h2> : null}
              {textTheme ? <PulseTextLikeArea onLike={() => { if (!hasLikedPost) void toggleAnnouncementReaction({ entityTable: "announcements", entityId: announcement.id, reaction: "like" }); }}>{announcement.body}</PulseTextLikeArea> : <p className="community-post-body">{announcement.body}</p>}
              {Array.isArray(announcement.attachments) && announcement.attachments.length ? <PulseMediaCarousel attachments={announcement.attachments} title={announcement.title} onLike={() => { if (!hasLikedPost) void toggleAnnouncementReaction({ entityTable: "announcements", entityId: announcement.id, reaction: "like" }); }} /> : null}
              <AnnouncementReactions announcementId={announcement.id} reactions={reactions} profiles={profiles} userId={user?.id} disabled={submitting} onToggle={toggleAnnouncementReaction} onMessageShortcut={() => setActiveSection("messages")} />
              <button type="button" className="pulse-conversation-button" onClick={() => setPulseConversationId(announcement.id)}><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 18.5 3.5 20V6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 17H8.5L5 18.5Z" /><path d="M8 9h8M8 12.5h5" /></svg></span>{announcementReplies.filter((reply) => reply.announcement_id === announcement.id).length ? `View ${announcementReplies.filter((reply) => reply.announcement_id === announcement.id).length} conversation${announcementReplies.filter((reply) => reply.announcement_id === announcement.id).length === 1 ? "" : "s"}` : "Start the conversation"}</button>
            </article>;
          }) : <EmptyState title={announcements.length ? "No posts match this view" : "A fresh beginning"} description={announcements.length ? "Try another filter to see more community updates." : "There are no announcements yet. Share the first update with your community."} />}
        </div>
        </main>
        </div> : null}

        {(isLoungePage || pulseTab === "lounge") ? <div className="gc-pulse-layout gc-pulse-layout--lounge">
        <aside className="gc-pulse-side-rail" aria-label="Live community">
          <section className="gc-pulse-rail-panel gc-pulse-lounge">
            <div className="gc-pulse-rail-heading"><div><p className="gc-pulse-kicker">SAY HELLO</p><h2>Live Lounge</h2></div><span className={currentPulseActivity ? "gc-pulse-dot is-live" : "gc-pulse-dot"} aria-label={currentPulseActivity ? "Recent activity" : "No recent activity"} /></div>
            {loungeMessages.length ? <div className="gc-pulse-lounge-list">{loungeMessages.map((message) => {
              const author = getMember(message.sender_id);
              const repliedMessage = messages.find((candidate) => candidate.id === message.reply_to_message_id);
              return <article key={message.id} className="gc-pulse-lounge-message"><IdentityBadge member={author} size="small" /><div><div className="gc-pulse-lounge-meta"><strong>{getMemberLabel(message.sender_id)}</strong><time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time></div>{repliedMessage ? <p className="gc-pulse-lounge-reply">Replying to {getMemberLabel(repliedMessage.sender_id)}</p> : null}<p>{message.content}</p><div className="gc-pulse-lounge-actions"><ReactionBar entityTable="messages" entityId={message.id} /><button type="button" onClick={() => { setPulseEditingMessageId(""); setPulseMessageDraft(""); setPulseReplyTargetId(message.id); }}>Reply</button>{canDeleteMessage(message) ? <><button type="button" onClick={() => { setPulseEditingMessageId(message.id); setPulseReplyTargetId(""); setPulseMessageDraft(message.content); }}>Edit</button><button type="button" onClick={() => void deleteMessage(message)}>Delete</button></> : null}</div></div></article>;
            })}</div> : <p className="gc-pulse-rail-empty">No group messages yet. Start a friendly conversation.</p>}
            {pulseReplyTargetId || pulseEditingMessageId ? <div className="gc-pulse-replying"><span>{pulseEditingMessageId ? "Editing your message" : `Replying to ${getMemberLabel(messages.find((message) => message.id === pulseReplyTargetId)?.sender_id)}`}</span><button type="button" aria-label="Cancel" onClick={() => { setPulseReplyTargetId(""); setPulseEditingMessageId(""); setPulseMessageDraft(""); }}>×</button></div> : null}
            <form className="gc-pulse-lounge-form" onSubmit={sendPulseLoungeMessage}><input aria-label={pulseEditingMessageId ? "Edit Live Lounge message" : "Write to the Live Lounge"} value={pulseMessageDraft} onChange={(event) => setPulseMessageDraft(event.target.value)} maxLength={2000} placeholder="Say something kind…" /><button type="submit" aria-label={pulseEditingMessageId ? "Save message" : "Send message"} disabled={submitting || !pulseMessageDraft.trim()}>{pulseEditingMessageId ? "Save" : "Send"}</button></form>
            <button type="button" className="gc-pulse-text-link" onClick={() => setActiveSection("messages")}>Open all messages <span aria-hidden="true">→</span></button>
          </section>

          <section className="gc-pulse-rail-panel gc-pulse-next-event">
            <div className="gc-pulse-rail-heading"><div><p className="gc-pulse-kicker">UP NEXT</p><h2>Gather together</h2></div><NavIcon name="calendar" /></div>
            {liveEvent ? <div className="gc-pulse-event-feature"><span className="gc-pulse-event-status">HAPPENING NOW</span><h3>{liveEvent.title}</h3><p>{liveEvent.location || "Location details in Events"}</p><button type="button" onClick={() => { setSelectedEventId(liveEvent.id); setActiveSection("events"); }}>Open gathering</button></div> : nextPulseEvent ? <div className="gc-pulse-event-feature"><span className="gc-pulse-event-status">NEXT GATHERING</span><h3>{nextPulseEvent.title}</h3><p>{formatDateTime(nextPulseEvent.starts_at)}{nextPulseEvent.location ? ` · ${nextPulseEvent.location}` : ""}</p><button type="button" onClick={() => { setSelectedEventId(nextPulseEvent.id); setActiveSection("events"); }}>View event</button></div> : <p className="gc-pulse-rail-empty">There are no upcoming gatherings scheduled yet.</p>}
          </section>

          <section className="gc-pulse-rail-note"><NavIcon name="sparkles" /><p>Make room for encouragement, good questions, and the little moments that bring us together.</p></section>
        </aside>
        </div> : null}
        {conversationPost ? <PulseCommentsSheet post={conversationPost} replies={conversationReplies} profiles={profiles} reactions={reactions} userId={user?.id} isAdmin={isAdmin} submitting={submitting} draft={announcementReplyDrafts[conversationPost.id] ?? ""} onDraftChange={(value) => setAnnouncementReplyDrafts((current) => ({ ...current, [conversationPost.id]: value }))} onClose={() => setPulseConversationId("")} closeButtonRef={pulseOverlayCloseRef} onToggleReaction={toggleAnnouncementReaction} onManageReply={manageAnnouncementReply} onSubmit={submitAnnouncementReply} /> : null}
      </div>
    );
  }

  function renderEventsDirectorySection() {
    const query = eventSearchQuery.trim().toLocaleLowerCase();
    const matchesEvent = (item) => !query || `${item.title || ""} ${item.description || ""} ${item.location || ""}`.toLocaleLowerCase().includes(query);
    const upcoming = sortedEvents.filter((item) => new Date(item.starts_at) >= new Date(liveNow) && matchesEvent(item));
    const past = sortedEvents.filter((item) => new Date(item.starts_at) < new Date(liveNow) && matchesEvent(item)).reverse();
    const eventCard = (eventRecord) => <article key={eventRecord.id} className={`event-directory-card${selectedEventId === eventRecord.id ? " is-selected" : ""}${new Date(eventRecord.starts_at) >= new Date(liveNow) ? " is-upcoming" : " is-past"}`}>
      <div className="event-date-block"><strong>{new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(new Date(eventRecord.starts_at))}</strong><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(eventRecord.starts_at))}</span></div>
      <div className="event-directory-copy"><h3>{eventRecord.title}</h3><p>{formatDateTime(eventRecord.starts_at)}{eventRecord.location ? ` · ${eventRecord.location}` : ""}</p>{eventRecord.description ? <p className="muted-text">{eventRecord.description}</p> : null}</div>
      <div className="event-directory-actions"><span className={`pill ${new Date(eventRecord.starts_at) >= new Date(liveNow) ? "success" : ""}`}>{new Date(eventRecord.starts_at) >= new Date(liveNow) ? "Upcoming" : "Past"}</span>{new Date(eventRecord.starts_at) >= new Date(liveNow) ? <button type="button" className={rsvps.some((row) => row.event_id === eventRecord.id && row.user_id === user.id && row.status === "going") ? "accent-button compact" : "secondary-button compact"} onClick={() => void updateRsvp("going", eventRecord.id)}>{rsvps.some((row) => row.event_id === eventRecord.id && row.user_id === user.id && row.status === "going") ? "Going" : "RSVP"}</button> : null}<button type="button" className="ghost-button compact" onClick={() => setSelectedEventId(eventRecord.id)}>Details</button><button type="button" className="ghost-button compact" onClick={() => downloadEventCalendar(eventRecord)}>Calendar</button>{isAdmin ? <><button type="button" className="ghost-button compact" onClick={() => beginEventEdit(eventRecord)}>Edit</button><button type="button" className="ghost-button compact danger" onClick={() => deleteEvent(eventRecord.id)}>Delete</button></> : null}</div>
    </article>;
    return <div className="section-stack">
      <header className="page-intro page-intro--art"><div><p className="eyebrow">Gather together</p><h1>Events</h1><p>Find the next opportunity to worship, serve, and grow together.</p><div className="prayer-story-stats"><span><strong>{sortedEvents.filter((item) => new Date(item.starts_at) >= new Date(liveNow)).length}</strong> upcoming</span><span><strong>{sortedEvents.filter((item) => new Date(item.starts_at) < new Date(liveNow)).length}</strong> past gatherings</span></div></div></header>
      <div className="event-library-tools"><label className="feature-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search events</span><input type="search" value={eventSearchQuery} onChange={(event) => setEventSearchQuery(event.target.value)} placeholder="Search events, places, and details" /></label><span className="feature-filter-count" aria-live="polite">{upcoming.length + past.length} matching {upcoming.length + past.length === 1 ? "event" : "events"}{eventSearchQuery ? <button type="button" className="text-button" onClick={() => setEventSearchQuery("")}>Clear search</button> : null}</span></div>
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
      <Panel title="Upcoming events" subtitle="Your group's next gatherings.">{upcoming.length ? <div className="event-directory-list">{upcoming.map(eventCard)}</div> : <EmptyState title={sortedEvents.length && eventSearchQuery ? "No matching events" : "Nothing scheduled yet"} description={sortedEvents.length && eventSearchQuery ? "Try a different event search." : "New gatherings will appear here when they're planned."} />}</Panel>
      {past.length ? <Panel title="Past events" subtitle="Previous gatherings from your community."><div className="event-directory-list">{past.map(eventCard)}</div></Panel> : null}
      {selectedEvent ? <>
        <Panel title={selectedEvent.title} subtitle={`${formatDateTime(selectedEvent.starts_at)} · ${selectedEvent.location || "Location to be confirmed"}`}>
          {selectedEvent.description ? <p className="event-detail-description">{selectedEvent.description}</p> : null}
          <div className="event-detail-actions"><button type="button" className={rsvps.some((row) => row.event_id === selectedEvent.id && row.user_id === user.id && row.status === "going") ? "accent-button" : "primary-button"} onClick={() => void updateRsvp("going", selectedEvent.id)}>{rsvps.some((row) => row.event_id === selectedEvent.id && row.user_id === user.id && row.status === "going") ? "You're going" : "RSVP · Going"}</button><button type="button" className="secondary-button" onClick={() => void updateRsvp("not_going", selectedEvent.id)}>Can't attend</button><button type="button" className={currentUserCheckIn ? "accent-button" : "secondary-button"} disabled={checkingIn} onClick={() => void handleEventCheckIn(selectedEvent.id)}>{checkingIn ? "Checking in…" : currentUserCheckIn ? "Update check-in" : "Check in"}</button><button type="button" className="ghost-button" onClick={() => downloadEventCalendar(selectedEvent)}>Add to calendar</button></div>
          <div className="event-attendance-summary"><span>{attendingMembers.length} attending</span><span>{selectedCheckIns.length} checked in</span></div>
        </Panel>
        <div className="content-grid"><Panel title="Who's attending" subtitle="Member responses for this gathering.">{attendingMembers.length ? <div className="people-list">{attendingMembers.map((rsvp) => <div key={rsvp.user_id} className="person-row"><IdentityBadge member={getMember(rsvp.user_id)} size="small" /><strong>{getMemberLabel(rsvp.user_id)}</strong><span className="pill success">Going</span></div>)}</div> : <EmptyState title="No RSVPs yet" description="Member responses will appear here." />}</Panel>
          <Panel title="Arrival check-ins" subtitle="See who has arrived.">{selectedCheckIns.length ? <div className="people-list">{selectedCheckIns.map((checkIn) => <div key={checkIn.id} className="person-row"><IdentityBadge member={getMember(checkIn.user_id)} size="small" /><div><strong>{getMemberLabel(checkIn.user_id)}</strong><p>{formatDateTime(checkIn.checked_in_at)}</p></div><span className="pill success">Checked in</span></div>)}</div> : <EmptyState title="No check-ins yet" description="Members can check in when they arrive." />}</Panel></div>
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
        target_type: assignmentType,
        target_group_id: activeCellGroupId
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
            {partnerDashboardCards.length ? <div className="dashboard-partner-list">{partnerDashboardCards.map((item) => <button type="button" key={item.id} onClick={() => { setFocusBiblePartnerStreaks(true); setActiveSection("bible-study"); }}><span className="dashboard-partner-mark">◆</span><span className="dashboard-partner-identity"><IdentityBadge member={item.partner} size="small" /></span><span><strong>You & {item.partner?.full_name || "Partner"}</strong><small>{item.streak} day{item.streak === 1 ? "" : "s"} · {item.mine && item.theirs ? "Completed together" : item.mine ? `Waiting on ${item.partner?.full_name || "partner"}` : "Your reading is waiting"}</small></span><b>Open</b></button>)}</div> : <button type="button" className="dashboard-partner-start" onClick={() => { setFocusBiblePartnerStreaks(true); setActiveSection("bible-study"); }}>Start a Partner Streak</button>}
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

          {false && <Panel
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
          </Panel>}
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
            </div>
          </Panel>
        ) : null}

        {false ? (
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
    const latestAnnouncements = [...announcements]
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || new Date(right.created_at) - new Date(left.created_at))
      .slice(0, 3);
    const nextEvents = sortedEvents.filter((item) => new Date(item.starts_at) >= new Date(liveNow)).slice(0, 2);
    const upcomingBirthdays = dashboardBirthdays.slice(0, 4);
    const recentPrayerPoints = sortedPrayerPoints.slice(0, 3);
    const recentSharedTakeaways = bibleCommunityActivity.filter((item) => item.kind === "Takeaway").slice(0, 2);
    const recentDashboardNotifications = notifications
      .filter((notification) => !notification.archived_at)
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
      .slice(0, 2);
    const readingById = new Map(bibleStudyReadings.map((reading) => [reading.id, reading]));
    const recentGroupActivity = [
      ...recentActivity
        .filter((item) => ["Event", "Discipleship"].includes(item.kind))
        .map((item) => ({ id: item.id, title: item.title, kind: item.kind, meta: item.meta, createdAt: item.createdAt, userId: item.userId, section: item.kind === "Event" ? "events" : "assignments" })),
      ...bibleCommunityActivity
        .map((item) => ({ id: `${item.kind}-${item.id}`, title: truncateText(item.content, 76), kind: item.kind === "Takeaway" ? "Shared takeaway" : item.kind, meta: getMemberLabel(item.userId), createdAt: item.createdAt, userId: item.userId, section: "bible-study" })),
      ...[...bibleStudyCompletions]
        .sort((left, right) => new Date(right.completed_at) - new Date(left.completed_at))
        .slice(0, 8)
        .map((completion) => {
          const reading = readingById.get(completion.reading_id);
          return { id: `reading-${completion.id}`, title: `${getMemberLabel(completion.user_id)} completed a Bible reading`, kind: "Bible reading", meta: reading ? `${reading.book} ${reading.chapter}` : "Group reading", createdAt: completion.completed_at, userId: completion.user_id, section: "bible-study" };
        }),
      ...prayerPoints.slice(0, 6).map((point) => ({ id: `prayer-${point.id}`, title: `${point.is_anonymous ? "A member" : getMemberLabel(point.created_by)} shared a prayer update`, kind: "Prayer", meta: point.title || "Prayer request", createdAt: point.created_at, userId: point.is_anonymous ? null : point.created_by, section: "prayer" })),
      ...announcements.slice(0, 6).map((item) => ({ id: `announcement-${item.id}`, title: `${getMemberLabel(item.created_by)} shared an announcement`, kind: "Announcement", meta: item.title || truncateText(item.body, 56), createdAt: item.created_at, userId: item.created_by, section: "announcements" }))
    ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 4);
    const todayPersonalReading = myPersonalBibleReadings.find((reading) => reading.reading_date === localToday);
    const todayGroupReading = visibleGroupReadings.find((reading) => reading.reading_date === localToday);
    const groupReadingForDisplay = todayGroupReading || bibleToday;
    const groupReadingMemberIds = new Set(groupReadingForDisplay && dashboardGroupMembershipsAvailable
      ? bibleStudyCompletions.filter((row) => row.reading_id === groupReadingForDisplay.id && dashboardActiveMemberIds.has(row.user_id)).map((row) => row.user_id)
      : []);
    const groupReadingMembers = dashboardActiveMembers.filter((member) => groupReadingMemberIds.has(member.id));
    const groupReadingParticipants = dashboardGroupMembershipsAvailable ? groupReadingMemberIds.size : null;
    const groupTodayPercent = dashboardGroupMembershipsAvailable && dashboardActiveMemberCount
      ? Math.min(100, Math.round(groupReadingMemberIds.size / dashboardActiveMemberCount * 100))
      : dashboardGroupMembershipsAvailable ? 0 : null;
    const personalTodayComplete = Boolean(personalBibleStreakSummary?.today_complete || (todayPersonalReading?.status === "completed" && todayPersonalReading.completed_at));
    const personalTodayInProgress = !personalTodayComplete && Boolean(personalBibleStreakSummary?.today_status === "in_progress" || todayPersonalReading?.status === "in_progress");
    const personalReadingTitle = todayPersonalReading
      ? `${todayPersonalReading.book} ${todayPersonalReading.chapter}`
      : personalBibleStats.nextReading
        ? `${personalBibleStats.nextReading.book} ${personalBibleStats.nextReading.chapter}`
        : personalBibleStats.totalCount
          ? "Personal plan complete"
          : "No personal reading plan yet";
    const personalReadingCaption = loading
      ? "Loading your personal reading progress…"
      : todayPersonalReading
        ? personalTodayComplete ? "Today’s reading is complete" : personalTodayInProgress ? "You have started today’s reading" : "Your reading is ready when you are"
        : personalBibleStats.nextReading
          ? "Next in your personal plan"
          : personalBibleStats.totalCount
            ? "You have completed every chapter in this plan"
            : personalBibleAvailable
              ? "Choose a personal reading plan in Bible Study"
              : "Personal reading progress is unavailable right now";
    const personalReadingStatus = loading
      ? "Loading"
      : personalTodayComplete
        ? "Completed"
        : personalTodayInProgress
          ? "In progress"
          : personalBibleStats.totalCount || personalBibleStreakSummary
            ? "Not started"
            : "No plan";
    const quickActions = [
      { label: "Bible Study", section: "bible-study", icon: "scripture", note: "Continue in the Word" },
      { label: "Prayer", section: "prayer", icon: "prayer", note: "Share and pray together" },
      { label: "Announcements", section: "announcements", icon: "messages", note: "Community news and encouragement" },
      { label: "Events", section: "events", icon: "calendar", note: "Gather with the community" },
      { label: "Partner progress", section: "bible-study", icon: "users", note: "Read and grow side by side", focusPartner: true },
      { label: "Group activity", section: "bible-study", icon: "scripture", note: "See your community’s reading rhythm" },
      ...(isAdminWorkspace ? [{ label: "Administration", section: "management", icon: "management", note: "Manage your cell group" }] : []),
      ...(isSuperAdmin ? [{ label: "System oversight", section: "super-admin", icon: "shield", note: "Platform administration" }] : [])
    ];

    return <div className="section-stack dashboard-overview dashboard-overview--premium" data-dashboard-role={isSuperAdmin ? "super-admin" : isAdmin ? "admin" : "member"}>
      <section className="dashboard-hero-premium" aria-labelledby="dashboard-welcome-heading">
        <DashboardHeroPhotographs />
        <div className="dashboard-hero-premium-copy">
          <div className="dashboard-hero-topline">
            <span className="dashboard-brandline"><NavIcon name="home" /> The City On A Hill</span>
            <time dateTime={liveNow.toISOString()}>{liveDateLabel}</time>
          </div>
          <p className="dashboard-hero-greeting">{getGreeting(liveNow)}</p>
          <h1 id="dashboard-welcome-heading"><span>Welcome back,</span><strong title={currentDisplayName}>{currentDisplayName}</strong></h1>
          <p className="dashboard-hero-message">There is purpose in every small step. Make room for Scripture, fellowship, and the good work God is growing in you.</p>
          <p className="dashboard-hero-verse"><NavIcon name="scripture" /><span>“Let your light shine before others.”</span><strong>MATTHEW 5:16</strong></p>
          <div className="dashboard-hero-actions">
            <button type="button" className="primary-button" onClick={() => setActiveSection("bible-study")}>Continue Bible Study <span aria-hidden="true">→</span></button>
            <button type="button" className="secondary-button" onClick={() => setShowNotificationCenter(true)}><NavIcon name="bell" />Notifications {unreadNotifications.length ? <span className="notification-count">{unreadNotifications.length}</span> : null}</button>
          </div>
        </div>
        <DashboardCompanion />
      </section>

      {isAdminWorkspace ? <section className="dashboard-admin-glance" aria-label={`${isSuperAdmin ? "Super Admin" : "Administrator"} group overview`}>
        <div className="dashboard-admin-glance-intro"><span>{isSuperAdmin ? "OVERSIGHT" : "MINISTRY PULSE"}</span><strong>{cellGroup?.name || "Your community"}</strong><small>Live figures from this workspace</small></div>
        <div><NavIcon name="users" /><span>Active members</span><strong>{dashboardActiveMemberCount ?? "—"}</strong></div>
        <div><NavIcon name="scripture" /><span>Today’s readers</span><strong>{todayGroupReading && dashboardGroupMembershipsAvailable ? `${groupReadingParticipants} / ${dashboardActiveMemberCount}` : "—"}</strong></div>
        <div><NavIcon name="bell" /><span>Unread alerts</span><strong>{unreadNotifications.length}</strong></div>
      </section> : null}

      <div className="dashboard-section-heading dashboard-growth-heading">
        <div><span>YOUR SPIRITUAL GROWTH</span><h2>A steady life in the Word</h2><p>Your personal reading journey, daily rhythm and partner encouragement.</p></div>
        <span className="dashboard-section-mark"><NavIcon name="scripture" /></span>
      </div>

      <section className="dashboard-personal-today" aria-label="Today’s personal Bible reading">
        <span className="dashboard-personal-today-icon"><NavIcon name="book-open" /></span>
        <div className="dashboard-personal-today-copy"><small>YOUR PERSONAL READING · {liveDateLabel}</small><strong>{personalReadingTitle}</strong><span>{personalReadingCaption}</span></div>
        <div className="dashboard-personal-today-progress"><div><span>{personalBibleAvailable && !loading ? `${personalBibleStats.completionPercent}% of your plan` : "Plan progress"}</span><b>{personalBibleAvailable && !loading ? `${personalBibleStats.completedCount} / ${personalBibleStats.totalCount}` : "—"}</b></div><span className="dashboard-meter" role="progressbar" aria-label="Personal Bible reading plan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={personalBibleAvailable && !loading ? personalBibleStats.completionPercent : 0}><i style={{ width: `${personalBibleAvailable && !loading ? personalBibleStats.completionPercent : 0}%` }} /></span></div>
        <span className={`dashboard-reading-status${personalTodayComplete ? " is-complete" : personalTodayInProgress ? " is-in-progress" : ""}`}><i />{personalReadingStatus}</span>
        <button type="button" className="dashboard-inline-action" onClick={() => setActiveSection("bible-study")}>Open plan <span aria-hidden="true">→</span></button>
      </section>

      <DashboardPersonalJourney
        summary={personalBibleStreakSummary}
        streakAvailable={personalBibleStreakAvailable}
        planStats={personalBibleStats}
        planAvailable={personalBibleAvailable}
        achievements={personalBibleAchievements}
        userId={user.id}
        groupId={activeCellGroupId}
        profiles={profiles}
        readings={bibleStudyReadings}
        onOpenStudy={() => setActiveSection("bible-study")}
        onOpenPartnerProgress={() => { setFocusBiblePartnerStreaks(true); setActiveSection("bible-study"); }}
      />

      <div className="dashboard-section-heading dashboard-community-heading">
        <div><span>GROWING TOGETHER</span><h2>Life in community</h2><p>Shared progress and the moments that bring your group together.</p></div>
        <span className="dashboard-section-mark"><NavIcon name="users" /></span>
      </div>

      <div className="dashboard-premium-grid">
        <section className="dashboard-redesign-card dashboard-group-card" aria-labelledby="dashboard-group-progress-heading">
          <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">GROUP BIBLE STUDY</span><h2 id="dashboard-group-progress-heading">Growing in Scripture, together</h2><p>Participation from your active group members.</p></div><button type="button" className="dashboard-text-action" onClick={() => setActiveSection("bible-study")}>Full study <span aria-hidden="true">→</span></button></div>
          {loading ? <div className="dashboard-inline-skeleton" role="status">Loading group reading activity…</div> : groupReadingForDisplay ? <>
            <div className="dashboard-group-reading"><span className="dashboard-group-book"><NavIcon name="scripture" /></span><div><small>{todayGroupReading ? "TODAY’S SHARED READING" : "MOST RECENT GROUP READING"}</small><strong>{groupReadingForDisplay.book} {groupReadingForDisplay.chapter}</strong><span>{groupReadingForDisplay.reading_date}</span></div><span className="dashboard-group-participation"><strong>{groupReadingParticipants ?? "—"}</strong><small>{dashboardActiveMemberCount == null ? "member totals unavailable" : `of ${dashboardActiveMemberCount} readers`}</small></span></div>
            <div className="dashboard-group-meter-row"><div><span>Today’s participation</span><strong>{todayGroupReading && groupTodayPercent != null ? `${groupTodayPercent}%` : "—"}</strong></div><span className="dashboard-meter" role="progressbar" aria-label="Group members completing the current shared reading" aria-valuemin="0" aria-valuemax="100" aria-valuenow={todayGroupReading && groupTodayPercent != null ? groupTodayPercent : 0}><i style={{ width: `${todayGroupReading && groupTodayPercent != null ? groupTodayPercent : 0}%` }} /></span></div>
            {todayGroupReading ? <div className="dashboard-group-readers"><small>MEMBERS WHO COMPLETED TODAY</small>{!dashboardGroupMembershipsAvailable ? <span className="dashboard-group-readers-empty">Member-level reading totals are available to group leaders.</span> : groupReadingMembers.length ? <div>{groupReadingMembers.slice(0, 4).map((member) => <span className="dashboard-group-reader" key={member.id}><MemberInitials member={member} className="dashboard-group-reader-avatar"/><strong>{member.full_name || "Community member"}</strong></span>)}{groupReadingParticipants > 4 ? <span className="dashboard-group-reader-more">+{groupReadingParticipants - 4} more</span> : null}</div> : <span className="dashboard-group-readers-empty">{groupReadingParticipants ? "Completions are recorded; member profiles are unavailable." : "No completed readings have been recorded yet."}</span>}</div> : null}
            <div className="dashboard-group-footnote"><span>{groupSubmissions ?? "—"} completed readings</span><span>{groupSubmissionRate == null ? "—" : `${groupSubmissionRate}%`} overall plan participation</span></div>
          </> : <div className="dashboard-empty-note"><strong>No shared reading is scheduled yet.</strong><span>When your group begins a plan, its progress will appear here.</span></div>}
          {recentSharedTakeaways.length ? <div className="dashboard-takeaways"><small>RECENT SHARED TAKEAWAYS</small>{recentSharedTakeaways.map((item) => <button type="button" key={`${item.kind}-${item.id}`} onClick={() => setActiveSection("bible-study")}><span><b>{item.kind}</b><small>{getMemberLabel(item.userId)} · {formatDateTime(item.createdAt)}</small><strong>{truncateText(item.content, 100)}</strong></span><span aria-hidden="true">↗</span></button>)}</div> : null}
        </section>

        <DashboardScriptureHighlight reading={groupReadingForDisplay} onOpenStudy={() => setActiveSection("bible-study")} />
        <DashboardGroupAnalytics readings={bibleStudyReadings} completions={bibleStudyCompletions} activeMembers={dashboardActiveMembers} activeMemberCount={dashboardActiveMemberCount ?? 0} membershipAvailable={dashboardGroupMembershipsAvailable} today={localToday} completionPercent={dashboardGroupCompletionPercent} settingsAvailable={dashboardGroupCompletionSettingsAvailable} />

        <section className="dashboard-redesign-card" aria-labelledby="dashboard-events-heading">
          <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">MAKE ROOM TO GATHER</span><h2 id="dashboard-events-heading">Upcoming events</h2><p>Time set aside for fellowship.</p></div><button type="button" className="dashboard-text-action" onClick={() => setActiveSection("events")}>All events <span aria-hidden="true">→</span></button></div>
          {loading ? <div className="dashboard-inline-skeleton" role="status">Loading gatherings…</div> : nextEvents.length ? <div className="dashboard-event-list">{nextEvents.map((eventRecord) => <button type="button" key={eventRecord.id} onClick={() => setActiveSection("events")}><span className="dashboard-date-tile"><strong>{new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(new Date(eventRecord.starts_at))}</strong><small>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(eventRecord.starts_at))}</small></span><span><strong>{eventRecord.title}</strong><small>{formatDateTime(eventRecord.starts_at)}</small><small>{eventRecord.location || "Location to be confirmed"}</small></span><span className="dashboard-list-arrow" aria-hidden="true">→</span></button>)}</div> : <div className="dashboard-empty-note"><strong>No upcoming gatherings.</strong><span>New community events will show up here as they are scheduled.</span></div>}
        </section>

        <section className="dashboard-redesign-card" aria-labelledby="dashboard-birthdays-heading">
          <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">CELEBRATE ONE ANOTHER</span><h2 id="dashboard-birthdays-heading">Upcoming birthdays</h2><p>Remembering the people in your community.</p></div><button type="button" className="dashboard-text-action" onClick={() => setActiveSection(isAdminWorkspace ? "birthdays" : "members")}>View people <span aria-hidden="true">→</span></button></div>
          {birthdayBoardLoading ? <div className="dashboard-inline-skeleton" role="status">Loading birthdays…</div> : upcomingBirthdays.length ? <div className="dashboard-birthday-list dashboard-birthday-list--compact">{upcomingBirthdays.map((member) => {
            const person = profiles.find((candidate) => candidate.id === member.user_id);
            return <div className="dashboard-birthday-row" key={member.user_id}><MemberInitials member={{ ...person, ...member }} className="dashboard-birthday-identity"/><span><strong>{member.full_name || "Community member"}</strong><small>{Number(member.days_until) === 0 ? "Celebrating today" : `In ${member.days_until} day${Number(member.days_until) === 1 ? "" : "s"}`} · {member.display_date || "Coming up"}</small></span>{Number(member.days_until) === 0 ? <b>Today</b> : null}</div>;
          })}</div> : <div className="dashboard-empty-note"><strong>{birthdayBoardUnavailable ? "Birthday details are unavailable right now." : "No birthdays in the next 30 days."}</strong><span>Upcoming celebrations will appear here when available.</span></div>}
        </section>

        <section className="dashboard-redesign-card" aria-labelledby="dashboard-prayer-heading">
          <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">CARE IN COMMUNITY</span><h2 id="dashboard-prayer-heading">Prayer updates</h2><p>Keep one another in your prayers.</p></div><button type="button" className="dashboard-text-action" onClick={() => setActiveSection("prayer")}>Prayer wall <span aria-hidden="true">→</span></button></div>
          {loading ? <div className="dashboard-inline-skeleton" role="status">Loading prayer updates…</div> : recentPrayerPoints.length ? <div className="dashboard-prayer-list">{recentPrayerPoints.map((prayerPoint) => <button type="button" key={prayerPoint.id} onClick={() => setActiveSection("prayer")}><span className="dashboard-prayer-icon"><NavIcon name="prayer" /></span><span><strong>{prayerPoint.title || "Prayer request"}</strong><small>{truncateText(prayerPoint.details || "A member has shared a prayer request.", 84)}</small><small>{prayerPoint.is_anonymous ? "Shared anonymously" : getMemberLabel(prayerPoint.created_by)} · {formatDateTime(prayerPoint.created_at)}</small></span><b className={`dashboard-prayer-status is-${prayerPoint.status || "open"}`}>{prayerPoint.status === "answered" ? "Answered" : prayerPoint.status === "prayed" ? "Prayed for" : "Open"}</b></button>)}</div> : <div className="dashboard-empty-note"><strong>No prayer updates yet.</strong><span>Requests shared with your community will appear here.</span></div>}
        </section>

        <section className="dashboard-redesign-card dashboard-announcements-card" aria-labelledby="dashboard-announcements-heading">
          <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">FROM YOUR COMMUNITY</span><h2 id="dashboard-announcements-heading">Recent announcements</h2><p>News, encouragement and moments from your group.</p></div><button type="button" className="dashboard-text-action" onClick={() => setActiveSection("announcements")}>Open GC Pulse <span aria-hidden="true">→</span></button></div>
          {loading ? <div className="dashboard-inline-skeleton" role="status">Loading announcements…</div> : latestAnnouncements.length ? <div className="dashboard-announcement-rows">{latestAnnouncements.map((item) => {
            const author = profiles.find((member) => member.id === item.created_by);
            const reactionCount = reactions.filter((reaction) => reaction.entity_table === "announcements" && reaction.entity_id === item.id).length;
            return <button type="button" key={item.id} onClick={() => openCommunityPost(item.id)}><MemberInitials member={author || { full_name: "Community member" }} className="dashboard-announcement-avatar"/><span><strong>{item.title || "Community update"}</strong><small>{author?.full_name || "Community member"} · {formatDateTime(item.created_at)}</small><span>{truncateText(item.body, 125)}</span><small>{reactionCount} {reactionCount === 1 ? "reaction" : "reactions"}</small></span><span className="dashboard-list-arrow" aria-hidden="true">→</span></button>;
          })}</div> : <div className="dashboard-empty-note"><strong>No announcements yet.</strong><span>Updates shared through GC Pulse will appear here.</span></div>}
        </section>

        <section className="dashboard-redesign-card dashboard-activity-card" aria-labelledby="dashboard-activity-heading">
          <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">A LITTLE CLOSER</span><h2 id="dashboard-activity-heading">Your activity</h2><p>Recent community activity and personal notifications.</p></div><button type="button" className="dashboard-text-action" onClick={() => setShowNotificationCenter(true)}>All notifications <span aria-hidden="true">→</span></button></div>
          <div className="dashboard-activity-pair"><button type="button" onClick={() => setShowNotificationCenter(true)}><span>Unread notifications</span><strong>{unreadNotifications.length}</strong></button><div><span>{isAdminWorkspace ? "Open group tasks" : "Your pending tasks"}</span><strong>{isAdminWorkspace ? tasks.filter((task) => task.status === "pending").length : myPendingTasks}</strong></div></div>
          <div className="dashboard-notification-feed"><small>RECENT NOTIFICATIONS</small>{loading ? <div className="dashboard-inline-skeleton" role="status">Loading notifications…</div> : recentDashboardNotifications.length ? recentDashboardNotifications.map((notification) => <button type="button" key={`dashboard-notification-${notification.id}`} onClick={() => openNotificationTarget(notification)}><span className="dashboard-notification-icon"><NavIcon name="bell" /></span><span><strong>{notification.title || "Community notification"}</strong><small>{truncateText(notification.body || "Open this notification for details.", 90)}</small></span><time dateTime={notification.created_at}>{formatDateTime(notification.created_at)}</time></button>) : <div className="dashboard-empty-note"><strong>You’re all caught up.</strong><span>New notifications will appear here.</span></div>}</div>
          <span className="dashboard-community-feed-label">RECENT COMMUNITY ACTIVITY</span>
          <div className="dashboard-activity-feed">{loading ? <div className="dashboard-inline-skeleton" role="status">Loading recent activity…</div> : recentGroupActivity.length ? recentGroupActivity.slice(0, 2).map((item) => {
            const activityMember = item.userId ? profiles.find((member) => member.id === item.userId) : null;
            return <button type="button" key={`recent-${item.kind}-${item.id}`} onClick={() => setActiveSection(item.section)}>{item.userId ? <MemberInitials member={activityMember || { full_name: "Community member" }} className="dashboard-activity-avatar"/> : <span className="dashboard-activity-dot"/>}<span><strong>{item.title}</strong><small>{item.kind} · {item.meta} · {formatDateTime(item.createdAt)}</small></span><span aria-hidden="true">↗</span></button>;
          }) : <div className="dashboard-empty-note"><strong>Your community is just getting started.</strong><span>New group activity will appear here.</span></div>}</div>
        </section>
      </div>

      <section className="dashboard-quick-access" aria-labelledby="dashboard-quick-heading">
        <div className="dashboard-section-heading"><div><span>YOUR EVERYDAY SPACES</span><h2 id="dashboard-quick-heading">Quick access</h2><p>Go directly to the places you visit most.</p></div></div>
        <div className="dashboard-quick-grid">{quickActions.map((action, index) => <button type="button" key={`${action.section}-${action.label}-${index}`} onClick={() => { if (action.focusPartner) setFocusBiblePartnerStreaks(true); setActiveSection(action.section); }}><span className="dashboard-quick-icon"><NavIcon name={action.icon}/></span><span><strong>{action.label}</strong><small>{action.note}</small></span><b aria-hidden="true">→</b></button>)}</div>
      </section>
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
    const query = messageSearchQuery.trim().toLocaleLowerCase();
    const visibleMessages = orderedMessages.filter((message) => {
      const text = `${message.title || ""} ${message.content || ""} ${getMemberLabel(message.sender_id)} ${getMessageRecipientLabel(message)}`.toLocaleLowerCase();
      return !query || text.includes(query);
    });
    return (
      <div className="section-stack">
        <header className="messages-story-hero"><div className="page-story-copy"><p className="story-kicker">Keep in touch</p><h1>Messages</h1><p>A thoughtful space for private conversations and replies.</p></div><span className="page-story-mark" aria-hidden="true"><NavIcon name="messages" /></span></header>
        <div className="message-library-tools"><label className="feature-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search messages</span><input type="search" value={messageSearchQuery} onChange={(event) => setMessageSearchQuery(event.target.value)} placeholder="Search people or messages" /></label><span className="feature-filter-count" aria-live="polite">{visibleMessages.length} of {orderedMessages.length} direct messages</span></div>
        <div className="messages-layout">
          <Panel
            title="Conversation Thread"
            subtitle={
              orderedMessages.length
                ? "Your direct conversations, together in one live thread."
                : "Your conversations will appear here in real time."
            }
          >
            {visibleMessages.length ? (
              <div className="message-thread">
                {visibleMessages.map((message) => {
                  const isOwnMessage = message.sender_id === user.id;
                  const replySource = getMessageReplySource(message);

                  return (
                    <article
                      key={message.id}
                      className={isOwnMessage ? "message-row own" : "message-row"}
                    >
                      {!isOwnMessage ? (
                        <IdentityBadge member={getMember(message.sender_id)} size="small" />
                      ) : null}

                      <div className="message-stack">
                        <div className="message-line">
                          <strong>{isOwnMessage ? "You" : getMemberLabel(message.sender_id)}</strong>
                          <span>{formatDateTime(message.created_at)}</span>
                        </div>

                        <div
                          className={
                          isOwnMessage ? "message-bubble own" : "message-bubble direct"
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
                            <span className="pill info">Direct message</span>
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
                        <IdentityBadge member={currentMember} size="small" />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title={orderedMessages.length ? "No matching messages" : "No messages yet"}
                description={orderedMessages.length ? "Try another search." : "When someone sends you a message, your thread will appear here."}
              />
            )}
          </Panel>

          <Panel
            title={replyingToMessage ? "Reply & Send" : "New Message"}
            subtitle="Choose a member, write clearly, and send your note privately."
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
                    required
                    value={messageForm.recipient_id}
                    onChange={(event) =>
                      setMessageForm((current) => ({
                        ...current,
                        recipient_id: event.target.value
                      }))
                    }
                  >
                    <option value="" disabled>Select a member</option>
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
                  <span className="inline-help">Only the selected member can see your message.</span>
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
                      <IdentityBadge member={member} />
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
    const query = prayerSearchQuery.trim().toLocaleLowerCase();
    const visiblePrayerPoints = sortedPrayerPoints.filter((prayerPoint) => {
      const statusMatches = prayerStatusFilter === "all" || prayerPoint.status === prayerStatusFilter;
      const text = `${prayerPoint.title || ""} ${prayerPoint.details || ""}`.toLocaleLowerCase();
      return statusMatches && (!query || text.includes(query));
    });
    const prayerCount = (status) => sortedPrayerPoints.filter((prayerPoint) => prayerPoint.status === status).length;
    return (
      <div className="content-grid prayer-layout">
        <header className="prayer-story-hero"><div className="page-story-copy"><p className="story-kicker">Gentle care, shared in faith</p><h1>Prayer, held in community.</h1><p>Bring what is on your heart. Encourage one another through every season, and give thanks together.</p><div className="prayer-story-stats"><span><strong>{sortedPrayerPoints.length}</strong> shared requests</span><span><strong>{prayerCount("prayed")}</strong> being prayed for</span><span><strong>{prayerCount("answered")}</strong> answered</span></div></div><span className="page-story-mark" aria-hidden="true">♡</span></header>
        <div className="prayer-library-tools"><label className="feature-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search prayer requests</span><input type="search" value={prayerSearchQuery} onChange={(event) => setPrayerSearchQuery(event.target.value)} placeholder="Search prayer requests" /></label><div className="feature-filter-row" role="group" aria-label="Filter prayer requests">{[["all", "All requests"], ["open", "Open"], ["prayed", "Prayed for"], ["answered", "Answered"]].map(([status, label]) => <button key={status} type="button" className={prayerStatusFilter === status ? "is-active" : ""} aria-pressed={prayerStatusFilter === status} onClick={() => setPrayerStatusFilter(status)}>{label}{status !== "all" ? ` · ${prayerCount(status)}` : ""}</button>)}<span className="feature-filter-count" aria-live="polite">{visiblePrayerPoints.length} requests</span></div></div>
        <Panel
          className="prayer-composer-panel"
          title={editingPrayerId ? "Edit your prayer request" : "Share a prayer request"}
          subtitle="Share prayer needs gently, anonymously if needed, and update each request as the group prays together."
          action={editingPrayerId ? <button type="button" className="ghost-button compact" onClick={() => { setEditingPrayerId(""); setPrayerForm(emptyPrayerForm); }}>Cancel edit</button> : null}
        >
          <form className="stack-form" onSubmit={handlePrayerSubmit}>
            <label className="field">
              <span>Prayer title</span>
              <input
                id="prayer-title"
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
              <button type="submit" className="primary-button" disabled={prayerSubmitting || !prayerForm.title.trim()}>
                {prayerSubmitting ? (editingPrayerId ? "Saving…" : "Sharing prayer…") : editingPrayerId ? "Save changes" : "Share prayer request"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Shared Prayer Requests"
          subtitle="Every request updates instantly so the group can stay in step together."
        >
          {visiblePrayerPoints.length ? (
            <div className="card-list">
              {visiblePrayerPoints.map((prayerPoint) => {
                const canDelete = isAdmin || prayerPoint.created_by === user.id;
                const reminder = prayerReminders.find(
                  (item) => item.user_id === user.id && item.prayer_point_id === prayerPoint.id
                );
                return (
                  <article key={prayerPoint.id} className={`idea-card prayer-card${prayerPoint.status === "answered" ? " is-answered" : ""}`}>
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

                    <details className="prayer-replies">
                      <summary>
                        Encouragement <span>{prayerReplies.filter((reply) => reply.prayer_point_id === prayerPoint.id).length}</span>
                      </summary>
                      {prayerRepliesAvailable ? (
                        <div className="prayer-replies-content">
                          <div className="prayer-reply-list">
                            {prayerReplies.filter((reply) => reply.prayer_point_id === prayerPoint.id).map((reply) => (
                              <article className="prayer-reply" key={reply.id}>
                                <strong>{getMemberLabel(reply.user_id)}</strong>
                                <time dateTime={reply.created_at}>{formatDateTime(reply.created_at)}</time>
                                <p>{reply.body}</p>
                              </article>
                            ))}
                          </div>
                          <form className="prayer-reply-form" onSubmit={(event) => void handlePrayerReplySubmit(event, prayerPoint.id)}>
                            <label className="sr-only" htmlFor={`prayer-reply-${prayerPoint.id}`}>Write encouragement</label>
                            <textarea
                              id={`prayer-reply-${prayerPoint.id}`}
                              rows={2}
                              maxLength={1200}
                              value={prayerReplyDrafts[prayerPoint.id] ?? ""}
                              onChange={(event) => setPrayerReplyDrafts((current) => ({ ...current, [prayerPoint.id]: event.target.value }))}
                              placeholder="Offer a kind word or let them know you’re praying…"
                            />
                            <button type="submit" className="secondary-button compact" disabled={prayerReplyBusy === prayerPoint.id || !(prayerReplyDrafts[prayerPoint.id] ?? "").trim()}>
                              {prayerReplyBusy === prayerPoint.id ? "Sending…" : "Send encouragement"}
                            </button>
                          </form>
                        </div>
                      ) : (
                        <p className="prayer-replies-unavailable">Written encouragement will be available after the Prayer replies migration is applied.</p>
                      )}
                    </details>

                    <div className="inline-actions">
                      {prayerPoint.created_by === user.id ? <button type="button" className="ghost-button" onClick={() => { setEditingPrayerId(prayerPoint.id); setPrayerForm({ title: prayerPoint.title || "", details: prayerPoint.details || "", is_anonymous: Boolean(prayerPoint.is_anonymous) }); window.requestAnimationFrame(() => { document.querySelector(".prayer-composer-panel")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); document.getElementById("prayer-title")?.focus({ preventScroll: true }); }); }}>Edit</button> : null}
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
                          disabled={prayerBusyIds.has(`status:${prayerPoint.id}`)}
                        >
                          {prayerBusyIds.has(`status:${prayerPoint.id}`) ? "Saving…" : "Mark prayed"}
                        </button>
                      ) : null}
                      {prayerPoint.status !== "answered" ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => updatePrayerStatus(prayerPoint, "answered")}
                          disabled={prayerBusyIds.has(`status:${prayerPoint.id}`)}
                        >
                          Mark answered
                        </button>
                      ) : null}
                      {prayerPoint.status !== "open" ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => updatePrayerStatus(prayerPoint, "open")}
                          disabled={prayerBusyIds.has(`status:${prayerPoint.id}`)}
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
              title={sortedPrayerPoints.length ? "No matching prayer requests" : "No prayer points yet"}
              description={sortedPrayerPoints.length ? "Try another search or request status." : "The prayer wall begins empty and fills in as members share requests."}
            />
          )}
        </Panel>
      </div>
    );
  }

  function renderResourcesSection() {
    const query = resourceSearchQuery.trim().toLocaleLowerCase();
    const visibleResources = sortedResources.filter((resource) => {
      const typeMatches = resourceTypeFilter === "all" || resource.resource_type === resourceTypeFilter;
      const text = `${resource.title || ""} ${resource.description || ""} ${resource.note_content || ""}`.toLocaleLowerCase();
      return typeMatches && (!query || text.includes(query));
    });
    const resourceCount = (type) => type === "all" ? sortedResources.length : sortedResources.filter((resource) => resource.resource_type === type).length;
    return (
      <div className="content-grid resource-page-layout">
        <header className="resources-story-hero"><div className="page-story-copy"><p className="story-kicker">Learn, keep, return</p><h1>Resources</h1><p>Shared notes, study materials, PDF handouts, and trusted links for your journey.</p></div><span className="page-story-mark" aria-hidden="true"><NavIcon name="book-open" /></span></header>
        <div className="resource-library-tools"><label className="feature-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search shared resources</span><input type="search" value={resourceSearchQuery} onChange={(event) => setResourceSearchQuery(event.target.value)} placeholder="Search titles, notes, and topics" /></label><div className="feature-filter-row" role="group" aria-label="Filter resources">{[["all", "All resources"], ["note", "Notes"], ["pdf", "PDFs"], ["link", "Links"]].map(([type, label]) => <button key={type} type="button" className={resourceTypeFilter === type ? "is-active" : ""} aria-pressed={resourceTypeFilter === type} onClick={() => setResourceTypeFilter(type)}>{label} · {resourceCount(type)}</button>)}<span className="feature-filter-count" aria-live="polite">{visibleResources.length} shown</span></div></div>
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
          {visibleResources.length ? (
            <div className="card-list">
              {visibleResources.map((resource) => (
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
              title={sortedResources.length ? "No matching resources" : "No resources yet"}
              description={sortedResources.length ? "Try another search or resource type." : "Admins can upload notes, PDFs, and links for the whole group here."}
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
          <Suspense fallback={<div className="loading-inline" role="status"><div className="spinner" aria-hidden="true" />Loading class assignments…</div>}>
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
          </Suspense>
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

    const lockKey = `${entityTable}:${targetId}`;
    if (announcementReactionLocksRef.current.has(lockKey)) return false;
    announcementReactionLocksRef.current.add(lockKey);

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
    } finally {
      announcementReactionLocksRef.current.delete(lockKey);
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
          .insert([{ ...payload, group_id: activeCellGroupId, created_by: user.id }]);

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
            <div className="identity-stack-row">
              <div className="identity-stack">
                {onlineMembers.slice(0, 12).map((member) => (
                  <div key={member.id} className="identity-online" title={member.full_name || member.email}>
                    <IdentityBadge member={member} size="small" />
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
        <header className="page-intro"><div><p className="eyebrow">{CELL_GROUP_NAME}</p><h1>Members</h1><p>{activeMembers.length} active member{activeMembers.length === 1 ? "" : "s"} in {CELL_GROUP_NAME}.</p></div></header>
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
              caption="Paused accounts remain in the member record for authorized review."
              accent="orange"
            />
          </div>
        ) : null}

        <Panel
          title={isAdmin ? "Member Management" : "Members"}
          subtitle={
            isAdmin
              ? "Review member profiles and connect with the community. Privileged account changes are handled in the dedicated Super Admin area."
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
                      <IdentityBadge member={member} />
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
                        : "This member can collaborate normally and may be promoted by an authorized Super Admin."}
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
            subtitle="Keep your name and profile details up to date."
          >
            <div className="profile-panel">
              <div className="profile-hero settings-hero-card">
                <IdentityBadge member={{ ...currentMember, profile_photo_path: removeProfilePhotoOnSave ? null : currentMember?.profile_photo_path }} photoUrl={removeProfilePhotoOnSave ? "" : profilePhotoPreview || undefined} size="large" />
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
                <div className="profile-photo-setting">
                  <MemberInitials
                    member={currentMember}
                    photoUrl={removeProfilePhotoOnSave ? "" : profilePhotoPreview || undefined}
                    className="profile-photo-setting-preview"
                  />
                  <div className="profile-photo-setting-copy">
                    <strong>Profile photo <span>Optional</span></strong>
                    <p>Choose a photo from your device. It appears with your name around the community.</p>
                    <input
                      id="profile-photo-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Choose an optional profile photo"
                      aria-describedby="profile-photo-help"
                      disabled={submitting}
                      onChange={handleProfilePhotoChange}
                    />
                    <small id="profile-photo-help">JPG, PNG, or WebP · up to 5 MB</small>
                    {profilePhotoFile ? <small>Selected: {profilePhotoFile.name}</small> : null}
                    {removeProfilePhotoOnSave ? <small>Your photo will be removed when you save.</small> : null}
                    {currentMember?.profile_photo_path || profilePhotoFile ? <button type="button" className="ghost-button compact" onClick={stageProfilePhotoRemoval} disabled={submitting}>Remove photo</button> : null}
                  </div>
                </div>

                <label className="field">
                  <span>Display name</span>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    maxLength={80}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        full_name: event.target.value
                      }))
                    }
                    placeholder="How your name should appear"
                    autoComplete="name"
                    required
                  />
                  <small className="inline-help">This is the name members see in messages, Bible Study, and the member directory.</small>
                </label>

                <div className="form-actions">
                  <button type="submit" className="primary-button" disabled={submitting}>
                    Save profile
                  </button>
                </div>
              </form>
              <section className="profile-bible-achievements" aria-labelledby="profile-bible-achievements-title">
                <div><p className="eyebrow">PERSONAL BIBLE STUDY</p><h3 id="profile-bible-achievements-title">Bible consistency achievements</h3><p>Your Bible milestones belong to your personal reading history.</p></div>
                {personalBibleStreakAvailable ? <div className="profile-bible-achievement-list">{BIBLE_STREAK_MILESTONES.filter((milestone)=>personalBibleAchievements.some((item)=>Number(item.milestone_days)===milestone.days)).map((milestone)=>{const earned=personalBibleAchievements.find((item)=>Number(item.milestone_days)===milestone.days);return <article key={milestone.days}><span aria-hidden="true">✦</span><div><strong>{milestone.title}</strong><small>{milestone.description}</small></div><time dateTime={earned.earned_on}>{new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${earned.earned_on}T12:00:00Z`))}</time></article>;})}{!personalBibleAchievements.length?<p className="inline-help">Your first Bible consistency achievement will appear here as your reading rhythm grows.</p>:null}</div>:<p className="inline-help">Achievements will appear when the Bible streak migration is applied.</p>}
              </section>
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
                  <p>Royal Purple styling adapts to your preferred theme.</p>
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

  const selfManagedSections = new Set(["management", "birthdays", "bible-study", "super-admin", "fun-zone"]);
  const isManagementSection = activeSection === "management";
  const deferSectionForGlobalLoad = loading && !selfManagedSections.has(activeSection);
  const showDashboardChrome = activeSection !== "dashboard" && !selfManagedSections.has(activeSection) && !isAdminWorkspace;

  const sectionContent = deferSectionForGlobalLoad ? null : activeSection === "dashboard"
    ? renderDashboardSection()
      : activeSection === "faq"
        ? <Suspense fallback={<div className="loading-inline" role="status">Opening frequently asked questions…</div>}><FAQPage /></Suspense>
        : activeSection === "about"
          ? <Suspense fallback={<div className="loading-inline" role="status">Opening About…</div>}><AboutPage onNavigate={setActiveSection} /></Suspense>
      : activeSection === "fun-zone"
        ? <Suspense fallback={<div className="loading-inline" role="status"><div className="spinner" aria-hidden="true" />Opening Fun Zone…</div>}><FunZone key={activeCellGroupId} user={user} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} groupId={activeCellGroupId} profiles={profiles} /></Suspense>
      : activeSection === "events"
        ? renderEventsDirectorySection()
      : activeSection === "birthdays"
        ? <Suspense fallback={<div className="loading-inline" role="status"><div className="spinner" aria-hidden="true" />Opening birthday management…</div>}><BirthdayManagementSection
            key={activeCellGroupId}
            profiles={profiles}
            isAdmin={isAdmin}
            groupId={activeCellGroupId}
            focusMemberId={birthdayFocusMemberId}
            onFocusHandled={() => setBirthdayFocusMemberId("")}
          /></Suspense>
      : activeSection === "prayer"
        ? renderPrayerSection()
          : activeSection === "resources"
            ? renderResourcesSection()
            : activeSection === "bible-study"
              ? <Suspense fallback={<div className="loading-inline" role="status"><div className="spinner" aria-hidden="true" />Opening Bible Study…</div>}><BibleStudySection key={activeCellGroupId} user={user} profile={profile} profiles={profiles} isAdmin={isAdminWorkspace} groupId={activeCellGroupId} focusPartnerStreaks={focusBiblePartnerStreaks} onPartnerStreakFocusHandled={() => setFocusBiblePartnerStreaks(false)} onPersonalReadingsChange={setPersonalBibleReadings} onCarryReflectionToPrayer={(reflection) => { const reference = reflection.reference?.trim(); setPrayerForm({ ...emptyPrayerForm, title: reference ? `Prayer from ${reference}` : "Bible Study reflection", details: `${reflection.content}${reference ? `\n\nScripture: ${reference}` : ""}` }); setActiveSection("prayer"); }} /></Suspense>
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
                      isAdminWorkspace ? <Suspense fallback={<div className="loading-inline" role="status"><div className="spinner" aria-hidden="true" />Opening administration…</div>}><CellGroupManagementSection
                        key={activeCellGroupId}
                        user={user}
                        isAdmin={isAdmin}
                        isSuperAdmin={isSuperAdmin}
                        groupId={activeCellGroupId}
                        profiles={profiles}
                      /></Suspense>
                      : <EmptyState title="Access restricted" description="This control center is available to authorized administrators." />
                    )
                  : activeSection === "super-admin"
                    ? isSuperAdmin
                      ? <Suspense fallback={<div className="loading-inline" role="status"><div className="spinner" aria-hidden="true" />Opening system oversight…</div>}><SuperAdminArea
                        user={user}
                        profiles={profiles}
                        platformOverview={{
                          upcomingEvents: events.filter((eventRecord) => new Date(eventRecord.starts_at) >= liveNow).length,
                          prayerRequests: prayerPoints.length,
                          bibleStudyConversations: bibleStudyTakeaways.length + bibleStudyReplies.length + bibleStudyQuestions.length + bibleStudyAnswers.length,
                        }}
                        workspaceLoading={loading}
                        workspaceError={errorMessage}
                        onNavigateSection={setActiveSection}
                        onRefresh={() => loadAppData()}
                        onLeave={() => setActiveSection("dashboard")}
                      /></Suspense>
                      : <Panel title="Verifying access" subtitle="Checking your account authorization with the database."><div className="loading-inline"><div className="spinner" aria-hidden="true" /></div></Panel>
                  : activeSection === "settings"
                    ? renderSettingsSection()
                    : null;

  return (
    <div className={"app-shell" + (isAdminWorkspace ? " admin-workspace" : "")} data-active-section={activeSection}>
      <GlobalBackground activeSection={activeSection} />
      <DesktopWorkspaceNavigation
        sections={navSections}
        activeSection={activeSection}
        onSelect={setActiveSection}
        theme={theme}
        onThemeToggle={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        roleLabel={isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Member"}
        isAdminWorkspace={isAdminWorkspace}
        isSuperAdmin={isSuperAdmin}
        currentMember={currentMember}
        unreadCount={unreadNotifications.length}
        onOpenNotifications={() => setShowNotificationCenter(true)}
        onSignOut={() => void signOut()}
      />

      <main className={`main-content${isManagementSection ? " main-content--management" : ""}`}>
      <MobileSectionNav
        sections={navSections}
        activeSection={activeSection}
        onSelect={setActiveSection}
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        menuButtonRef={mobileMenuTriggerRef}
        unreadCount={unreadNotifications.length}
        onOpenNotifications={() => setShowNotificationCenter(true)}
        currentMember={currentMember}
        roleLabel={isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : "Member"}
        theme={theme}
        onThemeToggle={() => setTheme((current) => current === "light" ? "dark" : "light")}
        onSignOut={() => void signOut()}
        isAdminWorkspace={isAdminWorkspace}
      />

        <header className="mobile-app-header">
          <BrandLogo compact />
          <span className="mobile-app-page-title">{activeSectionLabel}</span>
          <button type="button" className="mobile-app-icon-button" aria-label={`Notifications${unreadNotifications.length ? `, ${unreadNotifications.length} unread` : ""}`} onClick={() => setShowNotificationCenter(true)}>
            <NavIcon name="bell" />{unreadNotifications.length ? <span>{unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}</span> : null}
          </button>
        </header>
        {showDashboardChrome ? <header className="topbar">
          <div className="mobile-brand"><BrandLogo compact /></div>
          <div className="topbar-hero">
            <div className="identity-orb">
              <IdentityBadge member={currentMember} size="large" />
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
              "fun-zone",
              "prayer",
              "resources",
              "assignments",
              "meetings",
              "messages",
              "members",
              "settings",
              "faq",
              "about"
            ].includes(activeSection) ? ` workspace-page workspace-page--${activeSection}` : ""}`}
            key={activeSection}
          >
            {!(["dashboard", "events", "announcements", "fun-zone", "faq", "about"].includes(activeSection)) ? (
              <div className="section-art-strip" aria-hidden="true" />
            ) : null}
            {sectionContent}
          </div>
        ) : null}
      </main>

      <footer className="app-footer">
        <span>{APP_NAME} &copy; 2026</span>
      </footer>

      {birthdayExperienceOpen && isBirthdayToday ? <BirthdayCelebration
        firstName={currentFirstName}
        fullName={currentDisplayName}
        dateLabel={ownDashboardBirthday?.display_date || liveDateLabel}
        reopened={birthdayExperienceReopened}
        onDismiss={closeBirthdayExperience}
      /> : null}

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
        onDeleteAll={() => {
          void deleteAllNotifications();
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

    </div>
  );
}
