import { useEffect, useMemo, useState } from "react";
import {
  addReadingDays,
  BIBLE_STREAK_MILESTONES,
  getReadingWeekStart,
  getReadingDateInTimezone
} from "../lib/personalBibleStudy.js";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDate(date, timezone, options = { dateStyle: "medium" }) {
  void timezone;
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function dateFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function FlameMark({ id = "primary" }) {
  return <svg className="bible-streak-flame-svg" viewBox="0 0 72 88" role="img" aria-label="A glowing flame for your Bible streak">
    <defs>
      <linearGradient id={`bible-streak-flame-outer-${id}`} x1="12" y1="8" x2="62" y2="77" gradientUnits="userSpaceOnUse"><stop stopColor="#E8D3A0"/><stop offset=".48" stopColor="#D6B66F"/><stop offset="1" stopColor="#A77AC6"/></linearGradient>
      <linearGradient id={`bible-streak-flame-inner-${id}`} x1="27" y1="38" x2="50" y2="77" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset="1" stopColor="#B995CF"/></linearGradient>
    </defs>
    <path className="bible-streak-flame-outer" d="M41 4c2 16-7 19-4 31 2 6 7 8 10 4 4-5 3-12 1-17 12 9 19 21 18 34C65 73 52 84 36 84 18 84 6 72 6 55c0-15 9-25 20-36-1 11 1 15 5 15 6 0 8-11 10-30Z" fill={`url(#bible-streak-flame-outer-${id})`}/>
    <path d="M37 45c1 8-5 12-4 19 .5 4 3 6 6 4 2-2 3-5 2-8 6 5 8 10 7 15-1 7-6 11-13 11-8 0-13-5-13-12 0-7 5-13 10-19 0 5 1 7 3 7 3 0 3-8 2-17Z" fill={`url(#bible-streak-flame-inner-${id})`}/>
  </svg>;
}

function statusLabel(status) {
  return ({
    completed: "Completed",
    in_progress: "In progress",
    protected: "Streak protected",
    missed: "No reading recorded",
    pending: "Today's reading",
    scheduled: "Reading scheduled",
    future: "Upcoming"
  })[status] || "No reading scheduled";
}

export function BibleStreakCard({ summary, achievements, readings, notes, freezeHistory = [], onUseFreeze, freezeBusy, timezone, celebration, onCloseCelebration }) {
  const today = summary?.today || getReadingDateInTimezone(new Date(), timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const [year, month] = today.split("-").map(Number);
    return { year, month };
  });
  const calendar = summary?.calendar || [];
  const calendarByDate = useMemo(() => new Map(calendar.map((day) => [day.date, day])), [calendar]);
  const selectedDay = calendarByDate.get(selectedDate);
  const readingRowsForDay = readings.filter((reading) => reading.status === "completed" && reading.completed_at
    && getReadingDateInTimezone(new Date(reading.completed_at), timezone) === selectedDate)
    .sort((left, right) => new Date(left.completed_at) - new Date(right.completed_at));
  const weekStart = getReadingWeekStart(today);
  const weekDates = Array.from({ length: 7 }, (_, index) => addReadingDays(weekStart, index));
  const currentStreak = Number(summary?.current_streak || 0);
  const longestStreak = Number(summary?.longest_streak || 0);
  const nextMilestone = BIBLE_STREAK_MILESTONES.find((milestone) => milestone.days === Number(summary?.next_milestone)) || null;
  const previousMilestoneDays = [...BIBLE_STREAK_MILESTONES].reverse().find((milestone) => milestone.days <= currentStreak)?.days || 0;
  const milestoneProgress = nextMilestone
    ? Math.min(100, Math.max(0, (currentStreak - previousMilestoneDays) / (nextMilestone.days - previousMilestoneDays) * 100))
    : 100;
  const earned = new Map(achievements.map((item) => [Number(item.milestone_days), item]));
  const firstCalendarDate = calendar[0]?.date || today;

  function moveMonth(direction) {
    setVisibleMonth((month) => {
      const moved = new Date(Date.UTC(month.year, month.month - 1 + direction, 1));
      return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1 };
    });
  }

  const firstDay = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1));
  const daysInMonth = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 0)).getUTCDate();
  const leading = (firstDay.getUTCDay() + 6) % 7;
  const monthCells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    return day > 0 && day <= daysInMonth ? dateFromParts(visibleMonth.year, visibleMonth.month, day) : null;
  });
  const monthMinimum = firstCalendarDate.slice(0, 7);
  const monthKey = `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, "0")}`;
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const todayCompleted = Boolean(summary?.today_complete);
  const requirementCopy = summary?.daily_requirement === "all_assigned"
    ? `Complete all ${summary?.today_required_count || 1} chapters scheduled for today.`
    : "Complete at least one personal chapter today.";
  const statusText = todayCompleted
    ? "Today's reading is complete. Another day rooted in the Word."
    : summary?.today_status === "in_progress"
      ? `${Math.max((summary?.today_required_count || 1) - (summary?.today_completed_count || 0), 1)} more chapter${(summary?.today_required_count || 1) - (summary?.today_completed_count || 0) === 1 ? "" : "s"} to finish today's reading.`
      : "Every meaningful journey begins with one day. Start your reading today.";
  const lastReading = summary?.last_reading;

  useEffect(() => {
    setSelectedDate(today);
    const [year, month] = today.split("-").map(Number);
    setVisibleMonth({ year, month });
  }, [today]);

  function selectDate(date) {
    setSelectedDate(date);
    const [year, month] = date.split("-").map(Number);
    setVisibleMonth({ year, month });
  }

  const streakLevel = currentStreak >= 30 ? "golden" : currentStreak >= 14 ? "brilliant" : currentStreak >= 7 ? "bright" : currentStreak >= 3 ? "growing" : "beginning";
  return <>
    <section className={`bible-streak-card is-${streakLevel}${celebration ? " is-celebrating" : ""}`} aria-labelledby="bible-streak-heading">
      <div className="bible-streak-glow" aria-hidden="true" />
      <div className="bible-streak-card-topline"><div><small>YOUR BIBLE STREAK</small><h2 id="bible-streak-heading">Stay rooted in the Word. Grow every day.</h2></div><span className="bible-streak-live"><i /> Live progress</span></div>
      <div className="bible-streak-primary">
        <div className="bible-streak-flame-wrap" aria-hidden="true"><FlameMark id="card" /></div>
        <div className="bible-streak-count-wrap"><div className="bible-streak-count-ring" style={{ "--bible-ring-progress": `${milestoneProgress}%` }} role="img" aria-label={`${currentStreak} day current streak, ${milestoneProgress}% toward the next milestone`}><strong key={currentStreak} className="bible-streak-count">{currentStreak}</strong></div><span>{currentStreak === 1 ? "DAY" : "DAYS"}</span><small>{currentStreak ? "Your consistency is growing." : "Begin again, one reading at a time."}</small></div>
        <div className="bible-streak-today"><span className={`bible-streak-status-dot ${todayCompleted ? "complete" : summary?.today_status === "in_progress" ? "progress" : "pending"}`} /><div><strong>{todayCompleted ? "Today's reading · Completed" : summary?.today_status === "in_progress" ? "Today's reading · In progress" : "Today's reading · Not started"}</strong><p>{statusText}</p><small>{requirementCopy}</small></div></div>
      </div>
      <div className="bible-streak-metrics">
        <article><span>Longest streak</span><strong>{longestStreak} {longestStreak === 1 ? "day" : "days"}</strong></article>
        <article><span>This week</span><strong>{summary?.weekly_completed || 0}/{summary?.weekly_elapsed || 0} days</strong><small>{summary?.weekly_percentage || 0}% consistency</small></article>
        <article><span>This month</span><strong>{summary?.monthly_completed || 0}/{summary?.monthly_elapsed || 0} days</strong><small>{summary?.monthly_percentage || 0}% consistency</small></article>
        <article><span>Best week</span><strong>{summary?.best_weekly_days || 0} days</strong><small>Completed readings</small></article>
      </div>
      <div className="bible-streak-week-chart" role="img" aria-label="Weekly Bible reading activity chart">{weekDates.map((date, index) => { const day = calendarByDate.get(date); const status = day?.status || (date > today ? "future" : "pending"); const height = status === "completed" || status === "protected" ? 100 : status === "in_progress" ? 62 : status === "missed" ? 18 : 8; return <div className={`bible-streak-week-chart-day is-${status}`} key={date} title={`${DAY_NAMES[index]} ${formatDate(date, timezone)} · ${statusLabel(status)}`}><i style={{ "--week-bar-height": `${height}%` }}/><small>{DAY_NAMES[index]}</small></div>; })}</div>
      <div className="bible-streak-week" aria-label="This week's Bible reading consistency">
        {weekDates.map((date, index) => {
          const day = calendarByDate.get(date);
          const status = day?.status || (date > today ? "future" : "pending");
          return <button type="button" key={date} className={`bible-streak-week-day is-${status}${date === today ? " is-today" : ""}`} onClick={() => selectDate(date)} aria-label={`${DAY_NAMES[index]}, ${formatDate(date, timezone, { dateStyle: "long" })}: ${statusLabel(status)}`} aria-pressed={selectedDate === date}>
            <span>{DAY_NAMES[index]}</span><i aria-hidden="true">{status === "completed" ? "✓" : status === "protected" ? "◇" : status === "missed" ? "·" : ""}</i><small>{Number(date.slice(-2))}</small>
          </button>;
        })}
      </div>
      <div className="bible-streak-next-milestone"><div className="bible-streak-milestone-copy"><span>{nextMilestone ? "NEXT MILESTONE" : "ALL MILESTONES REACHED"}</span><strong>{nextMilestone ? `${nextMilestone.days} days · ${nextMilestone.title}` : "A year in the Word"}</strong><small>{nextMilestone ? `${summary?.days_to_milestone || 0} more day${summary?.days_to_milestone === 1 ? "" : "s"} to your next milestone.` : "Keep growing at your own pace."}</small></div><div className="bible-streak-milestone-track" role="progressbar" aria-label="Progress toward next Bible reading milestone" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(milestoneProgress)}><i style={{ width: `${milestoneProgress}%` }} /></div></div>
      <div className="bible-streak-footer"><span>{lastReading ? `Last completed · ${lastReading.book} ${lastReading.chapter} · ${formatDate(lastReading.local_date, timezone)}` : "Your first completed reading will begin your history."}</span>{summary?.freeze_enabled ? <div className="bible-streak-freeze"><span>{summary.freeze_auto_use ? "Automatic Streak Freeze is on" : `${summary.freezes_available || 0} Streak Freeze${summary.freezes_available === 1 ? "" : "s"} available`}</span>{summary.freeze_eligible_date && !summary.freeze_auto_use ? <button type="button" disabled={freezeBusy} onClick={() => onUseFreeze(summary.freeze_eligible_date)}>{freezeBusy ? "Protecting…" : `Protect ${formatDate(summary.freeze_eligible_date, timezone)}`}</button> : null}{freezeHistory.length ? <small>Last used {formatDate(freezeHistory[0].local_date, timezone)} · {freezeHistory[0].source === "automatic" ? "automatic" : "by you"}</small> : null}</div> : null}</div>
    </section>

    <section className="bible-streak-calendar-panel bible-panel" aria-labelledby="bible-calendar-heading">
      <div className="bible-streak-section-heading"><div><small>YOUR READING HISTORY</small><h2 id="bible-calendar-heading">A rhythm built day by day</h2><p>Choose a date to see completed chapters and your private notes.</p></div><div className="bible-streak-month-nav"><button type="button" onClick={() => moveMonth(-1)} disabled={monthKey <= monthMinimum} aria-label="Show previous month">‹</button><strong>{monthTitle}</strong><button type="button" onClick={() => moveMonth(1)} disabled={monthKey >= (summary?.today || today).slice(0, 7)} aria-label="Show next month">›</button></div></div>
      <div className="bible-streak-calendar-grid" role="grid" aria-label={`${monthTitle} reading calendar`}>
        {DAY_NAMES.map((day) => <span className="bible-streak-calendar-weekday" key={day}>{day}</span>)}
        {monthCells.map((date, index) => {
          if (!date) return <span className="bible-streak-calendar-blank" key={`blank-${index}`} aria-hidden="true" />;
          const day = calendarByDate.get(date);
          const status = day?.status || (date > today ? "future" : "missed");
          return <button type="button" key={date} role="gridcell" className={`bible-streak-calendar-day is-${status}${date === today ? " is-today" : ""}${date === selectedDate ? " is-selected" : ""}`} onClick={() => selectDate(date)} aria-pressed={date === selectedDate} aria-label={`${formatDate(date, timezone, { dateStyle: "full" })}: ${statusLabel(status)}`} title={`${date} · ${statusLabel(status)}`}>
            <span>{Number(date.slice(-2))}</span><i aria-hidden="true">{status === "completed" ? "✓" : status === "protected" ? "◇" : status === "missed" ? "·" : status === "scheduled" ? "○" : ""}</i>
          </button>;
        })}
      </div>
      <div className="bible-streak-calendar-legend" aria-label="Calendar legend">
        {["completed", "missed", "pending", "scheduled", "protected", "future"].map((status) => <span key={status}><i className={`is-${status}`} />{status === "pending" ? "Today" : statusLabel(status)}</span>)}
      </div>
      <div className="bible-streak-selected-day" aria-live="polite">
        <div className="bible-streak-selected-day-heading"><div><small>{selectedDate === today ? "TODAY" : formatDate(selectedDate, timezone, { weekday: "long" }).toUpperCase()}</small><h3>{formatDate(selectedDate, timezone)}</h3></div><span className={`bible-streak-day-status is-${selectedDay?.status || "future"}`}>{statusLabel(selectedDay?.status)}</span></div>
        {readingRowsForDay.length ? <div className="bible-streak-reading-list">{readingRowsForDay.map((reading) => {
          const relatedNotes = notes.filter((note) => note.book === reading.book && note.chapter === reading.chapter);
          return <article key={reading.id}><div><strong>{reading.book} {reading.chapter}</strong><time dateTime={reading.completed_at}>{new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: timezone }).format(new Date(reading.completed_at))}</time></div>{relatedNotes.length ? <details><summary>{relatedNotes.length} private note{relatedNotes.length === 1 ? "" : "s"}</summary>{relatedNotes.map((note) => <p key={note.id}><strong>{note.verse_reference || note.note_type.replaceAll("_", " ")}</strong> · {note.content}</p>)}</details> : <small>No private note saved for this chapter.</small>}</article>;
        })}</div> : <p className="bible-streak-day-empty">{selectedDay?.status === "scheduled" ? `${selectedDay.assigned_count} chapter${selectedDay.assigned_count === 1 ? " is" : "s are"} scheduled for this future date.` : selectedDay?.status === "missed" ? "No completed personal reading is recorded for this day. Your history is still here whenever you are ready to begin again." : selectedDay?.status === "protected" ? "A Streak Freeze protected this day. Your reading history remains unchanged." : "No completed personal reading is recorded for this date."}</p>}
      </div>
    </section>

    <section className="bible-streak-achievements bible-panel" aria-labelledby="bible-streak-achievements-heading">
      <div className="bible-streak-section-heading"><div><small>YOUR BIBLE CONSISTENCY COLLECTION</small><h2 id="bible-streak-achievements-heading">Milestones in the Word</h2><p>Earned milestones stay with you, even when a new streak begins.</p></div><span className="bible-streak-achievement-count">{achievements.length} / {BIBLE_STREAK_MILESTONES.length} earned</span></div>
      <div className="bible-streak-achievement-grid">{BIBLE_STREAK_MILESTONES.map((milestone) => {
        const award = earned.get(milestone.days);
        return <article key={milestone.days} className={`bible-streak-achievement${award ? " is-earned" : " is-locked"}`}>
          <span className="bible-streak-achievement-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 2.8 20 5l4.7-.2 2 4.2 3.8 2.8-1.2 4.5 1.2 4.5-3.8 2.8-2 4.2L20 27.6l-4 2.2-4-2.2-4.7.2-2-4.2-3.8-2.8 1.2-4.5-1.2-4.5 3.8-2.8 2-4.2L12 5l4-2.2Z"/><path d="m10.5 16.2 3.5 3.5 7.5-8"/></svg></span>
          <div><span className="bible-streak-achievement-label">{milestone.label}</span><h3>{milestone.title}</h3><p>{milestone.description}</p><small>{award ? `Earned ${formatDate(award.earned_on, timezone)}` : `${milestone.days} completed reading day${milestone.days === 1 ? "" : "s"}`}</small></div>
        </article>;
      })}</div>
    </section>

    {celebration ? <div className="bible-streak-celebration-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseCelebration(); }}><section className={`bible-streak-celebration${celebration.milestone?` is-milestone-${celebration.milestone.days}`:""}`} role="dialog" aria-modal="true" aria-labelledby="bible-streak-celebration-title"><div className="bible-streak-celebration-particles" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div><FlameMark id="celebration"/><span className="bible-streak-celebration-overline">{celebration.milestone ? `${celebration.milestone.days} DAYS · ${celebration.milestone.label}` : "TODAY'S READING IS COMPLETE"}</span><h2 id="bible-streak-celebration-title">{celebration.milestone?.title || `${summary?.current_streak || 1} ${summary?.current_streak === 1 ? "day" : "days"} rooted in the Word`}</h2><p>{celebration.milestone?.description || "Another day rooted in the Word. Faithfulness is built one day at a time."}</p><strong className="bible-streak-celebration-count">{summary?.current_streak || 1} DAY{summary?.current_streak === 1 ? "" : "S"}</strong><button type="button" className="bible-btn primary" onClick={onCloseCelebration}>Continue your journey</button></section></div> : null}
  </>;
}
