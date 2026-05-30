import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  computeUserAssignmentStats,
  getDisplayStatus,
  getDueBadge,
  getLessonInstructions,
  getStatusAccentClass,
  getStatusPillClass,
  isWorkLesson,
  STATUS_LABELS
} from "../lib/discipleshipAssignments";
import { DiscipleshipAssignments } from "./DiscipleshipAssignments";
import { DiscipleshipGuidelines } from "./DiscipleshipGuidelines";
import { DiscipleshipPortalLayout } from "./discipleship/DiscipleshipPortalLayout";
import { PortalAttendanceView } from "./discipleship/PortalAttendanceView";
import { PortalLessonsModules } from "./discipleship/PortalLessonsModules";
import { PortalOverview } from "./discipleship/PortalOverview";
import { PortalProgressView } from "./discipleship/PortalProgressView";
import { PortalSessionsView } from "./discipleship/PortalSessionsView";
import { PortalSubmissions } from "./discipleship/PortalSubmissions";
import { PortalClassDashboard } from "./discipleship/PortalClassDashboard";
import { PortalAchievements } from "./discipleship/PortalAchievements";
import { portalIcons } from "./discipleship/PortalIcons";
import {
  PortalStudyGroups,
  PortalResources,
  PortalUsefulLinks,
  PortalProfile
} from "./discipleship/PortalNavPages";
import { getInitials } from "./discipleship/DiscipleshipPortalLayout";

const emptyClassForm = {
  title: "",
  description: "",
  leader_id: "",
  starts_at: "",
  ends_at: "",
  meet_url: "",
  banner_url: "",
  status: "upcoming",
  requires_approval: false
};

const emptySessionForm = {
  title: "",
  starts_at: "",
  ends_at: "",
  meet_url: "",
  sort_order: "0"
};

const emptyLessonForm = {
  title: "",
  description: "",
  module_label: "",
  sort_order: "0",
  lesson_type: "note",
  note_content: "",
  external_url: "",
  video_url: "",
  assignment_prompt: "",
  discussion_topic: ""
};

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

function toLocalDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function truncateText(text, max = 120) {
  if (!text) {
    return "";
  }

  return text.length > max ? `${text.slice(0, max)}…` : text;
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

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
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

function getClassTimelineStatus(classItem, now = new Date()) {
  if (classItem.status === "draft") {
    return "draft";
  }

  if (classItem.status === "completed") {
    return "completed";
  }

  const end = classItem.ends_at ? new Date(classItem.ends_at) : null;
  const start = classItem.starts_at ? new Date(classItem.starts_at) : null;

  if (end && end < now) {
    return "completed";
  }

  if (start && start > now) {
    return "upcoming";
  }

  if (start && start <= now && (!end || end >= now)) {
    return "ongoing";
  }

  return classItem.status || "upcoming";
}

function isSessionLive(session, classItem, now = new Date()) {
  const start = new Date(session.starts_at);
  const end = session.ends_at
    ? new Date(session.ends_at)
    : classItem.ends_at
      ? new Date(classItem.ends_at)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const windowStart = new Date(start.getTime() - 10 * 60 * 1000);

  return now >= windowStart && now <= end;
}

export function DiscipleshipSection({
  user,
  isAdmin,
  profiles,
  classes,
  sessions,
  enrollments,
  lessons,
  lessonCompletions,
  assignmentSubmissions,
  submissionHistory,
  memberNotes,
  sessionAttendance,
  discussions,
  reactions = [],
  runAction,
  submitting,
  liveNow,
  onSelectClassId,
  selectedClassId,
  focusDetailTab,
  onFocusDetailTabConsumed,
  theme = "light",
  onThemeToggle,
  notificationCount = 0,
  onOpenNotifications,
  userAvatarUrl = ""
}) {
  const [catalogTab, setCatalogTab] = useState("available");
  const [portalPage, setPortalPage] = useState("overview");
  const [notesSearch, setNotesSearch] = useState("");
  const [portalSearch, setPortalSearch] = useState("");

  useEffect(() => {
    if (focusDetailTab) {
      setPortalPage(focusDetailTab);
      onFocusDetailTabConsumed?.();
    }
  }, [focusDetailTab, onFocusDetailTabConsumed]);
  const [classForm, setClassForm] = useState(emptyClassForm);
  const [editingClassId, setEditingClassId] = useState("");
  const [sessionForm, setSessionForm] = useState(emptySessionForm);
  const [editingSessionId, setEditingSessionId] = useState("");
  const [lessonForm, setLessonForm] = useState(emptyLessonForm);
  const [editingLessonId, setEditingLessonId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [noteDrafts, setNoteDrafts] = useState({});
  const [selectedLessonFile, setSelectedLessonFile] = useState(null);
  const [lessonFileName, setLessonFileName] = useState("");
  const [showManagePanel, setShowManagePanel] = useState(false);

  const activeMembers = profiles.filter((member) => member.is_active);
  const now = liveNow instanceof Date ? liveNow : new Date(liveNow);
  const currentProfile = profiles.find((item) => item.id === user.id);
  const userName =
    currentProfile?.full_name || user.email?.split("@")[0] || "Disciple";

  const isPortalTeacher = useMemo(
    () => isAdmin || classes.some((classItem) => classItem.leader_id === user.id),
    [classes, isAdmin, user.id]
  );

  function wrapPortal(children) {
    const activeClass = selectedClass;
    const classProgress = activeClass ? computeClassProgress(activeClass.id).overall : 0;
    const portalRoles = activeClass
      ? {
          teacher: canManageClass(activeClass),
          student: isApprovedEnrolled(activeClass.id)
        }
      : { teacher: isPortalTeacher, student: isPortalStudent };

    return (
      <DiscipleshipPortalLayout
        userName={userName}
        roles={portalRoles}
        portalPage={activePortalPage}
        onNavigate={setPortalPage}
        selectedClassId={layoutClassId}
        classes={classes.filter((item) => item.status !== "draft" || isAdmin)}
        onSelectClassId={(classId) => {
          onSelectClassId(classId);
          if (classId) {
            setPortalPage("overview");
          }
        }}
        courseTitle={activeClass?.title ?? ""}
        courseProgress={classProgress}
        searchQuery={portalSearch}
        onSearchChange={setPortalSearch}
        notificationCount={notificationCount}
        onNotificationsClick={onOpenNotifications}
        onOpenSettings={() => setPortalPage("links")}
        onOpenHelp={() => setPortalPage("links")}
        theme={theme}
        onThemeToggle={onThemeToggle}
        userAvatarUrl={userAvatarUrl || currentProfile?.avatar_url}
      >
        {children}
      </DiscipleshipPortalLayout>
    );
  }

  const classRequiredPages = [
    "lessons",
    "assignments",
    "sessions",
    "attendance",
    "discussion",
    "notes",
    "study-groups"
  ];

  function renderSelectClassPrompt() {
    return (
      <div className="dp-select-class-prompt">
        <h3>Select a course</h3>
        <p>Choose your active class from the sidebar course card to access this section.</p>
        <button type="button" className="dp-btn-primary" onClick={() => setPortalPage("classes")}>
          Browse classes
        </button>
      </div>
    );
  }

  function renderPortalNavExtras({ inClassView = false, page = portalPage }) {
    const activeClass = selectedClass;
    const portalRoles = activeClass
      ? {
          teacher: canManageClass(activeClass),
          student: isApprovedEnrolled(activeClass.id)
        }
      : { teacher: isPortalTeacher, student: isPortalStudent };
    const roleLabel =
      portalRoles.teacher && portalRoles.student
        ? "Teacher & Student"
        : portalRoles.teacher
          ? "Teacher"
          : portalRoles.student
            ? "Student"
            : "Learner";
    const progress = activeClass ? computeClassProgress(activeClass.id).overall : 0;

    const classForExtras = selectedClass;
    const enrollmentsForExtras = inClassView
      ? classEnrollments
      : selectedClass
        ? enrollments.filter((row) => row.class_id === selectedClass.id)
        : [];

    return (
      <>
        {page === "profile" ? (
          <PortalProfile
            userName={userName}
            roleLabel={roleLabel}
            courseTitle={classForExtras?.title}
            courseProgress={progress}
            userAvatarUrl={userAvatarUrl || currentProfile?.avatar_url}
            getInitials={getInitials}
          />
        ) : null}

        {page === "study-groups" && !selectedClass ? renderSelectClassPrompt() : null}

        {page === "study-groups" && classForExtras ? (
          <PortalStudyGroups
            selectedClass={classForExtras}
            getMemberLabel={getMemberLabel}
            classEnrollments={enrollmentsForExtras}
          />
        ) : null}

        {page === "resources" ? <PortalResources selectedClass={classForExtras} /> : null}

        {page === "links" ? <PortalUsefulLinks /> : null}
      </>
    );
  }

  function getMemberLabel(memberId) {
    const member = profiles.find((item) => item.id === memberId);
    return member?.full_name || member?.email?.split("@")[0] || "Member";
  }

  function canManageClass(classItem) {
    return isAdmin || classItem?.leader_id === user.id;
  }

  function getEnrollment(classId) {
    return enrollments.find(
      (row) => row.class_id === classId && row.user_id === user.id
    );
  }

  function isApprovedEnrolled(classId) {
    return getEnrollment(classId)?.status === "approved";
  }

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const layoutClassId = selectedClass?.id ?? "";
  const hasInvalidClassSelection = Boolean(selectedClassId && !selectedClass);
  const activePortalPage = hasInvalidClassSelection ? "overview" : portalPage;

  useEffect(() => {
    if (!selectedClassId) {
      return;
    }

    if (!classes.some((item) => item.id === selectedClassId)) {
      onSelectClassId("");
      setPortalPage((current) =>
        classRequiredPages.includes(current) ? "overview" : current
      );
    }
  }, [selectedClassId, classes, onSelectClassId]);

  const selectedEnrollment = selectedClass ? getEnrollment(selectedClass.id) : null;
  const canAccessContent =
    selectedClass && (canManageClass(selectedClass) || isApprovedEnrolled(selectedClass.id));

  const classSessions = useMemo(
    () =>
      sessions
        .filter((row) => row.class_id === selectedClassId)
        .sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }

          return new Date(left.starts_at) - new Date(right.starts_at);
        }),
    [sessions, selectedClassId]
  );

  const classLessons = useMemo(
    () =>
      lessons
        .filter((row) => row.class_id === selectedClassId)
        .sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }

          return new Date(left.created_at) - new Date(right.created_at);
        }),
    [lessons, selectedClassId]
  );

  const learningLessons = useMemo(
    () =>
      classLessons.filter(
        (lesson) => !["assignment", "project"].includes(lesson.lesson_type)
      ),
    [classLessons]
  );

  const classDiscussions = useMemo(
    () =>
      discussions
        .filter((row) => row.class_id === selectedClassId)
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at)),
    [discussions, selectedClassId]
  );

  const classEnrollments = useMemo(
    () => enrollments.filter((row) => row.class_id === selectedClassId),
    [enrollments, selectedClassId]
  );

  const myCompletedLessonIds = new Set(
    lessonCompletions
      .filter((row) => row.user_id === user.id)
      .map((row) => row.lesson_id)
  );

  function computeClassProgress(classId) {
    const classLessonRows = lessons.filter((row) => row.class_id === classId);
    const classSessionRows = sessions.filter((row) => row.class_id === classId);
    const completedLessons = classLessonRows.filter((row) =>
      myCompletedLessonIds.has(row.id)
    ).length;
    const lessonPercent = classLessonRows.length
      ? Math.round((completedLessons / classLessonRows.length) * 100)
      : 0;

    const myAttendance = sessionAttendance.filter(
      (row) =>
        row.user_id === user.id &&
        classSessionRows.some((session) => session.id === row.session_id)
    );
    const presentCount = myAttendance.filter((row) => row.status === "present").length;
    const attendancePercent = classSessionRows.length
      ? Math.round((presentCount / classSessionRows.length) * 100)
      : 0;

    const overall = Math.round((lessonPercent + attendancePercent) / 2);

    return { lessonPercent, attendancePercent, overall, completedLessons };
  }

  const myEnrolledClasses = classes.filter((classItem) => {
    const enrollment = getEnrollment(classItem.id);
    return enrollment?.status === "approved" || enrollment?.status === "pending";
  });

  const myApprovedClassIds = useMemo(
    () =>
      new Set(
        enrollments
          .filter((row) => row.user_id === user.id && row.status === "approved")
          .map((row) => row.class_id)
      ),
    [enrollments, user.id]
  );

  const accessibleClassIds = useMemo(() => {
    const ids = new Set(myApprovedClassIds);

    classes.forEach((classItem) => {
      if (isAdmin || classItem.leader_id === user.id) {
        ids.add(classItem.id);
      }
    });

    return ids;
  }, [myApprovedClassIds, classes, isAdmin, user.id]);

  const isPortalStudent = myApprovedClassIds.size > 0;

  const portalHeroStats = useMemo(() => {
    const workLessons = lessons.filter(
      (lesson) => isWorkLesson(lesson) && myApprovedClassIds.has(lesson.class_id)
    );
    const assignmentStats = computeUserAssignmentStats({
      workLessons,
      submissions: assignmentSubmissions,
      userId: user.id,
      classIds: myApprovedClassIds,
      now
    });
    const currentClass = selectedClassId
      ? classes.find((item) => item.id === selectedClassId)
      : myEnrolledClasses[0] ?? classes.find((item) => myApprovedClassIds.has(item.id));
    const progress = currentClass ? computeClassProgress(currentClass.id) : { overall: 0 };
    const nextSession = [...sessions]
      .filter((session) => myApprovedClassIds.has(session.class_id))
      .filter((session) => new Date(session.starts_at) > now)
      .sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at))[0];

    return [
      {
        label: "Current class",
        value: currentClass?.title ? truncateText(currentClass.title, 22) : "Not enrolled",
        hint: currentClass ? "Your active program" : "Browse classes to join",
        tone: "default"
      },
      {
        label: "Completion",
        value: `${progress.overall}%`,
        hint: "Lessons & attendance",
        tone: "success"
      },
      {
        label: "Next session",
        value: nextSession ? truncateText(nextSession.title, 18) : "None scheduled",
        hint: nextSession ? formatDateTime(nextSession.starts_at) : "Check back soon",
        tone: "default"
      },
      {
        label: "Pending work",
        value: String(assignmentStats.pending.length),
        hint: "Assignments due",
        tone: assignmentStats.pending.length ? "warning" : "default"
      }
    ];
  }, [
    lessons,
    assignmentSubmissions,
    classes,
    sessions,
    myApprovedClassIds,
    myEnrolledClasses,
    selectedClassId,
    user.id,
    now
  ]);

  const assignmentLessons = useMemo(
    () =>
      lessons
        .filter(
          (lesson) =>
            lesson.lesson_type === "assignment" && accessibleClassIds.has(lesson.class_id)
        )
        .sort((left, right) => left.sort_order - right.sort_order),
    [lessons, accessibleClassIds]
  );

  const projectLessons = useMemo(
    () =>
      lessons
        .filter(
          (lesson) => lesson.lesson_type === "project" && accessibleClassIds.has(lesson.class_id)
        )
        .sort((left, right) => left.sort_order - right.sort_order),
    [lessons, accessibleClassIds]
  );

  function getClassTitle(classId) {
    return classes.find((item) => item.id === classId)?.title ?? "Discipleship class";
  }

  function getSubmissionForLesson(lessonId) {
    return assignmentSubmissions.find(
      (row) => row.lesson_id === lessonId && row.user_id === user.id
    );
  }

  function renderWorkItemCard(lesson, kind) {
    const submission = getSubmissionForLesson(lesson.id);
    const status = getDisplayStatus(submission);
    const dueBadge = getDueBadge(lesson, now);
    const classTitle = getClassTitle(lesson.class_id);

    return (
      <article
        key={lesson.id}
        className={`discipleship-work-card ${getStatusAccentClass(status)}`}
      >
        <div className="discipleship-work-card-accent" aria-hidden="true" />
        <div className="discipleship-work-card-inner">
          <div className="discipleship-work-card-head">
            <span className={kind === "project" ? "pill warning" : "pill info"}>
              {kind === "project" ? "Class project" : "Assignment"}
            </span>
            <span className={getStatusPillClass(status)}>{STATUS_LABELS[status]}</span>
          </div>
          <h3>{lesson.title}</h3>
          <p className="discipleship-work-class">{classTitle}</p>
          <div className="discipleship-work-meta">
            {lesson.module_label ? <span className="assignment-module-tag">{lesson.module_label}</span> : null}
            <span className={dueBadge.className}>{dueBadge.label}</span>
          </div>
          <p className="discipleship-work-preview">{truncateText(getLessonInstructions(lesson), 140)}</p>
          <div className="discipleship-work-footer">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onSelectClassId(lesson.class_id);
                setPortalPage("assignments");
              }}
            >
              Open assignment
            </button>
          </div>
        </div>
      </article>
    );
  }

  const catalogClasses = classes.filter((classItem) => {
    const timeline = getClassTimelineStatus(classItem, now);

    if (catalogTab === "my") {
      return Boolean(getEnrollment(classItem.id));
    }

    if (catalogTab === "ongoing") {
      return timeline === "ongoing";
    }

    if (catalogTab === "upcoming") {
      return timeline === "upcoming";
    }

    if (catalogTab === "completed") {
      return timeline === "completed";
    }

    return classItem.status !== "draft" || canManageClass(classItem);
  });

  const liveSession =
    selectedClass &&
    classSessions.find((session) => isSessionLive(session, selectedClass, now));

  async function enrollInClass(classItem) {
    const status = classItem.requires_approval ? "pending" : "approved";

    await runAction(async () => {
      const { error } = await supabase.from("discipleship_enrollments").upsert(
        [
          {
            class_id: classItem.id,
            user_id: user.id,
            status,
            enrolled_at: new Date().toISOString(),
            ...(status === "approved"
              ? {
                  approved_by: user.id,
                  approved_at: new Date().toISOString()
                }
              : {})
          }
        ],
        { onConflict: "class_id,user_id" }
      );

      if (error) {
        throw error;
      }
    }, status === "pending" ? "Enrollment request sent for approval." : "You joined the class.");
  }

  async function updateEnrollmentStatus(classId, memberId, status) {
    await runAction(async () => {
      const { error } = await supabase
        .from("discipleship_enrollments")
        .update({
          status,
          approved_by: status === "approved" ? user.id : null,
          approved_at: status === "approved" ? new Date().toISOString() : null
        })
        .eq("class_id", classId)
        .eq("user_id", memberId);

      if (error) {
        throw error;
      }
    }, status === "approved" ? "Enrollment approved." : "Enrollment updated.");
  }

  function validateClassSchedule(startsAt, endsAt) {
    if (endsAt && !startsAt) {
      throw new Error("Add a start date and time before setting an end date.");
    }

    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new Error("End date/time must be after the start date/time.");
    }
  }

  async function handleClassSubmit(event) {
    event.preventDefault();

    const classId = editingClassId || selectedClassId;
    const existingClass = classId ? classes.find((item) => item.id === classId) : null;
    const startsAtInput =
      classForm.starts_at ||
      (existingClass?.starts_at ? toLocalDateTimeInput(existingClass.starts_at) : "");
    const endsAtInput =
      classForm.ends_at ||
      (existingClass?.ends_at ? toLocalDateTimeInput(existingClass.ends_at) : "");

    validateClassSchedule(startsAtInput, endsAtInput);

    const payload = {
      title: (classForm.title || existingClass?.title || "").trim(),
      description: (classForm.description ?? existingClass?.description ?? "").trim(),
      leader_id: classForm.leader_id || existingClass?.leader_id || null,
      starts_at: toIsoString(startsAtInput),
      ends_at: toIsoString(endsAtInput),
      meet_url: (classForm.meet_url || existingClass?.meet_url || "").trim() || null,
      banner_url: (classForm.banner_url || existingClass?.banner_url || "").trim() || null,
      status: classForm.status || existingClass?.status || "upcoming",
      requires_approval: classForm.requires_approval ?? existingClass?.requires_approval ?? false
    };

    await runAction(async () => {
      if (!payload.title) {
        throw new Error("Class title is required.");
      }

      if (classId) {
        const { error } = await supabase
          .from("discipleship_classes")
          .update(payload)
          .eq("id", classId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("discipleship_classes").insert([
          { ...payload, created_by: user.id }
        ]);

        if (error) {
          throw error;
        }
      }

      setClassForm(emptyClassForm);
      setEditingClassId("");
      setShowManagePanel(false);
    }, editingClassId || selectedClassId ? "Class updated." : "Class created.");
  }

  async function deleteClass(classId) {
    if (!window.confirm("Delete this discipleship class and all related content?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("discipleship_classes").delete().eq("id", classId);

      if (error) {
        throw error;
      }

      if (selectedClassId === classId) {
        onSelectClassId("");
        setPortalPage("overview");
      }
    }, "Class deleted.");
  }

  function beginClassEdit(classItem) {
    setEditingClassId(classItem.id);
    setClassForm({
      title: classItem.title ?? "",
      description: classItem.description ?? "",
      leader_id: classItem.leader_id ?? "",
      starts_at: classItem.starts_at ? toLocalDateTimeInput(classItem.starts_at) : "",
      ends_at: classItem.ends_at ? toLocalDateTimeInput(classItem.ends_at) : "",
      meet_url: classItem.meet_url ?? "",
      banner_url: classItem.banner_url ?? "",
      status: classItem.status ?? "upcoming",
      requires_approval: Boolean(classItem.requires_approval)
    });
    onSelectClassId(classItem.id);
    setPortalPage("overview");
    if (isAdmin) {
      setShowManagePanel(true);
    }
  }

  async function handleSessionSubmit(event) {
    event.preventDefault();

    if (!selectedClassId) {
      return;
    }

    const payload = {
      class_id: selectedClassId,
      title: sessionForm.title.trim(),
      starts_at: toIsoString(sessionForm.starts_at),
      ends_at: toIsoString(sessionForm.ends_at),
      meet_url: sessionForm.meet_url.trim() || null,
      sort_order: Number(sessionForm.sort_order) || 0
    };

    await runAction(async () => {
      if (!payload.title || !payload.starts_at) {
        throw new Error("Session title and start time are required.");
      }

      if (sessionForm.ends_at && new Date(sessionForm.ends_at) <= new Date(sessionForm.starts_at)) {
        throw new Error("Session end time must be after the start time.");
      }

      if (editingSessionId) {
        const { error } = await supabase
          .from("discipleship_class_sessions")
          .update(payload)
          .eq("id", editingSessionId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("discipleship_class_sessions").insert([payload]);

        if (error) {
          throw error;
        }
      }

      setSessionForm(emptySessionForm);
      setEditingSessionId("");
    }, editingSessionId ? "Session updated." : "Session scheduled.");
  }

  async function deleteSession(sessionId) {
    await runAction(async () => {
      const { error } = await supabase
        .from("discipleship_class_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) {
        throw error;
      }
    }, "Session removed.");
  }

  async function handleLessonSubmit(event) {
    event.preventDefault();

    if (!selectedClassId) {
      return;
    }

    await runAction(async () => {
      let fileMeta = null;

      if (lessonForm.lesson_type === "pdf" && selectedLessonFile) {
        const filePath = `${selectedClassId}/lesson-${Date.now()}-${selectedLessonFile.name.replace(/\s+/g, "-")}`;
        const { error: uploadError } = await supabase.storage
          .from("discipleship-materials")
          .upload(filePath, selectedLessonFile, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          throw uploadError;
        }

        fileMeta = { file_path: filePath, file_name: selectedLessonFile.name };
      }

      const editingLesson = lessons.find((row) => row.id === editingLessonId);
      const payload = {
        class_id: selectedClassId,
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim(),
        module_label: lessonForm.module_label.trim(),
        sort_order: Number(lessonForm.sort_order) || 0,
        lesson_type: lessonForm.lesson_type,
        note_content: lessonForm.lesson_type === "note" ? lessonForm.note_content.trim() : "",
        external_url:
          lessonForm.lesson_type === "link" ? lessonForm.external_url.trim() || null : null,
        video_url: lessonForm.lesson_type === "video" ? lessonForm.video_url.trim() || null : null,
        assignment_prompt:
          lessonForm.lesson_type === "assignment" || lessonForm.lesson_type === "project"
            ? lessonForm.assignment_prompt.trim()
            : "",
        discussion_topic:
          lessonForm.lesson_type === "discussion" ? lessonForm.discussion_topic.trim() : "",
        ...(lessonForm.lesson_type === "pdf"
          ? {
              file_path: fileMeta?.file_path ?? editingLesson?.file_path ?? null,
              file_name: fileMeta?.file_name ?? editingLesson?.file_name ?? null
            }
          : { file_path: null, file_name: null })
      };

      if (!payload.title) {
        throw new Error("Lesson title is required.");
      }

      if (editingLessonId) {
        const { error } = await supabase
          .from("discipleship_lessons")
          .update(payload)
          .eq("id", editingLessonId);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("discipleship_lessons").insert([
          { ...payload, created_by: user.id }
        ]);

        if (error) {
          throw error;
        }
      }

      setLessonForm(emptyLessonForm);
      setEditingLessonId("");
      setSelectedLessonFile(null);
      setLessonFileName("");
    }, editingLessonId ? "Lesson updated." : "Lesson added.");
  }

  async function toggleLessonComplete(lessonId) {
    const isComplete = myCompletedLessonIds.has(lessonId);

    await runAction(async () => {
      if (isComplete) {
        const { error } = await supabase
          .from("discipleship_lesson_completions")
          .delete()
          .eq("lesson_id", lessonId)
          .eq("user_id", user.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("discipleship_lesson_completions").insert([
          { lesson_id: lessonId, user_id: user.id }
        ]);

        if (error) {
          throw error;
        }
      }
    }, isComplete ? "Lesson marked incomplete." : "Lesson completed.");
  }

  async function saveMemberNote(lessonId, content) {
    await runAction(async () => {
      const existing = memberNotes.find(
        (row) => row.lesson_id === lessonId && row.user_id === user.id
      );
      const payload = { content: (content ?? "").trim() };

      const query = existing
        ? supabase.from("discipleship_member_notes").update(payload).eq("id", existing.id)
        : supabase.from("discipleship_member_notes").insert([
            { lesson_id: lessonId, user_id: user.id, ...payload }
          ]);

      const { error } = await query;

      if (error) {
        throw error;
      }
    }, "Reflection saved.");
  }

  async function postDiscussion(event) {
    event.preventDefault();

    if (!selectedClassId || !discussionDraft.trim()) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("discipleship_discussions").insert([
        {
          class_id: selectedClassId,
          lesson_id: selectedLessonId || null,
          user_id: user.id,
          content: discussionDraft.trim()
        }
      ]);

      if (error) {
        throw error;
      }

      setDiscussionDraft("");
    }, "Question posted.");
  }

  const discussionReactionOptions = [
    { type: "love", iconKey: "heart", label: "Love" },
    { type: "like", iconKey: "thumbsUp", label: "Like" },
    { type: "pray", iconKey: "pray", label: "Pray" }
  ];

  function getDiscussionReactionStats(postId) {
    const rows = reactions.filter(
      (row) => row.entity_table === "discipleship_discussions" && row.entity_id === postId
    );

    return discussionReactionOptions.map(({ type, iconKey, label }) => ({
      type,
      iconKey,
      label,
      count: rows.filter((row) => row.reaction === type).length,
      selected: rows.some((row) => row.reaction === type && row.user_id === user.id)
    }));
  }

  async function toggleDiscussionReaction(postId, reaction) {
    const existing = reactions.find(
      (row) =>
        row.entity_table === "discipleship_discussions" &&
        row.entity_id === postId &&
        row.reaction === reaction &&
        row.user_id === user.id
    );

    await runAction(async () => {
      if (existing) {
        const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("reactions").insert([
          {
            user_id: user.id,
            entity_table: "discipleship_discussions",
            entity_id: postId,
            reaction
          }
        ]);

        if (error) {
          throw error;
        }
      }
    });
  }

  async function markAttendance(sessionId, memberId, status) {
    await runAction(async () => {
      const { error } = await supabase.from("discipleship_session_attendance").upsert(
        [
          {
            session_id: sessionId,
            user_id: memberId,
            status,
            checked_in_at: new Date().toISOString(),
            marked_by: user.id
          }
        ],
        { onConflict: "session_id,user_id" }
      );

      if (error) {
        throw error;
      }
    }, "Attendance updated.");
  }

  async function selfCheckIn(session) {
    await runAction(async () => {
      const { error } = await supabase.from("discipleship_session_attendance").upsert(
        [
          {
            session_id: session.id,
            user_id: user.id,
            status: "present",
            checked_in_at: new Date().toISOString(),
            marked_by: user.id
          }
        ],
        { onConflict: "session_id,user_id" }
      );

      if (error) {
        throw error;
      }
    }, "Checked in for this session.");
  }

  function openLessonMaterial(lesson) {
    if (lesson.lesson_type === "pdf" && lesson.file_path) {
      const { data } = supabase.storage
        .from("discipleship-materials")
        .getPublicUrl(lesson.file_path);
      window.open(data.publicUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (lesson.lesson_type === "link" && lesson.external_url) {
      window.open(lesson.external_url, "_blank", "noopener,noreferrer");
      return;
    }

    if (lesson.lesson_type === "video" && lesson.video_url) {
      window.open(lesson.video_url, "_blank", "noopener,noreferrer");
    }
  }

  function joinLiveClass(url) {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function renderClassCard(classItem) {
    const timeline = getClassTimelineStatus(classItem, now);
    const enrollment = getEnrollment(classItem.id);
    const progress = computeClassProgress(classItem.id);
    const leaderLabel = classItem.leader_id ? getMemberLabel(classItem.leader_id) : "TBD";
    const pillClass =
      timeline === "ongoing"
        ? "pill success"
        : timeline === "completed"
          ? "pill"
          : timeline === "upcoming"
            ? "pill warning"
            : "pill info";

    return (
      <article key={classItem.id} className="discipleship-class-card">
        {classItem.banner_url ? (
          <div
            className="discipleship-banner"
            style={{ backgroundImage: `url(${classItem.banner_url})` }}
          />
        ) : (
          <div className="discipleship-banner discipleship-banner-placeholder">
            <span>Discipleship</span>
          </div>
        )}

        <div className="discipleship-card-body">
          <div className="task-header">
            <div>
              <h3>{classItem.title}</h3>
              <p>{formatDateTime(classItem.starts_at)}</p>
            </div>
            <span className={pillClass}>
              {timeline === "ongoing"
                ? "Ongoing"
                : timeline === "completed"
                  ? "Completed"
                  : timeline === "upcoming"
                    ? "Upcoming"
                    : "Draft"}
            </span>
          </div>

          <p className="task-details">
            Leader: {leaderLabel}
            {classItem.description ? ` • ${truncateText(classItem.description, 100)}` : ""}
          </p>

          {enrollment?.status === "approved" ? (
            <ProgressBar value={progress.overall} label="Your progress" />
          ) : null}

          <div className="inline-actions">
            <button
              type="button"
              className="dp-btn-primary"
              onClick={() => {
                onSelectClassId(classItem.id);
                setPortalPage(enrollment?.status === "approved" ? "lessons" : "overview");
              }}
            >
              {enrollment?.status === "approved" ? "Continue learning" : "View details"}
            </button>

            {!enrollment && classItem.status !== "draft" && timeline !== "completed" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => enrollInClass(classItem)}
                disabled={submitting}
              >
                {classItem.requires_approval ? "Request to join" : "Join class"}
              </button>
            ) : null}

            {enrollment?.status === "pending" ? (
              <span className="pill warning">Pending approval</span>
            ) : null}

            {canManageClass(classItem) ? (
              <>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => beginClassEdit(classItem)}
                >
                  Edit
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => deleteClass(classItem.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  if (selectedClass) {
    const progress = computeClassProgress(selectedClass.id);
    const manageMode = canManageClass(selectedClass);

    return wrapPortal(
      <>
        {liveSession ? (
          <div className="live-now-banner">
            <div>
              <span className="live-dot" aria-hidden="true" />
              <strong>Live session now</strong>
              <span className="muted-text">{liveSession.title}</span>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                joinLiveClass(liveSession.meet_url || selectedClass.meet_url)
              }
              disabled={!liveSession.meet_url && !selectedClass.meet_url}
            >
              Join class
            </button>
          </div>
        ) : null}

        {portalPage === "classes" ? (
          <div className="dp-page">
            <button type="button" className="dp-btn-secondary" onClick={() => onSelectClassId("")}>
              ← All classes
            </button>
            <div className="dp-course-grid">{catalogClasses.map(renderClassCard)}</div>
          </div>
        ) : null}

        {portalPage === "submissions" ? (
          <PortalSubmissions
            user={user}
            lessons={lessons}
            classes={classes}
            assignmentSubmissions={assignmentSubmissions}
            submissionHistory={submissionHistory}
            myApprovedClassIds={myApprovedClassIds}
            accessibleClassIds={accessibleClassIds}
            runAction={runAction}
            submitting={submitting}
            liveNow={now}
            getClassTitle={getClassTitle}
          />
        ) : null}

        {portalPage === "progress" ? (
          <PortalProgressView
            classes={classes}
            lessons={lessons}
            lessonCompletions={lessonCompletions}
            assignmentSubmissions={assignmentSubmissions}
            sessionAttendance={sessionAttendance}
            sessions={sessions}
            enrollments={enrollments}
            userId={user.id}
            myApprovedClassIds={myApprovedClassIds}
            now={now}
          />
        ) : null}

        {portalPage === "achievements" ? (
          <PortalAchievements
            lessonCompletions={lessonCompletions}
            assignmentSubmissions={assignmentSubmissions}
            sessionAttendance={sessionAttendance}
            userId={user.id}
            myApprovedClassIds={myApprovedClassIds}
            progressSummary={[
              { label: "Classes enrolled", value: String(myApprovedClassIds.size) },
              {
                label: "Lessons done",
                value: String(
                  lessonCompletions.filter((row) => row.user_id === user.id).length
                )
              },
              {
                label: "Work approved",
                value: String(
                  assignmentSubmissions.filter(
                    (row) => row.user_id === user.id && row.status === "approved"
                  ).length
                )
              }
            ]}
          />
        ) : null}

        {renderPortalNavExtras({ inClassView: true, page: portalPage })}

        {portalPage === "overview" ? (
          <>
            <PortalClassDashboard
              selectedClass={selectedClass}
              progress={progress}
              learningLessons={learningLessons}
              myCompletedLessonIds={myCompletedLessonIds}
              classSessions={classSessions}
              lessons={lessons}
              assignmentSubmissions={assignmentSubmissions}
              userId={user.id}
              now={now}
              getMemberLabel={getMemberLabel}
              formatDateTime={formatDateTime}
              canAccessContent={canAccessContent}
              selectedEnrollment={selectedEnrollment}
              onResumeLesson={(lesson) => {
                setPortalPage("lessons");
                openLessonMaterial(lesson);
              }}
              onNavigate={setPortalPage}
              onEnroll={() => enrollInClass(selectedClass)}
              submitting={submitting}
            />
            {manageMode ? (
              <Panel title="Manage class" subtitle="Update schedule, leader, and enrollment settings.">
            <form className="form-grid" onSubmit={handleClassSubmit}>
              <input type="hidden" value={editingClassId || selectedClass.id} readOnly />
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={classForm.title || selectedClass.title}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={classForm.description || selectedClass.description}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Leader</span>
                <select
                  value={classForm.leader_id || selectedClass.leader_id || ""}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, leader_id: event.target.value }))
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
                <span>Starts at</span>
                <input
                  type="datetime-local"
                  value={
                    classForm.starts_at ||
                    (selectedClass.starts_at
                      ? toLocalDateTimeInput(selectedClass.starts_at)
                      : "")
                  }
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, starts_at: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Ends at (optional)</span>
                <input
                  type="datetime-local"
                  value={
                    classForm.ends_at ||
                    (selectedClass.ends_at ? toLocalDateTimeInput(selectedClass.ends_at) : "")
                  }
                  min={
                    classForm.starts_at ||
                    (selectedClass.starts_at
                      ? toLocalDateTimeInput(selectedClass.starts_at)
                      : undefined)
                  }
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, ends_at: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Google Meet link</span>
                <input
                  type="url"
                  value={classForm.meet_url || selectedClass.meet_url || ""}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, meet_url: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Requires approval to join</span>
                <input
                  type="checkbox"
                  checked={classForm.requires_approval ?? selectedClass.requires_approval}
                  onChange={(event) =>
                    setClassForm((current) => ({
                      ...current,
                      requires_approval: event.target.checked
                    }))
                  }
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  Save class settings
                </button>
              </div>
            </form>

            {classEnrollments.length ? (
              <div className="card-list">
                {classEnrollments.map((row) => (
                  <div key={`${row.class_id}-${row.user_id}`} className="idea-card">
                    <strong>{getMemberLabel(row.user_id)}</strong>
                    <span className="pill">{row.status}</span>
                    {row.status === "pending" && manageMode ? (
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            updateEnrollmentStatus(row.class_id, row.user_id, "approved")
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() =>
                            updateEnrollmentStatus(row.class_id, row.user_id, "rejected")
                          }
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No enrollments yet" description="Members will appear here when they join." />
            )}
              </Panel>
            ) : null}
          </>
        ) : null}

        {portalPage === "assignments" && !canAccessContent ? renderSelectClassPrompt() : null}

        {portalPage === "assignments" && canAccessContent ? (
          <DiscipleshipAssignments
            user={user}
            profiles={profiles}
            selectedClass={selectedClass}
            lessons={lessons}
            submissions={assignmentSubmissions}
            submissionHistory={submissionHistory}
            enrollments={enrollments}
            runAction={runAction}
            submitting={submitting}
            manageMode={manageMode}
            isApprovedEnrolled={isApprovedEnrolled(selectedClass.id)}
            liveNow={now}
          />
        ) : null}

        {portalPage === "lessons" && !canAccessContent ? renderSelectClassPrompt() : null}

        {portalPage === "lessons" && canAccessContent ? (
          <PortalLessonsModules
            classLessons={learningLessons}
            myCompletedLessonIds={myCompletedLessonIds}
            onOpenMaterial={openLessonMaterial}
            onToggleComplete={toggleLessonComplete}
            submitting={submitting}
            manageForm={
              manageMode ? (
              <Panel title="Add lesson" subtitle="Organize content by weekly modules or sessions.">
                <form className="form-grid" onSubmit={handleLessonSubmit}>
                  <label className="field">
                    <span>Title</span>
                    <input
                      type="text"
                      value={lessonForm.title}
                      onChange={(event) =>
                        setLessonForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Module (Week / Chapter)</span>
                    <input
                      type="text"
                      value={lessonForm.module_label}
                      onChange={(event) =>
                        setLessonForm((current) => ({
                          ...current,
                          module_label: event.target.value
                        }))
                      }
                      placeholder="Week 1"
                    />
                  </label>
                  <label className="field">
                    <span>Material type</span>
                    <select
                      value={lessonForm.lesson_type}
                      onChange={(event) =>
                        setLessonForm((current) => ({
                          ...current,
                          lesson_type: event.target.value
                        }))
                      }
                    >
                      <option value="note">Notes</option>
                      <option value="pdf">PDF</option>
                      <option value="link">Link</option>
                      <option value="video">Video</option>
                      <option value="assignment">Assignment</option>
                      <option value="project">Class project</option>
                      <option value="discussion">Discussion topic</option>
                    </select>
                  </label>
                  {lessonForm.lesson_type === "note" ? (
                    <label className="field">
                      <span>Notes</span>
                      <textarea
                        rows={4}
                        value={lessonForm.note_content}
                        onChange={(event) =>
                          setLessonForm((current) => ({
                            ...current,
                            note_content: event.target.value
                          }))
                        }
                      />
                    </label>
                  ) : null}
                  {lessonForm.lesson_type === "pdf" ? (
                    <label className="field">
                      <span>PDF file</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setSelectedLessonFile(file);
                          setLessonFileName(file?.name ?? "");
                        }}
                      />
                      {lessonFileName ? <span className="inline-help">{lessonFileName}</span> : null}
                    </label>
                  ) : null}
                  {lessonForm.lesson_type === "link" ? (
                    <label className="field">
                      <span>Link URL</span>
                      <input
                        type="url"
                        value={lessonForm.external_url}
                        onChange={(event) =>
                          setLessonForm((current) => ({
                            ...current,
                            external_url: event.target.value
                          }))
                        }
                      />
                    </label>
                  ) : null}
                  {lessonForm.lesson_type === "assignment" ||
                  lessonForm.lesson_type === "project" ? (
                    <label className="field">
                      <span>
                        {lessonForm.lesson_type === "project"
                          ? "Project brief"
                          : "Assignment instructions"}
                      </span>
                      <textarea
                        rows={4}
                        value={lessonForm.assignment_prompt}
                        onChange={(event) =>
                          setLessonForm((current) => ({
                            ...current,
                            assignment_prompt: event.target.value
                          }))
                        }
                        placeholder={
                          lessonForm.lesson_type === "project"
                            ? "Describe the mandatory graduation project…"
                            : "Weekly assignment details and deadline…"
                        }
                      />
                    </label>
                  ) : null}
                  {lessonForm.lesson_type === "video" ? (
                    <label className="field">
                      <span>Video URL</span>
                      <input
                        type="url"
                        value={lessonForm.video_url}
                        onChange={(event) =>
                          setLessonForm((current) => ({
                            ...current,
                            video_url: event.target.value
                          }))
                        }
                      />
                    </label>
                  ) : null}
                  <div className="form-actions">
                    <button type="submit" className="primary-button" disabled={submitting}>
                      {editingLessonId ? "Save lesson" : "Add lesson"}
                    </button>
                  </div>
                </form>
              </Panel>
              ) : null
            }
          />
        ) : null}

        {portalPage === "sessions" && !canAccessContent ? renderSelectClassPrompt() : null}

        {portalPage === "sessions" && canAccessContent ? (
          <>
            <PortalSessionsView
              sessions={classSessions}
              selectedClass={selectedClass}
              getMemberLabel={getMemberLabel}
              formatDateTime={formatDateTime}
              isSessionLive={isSessionLive}
              now={now}
              onJoin={joinLiveClass}
              manageForm={
                manageMode ? (
                  <section className="dp-panel">
                    <div className="dp-panel-head">
                      <h2>Schedule session</h2>
                      <p>Add in-person or virtual class sessions.</p>
                    </div>
                    <form className="form-grid" onSubmit={handleSessionSubmit}>
                      <label className="field">
                        <span>Session title</span>
                        <input
                          type="text"
                          value={sessionForm.title}
                          onChange={(event) =>
                            setSessionForm((current) => ({ ...current, title: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Starts at</span>
                        <input
                          type="datetime-local"
                          value={sessionForm.starts_at}
                          onChange={(event) =>
                            setSessionForm((current) => ({
                              ...current,
                              starts_at: event.target.value
                            }))
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Google Meet link (optional)</span>
                        <input
                          type="url"
                          value={sessionForm.meet_url}
                          onChange={(event) =>
                            setSessionForm((current) => ({
                              ...current,
                              meet_url: event.target.value
                            }))
                          }
                        />
                      </label>
                      <div className="form-actions">
                        <button type="submit" className="dp-btn-primary" disabled={submitting}>
                          {editingSessionId ? "Save session" : "Add session"}
                        </button>
                      </div>
                    </form>
                  </section>
                ) : null
              }
            />

            {!manageMode && classSessions.length ? (
              <section className="dp-panel">
                <div className="dp-panel-head">
                  <h2>Session check-in</h2>
                  <p>Mark your attendance when you join a session.</p>
                </div>
                <ul className="dp-lesson-list">
                  {classSessions.map((session) => {
                    const myRow = sessionAttendance.find(
                      (row) => row.session_id === session.id && row.user_id === user.id
                    );

                    return (
                      <li key={session.id} className="dp-lesson-row">
                        <div className="dp-lesson-info">
                          <div>
                            <strong>{session.title}</strong>
                            <p>{formatDateTime(session.starts_at)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="dp-btn-secondary"
                          onClick={() => selfCheckIn(session)}
                          disabled={submitting || Boolean(myRow)}
                        >
                          {myRow ? `Checked in (${myRow.status})` : "Check in"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {portalPage === "attendance" && !canAccessContent ? renderSelectClassPrompt() : null}

        {portalPage === "attendance" && canAccessContent ? (
          <PortalAttendanceView
            progress={progress}
            sessions={classSessions}
            sessionAttendance={sessionAttendance}
            userId={user.id}
            manageContent={
              manageMode ? (
          <section className="dp-panel">
            <div className="dp-panel-head">
              <h2>Attendance tracking</h2>
              <p>Mark present, absent, or late for enrolled members.</p>
            </div>
            {classSessions.length ? (
              classSessions.map((session) => (
                <div key={session.id} className="attendance-session-block">
                  <h3>{session.title}</h3>
                  <p className="muted-text">{formatDateTime(session.starts_at)}</p>
                  <div className="card-list">
                    {classEnrollments
                      .filter((row) => row.status === "approved")
                      .map((row) => {
                        const record = sessionAttendance.find(
                          (item) =>
                            item.session_id === session.id && item.user_id === row.user_id
                        );

                        return (
                          <div key={row.user_id} className="idea-card">
                            <strong>{getMemberLabel(row.user_id)}</strong>
                            <div className="inline-actions">
                              {["present", "absent", "late"].map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  className={
                                    record?.status === status
                                      ? "primary-button"
                                      : "ghost-button"
                                  }
                                  onClick={() =>
                                    markAttendance(session.id, row.user_id, status)
                                  }
                                >
                                  {status}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))
            ) : (
              <p className="dp-empty-copy">Add sessions to track attendance.</p>
            )}
          </section>
              ) : null
            }
          />
        ) : null}

        {portalPage === "discussion" && !canAccessContent ? renderSelectClassPrompt() : null}

        {portalPage === "discussion" && canAccessContent ? (
          <div className="dp-page">
          <section className="dp-panel">
            <div className="dp-panel-head">
              <h2>Class discussion</h2>
              <p>Ask questions and encourage one another during the course.</p>
            </div>
            <form className="stack-form" onSubmit={postDiscussion}>
              <label className="field">
                <span>Your question or comment</span>
                <textarea
                  rows={3}
                  value={discussionDraft}
                  onChange={(event) => setDiscussionDraft(event.target.value)}
                  placeholder="Share a question or reflection…"
                  required
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="dp-btn-primary" disabled={submitting}>
                  Post
                </button>
              </div>
            </form>

            {classDiscussions.length ? (
              <div className="discussion-thread">
                {classDiscussions.map((post) => (
                  <article key={post.id} className="discussion-post dp-note-card">
                    <strong>{getMemberLabel(post.user_id)}</strong>
                    <p>{post.content}</p>
                    <span className="inline-help">{formatDateTime(post.created_at)}</span>
                    <div className="dp-reaction-row" role="group" aria-label="Reactions">
                      {getDiscussionReactionStats(post.id).map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          className={`dp-reaction-btn${item.selected ? " active" : ""}`}
                          onClick={() => toggleDiscussionReaction(post.id, item.type)}
                          disabled={submitting}
                          aria-label={`${item.label}${item.count ? `, ${item.count}` : ""}`}
                        >
                          <span className="dp-reaction-icon">{portalIcons[item.iconKey]}</span>
                          {item.count > 0 ? <span>{item.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="dp-empty-copy">Be the first to start the conversation.</p>
            )}
          </section>
          </div>
        ) : null}

        {portalPage === "notes" && !canAccessContent ? renderSelectClassPrompt() : null}

        {portalPage === "notes" && canAccessContent ? (
          <div className="dp-page">
          <section className="dp-panel">
            <div className="dp-panel-head">
              <h2>Personal notebook</h2>
              <p>Private reflections per lesson — saved when you tap Save.</p>
            </div>
            <div className="dp-notes-toolbar">
              <input
                type="search"
                value={notesSearch}
                onChange={(event) => setNotesSearch(event.target.value)}
                placeholder="Search notes by lesson title…"
                aria-label="Search notes"
              />
            </div>
            {classLessons.length ? (
              <div className="card-list">
                {classLessons
                  .filter((lesson) => {
                    if (!notesSearch.trim()) {
                      return true;
                    }

                    return lesson.title
                      .toLowerCase()
                      .includes(notesSearch.trim().toLowerCase());
                  })
                  .map((lesson) => {
                  const saved = memberNotes.find(
                    (row) => row.lesson_id === lesson.id && row.user_id === user.id
                  );

                  return (
                    <article key={lesson.id} className="dp-note-card">
                      <h3>{lesson.title}</h3>
                      <p className="inline-help">{lesson.module_label || "General"}</p>
                      <textarea
                        rows={4}
                        value={noteDrafts[lesson.id] ?? saved?.content ?? ""}
                        placeholder="Write your reflection…"
                        onChange={(event) => {
                          setSelectedLessonId(lesson.id);
                          setNoteDrafts((current) => ({
                            ...current,
                            [lesson.id]: event.target.value
                          }));
                        }}
                      />
                      <button
                        type="button"
                        className="dp-btn-secondary"
                        onClick={() => {
                          setSelectedLessonId(lesson.id);
                          saveMemberNote(
                            lesson.id,
                            noteDrafts[lesson.id] ?? saved?.content ?? ""
                          );
                        }}
                        disabled={submitting}
                      >
                        Save note
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="dp-empty-copy">Reflections are saved per lesson.</p>
            )}
          </section>
          </div>
        ) : null}
      </>
    );
  }

  return wrapPortal(
    <>
      {activePortalPage === "overview" ? (
        <PortalOverview
          classes={classes}
          lessons={lessons}
          lessonCompletions={lessonCompletions}
          assignmentSubmissions={assignmentSubmissions}
          sessions={sessions}
          sessionAttendance={sessionAttendance}
          userId={user.id}
          myApprovedClassIds={myApprovedClassIds}
          now={now}
          guidelines={<DiscipleshipGuidelines />}
          onOpenClass={(classId) => {
            onSelectClassId(classId);
            setPortalPage("overview");
          }}
          onNavigate={setPortalPage}
        />
      ) : null}

      {activePortalPage === "achievements" ? (
        <PortalAchievements
          lessonCompletions={lessonCompletions}
          assignmentSubmissions={assignmentSubmissions}
          sessionAttendance={sessionAttendance}
          userId={user.id}
          myApprovedClassIds={myApprovedClassIds}
          progressSummary={[
            { label: "Classes enrolled", value: String(myApprovedClassIds.size) },
            {
              label: "Lessons done",
              value: String(lessonCompletions.filter((row) => row.user_id === user.id).length)
            },
            {
              label: "Work approved",
              value: String(
                assignmentSubmissions.filter(
                  (row) => row.user_id === user.id && row.status === "approved"
                ).length
              )
            }
          ]}
        />
      ) : null}

      {renderPortalNavExtras({ page: activePortalPage })}

      {activePortalPage === "submissions" ? (
        <PortalSubmissions
          user={user}
          lessons={lessons}
          classes={classes}
          assignmentSubmissions={assignmentSubmissions}
          submissionHistory={submissionHistory}
          myApprovedClassIds={myApprovedClassIds}
          accessibleClassIds={accessibleClassIds}
          runAction={runAction}
          submitting={submitting}
          liveNow={now}
          getClassTitle={getClassTitle}
        />
      ) : null}

      {activePortalPage === "progress" ? (
        <PortalProgressView
          classes={classes}
          lessons={lessons}
          lessonCompletions={lessonCompletions}
          assignmentSubmissions={assignmentSubmissions}
          sessionAttendance={sessionAttendance}
          sessions={sessions}
          enrollments={enrollments}
          userId={user.id}
          myApprovedClassIds={myApprovedClassIds}
          now={now}
        />
      ) : null}

      {classRequiredPages.includes(activePortalPage) && !selectedClass
        ? renderSelectClassPrompt()
        : null}

      {isAdmin && activePortalPage === "classes" ? (
        <Panel
          title={showManagePanel ? "Create or edit class" : "Class management"}
          subtitle="Admins can create classes, assign leaders, and configure enrollment."
          action={
            !showManagePanel ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setShowManagePanel(true);
                  setClassForm(emptyClassForm);
                  setEditingClassId("");
                }}
              >
                New class
              </button>
            ) : null
          }
        >
          {showManagePanel ? (
            <form className="form-grid" onSubmit={handleClassSubmit}>
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={classForm.title}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, title: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={classForm.description}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Teacher / Leader</span>
                <select
                  value={classForm.leader_id}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, leader_id: event.target.value }))
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
                <span>Starts at</span>
                <input
                  type="datetime-local"
                  value={classForm.starts_at}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, starts_at: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Ends at (optional)</span>
                <input
                  type="datetime-local"
                  value={classForm.ends_at}
                  min={classForm.starts_at || undefined}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, ends_at: event.target.value }))
                  }
                />
              </label>
              <p className="inline-help full-width">
                If you set an end time, it must be later than the start time. Leave end empty for
                open-ended classes.
              </p>
              <label className="field">
                <span>Banner image URL (optional)</span>
                <input
                  type="url"
                  value={classForm.banner_url}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, banner_url: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Google Meet link</span>
                <input
                  type="url"
                  value={classForm.meet_url}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, meet_url: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={classForm.status}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="field">
                <span>Require approval before joining</span>
                <input
                  type="checkbox"
                  checked={classForm.requires_approval}
                  onChange={(event) =>
                    setClassForm((current) => ({
                      ...current,
                      requires_approval: event.target.checked
                    }))
                  }
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {editingClassId ? "Save class" : "Create class"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowManagePanel(false);
                    setClassForm(emptyClassForm);
                    setEditingClassId("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p className="inline-help">Use “New class” to launch a discipleship program for your group.</p>
          )}
        </Panel>
      ) : null}

      {activePortalPage === "classes" ? (
        <div className="dp-page">
      <div className="discipleship-tabs" role="tablist" aria-label="Class catalog">
        {[
          { id: "available", label: "Available" },
          { id: "my", label: "My classes" },
          { id: "ongoing", label: "Ongoing" },
          { id: "upcoming", label: "Upcoming" },
          { id: "completed", label: "Completed" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={catalogTab === tab.id}
            className={catalogTab === tab.id ? "discipleship-tab active" : "discipleship-tab"}
            onClick={() => setCatalogTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Panel
        title={
          catalogTab === "my"
            ? "My discipleship classes"
            : catalogTab === "ongoing"
              ? "Ongoing classes"
              : catalogTab === "upcoming"
                ? "Upcoming classes"
                : catalogTab === "completed"
                  ? "Completed classes"
                  : "Available classes"
        }
        subtitle="Browse programs, join a class, and track your spiritual growth."
      >
        {catalogClasses.length ? (
          <div className="discipleship-class-grid">{catalogClasses.map(renderClassCard)}</div>
        ) : (
          <EmptyState
            title="No classes in this view"
            description={
              isAdmin
                ? "Create a new discipleship class to get started."
                : "Check back when a new class is published."
            }
          />
        )}
      </Panel>
        </div>
      ) : null}
    </>
  );
}
