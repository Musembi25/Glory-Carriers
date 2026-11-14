export const DEFAULT_BIBLE_TIMEZONE = "Africa/Nairobi";

export const BIBLE_STREAK_MILESTONES = [
  { days: 1, title: "First Steps", description: "Your Bible reading journey has begun.", label: "FIRST READING DAY" },
  { days: 3, title: "Three-Day Growth", description: "Three days of showing up in Scripture.", label: "THREE DAYS ROOTED" },
  { days: 7, title: "One Week Rooted", description: "A full week of consistency in the Word.", label: "ONE WEEK ROOTED" },
  { days: 14, title: "Two Weeks Faithful", description: "Two weeks of steady time in Scripture.", label: "TWO WEEKS FAITHFUL" },
  { days: 21, title: "Consistent Heart", description: "A meaningful rhythm is taking root.", label: "CONSISTENT HEART" },
  { days: 30, title: "One Month Rooted", description: "A month of growing through daily reading.", label: "ONE MONTH ROOTED" },
  { days: 60, title: "Growing Strong", description: "Two months of faithful consistency.", label: "GROWING STRONG" },
  { days: 90, title: "Scripture Discipline", description: "Ninety days rooted in the Word.", label: "SCRIPTURE DISCIPLINE" },
  { days: 100, title: "Century of Consistency", description: "One hundred days of making space for Scripture.", label: "100 DAYS ROOTED" },
  { days: 180, title: "Half-Year Journey", description: "Half a year of steady growth in the Word.", label: "HALF-YEAR JOURNEY" },
  { days: 365, title: "Year in the Word", description: "A remarkable year of daily Bible reading.", label: "A YEAR IN THE WORD" }
];

export function getReadingDateInTimezone(value = new Date(), timezone = DEFAULT_BIBLE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}`;
}

export function getLocalReadingDate(value = new Date()) {
  return getReadingDateInTimezone(value, DEFAULT_BIBLE_TIMEZONE);
}

export function addReadingDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getReadingWeekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function summarizePersonalReadings(readings = []) {
  const completed = readings.filter((reading) => reading.status === "completed" && reading.completed_at);
  const nextReading = [...readings]
    .filter((reading) => reading.status !== "completed")
    .sort((left, right) => left.reading_date.localeCompare(right.reading_date))[0] ?? null;

  const byBook = Object.values(readings.reduce((groups, reading) => {
    const key = reading.book;
    const group = groups[key] ??= { book: key, completed: 0, total: 0 };
    group.total += 1;
    if (reading.status === "completed" && reading.completed_at) group.completed += 1;
    return groups;
  }, {})).sort((left, right) => left.book.localeCompare(right.book));

  return {
    completedCount: completed.length,
    totalCount: readings.length,
    completionPercent: readings.length ? Math.round(completed.length / readings.length * 100) : 0,
    nextReading,
    byBook
  };
}

export function summarizeGroupConsistency(readings = [], completions = [], activeMemberCount = 0, today, completionPercent = 50) {
  const dueReadings = readings.filter((reading) => reading.deleted_at == null && reading.status !== "draft" && reading.status !== "archived" && reading.reading_date <= today);
  const threshold = Math.max(1, Math.ceil(activeMemberCount * completionPercent / 100));
  const byDay = new Map();
  for (const reading of dueReadings) {
    const day = byDay.get(reading.reading_date) ?? { date: reading.reading_date, readings: [], completedReadings: 0, participants: new Set() };
    const participantIds = new Set(completions
      .filter((completion) => completion.reading_id === reading.id)
      .map((completion) => completion.user_id));
    if (participantIds.size >= threshold && activeMemberCount > 0) day.completedReadings += 1;
    participantIds.forEach((id) => day.participants.add(id));
    day.readings.push(reading);
    byDay.set(reading.reading_date, day);
  }
  const days = [...byDay.values()].map((day) => ({
    ...day,
    participants: day.participants.size,
    requiredParticipants: threshold,
    complete: activeMemberCount > 0 && day.completedReadings === day.readings.length
  })).sort((left, right) => left.date.localeCompare(right.date));

  let currentStreak = 0;
  for (let index = days.length - 1; index >= 0 && days[index].complete; index -= 1) currentStreak += 1;
  const nextMilestone = [7, 14, 30, 60, 90, 100, 180, 365].find((daysCount) => daysCount > currentStreak) ?? null;
  const weekStart = getReadingWeekStart(today);
  const weeklyDays = days.filter((day) => day.date >= weekStart && day.date <= today);
  const completedThisWeek = weeklyDays.filter((day) => day.complete).length;
  const weeklyConsistency = weeklyDays.length ? Math.round(completedThisWeek / weeklyDays.length * 100) : 0;

  let bestWeek = 0;
  const weekTotals = new Map();
  for (const day of days) {
    const week = getReadingWeekStart(day.date);
    weekTotals.set(week, (weekTotals.get(week) ?? 0) + Number(day.complete));
  }
  for (const total of weekTotals.values()) bestWeek = Math.max(bestWeek, total);

  let longestStreak = 0;
  let currentRun = 0;
  for (const day of days) {
    currentRun = day.complete ? currentRun + 1 : 0;
    longestStreak = Math.max(longestStreak, currentRun);
  }

  return {
    currentStreak,
    longestStreak,
    days,
    weeklyDays,
    completedThisWeek,
    weeklyScheduledDays: weeklyDays.length,
    weeklyConsistency,
    bestWeek,
    requiredParticipants: threshold,
    nextMilestone,
    daysToMilestone: nextMilestone == null ? null : nextMilestone - currentStreak
  };
}

export function summarizeGroupMemberActivity(readings = [], completions = [], sessions = [], profiles = [], selectedDate, today) {
  const activeMembers = profiles.filter((profile) => profile.is_active !== false);
  const availableForDate = readings.filter((reading) => reading.deleted_at == null
    && reading.status !== "draft" && reading.status !== "archived" && reading.reading_date === selectedDate);
  const datedReadings = readings.filter((reading) => reading.deleted_at == null
    && reading.status !== "draft" && reading.status !== "archived" && reading.reading_date <= today);
  const dates = [...new Set(datedReadings.map((reading) => reading.reading_date))].sort();
  const liveSessionByMember = new Map();
  for (const session of sessions) {
    if (!session.ended_at && Date.now() - new Date(session.last_seen_at).getTime() <= 10 * 60 * 1000) {
      liveSessionByMember.set(session.user_id, session);
    }
  }
  const rows = activeMembers.map((member) => {
    const required = availableForDate;
    const memberCompletions = completions.filter((completion) => completion.user_id === member.id);
    const completedIds = new Set(memberCompletions.map((completion) => completion.reading_id));
    const completedCount = required.filter((reading) => completedIds.has(reading.id)).length;
    const latestCompletion = required.filter((reading) => completedIds.has(reading.id))
      .map((reading) => memberCompletions.find((completion) => completion.reading_id === reading.id))
      .filter(Boolean).sort((left, right) => new Date(right.completed_at) - new Date(left.completed_at))[0] || null;
    const currentlyReading = [...liveSessionByMember.values()].some((session) => session.user_id === member.id
      && required.some((reading) => reading.id === session.reading_id));
    let status = "not-available";
    if (required.length) {
      if (selectedDate > today) status = "not-yet-available";
      else if (completedCount === required.length) status = "completed";
      else if (selectedDate < today) status = "missed";
      else if (currentlyReading) status = "reading";
      else status = "pending";
    } else if (selectedDate > today) status = "not-yet-available";

    const memberDayCompleted = (date) => {
      const dayReadings = datedReadings.filter((reading) => reading.reading_date === date);
      return dayReadings.length > 0 && dayReadings.every((reading) => completedIds.has(reading.id));
    };
    let currentStreak = 0;
    for (let index = dates.length - 1; index >= 0 && memberDayCompleted(dates[index]); index -= 1) currentStreak += 1;
    let longestStreak = 0;
    let run = 0;
    for (const date of dates) {
      run = memberDayCompleted(date) ? run + 1 : 0;
      longestStreak = Math.max(longestStreak, run);
    }
    const weekStart = getReadingWeekStart(today);
    const weekReadings = datedReadings.filter((reading) => reading.reading_date >= weekStart && reading.reading_date <= today);
    const monthReadings = datedReadings.filter((reading) => reading.reading_date.slice(0, 7) === today.slice(0, 7));
    const missedCount = datedReadings.filter((reading) => reading.reading_date < today && !completedIds.has(reading.id)).length;
    const history = memberCompletions.map((completion) => ({
      ...completion,
      reading: readings.find((reading) => reading.id === completion.reading_id) || null
    })).filter((item) => item.reading && item.reading.deleted_at == null)
      .sort((left, right) => new Date(right.completed_at) - new Date(left.completed_at));
    return {
      ...member,
      status,
      completedCount,
      assignedCount: required.length,
      completedAt: completedCount === required.length ? latestCompletion?.completed_at || null : null,
      currentlyReading,
      currentStreak,
      longestStreak,
      weekCompleted: weekReadings.filter((reading) => completedIds.has(reading.id)).length,
      weekAssigned: weekReadings.length,
      monthCompleted: monthReadings.filter((reading) => completedIds.has(reading.id)).length,
      monthAssigned: monthReadings.length,
      missedCount,
      history
    };
  });
  const availableCount = rows.filter((row) => row.assignedCount > 0).length;
  const completedMembers = rows.filter((row) => row.status === "completed").length;
  const weeklyCompleted = rows.reduce((total, row) => total + row.weekCompleted, 0);
  const weeklyAssigned = rows.reduce((total, row) => total + row.weekAssigned, 0);
  const monthlyCompleted = rows.reduce((total, row) => total + row.monthCompleted, 0);
  const monthlyAssigned = rows.reduce((total, row) => total + row.monthAssigned, 0);
  return {
    rows,
    totalMembers: activeMembers.length,
    availableCount,
    completedMembers,
    currentlyReading: rows.filter((row) => row.status === "reading").length,
    pendingMembers: rows.filter((row) => row.status === "pending").length,
    missedMembers: rows.filter((row) => row.status === "missed").length,
    weeklyCompleted,
    weeklyAssigned,
    weeklyPercent: weeklyAssigned ? Math.round(weeklyCompleted / weeklyAssigned * 100) : 0,
    monthlyCompleted,
    monthlyAssigned,
    monthlyPercent: monthlyAssigned ? Math.round(monthlyCompleted / monthlyAssigned * 100) : 0,
    consistentMembers: rows.filter((row) => row.currentStreak >= 3).length,
    severalMissedMembers: rows.filter((row) => row.missedCount >= 3).length,
    completionPercent: availableCount ? Math.round(completedMembers / availableCount * 100) : 0
  };
}
