import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { MemberInitials } from "./MemberInitials.jsx";
import { DEFAULT_BIBLE_TIMEZONE, addReadingDays, getReadingDateInTimezone, getReadingWeekStart } from "../lib/personalBibleStudy.js";

const MILESTONES = [3, 7, 14, 30, 50, 100];
const REACTIONS = [["love", "💜", "Love"], ["celebrate", "🎉", "Celebrate"], ["pray", "🙏", "Pray"], ["encourage", "✨", "Encourage"], ["clap", "👏", "Clap"]];
const QUICK_MESSAGES = ["I’m cheering you on today.", "Your consistency is encouraging me.", "Let’s make space for Scripture today."];
const formatDate = (value, options = { dateStyle: "medium" }) => value
  ? new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
  : "—";
const formatTime = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Recently";
const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (value, amount) => {
  const [year, month] = value.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year, month - 1 + amount, 1)));
};
const percent = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : 0;
const relativeCopy = (value) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

function PartnerIcon({ name }) {
  const paths = {
    arrow: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>, chevronRight: <path d="m9 18 6-6-6-6"/>,
    close: <><path d="m18 6-12 12"/><path d="m6 6 12 12"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
    chevronDown: <path d="m6 9 6 6 6-6"/>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 16a3 3 0 0 1 3-3h13M8 7h8"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1z"/></>,
    flame: <><path d="M12 22a7 7 0 0 0 7-7c0-3-2-5-4-7-.3 2-1 3-2 4-1-4-4-7-7-9 0 4-1 6-2 9a8 8 0 0 0 8 10z"/><path d="M10 17a3 3 0 0 0 5.8 1.2c.4-1.6-.4-2.7-1.8-4.2-.2 1.2-.8 2-1.6 2.5-.4-1.6-1.3-2.4-2-3-.2 1.4-.4 2.2-.4 3.5z"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}

function AngelMascot({ mood = "idle" }) {
  return <div className={`partner-angel partner-angel--${mood}`} aria-hidden="true">
    <svg viewBox="0 0 190 202" role="presentation">
      <ellipse className="partner-angel-shadow" cx="95" cy="188" rx="42" ry="8"/>
      <ellipse className="partner-angel-halo" cx="95" cy="24" rx="25" ry="8"/>
      <path className="partner-angel-wing partner-angel-wing--left" d="M69 91C48 73 20 76 13 96c-5 15 7 37 27 46-8-15-6-27 1-35-2 14 4 26 16 34-2-16 2-29 14-37z"/>
      <path className="partner-angel-wing partner-angel-wing--right" d="M121 91c21-18 49-15 56 5 5 15-7 37-27 46 8-15 6-27-1-35 2 14-4 26-16 34 2-16-2-29-14-37z"/>
      <path className="partner-angel-wing-feather partner-angel-wing-feather--left" d="M58 96c-16-8-29-3-35 7m38 2c-13-1-21 7-23 18m37-12c-9 4-13 12-11 22"/>
      <path className="partner-angel-wing-feather partner-angel-wing-feather--right" d="M132 96c16-8 29-3 35 7m-38 2c13-1 21 7 23 18m-37-12c9 4 13 12 11 22"/>
      <path className="partner-angel-robe" d="M77 103c-11 7-19 25-21 67 23 13 55 13 78 0-2-42-10-60-21-67z"/>
      <path className="partner-angel-sash" d="M78 128c10 5 24 5 34 0l4 7c-13 7-29 7-42 0z"/>
      <path className="partner-angel-arm partner-angel-arm--left" d="M69 111c-14 5-23 18-23 30 0 7 5 11 11 9 5-2 5-7 3-11 7-4 12-11 15-18z"/>
      <path className="partner-angel-arm partner-angel-arm--right" d="M121 111c14 5 23 18 23 30 0 7-5 11-11 9-5-2-5-7-3-11-7-4-12-11-15-18z"/>
      <ellipse className="partner-angel-face" cx="95" cy="72" rx="32" ry="35"/>
      <path className="partner-angel-hair" d="M63 72c-3-26 10-42 31-42 21 0 34 16 31 42-5-8-11-12-19-14-12 10-27 13-43 14z"/>
      <path className="partner-angel-hair-lock" d="M63 67c-4 13 1 23 9 27m55-27c4 13-1 23-9 27"/>
      <g className="partner-angel-eyes"><ellipse cx="83" cy="76" rx="2.8" ry="4"/><ellipse cx="107" cy="76" rx="2.8" ry="4"/><circle cx="84" cy="75" r=".8"/><circle cx="108" cy="75" r=".8"/></g>
      <ellipse className="partner-angel-cheek" cx="75" cy="87" rx="5" ry="2.4"/><ellipse className="partner-angel-cheek" cx="115" cy="87" rx="5" ry="2.4"/>
      <path className="partner-angel-smile" d="M89 89c3 4 9 4 12 0"/>
      <path className="partner-angel-neck" d="M87 101v7m16-7v7"/>
    </svg>
  </div>;
}

function Identity({ person, size = "normal" }) {
  return <MemberInitials member={person} className={`partner-identity partner-identity--${size}`} />;
}

function getCurrentRun(summary) {
  if (!summary?.calendar?.length) return { start: null, end: null, days: 0 };
  const today = getReadingDateInTimezone(new Date(), summary.timezone || DEFAULT_BIBLE_TIMEZONE);
  const byDate = new Map(summary.calendar.map((day) => [day.date, day.status]));
  const qualifies = (date) => ["completed", "protected"].includes(byDate.get(date));
  let end = qualifies(today) ? today : qualifies(addReadingDays(today, -1)) ? addReadingDays(today, -1) : null;
  if (!end) return { start: null, end: null, days: 0 };
  let start = end;
  let days = 1;
  while (qualifies(addReadingDays(start, -1))) {
    start = addReadingDays(start, -1);
    days += 1;
  }
  return { start, end, days };
}

function ProgressRing({ value = 0, label, size = "normal" }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className={`partner-ring partner-ring--${size}`} style={{ "--partner-ring-value": `${safe}%` }} role="img" aria-label={`${label}: ${safe}%`}>
    <span><strong>{safe}%</strong><small>{label}</small></span>
  </div>;
}

function ReadingCalendar({ summary, month, onMonthChange, selectedDate, onSelectDate, today }) {
  const [view, setView] = useState("month");
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const states = new Map((summary?.calendar || []).map((day) => [day.date, day]));
  const firstHistory = summary?.calendar?.[0]?.date || today;
  const currentMonth = monthKey(new Date(`${today}T12:00:00Z`));
  const label = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const getState = (date) => {
    const entry = states.get(date);
    let state = entry?.status === "completed" ? "completed"
      : entry?.status === "in_progress" ? "in-progress"
        : entry?.status === "protected" ? "protected"
          : date > today ? "upcoming"
            : date === today ? "pending"
              : date >= firstHistory ? "missed" : "untracked";
    return { date, dayNumber: Number(date.slice(-2)), entry, state };
  };
  const dateItems = view === "month"
    ? Array.from({ length: count }, (_, index) => getState(`${month}-${String(index + 1).padStart(2, "0")}`))
    : Array.from({ length: 7 }, (_, index) => getState(addReadingDays(getReadingWeekStart(selectedDate || today), index)));
  const weekStart = getReadingWeekStart(selectedDate || today);
  const weekBefore = addReadingDays(weekStart,-7);
  const weekAfter = addReadingDays(weekStart,7);
  const firstHistoryWeek = getReadingWeekStart(firstHistory);
  const currentWeek = getReadingWeekStart(today);
  const headingLabel = view === "month" ? label : `${formatDate(weekStart,{month:"short",day:"numeric"})} – ${formatDate(addReadingDays(weekStart,6),{month:"short",day:"numeric",year:"numeric"})}`;
  return <div className="partner-calendar">
    <div className="partner-calendar-heading"><div><small>READING HISTORY</small><h3>{headingLabel}</h3></div>
      <div className="partner-calendar-tools"><div className="partner-calendar-view-toggle" role="group" aria-label="Calendar view"><button type="button" className={view === "week" ? "is-active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button><button type="button" className={view === "month" ? "is-active" : ""} aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button></div>
      <div className="partner-calendar-nav"><button type="button" aria-label={view === "month" ? "Previous month" : "Previous week"} disabled={view === "month" ? month <= monthKey(new Date(`${firstHistory}T12:00:00Z`)) : weekBefore < firstHistoryWeek} onClick={() => view === "month" ? onMonthChange(shiftMonth(month,-1)) : onSelectDate(weekBefore)}><PartnerIcon name="chevronLeft"/></button>
        <button type="button" aria-label={view === "month" ? "Next month" : "Next week"} disabled={view === "month" ? month >= currentMonth : weekAfter > currentWeek} onClick={() => view === "month" ? onMonthChange(shiftMonth(month,1)) : onSelectDate(weekAfter)}><PartnerIcon name="chevronRight"/></button></div></div>
    </div>
    <div className="partner-calendar-grid" role="grid" aria-label={`${label} reading activity`}>
      {["M","T","W","T","F","S","S"].map((day, index) => <span key={`${day}-${index}`} className="partner-calendar-weekday" role="columnheader">{day}</span>)}
      {view === "month" ? Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} className="partner-calendar-blank" aria-hidden="true"/>) : null}
      {dateItems.map(({ date, dayNumber, entry, state }) => <button type="button" role="gridcell" key={date}
        className={`partner-calendar-day is-${state}${date === today ? " is-today" : ""}${date === selectedDate ? " is-selected" : ""}`}
        aria-label={`${formatDate(date, { dateStyle: "full" })}: ${state.replace("-", " ")}, ${entry?.completed_count || 0} chapters completed`}
        aria-pressed={date === selectedDate} onClick={() => onSelectDate(date)}>
        <span>{dayNumber}</span><i aria-hidden="true">{state === "completed" ? "✓" : state === "missed" ? "·" : state === "in-progress" ? "◒" : state === "protected" ? "◇" : ""}</i>
      </button>)}
    </div>
    <div className="partner-calendar-legend"><span><i className="is-complete"/>Completed</span><span><i className="is-pending"/>Today</span><span><i className="is-missed"/>Missed</span><span><i className="is-future"/>Upcoming</span></div>
    {selectedDate ? <div className="partner-calendar-selected"><strong>{formatDate(selectedDate,{dateStyle:"full"})}</strong>
      <span>{states.get(selectedDate)?.status === "completed" ? `${states.get(selectedDate)?.completed_count || 0} reading${states.get(selectedDate)?.completed_count === 1 ? "" : "s"} completed` : states.get(selectedDate)?.status === "in_progress" ? "Reading in progress" : selectedDate > today ? "An upcoming reading day" : selectedDate === today ? "Today’s reading progress" : states.get(selectedDate)?.status === "protected" ? "Streak protected" : selectedDate < firstHistory ? "No reading history recorded for this date" : "No reading completed"}</span>
    </div> : null}
  </div>;
}

export function BibleStudyPartnerStreaks({ user, profiles = [], readings = [], completions = [], groupId, timezone = DEFAULT_BIBLE_TIMEZONE }) {
  const [partnerships, setPartnerships] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [personalSummary, setPersonalSummary] = useState(null);
  const [partnerSummaries, setPartnerSummaries] = useState({});
  const [challenges, setChallenges] = useState([]);
  const [challengeMembers, setChallengeMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [eventReactions, setEventReactions] = useState([]);
  const [messageReactions, setMessageReactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState("connecting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [selectedMember, setSelectedMember] = useState(null);
  const [challengeSuccess, setChallengeSuccess] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState("");
  const [momentsExpanded, setMomentsExpanded] = useState(true);
  const [recentMessagesExpanded, setRecentMessagesExpanded] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [invitees, setInvitees] = useState([]);
  const [partnershipName, setPartnershipName] = useState("");
  const [challengeForm, setChallengeForm] = useState({ partnershipId: "", title: "7-Day Bible Reading Challenge", duration: "7" });
  const [messageDraft, setMessageDraft] = useState("");
  const [messagePartnership, setMessagePartnership] = useState("");
  const reactionLocks = useRef(new Set());
  const challengeSuccessCloseRef = useRef(null);
  const partnerProfileCloseRef = useRef(null);

  const today = getReadingDateInTimezone(new Date(), timezone);
  const currentMonth = monthKey(new Date(`${today}T12:00:00Z`));
  const profileById = useMemo(() => new Map(profiles.map((person) => [person.id, person])), [profiles]);
  const partnershipsById = useMemo(() => new Map(partnerships.map((item) => [item.id, item])), [partnerships]);
  const membersByPartnership = useMemo(() => {
    const result = new Map();
    memberships.forEach((member) => result.set(member.partnership_id, [...(result.get(member.partnership_id) || []), member]));
    return result;
  }, [memberships]);
  const activePartnerships = useMemo(() => partnerships.filter((item) => item.status === "active"
    && memberships.some((member) => member.partnership_id === item.id && member.user_id === user?.id && member.status === "active")), [partnerships, memberships, user?.id]);
  const selectedChallengePartnership = activePartnerships.find((item) => item.id === challengeForm.partnershipId)
    || activePartnerships[0]
    || null;
  const pendingInvitations = useMemo(() => partnerships.filter((item) => item.status === "pending"
    && memberships.some((member) => member.partnership_id === item.id && member.user_id === user?.id && member.status === "pending")), [partnerships, memberships, user?.id]);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (!supabase || !user?.id || !groupId) { setLoading(false); return; }
    if (initial) setLoading(true);
    const [partnershipResult, ownSummaryResult] = await Promise.all([
      supabase.from("bible_study_partnerships").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
      supabase.rpc("bible_streak_my_summary")
    ]);
    if (partnershipResult.error) {
      setError(/does not exist|could not find the table/i.test(partnershipResult.error.message || "")
        ? "Partner Streaks need the supabase/bible-partner-experience-migration.sql database update."
        : partnershipResult.error.message || "Partnerships could not be loaded.");
      setLoading(false);
      return;
    }
    const nextPartnerships = partnershipResult.data || [];
    const ids = nextPartnerships.map((item) => item.id);
    setPartnerships(nextPartnerships);
    setPersonalSummary(ownSummaryResult.error ? null : ownSummaryResult.data);
    if (!ids.length) {
      setMemberships([]); setPartnerSummaries({}); setChallenges([]); setChallengeMembers([]); setEvents([]); setMessages([]); setEventReactions([]); setMessageReactions([]);
      setError(""); setLoading(false); return;
    }
    const [membersResult, challengeResult, challengeMembersResult, eventResult, messageResult] = await Promise.all([
      supabase.from("bible_study_partnership_members").select("*").in("partnership_id", ids),
      supabase.from("bible_study_partner_challenges").select("*").in("partnership_id", ids).order("created_at", { ascending: false }),
      supabase.from("bible_study_partner_challenge_members").select("*").order("challenge_id"),
      supabase.from("bible_study_partner_events").select("*").in("partnership_id", ids).order("created_at", { ascending: false }).limit(60),
      supabase.from("bible_study_partner_messages").select("*").in("partnership_id", ids).order("created_at", { ascending: false }).limit(60)
    ]);
    const nextMembers = membersResult.data || [];
    setMemberships(nextMembers);
    setChallenges(challengeResult.data || []);
    setChallengeMembers(challengeMembersResult.data || []);
    setEvents(eventResult.data || []);
    setMessages(messageResult.data || []);
    const eventIds = (eventResult.data || []).map((item) => item.id);
    const messageIds = (messageResult.data || []).map((item) => item.id);
    const [eventReactionResult, messageReactionResult] = await Promise.all([
      eventIds.length ? supabase.from("bible_study_partner_event_reactions").select("*").in("event_id", eventIds) : Promise.resolve({ data: [], error: null }),
      messageIds.length ? supabase.from("bible_study_partner_message_reactions").select("*").in("message_id", messageIds) : Promise.resolve({ data: [], error: null })
    ]);
    setEventReactions(eventReactionResult.data || []);
    setMessageReactions(messageReactionResult.data || []);
    const partnerIds = [...new Set(nextMembers.filter((member) => member.status === "active"
      && nextPartnerships.some((partnership) => partnership.id === member.partnership_id && partnership.status === "active"))
      .map((member) => member.user_id))];
    const summaryEntries = await Promise.all(partnerIds.map(async (memberId) => {
      const { data, error: summaryError } = await supabase.rpc("bible_partner_member_summary", { target_partnership: nextPartnerships.find((partnership) => nextMembers.some((member) => member.partnership_id === partnership.id && member.user_id === memberId && member.status === "active"))?.id, target_member: memberId });
      return [memberId, summaryError ? null : data];
    }));
    setPartnerSummaries(Object.fromEntries(summaryEntries));
    const anyFeatureError = membersResult.error || challengeResult.error || challengeMembersResult.error || eventResult.error || messageResult.error;
    setError(anyFeatureError?.message || "");
    setLoading(false);
  }, [groupId, user?.id]);

  useEffect(() => { void load({ initial: true }); }, [load]);
  useEffect(() => {
    if (!supabase || !groupId || !user?.id) return undefined;
    const channel = supabase.channel(`bible-partner-experience:${groupId}:${user.id}`);
    ["bible_study_partnerships", "bible_study_partnership_members", "bible_study_partner_events", "bible_study_partner_event_reactions", "bible_study_partner_messages", "bible_study_partner_message_reactions", "bible_study_partner_challenges", "bible_study_partner_challenge_members"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => void load());
    });
    channel.on("postgres_changes", { event: "*", schema: "public", table: "bible_study_completions", filter: `group_id=eq.${groupId}` }, () => void load());
    channel.subscribe((status) => {
      setRealtime(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "offline" : "connecting");
      if (status === "SUBSCRIBED") void load();
    });
    return () => { void supabase.removeChannel(channel); };
  }, [groupId, load, user?.id]);

  useEffect(() => {
    if (!selectedMember) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    partnerProfileCloseRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedMember(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".partner-profile-sheet");
      const focusable = [...(dialog?.querySelectorAll('a[href],button:not(:disabled),[tabindex]:not([tabindex="-1"])') || [])];
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [selectedMember]);
  useEffect(() => {
    if (!challengeSuccess || typeof document === "undefined") return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    challengeSuccessCloseRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setChallengeSuccess(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".partner-challenge-success-dialog");
      const focusable = [...(dialog?.querySelectorAll("button:not(:disabled)") || [])];
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [challengeSuccess]);

  useEffect(() => {
    if (!openActionMenu) return undefined;
    const dismiss = (event) => {
      if (!event.target.closest?.(".partner-action-menu")) setOpenActionMenu("");
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpenActionMenu("");
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openActionMenu]);

  const memberDetails = (partnership) => (membersByPartnership.get(partnership.id) || []).filter((member) => member.status === "active");
  const assignedToday = useMemo(() => readings.filter((reading) => reading.reading_date === today && reading.deleted_at == null && !["draft", "archived"].includes(reading.status)), [readings, today]);
  const hasReadings = (memberId, groupReadings = assignedToday) => groupReadings.length > 0 && groupReadings.every((reading) => completions.some((item) => item.reading_id === reading.id && item.user_id === memberId));
  const partnershipStats = useMemo(() => {
    return activePartnerships.map((partnership) => {
      const members = memberDetails(partnership);
      const groupReadings = readings.filter((reading) => reading.deleted_at == null && !["draft", "archived"].includes(reading.status));
      const dueDates = [...new Set(groupReadings.filter((reading) => reading.reading_date >= (partnership.started_on || today) && reading.reading_date <= today).map((reading) => reading.reading_date))].sort();
      let sharedStreak = 0;
      for (let index = dueDates.length - 1; index >= 0; index -= 1) {
        const dayReadings = groupReadings.filter((reading) => reading.reading_date === dueDates[index]);
        const everyMemberCompleted = dayReadings.length > 0 && members.length > 0 && members.every((member) => hasReadings(member.user_id, dayReadings));
        if (!everyMemberCompleted) break;
        sharedStreak += 1;
      }
      let completedContributions = 0;
      let allReads = 0;
      for (const reading of groupReadings.filter((item) => item.reading_date >= (partnership.started_on || today) && item.reading_date <= today)) {
        allReads += members.length;
        completedContributions += members.filter((member) => completions.some((item) => item.reading_id === reading.id && item.user_id === member.user_id)).length;
      }
      const totalTogether = groupReadings.filter((reading) => reading.reading_date >= (partnership.started_on || today) && reading.reading_date <= today && members.length && members.every((member) => completions.some((item) => item.reading_id === reading.id && item.user_id === member.user_id))).length;
      return { partnership, members, sharedStreak, totalTogether, consistency: percent(completedContributions, allReads) };
    });
  }, [activePartnerships, memberships, readings, completions, today]);

  const uniquePartners = useMemo(() => {
    const members = new Map();
    partnershipStats.forEach(({ members: partners }) => partners.forEach((member) => {
      if (member.user_id !== user?.id) members.set(member.user_id, member);
    }));
    return [...members.values()];
  }, [partnershipStats, user?.id]);
  const todayFinished = uniquePartners.filter((member) => hasReadings(member.user_id)).length;
  const todayWaiting = assignedToday.length ? Math.max(uniquePartners.length - todayFinished, 0) : 0;
  const averageConsistency = partnershipStats.length ? Math.round(partnershipStats.reduce((total, item) => total + item.consistency, 0) / partnershipStats.length) : 0;
  const strongestSharedStreak = Math.max(0, ...partnershipStats.map((item) => item.sharedStreak));
  const nextMilestone = MILESTONES.find((value) => value > strongestSharedStreak);
  const todayComplete = !assignedToday.length || (hasReadings(user?.id) && uniquePartners.length > 0 && uniquePartners.every((member) => hasReadings(member.user_id)));
  const celebrationToday = events.some((event) => ["milestone_reached","challenge_completed"].includes(event.event_type)
    && getReadingDateInTimezone(new Date(event.created_at),timezone) === today);
  const partnerCompletedToday = events.some((event) => event.actor_id !== user?.id
    && ["group_reading_completed","personal_reading_completed"].includes(event.event_type)
    && getReadingDateInTimezone(new Date(event.created_at),timezone) === today);
  const mascotMood = celebrationToday || (todayComplete && assignedToday.length) ? "celebrate" : partnerCompletedToday ? "happy" : todayWaiting ? "encourage" : "welcome";
  const mascotMessage = celebrationToday ? "Look at you! Your partnership just unlocked a new shared achievement." : !activePartnerships.length ? "A steady rhythm grows one reading at a time. Invite someone to walk with you." : !assignedToday.length ? "There’s room to grow together. Your next shared reading is on the way." : todayComplete ? "Amazing! You all showed up for Scripture today." : partnerCompletedToday ? "Your partner completed today’s reading! You’re growing together." : nextMilestone && nextMilestone - strongestSharedStreak === 1 ? "You’re one day away from your next shared milestone!" : todayWaiting ? "Your partners are making progress. A little encouragement can go a long way." : "Your streak is growing. Take today’s reading one chapter at a time.";

  const action = async (work, success) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await load(); setNotice(success); }
    catch (actionError) { setError(actionError?.message || "That action could not be completed."); }
    finally { setBusy(false); }
  };
  const toggleInvitee = (memberId) => setInvitees((current) => current.includes(memberId)
    ? current.filter((id) => id !== memberId)
    : current.length < 9 ? [...current, memberId] : current);
  const createPartnership = (event) => {
    event.preventDefault();
    if (!invitees.length) return;
    void action(async () => {
      const { error: rpcError } = await supabase.rpc("create_bible_study_partnership", { target_group: groupId, invitees, partnership_name: partnershipName.trim() || null });
      if (rpcError) throw rpcError;
      setInvitees([]); setPartnershipName("");
    }, "Your partnership invitation is on its way.");
  };
  const respond = (id, response) => void action(async () => {
    const { error: rpcError } = await supabase.rpc("respond_to_bible_study_partnership", { target_partnership: id, response });
    if (rpcError) throw rpcError;
  }, response === "active" ? "Invitation accepted." : "Invitation declined.");
  const endPartnership = (partnership) => {
    const names = memberDetails(partnership).filter((member) => member.user_id !== user.id).map((member) => profileById.get(member.user_id)?.full_name || "member").join(", ");
    if (window.confirm(`End this shared reading partnership${names ? ` with ${names}` : ""}? Your personal Bible history will remain unchanged.`)) {
      void action(async () => {
        const { error: rpcError } = await supabase.rpc("end_bible_study_partnership", { target_partnership: partnership.id });
        if (rpcError) throw rpcError;
      }, "The partnership has ended.");
    }
  };
  const sendMessage = async (partnershipId, content) => {
    const text = content.trim();
    if (!text || !partnershipId || busy) return;
    void action(async () => {
      const { error: insertError } = await supabase.from("bible_study_partner_messages").insert({ partnership_id: partnershipId, user_id: user.id, content: text });
      if (insertError) throw insertError;
      setMessageDraft(""); setMessagePartnership(partnershipId);
    }, "Encouragement shared with your partners.");
  };
  const toggleReaction = async (table, key, rowId, reaction, currentRows, setter) => {
    const lockKey = `${table}:${rowId}:${reaction}`;
    if (reactionLocks.current.has(lockKey)) return;
    reactionLocks.current.add(lockKey);
    const existing = currentRows.find((item) => item[key] === rowId && item.user_id === user.id && item.reaction === reaction);
    try {
      if (existing) {
        setter((rows) => rows.filter((item) => item !== existing));
        const { error: deleteError } = await supabase.from(table).delete().eq(key, rowId).eq("user_id", user.id).eq("reaction", reaction);
        if (deleteError) { setter((rows) => [...rows, existing]); throw deleteError; }
      } else {
        const optimistic = { [key]: rowId, user_id: user.id, reaction };
        setter((rows) => [...rows, optimistic]);
        const { error: insertError } = await supabase.from(table).insert(optimistic);
        if (insertError) { setter((rows) => rows.filter((item) => item !== optimistic)); throw insertError; }
      }
    } catch (reactionError) {
      setError(reactionError.message || "That reaction could not be saved.");
    } finally { reactionLocks.current.delete(lockKey); }
  };
  const createChallenge = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!user?.id) {
      setError("Sign in to start a partnership challenge.");
      return;
    }
    if (!supabase) {
      setError("Challenges are temporarily unavailable. Please try again later.");
      return;
    }
    const partnership = activePartnerships.find((item) => item.id === selectedChallengePartnership?.id);
    if (!partnership) {
      setError("Choose an active partnership before starting a challenge.");
      return;
    }
    const title = challengeForm.title.trim();
    const challengeDays = Number(challengeForm.duration === "custom" ? challengeForm.customDuration : challengeForm.duration);
    if (title.length < 3 || title.length > 100) {
      setError("Challenge names must be between 3 and 100 characters.");
      return;
    }
    if (!Number.isInteger(challengeDays) || challengeDays < 3 || challengeDays > 365) {
      setError("Choose a challenge length from 3 to 365 days.");
      return;
    }
    const existing = challenges.find((challenge) => challenge.partnership_id === partnership.id
      && challenge.status === "active"
      && challenge.ends_on >= today
      && challenge.duration_days === challengeDays
      && challenge.title.trim().toLowerCase() === title.toLowerCase());
    if (existing) {
      setNotice("This challenge is already active for your partnership.");
      window.requestAnimationFrame(() => document.getElementById(`partner-challenge-${existing.id}`)?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      }));
      return;
    }
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("create_bible_partner_challenge", {
        target_partnership: partnership.id,
        challenge_title: title,
        challenge_days: challengeDays
      });
      if (rpcError) {
        if (rpcError.code === "23505" || /already exists for your partnership/i.test(rpcError.message || "")) {
          setNotice("This challenge is already active for your partnership.");
          void load();
          return;
        }
        throw rpcError;
      }
      const createdChallenge = Array.isArray(data) ? data[0] : data;
      if (!createdChallenge?.id) throw new Error("The challenge could not be confirmed after saving.");
      const newMembers = memberships.filter((member) => member.partnership_id === partnership.id && member.status === "active")
        .map((member) => ({ challenge_id: createdChallenge.id, user_id: member.user_id }));
      setChallenges((current) => [createdChallenge, ...current.filter((item) => item.id !== createdChallenge.id)]);
      setChallengeMembers((current) => [
        ...current.filter((item) => item.challenge_id !== createdChallenge.id),
        ...newMembers
      ]);
      setChallengeSuccess(createdChallenge);
      void load();
    } catch (challengeError) {
      console.error("Bible partner challenge could not be started:", challengeError);
      if (challengeError?.code === "42501") {
        setError("You must be an accepted member of an active partnership to start a challenge.");
      } else if (challengeError?.code === "22023") {
        setError("Check the challenge name and duration, then try again.");
      } else {
        setError("The challenge could not be started. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };
  const viewStartedChallenge = () => {
    const challengeId = challengeSuccess?.id;
    setChallengeSuccess(null);
    if (!challengeId) return;
    setActiveSection("challenges");
    window.requestAnimationFrame(() => {
      const challengeCard = document.getElementById(`partner-challenge-${challengeId}`);
      challengeCard?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center"
      });
      challengeCard?.focus({ preventScroll: true });
    });
  };
  const endChallenge = (challenge) => void action(async () => {
    const { error: rpcError } = await supabase.rpc("end_bible_partner_challenge", { target_challenge: challenge.id });
    if (rpcError) throw rpcError;
  }, "Challenge closed.");
  const confirmDelete = async () => {
    if (!deleteConfirm || deleteBusy) return;
    setDeleteBusy(true);
    setError("");
    try {
      if (deleteConfirm.kind === "challenge") {
        const { error: rpcError } = await supabase.rpc("delete_bible_partner_challenge", { target_challenge: deleteConfirm.item.id });
        if (rpcError) throw rpcError;
        setChallenges((current) => current.filter((item) => item.id !== deleteConfirm.item.id));
        setChallengeMembers((current) => current.filter((item) => item.challenge_id !== deleteConfirm.item.id));
        setNotice("Challenge deleted.");
      } else if (deleteConfirm.kind === "message") {
        const { error: rpcError } = await supabase.rpc("delete_bible_partner_message", { target_message: deleteConfirm.item.id });
        if (rpcError) throw rpcError;
        setMessages((current) => current.filter((item) => item.id !== deleteConfirm.item.id));
        setMessageReactions((current) => current.filter((item) => item.message_id !== deleteConfirm.item.id));
        setEvents((current) => current.filter((item) => item.metadata?.message_id !== deleteConfirm.item.id));
        setNotice("Encouragement deleted.");
      } else {
        const { error: deleteError } = await supabase
          .from("bible_study_partner_events")
          .delete()
          .eq("id", deleteConfirm.item.id)
          .eq("actor_id", user.id);
        if (deleteError) throw deleteError;
        setEvents((current) => current.filter((item) => item.id !== deleteConfirm.item.id));
        setEventReactions((current) => current.filter((item) => item.event_id !== deleteConfirm.item.id));
        setNotice("Activity deleted.");
      }
      setDeleteConfirm(null);
      setOpenActionMenu("");
      void load();
    } catch (deleteError) {
      console.error("Partner management delete failed:", deleteError);
      setError(deleteConfirm.kind === "challenge"
        ? "The challenge could not be deleted. Please try again."
        : deleteConfirm.kind === "message"
          ? "The encouragement could not be deleted. Please try again."
          : deleteError?.code === "42501"
            ? "Activity deletion is not enabled yet. Please ask an administrator to update the partner permissions."
            : "The activity could not be deleted. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const jumpTo = (section) => setActiveSection(section);
  const openMember = (member, partnershipId) => {
    setCalendarMonth(currentMonth); setSelectedDate(today);
    setSelectedMember({ memberId: member.user_id, partnershipId });
  };
  const myCurrentStreak = Number(personalSummary?.current_streak || 0);
  const allPartnersCount = uniquePartners.length;
  const personalWeeklyRate = percent(personalSummary?.weekly_completed || 0, personalSummary?.weekly_elapsed || 0);

  if (loading) return <section className="bible-panel partner-loading" aria-label="Loading Partner Streaks">
    <div className="partner-skeleton partner-skeleton--hero"/><div className="partner-skeleton-grid"><i/><i/><i/><i/></div><span>Gathering your shared reading rhythm…</span>
  </section>;

  return <>
  <section className="partner-experience" aria-labelledby="partner-title">
    <header className="partner-hero">
      <div className="partner-hero-copy"><div className="partner-eyebrow"><PartnerIcon name="spark"/> BIBLE STREAK PARTNERS <span className={`partner-live partner-live--${realtime}`}>{realtime === "live" ? "LIVE" : realtime === "offline" ? "RECONNECTING" : "SYNCING"}</span></div>
        <h2 id="partner-title">Grow in the Word,<br/><em>side by side.</em></h2>
        <p>Build a gentle, shared rhythm in Scripture. Show up for the reading, celebrate one another, and let consistency grow.</p>
        <div className="partner-hero-actions"><button type="button" className="partner-primary-action" onClick={() => jumpTo("partners")}>Meet your partners <PartnerIcon name="arrow"/></button><span>Every reading counts. Every person matters.</span></div>
      </div>
      <div className="partner-hero-art"><AngelMascot mood={mascotMood}/><div className="partner-speech-bubble"><span>{mascotMessage}</span></div><div className="partner-hero-spark partner-hero-spark--one"><PartnerIcon name="spark"/></div><div className="partner-hero-spark partner-hero-spark--two"><PartnerIcon name="spark"/></div></div>
      <div className="partner-hero-stats" aria-label="Today's partnership progress">
        <div className="partner-hero-streak"><span className="partner-flame-mark"><PartnerIcon name="flame"/></span><div><small>BEST SHARED STREAK</small><strong>{strongestSharedStreak}<span> {strongestSharedStreak === 1 ? "day" : "days"}</span></strong><p>{nextMilestone ? `${Math.max(nextMilestone - strongestSharedStreak, 0)} to your next milestone` : "Across your active circles"}</p></div></div>
        <div className="partner-hero-stat"><PartnerIcon name="users"/><div><strong>{allPartnersCount}</strong><span>Active partners</span></div></div>
        <div className="partner-hero-stat"><PartnerIcon name="check"/><div><strong>{assignedToday.length && allPartnersCount ? `${todayFinished}/${allPartnersCount}` : "—"}</strong><span>{assignedToday.length ? (allPartnersCount ? "Read today" : "Invite a partner") : "No reading due"}</span></div></div>
      </div>
    </header>

    <nav className="partner-section-nav" role="tablist" aria-label="Partner Streak sections" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]?.focus();
      jumpTo(tabs[next]?.id.replace("partner-tab-", ""));
    }}>
      {[["overview","Overview","users"],["partners","My partners","book"],["challenges","Challenges","spark"],["moments","Activity","chat"]].map(([id,label,icon]) => <button key={id} id={`partner-tab-${id}`} type="button" role="tab" aria-selected={activeSection === id} aria-controls={`partner-panel-${id}`} tabIndex={activeSection === id ? 0 : -1} className={activeSection === id ? "is-active" : ""} onClick={() => jumpTo(id)}><PartnerIcon name={icon}/>{label}</button>)}
    </nav>

    {error ? <p className="partner-feedback partner-feedback--error" role="alert">{error}</p> : null}
    {notice ? <p className="partner-feedback partner-feedback--success" role="status">{notice}</p> : null}

    {activeSection === "overview" ? <section id="partner-panel-overview" className="partner-overview" role="tabpanel" aria-labelledby="partner-tab-overview" tabIndex={0}>
      <div className="partner-overview-heading"><div><small>YOUR SHARED RHYTHM</small><h3>A little progress, together</h3></div><p>Personal streaks stay yours. Shared streaks grow when everyone completes the planned reading.</p></div>
      <div className="partner-metric-grid">
        <article className="partner-metric partner-metric--personal"><span className="partner-metric-icon"><PartnerIcon name="flame"/></span><small>MY PERSONAL STREAK</small><strong>{personalSummary ? myCurrentStreak : "—"}<span> {personalSummary ? (myCurrentStreak === 1 ? "day" : "days") : ""}</span></strong><span>{personalSummary?.longest_streak ? `Your best is ${personalSummary.longest_streak} days` : personalSummary ? "A rhythm of your own" : "Personal summary unavailable"}</span></article>
        <article className="partner-metric"><span className="partner-metric-icon"><PartnerIcon name="calendar"/></span><small>MY READING THIS WEEK</small><strong>{personalSummary ? `${personalSummary.weekly_completed || 0}/${personalSummary.weekly_elapsed || 0}` : "—"}</strong><span>Reading days completed this week</span><div className="partner-mini-track"><i style={{ width: `${personalSummary ? personalWeeklyRate : 0}%` }}/></div></article>
        <article className="partner-metric"><span className="partner-metric-icon"><PartnerIcon name="spark"/></span><small>SHARED PLAN CONSISTENCY</small><strong>{averageConsistency}<span>%</span></strong><span>{activePartnerships.length ? `Across ${activePartnerships.length} active ${activePartnerships.length === 1 ? "circle" : "circles"}` : "Begin when your first partnership starts"}</span><div className="partner-mini-track partner-mini-track--gold"><i style={{ width: `${averageConsistency}%` }}/></div></article>
      </div>
      {pendingInvitations.length ? <div className="partner-overview-invitations"><PartnerIcon name="users"/><span><strong>{pendingInvitations.length} invitation{pendingInvitations.length === 1 ? "" : "s"} waiting</strong><small>Open My partners to respond.</small></span><button type="button" onClick={() => jumpTo("partners")}>Review <PartnerIcon name="arrow"/></button></div> : null}
    </section> : null}

    {activeSection === "partners" ? <div id="partner-panel-partners" className="partner-tab-panel" role="tabpanel" aria-labelledby="partner-tab-partners" tabIndex={0}>
    {pendingInvitations.length ? <section className="partner-invitation-stack" aria-labelledby="partner-invitations-title"><div className="partner-section-title"><div><small>NEW INVITATIONS</small><h3 id="partner-invitations-title">Join a reading circle</h3></div></div>
      {pendingInvitations.map((partnership) => {
        const invited = membersByPartnership.get(partnership.id) || [];
        const inviteNames = invited.filter((member) => member.user_id !== user.id).map((member) => profileById.get(member.user_id)?.full_name || "Member").join(", ");
        return <article className="partner-invitation-card" key={partnership.id}><span className="partner-invitation-icon"><PartnerIcon name="users"/></span><div><strong>{partnership.name}</strong><span>{profileById.get(partnership.created_by)?.full_name || "A member"} invited you{inviteNames ? ` to join ${inviteNames}` : ""}.</span><small>The shared rhythm begins once everyone accepts.</small></div><div className="partner-invitation-actions"><button type="button" className="partner-primary-action" disabled={busy} onClick={() => respond(partnership.id,"active")}>Accept invitation</button><button type="button" className="partner-text-action" disabled={busy} onClick={() => respond(partnership.id,"declined")}>Decline</button></div></article>;
      })}
    </section> : null}

    <section id="partner-partners" className="partner-circle-section">
      <div className="partner-section-title"><div><small>YOUR READING CIRCLE</small><h3>Partners who grow with you</h3></div><span className="partner-section-count"><PartnerIcon name="users"/>{activePartnerships.length} active</span></div>
      {partnershipStats.length ? <div className="partner-partnership-grid">{partnershipStats.map(({ partnership, members, sharedStreak, totalTogether, consistency }) => {
        const next = MILESTONES.find((value) => value > sharedStreak);
        const memberStatus = (member) => !assignedToday.length ? "No reading due" : hasReadings(member.user_id) ? "Reading complete" : "Reading pending";
        return <article className="partner-partnership-card" key={partnership.id}>
          <div className="partner-partnership-card-head"><div><small>SHARED STREAK</small><h4>{partnership.name}</h4></div><span className="partner-active-badge"><i/> Active</span></div>
          <div className="partner-shared-streak"><div><span className="partner-streak-flame"><PartnerIcon name="flame"/></span><strong>{sharedStreak}</strong><small>days together</small></div><div className="partner-shared-progress"><span>{next ? `${Math.max(next - sharedStreak,0)} days to ${next}` : "Milestones keep growing"}</span><div><i style={{width:`${next?Math.min(100,sharedStreak/next*100):100}%`}}/></div><small>Started {formatDate(partnership.started_on)} · {totalTogether} readings completed by everyone</small></div></div>
          <div className="partner-roster">{members.map((member) => {
            const person = profileById.get(member.user_id);
            const isSelf = member.user_id === user.id;
            const stat = partnerSummaries[member.user_id];
            return <article className="partner-roster-member" key={member.user_id}>
              <button type="button" className="partner-roster-profile" onClick={() => !isSelf && openMember(member,partnership.id)} aria-label={isSelf ? "Your reading summary" : `Open ${person?.full_name || "partner"}’s reading profile`}>
                <Identity person={person}/><span><strong>{isSelf ? "You" : person?.full_name || "Partner"}</strong><small>{isSelf ? `${myCurrentStreak} day personal streak` : stat ? `${stat.current_streak || 0} day personal streak` : "Reading history unavailable"}</small></span>
              </button>
              <span className={`partner-today-status ${assignedToday.length && hasReadings(member.user_id) ? "is-complete" : ""}`}><i>{assignedToday.length && hasReadings(member.user_id) ? "✓" : assignedToday.length ? "·" : "—"}</i>{memberStatus(member)}</span>
              {!isSelf ? <button type="button" className="partner-profile-link" onClick={() => openMember(member,partnership.id)}>View profile <PartnerIcon name="arrow"/></button> : null}
            </article>;
          })}</div>
          <div className="partner-card-footer"><div><small>PARTNERSHIP CONSISTENCY</small><strong>{consistency}%</strong></div><ProgressRing value={consistency} label="steady" size="small"/><button type="button" className="partner-encourage-button" onClick={() => { setMessagePartnership(partnership.id); jumpTo("moments"); }}><PartnerIcon name="message"/> Encourage</button><button type="button" className="partner-end-button" disabled={busy} onClick={() => endPartnership(partnership)}>End</button></div>
        </article>;
      })}</div> : <div className="partner-empty-card"><div className="partner-empty-angel"><AngelMascot mood="welcome"/></div><div><small>THE FIRST STEP IS SHARED</small><h4>Find your reading people</h4><p>Invite one or more active members. Everyone’s personal reading progress stays private until they accept the partnership.</p><button type="button" className="partner-primary-action" onClick={() => document.getElementById("partner-create")?.scrollIntoView({behavior:"smooth",block:"center"})}>Start a partnership <PartnerIcon name="arrow"/></button></div></div>}
      <div className="partner-create-card" id="partner-create"><div className="partner-create-copy"><span className="partner-create-icon"><PartnerIcon name="spark"/></span><div><small>GROW TOGETHER</small><h4>Start a new partnership</h4><p>Invite a partner or gather a small circle. Each person chooses whether to join.</p></div></div>
        <form onSubmit={createPartnership} className="partner-create-form"><label className="partner-field"><span>Circle name <small>Optional</small></span><input value={partnershipName} onChange={(event) => setPartnershipName(event.target.value)} maxLength={80} placeholder="e.g. Morning Scripture Circle"/></label>
          <fieldset className="partner-invite-picker"><legend>Choose up to 9 partners</legend><div>{profiles.filter((person) => person.is_active !== false && person.id !== user?.id).map((person) => {
            const activeOrPending = memberships.some((membership) => membership.user_id === person.id && ["active","pending"].includes(membership.status) && partnershipsById.get(membership.partnership_id)?.status === "active");
            const selected = invitees.includes(person.id);
            return <label key={person.id} className={`partner-invite-option${selected ? " is-selected" : ""}${activeOrPending ? " has-partnership" : ""}`}><input type="checkbox" checked={selected} disabled={busy || (!selected && invitees.length >= 9)} onChange={() => toggleInvitee(person.id)}/><Identity person={person} size="small"/><span><strong>{person.full_name || "Member"}</strong><small>{activeOrPending ? "Already in an active circle · can join another" : "Available to invite"}</small></span><i>{selected ? "✓" : "+"}</i></label>;
          })}</div><small className="partner-field-hint">Invitations go only to active members of this cell group. A partnership starts when everyone accepts.</small></fieldset>
          <button className="partner-primary-action" type="submit" disabled={busy || !invitees.length}><PartnerIcon name="users"/>{busy ? "Sending…" : invitees.length ? `Invite ${invitees.length} ${invitees.length === 1 ? "partner" : "partners"}` : "Choose a partner"}</button>
        </form>
      </div>
    </section>
    {partnerships.some((item) => item.status === "pending" && item.created_by === user?.id) ? <section className="partner-pending-outgoing" aria-label="Outgoing invitations"><small>WAITING FOR YOUR CIRCLE</small>{partnerships.filter((item)=>item.status==="pending"&&item.created_by===user?.id).map((item)=>{const pending=(membersByPartnership.get(item.id)||[]).filter((member)=>member.status==="pending");return <article key={item.id}><span className="partner-pending-icon"><PartnerIcon name="users"/></span><div><strong>{item.name}</strong><small>Waiting for {pending.map((member)=>profileById.get(member.user_id)?.full_name||"a member").join(", ")} to accept.</small></div><span className="partner-pending-count">{pending.length} invited</span></article>;})}</section>:null}
    </div> : null}

    {activeSection === "challenges" ? <section id="partner-panel-challenges" className="partner-challenge-section" role="tabpanel" aria-labelledby="partner-tab-challenges" tabIndex={0}>
      <div className="partner-section-title"><div><small>GENTLE ACCOUNTABILITY</small><h3>Challenges &amp; milestones</h3></div><p>Celebrate steady progress without turning Scripture into a contest.</p></div>
      <div className="partner-challenge-layout"><div className="partner-challenge-create"><span className="partner-challenge-create-mark"><PartnerIcon name="calendar"/></span><small>BEGIN A SHARED JOURNEY</small><h4>Choose your next rhythm</h4><p>Set a reading intention together. Your progress is based on completed personal readings, shared only within this accepted partnership.</p>
        {activePartnerships.length ? <form onSubmit={createChallenge}>
          <label className="partner-field"><span>Partnership</span><select value={selectedChallengePartnership?.id || ""} onChange={(event) => setChallengeForm((current) => ({...current, partnershipId:event.target.value}))}>{activePartnerships.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="partner-field"><span>Challenge</span><select value={challengeForm.duration === "custom" ? "custom" : challengeForm.duration} onChange={(event) => setChallengeForm((current) => ({...current,duration:event.target.value==="custom"?"custom":event.target.value,title:event.target.value==="7"?"7-Day Bible Reading Challenge":event.target.value==="14"?"14-Day Consistency Challenge":event.target.value==="30"?"30-Day Bible Reading Challenge":current.title}))}><option value="7">7-Day Bible Reading Challenge</option><option value="14">14-Day Consistency Challenge</option><option value="30">30-Day Bible Reading Challenge</option><option value="custom">Custom duration</option></select></label>
          {challengeForm.duration === "custom" ? <><label className="partner-field"><span>Challenge name</span><input value={challengeForm.title} onChange={(event) => setChallengeForm((current) => ({...current,title:event.target.value}))} maxLength={100} minLength={3} placeholder="A name for your challenge"/></label><label className="partner-field"><span>Length in days</span><input type="number" min="3" max="365" value={challengeForm.customDuration || "21"} onChange={(event) => setChallengeForm((current) => ({...current,customDuration:event.target.value}))}/></label></> : null}
          <button type="submit" className="partner-primary-action partner-challenge-submit" disabled={busy || !user?.id || !selectedChallengePartnership} aria-busy={busy}>{busy ? <span className="partner-button-spinner" aria-hidden="true"/> : null}{busy ? "Starting Challenge..." : "Start Challenge"}{!busy ? <PartnerIcon name="arrow"/> : null}</button>
        </form> : <div className="partner-inline-empty"><strong>Start a partnership first</strong><span>Challenges become available after everyone accepts an invitation.</span></div>}
      </div><div className="partner-challenge-list">
        <div className="partner-milestone-shelf"><small>SHARED MILESTONES</small><div>{MILESTONES.map((milestone) => <article key={milestone} className={strongestSharedStreak >= milestone ? "is-earned" : ""}><span><PartnerIcon name="spark"/></span><strong>{milestone}</strong><small>{strongestSharedStreak >= milestone ? "Earned" : "days"}</small></article>)}</div><p>{nextMilestone ? `${Math.max(nextMilestone - strongestSharedStreak,0)} more completed reading ${nextMilestone - strongestSharedStreak === 1 ? "day" : "days"} to your next shared milestone.` : "You’ve reached every shared streak milestone. Keep walking together."}</p></div>
        {challenges.length ? <div className="partner-active-challenges">{challenges.map((challenge) => {
          const participants = challengeMembers.filter((item) => item.challenge_id === challenge.id);
          const participantStats = participants.map((participant) => {
            const summary = partnerSummaries[participant.user_id];
            const completedDays = (summary?.calendar || []).filter((day) => day.date >= challenge.starts_on && day.date <= today && day.status === "completed").length;
            return { participant, summary, completedDays };
          });
          const totalTarget = challenge.duration_days * Math.max(participants.length,1);
          const progress = percent(participantStats.reduce((sum,item) => sum + item.completedDays,0),totalTarget);
          const finished = participantStats.length > 0 && participantStats.every((item) => item.completedDays >= challenge.duration_days);
          const closed = challenge.status === "ended" || challenge.ends_on < today;
          const remaining = Math.max(0,Math.round((new Date(`${challenge.ends_on}T12:00:00Z`) - new Date(`${today}T12:00:00Z`))/86400000));
          return <article id={`partner-challenge-${challenge.id}`} tabIndex={-1} className={`partner-challenge-card${finished ? " is-finished" : ""}`} key={challenge.id}>
            <div className="partner-challenge-card-heading">
              <span className="partner-challenge-badge"><PartnerIcon name={finished?"check":"flame"}/></span>
              <div><small>{finished ? "CHALLENGE COMPLETE" : closed ? "CHALLENGE CLOSED" : `${remaining} DAYS LEFT`}</small><h4>{challenge.title}</h4></div>
              <strong className="partner-challenge-progress-value">{progress}%</strong>
              <div className="partner-action-menu">
                <button type="button" className="partner-action-menu-button" aria-label={`Actions for ${challenge.title}`} aria-expanded={openActionMenu === `challenge-${challenge.id}`} onClick={() => setOpenActionMenu(openActionMenu === `challenge-${challenge.id}` ? "" : `challenge-${challenge.id}`)}><PartnerIcon name="more"/></button>
                {openActionMenu === `challenge-${challenge.id}` ? <div className="partner-action-menu-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setOpenActionMenu(""); window.requestAnimationFrame(() => document.getElementById(`partner-challenge-${challenge.id}`)?.scrollIntoView({block:"center"})); }}><PartnerIcon name="arrow"/>View Challenge</button>
                  {challenge.status === "active" && !closed && challenge.created_by === user.id ? <button type="button" role="menuitem" disabled={busy} onClick={() => { setOpenActionMenu(""); endChallenge(challenge); }}><PartnerIcon name="check"/>Close Challenge</button> : null}
                  {closed && challenge.created_by === user.id ? <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenActionMenu(""); setDeleteConfirm({kind:"challenge",item:challenge}); }}><PartnerIcon name="trash"/>Delete Challenge</button> : null}
                </div> : null}
              </div>
            </div>
            <div className="partner-challenge-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><i style={{width:`${progress}%`}}/></div>
            <div className="partner-challenge-dates"><span>{formatDate(challenge.starts_on)} – {formatDate(challenge.ends_on)}</span><span>{challenge.duration_days} days · {participants.length} participants</span></div>
            <div className="partner-challenge-contributors">{participantStats.map(({participant,summary,completedDays}) => <div key={participant.user_id}><Identity person={profileById.get(participant.user_id)} size="small"/><span className="partner-challenge-contributor-name">{participant.user_id===user.id?"You":profileById.get(participant.user_id)?.full_name||"Partner"}</span><strong>{Math.min(completedDays,challenge.duration_days)} / {challenge.duration_days} days</strong>{summary?.calendar?.some((day)=>day.date===today&&day.status==="completed")?<i aria-label="Completed today"><PartnerIcon name="check"/></i>:null}</div>)}</div>
          </article>;
        })}</div> : <div className="partner-challenge-empty"><div className="partner-challenge-empty-mark"><PartnerIcon name="spark"/></div><strong>Your first shared challenge starts here</strong><span>Choose a gentle 7, 14, or 30-day rhythm with your circle.</span></div>}
      </div></div>
    </section> : null}

    {activeSection === "moments" ? <section id="partner-panel-moments" className="partner-moments-section" role="tabpanel" aria-labelledby="partner-tab-moments" tabIndex={0}>
      <div className="partner-section-title"><div><small>ALONG THE WAY</small><h3>Encouragement &amp; activity</h3></div><span className="partner-live-label"><i/> Updates in real time</span></div>
      <div className="partner-moments-layout"><div className="partner-message-panel"><div className="partner-message-heading"><span className="partner-message-icon"><PartnerIcon name="chat"/></span><div><strong>Send a little encouragement</strong><small>Words that help each other keep going.</small></div></div>
        {activePartnerships.length ? <><label className="partner-field"><span>Share with</span><select value={messagePartnership || activePartnerships[0]?.id || ""} onChange={(event) => setMessagePartnership(event.target.value)}>{activePartnerships.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="partner-quick-messages">{QUICK_MESSAGES.map((message) => <button type="button" key={message} disabled={busy} onClick={() => sendMessage(messagePartnership || activePartnerships[0]?.id,message)}>{message}</button>)}</div>
          <form className="partner-message-form" onSubmit={(event) => { event.preventDefault(); void sendMessage(messagePartnership || activePartnerships[0]?.id,messageDraft); }}><textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value.slice(0,300))} maxLength={300} placeholder="Write something kind…" aria-label="Write an encouragement"/><div><small>{messageDraft.length}/300</small><button type="submit" className="partner-primary-action" disabled={busy || !messageDraft.trim()}><PartnerIcon name="message"/> Send</button></div></form>
        </> : <p className="partner-moments-empty">Start a partnership to send encouragement and celebrate together.</p>}
        {messages.length ? <section className="partner-recent-messages" aria-label="Recent encouragement">
          <div className="partner-recent-messages-heading">
            <div><small>RECENT ENCOURAGEMENTS</small><span>{recentMessagesExpanded ? "The latest words shared in your circle." : `${messages.length} recent ${messages.length === 1 ? "message" : "messages"}`}</span></div>
            <button type="button" className={`partner-moments-toggle${recentMessagesExpanded ? " is-expanded" : ""}`} aria-label={`${recentMessagesExpanded ? "Collapse" : "Expand"} Recent Encouragement`} aria-expanded={recentMessagesExpanded} onClick={() => setRecentMessagesExpanded((current) => !current)}><PartnerIcon name="chevronDown"/></button>
          </div>
          {recentMessagesExpanded ? messages.slice(0,4).map((message) => {
            const author = profileById.get(message.user_id);
            const own = message.user_id === user.id;
            return <article key={message.id}>
              <Identity person={author} size="small"/>
              <div><strong>{own ? "You" : author?.full_name || "Partner"}</strong><time>{relativeCopy(message.created_at)}</time><p>{message.content}</p>
                <div className="partner-reaction-row">{REACTIONS.map(([reaction,emoji,label]) => {
                  const matching = messageReactions.filter((row) => row.message_id === message.id && row.reaction === reaction);
                  const mine = matching.some((row) => row.user_id === user.id);
                  return <button key={reaction} type="button" title={label} aria-label={`${label} reaction${mine ? ", remove yours" : ""}`} aria-pressed={mine} onClick={() => void toggleReaction("bible_study_partner_message_reactions","message_id",message.id,reaction,messageReactions,setMessageReactions)}>{emoji}<small>{matching.length || ""}</small></button>;
                })}</div>
              </div>
              {own ? <div className="partner-action-menu partner-message-action-menu">
                <button type="button" className="partner-action-menu-button" aria-label="Encouragement actions" aria-expanded={openActionMenu === `message-${message.id}`} onClick={() => setOpenActionMenu(openActionMenu === `message-${message.id}` ? "" : `message-${message.id}`)}><PartnerIcon name="more"/></button>
                {openActionMenu === `message-${message.id}` ? <div className="partner-action-menu-popover" role="menu"><button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenActionMenu(""); setDeleteConfirm({kind:"message",item:message}); }}><PartnerIcon name="trash"/>Delete Encouragement</button></div> : null}
              </div> : null}
            </article>;
          }) : null}
        </section> : null}
      </div>
      <div className="partner-activity-panel"><div className="partner-activity-heading"><span className="partner-activity-mark"><PartnerIcon name="spark"/></span><div><strong>Moments that matter</strong><small>{momentsExpanded ? "Real reading milestones from your circle." : `${events.length} ${events.length === 1 ? "moment" : "moments"} in your circle`}</small></div><button type="button" className={`partner-moments-toggle${momentsExpanded?" is-expanded":""}`} aria-label={`${momentsExpanded?"Collapse":"Expand"} Moments that matter`} aria-expanded={momentsExpanded} onClick={() => setMomentsExpanded((current) => !current)}><PartnerIcon name="chevronDown"/></button></div>
        {momentsExpanded && (events.length ? <div className="partner-activity-feed">{events.slice(0,8).map((event) => {
          const author=profileById.get(event.actor_id);const reading=readings.find((item)=>item.id===event.reading_id);const activityMember=(membersByPartnership.get(event.partnership_id)||[]).find((member)=>member.user_id===event.actor_id&&member.status==="active");let eventText=event.event_type==="group_reading_completed"?`completed ${reading?`${reading.book} ${reading.chapter}`:"a shared reading"}`:event.event_type==="personal_reading_completed"?"completed a personal Bible reading":event.event_type==="shared_day_completed"?"joined everyone in completing today’s assignment":event.event_type==="encouragement_sent"?"sent a word of encouragement":event.event_type==="milestone_reached"?"reached a streak milestone":"completed a reading challenge";const matching=eventReactions.filter((row)=>row.event_id===event.id);
          if(event.event_type==="milestone_reached")eventText=`reached a ${event.metadata?.milestone||"shared"}-day shared milestone`;
          if(event.event_type==="challenge_completed")eventText=`completed “${event.metadata?.title||"a reading challenge"}” together`;
          return <article className="partner-activity-item" key={event.id}>
            <Identity person={author} size="small"/>
            <div className="partner-activity-copy"><p><strong>{author?.full_name||"A partner"}</strong> {eventText}</p><time dateTime={event.created_at}>{relativeCopy(event.created_at)}</time><div className="partner-reaction-row">{REACTIONS.map(([reaction,emoji,label])=>{const mine=matching.some((row)=>row.user_id===user.id&&row.reaction===reaction);const count=matching.filter((row)=>row.reaction===reaction).length;return <button key={reaction} type="button" title={label} aria-label={`${label} reaction${mine?", remove yours":""}`} aria-pressed={mine} onClick={()=>void toggleReaction("bible_study_partner_event_reactions","event_id",event.id,reaction,eventReactions,setEventReactions)}>{emoji}<small>{count||""}</small></button>;})}</div>{activityMember&&activityMember.user_id!==user.id?<button type="button" className="partner-activity-profile-action" onClick={()=>openMember(activityMember,event.partnership_id)}>View {author?.full_name?.split(" ")[0]||"partner"}’s reading progress <PartnerIcon name="arrow"/></button>:null}</div>
            {event.actor_id === user.id ? <div className="partner-action-menu partner-activity-action-menu">
              <button type="button" className="partner-action-menu-button" aria-label="Activity actions" aria-expanded={openActionMenu === `event-${event.id}`} onClick={() => setOpenActionMenu(openActionMenu === `event-${event.id}` ? "" : `event-${event.id}`)}><PartnerIcon name="more"/></button>
              {openActionMenu === `event-${event.id}` ? <div className="partner-action-menu-popover" role="menu"><button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenActionMenu(""); setDeleteConfirm({kind:"activity",item:event}); }}><PartnerIcon name="trash"/>Delete Activity</button></div> : null}
            </div> : <span className="partner-activity-event-icon"><PartnerIcon name={event.event_type==="group_reading_completed"?"book":"spark"}/></span>}
          </article>;
        })}</div> : <div className="partner-challenge-empty"><div className="partner-challenge-empty-mark"><PartnerIcon name="book"/></div><strong>Your first shared moment is ahead</strong><span>Reading completions and partner celebrations will appear here as they happen.</span></div>)}
      </div></div>
    </section> : null}

    {selectedMember && typeof document !== "undefined" ? createPortal((() => {
      const person = profileById.get(selectedMember.memberId);
      const summary = partnerSummaries[selectedMember.memberId];
      const mySummary = partnerSummaries[user.id];
      const myRun = getCurrentRun(mySummary);
      const partnerRun = getCurrentRun(summary);
      const sharedStart = myRun.start && partnerRun.start ? (myRun.start > partnerRun.start ? myRun.start : partnerRun.start) : null;
      const sharedEnd = myRun.end && partnerRun.end ? (myRun.end < partnerRun.end ? myRun.end : partnerRun.end) : null;
      const sharedDays = sharedStart && sharedEnd && sharedEnd >= sharedStart
        ? Math.floor((new Date(`${sharedEnd}T12:00:00Z`) - new Date(`${sharedStart}T12:00:00Z`)) / 86400000) + 1
        : 0;
      const nextSharedMilestone = MILESTONES.find((milestone) => milestone > sharedDays);
      const partnership = partnershipsById.get(selectedMember.partnershipId);
      const memberStatus = assignedToday.length ? hasReadings(selectedMember.memberId) ? "completed" : "pending" : "scheduled";
      return <div className="partner-profile-backdrop partner-experience" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelectedMember(null);}}><section className="partner-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="partner-profile-title" aria-describedby="partner-profile-description" tabIndex={-1}>
        <header className="partner-profile-header"><div className="partner-profile-person"><Identity person={person} size="large"/><div><small id="partner-profile-description">PARTNER READING PROFILE</small><h2 id="partner-profile-title">{person?.full_name||"Your partner"}</h2><span>{partnership?.name||"Shared reading circle"}</span></div></div><button ref={partnerProfileCloseRef} type="button" className="partner-sheet-close" aria-label="Close partner profile" onClick={()=>setSelectedMember(null)}><PartnerIcon name="close"/></button></header>
        <div className="partner-profile-content">
          {!summary ? <div className="partner-profile-private-state"><PartnerIcon name="book"/><strong>Reading history isn’t available yet</strong><span>Once the partner history update is active, accepted members can view reading dates and totals. Private notes remain private.</span></div> : <>
            <div className="partner-profile-stats"><article className="is-highlight"><small>PERSONAL STREAK</small><strong><PartnerIcon name="flame"/>{summary.current_streak||0}<span>days</span></strong><span>Longest {summary.longest_streak||0} days</span></article><article><small>CHAPTERS READ</small><strong>{summary.completed_chapters||0}</strong><span>Completed Scripture readings</span></article><article><small>THIS WEEK</small><strong>{percent(summary.weekly_completed||0,summary.weekly_elapsed||0)}%</strong><span>{summary.weekly_completed||0} reading days</span></article><article><small>THIS MONTH</small><strong>{percent(summary.monthly_completed||0,summary.monthly_elapsed||0)}%</strong><span>{summary.monthly_completed||0} reading days</span></article></div>
            {mySummary ? <section className="partner-profile-comparison" aria-label="Your personal reading compared with your partner"><div className="partner-profile-comparison-heading"><div><small>PERSONAL PROGRESS · SIDE BY SIDE</small><strong>Your shared rhythm</strong></div><span>{sharedDays ? `${sharedDays} overlapping days` : partnerRun.days > myRun.days ? "Your partner is ahead" : myRun.days > partnerRun.days ? "You are ahead" : "Ready to grow together"}</span></div><div className="partner-profile-comparison-grid">{[[user.id,"You",mySummary,myRun],[selectedMember.memberId,person?.full_name||"Partner",summary,partnerRun]].map(([memberId,label,progress,run])=>{const week=percent(progress?.weekly_completed||0,progress?.weekly_elapsed||0);const month=percent(progress?.monthly_completed||0,progress?.monthly_elapsed||0);return <article key={memberId} className="partner-profile-compare-person"><div><Identity person={profileById.get(memberId)} size="small"/><span><strong>{label}</strong><small>{run.days} day current run · {progress?.longest_streak||0} longest</small></span></div><span className="partner-profile-compare-bar"><small>This week <b>{week}%</b></small><i><em style={{width:`${week}%`}}/></i></span><span className="partner-profile-compare-bar"><small>This month <b>{month}%</b></small><i><em style={{width:`${month}%`}}/></i></span><small className="partner-profile-compare-chapters">{progress?.completed_chapters||0} completed chapters</small></article>;})}</div><p>{sharedDays ? `You’ve shared ${sharedDays} consecutive current day${sharedDays===1?"":"s"}.` : "Your personal reading histories stay separate while you encourage each other."}{nextSharedMilestone?` ${nextSharedMilestone-sharedDays} more overlapping days to the next shared milestone.`:" You’ve reached the final shared milestone."}</p></section> : null}
            <div className="partner-profile-today"><span className={`partner-profile-today-mark is-${memberStatus}`}>{memberStatus==="completed"?<PartnerIcon name="check"/>:memberStatus==="scheduled"?<PartnerIcon name="calendar"/>:"·"}</span><div><small>TODAY’S READING</small><strong>{memberStatus==="completed"?"Reading complete":memberStatus==="scheduled"?"No chapter scheduled":"Reading still to come"}</strong><span>{assignedToday.length?assignedToday.map((reading)=>`${reading.book} ${reading.chapter}`).join(", "):"Their reading activity stays private outside accepted partnerships."}</span></div></div>
            <ReadingCalendar summary={summary} month={calendarMonth||currentMonth} onMonthChange={setCalendarMonth} selectedDate={selectedDate} onSelectDate={setSelectedDate} today={today}/>
            <div className="partner-profile-note"><PartnerIcon name="spark"/><span>Only reading dates, completed chapter totals, and streak summaries are shared in this partnership. Personal notes and reflections stay private.</span></div>
          </>}
        </div>
      </section></div>;
    })(), document.body) : null}
  </section>
  {deleteConfirm && typeof document !== "undefined" ? createPortal(
    <div className="partner-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteBusy) setDeleteConfirm(null); }}>
      <section className="partner-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="partner-confirm-title" aria-describedby="partner-confirm-copy">
        <span className="partner-confirm-mark" aria-hidden="true"><PartnerIcon name="trash"/></span>
        <h2 id="partner-confirm-title">{deleteConfirm.kind === "challenge" ? "Delete this challenge?" : deleteConfirm.kind === "message" ? "Delete this encouragement?" : "Delete this activity?"}</h2>
        <p id="partner-confirm-copy">{deleteConfirm.kind === "challenge"
          ? "This challenge and its participation history will be removed. This action cannot be undone."
          : deleteConfirm.kind === "message"
            ? "This encouragement and its related activity entry will be removed from your circle. This action cannot be undone."
            : "This activity will be removed from your shared history. This action cannot be undone."}</p>
        <div className="partner-confirm-actions">
          <button type="button" className="partner-confirm-cancel" disabled={deleteBusy} onClick={() => setDeleteConfirm(null)}>Cancel</button>
          <button type="button" className="partner-confirm-delete" disabled={deleteBusy} onClick={() => void confirmDelete()}>{deleteBusy ? "Deleting..." : deleteConfirm.kind === "challenge" ? "Delete Challenge" : deleteConfirm.kind === "message" ? "Delete Encouragement" : "Delete Activity"}</button>
        </div>
      </section>
    </div>,
    document.body
  ) : null}
  {challengeSuccess && typeof document !== "undefined" ? createPortal(
    <div className="partner-challenge-success-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setChallengeSuccess(null);
    }}>
      <section className="partner-challenge-success-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-challenge-success-title" aria-describedby="partner-challenge-success-copy">
        <button ref={challengeSuccessCloseRef} type="button" className="partner-challenge-success-close" aria-label="Close challenge confirmation" onClick={() => setChallengeSuccess(null)}><PartnerIcon name="close"/></button>
        <span className="partner-challenge-success-mark" aria-hidden="true"><PartnerIcon name="check"/></span>
        <p className="partner-challenge-success-eyebrow">YOUR SHARED JOURNEY BEGINS</p>
        <h2 id="partner-challenge-success-title">Challenge Started!</h2>
        <p id="partner-challenge-success-copy">A steady rhythm grows one day at a time. Your partnership is ready to begin this reading journey together.</p>
        <strong className="partner-challenge-success-name">{challengeSuccess.title}</strong>
        <span className="partner-challenge-success-dates">{challengeSuccess.duration_days} days · {formatDate(challengeSuccess.starts_on)} – {formatDate(challengeSuccess.ends_on)}</span>
        <button type="button" className="partner-challenge-success-action" onClick={viewStartedChallenge}>View Challenge <PartnerIcon name="arrow"/></button>
      </section>
    </div>,
    document.body
  ) : null}
  </>;
}
