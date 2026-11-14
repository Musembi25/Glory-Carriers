import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function GCPulseActivities({ user, isAdmin, profiles, groupId }) {
  const [activities, setActivities] = useState([]);
  const [responses, setResponses] = useState([]);
  const [results, setResults] = useState({});
  const [participants, setParticipants] = useState({});
  const [participantCounts, setParticipantCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [arenaTab, setArenaTab] = useState("active");
  const [responsesAnonymous, setResponsesAnonymous] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
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
  const deleteCancelRef = useRef(null);

  useEffect(() => {
    if (!deleteTarget) return undefined;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    deleteCancelRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && busyId !== deleteTarget.id) setDeleteTarget(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [deleteTarget, busyId]);

  const loadActivities = useCallback(async () => {
    const { data, error: activityError } = await supabase
      .from("gc_pulse_activities")
      .select("id, created_by, activity_type, title, prompt, options, starts_at, closes_at, status, responses_anonymous, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (activityError) {
      setActivities([]);
      setResponses([]);
      setResults({});
      setParticipants({});
      setParticipantCounts({});
      setMigrationMissing(["42P01", "PGRST205", "42703", "PGRST204"].includes(activityError.code));
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
        .eq("group_id", groupId)
        .eq("user_id", user.id);
      if (responseError) setError(responseError.message);
      else setResponses(responseRows ?? []);
      const finalRows = rows.filter((activity) => activity.status !== "open" || (activity.closes_at && new Date(activity.closes_at).getTime() <= Date.now()));
      const [resultEntries, participantEntries, countEntries] = await Promise.all([
        Promise.all(finalRows.map(async (activity) => {
          const { data: resultData } = await supabase.rpc("gc_pulse_activity_results", { target_activity_id: activity.id });
          return [activity.id, resultData ?? []];
        })),
        Promise.all(finalRows.filter((activity) => !activity.responses_anonymous).map(async (activity) => {
          const { data: participantData } = await supabase.rpc("gc_pulse_activity_participants", { target_activity_id: activity.id });
          return [activity.id, participantData ?? []];
        })),
        Promise.all(rows.map(async (activity) => {
          const { data: participantCount } = await supabase.rpc("gc_pulse_activity_participant_count", { target_activity_id: activity.id });
          return [activity.id, Number(participantCount ?? 0)];
        }))
      ]);
      setResults(Object.fromEntries(resultEntries));
      setParticipants(Object.fromEntries(participantEntries));
      setParticipantCounts(Object.fromEntries(countEntries));
    } else { setResponses([]); setResults({}); setParticipants({}); setParticipantCounts({}); }
    setLoading(false);
  }, [groupId, user.id]);

  useEffect(() => {
    void loadActivities();
    const channel = supabase
      .channel("gc-pulse-activities-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "gc_pulse_activities", filter: `group_id=eq.${groupId}` }, () => void loadActivities())
      .on("postgres_changes", { event: "*", schema: "public", table: "gc_pulse_activity_responses", filter: `group_id=eq.${groupId}` }, () => void loadActivities())
      .subscribe();
    const refreshTimer = window.setInterval(() => { setNow(Date.now()); void loadActivities(); }, 60_000);
    return () => { window.clearInterval(refreshTimer); void supabase.removeChannel(channel); };
  }, [groupId, loadActivities]);

  const activeActivities = useMemo(() => activities.filter((activity) => {
    if (activity.status !== "open") return false;
    return new Date(activity.starts_at).getTime() <= now && (!activity.closes_at || new Date(activity.closes_at).getTime() > now);
  }), [activities, now]);
  const upcomingActivities = activities.filter((activity) => activity.status === "open" && new Date(activity.starts_at).getTime() > now);
  const completedActivities = activities.filter((activity) => activity.status !== "open" || (activity.closes_at && new Date(activity.closes_at).getTime() <= now));
  const displayedActivities = arenaTab === "active" ? activeActivities : arenaTab === "upcoming" ? upcomingActivities : completedActivities;
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
      group_id: groupId,
      created_by: user.id,
      activity_type: type,
      title: title.trim(),
      prompt: prompt.trim(),
      options,
      starts_at: new Date(startsAt).toISOString(),
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      responses_anonymous: responsesAnonymous
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
    setResponsesAnonymous(true);
    setComposerOpen(false);
    setBusyId("");
    await loadActivities();
  }

  async function participate(activity, optionIndex) {
    setError("");
    setBusyId(activity.id);
    const optimisticResponse = { activity_id: activity.id, user_id: user.id, selected_option: optionIndex, awarded_points: null, submitted_at: new Date().toISOString() };
    setResponses((current) => [...current.filter((row) => row.activity_id !== activity.id || row.user_id !== user.id), optimisticResponse]);
    setParticipantCounts((current) => ({ ...current, [activity.id]: Number(current[activity.id] || 0) + 1 }));
    const { data: submitData, error: submitError } = await supabase.rpc("submit_gc_pulse_response", {
      target_activity_id: activity.id,
      selected_option: optionIndex
    });
    if (submitError) {
      setResponses((current) => current.filter((row) => row !== optimisticResponse));
      setParticipantCounts((current) => ({ ...current, [activity.id]: Math.max(0, Number(current[activity.id] || 1) - 1) }));
      await loadActivities();
      setError(submitError.message);
    } else {
      const awardedPoints = Number(submitData?.[0]?.awarded_points ?? 0);
      setResponses((current) => current.map((row) => row === optimisticResponse ? { ...row, awarded_points: awardedPoints } : row));
      await loadActivities();
    }
    setBusyId("");
  }

  async function deleteActivity(activity) {
    if (!isAdmin && activity.created_by !== user.id) return false;
    setBusyId(activity.id);
    setError("");
    const { error: deleteError } = await supabase.from("gc_pulse_activities").delete().eq("id", activity.id);
    if (deleteError) {
      setError(deleteError.message);
      setBusyId("");
      return false;
    }
    setActivities((current) => current.filter((item) => item.id !== activity.id));
    setResponses((current) => current.filter((item) => item.activity_id !== activity.id));
    setResults((current) => { const next = { ...current }; delete next[activity.id]; return next; });
    setParticipants((current) => { const next = { ...current }; delete next[activity.id]; return next; });
    setParticipantCounts((current) => { const next = { ...current }; delete next[activity.id]; return next; });
    setDeleteTarget(null);
    setBusyId("");
    return true;
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
    <div className="gc-pulse-inline-note">Apply <code>supabase/gc-pulse-activities-migration.sql</code> and then <code>supabase/gc-pulse-arena-controls-migration.sql</code> to enable the Arena.</div>
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
        <label className="gc-pulse-anonymous-setting"><input type="checkbox" checked={responsesAnonymous} onChange={(event) => setResponsesAnonymous(event.target.checked)} /><span>Keep member responses anonymous</span><small>Members will see totals and results without names or individual answers.</small></label>
      </div>
      <div className="gc-pulse-form-footer"><span>Members can participate once. Response privacy is enforced after the activity closes.</span><button type="submit" className="gc-pulse-primary-action" disabled={busyId === "create"}>{busyId === "create" ? "Publishing…" : "Publish activity"}</button></div>
    </form> : null}
    {error ? <p className="gc-pulse-error" role="alert">{error}</p> : null}
    <div className="gc-pulse-arena-tabs" role="group" aria-label="Filter Arena activities">
      {[{id:"active",label:"Active challenges",count:activeActivities.length},{id:"upcoming",label:"Upcoming",count:upcomingActivities.length},{id:"completed",label:"Completed",count:completedActivities.length}].map((tab)=><button key={tab.id} type="button" className={arenaTab===tab.id?"active":""} aria-pressed={arenaTab===tab.id} onClick={()=>setArenaTab(tab.id)}>{tab.label}<b>{tab.count}</b></button>)}
    </div>
    {loading ? <div className="gc-pulse-activity-loading" aria-label="Loading activities"><span /><span /></div> : displayedActivities.length ? <div className="gc-pulse-activity-grid">
      {displayedActivities.map((activity) => {
        const activityType = ACTIVITY_TYPES.find((item) => item.value === activity.activity_type);
        const myResponse = responses.find((row) => row.activity_id === activity.id && row.user_id === user.id);
        const creator = profiles.find((member) => member.id === activity.created_by);
        const expired = activity.closes_at && new Date(activity.closes_at).getTime() <= Date.now();
        const isOpen = activity.status === "open" && !expired && new Date(activity.starts_at).getTime() <= Date.now();
        const isUpcoming = activity.status === "open" && !expired && new Date(activity.starts_at).getTime() > Date.now();
        const isFinal = !isOpen && !isUpcoming;
        const activityResults = results[activity.id] ?? [];
        const activityParticipants = participants[activity.id] ?? [];
        const totalResponses = activityResults.reduce((total, row) => total + Number(row.response_count), 0);
        const participantCount = Number(participantCounts[activity.id] || 0);
        const canDelete = isAdmin || activity.created_by === user.id;
        return <article className={myResponse ? "gc-pulse-activity-card is-submitted" : "gc-pulse-activity-card"} key={activity.id}>
          <div className="gc-pulse-activity-card-top"><ActivityMark type={activity.activity_type} /><span className="gc-pulse-activity-type">{activityType?.label || "Community activity"}</span><span className={`gc-pulse-activity-status${isOpen ? " is-live" : ""}`}>{isOpen ? "LIVE" : isUpcoming ? "UP NEXT" : activity.status === "cancelled" ? "CANCELLED" : "ENDED"}</span></div>
          <h3>{activity.title}</h3><p className="gc-pulse-activity-prompt">{activity.prompt}</p>
          <p className="gc-pulse-activity-creator">Started by {creator?.full_name || "Community member"} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.created_at))}</p>
          {isOpen || isUpcoming ? <p className="gc-pulse-participation-count" aria-live="polite">{participantCount} {participantCount === 1 ? "member has" : "members have"} participated</p> : null}
          {isOpen && !myResponse ? <div className="gc-pulse-activity-options">{activity.options.map((option, index) => <button key={`${index}-${option}`} type="button" disabled={busyId === activity.id} onClick={() => void participate(activity, index)}>{option}</button>)}</div> : null}
          {myResponse ? <p className="gc-pulse-response-note" role="status">{myResponse.awarded_points === null ? "Response submitted" : SCORED_TYPES.has(activity.activity_type) ? `${myResponse.awarded_points ? "Correct" : "Submitted"} · ${myResponse.awarded_points} point${myResponse.awarded_points === 1 ? "" : "s"}` : "Your response is in"}</p> : null}
          {isFinal ? <div className="gc-pulse-results"><strong>{totalResponses} participant{totalResponses === 1 ? "" : "s"}</strong>{activity.options.map((option, index) => {
            const result = activityResults.find((row) => row.selected_option === index);
            const votes = Number(result?.response_count ?? 0);
            return <div className="gc-pulse-result-row" key={`${index}-${option}`}><span>{option}</span><b>{votes}</b><i style={{ width: `${totalResponses ? Math.round((votes / totalResponses) * 100) : 0}%` }} /></div>;
          })}{!activity.responses_anonymous ? <details className="gc-pulse-participant-list"><summary>Participants · {activityParticipants.length}</summary>{activityParticipants.length ? <ul>{activityParticipants.map((participant)=><li key={participant.user_id}><span>{participant.full_name||"Member"}</span><span>{activity.options[participant.selected_option]}</span>{SCORED_TYPES.has(activity.activity_type)?<b>{participant.awarded_points} pt</b>:null}</li>)}</ul>:<p>No participation yet.</p>}</details> : isFinal ? <p className="gc-pulse-anonymous-note">Individual responses are anonymous.</p> : null}{SCORED_TYPES.has(activity.activity_type) ? <><p>{activityResults.reduce((total, row) => total + Number(row.points_awarded), 0)} correct answer points awarded</p>{revealedAnswers[activity.id] ? <p className="gc-pulse-answer-reveal">Answer: <strong>{activity.options[revealedAnswers[activity.id].correct_option]}</strong>{revealedAnswers[activity.id].explanation ? ` · ${revealedAnswers[activity.id].explanation}` : ""}</p> : <button type="button" className="gc-pulse-reveal-button" disabled={busyId === activity.id} onClick={() => void revealAnswer(activity)}>{busyId === activity.id ? "Loading answer…" : "See answer"}</button>}</> : null}</div> : null}
          {isUpcoming ? <p className="gc-pulse-response-note">Starts {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.starts_at))}</p> : null}
          <footer><span>{isOpen ? `${myResponse ? "You took part" : "Choose one response"}` : isFinal ? "Community results" : "Scheduled"}</span><div className="gc-pulse-activity-actions">{isAdmin && activity.status === "open" ? <button type="button" disabled={busyId === activity.id} onClick={() => void closeActivity(activity, isUpcoming ? "cancelled" : "completed")}>{isUpcoming ? "Cancel" : "End"}</button> : null}{canDelete ? <details className="gc-pulse-activity-menu"><summary aria-label={`More actions for ${activity.title}`}>More</summary><button type="button" className="danger" onClick={(event)=>{event.currentTarget.closest("details").open=false;setDeleteTarget(activity);}}>Delete activity</button></details> : null}</div></footer>
        </article>;
      })}
    </div> : <div className="gc-pulse-inline-note">{arenaTab==="active"?isAdmin?"No activities are running yet. Start a poll or quick challenge for the group.":"No activity is running right now. Check back for the next community challenge.":arenaTab==="upcoming"?"There are no upcoming activities scheduled.":"Completed activities and their results will appear here."}</div>}
    {deleteTarget ? <div className="gc-pulse-confirm-overlay" onMouseDown={(event)=>{if(event.target===event.currentTarget&&busyId!==deleteTarget.id)setDeleteTarget(null);}}><section className="gc-pulse-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gc-pulse-delete-title" aria-describedby="gc-pulse-delete-copy"><span className="gc-pulse-confirm-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></span><h3 id="gc-pulse-delete-title">Delete this activity?</h3><p id="gc-pulse-delete-copy">“{deleteTarget.title}” and its responses will be permanently removed.</p><div><button ref={deleteCancelRef} type="button" className="gc-pulse-secondary-action" onClick={()=>setDeleteTarget(null)} disabled={busyId===deleteTarget.id}>Cancel</button><button type="button" className="gc-pulse-primary-action danger" onClick={()=>void deleteActivity(deleteTarget)} disabled={busyId===deleteTarget.id}>{busyId===deleteTarget.id?"Deleting…":"Delete activity"}</button></div></section></div> : null}
  </section>;
}
