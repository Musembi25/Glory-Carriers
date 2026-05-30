import { useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  SUBMISSION_BUCKET,
  STATUS_LABELS,
  buildSubmissionPath,
  canReplaceSubmission,
  formatDueDate,
  getDisplayStatus,
  getStatusPillClass,
  getLessonInstructions,
  isWorkLesson,
  validateSubmissionFile
} from "../../lib/discipleshipAssignments";

export function PortalSubmissions({
  user,
  lessons,
  classes,
  assignmentSubmissions,
  submissionHistory,
  myApprovedClassIds,
  accessibleClassIds,
  runAction,
  submitting,
  liveNow,
  getClassTitle
}) {
  const [expandedId, setExpandedId] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadLessonId, setUploadLessonId] = useState("");
  const inputRef = useRef(null);

  const now = liveNow instanceof Date ? liveNow : new Date(liveNow);

  const workLessons = useMemo(
    () =>
      lessons
        .filter(
          (lesson) =>
            isWorkLesson(lesson) &&
            (accessibleClassIds.has(lesson.class_id) || myApprovedClassIds.has(lesson.class_id))
        )
        .sort((left, right) => {
          const dueA = left.due_at ? new Date(left.due_at) : null;
          const dueB = right.due_at ? new Date(right.due_at) : null;
          if (dueA && dueB) {
            return dueA - dueB;
          }

          return left.sort_order - right.sort_order;
        }),
    [lessons, accessibleClassIds, myApprovedClassIds]
  );

  const mySubmissions = assignmentSubmissions.filter((row) => row.user_id === user.id);

  function getSubmission(lessonId) {
    return mySubmissions.find((row) => row.lesson_id === lessonId);
  }

  async function openFile(path) {
    const { data, error } = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(path, 3600);
    if (error) {
      throw error;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function submitForLesson(lesson) {
    const file = uploadFile;
    const validationError = validateSubmissionFile(file);

    if (validationError) {
      throw new Error(validationError);
    }

    const submission = getSubmission(lesson.id);
    if (!canReplaceSubmission(lesson, submission, now)) {
      throw new Error("The due date has passed for this assignment.");
    }

    await runAction(async () => {
      const filePath = buildSubmissionPath(lesson.class_id, lesson.id, user.id, file.name);
      const { error: uploadError } = await supabase.storage
        .from(SUBMISSION_BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        throw uploadError;
      }

      const payload = {
        lesson_id: lesson.id,
        class_id: lesson.class_id,
        user_id: user.id,
        status: "submitted",
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        submitted_at: new Date().toISOString()
      };

      if (submission) {
        if (submission.file_path) {
          await supabase.from("discipleship_submission_history").insert([
            {
              submission_id: submission.id,
              lesson_id: lesson.id,
              user_id: user.id,
              status: submission.status,
              file_path: submission.file_path,
              file_name: submission.file_name,
              submitted_at: submission.submitted_at
            }
          ]);
        }

        const { error } = await supabase
          .from("discipleship_assignment_submissions")
          .update(payload)
          .eq("id", submission.id);

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
      setUploadLessonId("");
    }, "Submission uploaded successfully.");
  }

  return (
    <div className="dp-page">
      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Submission center</h2>
          <p>
            Upload coursework for any class you are enrolled in. Admins who are also learners can
            submit here.
          </p>
        </div>

        {!workLessons.length ? (
          <p className="dp-empty-copy">No assignments available to submit yet.</p>
        ) : (
          <div className="dp-submission-list">
            {workLessons.map((lesson) => {
              const submission = getSubmission(lesson.id);
              const status = getDisplayStatus(submission);
              const expanded = expandedId === lesson.id;
              const canSubmit = myApprovedClassIds.has(lesson.class_id);
              const history = submission
                ? submissionHistory.filter((row) => row.submission_id === submission.id)
                : [];

              return (
                <article key={lesson.id} className={`dp-submission-card status-${status}`}>
                  <div className="dp-submission-card-head">
                    <div>
                      <span className="dp-submission-class">{getClassTitle(lesson.class_id)}</span>
                      <h3>{lesson.title}</h3>
                      <p>Due {formatDueDate(lesson.due_at)}</p>
                    </div>
                    <span className={getStatusPillClass(status)}>{STATUS_LABELS[status]}</span>
                  </div>

                  {submission?.file_name ? (
                    <div className="dp-submission-file-row">
                      <span>📄 {submission.file_name}</span>
                      <button
                        type="button"
                        className="dp-btn-secondary"
                        onClick={() => openFile(submission.file_path)}
                      >
                        Download
                      </button>
                    </div>
                  ) : null}

                  {submission?.feedback || submission?.encouragement ? (
                    <div className="dp-feedback-box">
                      {submission.feedback ? <p>{submission.feedback}</p> : null}
                      {submission.encouragement ? (
                        <p className="dp-feedback-encourage">{submission.encouragement}</p>
                      ) : null}
                      {submission.score != null ? (
                        <p className="dp-feedback-score">Score: {submission.score}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {canSubmit ? (
                    <>
                      <button
                        type="button"
                        className="dp-btn-secondary"
                        onClick={() => setExpandedId(expanded ? "" : lesson.id)}
                      >
                        {expanded ? "Close upload" : "Upload / replace"}
                      </button>

                      {expanded ? (
                        <div
                          className="dp-dropzone"
                          onClick={() => inputRef.current?.click()}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const file = event.dataTransfer.files?.[0];
                            if (file) {
                              setUploadFile(file);
                              setUploadLessonId(lesson.id);
                            }
                          }}
                        >
                          <input
                            ref={inputRef}
                            type="file"
                            className="dp-file-input"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.zip"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                setUploadFile(file);
                                setUploadLessonId(lesson.id);
                              }
                            }}
                          />
                          <strong>
                            {uploadLessonId === lesson.id && uploadFile
                              ? uploadFile.name
                              : "Drag & drop or click to upload"}
                          </strong>
                          <p>PDF, Word, images, or ZIP — up to 25 MB</p>
                          <button
                            type="button"
                            className="dp-btn-primary"
                            disabled={
                              submitting || uploadLessonId !== lesson.id || !uploadFile
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              void submitForLesson(lesson);
                            }}
                          >
                            Submit work
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="dp-empty-copy">Enroll in this class to submit work.</p>
                  )}

                  {history.length ? (
                    <details className="dp-history">
                      <summary>Submission history</summary>
                      <ul>
                        {history.map((entry) => (
                          <li key={entry.id}>
                            {formatDueDate(entry.submitted_at)} — {STATUS_LABELS[entry.status]}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
