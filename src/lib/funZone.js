export const FUN_ZONE_CATEGORIES = [
  { id: "bible_scripture", label: "Bible & Scripture", icon: "scripture" },
  { id: "word_games", label: "Word Games", icon: "word" },
  { id: "brain_teasers", label: "Brain Teasers", icon: "brain" },
  { id: "general_knowledge", label: "General Knowledge", icon: "knowledge" },
  { id: "fellowship", label: "Fellowship & Social", icon: "fellowship" },
  { id: "daily_challenges", label: "Daily Challenges", icon: "calendar" }
];

export const FUN_ZONE_ACTIVITY_TYPES = [
  { id: "bible_quiz", label: "Bible Quiz", category: "bible_scripture", answerMode: "choice", scored: true },
  { id: "scripture_challenge", label: "Scripture Challenge", category: "bible_scripture", answerMode: "choice", scored: true },
  { id: "word_game", label: "Word Game", category: "word_games", answerMode: "short_text", scored: true },
  { id: "brain_teaser", label: "Brain Teaser", category: "brain_teasers", answerMode: "short_text", scored: true },
  { id: "general_knowledge", label: "General Knowledge", category: "general_knowledge", answerMode: "choice", scored: true },
  { id: "would_you_rather", label: "Would You Rather", category: "fellowship", answerMode: "choice", scored: false },
  { id: "fellowship", label: "Fellowship Question", category: "fellowship", answerMode: "reflection", scored: false },
  { id: "daily_challenge", label: "Daily Challenge", category: "daily_challenges", answerMode: "choice", scored: true },
  { id: "quick_quiz", label: "Quick-fire Quiz", category: "general_knowledge", answerMode: "choice", scored: true },
  { id: "riddle", label: "Riddle & Trivia", category: "brain_teasers", answerMode: "short_text", scored: true },
  { id: "this_or_that", label: "This or That", category: "fellowship", answerMode: "choice", scored: false },
  { id: "surprise_poll", label: "Quick Poll", category: "fellowship", answerMode: "choice", scored: false },
  { id: "bible_challenge", label: "Bible Challenge", category: "bible_scripture", answerMode: "choice", scored: true }
];

export function getActivityAvailability(activity, now = Date.now()) {
  if (!activity || activity.status === "draft") return "draft";
  if (activity.status === "cancelled") return "cancelled";
  if (activity.status === "completed") return "completed";
  const start = new Date(activity.starts_at).getTime();
  const close = activity.closes_at ? new Date(activity.closes_at).getTime() : null;
  if (Number.isFinite(start) && start > now) return "scheduled";
  if (close !== null && Number.isFinite(close) && close <= now) return "completed";
  return "live";
}

export function sortLeaderboard(rows = []) {
  return [...rows].sort((left, right) => {
    const points = Number(right.points || 0) - Number(left.points || 0);
    if (points) return points;
    const names = String(left.full_name || "").localeCompare(String(right.full_name || ""));
    return names || String(left.user_id).localeCompare(String(right.user_id));
  }).map((row, index, sorted) => ({
    ...row,
    position: index === 0 || Number(sorted[index - 1].points || 0) !== Number(row.points || 0)
      ? index + 1
      : sorted.slice(0, index).findIndex((item) => Number(item.points || 0) === Number(row.points || 0)) + 1
  }));
}

export function getActivityType(activityType) {
  return FUN_ZONE_ACTIVITY_TYPES.find((item) => item.id === activityType)
    ?? { id: activityType, label: "Community activity", category: "general_knowledge", scored: false };
}

export function getAchievementProgress(definition, summary = {}, earned = false) {
  const valueByMetric = {
    activities_completed: Number(summary.completed_count || 0),
    bible_activities_completed: Number(summary.bible_completed_count || 0),
    fellowship_responses: Number(summary.fellowship_responses || 0)
  };
  const current = valueByMetric[definition?.metric_key] || 0;
  const target = Math.max(1, Number(definition?.threshold_count || 1));
  return {
    current: Math.min(current, target),
    target,
    percent: Math.min(100, Math.round(current / target * 100)),
    earned: Boolean(earned || current >= target)
  };
}
