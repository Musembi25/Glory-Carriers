import { useMemo, useState } from "react";
import { portalIcons } from "./PortalIcons";

function estimateReadingMinutes(lesson) {
  const text = [
    lesson.title,
    lesson.description,
    lesson.note_content,
    lesson.assignment_prompt
  ]
    .filter(Boolean)
    .join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;

  return Math.max(3, Math.round(words / 200) || 5);
}

function hasResources(lesson) {
  return Boolean(
    lesson.external_url ||
      lesson.video_url ||
      lesson.pdf_path ||
      lesson.note_content ||
      lesson.lesson_type === "pdf"
  );
}

export function PortalLessonsModules({
  classLessons,
  myCompletedLessonIds,
  onOpenMaterial,
  onToggleComplete,
  submitting,
  manageForm
}) {
  const modules = useMemo(() => {
    const map = new Map();

    classLessons.forEach((lesson) => {
      const key = lesson.module_label?.trim() || "General";
      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(lesson);
    });

    return [...map.entries()];
  }, [classLessons]);

  const [openModules, setOpenModules] = useState(() => new Set(modules.map(([name]) => name)));

  function toggleModule(name) {
    setOpenModules((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  }

  return (
    <div className="dp-page">
      {manageForm}

      <section className="dp-panel">
        <div className="dp-panel-head">
          <h2>Learning modules</h2>
          <p>Progress through each module at your own pace.</p>
        </div>

        {!modules.length ? (
          <p className="dp-empty-copy">No lessons published for this class yet.</p>
        ) : (
          <div className="dp-module-list">
            {modules.map(([moduleName, moduleLessons], index) => {
              const open = openModules.has(moduleName);
              const done = moduleLessons.filter((lesson) =>
                myCompletedLessonIds.has(lesson.id)
              ).length;

              return (
                <article key={moduleName} className="dp-module">
                  <button
                    type="button"
                    className="dp-module-header"
                    onClick={() => toggleModule(moduleName)}
                    aria-expanded={open}
                  >
                    <div>
                      <span className="dp-module-index">Module {index + 1}</span>
                      <strong>{moduleName}</strong>
                    </div>
                    <span className="dp-module-progress">
                      {done}/{moduleLessons.length} complete
                    </span>
                  </button>

                  {open ? (
                    <ul className="dp-lesson-list">
                      {moduleLessons.map((lesson) => {
                        const complete = myCompletedLessonIds.has(lesson.id);

                        return (
                          <li key={lesson.id} className="dp-lesson-row">
                            <div className="dp-lesson-info">
                              <span
                                className={`dp-lesson-status${complete ? " done" : ""}`}
                                aria-hidden="true"
                              />
                              <div>
                                <strong>{lesson.title}</strong>
                                <p className="dp-lesson-meta">
                                  <span className="dp-lesson-meta-item">
                                    {portalIcons.clock}
                                    {estimateReadingMinutes(lesson)} min read
                                  </span>
                                  <span>
                                    {complete ? "Completed" : "In progress"}
                                  </span>
                                  {hasResources(lesson) ? (
                                    <span className="dp-lesson-meta-item">
                                      {portalIcons.file}
                                      Resources
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                            <div className="dp-lesson-actions">
                              <button
                                type="button"
                                className="dp-btn-secondary"
                                onClick={() => onOpenMaterial(lesson)}
                              >
                                Resources
                              </button>
                              <button
                                type="button"
                                className={complete ? "dp-btn-ghost" : "dp-btn-primary"}
                                onClick={() => onToggleComplete(lesson.id)}
                                disabled={submitting}
                              >
                                {complete ? "Undo" : "Complete"}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
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
