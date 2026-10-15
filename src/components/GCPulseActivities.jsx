import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const ACTIVITY_TYPES = [
  { value: "this_or_that", label: "This or That", kind: "Poll" },
  { value: "would_you_rather", label: "Would You Rather", kind: "Poll" },
  { value: "surprise_poll", label: "Surprise Drop", kind: "Poll" },
  { value: "quick_quiz", label: "Quick-fire Quiz", kind: "Quiz" },
  { value: "riddle", label: "Riddle & Trivia", kind: "Quiz" },
  { value: "bible_challenge", label: "Bible Challenge", kind: "Quiz" }
];
const SCORED_TYPES = new Set(["quick_quiz", "riddle", "bible_challenge"]);

function ActivityMark({ type }) {
  const scored = SCORED_TYPES.has(type);
  return <span className="gc-pulse-activity-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{scored ? <><path d="M7 3.8h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.3A1.5 1.5 0 0 1 7.5 3.8Z"/><path d="M14 4v4h4M9 13h6M9 16.5h4"/></> : <><path d="M5 5.5h14A2 2 0 0 1 21 7.5v9a2 2 0 0 1-2 2H9l-5 2v-13a2 2 0 0 1 1-2Z"/><path d="M8 11h8M8 14h5"/></>}</svg></span>;
}

function localDateTimeValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function GCPulseActivities({ user, isAdmin }) {
  const [activities, setActivities] = useState([]);
  const [responses, setResponses] = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState("surprise_poll");
  const [optionsText, setOptionsText] = useState("Option one\nOption two");
  const [correctOption, setCorrectOption] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [startsAt, setStartsAt] = useState(() => localDateTimeValue(new Date()));
  const [closesAt, setClosesAt] = useState("");
  const [now, setNow] = useState(Date.now());

  const loadActivities = useCallback(async () => {
    const { data, error: activityError } = await supabase
      .from("gc_pulse_activities")
      .select("id, created_by, activity_type, title, prompt, options, starts_at, closes_at, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (activityError) {
      setActivities([]);
      setResponses([]);
      setResults({});
      setMigrationMissing(activityError.code === "42P01" || activityError.code === "PGRST205");
      setError(activityError.message);
      setLoading(false);
      return;
    }
    setMigrationMissing(false);
    setError("");
    const rows = data ?? [];
    setActivities(rows);
    if (rows.length) {
      const { data: responseRows, error: responseError } = await supabase
        .from("gc_pulse_activity_responses")
        .select("activity_id,user_id,selected_option,awarded_points,submitted_at")
        .in("activity_id", rows.map((row) => row.id))
        .eq("user_id", user.id);
      if (responseError) setError(responseError.message);
      else setResponses(responseRows ?? []);
      const finalRows = rows.filter((activity) => activity.status !== "open" || (activity.closes_at && new Date(activity.closes_at).getTime() <= Date.now()));
      const resultEntries = await Promise.all(finalRows.map(async (activity) => {
        const { data: resultData } = await supabase.rpc("gc_pulse_activity_results", { target_activity_id: activity.id });
        return [activity.id, resultData ?? []];
      }));
      setResults(Object.fromEntries(resultEntries));
    } else { setResponses([]); setResults({}); }
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    void loadActivities();
    const channel = supabase
      .channel("gc-pulse-activities-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "gc_pulse_activities" }, () => void loadActivities())
      .on("postgres_changes", { event: "*", schema: "public", table: "gc_pulse_activity_responses" }, () => void loadActivities())
      .subscribe();
    const refreshTimer = window.setInterval(() => { setNow(Date.now()); void loadActivities(); }, 60_000);
    return () => { window.clearInterval(refreshTimer); void supabase.removeChannel(channel); };
  }, [loadActivities]);

  const activeActivities = useMemo(() => activities.filter((activity) => {
    if (activity.status !== "open") return false;
    return new Date(activity.starts_at).getTime() <= now && (!activity.closes_at || new Date(activity.closes_at).getTime() > now);
  }), [activities, now]);
  const upcomingActivities = activities.filter((activity) => activity.status === "open" && new Date(activity.starts_at).getTime() > now);
  const completedActivities = activities.filter((activity) => activity.status !== "open" || (activity.closes_at && new Date(activity.closes_at).getTime() <= now));
  const visibleActivities = [...activeActivities, ...upcomingActivities.slice(0, Math.max(0, 3 - activeActivities.length)), ...completedActivities.slice(0, 2)].slice(0, 5);
  const parsedOptions = optionsText.split("\n").map((option) => option.trim()).filter(Boolean);

  async function createActivity(event) {
    event.preventDefault();
    setError("");
    const options = optionsText.split("\n").map((option) => option.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6) {
      setError("Add between 2 and 6 answer choices, one per line.");
      return;
    }
    if (SCORED_TYPES.has(type) && (correctOption < 0 || correctOption >= options.length)) {
      setError("Choose the correct answer before publishing the quiz.");
      return;
    }
    if (closesAt && new Date(closesAt) <= new Date(startsAt)) {
      setError("The closing time must be after the start time.");
      return;
    }
    setBusyId("create");
    const { data, error: createError } = await supabase.from("gc_pulse_activities").insert({
      created_by: user.id,
      activity_type: type,
      title: title.trim(),
      prompt: prompt.trim(),
      options,
      starts_at: new Date(startsAt).toISOString(),
      closes_at: closesAt ? new Date(closesAt).toISOString() : null
    }).select("id").single();
    if (createError) {
      setError(createError.message);
      setBusyId("");
      return;
    }
    if (SCORED_TYPES.has(type)) {
      const { error: keyError } = await supabase.from("gc_pulse_activity_keys").insert({
        activity_id: data.id,
        correct_option: correctOption,
        explanation: explanation.trim(),
        created_by: user.id
      });
      if (keyError) {
        await supabase.from("gc_pulse_activities").delete().eq("id", data.id);
        setError(`The quiz could not be published: ${keyError.message}`);
        setBusyId("");
        return;
      }
    }
    setTitle("");
    setPrompt("");
    setOptionsText("Option one\nOption two");
    setCorrectOption(0);
    setExplanation("");
    setComposerOpen(false);
    setBusyId("");
    await loadActivities();
  }

  async function participate(activity, optionIndex) {
    setError("");
    setBusyId(activity.id);
    const { error: submitError } = await supabase.rpc("submit_gc_pulse_response", {
      target_activity_id: activity.id,
      selected_option: optionIndex
    });
    await loadActivities();
    if (submitError) setError(submitError.message);
    setBusyId("");
  }

  async function closeActivity(activity, status = "completed") {
    setError("");
    setBusyId(activity.id);
    const { error: closeError } = await supabase.rpc("close_gc_pulse_activity", {
      target_activity_id: activity.id,
      final_status: status
    });
    await loadActivities();
    if (closeError) setError(closeError.message);
    setBusyId("");
  }

  async function revealAnswer(activity) {
    setError("");
    setBusyId(activity.id);
    const { data, error: answerError } = await supabase.rpc("reveal_gc_pulse_answer", {
      target_activity_id: activity.id
    });
    if (answerError) setError(answerError.message);
    else setRevealedAnswers((current) => ({ ...current, [activity.id]: data?.[0] ?? null }));
    setBusyId("");
  }

  if (migrationMissing) return <section className="gc-pulse-activities" aria-labelledby="gc-pulse-activities-heading">
    <div className="gc-pulse-section-heading"><div><p className="gc-pulse-kicker">THE ARENA</p><h2 id="gc-pulse-activities-heading">Live activities</h2></div></div>
    <div className="gc-pulse-inline-note">Live polls and quizzes will appear here after the GC Pulse activities migration is applied.</div>
  </section>;

  return <section className="gc-pulse-activities" aria-labelledby="gc-pulse-activities-heading">
    <div className="gc-pulse-section-heading">
      <div><p className="gc-pulse-kicker">THE ARENA</p><h2 id="gc-pulse-activities-heading">Live activities</h2><p>Jump into a quick community poll or challenge.</p></div>
      {isAdmin ? <button type="button" className="gc-pulse-secondary-action" onClick={() => setComposerOpen((open) => !open)}>{composerOpen ? "Close" : "+ Start something"}</button> : null}
    </div>
    {composerOpen && isAdmin ? <form className="gc-pulse-activity-form" onSubmit={createActivity}>
      <div className="gc-pulse-form-grid">
        <label><span>Activity style</span><select value={type} onChange={(event) => { setType(event.target.value); setCorrectOption(0); }}>
          {ACTIVITY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
        <label><span>Short title</span><input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Friday quick challenge" /></label>
        <label className="gc-pulse-field-wide"><span>Question or prompt</span><textarea required maxLength={1000} rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What do you think?" /></label>
        <label className="gc-pulse-field-wide"><span>Choices · one per line (2–6)</span><textarea required rows={3} value={optionsText} onChange={(event) => { setOptionsText(event.target.value); setCorrectOption(0); }} /></label>
        {SCORED_TYPES.has(type) ? <label><span>Correct answer</span><select value={correctOption} onChange={(event) => setCorrectOption(Number(event.target.value))}>{parsedOptions.map((option, index) => <option key={`${index}-${option}`} value={index}>{option}</option>)}</select></label> : null}
        {SCORED_TYPES.has(type) ? <label className="gc-pulse-field-wide"><span>Answer explanation (optional)</span><textarea rows={2} maxLength={1000} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Share a short explanation after the challenge closes." /></label> : null}
        <label><span>Starts</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
        <label><span>Closes (optional)</span><input type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label>
      </div>
      <div className="gc-pulse-form-footer"><span>Members can participate once. Quiz scoring is validated by Supabase.</span><button type="submit" className="gc-pulse-primary-action" disabled={busyId === "create"}>{busyId === "create" ? "Publishing…" : "Publish activity"}</button></div>
    </form> : null}
    {error ? <p className="gc-pulse-error" role="alert">{error}</p> : null}
    {loading ? <div className="gc-pulse-activity-loading" aria-label="Loading activities"><span /><span /></div> : visibleActivities.length ? <div className="gc-pulse-activity-strip">
      {visibleActivities.map((activity) => {
        const activityType = ACTIVITY_TYPES.find((item) => item.value === activity.activity_type);
        const myResponse = responses.find((row) => row.activity_id === activity.id && row.user_id === user.id);
        const expired = activity.closes_at && new Date(activity.closes_at).getTime() <= Date.now();
        const isOpen = activity.status === "open" && !expired && new Date(activity.starts_at).getTime() <= Date.now();
        const isUpcoming = activity.status === "open" && !expired && new Date(activity.starts_at).getTime() > Date.now();
        const isFinal = !isOpen && !isUpcoming;
        const activityResults = results[activity.id] ?? [];
        const totalResponses = activityResults.reduce((total, row) => total + Number(row.response_count), 0);
        return <article className="gc-pulse-activity-card" key={activity.id}>
          <div className="gc-pulse-activity-card-top"><ActivityMark type={activity.activity_type} /><span className="gc-pulse-activity-type">{activityType?.label || "Community activity"}</span><span className={`gc-pulse-activity-status${isOpen ? " is-live" : ""}`}>{isOpen ? "LIVE" : isUpcoming ? "UP NEXT" : activity.status === "cancelled" ? "CANCELLED" : "ENDED"}</span></div>
          <h3>{activity.title}</h3><p className="gc-pulse-activity-prompt">{activity.prompt}</p>
          {isOpen && !myResponse ? <div className="gc-pulse-activity-options">{activity.options.map((option, index) => <button key={`${index}-${option}`} type="button" disabled={busyId === activity.id} onClick={() => void participate(activity, index)}>{option}</button>)}</div> : null}
          {myResponse ? <p className="gc-pulse-response-note">{SCORED_TYPES.has(activity.activity_type) ? `${myResponse.awarded_points ? "Correct" : "Submitted"} · ${myResponse.awarded_points} point${myResponse.awarded_points === 1 ? "" : "s"}` : "Your response is in"}</p> : null}
          {isFinal ? <div className="gc-pulse-results"><strong>{totalResponses} participant{totalResponses === 1 ? "" : "s"}</strong>{activity.options.map((option, index) => {
            const result = activityResults.find((row) => row.selected_option === index);
            const votes = Number(result?.response_count ?? 0);
            return <div className="gc-pulse-result-row" key={`${index}-${option}`}><span>{option}</span><b>{votes}</b><i style={{ width: `${totalResponses ? Math.round((votes / totalResponses) * 100) : 0}%` }} /></div>;
          })}{SCORED_TYPES.has(activity.activity_type) ? <><p>{activityResults.reduce((total, row) => total + Number(row.points_awarded), 0)} correct answer points awarded</p>{revealedAnswers[activity.id] ? <p className="gc-pulse-answer-reveal">Answer: <strong>{activity.options[revealedAnswers[activity.id].correct_option]}</strong>{revealedAnswers[activity.id].explanation ? ` · ${revealedAnswers[activity.id].explanation}` : ""}</p> : <button type="button" className="gc-pulse-reveal-button" disabled={busyId === activity.id} onClick={() => void revealAnswer(activity)}>{busyId === activity.id ? "Loading answer…" : "See answer"}</button>}</> : null}</div> : null}
          {isUpcoming ? <p className="gc-pulse-response-note">Starts {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.starts_at))}</p> : null}
          <footer><span>{isOpen ? `${myResponse ? "You took part" : "Choose one response"}` : isFinal ? "Community results" : "Scheduled"}</span>{isAdmin && activity.status === "open" ? <button type="button" disabled={busyId === activity.id} onClick={() => void closeActivity(activity, isUpcoming ? "cancelled" : "completed")}>{isUpcoming ? "Cancel" : "End"}</button> : null}</footer>
        </article>;
      })}
    </div> : <div className="gc-pulse-inline-note">{isAdmin ? "No activities are running yet. Start a poll or quick challenge for the group." : "No activity is running right now. Check back for the next community challenge."}</div>}
  </section>;
}
