import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { DiscipleshipGuidelines } from "./DiscipleshipGuidelines";

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

function Panel({ title, subtitle, children, action }) {
  return (
    <section className="panel">
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
  memberNotes,
  sessionAttendance,
  discussions,
  runAction,
  submitting,
  liveNow,
  onSelectClassId,
  selectedClassId
}) {
  const [catalogTab, setCatalogTab] = useState("available");
  const [classDetailTab, setClassDetailTab] = useState("overview");
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

  function renderWorkItemCard(lesson, kind) {
    const complete = myCompletedLessonIds.has(lesson.id);
    const classTitle = getClassTitle(lesson.class_id);

    return (
      <article key={lesson.id} className="discipleship-work-card">
        <div className="discipleship-work-card-head">
          <span className={kind === "project" ? "pill warning" : "pill info"}>
            {kind === "project" ? "Class project" : "Assignment"}
          </span>
          <span className={complete ? "pill success" : "pill"}>
            {complete ? "Submitted" : "Pending"}
          </span>
        </div>
        <h3>{lesson.title}</h3>
        <p className="muted-text">{classTitle}</p>
        {lesson.module_label ? <p className="inline-help">{lesson.module_label}</p> : null}
        <p className="task-details">
          {truncateText(
            lesson.assignment_prompt || lesson.description || lesson.note_content,
            180
          )}
        </p>
        <div className="inline-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              onSelectClassId(lesson.class_id);
              setClassDetailTab("lessons");
            }}
          >
            Open in class
          </button>
          {myApprovedClassIds.has(lesson.class_id) ? (
            <button
              type="button"
              className={complete ? "ghost-button" : "primary-button"}
              onClick={() => toggleLessonComplete(lesson.id)}
              disabled={submitting}
            >
              {complete ? "Mark pending" : "Mark complete"}
            </button>
          ) : null}
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

  async function handleClassSubmit(event) {
    event.preventDefault();

    const payload = {
      title: classForm.title.trim(),
      description: classForm.description.trim(),
      leader_id: classForm.leader_id || null,
      starts_at: toIsoString(classForm.starts_at),
      ends_at: toIsoString(classForm.ends_at),
      meet_url: classForm.meet_url.trim() || null,
      banner_url: classForm.banner_url.trim() || null,
      status: classForm.status,
      requires_approval: classForm.requires_approval
    };

    await runAction(async () => {
      if (!payload.title) {
        throw new Error("Class title is required.");
      }

      const classId = editingClassId || selectedClassId;

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
      if (!editingClassId && selectedClassId) {
        setEditingClassId(selectedClassId);
      }
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
    setClassDetailTab("overview");
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
              className="primary-button"
              onClick={() => {
                onSelectClassId(classItem.id);
                setClassDetailTab("overview");
              }}
            >
              {enrollment ? "Open class" : "View details"}
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

    return (
      <div className="section-stack">
        <button type="button" className="ghost-button" onClick={() => onSelectClassId("")}>
          ← Back to classes
        </button>

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

        <Panel
          title={selectedClass.title}
          subtitle={`Led by ${selectedClass.leader_id ? getMemberLabel(selectedClass.leader_id) : "TBD"} • ${formatDateTime(selectedClass.starts_at)}`}
        >
          {selectedClass.banner_url ? (
            <div
              className="discipleship-banner large"
              style={{ backgroundImage: `url(${selectedClass.banner_url})` }}
            />
          ) : null}
          <p>{selectedClass.description || "No description yet."}</p>

          {canAccessContent ? (
            <>
              <ProgressBar value={progress.lessonPercent} label="Lessons completed" />
              <ProgressBar value={progress.attendancePercent} label="Attendance" />
              <ProgressBar value={progress.overall} label="Overall progress" />
            </>
          ) : (
            <div className="inline-help">
              Enroll to access lessons, notes, and discussions.
              {selectedEnrollment?.status === "pending"
                ? " Your request is awaiting leader approval."
                : null}
            </div>
          )}

          {!canAccessContent && !selectedEnrollment ? (
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => enrollInClass(selectedClass)}
                disabled={submitting}
              >
                {selectedClass.requires_approval ? "Request to join" : "Join class"}
              </button>
            </div>
          ) : null}
        </Panel>

        <div className="discipleship-tabs" role="tablist" aria-label="Class sections">
          {["overview", "lessons", "sessions", "attendance", "discussion", "notes"].map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={classDetailTab === tab}
              className={classDetailTab === tab ? "discipleship-tab active" : "discipleship-tab"}
              onClick={() => setClassDetailTab(tab)}
              disabled={!canAccessContent && tab !== "overview"}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {classDetailTab === "overview" && manageMode ? (
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

        {classDetailTab === "lessons" && canAccessContent ? (
          <>
            {manageMode ? (
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
            ) : null}

            <Panel title="Lessons" subtitle="Track completion as you grow through each module.">
              {classLessons.length ? (
                <div className="card-list">
                  {classLessons.map((lesson) => {
                    const complete = myCompletedLessonIds.has(lesson.id);

                    return (
                      <article key={lesson.id} className="task-card">
                        <div className="task-header">
                          <div>
                            <h3>{lesson.title}</h3>
                            <p>{lesson.module_label || "General module"}</p>
                          </div>
                          <span className={complete ? "pill success" : "pill"}>
                            {complete ? "Completed" : lesson.lesson_type}
                          </span>
                        </div>
                        <p className="task-details">{truncateText(lesson.description, 160)}</p>
                        {lesson.lesson_type === "note" && lesson.note_content ? (
                          <p className="inline-help">{truncateText(lesson.note_content, 200)}</p>
                        ) : null}
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openLessonMaterial(lesson)}
                          >
                            Open material
                          </button>
                          <button
                            type="button"
                            className={complete ? "ghost-button" : "primary-button"}
                            onClick={() => toggleLessonComplete(lesson.id)}
                            disabled={submitting}
                          >
                            {complete ? "Mark incomplete" : "Mark complete"}
                          </button>
                          {manageMode ? (
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                setEditingLessonId(lesson.id);
                                setLessonForm({
                                  title: lesson.title,
                                  description: lesson.description,
                                  module_label: lesson.module_label,
                                  sort_order: String(lesson.sort_order),
                                  lesson_type: lesson.lesson_type,
                                  note_content: lesson.note_content,
                                  external_url: lesson.external_url ?? "",
                                  video_url: lesson.video_url ?? "",
                                  assignment_prompt: lesson.assignment_prompt,
                                  discussion_topic: lesson.discussion_topic
                                });
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No lessons yet" description="Leaders can add the first lesson above." />
              )}
            </Panel>
          </>
        ) : null}

        {classDetailTab === "sessions" && canAccessContent ? (
          <>
            {manageMode ? (
              <Panel title="Schedule session" subtitle="Add in-person or virtual class sessions.">
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
                        setSessionForm((current) => ({ ...current, meet_url: event.target.value }))
                      }
                    />
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="primary-button" disabled={submitting}>
                      {editingSessionId ? "Save session" : "Add session"}
                    </button>
                  </div>
                </form>
              </Panel>
            ) : null}

            <Panel title="Class sessions" subtitle="Join live when a session is in progress.">
              {classSessions.length ? (
                <div className="card-list">
                  {classSessions.map((session) => {
                    const live = isSessionLive(session, selectedClass, now);
                    const myRow = sessionAttendance.find(
                      (row) => row.session_id === session.id && row.user_id === user.id
                    );

                    return (
                      <article key={session.id} className="task-card">
                        <div className="task-header">
                          <div>
                            <h3>{session.title}</h3>
                            <p>{formatDateTime(session.starts_at)}</p>
                          </div>
                          <span className={live ? "pill success" : "pill warning"}>
                            {live ? "Live" : "Scheduled"}
                          </span>
                        </div>
                        <div className="inline-actions">
                          {live ? (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() =>
                                joinLiveClass(session.meet_url || selectedClass.meet_url)
                              }
                            >
                              Join class
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => selfCheckIn(session)}
                            disabled={submitting || Boolean(myRow)}
                          >
                            {myRow ? `Checked in (${myRow.status})` : "Check in"}
                          </button>
                          {manageMode ? (
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() => deleteSession(session.id)}
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
                <EmptyState title="No sessions scheduled" description="Sessions will appear here once added." />
              )}
            </Panel>
          </>
        ) : null}

        {classDetailTab === "attendance" && canAccessContent && manageMode ? (
          <Panel title="Attendance tracking" subtitle="Mark present, absent, or late for enrolled members.">
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
              <EmptyState title="No sessions" description="Add sessions to track attendance." />
            )}
          </Panel>
        ) : null}

        {classDetailTab === "discussion" && canAccessContent ? (
          <Panel title="Class discussion" subtitle="Ask questions and encourage interaction during the course.">
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
                <button type="submit" className="primary-button" disabled={submitting}>
                  Post
                </button>
              </div>
            </form>

            {classDiscussions.length ? (
              <div className="discussion-thread">
                {classDiscussions.map((post) => (
                  <article key={post.id} className="discussion-post">
                    <strong>{getMemberLabel(post.user_id)}</strong>
                    <p>{post.content}</p>
                    <span className="inline-help">{formatDateTime(post.created_at)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No discussion yet" description="Be the first to start the conversation." />
            )}
          </Panel>
        ) : null}

        {classDetailTab === "notes" && canAccessContent ? (
          <Panel title="Personal reflections" subtitle="Save private notes and reflections per lesson.">
            {classLessons.length ? (
              <div className="card-list">
                {classLessons.map((lesson) => {
                  const saved = memberNotes.find(
                    (row) => row.lesson_id === lesson.id && row.user_id === user.id
                  );

                  return (
                    <article key={lesson.id} className="task-card">
                      <h3>{lesson.title}</h3>
                      <textarea
                        rows={3}
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
                        className="secondary-button"
                        onClick={() => {
                          setSelectedLessonId(lesson.id);
                          saveMemberNote(
                            lesson.id,
                            noteDrafts[lesson.id] ?? saved?.content ?? ""
                          );
                        }}
                        disabled={submitting}
                      >
                        Save reflection
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No lessons" description="Reflections are saved per lesson." />
            )}
          </Panel>
        ) : null}
      </div>
    );
  }

  return (
    <div className="section-stack">
      <header className="discipleship-page-header">
        <p className="eyebrow">Soldout Ministry</p>
        <h1>Discipleship</h1>
        <p className="discipleship-page-lead">
          Structured spiritual growth through classes, weekly assignments, the class project,
          and accountable fellowship.
        </p>
      </header>

      <Panel
        title="Guidelines & expectations"
        subtitle="Essential standards for Discipleship 1 — please read carefully before each session."
      >
        <DiscipleshipGuidelines />
      </Panel>

      <div className="discipleship-work-grid">
        <Panel
          title="Assignments"
          subtitle="Weekly tasks that deepen your walk with God. Submit by your teacher’s deadline."
        >
          {assignmentLessons.length ? (
            <div className="discipleship-work-list">
              {assignmentLessons.map((lesson) => renderWorkItemCard(lesson, "assignment"))}
            </div>
          ) : (
            <EmptyState
              title="No assignments yet"
              description={
                myApprovedClassIds.size
                  ? "Your teacher will publish weekly assignments here."
                  : "Join a class to see assignments assigned to you."
              }
            />
          )}
        </Panel>

        <Panel
          title="Class project"
          subtitle="Mandatory for graduation from Discipleship 1. Complete with integrity and commitment."
        >
          {projectLessons.length ? (
            <div className="discipleship-work-list">
              {projectLessons.map((lesson) => renderWorkItemCard(lesson, "project"))}
            </div>
          ) : (
            <EmptyState
              title="Class project not published yet"
              description="The coordination team will share the official project brief when ready."
            />
          )}
        </Panel>
      </div>

      <Panel
        title="Discipleship overview"
        subtitle="Your classes, progress, and enrollment at a glance."
      >
        <div className="member-overview-grid">
          <div className="stat-card blue">
            <span>Available</span>
            <strong>
              {
                classes.filter(
                  (item) =>
                    item.status !== "draft" &&
                    getClassTimelineStatus(item, now) !== "completed"
                ).length
              }
            </strong>
            <p>Open for enrollment</p>
          </div>
          <div className="stat-card orange">
            <span>My classes</span>
            <strong>{myEnrolledClasses.length}</strong>
            <p>Enrolled programs</p>
          </div>
          <div className="stat-card">
            <span>Ongoing</span>
            <strong>
              {classes.filter((item) => getClassTimelineStatus(item, now) === "ongoing").length}
            </strong>
            <p>Currently in progress</p>
          </div>
        </div>
      </Panel>

      {isAdmin ? (
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
                <span>Ends at</span>
                <input
                  type="datetime-local"
                  value={classForm.ends_at}
                  onChange={(event) =>
                    setClassForm((current) => ({ ...current, ends_at: event.target.value }))
                  }
                />
              </label>
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
  );
}
