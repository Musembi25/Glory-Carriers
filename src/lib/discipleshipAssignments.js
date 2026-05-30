export const SUBMISSION_BUCKET = "discipleship-submissions";
export const MATERIALS_BUCKET = "discipleship-materials";

export const SUBMISSION_ACCEPT =
  ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,application/zip";

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "zip"
]);

export const STATUS_LABELS = {
  not_submitted: "Not Submitted",
  submitted: "Submitted",
  under_review: "Under Review",
  reviewed: "Reviewed",
  completed: "Completed",
  revision_requested: "Revision Requested"
};

export function isWorkLesson(lesson) {
  return lesson?.lesson_type === "assignment" || lesson?.lesson_type === "project";
}

export function getLessonInstructions(lesson) {
  return (lesson?.instructions || lesson?.assignment_prompt || lesson?.description || "").trim();
}

export function parseAttachedResources(lesson) {
  const raw = lesson?.attached_resources;
  if (Array.isArray(raw)) {
    return raw;
  }

  return [];
}

export function validateSubmissionFile(file) {
  if (!file) {
    return "Choose a file to upload.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return "Supported formats: PDF, Word, images (JPG/PNG/WebP), or ZIP.";
  }

  const maxBytes = 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    return "File must be 25 MB or smaller.";
  }

  return null;
}

export function isPastDue(dueAt, now = new Date()) {
  if (!dueAt) {
    return false;
  }

  return new Date(dueAt) < now;
}

export function canReplaceSubmission(lesson, submission, now = new Date()) {
  if (!lesson) {
    return false;
  }

  if (submission?.status === "completed") {
    return false;
  }

  return !isPastDue(lesson.due_at, now);
}

export function getDisplayStatus(submission) {
  if (!submission?.file_path && !submission?.submitted_at) {
    return "not_submitted";
  }

  if (submission.status === "revision_requested") {
    return "revision_requested";
  }

  return submission.status || "submitted";
}

export function getStatusPillClass(status) {
  switch (status) {
    case "completed":
      return "pill success";
    case "reviewed":
      return "pill info";
    case "under_review":
      return "pill warning";
    case "submitted":
      return "pill info";
    case "revision_requested":
      return "pill danger";
    default:
      return "pill";
  }
}

export function getStatusAccentClass(status) {
  switch (status) {
    case "completed":
      return "status-accent success";
    case "reviewed":
      return "status-accent info";
    case "under_review":
      return "status-accent warning";
    case "submitted":
      return "status-accent info";
    case "revision_requested":
      return "status-accent danger";
    default:
      return "status-accent muted";
  }
}

export function formatDueDate(value) {
  if (!value) {
    return "No due date";
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

export function getDueBadge(lesson, now = new Date()) {
  if (!lesson?.due_at) {
    return { label: "Open", className: "assignment-due-badge open" };
  }

  const due = new Date(lesson.due_at);
  const hoursLeft = (due - now) / (1000 * 60 * 60);

  if (hoursLeft < 0) {
    return { label: "Past due", className: "assignment-due-badge overdue" };
  }

  if (hoursLeft <= 48) {
    return { label: "Due soon", className: "assignment-due-badge soon" };
  }

  return { label: formatDueDate(lesson.due_at), className: "assignment-due-badge" };
}

export function computeAssignmentProgress(workLessons, submissions, userId) {
  const mine = workLessons.filter((lesson) => {
    const submission = submissions.find(
      (row) => row.lesson_id === lesson.id && row.user_id === userId
    );
    const status = getDisplayStatus(submission);
    return status === "completed" || status === "reviewed";
  }).length;

  const total = workLessons.length;
  const percent = total ? Math.round((mine / total) * 100) : 0;

  return { completed: mine, total, percent };
}

export function computeUserAssignmentStats({
  workLessons,
  submissions,
  userId,
  classIds,
  now = new Date()
}) {
  const relevantLessons = workLessons.filter((lesson) => classIds.has(lesson.class_id));
  const pending = [];
  const upcomingDeadlines = [];
  const recentlyGraded = [];

  relevantLessons.forEach((lesson) => {
    const submission = submissions.find(
      (row) => row.lesson_id === lesson.id && row.user_id === userId
    );
    const status = getDisplayStatus(submission);

    if (status !== "completed" && status !== "reviewed") {
      pending.push(lesson);
    }

    if (lesson.due_at && new Date(lesson.due_at) > now) {
      upcomingDeadlines.push(lesson);
    }

    if (
      submission &&
      (submission.feedback || submission.encouragement || submission.score != null) &&
      submission.reviewed_at
    ) {
      const reviewedAt = new Date(submission.reviewed_at);
      if (now - reviewedAt < 14 * 24 * 60 * 60 * 1000) {
        recentlyGraded.push({ lesson, submission });
      }
    }
  });

  upcomingDeadlines.sort(
    (left, right) => new Date(left.due_at) - new Date(right.due_at)
  );

  recentlyGraded.sort(
    (left, right) =>
      new Date(right.submission.reviewed_at) - new Date(left.submission.reviewed_at)
  );

  const progress = computeAssignmentProgress(relevantLessons, submissions, userId);

  return {
    pending,
    upcomingDeadlines,
    recentlyGraded,
    progress
  };
}

export function buildSubmissionPath(classId, lessonId, userId, fileName) {
  const safeName = fileName.replace(/\s+/g, "-");
  return `${classId}/${lessonId}/${userId}/${Date.now()}-${safeName}`;
}

export function buildResourcePath(classId, fileName) {
  const safeName = fileName.replace(/\s+/g, "-");
  return `${classId}/assignment-resources/${Date.now()}-${safeName}`;
}
