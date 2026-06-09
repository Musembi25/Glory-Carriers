const ASSIGNMENT_NOTIFICATION_TYPES = new Set([
  "discipleship_assignment_posted",
  "discipleship_assignment_due",
  "discipleship_assignment_feedback",
  "discipleship_assignment_approved",
  "discipleship_assignment_revision"
]);

const MEETING_NOTIFICATION_TYPES = new Set([
  "virtual_meeting_scheduled",
  "virtual_meeting_reminder",
  "virtual_meeting_starting"
]);

const EVENT_NOTIFICATION_TYPES = new Set(["event_created", "event_reminder"]);

const DISCIPLESHIP_NOTIFICATION_TYPES = new Set([
  "discipleship_class_created",
  "discipleship_class_reminder",
  "discipleship_class_starting",
  "discipleship_lesson_added",
  "discipleship_enrollment_approved"
]);

export const NOTIFICATION_CATEGORIES = [
  { id: "events", label: "Events" },
  { id: "meetings", label: "Meetings" },
  { id: "assignments", label: "Assignments" },
  { id: "discipleship", label: "Discipleship" },
  { id: "prayer", label: "Prayer" },
  { id: "messages", label: "Messages" },
  { id: "announcements", label: "Announcements" },
  { id: "tasks", label: "Tasks" },
  { id: "attendance", label: "Attendance" }
];

export function getNotificationCategory(notificationType) {
  if (EVENT_NOTIFICATION_TYPES.has(notificationType)) {
    return "events";
  }

  if (MEETING_NOTIFICATION_TYPES.has(notificationType)) {
    return "meetings";
  }

  if (ASSIGNMENT_NOTIFICATION_TYPES.has(notificationType)) {
    return "assignments";
  }

  if (DISCIPLESHIP_NOTIFICATION_TYPES.has(notificationType)) {
    return "discipleship";
  }

  if (notificationType === "prayer_reminder") {
    return "prayer";
  }

  if (notificationType === "new_message") {
    return "messages";
  }

  if (notificationType === "announcement_posted") {
    return "announcements";
  }

  if (notificationType === "task_assigned") {
    return "tasks";
  }

  if (notificationType === "event_reminder") {
    return "attendance";
  }

  return "events";
}

export function getSectionForNotification(notification) {
  const targetTable = notification?.entity_table;
  const notificationType = notification?.notification_type;

  if (targetTable === "events") {
    return "events";
  }

  if (targetTable === "event_ideas") {
    return "planning";
  }

  if (targetTable === "tasks") {
    return "tasks";
  }

  if (targetTable === "messages") {
    return "messages";
  }

  if (targetTable === "prayer_points") {
    return "prayer";
  }

  if (targetTable === "resources") {
    return "resources";
  }

  if (targetTable === "leadership_assignments") {
    return "leadership";
  }

  if (targetTable === "virtual_meetings" || MEETING_NOTIFICATION_TYPES.has(notificationType)) {
    return "meetings";
  }

  if (targetTable === "discipleship_classes" || targetTable === "discipleship_lessons") {
    return "discipleship";
  }

  if (targetTable === "announcements" || notificationType === "announcement_posted") {
    return "events";
  }

  if (targetTable === "event_check_ins") {
    return "events";
  }

  return "events";
}

export function getDiscipleshipTabFocus(notification) {
  if (ASSIGNMENT_NOTIFICATION_TYPES.has(notification?.notification_type)) {
    return "assignments";
  }

  if (
    notification?.notification_type === "discipleship_lesson_added" ||
    notification?.entity_table === "discipleship_lessons"
  ) {
    return "lessons";
  }

  if (
    notification?.notification_type === "discipleship_class_starting" ||
    notification?.notification_type === "discipleship_class_reminder"
  ) {
    return "sessions";
  }

  return null;
}

export function buildNotificationLaunchUrl(notification) {
  const base = import.meta.env.BASE_URL || "/";
  const params = new URLSearchParams();
  const section = getSectionForNotification(notification);
  const discipleshipTab = getDiscipleshipTabFocus(notification);

  if (section) {
    params.set("section", section);
  }

  if (notification?.entity_id) {
    params.set("entityId", notification.entity_id);
  }

  if (notification?.entity_table) {
    params.set("entityTable", notification.entity_table);
  }

  if (notification?.notification_type) {
    params.set("notificationType", notification.notification_type);
  }

  if (notification?.id) {
    params.set("notificationId", notification.id);
  }

  if (discipleshipTab) {
    params.set("discipleshipTab", discipleshipTab);
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function parseNotificationLaunchParams(searchParams) {
  const section = searchParams.get("section");
  const entityId = searchParams.get("entityId");
  const entityTable = searchParams.get("entityTable");
  const notificationType = searchParams.get("notificationType");
  const notificationId = searchParams.get("notificationId");
  const discipleshipTab = searchParams.get("discipleshipTab");

  if (!section && !notificationId && !entityId) {
    return null;
  }

  return {
    section,
    entityId,
    entityTable,
    notificationType,
    notificationId,
    discipleshipTab
  };
}

export function isPreferenceEnabled(preferences, notificationType) {
  if (!preferences?.push_enabled) {
    return false;
  }

  const category = getNotificationCategory(notificationType);
  const key = `${category}_enabled`;
  return preferences[key] !== false;
}
