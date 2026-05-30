import { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  MATERIALS_BUCKET,
  SUBMISSION_BUCKET,
  SUBMISSION_ACCEPT,
  STATUS_LABELS,
  buildResourcePath,
  buildSubmissionPath,
  canReplaceSubmission,
  computeAssignmentProgress,
  formatDueDate,
  getDisplayStatus,
  getDueBadge,
  getLessonInstructions,
  getStatusAccentClass,
  getStatusPillClass,
  isPastDue,
  isWorkLesson,
  parseAttachedResources,
  validateSubmissionFile
} from "../lib/discipleshipAssignments";

const emptyAssignmentForm = {
  title: "",
  description: "",
  instructions: "",
  module_label: "",
  sort_order: "0",
  lesson_type: "assignment",
  due_at: "",
  max_score: ""
};

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
    <div className="progress-block progress-block-lg">
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

function StatTile({ label, value, hint, tone = "default" }) {
  return (
    <article className={`assignment-stat-tile tone-${tone}`}>
      <span className="assignment-stat-label">{label}</span>
      <strong className="assignment-stat-value">{value}</strong>
      {hint ? <p className="assignment-stat-hint">{hint}</p> : null}
    </article>
  );
}

function MemberAvatar({ name }) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <span className="assignment-member-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

function FileDropZone({ onFile, fileName, disabled, hint }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList) {
    const file = fileList?.[0];
    if (file) {
      onFile(file);
    }
  }

  return (
    <div
      className={`assignment-dropzone${dragOver ? " drag-over" : ""}${disabled ? " disabled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (!disabled) {
          handleFiles(event.dataTransfer.files);
        }
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!disabled) {
            inputRef.current?.click();
          }
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={SUBMISSION_ACCEPT}
        capture="environment"
        className="assignment-file-input"
        disabled={disabled}
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="assignment-dropzone-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="assignment-dropzone-title">
        {fileName ? "Replace file" : "Drag & drop or tap to upload"}
      </p>
      <p className="inline-help">{hint}</p>
      {fileName ? <p className="assignment-selected-file">{fileName}</p> : null}
    </div>
  );
}

export function DiscipleshipAssignments({
  user,
  profiles,
  selectedClass,
  lessons,
  submissions,
  submissionHistory,
  enrollments,
  runAction,
  submitting,
  manageMode,
  isApprovedEnrolled,
  liveNow
}) {
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [editingLessonId, setEditingLessonId] = useState("");
  const [resourceFiles, setResourceFiles] = useState([]);
  const [expandedLessonId, setExpandedLessonId] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFileName, setUploadFileName] = useState("");
  const [reviewDrafts, setReviewDrafts] = useState({});

  const now = liveNow instanceof Date ? liveNow : new Date(liveNow);

  const classWorkLessons = useMemo(
    () =>
      lessons
        .filter((lesson) => lesson.class_id === selectedClass?.id && isWorkLesson(lesson))
        .sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }

          return new Date(left.created_at) - new Date(right.created_at);
        }),
    [lessons, selectedClass?.id]
  );

  const classSubmissions = useMemo(
    () => submissions.filter((row) => row.class_id === selectedClass?.id),
    [submissions, selectedClass?.id]
  );

  const approvedEnrollees = useMemo(
    () =>
      enrollments.filter(
        (row) => row.class_id === selectedClass?.id && row.status === "approved"
      ),
    [enrollments, selectedClass?.id]
  );

  const myProgress = useMemo(
    () => computeAssignmentProgress(classWorkLessons, classSubmissions, user.id),
    [classWorkLessons, classSubmissions, user.id]
  );

  const moduleStats = useMemo(() => {
    const submittedCount = classSubmissions.filter((row) => row.file_path).length;
    const pendingReview = classSubmissions.filter((row) =>
      ["submitted", "under_review"].includes(row.status)
    ).length;
    const completedCount = classSubmissions.filter((row) =>
      ["completed", "reviewed"].includes(row.status)
    ).length;

    return {
      total: classWorkLessons.length,
      submittedCount,
      pendingReview,
      completedCount,
      enrolleeCount: approvedEnrollees.length
    };
  }, [classWorkLessons, classSubmissions, approvedEnrollees.length]);

  function getMemberLabel(memberId) {
    const member = profiles.find((item) => item.id === memberId);
    return member?.full_name || member?.email?.split("@")[0] || "Member";
  }

  function getSubmission(lessonId, memberId = user.id) {
    return classSubmissions.find(
      (row) => row.lesson_id === lessonId && row.user_id === memberId
    );
  }

  function getHistory(submissionId) {
    return submissionHistory
      .filter((row) => row.submission_id === submissionId)
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
  }

  async function openSignedFile(bucket, path) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);

    if (error) {
      throw error;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function openMaterial(path) {
    const { data } = supabase.storage.from(MATERIALS_BUCKET).getPublicUrl(path);
    window.open(data.publicUrl, "_blank", "noopener,noreferrer");
  }

  function resetAssignmentForm() {
    setAssignmentForm(emptyAssignmentForm);
    setEditingLessonId("");
    setResourceFiles([]);
  }

  function beginEditLesson(lesson) {
    setEditingLessonId(lesson.id);
    setAssignmentForm({
      title: lesson.title ?? "",
      description: lesson.description ?? "",
      instructions: getLessonInstructions(lesson),
      module_label: lesson.module_label ?? "",
      sort_order: String(lesson.sort_order ?? 0),
      lesson_type: lesson.lesson_type ?? "assignment",
      due_at: lesson.due_at ? toLocalDateTimeInput(lesson.due_at) : "",
      max_score: lesson.max_score != null ? String(lesson.max_score) : ""
    });
    setResourceFiles([]);
  }

  async function handleAssignmentSubmit(event) {
    event.preventDefault();

    if (!selectedClass?.id) {
      return;
    }

    await runAction(async () => {
      const existing = lessons.find((row) => row.id === editingLessonId);
      let attachedResources = editingLessonId
        ? parseAttachedResources(existing)
        : [];

      if (resourceFiles.length) {
        const uploaded = [];

        for (const file of resourceFiles) {
          const path = buildResourcePath(selectedClass.id, file.name);
          const { error: uploadError } = await supabase.storage
            .from(MATERIALS_BUCKET)
            .upload(path, file, { cacheControl: "3600", upsert: false });

          if (uploadError) {
            throw uploadError;
          }

          uploaded.push({ file_path: path, file_name: file.name });
        }

        attachedResources = [...attachedResources, ...uploaded];
      }

      const payload = {
        class_id: selectedClass.id,
        title: assignmentForm.title.trim(),
        description: assignmentForm.description.trim(),
        instructions: assignmentForm.instructions.trim(),
        assignment_prompt: assignmentForm.instructions.trim(),
        module_label: assignmentForm.module_label.trim(),
        sort_order: Number(assignmentForm.sort_order) || 0,
        lesson_type: assignmentForm.lesson_type,
        due_at: toIsoString(assignmentForm.due_at),
        max_score: assignmentForm.max_score ? Number(assignmentForm.max_score) : null,
        attached_resources: attachedResources,
        note_content: "",
        external_url: null,
        video_url: null,
        file_path: null,
        file_name: null,
        discussion_topic: ""
      };

      if (!payload.title) {
        throw new Error("Title is required.");
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

      resetAssignmentForm();
    }, editingLessonId ? "Assignment updated." : "Assignment published.");
  }

  async function deleteAssignment(lessonId) {
    if (!window.confirm("Delete this assignment and all submissions?")) {
      return;
    }

    await runAction(async () => {
      const { error } = await supabase.from("discipleship_lessons").delete().eq("id", lessonId);

      if (error) {
        throw error;
      }

      if (expandedLessonId === lessonId) {
        setExpandedLessonId("");
      }
    }, "Assignment deleted.");
  }

  async function submitWork(lesson) {
    const validationError = validateSubmissionFile(uploadFile);

    if (validationError) {
      throw new Error(validationError);
    }

    if (!canReplaceSubmission(lesson, getSubmission(lesson.id), now)) {
      throw new Error("The due date has passed. Contact your class leader if you need an extension.");
    }

    await runAction(async () => {
      const existing = getSubmission(lesson.id);
      const filePath = buildSubmissionPath(
        selectedClass.id,
        lesson.id,
        user.id,
        uploadFile.name
      );

      const { error: uploadError } = await supabase.storage
        .from(SUBMISSION_BUCKET)
        .upload(filePath, uploadFile, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        throw uploadError;
      }

      const payload = {
        lesson_id: lesson.id,
        class_id: selectedClass.id,
        user_id: user.id,
        status: "submitted",
        file_path: filePath,
        file_name: uploadFile.name,
        file_size: uploadFile.size,
        submitted_at: new Date().toISOString()
      };

      if (existing) {
        if (existing.file_path) {
          const { error: historyError } = await supabase
            .from("discipleship_submission_history")
            .insert([
              {
                submission_id: existing.id,
                lesson_id: lesson.id,
                user_id: user.id,
                status: existing.status,
                file_path: existing.file_path,
                file_name: existing.file_name,
                submitted_at: existing.submitted_at
              }
            ]);

          if (historyError) {
            throw historyError;
          }
        }

        const { error } = await supabase
          .from("discipleship_assignment_submissions")
          .update(payload)
          .eq("id", existing.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from("discipleship_assignment_submissions").insert([
          payload
        ]);

        if (error) {
          throw error;
        }
      }

      setUploadFile(null);
      setUploadFileName("");
    }, "Your work was submitted successfully.");
  }

  async function saveReview(submission, lesson) {
    const draft =
      reviewDrafts[submission.id] ?? {
        status: submission.status === "submitted" ? "under_review" : submission.status,
        score: submission.score ?? "",
        feedback: submission.feedback ?? "",
        encouragement: submission.encouragement ?? "",
        revision_notes: submission.revision_notes ?? ""
      };

    await runAction(async () => {
      const maxScore = lesson.max_score;
      const scoreValue =
        draft.score === "" || draft.score == null ? null : Number(draft.score);

      if (scoreValue != null && (Number.isNaN(scoreValue) || scoreValue < 0)) {
        throw new Error("Enter a valid score.");
      }

      if (maxScore != null && scoreValue != null && scoreValue > maxScore) {
        throw new Error(`Score cannot exceed ${maxScore}.`);
      }

      const { error } = await supabase
        .from("discipleship_assignment_submissions")
        .update({
          status: draft.status,
          score: scoreValue,
          feedback: (draft.feedback ?? "").trim(),
          encouragement: (draft.encouragement ?? "").trim(),
          revision_notes: (draft.revision_notes ?? "").trim(),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", submission.id);

      if (error) {
        throw error;
      }
    }, "Feedback saved.");
  }

  function renderResources(lesson) {
    const resources = parseAttachedResources(lesson);

    if (!resources.length) {
      return null;
    }

    return (
      <div className="assignment-resources">
        <h4 className="assignment-section-label">Supporting materials</h4>
        <div className="assignment-resource-chips">
          {resources.map((resource) => (
            <button
              key={resource.file_path}
              type="button"
              className="assignment-resource-chip"
              onClick={() => openMaterial(resource.file_path)}
            >
              <span aria-hidden="true">📎</span>
              {resource.file_name || "Download"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderStudentSubmit(lesson, submission) {
    const status = getDisplayStatus(submission);
    const canSubmit = isApprovedEnrolled && canReplaceSubmission(lesson, submission, now);

    return (
      <div className="assignment-panel-section assignment-submit-block">
        <h4 className="assignment-section-label">Your submission</h4>
        <div className="assignment-status-row">
          <span className={getStatusPillClass(status)}>{STATUS_LABELS[status]}</span>
          {submission?.submitted_at ? (
            <span className="inline-help">
              Last submitted {formatDueDate(submission.submitted_at)}
            </span>
          ) : null}
        </div>

        {submission?.file_name ? (
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => openSignedFile(SUBMISSION_BUCKET, submission.file_path)}
            >
              View current file
            </button>
          </div>
        ) : null}

        {status === "revision_requested" && submission?.revision_notes ? (
          <p className="assignment-revision-note">{submission.revision_notes}</p>
        ) : null}

        {(submission?.feedback || submission?.encouragement) && (
          <div className="assignment-feedback-received">
            {submission.feedback ? <p>{submission.feedback}</p> : null}
            {submission.encouragement ? (
              <p className="assignment-encouragement">{submission.encouragement}</p>
            ) : null}
            {submission.score != null ? (
              <p className="inline-help">
                Score: <strong>{submission.score}</strong>
                {lesson.max_score != null ? ` / ${lesson.max_score}` : ""}
              </p>
            ) : null}
          </div>
        )}

        {canSubmit ? (
          <>
            <FileDropZone
              fileName={uploadFileName}
              disabled={submitting}
              hint="PDF, Word, images, or ZIP • up to 25 MB • camera capture on mobile"
              onFile={(file) => {
                const error = validateSubmissionFile(file);
                if (error) {
                  window.alert(error);
                  return;
                }

                setUploadFile(file);
                setUploadFileName(file.name);
              }}
            />
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                disabled={submitting || !uploadFile}
                onClick={() => submitWork(lesson)}
              >
                {submission?.file_path ? "Replace submission" : "Submit assignment"}
              </button>
            </div>
          </>
        ) : (
          <p className="inline-help">
            {status === "completed"
              ? "This assignment is marked complete."
              : isPastDue(lesson.due_at, now)
                ? "The due date has passed."
                : "Enroll in this class to submit your work."}
          </p>
        )}

        {submission ? (
          <details className="assignment-history-details">
            <summary>Submission history</summary>
            <ul className="assignment-history-list">
              <li>
                Current • {formatDueDate(submission.submitted_at)} • {STATUS_LABELS[status]}
              </li>
              {getHistory(submission.id).map((entry) => (
                <li key={entry.id}>
                  {formatDueDate(entry.submitted_at)} • {STATUS_LABELS[entry.status] || entry.status}
                  {entry.file_name ? ` • ${entry.file_name}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    );
  }

  function renderLeaderRoster(lesson) {
    const lessonSubmissions = classSubmissions.filter((row) => row.lesson_id === lesson.id);

    return (
      <div className="assignment-panel-section assignment-roster">
        <div className="assignment-roster-header">
          <h4 className="assignment-section-label">Student submissions</h4>
          <span className="assignment-roster-count">
            {lessonSubmissions.length} of {approvedEnrollees.length} submitted
          </span>
        </div>
        {!approvedEnrollees.length ? (
          <p className="inline-help">No approved students yet.</p>
        ) : (
          <div className="assignment-roster-list">
            {approvedEnrollees.map((enrollment) => {
              const submission = lessonSubmissions.find(
                (row) => row.user_id === enrollment.user_id
              );
              const status = getDisplayStatus(submission);
              const draft =
                reviewDrafts[submission?.id] ?? {
                  status: submission?.status ?? "under_review",
                  score: submission?.score ?? "",
                  feedback: submission?.feedback ?? "",
                  encouragement: submission?.encouragement ?? "",
                  revision_notes: submission?.revision_notes ?? ""
                };

              const memberName = getMemberLabel(enrollment.user_id);

              return (
                <article key={enrollment.user_id} className="assignment-roster-card">
                  <div className="assignment-roster-head">
                    <div className="assignment-roster-member">
                      <MemberAvatar name={memberName} />
                      <strong>{memberName}</strong>
                    </div>
                    <span className={getStatusPillClass(status)}>
                      {STATUS_LABELS[status]}
                    </span>
                  </div>

                  {submission?.file_path ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        openSignedFile(SUBMISSION_BUCKET, submission.file_path)
                      }
                    >
                      Download {submission.file_name || "submission"}
                    </button>
                  ) : (
                    <p className="inline-help">No file submitted yet.</p>
                  )}

                  {submission ? (
                    <div className="assignment-review-form">
                      <label className="field">
                        <span>Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) =>
                            setReviewDrafts((current) => ({
                              ...current,
                              [submission.id]: {
                                ...draft,
                                status: event.target.value
                              }
                            }))
                          }
                        >
                          <option value="under_review">Under Review</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="completed">Completed</option>
                          <option value="revision_requested">Request revision</option>
                        </select>
                      </label>
                      {lesson.max_score != null ? (
                        <label className="field">
                          <span>Score (max {lesson.max_score})</span>
                          <input
                            type="number"
                            min="0"
                            max={lesson.max_score}
                            value={draft.score}
                            onChange={(event) =>
                              setReviewDrafts((current) => ({
                                ...current,
                                [submission.id]: {
                                  ...draft,
                                  score: event.target.value
                                }
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <label className="field">
                          <span>Score (optional)</span>
                          <input
                            type="number"
                            min="0"
                            value={draft.score}
                            onChange={(event) =>
                              setReviewDrafts((current) => ({
                                ...current,
                                [submission.id]: {
                                  ...draft,
                                  score: event.target.value
                                }
                              }))
                            }
                          />
                        </label>
                      )}
                      <label className="field">
                        <span>Written feedback</span>
                        <textarea
                          rows={3}
                          value={draft.feedback}
                          onChange={(event) =>
                            setReviewDrafts((current) => ({
                              ...current,
                              [submission.id]: {
                                ...draft,
                                feedback: event.target.value
                              }
                            }))
                          }
                          placeholder="Comments and suggestions for improvement…"
                        />
                      </label>
                      <label className="field">
                        <span>Encouragement</span>
                        <textarea
                          rows={2}
                          value={draft.encouragement}
                          onChange={(event) =>
                            setReviewDrafts((current) => ({
                              ...current,
                              [submission.id]: {
                                ...draft,
                                encouragement: event.target.value
                              }
                            }))
                          }
                          placeholder="Affirm their growth and effort…"
                        />
                      </label>
                      {draft.status === "revision_requested" ? (
                        <label className="field">
                          <span>Revision notes</span>
                          <textarea
                            rows={2}
                            value={draft.revision_notes}
                            onChange={(event) =>
                              setReviewDrafts((current) => ({
                                ...current,
                                [submission.id]: {
                                  ...draft,
                                  revision_notes: event.target.value
                                }
                              }))
                            }
                          />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        className="primary-button"
                        disabled={submitting}
                        onClick={() => saveReview(submission, lesson)}
                      >
                        Save feedback
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderAssignmentCard(lesson) {
    const submission = getSubmission(lesson.id);
    const status = getDisplayStatus(submission);
    const dueBadge = getDueBadge(lesson, now);
    const expanded = expandedLessonId === lesson.id;
    const pendingCount = manageMode
      ? classSubmissions.filter(
          (row) =>
            row.lesson_id === lesson.id &&
            ["submitted", "under_review"].includes(row.status)
        ).length
      : 0;

    return (
      <article
        key={lesson.id}
        className={`assignment-card ${getStatusAccentClass(status)}${expanded ? " expanded" : ""}`}
      >
        <div className="assignment-card-accent" aria-hidden="true" />
        <div className="assignment-card-inner">
          <div className="assignment-card-head">
            <div className="assignment-card-title-block">
              <div className="assignment-card-tags">
                <span
                  className={
                    lesson.lesson_type === "project" ? "pill warning" : "pill info"
                  }
                >
                  {lesson.lesson_type === "project" ? "Project" : "Assignment"}
                </span>
                {lesson.module_label ? (
                  <span className="assignment-module-tag">{lesson.module_label}</span>
                ) : null}
              </div>
              <h3>{lesson.title}</h3>
              {lesson.description ? <p className="muted-text">{lesson.description}</p> : null}
            </div>
            <div className="assignment-card-badges">
              <span className={dueBadge.className}>{dueBadge.label}</span>
              <span className={getStatusPillClass(status)}>{STATUS_LABELS[status]}</span>
              {manageMode && pendingCount ? (
                <span className="pill warning">{pendingCount} to review</span>
              ) : null}
            </div>
          </div>

          <div className="assignment-card-meta">
            <span>Due {formatDueDate(lesson.due_at)}</span>
            {lesson.max_score != null ? <span>Max score {lesson.max_score}</span> : null}
          </div>

          <div className="assignment-card-actions">
            <button
              type="button"
              className={expanded ? "ghost-button" : "primary-button"}
              onClick={() => setExpandedLessonId(expanded ? "" : lesson.id)}
            >
              {expanded ? "Close" : manageMode ? "Review submissions" : "Open & submit"}
            </button>
            {manageMode ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => beginEditLesson(lesson)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={() => deleteAssignment(lesson.id)}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>

          {expanded ? (
            <div className="assignment-card-body">
              <div className="assignment-instructions-box">
                <h4 className="assignment-section-label">Instructions</h4>
                <p>{getLessonInstructions(lesson) || "No detailed instructions provided."}</p>
              </div>
              {renderResources(lesson)}
              {manageMode ? renderLeaderRoster(lesson) : renderStudentSubmit(lesson, submission)}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  if (!selectedClass) {
    return null;
  }

  return (
    <div className="assignment-module">
      <section className="assignment-hero">
        <div className="assignment-hero-copy">
          <p className="assignment-hero-eyebrow">
            {manageMode ? "Leader workspace" : "Coursework hub"}
          </p>
          <h2 className="assignment-hero-title">
            {manageMode ? "Assignments & grading" : "Your assignments"}
          </h2>
          <p className="assignment-hero-lead">
            {manageMode
              ? "Publish clear expectations, review submissions, and give timely feedback."
              : "Submit on time, track feedback, and celebrate steady progress in your walk."}
          </p>
        </div>
        <div className="assignment-stat-grid">
          {manageMode ? (
            <>
              <StatTile label="Published" value={moduleStats.total} hint="Active items" />
              <StatTile
                label="Awaiting review"
                value={moduleStats.pendingReview}
                hint="Needs your attention"
                tone="warning"
              />
              <StatTile
                label="Submissions"
                value={moduleStats.submittedCount}
                hint={`Across ${moduleStats.enrolleeCount} students`}
                tone="info"
              />
              <StatTile
                label="Completed"
                value={moduleStats.completedCount}
                hint="Reviewed or approved"
                tone="success"
              />
            </>
          ) : (
            <>
              <StatTile
                label="Progress"
                value={`${myProgress.percent}%`}
                hint={`${myProgress.completed} of ${myProgress.total} done`}
                tone="success"
              />
              <StatTile
                label="Open items"
                value={Math.max(0, myProgress.total - myProgress.completed)}
                hint="Still in progress"
                tone="warning"
              />
              <StatTile label="Total coursework" value={myProgress.total} hint="Assignments + project" />
            </>
          )}
        </div>
        {!manageMode && isApprovedEnrolled ? (
          <ProgressBar
            value={myProgress.percent}
            label="Overall completion"
          />
        ) : null}
      </section>

      {manageMode ? (
        <Panel
          title={editingLessonId ? "Edit assignment" : "Create assignment or project"}
          subtitle="Set instructions, due dates, scoring, and upload supporting materials."
        >
          <form
            className="form-grid assignment-composer-form"
            onSubmit={handleAssignmentSubmit}
          >
            <div className="assignment-composer-section full-width">
              <h3 className="assignment-composer-heading">Basics</h3>
              <div className="assignment-composer-fields">
            <label className="field">
              <span>Type</span>
              <select
                value={assignmentForm.lesson_type}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    lesson_type: event.target.value
                  }))
                }
              >
                <option value="assignment">Assignment</option>
                <option value="project">Class project</option>
              </select>
            </label>
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={assignmentForm.title}
                onChange={(event) =>
                  setAssignmentForm((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Module label</span>
              <input
                type="text"
                value={assignmentForm.module_label}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    module_label: event.target.value
                  }))
                }
                placeholder="Week 3"
              />
            </label>
            <label className="field">
              <span>Short description</span>
              <input
                type="text"
                value={assignmentForm.description}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    description: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Due date</span>
              <input
                type="datetime-local"
                value={assignmentForm.due_at}
                onChange={(event) =>
                  setAssignmentForm((current) => ({ ...current, due_at: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Maximum score (optional)</span>
              <input
                type="number"
                min="1"
                value={assignmentForm.max_score}
                onChange={(event) =>
                  setAssignmentForm((current) => ({ ...current, max_score: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Sort order</span>
              <input
                type="number"
                value={assignmentForm.sort_order}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    sort_order: event.target.value
                  }))
                }
              />
            </label>
              </div>
            </div>

            <div className="assignment-composer-section full-width">
              <h3 className="assignment-composer-heading">Instructions</h3>
            <label className="field full-width">
              <span>Requirements for students</span>
              <textarea
                rows={5}
                value={assignmentForm.instructions}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    instructions: event.target.value
                  }))
                }
                placeholder="What should students submit? Include format, length, and expectations."
              />
            </label>
            </div>

            <div className="assignment-composer-section full-width">
              <h3 className="assignment-composer-heading">Resources</h3>
            <label className="field full-width assignment-file-field">
              <span>Supporting materials</span>
              <input
                type="file"
                multiple
                accept={SUBMISSION_ACCEPT}
                onChange={(event) =>
                  setResourceFiles(Array.from(event.target.files ?? []))
                }
              />
              {resourceFiles.length ? (
                <span className="inline-help">
                  {resourceFiles.length} file(s) ready to upload on publish
                </span>
              ) : (
                <span className="inline-help">PDF, Word, images, or ZIP</span>
              )}
            </label>
            </div>

            <div className="form-actions full-width assignment-composer-actions">
              <button type="submit" className="primary-button" disabled={submitting}>
                {editingLessonId ? "Save changes" : "Publish"}
              </button>
              {editingLessonId ? (
                <button type="button" className="ghost-button" onClick={resetAssignmentForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel
        className="assignment-list-panel"
        title="Coursework list"
        subtitle={
          manageMode
            ? `${classWorkLessons.length} item${classWorkLessons.length === 1 ? "" : "s"} in this class`
            : "Expand an item to read instructions and submit your work."
        }
      >
        {classWorkLessons.length ? (
          <div className="assignment-card-list">{classWorkLessons.map(renderAssignmentCard)}</div>
        ) : (
          <div className="assignment-empty-state">
            <div className="assignment-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12h6M9 16h6" strokeLinecap="round" />
              </svg>
            </div>
            <EmptyState
              title="No assignments yet"
              description={
                manageMode
                  ? "Create the first assignment or class project for this cohort."
                  : "Your teacher will publish assignments here."
              }
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
