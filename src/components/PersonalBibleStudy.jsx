import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { BIBLE_BOOKS, BIBLE_BOOK_CHAPTERS } from "../lib/bibleBooks.js";
import { BIBLE_STREAK_MILESTONES, DEFAULT_BIBLE_TIMEZONE, getReadingDateInTimezone, summarizePersonalReadings } from "../lib/personalBibleStudy.js";
import { BibleStreakCard } from "./BibleStreakExperience.jsx";
import { FullBibleReader } from "./FullBibleReader.jsx";

const emptyPlan = { book: "", chapter: "", reading_date: getReadingDateInTimezone() };
const emptyReminderPreferences = { enabled: false, reminder_time: "19:00", delivery_channel: "in_app", quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "07:00" };
const NOTE_TYPES = [
  ["reflection", "Personal reflection"], ["takeaway", "Personal takeaway"], ["observation", "Observation"], ["lesson", "Lesson learned"],
  ["important_verse", "Important verse"], ["question", "Question"], ["prayer", "Prayer point"], ["application", "Personal application"]
];

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function StatusLabel({ status }) {
  const label = status === "completed" ? "Completed" : status === "in_progress" ? "In progress" : "Planned";
  return <span className={`personal-bible-status personal-bible-status--${status}`}>{label}</span>;
}

export function PersonalBibleStudy({ user, onReadingsChange }) {
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerNotice, setReaderNotice] = useState("");
  const [completionSuccess, setCompletionSuccess] = useState(null);
  const [readings, setReadings] = useState([]);
  const [notes, setNotes] = useState([]);
  const [streakSummary, setStreakSummary] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [freezeHistory, setFreezeHistory] = useState([]);
  const [reminderPreferences, setReminderPreferences] = useState(emptyReminderPreferences);
  const [streakAvailable, setStreakAvailable] = useState(false);
  const [streakError, setStreakError] = useState("");
  const [liveState, setLiveState] = useState("connecting");
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderNotice, setReminderNotice] = useState("");
  const [celebration, setCelebration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState(emptyPlan);
  const [editingReadingId, setEditingReadingId] = useState("");
  const [readerSelection, setReaderSelection] = useState({ book: "Genesis", chapter: 1, key: 0 });
  const [selectedReadingId, setSelectedReadingId] = useState("");
  const [noteDraft, setNoteDraft] = useState({ note_type: "reflection", verse_reference: "", content: "" });
  const [editingNoteId, setEditingNoteId] = useState("");
  const [saving, setSaving] = useState(false);
  const completionInFlightRef = useRef(false);
  const timezone = streakSummary?.timezone || DEFAULT_BIBLE_TIMEZONE;
  const today = getReadingDateInTimezone(new Date(), timezone);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (!supabase || !user?.id) return;
    if (initial) setLoading(true);
    const [readingResult, noteResult, summaryResult, achievementResult, freezeResult, reminderResult] = await Promise.all([
      supabase.from("personal_bible_study_readings").select("*").eq("user_id", user.id).order("reading_date", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("personal_bible_study_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.rpc("bible_streak_my_summary"),
      supabase.from("bible_streak_achievements").select("milestone_days,earned_on").eq("user_id", user.id).order("milestone_days"),
      supabase.from("bible_streak_freeze_usage").select("local_date,source,used_at").eq("user_id", user.id).order("local_date", { ascending: false }),
      supabase.from("bible_streak_reminder_preferences").select("enabled,reminder_time,delivery_channel,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,last_sent_on").eq("user_id", user.id).maybeSingle()
    ]);
    const error = readingResult.error || noteResult.error;
    if (error) {
      setLoadError(/does not exist|could not find the table/i.test(error.message || "")
        ? "Personal Bible Study needs its database migration. Apply supabase/bible-study-personal-migration.sql."
        : error.message || "Personal Bible Study could not be loaded.");
      if (initial) setLoading(false);
      return;
    }
    const nextReadings = readingResult.data || [];
    setReadings(nextReadings);
    setNotes(noteResult.data || []);
    const streakFailure = summaryResult.error || achievementResult.error || freezeResult.error || reminderResult.error;
    setStreakAvailable(!streakFailure && Boolean(summaryResult.data));
    setStreakError(streakFailure
      ? /does not exist|could not find the function|could not find the table/i.test(streakFailure.message || "")
        ? "Bible Streak needs supabase/bible-streak-notification-type-migration.sql followed by supabase/bible-streak-system-migration.sql."
        : streakFailure.message || "Bible Streak could not be loaded."
      : "");
    if (!streakFailure) {
      setStreakSummary(summaryResult.data);
      setAchievements(achievementResult.data || []);
      setFreezeHistory(freezeResult.data || []);
      setReminderPreferences({ ...emptyReminderPreferences, ...(reminderResult.data || {}) });
    }
    onReadingsChange?.(nextReadings);
    setLoadError("");
    if (initial) setLoading(false);
    setSelectedReadingId((currentId) => currentId && nextReadings.some((row) => row.id === currentId)
      ? currentId
      : nextReadings.find((row) => row.status !== "completed")?.id || "");
    return { readings: nextReadings, summary: summaryResult.data, achievements: achievementResult.data || [] };
  }, [onReadingsChange, user?.id]);

  useEffect(() => { void load({ initial: true }); }, [load]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    const channel = supabase.channel(`personal-bible-study:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_bible_study_readings", filter: `user_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_bible_study_notes", filter: `user_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bible_streak_achievements", filter: `user_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bible_streak_freeze_usage", filter: `user_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bible_streak_settings" }, () => void load());
    channel.subscribe((status) => {
      setLiveState(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "error" : "connecting");
      if (status === "SUBSCRIBED") void load();
    });
    return () => { void supabase.removeChannel(channel); };
  }, [load, user?.id]);

  const orderedReadings = useMemo(() => [...readings].sort((left, right) =>
    left.reading_date.localeCompare(right.reading_date) || left.book.localeCompare(right.book) || left.chapter - right.chapter
  ), [readings]);
  const stats = useMemo(() => summarizePersonalReadings(readings), [readings]);
  const selectedReading = readings.find((row) => row.id === selectedReadingId) || null;
  const hasReadingProgress = readings.some((row) => row.status === "in_progress" || row.status === "completed");
  const readingActionLabel = hasReadingProgress ? "Continue Reading" : "Start Reading";
  const readerCompletedToday = readings.some((row) => row.book === readerSelection.book && row.chapter === readerSelection.chapter && row.reading_date === today && row.status === "completed");
  const readerInProgress = readings.some((row) => row.book === readerSelection.book && row.chapter === readerSelection.chapter && row.status === "in_progress");
  const selectedNotes = notes.filter((note) => note.book === readerSelection.book && note.chapter === readerSelection.chapter);
  useEffect(() => {
    if (readerSelection.key !== 0 || !readings.length) return;
    const firstReading = stats.nextReading || readings.at(-1);
    setReaderSelection((current) => current.key === 0
      ? { ...current, book: firstReading.book, chapter: firstReading.chapter, key: current.key + 1 }
      : current);
    setSelectedReadingId(firstReading.id);
  }, [readerSelection.key, readings, stats.nextReading]);
  const recentActivity = useMemo(() => [
    ...readings.filter((row) => row.completed_at).map((row) => ({ id: `reading-${row.id}`, created_at: row.completed_at, label: `Completed ${row.book} ${row.chapter}` })),
    ...notes.map((note) => ({ id: `note-${note.id}`, created_at: note.created_at, label: `${NOTE_TYPES.find(([value]) => value === note.note_type)?.[1] || "Note"} · ${note.book} ${note.chapter}` }))
  ].sort((left, right) => new Date(right.created_at) - new Date(left.created_at)).slice(0, 5), [notes, readings]);
  const lastReadingActivity = useMemo(() => readings
    .filter((row) => row.status === "completed" || row.status === "in_progress")
    .map((row) => ({ ...row, activityAt: row.completed_at || row.updated_at || row.created_at || row.reading_date }))
    .sort((left, right) => new Date(right.activityAt) - new Date(left.activityAt))[0] || null, [readings]);
  useEffect(() => {
    setPlan((current) => current.book ? current : { ...current, reading_date: today });
  }, [today]);

  function selectPlanReading(reading) {
    setReaderSelection((current) => ({ book: reading.book, chapter: reading.chapter, key: current.key + 1 }));
    setSelectedReadingId(reading.id);
    setActionError("");
    setNotice("");
  }

  function changePassage({ book, chapter }) {
    setReaderSelection((current) => current.book === book && current.chapter === chapter
      ? current
      : { ...current, book, chapter });
    const matching = readings.find((row) => row.book === book && row.chapter === chapter && row.reading_date === today)
      || readings.find((row) => row.book === book && row.chapter === chapter && row.status !== "completed")
      || readings.find((row) => row.book === book && row.chapter === chapter);
    setSelectedReadingId(matching?.id || "");
  }

  function openBibleReader() {
    setActionError("");
    setReaderNotice("");
    setReaderOpen(true);
  }

  function dismissChapterCompletion() {
    setCompletionSuccess(null);
    setCelebration(null);
  }

  async function addReading(event) {
    event.preventDefault();
    const chapter = Number(plan.chapter);
    if (!BIBLE_BOOK_CHAPTERS[plan.book] || !Number.isInteger(chapter) || chapter < 1 || chapter > BIBLE_BOOK_CHAPTERS[plan.book] || !plan.reading_date) {
      setActionError("Choose a valid Bible book, chapter and reading date.");
      return;
    }
    setSaving(true); setActionError(""); setNotice(""); setReaderNotice("");
    const query = editingReadingId
      ? supabase.from("personal_bible_study_readings").update({ book: plan.book, chapter, reading_date: plan.reading_date }).eq("id", editingReadingId).eq("user_id", user.id).neq("status", "completed")
      : supabase.from("personal_bible_study_readings").insert({ user_id: user.id, book: plan.book, chapter, reading_date: plan.reading_date, status: "planned" });
    const { data, error } = await query.select().maybeSingle();
    if (error) {
      setActionError(error.code === "23505" ? "That chapter is already in your plan for this date." : error.message || "Your reading could not be added.");
    } else if (!data) {
      setActionError("This chapter was not changed. Completed readings stay in your history.");
    } else {
      setPlan({ ...emptyPlan, reading_date: getReadingDateInTimezone(new Date(), timezone) });
      setEditingReadingId("");
      selectPlanReading(data);
      await load();
      setNotice(editingReadingId ? `${data.book} ${data.chapter} was updated in your personal plan.` : `${data.book} ${data.chapter} was added to your personal plan.`);
    }
    setSaving(false);
  }

  function beginEditReading(reading) {
    if (reading.status === "completed") return;
    setEditingReadingId(reading.id);
    setPlan({ book: reading.book, chapter: String(reading.chapter), reading_date: reading.reading_date });
    setReaderSelection((current) => ({ book: reading.book, chapter: reading.chapter, key: current.key + 1 }));
    setSelectedReadingId(reading.id);
    setActionError("");
    setNotice("");
  }

  async function deletePlannedReading(reading) {
    if (reading.status === "completed" || saving) return;
    if (!window.confirm(`Remove ${reading.book} ${reading.chapter} from your personal plan?`)) return;
    setSaving(true); setActionError(""); setNotice(""); setReaderNotice("");
    const { data, error } = await supabase.from("personal_bible_study_readings")
      .delete().eq("id", reading.id).eq("user_id", user.id).neq("status", "completed").select("id").maybeSingle();
    if (error) setActionError(error.message || "This chapter could not be removed from your plan.");
    else if (!data) setActionError("This chapter was not removed. Completed readings stay in your history.");
    else {
      if (editingReadingId === reading.id) {
        setEditingReadingId("");
        setPlan({ ...emptyPlan, reading_date: getReadingDateInTimezone(new Date(), timezone) });
      }
      if (selectedReadingId === reading.id) setSelectedReadingId("");
      await load();
      setNotice(`${reading.book} ${reading.chapter} was removed from your plan.`);
    }
    setSaving(false);
  }

  function cancelReadingEdit() {
    setEditingReadingId("");
    setPlan({ ...emptyPlan, reading_date: getReadingDateInTimezone(new Date(), timezone) });
    setActionError("");
  }

  async function setReadingStatus(status) {
    if (saving || (status === "completed" && completionInFlightRef.current)) return;
    const book = readerSelection.book;
    const chapter = readerSelection.chapter;
    const existingToday = readings.find((row) => row.book === book && row.chapter === chapter && row.reading_date === today) || null;
    const existing = existingToday
      || (selectedReading && selectedReading.book === book && selectedReading.chapter === chapter && selectedReading.status !== "completed" ? selectedReading : null)
      || readings.find((row) => row.book === book && row.chapter === chapter && row.status !== "completed")
      || (selectedReading && selectedReading.book === book && selectedReading.chapter === chapter ? selectedReading : null)
      || null;
    if (status === "completed" && existingToday?.status === "completed") return;
    if (status === "completed") completionInFlightRef.current = true;
    setSaving(true); setActionError(""); setNotice(""); setReaderNotice("");
    try {
      if (status === "completed") {
        if (!streakAvailable) {
          setActionError(streakError || "Bible Streak is not ready yet. Your reading was not marked complete.");
          return;
        }
        const { data, error } = await supabase.rpc("complete_personal_bible_reading", {
          target_reading_id: existing?.id || null,
          target_book: book,
          target_chapter: chapter
        });
        if (error) {
          setActionError(error.message || "Your reading progress could not be saved.");
          return;
        }
        const completedReading = data?.reading;
        if (completedReading?.id) setSelectedReadingId(completedReading.id);
        if (data?.summary) setStreakSummary(data.summary);
        const refreshed = await load();
        const milestoneDays = Math.max(0, ...(data?.newly_earned_milestones || []).map(Number));
        const milestone = BIBLE_STREAK_MILESTONES.find((item) => item.days === milestoneDays) || null;
        const streakValue = Number(data?.summary?.current_streak ?? refreshed?.summary?.current_streak);
        const message = `${book} ${chapter} completed and saved to your personal reading history.`;
        setNotice(message);
        setReaderNotice(message);
        setCompletionSuccess({
          book,
          chapter,
          streak: Number.isFinite(streakValue) ? streakValue : null,
          milestone: milestone?.title || null
        });
        if (data?.completed_now) setCelebration({ milestone });
      } else {
        const payload = { status: "in_progress", completed_at: null, updated_at: new Date().toISOString() };
        const editableExisting = existing?.status !== "completed" && existing?.reading_date === today ? existing : null;
        const result = editableExisting
          ? await supabase.from("personal_bible_study_readings").update(payload).eq("id", editableExisting.id).eq("user_id", user.id).select().single()
          : await supabase.from("personal_bible_study_readings").upsert({ user_id: user.id, book, chapter, reading_date: today, ...payload }, { onConflict: "user_id,book,chapter,reading_date" }).select().single();
        if (result.error) {
          setActionError(result.error.message || "Your reading progress could not be saved.");
        } else {
          setSelectedReadingId(result.data.id);
          await load();
          const message = `${book} ${chapter} added to your current reading.`;
          setNotice(message);
          setReaderNotice(message);
        }
      }
    } catch (saveError) {
      setActionError(saveError instanceof Error && saveError.message
        ? saveError.message
        : "Your reading progress could not be saved.");
    } finally {
      setSaving(false);
      if (status === "completed") completionInFlightRef.current = false;
    }
  }

  async function useFreeze(date) {
    if (!date || freezeBusy) return;
    const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    if (!window.confirm(`Use one Streak Freeze to protect ${dateLabel}? This freeze cannot be used again.`)) return;
    setFreezeBusy(true); setActionError(""); setNotice("");
    const { data, error } = await supabase.rpc("use_bible_streak_freeze", { target_date: date });
    if (error) setActionError(error.message || "Your Streak Freeze could not be used.");
    else {
      setStreakSummary(data);
      await load();
      setNotice("Your Streak Freeze protected the missed day. Your reading history has not changed.");
    }
    setFreezeBusy(false);
  }

  async function saveReminderPreferences(event) {
    event.preventDefault();
    setReminderSaving(true); setActionError(""); setReminderNotice("");
    const payload = {
      user_id: user.id,
      enabled: reminderPreferences.enabled,
      reminder_time: reminderPreferences.reminder_time,
      delivery_channel: reminderPreferences.delivery_channel,
      quiet_hours_enabled: reminderPreferences.quiet_hours_enabled,
      quiet_hours_start: reminderPreferences.quiet_hours_start,
      quiet_hours_end: reminderPreferences.quiet_hours_end
    };
    const { data, error } = await supabase.from("bible_streak_reminder_preferences").upsert(payload).select().single();
    if (error) setActionError(error.message || "Your Bible reminder preferences could not be saved.");
    else {
      setReminderPreferences({ ...emptyReminderPreferences, ...data });
      setReminderNotice("Your daily Bible reminder preferences were saved.");
    }
    setReminderSaving(false);
  }

  async function saveNote(event) {
    event.preventDefault();
    const content = noteDraft.content.trim();
    if (!content) return;
    setSaving(true); setActionError(""); setNotice("");
    const payload = {
      user_id: user.id,
      book: readerSelection.book,
      chapter: readerSelection.chapter,
      note_type: noteDraft.note_type,
      verse_reference: noteDraft.verse_reference.trim() || null,
      content,
      updated_at: new Date().toISOString()
    };
    const result = editingNoteId
      ? await supabase.from("personal_bible_study_notes").update(payload).eq("id", editingNoteId).eq("user_id", user.id).select().single()
      : await supabase.from("personal_bible_study_notes").insert(payload).select().single();
    if (result.error) {
      setActionError(result.error.message || "Your private note could not be saved.");
    } else {
      setNoteDraft({ note_type: "reflection", verse_reference: "", content: "" });
      setEditingNoteId("");
      await load();
      setNotice("Your private note was saved.");
    }
    setSaving(false);
  }

  function beginEditNote(note) {
    setReaderSelection((current) => ({ book: note.book, chapter: note.chapter, key: current.key + 1 }));
    setEditingNoteId(note.id);
    setNoteDraft({ note_type: note.note_type, verse_reference: note.verse_reference || "", content: note.content });
  }

  async function deleteNote(note) {
    if (!window.confirm("Delete this private note? This cannot be undone.")) return;
    setSaving(true); setActionError(""); setNotice("");
    const { error } = await supabase.from("personal_bible_study_notes").delete().eq("id", note.id).eq("user_id", user.id);
    if (error) setActionError(error.message || "Your note could not be deleted.");
    else { await load(); setNotice("Your private note was deleted."); }
    setSaving(false);
  }

  if (loading) return <div className="personal-bible-loading" role="status">Opening your personal Bible Study…</div>;

  return <>
    <section className="personal-bible-study" aria-labelledby="personal-bible-title">
    {loadError ? <div className="personal-bible-feedback error" role="alert">{loadError}</div> : null}
    {streakError ? <div className="personal-bible-feedback error" role="alert">{streakError}</div> : null}
    {actionError ? <div className="personal-bible-feedback error" role="alert">{actionError}</div> : null}
    {notice ? <div className="personal-bible-feedback success" role="status">{notice}</div> : null}
    <div className={`bible-streak-connection is-${liveState}`} role="status"><i />{liveState === "live" ? "Your personal progress is live across your signed-in devices." : liveState === "error" ? "Live connection paused. Your saved progress will sync when connection returns." : "Connecting your personal reading progress…"}</div>
    {streakAvailable ? <BibleStreakCard summary={streakSummary} achievements={achievements} readings={readings} notes={notes} freezeHistory={freezeHistory} onUseFreeze={useFreeze} freezeBusy={freezeBusy} timezone={timezone} celebration={completionSuccess ? null : celebration} onCloseCelebration={() => setCelebration(null)} /> : <section className="bible-streak-welcome"><small>YOUR BIBLE STREAK</small><h2>Stay rooted in the Word. Build consistency. Grow every day.</h2><p>Every meaningful journey begins with one day. Your personal reading history remains safely in place while the streak system is prepared.</p></section>}

    <div className="personal-bible-overview" aria-label="Your personal Bible Study progress">
      <article className="personal-bible-progress-card"><div className="personal-bible-progress-copy"><span>PERSONAL PLAN</span><strong>{stats.completionPercent}%</strong><small>{stats.completedCount} of {stats.totalCount} planned chapters complete</small></div><div className="personal-bible-progress-track" role="progressbar" aria-label="Personal reading plan completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={stats.completionPercent}><i style={{ width: `${stats.completionPercent}%` }} /></div></article>
      <article><span>Today's requirement</span><strong>{streakSummary?.today_complete ? "Complete" : `${Math.max((streakSummary?.today_required_count || 1) - (streakSummary?.today_completed_count || 0), 0)} to go`}</strong><small>{streakSummary?.daily_requirement === "all_assigned" ? "Finish today's assigned chapters" : "Complete at least one chapter today"}</small></article>
      <article><span>Chapters completed</span><strong>{stats.completedCount}</strong><small>Personal readings only</small></article>
      <article><span>Private reflections</span><strong>{notes.length}</strong><small>Only you can view these notes</small></article>
    </div>

    <div className="personal-bible-content-grid">
      <section className="bible-panel personal-bible-reader-launcher" aria-labelledby="personal-bible-reader-title">
        <div className="personal-bible-reader-card-heading">
          <span className="personal-bible-reader-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
              <path d="M8.5 7h8M8.5 10.5h8" />
            </svg>
          </span>
          <div>
            <small>YOUR SCRIPTURE READER</small>
            <h2 id="personal-bible-reader-title">Bible Reading</h2>
            <p><strong>{readerSelection.book} {readerSelection.chapter}</strong><span>World English Bible · public domain</span></p>
          </div>
          {selectedReading ? <StatusLabel status={selectedReading.status} /> : null}
        </div>
        <div className="personal-bible-reader-card-details">
          {stats.totalCount ? <div className="personal-bible-reader-progress">
            <div><span>Personal plan progress</span><strong>{stats.completionPercent}%</strong></div>
            <span className="personal-bible-progress-track" role="progressbar" aria-label="Personal reading plan completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={stats.completionPercent}><i style={{ width: `${stats.completionPercent}%` }} /></span>
            <small>{stats.completedCount} of {stats.totalCount} planned chapters complete</small>
          </div> : <p className="personal-bible-reader-empty-progress">Your personal reading progress will appear here.</p>}
          {lastReadingActivity ? <p className="personal-bible-reader-last-activity">
            {lastReadingActivity.status === "completed" ? "Last completed" : "Last continued"} · {lastReadingActivity.book} {lastReadingActivity.chapter} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastReadingActivity.activityAt))}
          </p> : null}
        </div>
        <button type="button" className="bible-btn primary personal-bible-reader-open" onClick={openBibleReader}>
          {readingActionLabel}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
        </button>
      </section>

      <aside className="personal-bible-side-column">
        <section className="bible-panel">
          <div className="personal-bible-section-heading"><div><small>YOUR JOURNEY</small><h2>Personal reading plan</h2><p>Choose your own chapters and schedule.</p></div></div>
          {stats.nextReading ? <button className="personal-bible-next-reading" type="button" onClick={() => selectPlanReading(stats.nextReading)}><span>UP NEXT</span><strong>{stats.nextReading.book} {stats.nextReading.chapter}</strong><small>{formatDate(stats.nextReading.reading_date)} · {stats.nextReading.status === "in_progress" ? "In progress" : "Not started"}</small></button> : null}
          <form className="personal-bible-plan-form" onSubmit={addReading}>
            <label>Book<select required value={plan.book} onChange={(event) => setPlan((current) => ({ ...current, book: event.target.value, chapter: "" }))}><option value="">Choose a book</option>{BIBLE_BOOKS.map((book) => <option key={book.slug} value={book.name}>{book.name}</option>)}</select></label>
            <label>Chapter<input required type="number" min="1" max={BIBLE_BOOK_CHAPTERS[plan.book] || 150} value={plan.chapter} onChange={(event) => setPlan((current) => ({ ...current, chapter: event.target.value }))} /></label>
            <label>Reading date<input required type="date" value={plan.reading_date} onChange={(event) => setPlan((current) => ({ ...current, reading_date: event.target.value }))} /></label>
            <div className="personal-bible-plan-form-actions"><button type="submit" className="bible-btn primary" disabled={saving || Boolean(loadError)}>{saving ? "Saving…" : editingReadingId ? "Save chapter" : "Add to my plan"}</button>{editingReadingId ? <button type="button" className="bible-btn secondary" onClick={cancelReadingEdit} disabled={saving}>Cancel</button> : null}</div>
          </form>
          <div className="personal-bible-plan-list">
            {orderedReadings.length ? orderedReadings.map((reading) => <div key={reading.id} className={`personal-bible-plan-row${selectedReadingId === reading.id ? " selected" : ""}`}><button type="button" className="personal-bible-plan-select" onClick={() => selectPlanReading(reading)}><span className="personal-bible-plan-mark" aria-hidden="true">{reading.status === "completed" ? "✓" : reading.status === "in_progress" ? "–" : "○"}</span><span><strong>{reading.book} {reading.chapter}</strong><small>{formatDate(reading.reading_date)}</small></span><StatusLabel status={reading.status} /></button>{reading.status !== "completed" ? <div className="personal-bible-plan-actions"><button type="button" onClick={() => beginEditReading(reading)} disabled={saving} aria-label={`Edit ${reading.book} ${reading.chapter} in your plan`}>Edit</button><button type="button" className="danger" onClick={() => void deletePlannedReading(reading)} disabled={saving} aria-label={`Remove ${reading.book} ${reading.chapter} from your plan`}>Remove</button></div> : null}</div>) : <p className="bible-muted">Your personal plan is empty. Add a chapter to begin.</p>}
          </div>
        </section>

        <section className="bible-panel personal-bible-progress-panel">
          <div className="personal-bible-section-heading"><div><small>PLAN PROGRESS</small><h2>By Bible book</h2><p>Completion is based only on chapters in your personal plan.</p></div></div>
          {stats.byBook.length ? <div className="personal-bible-book-progress">{stats.byBook.map((book) => <div key={book.book}><div><strong>{book.book}</strong><span>{book.completed} / {book.total}</span></div><span className="personal-bible-book-track" role="progressbar" aria-label={`${book.book} plan progress`} aria-valuemin="0" aria-valuemax={book.total} aria-valuenow={book.completed}><i style={{ width: `${book.total ? Math.round(book.completed / book.total * 100) : 0}%` }} /></span></div>)}</div> : <p className="bible-muted">Your book progress will appear when you add a reading.</p>}
          {freezeHistory.length ? <div className="personal-bible-freeze-history"><strong>Streak Freeze history</strong>{freezeHistory.slice(0, 3).map((freeze) => <span key={freeze.local_date}>{formatDate(freeze.local_date)} · {freeze.source === "automatic" ? "Automatically protected" : "Protected by you"}</span>)}</div> : null}
        </section>

        <section className="bible-panel bible-streak-reminder-panel">
          <div className="personal-bible-section-heading"><div><small>GENTLE DAILY REMINDER</small><h2>Choose a time that works for you</h2><p>One kind reminder each day, delivered in {timezone} time.</p></div></div>
          {reminderNotice ? <div className="personal-bible-feedback success" role="status">{reminderNotice}</div> : null}
          <form className="bible-streak-reminder-form" onSubmit={saveReminderPreferences}>
            <label className="bible-streak-toggle"><input type="checkbox" checked={reminderPreferences.enabled} onChange={(event) => setReminderPreferences((current) => ({ ...current, enabled: event.target.checked }))} /><span><strong>Send me a daily reminder</strong><small>Reminders pause after you complete today's personal reading.</small></span></label>
            <label>Reminder time<input type="time" value={String(reminderPreferences.reminder_time || "19:00").slice(0, 5)} onChange={(event) => setReminderPreferences((current) => ({ ...current, reminder_time: event.target.value }))} disabled={!reminderPreferences.enabled} /></label>
            <label>Delivery<select value={reminderPreferences.delivery_channel} onChange={(event) => setReminderPreferences((current) => ({ ...current, delivery_channel: event.target.value }))} disabled={!reminderPreferences.enabled}><option value="in_app">In-app notification</option><option value="in_app_and_push">In-app and push, where configured</option></select></label>
            <label className="bible-streak-toggle"><input type="checkbox" checked={reminderPreferences.quiet_hours_enabled} onChange={(event) => setReminderPreferences((current) => ({ ...current, quiet_hours_enabled: event.target.checked }))} disabled={!reminderPreferences.enabled} /><span><strong>Quiet hours</strong><small>Hold reminders during the hours you choose below.</small></span></label>
            <div className="bible-streak-quiet-times"><label>Quiet hours start<input type="time" value={String(reminderPreferences.quiet_hours_start || "22:00").slice(0, 5)} onChange={(event) => setReminderPreferences((current) => ({ ...current, quiet_hours_start: event.target.value }))} disabled={!reminderPreferences.enabled || !reminderPreferences.quiet_hours_enabled} /></label><label>Quiet hours end<input type="time" value={String(reminderPreferences.quiet_hours_end || "07:00").slice(0, 5)} onChange={(event) => setReminderPreferences((current) => ({ ...current, quiet_hours_end: event.target.value }))} disabled={!reminderPreferences.enabled || !reminderPreferences.quiet_hours_enabled} /></label></div>
            <button type="submit" className="bible-btn secondary" disabled={reminderSaving || !streakAvailable}>{reminderSaving ? "Saving…" : "Save reminder preferences"}</button>
          </form>
          <small className="bible-streak-reminder-note">Reminders are scheduled in the background and will not repeat after today's reading is complete. Push delivery also requires an enabled device and Bible Study push notifications.</small>
        </section>
      </aside>
    </div>

    <div className="personal-bible-content-grid personal-bible-lower-grid">
      <section className="bible-panel personal-bible-notes-panel">
        <div className="personal-bible-section-heading"><div><small>PRIVATE BY DEFAULT</small><h2>Personal notes</h2><p>Only your account can read or change these reflections.</p></div></div>
        <form className="personal-bible-note-form" onSubmit={saveNote}>
          <div className="personal-bible-note-fields"><label>Note type<select value={noteDraft.note_type} onChange={(event) => setNoteDraft((current) => ({ ...current, note_type: event.target.value }))}>{NOTE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Verse reference (optional)<input value={noteDraft.verse_reference} onChange={(event) => setNoteDraft((current) => ({ ...current, verse_reference: event.target.value }))} maxLength="80" placeholder={`${readerSelection.book} ${readerSelection.chapter}:`} /></label></div>
          <label className="personal-bible-note-content"><span>{editingNoteId ? "Edit private note" : `Add a note for ${readerSelection.book} ${readerSelection.chapter}`}</span><textarea required maxLength="6000" value={noteDraft.content} onChange={(event) => setNoteDraft((current) => ({ ...current, content: event.target.value }))} placeholder="Capture an observation, question, prayer point or personal application…" /></label>
          <div className="personal-bible-note-actions"><button type="submit" className="bible-btn primary" disabled={saving || Boolean(loadError)}>{saving ? "Saving…" : editingNoteId ? "Save note" : "Save private note"}</button>{editingNoteId ? <button type="button" className="bible-btn secondary" onClick={() => { setEditingNoteId(""); setNoteDraft({ note_type: "reflection", verse_reference: "", content: "" }); }}>Cancel edit</button> : null}</div>
        </form>
        <div className="personal-bible-notes-list">{selectedNotes.length ? selectedNotes.map((note) => <article key={note.id}><div><span>{NOTE_TYPES.find(([value]) => value === note.note_type)?.[1] || "Reflection"}{note.verse_reference ? ` · ${note.verse_reference}` : ""}</span><time dateTime={note.updated_at || note.created_at}>{formatDate(getReadingDateInTimezone(new Date(note.created_at), timezone))}</time></div><p>{note.content}</p><footer><button type="button" onClick={() => beginEditNote(note)} disabled={saving}>Edit</button><button type="button" className="danger" onClick={() => void deleteNote(note)} disabled={saving}>Delete</button></footer></article>) : <p className="bible-muted">No personal notes for {readerSelection.book} {readerSelection.chapter} yet.</p>}</div>
      </section>

      <section className="bible-panel personal-bible-activity-panel">
        <div className="personal-bible-section-heading"><div><small>YOUR HISTORY</small><h2>Recent activity</h2><p>Your own study activity across devices.</p></div></div>
        {recentActivity.length ? <ul>{recentActivity.map((activity) => <li key={activity.id}><span aria-hidden="true" /><div><strong>{activity.label}</strong><time dateTime={activity.created_at}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.created_at))}</time></div></li>)}</ul> : <p className="bible-muted">Completed readings and saved notes will appear here.</p>}
      </section>
    </div>
    </section>
    {typeof document !== "undefined" ? createPortal(
      <FullBibleReader
        key={readerSelection.key}
        initialBook={readerSelection.book}
        initialChapter={readerSelection.chapter}
        isOpen={readerOpen}
        onClose={() => setReaderOpen(false)}
        onChapterChange={changePassage}
        onStartReading={() => void setReadingStatus("in_progress")}
        onMarkComplete={() => void setReadingStatus("completed")}
        isSaving={saving}
        startDisabled={readerCompletedToday}
        completeDisabled={readerCompletedToday || !streakAvailable}
        startLabel={readerInProgress ? "Continue Reading" : "Start Reading"}
        completeLabel={readerCompletedToday ? "Completed today" : "Mark This Chapter Complete"}
        readingProgress={stats.completionPercent}
        progressLabel={stats.totalCount ? `${stats.completedCount} of ${stats.totalCount} chapters complete` : "No planned chapters yet"}
        successMessage={readerNotice}
        errorMessage={actionError || streakError}
        footerHint="Your personal reading progress is saved separately from the group plan."
        completionSuccess={completionSuccess}
        onDismissCompletion={dismissChapterCompletion}
      />,
      document.body
    ) : null}
  </>;
}
