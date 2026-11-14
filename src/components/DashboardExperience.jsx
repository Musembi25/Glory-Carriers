import { useEffect, useRef, useState } from "react";
import { MemberInitials } from "./MemberInitials.jsx";
import { supabase } from "../lib/supabase";
import { addReadingDays, getLocalReadingDate, getReadingWeekStart, summarizeGroupConsistency } from "../lib/personalBibleStudy.js";
import "../styles/dashboard-experience.css";
import "../styles/dashboard-redesign.css";

const confettiPieces = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 37 + 9) % 100}%`,
  delay: `${(index % 8) * -0.38}s`,
  duration: `${5.2 + (index % 5) * 0.42}s`,
  color: ["var(--primary)", "#82c9b7", "#edb778", "#d58a9d", "#9f8ad8"][index % 5],
  rotate: `${(index * 61) % 280}deg`
}));

const dashboardHeroImages = ["11.jpeg", "13.jpeg"].map((image) => `${import.meta.env.BASE_URL}community/backgrounds/${image}`);

export function DashboardHeroPhotographs() {
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;
    const timer = window.setInterval(() => setActiveImage((current) => (current + 1) % dashboardHeroImages.length), 12000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="dashboard-hero-photos" aria-hidden="true">
    {dashboardHeroImages.map((src, index) => <img key={src} className={index === activeImage ? "is-active" : ""} src={src} alt="" draggable="false" loading="eager" decoding="async" />)}
  </div>;
}

export function DashboardScriptureHighlight({ reading, onOpenStudy }) {
  const [state, setState] = useState(() => ({ loading: Boolean(reading?.book && reading?.chapter), verse: null, error: "" }));

  useEffect(() => {
    if (!reading?.book || !reading?.chapter) {
      setState({ loading: false, verse: null, error: "" });
      return undefined;
    }

    let alive = true;
    const file = reading.book.toLowerCase().replace(/\s/g, "");
    setState({ loading: true, verse: null, error: "" });
    fetch(`${import.meta.env.BASE_URL}bible/web/${file}.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Scripture text is unavailable right now.");
        return response.json();
      })
      .then((verses) => {
        const verse = verses.find((item) => item.chapterNumber === Number(reading.chapter) && /text$/.test(item.type));
        if (alive) setState({ loading: false, verse: verse || null, error: verse ? "" : "Scripture text is unavailable right now." });
      })
      .catch((error) => alive && setState({ loading: false, verse: null, error: error.message || "Scripture text is unavailable right now." }));
    return () => { alive = false; };
  }, [reading?.book, reading?.chapter]);

  return <section className="dashboard-redesign-card dashboard-scripture-card" aria-labelledby="dashboard-scripture-heading">
    <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">SCRIPTURE FOR THE JOURNEY</span><h2 id="dashboard-scripture-heading">A moment in the Word</h2><p>{reading ? `From your group reading · ${reading.book} ${reading.chapter}` : "Your group’s Scripture will appear here when a reading is scheduled."}</p></div><span className="dashboard-scripture-mark" aria-hidden="true">“</span></div>
    {state.loading ? <p className="dashboard-scripture-state" role="status">Opening today’s Scripture…</p>
      : state.verse ? <blockquote className="dashboard-scripture-quote"><p><sup>{state.verse.verseNumber}</sup>{state.verse.value}</p><cite>{reading.book} {reading.chapter}:{state.verse.verseNumber} <span>· World English Bible</span></cite></blockquote>
        : <div className="dashboard-empty-note"><strong>{reading ? "This passage could not be loaded." : "No group passage is scheduled yet."}</strong><span>{reading ? state.error || "Open Bible Study to read the scheduled chapter." : "A Scripture passage will appear here when your group plan is ready."}</span></div>}
    <button type="button" className="dashboard-text-action" onClick={onOpenStudy}>Open Bible Study <span aria-hidden="true">→</span></button>
  </section>;
}

function participationForDate(date, readings, completions, activeMemberIds, activeMemberCount = activeMemberIds.size) {
  const dayReadings = readings.filter((reading) => reading.reading_date === date && reading.deleted_at == null && !["draft", "archived"].includes(reading.status));
  const readingIds = new Set(dayReadings.map((reading) => reading.id));
  const completedRows = completions.filter((completion) => readingIds.has(completion.reading_id) && activeMemberIds.has(completion.user_id));
  const participants = new Set(completedRows.map((completion) => completion.user_id));
  const assigned = dayReadings.length * activeMemberCount;
  return {
    date,
    readings: dayReadings,
    completed: completedRows.length,
    participants: participants.size,
    assigned,
    percent: assigned ? Math.min(100, Math.round(completedRows.length / assigned * 100)) : 0
  };
}

export function DashboardGroupAnalytics({ readings = [], completions = [], activeMembers = [], activeMemberCount = activeMembers.length, membershipAvailable = false, today = getLocalReadingDate(), completionPercent = 50, settingsAvailable = true }) {
  const activeMemberIds = new Set(activeMembers.map((member) => member.id));
  const weekStart = getReadingWeekStart(today);
  const week = Array.from({ length: 7 }, (_, index) => participationForDate(addReadingDays(weekStart, index), readings, completions, activeMemberIds, activeMemberCount));
  const scheduledWeek = week.filter((day) => day.readings.length > 0 && day.date <= today);
  const todayReading = participationForDate(today, readings, completions, activeMemberIds, activeMemberCount);
  const consistency = summarizeGroupConsistency(readings, completions, activeMemberCount, today, completionPercent);
  const hasWeeklyHistory = membershipAvailable && scheduledWeek.length >= 2 && activeMemberCount > 0;
  const chartLeft = 34;
  const chartRight = 488;
  const chartBottom = 145;
  const chartTop = 26;
  const points = scheduledWeek.map((day) => {
    const dayIndex = week.findIndex((item) => item.date === day.date);
    const x = chartLeft + (dayIndex / 6) * (chartRight - chartLeft);
    const y = chartBottom - (day.percent / 100) * (chartBottom - chartTop);
    return { ...day, x, y };
  });
  const todayPercent = todayReading.percent;

  return <section className="dashboard-redesign-card dashboard-group-analytics" aria-labelledby="dashboard-group-analytics-title">
    <div className="dashboard-card-heading"><div><span className="dashboard-card-kicker">GROUP SPIRITUAL ANALYTICS</span><h2 id="dashboard-group-analytics-title">A steady rhythm, together</h2><p>Completion figures from your group’s scheduled Bible readings.</p></div><span className="dashboard-group-streak-badge"><strong>{settingsAvailable && membershipAvailable ? consistency.currentStreak : "—"}</strong><span>{!membershipAvailable ? "group totals unavailable" : settingsAvailable ? "shared reading days" : "streak report unavailable"}</span></span></div>
    <div className="dashboard-analytics-grid">
      <article className="dashboard-analytics-panel dashboard-analytics-line">
        <div className="dashboard-analytics-title"><strong>Weekly completion</strong><span>completed chapters / assigned</span></div>
        {hasWeeklyHistory ? <div className="dashboard-line-chart-wrap"><svg className="dashboard-line-chart" viewBox="0 0 520 180" role="img" aria-label="Weekly group Bible reading completion percentage">
          {[0, 50, 100].map((value) => { const y = chartBottom - (value / 100) * (chartBottom - chartTop); return <g key={value}><line x1={chartLeft} x2={chartRight} y1={y} y2={y} className="dashboard-chart-gridline"/><text x="5" y={y + 4} className="dashboard-chart-axis">{value}%</text></g>; })}
          {points.length > 1 ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="dashboard-line-chart-path"/> : null}
          {points.map((point) => <g key={point.date}><circle cx={point.x} cy={point.y} r="4.5" className="dashboard-line-chart-point"><title>{new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(new Date(`${point.date}T12:00:00Z`))}: {point.completed} of {point.assigned} chapters ({point.percent}%)</title></circle><text x={point.x} y="169" textAnchor="middle" className="dashboard-chart-day">{new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${point.date}T12:00:00Z`))}</text></g>)}
        </svg></div> : <div className="dashboard-chart-empty">{!membershipAvailable ? "Group totals are available to group leaders." : activeMemberCount === 0 ? "Weekly trends will appear when your group has active members." : "Weekly trends will appear after at least two scheduled reading days are recorded."}</div>}
      </article>
      <article className="dashboard-analytics-panel dashboard-analytics-donut-panel">
        <div className="dashboard-analytics-title"><strong>Today’s group reading</strong><span>members completed assigned chapters</span></div>
        {membershipAvailable && todayReading.readings.length && activeMemberCount > 0 ? <div className="dashboard-donut-layout"><div className="dashboard-donut-chart" style={{ "--dashboard-donut-progress": `${todayPercent}%` }} role="img" aria-label={`${todayReading.completed} of ${todayReading.assigned} assigned chapter readings completed today`}><span><strong>{todayPercent}%</strong><small>complete</small></span></div><div className="dashboard-donut-copy"><strong>{todayReading.completed} of {todayReading.assigned}</strong><span>chapter completions</span><small>{todayReading.participants} of {activeMemberCount} members took part</small></div></div> : <div className="dashboard-chart-empty">{!membershipAvailable ? "Group totals are available to group leaders." : !activeMemberCount ? "Group participation will appear when active members are available." : "No group reading is scheduled today."}</div>}
      </article>
      <article className="dashboard-analytics-panel dashboard-analytics-bars-panel">
        <div className="dashboard-analytics-title"><strong>Weekly participation</strong><span>members who read each day</span></div>
        {hasWeeklyHistory ? <div className="dashboard-weekly-bars" role="img" aria-label="Active group members completing a scheduled reading each day this week">{week.map((day) => {
          const dayIndex = week.findIndex((item) => item.date === day.date);
          const label = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`));
          return <div className={`dashboard-weekly-bar${day.readings.length ? " has-reading" : ""}`} key={day.date} title={day.readings.length ? `${label}: ${day.participants} of ${activeMemberCount} members` : `${label}: no reading scheduled`}><span><i style={{ height: `${activeMemberCount ? day.participants / activeMemberCount * 100 : 0}%` }}/></span><small>{label}</small><b>{day.readings.length ? day.participants : "—"}</b></div>;
        })}</div> : <div className="dashboard-chart-empty">{!membershipAvailable ? "Group totals are available to group leaders." : activeMemberCount === 0 ? "Weekly trends will appear when your group has active members." : "More scheduled readings are needed to show a weekly participation trend."}</div>}
      </article>
      <article className="dashboard-analytics-panel dashboard-analytics-milestone">
        <span className="dashboard-milestone-mark" aria-hidden="true">✦</span><div><strong>{!membershipAvailable ? "Group totals are unavailable" : settingsAvailable && consistency.nextMilestone ? `${consistency.daysToMilestone} ${consistency.daysToMilestone === 1 ? "day" : "days"} to ${consistency.nextMilestone}` : settingsAvailable ? "Every reading adds to the story" : "Group milestone report unavailable"}</strong><span>{!membershipAvailable ? "Full group participation totals are available to group leaders." : settingsAvailable ? consistency.nextMilestone ? `Next group milestone · ${consistency.nextMilestone} scheduled reading days` : "Shared group milestones will appear as readings are completed." : "Open Bible Study to review your community’s streak details."}</span></div>
      </article>
    </div>
  </section>;
}

function CakeMark({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 13h16v7H4z" /><path d="M3 13a3 3 0 0 1 6 0 3 3 0 0 1 6 0 3 3 0 0 1 6 0" /><path d="M8 5v3M12 3v4M16 5v3" /><path d="M8 20v-2m4 2v-2m4 2v-2" />
  </svg>;
}

function DashboardCommunityPhoto() {
  return <img
    className="dashboard-community-art"
    src={import.meta.env.BASE_URL + "community/fellowship.webp"}
    alt="Young adults sharing food at an outdoor church fellowship."
    draggable="false"
    width="1440"
    height="2160"
    loading="eager"
    decoding="async"
    fetchPriority="high"
  />;
}

function dashboardPercent(value, total) {
  return total ? Math.max(0, Math.min(100, Math.round(Number(value || 0) / Number(total) * 100))) : 0;
}

function sharedReadingRun(ownSummary, partnerSummary, today) {
  const ownDays = new Map((ownSummary?.calendar || []).map((day) => [day.date, day.status]));
  const partnerDays = new Map((partnerSummary?.calendar || []).map((day) => [day.date, day.status]));
  const qualifies = (date) => ["completed", "protected"].includes(ownDays.get(date))
    && ["completed", "protected"].includes(partnerDays.get(date));
  let cursor = qualifies(today) ? today : qualifies(addReadingDays(today, -1)) ? addReadingDays(today, -1) : null;
  let days = 0;
  while (cursor && qualifies(cursor)) {
    days += 1;
    cursor = addReadingDays(cursor, -1);
  }
  return days;
}

function DashboardPartnerProgress({ userId, groupId, profiles, readings = [], ownSummary, onOpenStudy, onOpenPartnerProgress }) {
  const [partnershipState, setPartnershipState] = useState({ loading: true, unavailable: false, rows: [], invitations: 0, events: [] });

  useEffect(() => {
    if (!userId || !groupId || !supabase) {
      setPartnershipState({ loading: false, unavailable: false, rows: [], invitations: 0, events: [] });
      return undefined;
    }

    let alive = true;
    const load = async (initial = false) => {
      if (initial && alive) setPartnershipState((current) => ({ ...current, loading: true }));
      const { data: partnerships, error: partnershipError } = await supabase
        .from("bible_study_partnerships")
        .select("id,name,status")
        .eq("group_id", groupId)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (partnershipError) {
        setPartnershipState({ loading: false, unavailable: true, rows: [], invitations: 0, events: [] });
        return;
      }
      const partnershipRows = partnerships || [];
      if (!partnershipRows.length) {
        setPartnershipState({ loading: false, unavailable: false, rows: [], invitations: 0, events: [] });
        return;
      }
      const partnershipIds = partnershipRows.map((partnership) => partnership.id);
      const { data: memberships, error: membershipError } = await supabase
        .from("bible_study_partnership_members")
        .select("partnership_id,user_id,status")
        .in("partnership_id", partnershipIds);
      if (!alive) return;
      if (membershipError) {
        setPartnershipState({ loading: false, unavailable: true, rows: [], invitations: 0, events: [] });
        return;
      }
      const membershipRows = memberships || [];
      const invitations = partnershipRows.filter((partnership) => partnership.status === "pending"
        && membershipRows.some((member) => member.partnership_id === partnership.id && member.user_id === userId && member.status === "pending")).length;
      const activeRows = partnershipRows.filter((partnership) => partnership.status === "active")
        .flatMap((partnership) => membershipRows
          .filter((member) => member.partnership_id === partnership.id && member.status === "active" && member.user_id !== userId)
          .map((member) => ({ partnershipId: partnership.id, name: partnership.name, userId: member.user_id })))
        .slice(0, 2);
      const summaries = await Promise.all(activeRows.map(async (partner) => {
        const { data, error } = await supabase.rpc("bible_partner_member_summary", {
          target_partnership: partner.partnershipId,
          target_member: partner.userId
        });
        return { ...partner, summary: error ? null : data };
      }));
      const activePartnershipIds = activeRows.map((partner) => partner.partnershipId);
      const { data: events, error: eventsError } = activePartnershipIds.length
        ? await supabase
          .from("bible_study_partner_events")
          .select("id,partnership_id,actor_id,event_type,reading_id,metadata,created_at")
          .in("partnership_id", activePartnershipIds)
          .order("created_at", { ascending: false })
          .limit(12)
        : { data: [], error: null };
      if (!alive) return;
      setPartnershipState({ loading: false, unavailable: summaries.length > 0 && summaries.every((row) => !row.summary), rows: summaries, invitations, events: eventsError ? null : events || [] });
    };

    void load(true);
    const channel = supabase.channel(`dashboard-partner-progress:${groupId}:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bible_study_partnerships" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bible_study_partnership_members" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bible_study_partner_events" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_bible_study_readings", filter: `user_id=eq.${userId}` }, () => void load());
    channel.subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId, userId]);

  const today = ownSummary?.today || getLocalReadingDate();
  const readingById = new Map(readings.map((reading) => [reading.id, reading]));
  return <section className="dashboard-partner-progress" aria-labelledby="dashboard-partner-progress-title">
    <div className="dashboard-partner-progress-heading">
      <div><span className="dashboard-journey-kicker">GROWING SIDE BY SIDE</span><h3 id="dashboard-partner-progress-title">Your streak partner</h3><p>Encouragement and progress shared through your Bible Study partnership.</p></div>
      <button type="button" className="text-button" onClick={onOpenPartnerProgress || onOpenStudy}>View partner progress <span aria-hidden="true">→</span></button>
    </div>
    {partnershipState.loading ? <div className="dashboard-partner-loading" role="status"><span /> Finding your reading partners…</div>
      : partnershipState.rows.length ? <div className="dashboard-partner-cards">{partnershipState.rows.slice(0, 2).map((partner) => {
        const person = profiles.find((profile) => profile.id === partner.userId);
        const partnerSummary = partner.summary;
        const name = person?.full_name || "Your partner";
        const sharedDays = partnerSummary && ownSummary ? sharedReadingRun(ownSummary, partnerSummary, today) : null;
        const yourStreak = ownSummary ? Number(ownSummary.current_streak || 0) : null;
        const partnerStreak = Number(partnerSummary?.current_streak || 0);
        const weekPercent = dashboardPercent(partnerSummary?.weekly_completed, partnerSummary?.weekly_elapsed);
        const monthPercent = dashboardPercent(partnerSummary?.monthly_completed, partnerSummary?.monthly_elapsed);
      const ownToday = ownSummary?.calendar?.find((day) => day.date === today);
      const partnerToday = partnerSummary?.calendar?.find((day) => day.date === today);
        const readingStatus = (day, summary) => !summary
          ? "Progress unavailable"
          : !day || !Number(day.assigned_count || 0)
        ? "No reading scheduled"
        : day.status === "completed"
          ? "Completed today"
          : day.status === "in_progress"
            ? "In progress"
            : "Not completed yet";
      const latestActivity = [userId, partner.userId].map((memberId) => {
        const event = (partnershipState.events || []).find((item) => item.partnership_id === partner.partnershipId && item.actor_id === memberId);
        if (!event) return null;
        const eventReading = event.reading_id ? readingById.get(event.reading_id) : null;
        const activityText = {
          group_reading_completed: "Completed Bible reading",
          personal_reading_completed: "Completed a personal Bible reading",
          shared_day_completed: "Completed the reading together",
          encouragement_sent: "Shared a word of encouragement",
          milestone_reached: `Reached a ${event.metadata?.milestone || "reading"} day milestone`,
          challenge_completed: "Completed a reading challenge"
        }[event.event_type] || "Shared a Bible Study update";
        return { memberId, event, activityText, eventReading };
      }).filter(Boolean).sort((left, right) => new Date(right.event.created_at) - new Date(left.event.created_at));
      const selfProfile = profiles.find((profile) => profile.id === userId);
        return <article className="dashboard-partner-card" key={`${partner.partnershipId}-${partner.userId}`}>
          <div className="dashboard-partner-card-heading"><MemberInitials member={person || { full_name: name }} className="dashboard-partner-person-identity"/><div><small>{partner.name || "Reading partnership"}</small><strong>{name}</strong></div><span className="dashboard-partner-together"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.2 2.5c.7 3.2-.6 4.8-2.1 6.4-1.2 1.3-2.4 2.5-2.4 4.8a4.3 4.3 0 0 0 8.6 0c0-1.6-.6-2.9-1.9-4.3.1 2-.8 2.7-1.8 3.1.4-3.8-.5-6.6-.4-10Z"/><path d="M5.4 13.5a6.6 6.6 0 1 0 13.2 0"/></svg><b>{sharedDays == null ? "—" : sharedDays}</b><span>{sharedDays == null ? "shared streak" : `shared day${sharedDays === 1 ? "" : "s"}`}</span></span></div>
          {partnerSummary ? <>
            <div className="dashboard-partner-comparison"><div><span className="dashboard-partner-comparison-person"><MemberInitials member={selfProfile || { full_name: "You" }} className="dashboard-partner-person-identity"/><small>{selfProfile?.full_name || "You"} · CURRENT / BEST</small></span><strong>{yourStreak == null ? "—" : yourStreak} <span>/ {ownSummary ? `${Number(ownSummary.longest_streak || 0)} days` : "unavailable"}</span></strong></div><span className="dashboard-partner-connector" aria-hidden="true">↔</span><div><span className="dashboard-partner-comparison-person"><MemberInitials member={person || { full_name: name }} className="dashboard-partner-person-identity"/><small>{name} · CURRENT / BEST</small></span><strong>{partnerStreak} <span>/ {Number(partnerSummary.longest_streak || 0)} days</span></strong></div></div>
            <div className="dashboard-partner-today-statuses" aria-label="Today's Bible reading status"><span className={ownToday?.status === "completed" ? "is-complete" : ownToday?.status === "in_progress" ? "is-progress" : ""}><small>You</small><b>{readingStatus(ownToday, ownSummary)}</b></span><span className={partnerToday?.status === "completed" ? "is-complete" : partnerToday?.status === "in_progress" ? "is-progress" : ""}><small>{name}</small><b>{readingStatus(partnerToday, partnerSummary)}</b></span></div>
            <div className="dashboard-partner-recent-activity"><div className="dashboard-partner-activity-heading"><strong>Recent partner activity</strong><span>Latest reading and milestones</span></div>{latestActivity.length ? latestActivity.slice(0, 2).map(({ memberId, event, activityText, eventReading }) => {
              const activityPerson = memberId === userId ? selfProfile || { full_name: "You" } : person || { full_name: name };
              const details = eventReading ? `${eventReading.book} ${eventReading.chapter}` : "";
              return <div className="dashboard-partner-activity-row" key={event.id}><MemberInitials member={activityPerson} className="dashboard-partner-person-identity dashboard-partner-activity-identity"/><span><strong title={activityPerson.full_name || name}>{activityPerson.full_name || name}</strong><small>{activityText}{details ? ` · ${details}` : ""}</small></span><time dateTime={event.created_at}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.created_at))}</time></div>;
            }) : <span className="dashboard-partner-no-activity">{partnershipState.events === null ? "Recent partner activity is unavailable right now." : "No recent partner activity is recorded yet."}</span>}</div>
            <div className="dashboard-partner-periods"><div><span>This week <b>{Number(ownSummary?.weekly_completed || 0)} / {Number(ownSummary?.weekly_elapsed || 0)} days</b></span><i><em style={{ width: `${dashboardPercent(ownSummary?.weekly_completed, ownSummary?.weekly_elapsed)}%` }}/></i><i><em style={{ width: `${dashboardPercent(partnerSummary.weekly_completed, partnerSummary.weekly_elapsed)}%` }}/></i><small>{name}: {Number(partnerSummary.weekly_completed || 0)} / {Number(partnerSummary.weekly_elapsed || 0)} days</small></div><div><span>This month <b>{Number(ownSummary?.monthly_completed || 0)} / {Number(ownSummary?.monthly_elapsed || 0)} days</b></span><i><em style={{ width: `${dashboardPercent(ownSummary?.monthly_completed, ownSummary?.monthly_elapsed)}%` }}/></i><i><em style={{ width: `${monthPercent}%` }}/></i><small>{name}: {Number(partnerSummary.monthly_completed || 0)} / {Number(partnerSummary.monthly_elapsed || 0)} days</small></div></div>
          </> : <p className="dashboard-partner-report-unavailable">Partner progress is unavailable right now. Open Bible Study to reconnect.</p>}
        </article>;
      })}</div>
      : <div className="dashboard-partner-empty"><span className="dashboard-partner-empty-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 20v-8m0 3c-4 0-7-2.5-7-6 4 0 7 2.5 7 6Zm0-3c0-4 3-7 7-7 0 4-3 7-7 7Z"/></svg></span><div><strong>{partnershipState.invitations ? `${partnershipState.invitations} partner invitation${partnershipState.invitations === 1 ? "" : "s"} waiting` : partnershipState.unavailable ? "Partner reports are unavailable right now." : "A good rhythm grows stronger together."}</strong><p>{partnershipState.invitations ? "Open Bible Study to accept an invitation and see your shared progress." : "Connect with a Bible Study partner to compare current streaks, weekly progress and monthly consistency."}</p></div><button type="button" className="secondary-button" onClick={onOpenPartnerProgress || onOpenStudy}>{partnershipState.invitations ? "View invitation" : "Find a partner"}</button></div>}
  </section>;
}

export function DashboardPersonalJourney({ summary, streakAvailable, planStats, planAvailable, achievements = [], userId, groupId, profiles = [], readings = [], onOpenStudy, onOpenPartnerProgress, showPartnerProgress = true }) {
  const today = summary?.today || getLocalReadingDate();
  const weekStart = getReadingWeekStart(today);
  const calendar = new Map((summary?.calendar || []).map((day) => [day.date, day]));
  const weekDays = Array.from({ length: 7 }, (_, index) => addReadingDays(weekStart, index));
  const current = Number(summary?.current_streak || 0);
  const longest = Number(summary?.longest_streak || 0);
  const nextMilestone = Number(summary?.next_milestone || 0);
  const streakProgress = nextMilestone ? Math.min(100, Math.round(current / nextMilestone * 100)) : current ? 100 : 0;
  const latestAchievement = [...achievements].sort((left, right) => Number(right.milestone_days) - Number(left.milestone_days))[0];
  const weekPercent = dashboardPercent(summary?.weekly_completed, summary?.weekly_elapsed);
  const monthPercent = dashboardPercent(summary?.monthly_completed, summary?.monthly_elapsed);
  const totalStudyDays = (summary?.calendar || []).filter((day) => Number(day.completed_count || 0) > 0).length;
  const weekdayLabel = (date) => new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  return <section className="dashboard-personal-journey" aria-labelledby="dashboard-personal-journey-title">
    <div className="dashboard-personal-journey-heading"><div><span className="dashboard-journey-kicker">PERSONAL SPIRITUAL PROGRESS</span><h2 id="dashboard-personal-journey-title">Your journey in the Word</h2><p>Small, faithful steps are building a lasting rhythm.</p></div><button type="button" className="primary-button" onClick={onOpenStudy}>Continue Bible Study <span aria-hidden="true">→</span></button></div>
    <div className="dashboard-journey-overview">
      <article className="dashboard-journey-streak-card">
        <div className="dashboard-journey-ring" style={{ "--journey-progress": `${streakProgress}%`, "--journey-target": `${streakProgress}%` }} role="img" aria-label={`${current} day current Bible reading streak`}><span><strong>{streakAvailable ? <DashboardAnimatedNumber value={current}/> : "—"}</strong><small>day streak</small></span></div>
        <div className="dashboard-journey-streak-copy"><small>YOUR CURRENT RHYTHM</small><h3>{streakAvailable ? `${current} ${current === 1 ? "day" : "days"} in the Word` : "Streak report unavailable"}</h3><p>{streakAvailable ? (summary?.today_complete ? "Today’s reading is complete. Keep carrying the light." : summary?.today_status === "in_progress" ? "You have started today’s reading. A little more will complete your day." : "There is still time to make space for Scripture today.") : "Your personal reading plan is still available below."}</p><span className="dashboard-journey-next-mark">{nextMilestone ? `${Math.max(0, Number(summary?.days_to_milestone || 0))} days to your next milestone` : latestAchievement ? `Latest milestone · ${latestAchievement.milestone_days} days` : "Every journey starts with one reading"}</span></div>
      </article>
      <div className="dashboard-journey-metrics">
        <article><small>Longest streak</small><strong>{streakAvailable ? <DashboardAnimatedNumber value={longest}/> : "—"}</strong><span>days so far</span></article>
        <article><small>Chapters completed</small><strong>{streakAvailable ? <DashboardAnimatedNumber value={Number(summary?.completed_chapters || 0)}/> : planAvailable ? <DashboardAnimatedNumber value={planStats.completedCount}/> : "—"}</strong><span>personal readings</span></article>
        <article><small>Total study days</small><strong>{streakAvailable ? <DashboardAnimatedNumber value={totalStudyDays}/> : "—"}</strong><span>days with completed readings</span></article>
        <article><small>This week</small><strong>{streakAvailable ? `${Number(summary?.weekly_completed || 0)} / ${Number(summary?.weekly_elapsed || 0)}` : "—"}</strong><span>{streakAvailable ? `${weekPercent}% consistency` : "Weekly report"}</span></article>
        <article><small>This month</small><strong>{streakAvailable ? `${Number(summary?.monthly_completed || 0)} / ${Number(summary?.monthly_elapsed || 0)}` : "—"}</strong><span>{streakAvailable ? `${monthPercent}% consistency` : "Monthly report"}</span></article>
      </div>
    </div>
    <div className="dashboard-journey-lower">
      <div className="dashboard-journey-activity">
        <div className="dashboard-journey-subheading"><div><small>YOUR READING WEEK</small><strong>One day at a time</strong></div><span>{weekPercent}% this week</span></div>
        <div className="dashboard-journey-week" aria-label="Your Bible reading activity this week">{weekDays.map((date) => {
          const day = calendar.get(date);
          const status = day?.status || (date > today ? "future" : "untracked");
          return <div className={`dashboard-journey-day is-${status}`} key={date} title={`${date} · ${status}`}><small>{weekdayLabel(date)}</small><strong>{date.slice(-2)}</strong><span aria-hidden="true">{status === "completed" ? "✓" : status === "protected" ? "◇" : status === "in_progress" ? "·" : ""}</span></div>;
        })}</div>
        <div className="dashboard-journey-plan-row"><span><strong>{planAvailable ? `${planStats.completionPercent}%` : "—"}</strong> personal plan complete</span><span>{planAvailable && planStats.nextReading ? `Next · ${planStats.nextReading.book} ${planStats.nextReading.chapter}` : planAvailable && planStats.totalCount ? "Your reading plan is complete" : "Set up a personal reading plan"}</span></div>
        <div className="dashboard-journey-plan-track" role="progressbar" aria-label="Personal reading plan completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={planAvailable ? planStats.completionPercent : 0}><i style={{ width: `${planAvailable ? planStats.completionPercent : 0}%` }}/></div>
        {latestAchievement ? <p className="dashboard-journey-achievement"><span aria-hidden="true">✦</span> Latest milestone <strong>{latestAchievement.milestone_days} reading days</strong></p> : null}
      </div>
      {showPartnerProgress
        ? <DashboardPartnerProgress userId={userId} groupId={groupId} profiles={profiles} readings={readings} ownSummary={summary} onOpenStudy={onOpenStudy} onOpenPartnerProgress={onOpenPartnerProgress}/>
        : <div className="dashboard-partner-report-link"><div><span className="dashboard-journey-kicker">PARTNER COMPARISON</span><strong>Grow alongside your reading partner</strong><p>Your current streak, longest run, weekly progress and monthly report are included in the Bible Study analytics below.</p></div><button type="button" className="secondary-button" onClick={onOpenStudy}>View partner progress <span aria-hidden="true">→</span></button></div>}
    </div>
  </section>;
}

function BirthdayIllustration() {
  return <svg className="birthday-illustration" viewBox="0 0 430 310" fill="none" aria-hidden="true">
    <circle cx="225" cy="167" r="124" fill="#F4EDF8" />
    <path d="M75 270c8-68 42-104 94-104 52 0 82 39 87 104H75Z" fill="#74469b" />
    <circle cx="129" cy="166" r="34" fill="#A8664C" />
    <path d="M94 163c1-28 17-47 41-47 26 0 40 20 40 46-13-3-24-14-30-29-13 18-30 27-51 30Z" fill="#31252C" />
    <path d="M158 183c18-13 41-13 60 0l22 88h-99l17-88Z" fill="#E7B16E" />
    <circle cx="240" cy="159" r="36" fill="#D99970" />
    <path d="M204 158c0-28 17-47 40-47 24 0 39 17 40 44-12-5-23-15-29-30-12 19-28 29-51 33Z" fill="#29262D" />
    <path d="M204 197c22-13 46-13 69 0 16 13 25 38 28 73H185c1-33 7-57 19-73Z" fill="#8B72B6" />
    <path d="M281 268c8-42 32-67 69-72l18 72h-87Z" fill="#80BCA9" />
    <circle cx="331" cy="157" r="27" fill="#87513E" />
    <path d="M304 157c0-23 11-38 29-38 20 0 29 16 29 38-11-4-18-12-23-24-8 14-19 22-35 24Z" fill="#2C242A" />
    <path d="M64 244c-17-43-15-70 5-81 17-9 31 2 35 25 5 26-8 45-40 56Zm304-42c-18-30-19-54-3-67 14-11 28-4 33 14 6 21-4 39-30 53Z" fill="#F0C47E" />
    <path d="M68 242c7 4 12 12 15 24m281-61c-7 8-10 17-10 28" stroke="#B8758E" strokeWidth="2" strokeLinecap="round" />
    <rect x="270" y="230" width="77" height="35" rx="8" fill="#F4D6AE" />
    <path d="M265 232c0-6 6-11 13-11h62c7 0 13 5 13 11v6H265v-6Z" fill="#D98795" />
    <path d="M309 221v-19m0 0c-8-7-7-13-3-16 7 4 9 9 3 16Zm0 0c4-8 9-9 13-5-2 7-6 9-13 5Z" fill="#E7B16E" stroke="#E7B16E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M278 252h60" stroke="#D7A779" strokeWidth="2" strokeLinecap="round" />
    <path d="M117 80c-9-12-11-25-4-39m-10 51c-18 4-30-1-37-16m274-10c14-9 28-9 40 0m-27 16c12 3 19 11 21 23" stroke="#CF8EAA" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M184 75h7m92 42 4-5m-115 58 5 3m171 22 6 3m-237 5 5-3" stroke="#7B80D3" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

function BirthdayIdentity({ member, profiles = [] }) {
  const profile = profiles.find((candidate) => candidate.id === member?.user_id);
  return <MemberInitials member={{ ...profile, ...member }} className="dashboard-birthday-identity" />;
}

export function DashboardAnimatedNumber({ value, duration = 720 }) {
  const target = Number(value);
  const [display, setDisplay] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const from = previousValue.current;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || target === from) {
      setDisplay(target);
      previousValue.current = target;
      return undefined;
    }
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
      else previousValue.current = target;
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  return new Intl.NumberFormat().format(display);
}

const companionEncouragements = [
  "One faithful step at a time.",
  "Keep making room for the Word.",
  "Your light has a place here."
];

export function DashboardCompanion() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % companionEncouragements.length);
    }, 26000);
    return () => window.clearInterval(timer);
  }, []);

  return <aside className="dashboard-companion" aria-label="Beacon, your dashboard companion">
    <div className="dashboard-companion-art" aria-hidden="true">
      <svg viewBox="0 0 360 310" fill="none" role="presentation">
        <defs>
          <radialGradient id="beacon-glow" cx="0" cy="0" r="1" gradientTransform="matrix(0 132 -132 0 180 150)" gradientUnits="userSpaceOnUse"><stop stopColor="#F3D994" stopOpacity=".44"/><stop offset="1" stopColor="#F3D994" stopOpacity="0"/></radialGradient>
          <linearGradient id="beacon-face" x1="116" x2="224" y1="76" y2="188" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF5D6"/><stop offset="1" stopColor="#EBC978"/></linearGradient>
          <linearGradient id="beacon-scarf" x1="132" x2="232" y1="195" y2="264" gradientUnits="userSpaceOnUse"><stop stopColor="#8462A2"/><stop offset="1" stopColor="#51306F"/></linearGradient>
        </defs>
        <circle cx="180" cy="151" r="130" fill="url(#beacon-glow)"/>
        <circle cx="180" cy="151" r="105" stroke="currentColor" strokeOpacity=".11"/>
        <g className="dashboard-companion-character">
          <path d="m180 26 8 19m47-8-2 20m46 6-11 16m36 34-17 9m27 45-20 2m8 49-19-6m-20 43-13-15m-42 38-5-20m-49 15 4-20m-48-7 12-16m-40-30 18-8m-23-48 20-1m-8-49 18 7m19-43 12 15" stroke="#B58A45" strokeWidth="5" strokeLinecap="round" opacity=".78"/>
          <path d="M127 203c-22 5-35 19-42 40" stroke="#76518C" strokeWidth="12" strokeLinecap="round"/>
          <path d="M83 243c-8 6-13 13-14 21" stroke="#E5BD69" strokeWidth="9" strokeLinecap="round"/>
          <g className="dashboard-companion-wave"><path d="M232 204c19-4 33-17 41-37" stroke="#76518C" strokeWidth="12" strokeLinecap="round"/><path d="M266 165c7-5 12-12 15-20" stroke="#E5BD69" strokeWidth="9" strokeLinecap="round"/></g>
          <path d="m147 246-5 25m69-26 7 25" stroke="#76518C" strokeWidth="11" strokeLinecap="round"/>
          <path d="M130 269h22m58 0h22" stroke="#3D2C4D" strokeWidth="8" strokeLinecap="round"/>
          <path d="M128 203c13-15 33-22 53-22 22 0 43 8 56 23l-6 45c-18 15-78 16-98 0l-5-46Z" fill="url(#beacon-scarf)"/>
          <path d="M150 201c9 14 20 22 32 22 11 0 22-8 31-22" stroke="#D7B66F" strokeWidth="5" strokeLinecap="round"/>
          <path d="M134 128c0-31 21-55 48-55s48 24 48 55v22c0 31-21 53-48 53s-48-22-48-53v-22Z" fill="url(#beacon-face)" stroke="#C19B50" strokeWidth="2"/>
          <path d="M151 137v8m62-8v8" stroke="#44354A" strokeWidth="7" strokeLinecap="round" className="dashboard-companion-eyes"/>
          <path d="M162 163c7 8 14 12 20 12s13-4 20-12" stroke="#76518C" strokeWidth="4" strokeLinecap="round"/>
          <ellipse cx="143" cy="157" rx="8" ry="4" fill="#D98984" fillOpacity=".54"/>
          <ellipse cx="221" cy="157" rx="8" ry="4" fill="#D98984" fillOpacity=".54"/>
          <path d="m118 61 9 8m107-8-9 8" stroke="#76518C" strokeWidth="4" strokeLinecap="round"/>
          <circle cx="116" cy="58" r="7" fill="#E6C472"/><circle cx="234" cy="58" r="7" fill="#E6C472"/>
          <path d="m225 198 8 7-8 7" stroke="#E7D4A1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
        <path d="M97 273c20 8 43 12 68 12 28 0 53-5 77-15" stroke="#88B7A2" strokeWidth="4" strokeLinecap="round" opacity=".7"/>
      </svg>
    </div>
    <div className="dashboard-companion-note">
      <span><i aria-hidden="true"/> BEACON · YOUR COMPANION</span>
      <strong aria-live="off" key={messageIndex}>{companionEncouragements[messageIndex]}</strong>
    </div>
  </aside>;
}

export function DashboardWelcomeHero({ dateLabel, greeting, firstName, displayName, message, onContinueStudy, onExploreEvents, onNotifications, unreadCount, isBirthday, onOpenBirthday, primaryLabel = "Continue Bible Study", secondaryLabel = "Explore events" }) {
  const headingName = String(displayName || firstName || "Friend").trim() || "Friend";
  return <section className="dashboard-welcome-card dashboard-welcome-card--editorial" aria-labelledby="dashboard-welcome-heading">
    <div className="dashboard-hero-copy">
      <div className="dashboard-hero-meta"><p className="dashboard-hero-eyebrow">{greeting}</p><time className="dashboard-date-chip">{dateLabel}</time></div>
      <h1 id="dashboard-welcome-heading"><span className="dashboard-welcome-name">{headingName}</span></h1>
      <p className="dashboard-hero-message">{message}</p>
      <p className="dashboard-hero-verse"><span>MATTHEW 5:14</span><span aria-hidden="true">·</span><span>“Ye are the light of the world.”</span></p>
      <div className="dashboard-hero-actions">
        <button type="button" className="primary-button" onClick={onContinueStudy}>{primaryLabel} <span aria-hidden="true">→</span></button>
        <button type="button" className="secondary-button" onClick={onExploreEvents}>{secondaryLabel}</button>
        <button type="button" className="ghost-button dashboard-notifications-button" onClick={onNotifications}>
          <span className="dashboard-hero-notification-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6.5 16.5h11l-1.2-1.4a2.8 2.8 0 0 1-.8-1.9v-2.1a3.5 3.5 0 0 0-7 0v2.1c0 .7-.3 1.4-.8 1.9L6.5 16.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg></span>
          Notifications {unreadCount ? <span className="notification-count">{unreadCount}</span> : null}
        </button>
      </div>
      {isBirthday ? <button type="button" className="dashboard-birthday-indicator" onClick={onOpenBirthday}><CakeMark size={16} /> Your birthday card <span aria-hidden="true">↗</span></button> : null}
    </div>
    <div className="dashboard-hero-art-wrap"><figure className="dashboard-community-photo"><DashboardCommunityPhoto /></figure></div>
  </section>;
}
export function DashboardBirthdays({ birthdays, loading, onCelebrate, currentUserId, unavailable = false, profiles = [] }) {
  const [expanded, setExpanded] = useState(false);
  const hasBirthdays = birthdays.length > 0;
  const visibleBirthdays = expanded ? birthdays : birthdays.slice(0, 6);
  return <section className="dashboard-birthday-board" aria-labelledby="dashboard-birthday-title">
    <div className="dashboard-birthday-board-heading">
      <div><span className="dashboard-section-kicker"><CakeMark size={15} /> The people we celebrate</span><h2 id="dashboard-birthday-title">Birthdays around the community</h2><p>Small moments of celebration help us show up for one another.</p></div>
      {hasBirthdays ? <span className="dashboard-birthday-count">Next 30 days <strong>{birthdays.length}</strong></span> : null}
    </div>
    {loading ? <div className="dashboard-birthday-loading" role="status"><span /><span /><span />Loading upcoming birthdays</div> : hasBirthdays ? <>
      <div className="dashboard-birthday-list">
      {visibleBirthdays.map((member) => {
        const isToday = Number(member.days_until) === 0;
        const isSelf = member.user_id === currentUserId;
        return <article className={`dashboard-birthday-card${isToday ? " is-today" : ""}`} key={member.user_id}>
          <BirthdayIdentity member={member} profiles={profiles} />
          <div className="dashboard-birthday-member-copy"><strong>{member.full_name || "Community member"}</strong><span>{isToday ? "Celebrating today" : `In ${member.days_until} day${Number(member.days_until) === 1 ? "" : "s"}`} · {member.display_date || "Coming up"}</span></div>
          {isToday ? <span className="dashboard-birthday-today-badge">Today</span> : null}
          {!isSelf && member.user_id ? <button type="button" className="dashboard-birthday-celebrate" onClick={() => onCelebrate(member)} aria-label={`Send a birthday message to ${member.full_name || "this member"}`}><span aria-hidden="true">↗</span> Celebrate</button> : null}
        </article>;
      })}
      </div>
      {birthdays.length > 6 ? <button type="button" className="dashboard-birthday-expand" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show fewer" : `See all ${birthdays.length} birthdays`} <span aria-hidden="true">{expanded ? "↑" : "↓"}</span></button> : null}
    </> : <div className="dashboard-birthday-empty">
      <span className="dashboard-birthday-empty-mark"><CakeMark size={20} /></span>
      <div><strong>{unavailable ? "Your community birthday board is getting ready." : "No birthdays in the next 30 days."}</strong><p>{unavailable ? "Your personal welcome is ready. Upcoming community birthdays will appear here when available." : "There is always a reason to encourage someone. Check back soon."}</p></div>
    </div>}
  </section>;
}

export function BirthdayCelebration({ firstName, fullName, dateLabel, reopened = false, onDismiss }) {
  const dismissRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    dismissRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onDismiss();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])") || [])];
        if (!focusable.length) {
          event.preventDefault();
          dialogRef.current?.focus();
        } else if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);

  return <div ref={dialogRef} className={`birthday-experience${reopened ? " is-reopened" : ""}`} role="dialog" aria-modal="true" aria-labelledby="birthday-experience-title" tabIndex={-1}>
    <div className="birthday-experience-backdrop" aria-hidden="true" />
    {!reopened ? <div className="birthday-confetti" aria-hidden="true">{confettiPieces.map((piece) => <span key={piece.id} style={{ "--confetti-left": piece.left, "--confetti-delay": piece.delay, "--confetti-duration": piece.duration, "--confetti-color": piece.color, "--confetti-rotate": piece.rotate }} />)}</div> : null}
    <div className="birthday-experience-content">
      <div className="birthday-experience-topline"><span><CakeMark size={16} /> YOUR DAY, YOUR LIGHT</span><span>{dateLabel}</span></div>
      <div className="birthday-experience-layout">
        <div className="birthday-experience-copy">
          <p className="birthday-experience-kicker">A new chapter begins</p>
          <h1 id="birthday-experience-title">HAPPY BIRTHDAY,<br /><span>{firstName}!</span></h1>
          <p className="birthday-experience-message">Today we celebrate you. May this new chapter be filled with God’s grace, wisdom, purpose and beautiful moments.</p>
          <div className="birthday-personal-card"><span className="birthday-personal-card-mark"><CakeMark size={20} /></span><div><small>A blessing for {fullName || firstName}</small><strong>Keep growing. Keep becoming. Keep carrying the light.</strong></div><span className="birthday-personal-card-spark" aria-hidden="true">✦</span></div>
          <button ref={dismissRef} type="button" className="birthday-continue-button" onClick={onDismiss}>Continue to your dashboard <span aria-hidden="true">→</span></button>
          <p className="birthday-experience-footnote">The City on a Hill is grateful for you.</p>
        </div>
        <div className="birthday-experience-art-panel"><span className="birthday-art-caption">Life is better when we celebrate together</span><BirthdayIllustration /></div>
      </div>
    </div>
  </div>;
}
