import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addReadingDays, DEFAULT_BIBLE_TIMEZONE, getReadingDateInTimezone, getReadingWeekStart } from "../lib/personalBibleStudy.js";
import { MemberInitials } from "./MemberInitials.jsx";
import "../styles/admin-bible-streak-report.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MILESTONES = [3, 7, 14, 21, 30, 60, 90, 100, 180, 365];

function rangeFor(mode, today, customStart, customEnd) {
  if (mode === "week") return { start: getReadingWeekStart(today), end: today };
  if (mode === "month") return { start: `${today.slice(0, 7)}-01`, end: today };
  return { start: customStart || today, end: customEnd || today };
}

function percentage(value, total) {
  return total ? Math.min(100, Math.round(Number(value || 0) / Number(total) * 100)) : 0;
}

function PersonProgress({ person, label }) {
  const current = Number(person?.current_streak || 0);
  const weekPct = percentage(person?.weekly_completed, person?.weekly_elapsed);
  const monthPct = percentage(person?.monthly_completed, person?.monthly_elapsed);
  return <article className="admin-streak-person">
    <div className="admin-streak-person-heading"><MemberInitials member={person || { full_name: label }} className="admin-streak-person-identity"/><div><small>{label}</small><strong>{person?.full_name || "Member"}</strong></div></div>
    <div className="admin-streak-person-primary"><span className="admin-streak-ring" style={{ "--streak-progress": `${Math.min(100, current / Math.max(Number(person?.longest_streak || 0), current, 1) * 100)}%` }} role="img" aria-label={`${current} day current streak`}><span>{current}<small>d</small></span></span><div><strong>{current} day{current === 1 ? "" : "s"}</strong><span>Current streak</span><small>Longest {person?.longest_streak || 0} days</small></div></div>
    <div className="admin-streak-person-bars"><span><small>This week</small><b>{weekPct}%</b><i><em style={{ width: `${weekPct}%` }}/></i></span><span><small>This month</small><b>{monthPct}%</b><i><em style={{ width: `${monthPct}%` }}/></i></span></div>
    <div className="admin-streak-person-foot"><span>{Number(person?.completed_chapters || 0)} chapters</span><span>{Number(person?.range_missed_days || 0)} missed days in range</span></div>
  </article>;
}

export function AdminBibleStreakReport({ user, groupId, isSuperAdmin = false, profiles = [] }) {
  const [timeZone, setTimeZone] = useState(DEFAULT_BIBLE_TIMEZONE);
  const [today, setToday] = useState(() => getReadingDateInTimezone(new Date(), DEFAULT_BIBLE_TIMEZONE));
  const [rangeMode, setRangeMode] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => rangeFor(rangeMode, today, customStart, customEnd), [rangeMode, today, customStart, customEnd]);

  useEffect(() => {
    let alive = true;
    supabase.from("bible_streak_settings").select("application_timezone").eq("id", 1).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const nextZone = data?.application_timezone || DEFAULT_BIBLE_TIMEZONE;
      const nextToday = getReadingDateInTimezone(new Date(), nextZone);
      setTimeZone(nextZone);
      setToday(nextToday);
      setCustomEnd((current) => current || nextToday);
      setCustomStart((current) => current || `${nextToday.slice(0, 7)}-01`);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!isSuperAdmin && !groupId) {
      setLoading(false);
      setError("Choose a cell group to view its Bible Study report.");
      return () => { alive = false; };
    }
    if (range.start > range.end) {
      setLoading(false);
      setError("Choose a start date on or before the end date.");
      return () => { alive = false; };
    }
    if ((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86400000 > 366) {
      setLoading(false);
      setError("Choose a date range of no more than 367 days.");
      return () => { alive = false; };
    }
    setLoading(true);
    setError("");
    supabase.rpc("bible_streak_admin_report", {
      p_group_id: isSuperAdmin ? null : groupId,
      p_range_start: range.start,
      p_range_end: range.end
    }).then(({ data, error: reportError }) => {
      if (!alive) return;
      setReport(data || null);
      setError(reportError ? (reportError.code === "PGRST202" || reportError.code === "42883"
        ? "The streak reporting update needs to be applied before this report is available."
        : reportError.code === "42501"
          ? "Your account does not have permission to view this report."
          : reportError.message || "The Bible Study report could not be loaded right now.") : "");
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setError("The Bible Study report could not be loaded right now.");
      setLoading(false);
    });
    return () => { alive = false; };
  }, [groupId, isSuperAdmin, range.end, range.start]);

  const reportMembers = report?.members || [];
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const members = useMemo(() => reportMembers.map((member) => ({
    ...member,
    profile_photo_path: member.profile_photo_path || profileById.get(member.user_id)?.profile_photo_path || null
  })), [profileById, reportMembers]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const currentMember = memberById.get(user?.id);
  const partnerCircles = (report?.partnerships || [])
    .filter((circle) => circle.members?.some((member) => member.user_id === user?.id))
    .map((circle) => ({
      ...circle,
      members: (circle.members || []).map((member) => ({
        ...member,
        profile_photo_path: member.profile_photo_path || profileById.get(member.user_id)?.profile_photo_path || null
      }))
    }));
  const groupStats = useMemo(() => {
    const average = members.length ? Math.round(members.reduce((sum, member) => sum + percentage(member.range_completed_days, member.range_elapsed_days), 0) / members.length) : 0;
    return {
      activeStreaks: members.filter((member) => Number(member.current_streak) > 0).length,
      longestActiveMember: members.reduce((longest, member) => Number(member.current_streak || 0) > Number(longest?.current_streak || 0) ? member : longest, null),
      averageConsistency: average,
      chapters: members.reduce((sum, member) => sum + Number(member.completed_chapters || 0), 0),
      missedDays: members.reduce((sum, member) => sum + Number(member.range_missed_days || 0), 0)
    };
  }, [members]);
  const rankedMembers = useMemo(() => [...members].sort((left, right) =>
    percentage(right.range_completed_days, right.range_elapsed_days) - percentage(left.range_completed_days, left.range_elapsed_days)
    || Number(right.current_streak || 0) - Number(left.current_streak || 0)
    || Number(right.completed_chapters || 0) - Number(left.completed_chapters || 0)
  ), [members]);
  const activity = (report?.daily_activity || []).slice(-31);
  const sharedActivity = (report?.group_daily_activity || []).slice(-31);
  const maxReaders = Math.max(1, ...activity.map((day) => Number(day.active_readers || 0)));
  const maxSharedReaders = Math.max(1, ...sharedActivity.map((day) => Number(day.active_readers || 0)));
  const weekStart = getReadingWeekStart(today);
  const weekDates = Array.from({ length: 7 }, (_, index) => addReadingDays(weekStart, index));
  const ownHistory = new Map((currentMember?.calendar || []).map((day) => [day.date, day]));
  const monthHistory = new Map((currentMember?.month_calendar || []).map((day) => [day.date, day]));
  const [monthYear, monthNumber] = today.split("-").map(Number);
  const monthDays = new Date(Date.UTC(monthYear, monthNumber, 0)).getUTCDate();
  const monthLeadingDays = (new Date(Date.UTC(monthYear, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const monthCells = Array.from({ length: monthLeadingDays + monthDays }, (_, index) => index < monthLeadingDays ? null : `${today.slice(0, 7)}-${String(index - monthLeadingDays + 1).padStart(2, "0")}`);

  return <section className="admin-bible-streak-report" aria-labelledby="admin-bible-streak-title">
    <header className="admin-bible-streak-heading"><div><p className="admin-streak-kicker">{isSuperAdmin ? "ORGANIZATION-WIDE VIEW" : "CELL GROUP REPORT"}</p><h2 id="admin-bible-streak-title">Bible Study consistency</h2><p>{isSuperAdmin ? "Review member progress across the organization using completed personal readings." : "Your personal rhythm, partner comparison, and group participation."}</p></div><div className="admin-streak-range-tabs" role="group" aria-label="Report date range">{[["week", "This week"], ["month", "This month"], ["custom", "Custom"]].map(([value, label]) => <button type="button" key={value} aria-pressed={rangeMode === value} onClick={() => setRangeMode(value)}>{label}</button>)}</div></header>
    {rangeMode === "custom" ? <div className="admin-streak-custom-range"><label>From <input type="date" value={customStart} max={customEnd || today} onChange={(event) => setCustomStart(event.target.value)}/></label><label>Through <input type="date" value={customEnd} max={today} onChange={(event) => setCustomEnd(event.target.value)}/></label><small>Daily boundaries follow {timeZone}.</small></div> : null}
    {loading ? <div className="admin-streak-skeleton" role="status"><i/><i/><i/><span>Loading real reading activity…</span></div> : error ? <div className="admin-streak-empty" role="status">{error}</div> : <>
      <div className="admin-streak-scope-label"><span>{isSuperAdmin ? "Organization-wide reporting" : "Personal statistics and partner details are separated from group totals"}</span><small>{range.start} – {report?.range_end || range.end} · {report?.timezone || timeZone}</small></div>
      <div className="admin-streak-metrics"><article><small>Active streaks</small><strong>{groupStats.activeStreaks}</strong><span>Members with a current run</span></article><article><small>Average consistency</small><strong>{groupStats.averageConsistency}%</strong><span>For selected period</span></article><article><small>Longest active streak</small><strong>{groupStats.longestActiveMember?.current_streak || 0} days</strong><span>{groupStats.longestActiveMember?.full_name || "No active streaks yet"}</span></article><article><small>Chapters completed</small><strong>{groupStats.chapters}</strong><span>Personal history, all time</span></article><article><small>Missed days</small><strong>{groupStats.missedDays}</strong><span>Without a qualifying personal reading</span></article></div>

      <div className="admin-streak-personal-grid">
        <section className="admin-streak-subsection"><div className="admin-streak-subheading"><div><small>YOUR PERSONAL REPORT</small><h3>Your reading rhythm</h3></div><span>{currentMember?.range_completed_days || 0} completed days</span></div>
          {currentMember ? <><PersonProgress person={currentMember} label="PERSONAL"/><div className="admin-streak-week-strip" aria-label="Your current week of Bible reading">{weekDates.map((date, index) => { const day = ownHistory.get(date); const status = day?.status || (date > today ? "future" : "untracked"); return <div key={date} className={`admin-streak-week-day is-${status}`} title={`${date}: ${status}`}><small>{WEEKDAYS[index]}</small><b>{date.slice(-2)}</b><i>{day?.status === "completed" ? "✓" : day?.status === "protected" ? "◇" : ""}</i></div>; })}</div><div className="admin-streak-month-heading"><small>Monthly consistency</small><span>{currentMember.monthly_completed || 0} qualifying days</span></div><div className="admin-streak-month-heatmap" aria-label="Your Bible reading history for this month">{monthCells.map((date, index) => { const day = date ? monthHistory.get(date) : null; return date ? <span key={date} className={`is-${day?.status || (date > today ? "future" : "untracked")}`} title={`${date}: ${day?.status || "No tracked history"}`}>{date.slice(-2)}</span> : <i key={`blank-${index}`} aria-hidden="true"/>; })}</div><p className="admin-streak-person-note">Personal history includes only completed readings and streak days calculated with the current daily requirement.</p></> : <div className="admin-streak-empty">Your personal report is not available in this group view.</div>}
        </section>
        <section className="admin-streak-subsection"><div className="admin-streak-subheading"><div><small>STREAK PARTNER REPORT</small><h3>Grow alongside one another</h3></div></div>
          {partnerCircles.length ? <div className="admin-streak-partner-circles">{partnerCircles.map((circle) => { const partners = circle.members.filter((member) => member.user_id !== user?.id); const compare = [currentMember, ...partners].filter(Boolean); const starts = compare.map((member) => member.current_streak_started_on).filter(Boolean).sort(); const ends = compare.map((member) => member.current_streak_ends_on).filter(Boolean).sort(); const sharedStart = starts.at(-1); const sharedEnd = ends[0]; const sharedDays = partners.length && sharedStart && sharedEnd && sharedEnd >= sharedStart ? Math.floor((new Date(`${sharedEnd}T12:00:00Z`) - new Date(`${sharedStart}T12:00:00Z`)) / 86400000) + 1 : 0; const next = MILESTONES.find((day) => day > sharedDays); return <article className="admin-streak-circle" key={circle.id}><small>{circle.name || "Reading partnership"}</small>{partners.map((partner) => { const ahead = Number(partner.current_streak || 0) - Number(currentMember?.current_streak || 0); return <div className="admin-streak-comparison" key={partner.user_id}><PersonProgress person={currentMember} label="YOU"/><span className="admin-streak-connection" aria-hidden="true">↔</span><PersonProgress person={partner} label={ahead > 0 ? `${partner.full_name || "Partner"} is ahead` : ahead < 0 ? "You are ahead" : "In step"}/></div>; })}<p className="admin-streak-shared-note">{sharedDays ? `You share ${sharedDays} consecutive current day${sharedDays === 1 ? "" : "s"}.` : "A shared streak is ready to begin."}{next ? ` ${next - sharedDays} more to your next shared milestone.` : " Every listed milestone is behind you."}</p></article>; })}</div> : <div className="admin-streak-partner-empty"><span aria-hidden="true">✦</span><strong>No active streak partner yet</strong><p>Connect with a partner in Bible Study to compare progress and celebrate shared milestones.</p></div>}
        </section>
      </div>

      <section className="admin-streak-subsection admin-streak-group-section"><div className="admin-streak-subheading"><div><small>PERSONAL STREAK ACTIVITY</small><h3>Personal readings by day</h3></div><span>Completed personal readings</span></div>
        {activity.length ? <div className="admin-streak-activity-chart" role="img" aria-label="Daily members with completed personal readings">{activity.map((day) => <div className="admin-streak-activity-column" key={day.date} title={`${day.date}: ${day.active_readers} members, ${day.completed_chapters} chapters`}><span style={{ height: `${Math.max(5, Number(day.active_readers || 0) / maxReaders * 100)}%` }}/><small>{day.date.slice(-2)}</small></div>)}</div> : <div className="admin-streak-empty">No completed personal readings in this date range.</div>}
      </section>
      <section className="admin-streak-subsection admin-streak-group-section"><div className="admin-streak-subheading"><div><small>{isSuperAdmin ? "ORGANIZATION SHARED PLAN" : "SHARED GROUP PLAN"}</small><h3>Group reading participation</h3></div><span>Shared reading completions</span></div>
        <div className="admin-shared-reading-metrics"><article><small>Chapters scheduled</small><strong>{report?.group_activity?.planned_chapters || 0}</strong><span>In the selected date range</span></article><article><small>Reading completions</small><strong>{report?.group_activity?.completed_entries || 0}</strong><span>Recorded in this range</span></article><article><small>Members participating</small><strong>{report?.group_activity?.participating_members || 0}</strong><span>With a shared plan completion</span></article></div>
        {sharedActivity.length ? <div className="admin-streak-activity-chart" role="img" aria-label="Daily members completing shared group readings">{sharedActivity.map((day) => <div className="admin-streak-activity-column" key={day.date} title={`${day.date}: ${day.active_readers} members, ${day.completed_entries} shared reading completions`}><span style={{ height: `${Math.max(5, Number(day.active_readers || 0) / maxSharedReaders * 100)}%` }}/><small>{day.date.slice(-2)}</small></div>)}</div> : <div className="admin-streak-empty">No shared group reading completions in this date range.</div>}
      </section>
      <section className="admin-streak-subsection admin-streak-group-section"><div className="admin-streak-subheading"><div><small>MEMBER CONSISTENCY</small><h3>Reading rhythm ranking</h3></div><span>{rankedMembers.length} members in scope</span></div>
        {rankedMembers.length ? <div className="admin-streak-ranking-list">{rankedMembers.slice(0, 12).map((member, index) => { const progress = percentage(member.range_completed_days, member.range_elapsed_days); return <article key={member.user_id}><b className={`admin-streak-rank${index < 3 ? ` is-${index + 1}` : ""}`}>{String(index + 1).padStart(2, "0")}</b><MemberInitials member={member} className="admin-streak-ranking-identity"/><span className="admin-streak-ranking-name"><strong>{member.full_name || "Community member"}</strong><small>{member.current_streak || 0} day current · {member.longest_streak || 0} day longest</small></span><span className="admin-streak-ranking-progress"><i><em style={{ width: `${progress}%` }}/></i><b>{progress}%</b></span><span className="admin-streak-ranking-missed">{member.range_missed_days || 0} missed</span></article>; })}</div> : <div className="admin-streak-empty">There are no active members in this report scope.</div>}
      </section>
      <footer className="admin-streak-report-note">Only streak summaries and completed reading totals are included. Private notes and reflections are never returned.</footer>
    </>}
  </section>;
}
