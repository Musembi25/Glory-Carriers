import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { MemberInitials } from "./MemberInitials.jsx";
import {
  FUN_ZONE_ACTIVITY_TYPES,
  FUN_ZONE_CATEGORIES,
  getAchievementProgress,
  getActivityAvailability,
  getActivityType,
  sortLeaderboard
} from "../lib/funZone.js";
import "../styles/fun-zone.css";

const ACTIVITY_IMAGE = `${import.meta.env.BASE_URL}community/fellowship.webp`;
const DEFAULT_QUESTION = () => ({
  prompt: "",
  answer_mode: "choice",
  optionsText: "",
  correct_option: "",
  acceptedAnswersText: "",
  points: 10,
  explanation: ""
});

function Icon({ name }) {
  const paths = {
    sparkles: <><path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z"/><path d="m19 3 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7L19 3Z"/></>,
    gamepad: <><path d="M6.5 8h11a4 4 0 0 1 3.9 4.8l-.6 2.7a2.5 2.5 0 0 1-4.1 1.3l-2-1.7H9.3l-2 1.7a2.5 2.5 0 0 1-4.1-1.3l-.6-2.7A4 4 0 0 1 6.5 8Z"/><path d="M7.5 10.5v4m-2-2h4"/><circle cx="16" cy="11.5" r=".8"/><circle cx="18.5" cy="14" r=".8"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6"/></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.8-2L20 12M4 12l2.7 5a7 7 0 0 0 11.8-2"/></>,
    crown: <><path d="m3 8 5 4 4-7 4 7 5-4-2 11H5L3 8Z"/><path d="M6 22h12"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.sparkles}</svg>;
}

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function createActivityDraft() {
  const starts = new Date(Date.now() + 5 * 60000);
  return {
    title: "",
    description: "",
    activity_type: "bible_quiz",
    difficulty: "easy",
    estimated_minutes: 5,
    participation_points: 0,
    starts_at: toLocalInputValue(starts),
    closes_at: "",
    status: "draft",
    feedback_mode: "after_completion",
    responses_anonymous: true,
    questions: [DEFAULT_QUESTION()]
  };
}

function formatDate(value) {
  if (!value) return "No closing date";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function initials(value) {
  return String(value || "Member").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "M";
}

function getMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function parseLines(value) {
  return String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

export function FunZone({ user, isAdmin = false, isSuperAdmin = false, groupId, profiles = [] }) {
  const canManage = isAdmin || isSuperAdmin;
  const [activities, setActivities] = useState([]);
  const [questionsByActivity, setQuestionsByActivity] = useState({});
  const [overviewByActivity, setOverviewByActivity] = useState({});
  const [attemptsByActivity, setAttemptsByActivity] = useState({});
  const [legacyResponsesByActivity, setLegacyResponsesByActivity] = useState({});
  const [summary, setSummary] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [achievementDefinitions, setAchievementDefinitions] = useState([]);
  const [earnedAchievements, setEarnedAchievements] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveState, setLiveState] = useState("connecting");
  const [category, setCategory] = useState("all");
  const [activityQuery, setActivityQuery] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [builder, setBuilder] = useState(createActivityDraft);
  const [saving, setSaving] = useState(false);
  const [busyActivity, setBusyActivity] = useState("");
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [responseText, setResponseText] = useState("");
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [attemptReview, setAttemptReview] = useState([]);
  const [legacyResponse, setLegacyResponse] = useState(null);
  const [legacyAnswer, setLegacyAnswer] = useState(null);
  const [resultsActivity, setResultsActivity] = useState(null);
  const [activityResults, setActivityResults] = useState([]);
  const [adminReviewActivity, setAdminReviewActivity] = useState(null);
  const [adminReviewRows, setAdminReviewRows] = useState([]);
  const [adminReviewLoading, setAdminReviewLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const hasLoaded = useRef(false);
  const refreshTimer = useRef(null);

  useEffect(() => {
    const hasModal = showBuilder || Boolean(selectedActivity) || Boolean(resultsActivity) || Boolean(adminReviewActivity);
    if (!hasModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (showBuilder) setShowBuilder(false);
      else if (selectedActivity) closeActivityModal();
      else if (resultsActivity) setResultsActivity(null);
      else if (adminReviewActivity) setAdminReviewActivity(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [adminReviewActivity, resultsActivity, selectedActivity, showBuilder]);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!supabase || !user?.id || !groupId) return;
    if (!hasLoaded.current && !quiet) setLoading(true);
    const [activityResult, questionResult, summaryResult, leaderboardResult, overviewResult,
      attemptsResult, legacyResult, definitionsResult, earnedResult] = await Promise.all([
      supabase.from("gc_pulse_activities").select("*").eq("group_id", groupId).order("starts_at", { ascending: true }),
      supabase.from("fun_zone_questions").select("id,activity_id,group_id,position,prompt,answer_mode,options,points").eq("group_id", groupId).order("position", { ascending: true }),
      supabase.rpc("fun_zone_my_summary"),
      supabase.rpc("fun_zone_leaderboard", { period_name: "all_time" }),
      supabase.rpc("fun_zone_activity_overview"),
      supabase.from("fun_zone_attempts").select("id,activity_id,completed_at,total_points,max_points").eq("user_id", user.id).eq("group_id", groupId),
      supabase.from("gc_pulse_activity_responses").select("id,activity_id,user_id,selected_option,awarded_points,submitted_at,group_id").eq("user_id", user.id).eq("group_id", groupId),
      supabase.from("fun_zone_achievement_definitions").select("code,name,description,metric_key,threshold_count,sort_order").order("sort_order"),
      supabase.from("fun_zone_member_achievements").select("achievement_code").eq("user_id", user.id).eq("group_id", groupId)
    ]);
    const requiredErrors = [activityResult.error, questionResult.error, summaryResult.error, leaderboardResult.error,
      overviewResult.error, attemptsResult.error, legacyResult.error, definitionsResult.error, earnedResult.error].filter(Boolean);
    if (requiredErrors.length) {
      const missingFunZoneObjects = requiredErrors.some((item) => ["42P01", "42703", "PGRST202"].includes(item.code) || /does not exist|could not find the function/i.test(item.message || ""));
      setError(missingFunZoneObjects
        ? "Fun Zone needs its database migration. Apply supabase/fun-zone-migration.sql after the management cell-group and single-cell-group migrations."
        : getMessage(requiredErrors[0]));
      setLoading(false);
      hasLoaded.current = true;
      return;
    }
    const questionMap = {};
    for (const question of questionResult.data || []) (questionMap[question.activity_id] ||= []).push(question);
    const overviewMap = Object.fromEntries((overviewResult.data || []).map((row) => [row.activity_id, row]));
    const attemptMap = Object.fromEntries((attemptsResult.data || []).map((row) => [row.activity_id, row]));
    const legacyMap = Object.fromEntries((legacyResult.data || []).map((row) => [row.activity_id, row]));
    setActivities(activityResult.data || []);
    setQuestionsByActivity(questionMap);
    setOverviewByActivity(overviewMap);
    setAttemptsByActivity(attemptMap);
    setLegacyResponsesByActivity(legacyMap);
    setSummary(summaryResult.data?.[0] || summaryResult.data || null);
    setLeaderboard(sortLeaderboard(leaderboardResult.data || []));
    setAchievementDefinitions(definitionsResult.data || []);
    setEarnedAchievements(new Set((earnedResult.data || []).map((row) => row.achievement_code)));
    setError("");
    setLoading(false);
    hasLoaded.current = true;
  }, [groupId, user?.id]);

  useEffect(() => {
    void refresh();
    const clock = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      window.clearInterval(clock);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!supabase || !groupId || !user?.id) return undefined;
    const queueRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void refresh({ quiet: true });
        if (adminReviewActivity) void loadAdminReview(adminReviewActivity);
      }, 180);
    };
    const channel = supabase.channel(`fun-zone:${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gc_pulse_activities", filter: `group_id=eq.${groupId}` }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fun_zone_questions", filter: `group_id=eq.${groupId}` }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fun_zone_live_activity_updates", filter: `group_id=eq.${groupId}` }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fun_zone_point_transactions", filter: `group_id=eq.${groupId}` }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fun_zone_member_achievements", filter: `group_id=eq.${groupId}` }, queueRefresh)
      .subscribe((status) => {
        setLiveState(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "error" : "connecting");
      });
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [adminReviewActivity, groupId, refresh, user?.id]);

  const visibleActivities = useMemo(() => activities.filter((activity) => {
    const availability = getActivityAvailability(activity, now);
    const type = getActivityType(activity.activity_type);
    const matchesCategory = category === "all" || activity.category === category;
    const matchesSearch = !activityQuery.trim() || `${activity.title} ${activity.description} ${type.label}`.toLowerCase().includes(activityQuery.trim().toLowerCase());
    return matchesCategory && matchesSearch && (canManage || availability !== "draft");
  }), [activities, activityQuery, canManage, category, now]);

  function openBuilder(activity = null) {
    setActionError("");
    setActionNotice("");
    setEditingActivity(activity);
    if (!activity) {
      setBuilder(createActivityDraft());
      setShowBuilder(true);
      return;
    }
    void (async () => {
      const questionResult = await supabase.from("fun_zone_questions").select("id,activity_id,position,prompt,answer_mode,options,points").eq("activity_id", activity.id).order("position");
      if (questionResult.error) {
        setActionError(getMessage(questionResult.error));
        return;
      }
      const questionIds = (questionResult.data || []).map((question) => question.id);
      const keyResult = questionIds.length
        ? await supabase.from("fun_zone_question_keys").select("question_id,correct_option,accepted_answers,explanation").in("question_id", questionIds)
        : { data: [], error: null };
      if (keyResult.error) {
        setActionError(getMessage(keyResult.error));
        return;
      }
      const keys = Object.fromEntries((keyResult.data || []).map((row) => [row.question_id, row]));
      const questions = (questionResult.data || []).map((question) => {
        const key = keys[question.id] || {};
        return {
          prompt: question.prompt,
          answer_mode: question.answer_mode,
          optionsText: (question.options || []).join("\n"),
          correct_option: key.correct_option == null ? "" : String(key.correct_option),
          acceptedAnswersText: (key.accepted_answers || []).join("\n"),
          points: question.points,
          explanation: key.explanation || ""
        };
      });
      setBuilder({
        title: activity.title,
        description: activity.description || "",
        activity_type: activity.activity_type,
        difficulty: activity.difficulty || "easy",
        estimated_minutes: activity.estimated_minutes || 5,
        participation_points: activity.participation_points || 0,
        starts_at: toLocalInputValue(new Date(activity.starts_at)),
        closes_at: activity.closes_at ? toLocalInputValue(new Date(activity.closes_at)) : "",
        status: activity.status === "open" ? "open" : "draft",
        feedback_mode: activity.feedback_mode || "after_completion",
        responses_anonymous: activity.responses_anonymous !== false,
        questions: questions.length ? questions : [DEFAULT_QUESTION()]
      });
      setShowBuilder(true);
    })();
  }

  async function saveActivity(event) {
    event.preventDefault();
    if (!canManage || saving) return;
    const activityType = getActivityType(builder.activity_type);
    const singleQuestion = ["fellowship", "this_or_that", "would_you_rather", "surprise_poll"].includes(builder.activity_type);
    if (singleQuestion && builder.questions.length !== 1) {
      setActionError("This activity type uses one question.");
      return;
    }
    for (const [index, question] of builder.questions.entries()) {
      const options = parseLines(question.optionsText);
      const acceptedAnswers = parseLines(question.acceptedAnswersText);
      if (question.prompt.trim().length < 5) {
        setActionError(`Question ${index + 1} needs at least five characters.`);
        return;
      }
      if (question.answer_mode === "choice" && (options.length < 2 || options.length > 6)) {
        setActionError(`Question ${index + 1} needs two to six choices.`);
        return;
      }
      if (["this_or_that", "would_you_rather"].includes(builder.activity_type) && options.length !== 2) {
        setActionError("This or That and Would You Rather activities need exactly two choices.");
        return;
      }
      if (activityType.scored && question.answer_mode === "reflection") {
        setActionError("Scored activities need a choice or short-answer question.");
        return;
      }
      if (!activityType.scored && Number(question.points) !== 0) {
        setActionError("Poll and fellowship prompts do not award answer points. Use participation points instead.");
        return;
      }
      if (activityType.scored && Number(question.points) < 1) {
        setActionError(`Question ${index + 1} needs at least one point.`);
        return;
      }
      if (activityType.scored && question.answer_mode === "choice" && !options[Number(question.correct_option)]) {
        setActionError(`Choose the correct answer for question ${index + 1}.`);
        return;
      }
      if (activityType.scored && question.answer_mode === "short_text" && !acceptedAnswers.length) {
        setActionError(`Add an accepted answer for question ${index + 1}.`);
        return;
      }
      if (builder.activity_type === "fellowship" && question.answer_mode !== "reflection") {
        setActionError("Fellowship prompts use a written reflection.");
        return;
      }
      if (["this_or_that", "would_you_rather", "surprise_poll"].includes(builder.activity_type) && question.answer_mode !== "choice") {
        setActionError("Poll activities use answer choices.");
        return;
      }
    }
    setSaving(true);
    setActionError("");
    setActionNotice("");
    const questionPayload = builder.questions.map((question) => ({
      prompt: question.prompt.trim(),
      answer_mode: question.answer_mode,
      options: question.answer_mode === "choice" ? parseLines(question.optionsText) : [],
      correct_option: question.answer_mode === "choice" ? question.correct_option : null,
      accepted_answers: question.answer_mode === "short_text" ? parseLines(question.acceptedAnswersText) : [],
      points: Number(question.points || 0),
      explanation: question.explanation.trim()
    }));
    const activityPayload = {
      title: builder.title.trim(),
      description: builder.description.trim(),
      activity_type: builder.activity_type,
      difficulty: builder.difficulty,
      estimated_minutes: Number(builder.estimated_minutes),
      participation_points: Number(builder.participation_points || 0),
      starts_at: new Date(builder.starts_at).toISOString(),
      closes_at: builder.closes_at ? new Date(builder.closes_at).toISOString() : null,
      status: builder.status,
      feedback_mode: builder.feedback_mode,
      responses_anonymous: builder.responses_anonymous
    };
    const { data, error: saveError } = await supabase.rpc("save_fun_zone_activity", {
      target_activity_id: editingActivity?.id || null,
      activity_data: activityPayload,
      questions_data: questionPayload
    });
    setSaving(false);
    if (saveError) {
      setActionError(getMessage(saveError));
      return;
    }
    setShowBuilder(false);
    setEditingActivity(null);
    setActionNotice(editingActivity ? "Activity updated." : "Activity saved. It is ready for your group.");
    await refresh({ quiet: true });
    void data;
  }

  async function updateStatus(activity, status) {
    setBusyActivity(activity.id);
    setActionError("");
    setActionNotice("");
    const { error: statusError } = await supabase.rpc("fun_zone_set_activity_status", {
      target_activity_id: activity.id,
      next_status: status
    });
    setBusyActivity("");
    if (statusError) {
      setActionError(getMessage(statusError));
      return;
    }
    setActionNotice(status === "open" ? "Activity published." : `Activity marked ${status}.`);
    await refresh({ quiet: true });
  }

  async function openActivity(activity) {
    setActionError("");
    setAttemptReview([]);
    setLegacyResponse(legacyResponsesByActivity[activity.id] || null);
    setLegacyAnswer(null);
    setAnswerFeedback(null);
    setActiveAttempt(null);
    setQuestionIndex(0);
    setSelectedOption(null);
    setResponseText("");
    setSelectedActivity(activity);
    if (!(questionsByActivity[activity.id] || []).length) return;
    setBusyActivity(activity.id);
    const { data, error: startError } = await supabase.rpc("fun_zone_start_attempt", { target_activity_id: activity.id });
    if (startError) {
      setBusyActivity("");
      setActionError(getMessage(startError));
      return;
    }
    const attempt = data?.[0] || data;
    if (!attempt?.attempt_id) {
      setBusyActivity("");
      setActionError("The activity session could not be started.");
      return;
    }
    const { data: answerRows, error: answerError } = await supabase.from("fun_zone_attempt_answers")
      .select("id,question_id,selected_option,response_text,points_awarded,is_hidden,submitted_at")
      .eq("attempt_id", attempt.attempt_id).order("submitted_at");
    setBusyActivity("");
    if (answerError) {
      setActionError(getMessage(answerError));
      return;
    }
    setActiveAttempt({ ...attempt, answers: answerRows || [] });
    setQuestionIndex(answerRows?.length || 0);
    if (attempt.completed_at) {
      const { data: review, error: reviewError } = await supabase.rpc("fun_zone_attempt_review", { target_attempt_id: attempt.attempt_id });
      if (!reviewError) setAttemptReview(review || []);
    }
  }

  const currentQuestions = selectedActivity ? questionsByActivity[selectedActivity.id] || [] : [];
  const currentQuestion = currentQuestions[questionIndex] || null;

  async function submitAnswer(event) {
    event.preventDefault();
    if (!activeAttempt || !currentQuestion || busyActivity) return;
    setBusyActivity(selectedActivity.id);
    setActionError("");
    const { data, error: submitError } = await supabase.rpc("fun_zone_submit_answer", {
      target_attempt_id: activeAttempt.attempt_id,
      target_question_id: currentQuestion.id,
      selected_option: currentQuestion.answer_mode === "choice" ? selectedOption : null,
      response_text: currentQuestion.answer_mode === "choice" ? null : responseText
    });
    setBusyActivity("");
    if (submitError) {
      setActionError(getMessage(submitError));
      return;
    }
    const outcome = data?.[0] || data;
    setAnswerFeedback(outcome);
    setActiveAttempt((current) => ({ ...current, completed_at: outcome.completed ? new Date().toISOString() : null, total_points: outcome.total_points }));
    setSelectedOption(null);
    setResponseText("");
    if (outcome.completed) {
      const { data: review, error: reviewError } = await supabase.rpc("fun_zone_attempt_review", { target_attempt_id: activeAttempt.attempt_id });
      if (reviewError) setActionError(getMessage(reviewError));
      else setAttemptReview(review || []);
      await refresh({ quiet: true });
    }
  }

  function continueQuestion() {
    setAnswerFeedback(null);
    setQuestionIndex((index) => index + 1);
  }

  async function submitLegacyAnswer(optionIndex) {
    if (!selectedActivity || legacyResponse || busyActivity) return;
    setBusyActivity(selectedActivity.id);
    setActionError("");
    const { data, error: submitError } = await supabase.rpc("submit_gc_pulse_response", {
      target_activity_id: selectedActivity.id,
      selected_option: optionIndex
    });
    setBusyActivity("");
    if (submitError) {
      setActionError(getMessage(submitError));
      return;
    }
    setLegacyResponse({ activity_id: selectedActivity.id, selected_option: optionIndex, awarded_points: data?.[0]?.awarded_points || 0 });
    await refresh({ quiet: true });
  }

  async function loadActivityResults(activity) {
    setActionError("");
    setResultsActivity(activity);
    setActivityResults([]);
    const { data, error: resultError } = await supabase.rpc("fun_zone_activity_results", { target_activity_id: activity.id });
    if (resultError) {
      setActionError(getMessage(resultError));
      return;
    }
    setActivityResults(data || []);
  }

  async function revealLegacyAnswer(activity) {
    setBusyActivity(activity.id);
    setActionError("");
    const { data, error: revealError } = await supabase.rpc("reveal_gc_pulse_answer", { target_activity_id: activity.id });
    setBusyActivity("");
    if (revealError) setActionError(getMessage(revealError));
    else setLegacyAnswer(data?.[0] || null);
  }

  async function loadAdminReview(activity) {
    setAdminReviewActivity(activity);
    setAdminReviewRows([]);
    setAdminReviewLoading(true);
    setActionError("");
    const [{ data: attemptRows, error: attemptsError }, { data: legacyRows, error: legacyError }] = await Promise.all([
      supabase.from("fun_zone_attempts").select("id,user_id,completed_at,total_points,max_points").eq("activity_id", activity.id).eq("group_id", groupId),
      supabase.from("gc_pulse_activity_responses").select("id,user_id,selected_option,awarded_points,submitted_at,group_id").eq("activity_id", activity.id).eq("group_id", groupId)
    ]);
    if (attemptsError || legacyError) {
      setActionError(getMessage(attemptsError || legacyError));
      setAdminReviewLoading(false);
      return;
    }
    let answerRows = [];
    if (attemptRows?.length) {
      const { data, error: answersError } = await supabase.from("fun_zone_attempt_answers")
        .select("id,attempt_id,question_id,user_id,selected_option,response_text,is_hidden,submitted_at")
        .in("attempt_id", attemptRows.map((row) => row.id));
      if (answersError) {
        setActionError(getMessage(answersError));
        setAdminReviewLoading(false);
        return;
      }
      answerRows = data || [];
    }
    setAdminReviewRows([
      ...(attemptRows || []).map((attempt) => ({ ...attempt, kind: "attempt", answers: answerRows.filter((answer) => answer.attempt_id === attempt.id) })),
      ...(legacyRows || []).map((response) => ({ ...response, kind: "legacy" }))
    ]);
    setAdminReviewLoading(false);
  }

  async function hideResponse(answer) {
    const { error: moderateError } = await supabase.from("fun_zone_attempt_answers").update({ is_hidden: !answer.is_hidden }).eq("id", answer.id);
    if (moderateError) setActionError(getMessage(moderateError));
    else await loadAdminReview(adminReviewActivity);
  }

  function closeActivityModal() {
    setSelectedActivity(null);
    setActiveAttempt(null);
    setAttemptReview([]);
    setAnswerFeedback(null);
    setActionError("");
  }

  function updateQuestion(index, key, value) {
    setBuilder((current) => ({
      ...current,
      questions: current.questions.map((question, position) => position === index ? { ...question, [key]: value } : question)
    }));
  }

  const pointsTotal = summary?.total_points || 0;
  const isActiveFilter = category === "all";

  return (
    <main className="fun-zone" aria-labelledby="fun-zone-title">
      <header className="fun-zone-hero">
        <div className="fun-zone-hero-image" aria-hidden="true" style={{ backgroundImage: `url("${ACTIVITY_IMAGE}")` }} />
        <div className="fun-zone-hero-copy">
          <div className="fun-zone-eyebrow"><span><Icon name="gamepad" /></span> CITY ON A HILL · COMMUNITY</div>
          <h1 id="fun-zone-title">Fun Zone</h1>
          <p>Relax · Play · Connect · Grow</p>
          <blockquote>“A cheerful heart is good medicine.” <cite>Proverbs 17:22</cite></blockquote>
        </div>
        <div className={`fun-zone-live${liveState === "live" ? " is-live" : ""}`}><i />{liveState === "live" ? "Live for your group" : liveState === "error" ? "Reconnecting" : "Connecting"}</div>
      </header>

      <section className="fun-zone-stat-strip" aria-label="Your Fun Zone progress">
        <article><span className="fun-zone-stat-icon"><Icon name="trophy" /></span><div><strong>{pointsTotal.toLocaleString()}</strong><small>Points earned</small></div></article>
        <article><span className="fun-zone-stat-icon"><Icon name="check" /></span><div><strong>{summary?.completed_count || 0}</strong><small>Activities completed</small></div></article>
        <article><span className="fun-zone-stat-icon"><Icon name="sparkles" /></span><div><strong>{summary?.current_streak || 0} days</strong><small>Current streak</small></div></article>
        <article><span className="fun-zone-stat-icon"><Icon name="crown" /></span><div><strong>{summary?.all_time_rank ? `#${summary.all_time_rank}` : "—"}</strong><small>Group ranking</small></div></article>
      </section>

      {(error || actionError) ? <div className="fun-zone-notice is-error" role="alert"><span>{error || actionError}</span>{error ? <button type="button" onClick={() => void refresh()}>Retry</button> : <button type="button" onClick={() => setActionError("")} aria-label="Dismiss error"><Icon name="close" /></button>}</div> : null}
      {actionNotice ? <div className="fun-zone-notice is-success" role="status"><span>{actionNotice}</span><button type="button" onClick={() => setActionNotice("")} aria-label="Dismiss message"><Icon name="close" /></button></div> : null}

      <div className="fun-zone-body">
        <section className="fun-zone-main-column">
          <div className="fun-zone-section-heading">
            <div><p className="fun-zone-overline">YOUR NEXT MOMENT</p><h2>Play something good</h2><p>Small challenges, shared laughter, and a little room to grow.</p></div>
            {canManage ? <button type="button" className="fun-zone-create-button" onClick={() => openBuilder()}><Icon name="plus" /> Create activity</button> : null}
          </div>

          <div className="fun-zone-toolbar">
            <div className="fun-zone-category-list" role="group" aria-label="Filter activities by category">
              <button type="button" className={isActiveFilter ? "is-selected" : ""} aria-pressed={isActiveFilter} onClick={() => setCategory("all")}>All activities</button>
              {FUN_ZONE_CATEGORIES.map((item) => <button type="button" key={item.id} className={category === item.id ? "is-selected" : ""} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}
            </div>
            <label className="fun-zone-search"><span className="sr-only">Search activities</span><input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Find an activity" /><span aria-hidden="true">⌕</span></label>
          </div>

          {loading ? <div className="fun-zone-loading" aria-label="Loading activities"><span /><span /><span /></div> : visibleActivities.length ? <div className="fun-zone-activity-grid">
            {visibleActivities.map((activity) => {
              const type = getActivityType(activity.activity_type);
              const availability = getActivityAvailability(activity, now);
              const ownAttempt = attemptsByActivity[activity.id];
              const ownLegacyResponse = legacyResponsesByActivity[activity.id];
              const completed = Boolean(ownAttempt?.completed_at || ownLegacyResponse);
              const activityQuestions = questionsByActivity[activity.id] || [];
              const overview = overviewByActivity[activity.id] || {};
              const isLegacy = activityQuestions.length === 0;
              const canStart = availability === "live" && !completed && (!isLegacy || !ownLegacyResponse);
              return <article className={`fun-zone-activity-card${availability === "draft" ? " is-draft" : ""}`} key={activity.id}>
                <div className="fun-zone-card-topline"><span className="fun-zone-type-mark"><Icon name={type.category === "bible_scripture" ? "book" : type.category === "fellowship" ? "users" : "sparkles"} /></span><span>{type.label}</span><b className={`fun-zone-status is-${availability}`}>{availability === "live" ? "LIVE" : availability.toUpperCase()}</b></div>
                <h3>{activity.title}</h3>
                <p className="fun-zone-card-description">{activity.description || activity.prompt}</p>
                <div className="fun-zone-card-meta"><span><Icon name="clock" /> {activity.estimated_minutes || 5} min</span><span><Icon name="sparkles" /> {activity.difficulty || "steady"}</span><span><Icon name="trophy" /> {activity.max_points || 0} pts</span><span><Icon name="users" /> {overview.participant_count || 0}</span></div>
                <div className="fun-zone-card-footer">
                  {completed ? <span className="fun-zone-completed-label"><Icon name="check" /> Completed{ownAttempt?.total_points ? ` · ${ownAttempt.total_points} pts` : ""}</span>
                    : canStart ? <button type="button" className="fun-zone-play-button" disabled={busyActivity === activity.id} onClick={() => void openActivity(activity)}>{busyActivity === activity.id ? "Opening…" : ownAttempt ? "Continue" : "Start activity"}<Icon name="arrow" /></button>
                    : <span className="fun-zone-card-status-note">{availability === "scheduled" ? `Opens ${formatDate(activity.starts_at)}` : availability === "draft" ? "Draft · only admins can see this" : availability === "cancelled" ? "This activity was cancelled" : "This activity has ended"}</span>}
                </div>
                <div className="fun-zone-card-admin-actions">
                  {(activity.category === "fellowship" || availability !== "live") ? <button type="button" onClick={() => void loadActivityResults(activity)}>Results</button> : null}
                  {canManage ? <><button type="button" onClick={() => void loadAdminReview(activity)}>Responses ({overview.participant_count || 0})</button>{!overview.participant_count && !["completed", "cancelled"].includes(activity.status) ? <button type="button" onClick={() => openBuilder(activity)}>Edit</button> : null}{availability === "draft" ? <button type="button" onClick={() => void updateStatus(activity, "open")}>Publish</button> : ["live", "scheduled"].includes(availability) ? <>{availability === "live" ? <button type="button" onClick={() => void updateStatus(activity, "completed")}>Close</button> : null}<button type="button" onClick={() => void updateStatus(activity, "cancelled")}>Cancel</button></> : null}</> : null}
                  {isLegacy && ["quick_quiz", "riddle", "bible_challenge"].includes(activity.activity_type) && availability === "completed" ? <button type="button" onClick={() => void revealLegacyAnswer(activity)}>Reveal answer</button> : null}
                </div>
                {legacyAnswer?.activity_id === activity.id ? <p className="fun-zone-revealed-answer">Answer: {(activity.options || [])[legacyAnswer.correct_option] || "See the activity key"}{legacyAnswer.explanation ? ` · ${legacyAnswer.explanation}` : ""}</p> : null}
              </article>;
            })}
          </div> : <div className="fun-zone-empty"><span><Icon name="sparkles" /></span><h3>{activities.length ? "Nothing in this view yet" : "A good moment is on its way"}</h3><p>{activities.length ? "Try another category or clear your search." : canManage ? "Create a quiz, scripture prompt, or fellowship activity to get things started." : "New quizzes and fellowship moments will appear here when they are ready."}</p>{canManage && !activities.length ? <button type="button" className="fun-zone-create-button" onClick={() => openBuilder()}><Icon name="plus" /> Create the first activity</button> : null}</div>}
        </section>

        <aside className="fun-zone-side-column">
          <section className="fun-zone-side-panel fun-zone-leaderboard">
            <div className="fun-zone-panel-heading"><span className="fun-zone-panel-icon"><Icon name="crown" /></span><div><p className="fun-zone-overline">GOOD-NATURED BRAGGING RIGHTS</p><h2>Leaderboard</h2></div></div>
            <div className="fun-zone-leaderboard-list">{leaderboard.slice(0, 5).map((member) => { const profile = profiles.find((candidate) => candidate.id === member.user_id); return <div className="fun-zone-leader-row" key={member.user_id}><span className={`fun-zone-rank rank-${member.position <= 3 ? member.position : "other"}`}>{member.position}</span><MemberInitials member={{ ...profile, ...member }} className="fun-zone-leader-identity"/><span className="fun-zone-member-name">{member.full_name}</span><strong>{Number(member.points || 0).toLocaleString()}</strong></div>; })}{!leaderboard.length && !loading ? <p className="fun-zone-muted-note">Your group’s first points are waiting to be earned.</p> : null}</div>
            <p className="fun-zone-side-footnote">Points update for the whole group as activities are completed.</p>
          </section>

          <section className="fun-zone-side-panel fun-zone-achievements">
            <div className="fun-zone-panel-heading"><span className="fun-zone-panel-icon is-gold"><Icon name="shield" /></span><div><p className="fun-zone-overline">MILESTONES</p><h2>Achievements</h2></div></div>
            <div className="fun-zone-achievement-list">{achievementDefinitions.map((item) => {
              const progress = getAchievementProgress(item, summary || {}, earnedAchievements.has(item.code));
              return <article className={`fun-zone-achievement${progress.earned ? " is-earned" : ""}`} key={item.code}><span className="fun-zone-achievement-mark"><Icon name={progress.earned ? "check" : "sparkles"} /></span><div><div className="fun-zone-achievement-title"><strong>{item.name}</strong><small>{progress.current}/{progress.target}</small></div><p>{item.description}</p><div className="fun-zone-achievement-track"><span style={{ width: `${progress.percent}%` }} /></div></div></article>;
            })}{!achievementDefinitions.length && !loading ? <p className="fun-zone-muted-note">Keep exploring to earn your first milestone.</p> : null}</div>
          </section>

          <section className="fun-zone-verse-note"><Icon name="book" /><div><span>TAKE A BREATH</span><p>“Let all that you do be done in love.”</p><small>1 Corinthians 16:14</small></div></section>
        </aside>
      </div>

      {showBuilder ? <div className="fun-zone-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowBuilder(false); }}><section className="fun-zone-modal fun-zone-builder-modal" role="dialog" aria-modal="true" aria-labelledby="fun-zone-builder-title"><header className="fun-zone-modal-header"><div><p className="fun-zone-overline">ADMIN ACTIVITY STUDIO</p><h2 id="fun-zone-builder-title">{editingActivity ? "Edit activity" : "Create an activity"}</h2><p>Prepare a thoughtful challenge for City on a Hill.</p></div><button type="button" className="fun-zone-icon-button" onClick={() => setShowBuilder(false)} aria-label="Close activity editor"><Icon name="close" /></button></header>
        <form onSubmit={saveActivity} className="fun-zone-builder-form">
          <div className="fun-zone-builder-fields">
            <label className="fun-zone-field fun-zone-field-wide"><span>Activity title</span><input required minLength={3} maxLength={120} value={builder.title} onChange={(event) => setBuilder((current) => ({ ...current, title: event.target.value }))} placeholder="A title that invites people in" /></label>
            <label className="fun-zone-field fun-zone-field-wide"><span>Short description <small>Optional</small></span><textarea maxLength={1000} rows={2} value={builder.description} onChange={(event) => setBuilder((current) => ({ ...current, description: event.target.value }))} placeholder="What will members discover or share?" /></label>
            <label className="fun-zone-field"><span>Activity type</span><select value={builder.activity_type} onChange={(event) => { const type = FUN_ZONE_ACTIVITY_TYPES.find((item) => item.id === event.target.value); setBuilder((current) => ({ ...current, activity_type: event.target.value, questions: [{ ...DEFAULT_QUESTION(), answer_mode: type?.answerMode || "choice", points: type?.scored ? 10 : 0 }] })); }}>{FUN_ZONE_ACTIVITY_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
            <label className="fun-zone-field"><span>Difficulty</span><select value={builder.difficulty} onChange={(event) => setBuilder((current) => ({ ...current, difficulty: event.target.value }))}><option value="easy">Gentle</option><option value="medium">Steady</option><option value="challenging">A little challenge</option></select></label>
            <label className="fun-zone-field"><span>Estimated minutes</span><input type="number" min="1" max="90" required value={builder.estimated_minutes} onChange={(event) => setBuilder((current) => ({ ...current, estimated_minutes: event.target.value }))} /></label>
            <label className="fun-zone-field"><span>Participation points</span><input type="number" min="0" max="100" value={builder.participation_points} onChange={(event) => setBuilder((current) => ({ ...current, participation_points: event.target.value }))} /></label>
            <label className="fun-zone-field"><span>Opens</span><input type="datetime-local" required value={builder.starts_at} onChange={(event) => setBuilder((current) => ({ ...current, starts_at: event.target.value }))} /></label>
            <label className="fun-zone-field"><span>Closes <small>Optional</small></span><input type="datetime-local" value={builder.closes_at} onChange={(event) => setBuilder((current) => ({ ...current, closes_at: event.target.value }))} /></label>
            <label className="fun-zone-field"><span>Answer feedback</span><select value={builder.feedback_mode} onChange={(event) => setBuilder((current) => ({ ...current, feedback_mode: event.target.value }))}><option value="after_completion">After the full activity</option><option value="immediate">After each answer</option></select></label>
            <label className="fun-zone-field"><span>Publish state</span><select value={builder.status} onChange={(event) => setBuilder((current) => ({ ...current, status: event.target.value }))}><option value="draft">Save as draft</option><option value="open">Publish when saved</option></select></label>
          </div>
          <div className="fun-zone-builder-question-heading"><div><p className="fun-zone-overline">ACTIVITY CONTENT</p><h3>Questions and prompts</h3><p>Answer keys stay private and are checked securely by the database.</p></div>{!(["fellowship", "this_or_that", "would_you_rather", "surprise_poll"].includes(builder.activity_type)) && builder.questions.length < 20 ? <button type="button" className="fun-zone-small-button" onClick={() => setBuilder((current) => ({ ...current, questions: [...current.questions, DEFAULT_QUESTION()] }))}><Icon name="plus" /> Add question</button> : null}</div>
          {builder.questions.map((question, index) => <fieldset className="fun-zone-question-editor" key={index}><legend>Question {index + 1}</legend><button type="button" className="fun-zone-remove-question" onClick={() => setBuilder((current) => ({ ...current, questions: current.questions.length > 1 ? current.questions.filter((_, rowIndex) => rowIndex !== index) : current.questions }))} disabled={builder.questions.length <= 1} aria-label={`Remove question ${index + 1}`}><Icon name="close" /></button>
            <label className="fun-zone-field fun-zone-field-wide"><span>Prompt</span><textarea required minLength={5} maxLength={1200} rows={2} value={question.prompt} onChange={(event) => updateQuestion(index, "prompt", event.target.value)} placeholder="Write a clear question or invitation" /></label>
            <div className="fun-zone-builder-fields fun-zone-question-fields"><label className="fun-zone-field"><span>Response style</span><select value={question.answer_mode} onChange={(event) => updateQuestion(index, "answer_mode", event.target.value)}><option value="choice">Choose an answer</option><option value="short_text">Write a short answer</option><option value="reflection">Share a reflection</option></select></label><label className="fun-zone-field"><span>Points for correct answer</span><input type="number" min="0" max="100" value={question.points} onChange={(event) => updateQuestion(index, "points", event.target.value)} /></label>
              {question.answer_mode === "choice" ? <><label className="fun-zone-field fun-zone-field-wide"><span>Answer options <small>One per line</small></span><textarea rows={3} value={question.optionsText} onChange={(event) => updateQuestion(index, "optionsText", event.target.value)} placeholder={"First option\nSecond option"} /></label><label className="fun-zone-field"><span>Correct answer number</span><select value={question.correct_option} onChange={(event) => updateQuestion(index, "correct_option", event.target.value)}><option value="">Choose correct option</option>{parseLines(question.optionsText).map((option, optionIndex) => <option key={optionIndex} value={optionIndex}>{optionIndex + 1}. {option}</option>)}</select></label></> : null}
              {question.answer_mode === "short_text" ? <label className="fun-zone-field fun-zone-field-wide"><span>Accepted answers <small>One per line, case-insensitive</small></span><textarea rows={2} value={question.acceptedAnswersText} onChange={(event) => updateQuestion(index, "acceptedAnswersText", event.target.value)} placeholder="accepted answer" /></label> : null}
              {question.answer_mode === "reflection" ? <div className="fun-zone-field-wide fun-zone-reflection-note">Written reflections are private to their author and group administrators. They earn participation points only.</div> : null}
              <label className="fun-zone-field fun-zone-field-wide"><span>Explanation after answering <small>Optional</small></span><textarea rows={2} maxLength={1200} value={question.explanation} onChange={(event) => updateQuestion(index, "explanation", event.target.value)} placeholder="Offer a helpful explanation or verse reference" /></label>
            </div>
          </fieldset>)}
          {actionError ? <p className="fun-zone-form-error" role="alert">{actionError}</p> : null}
          <footer className="fun-zone-form-actions"><button type="button" className="fun-zone-secondary-button" onClick={() => setShowBuilder(false)}>Cancel</button><button type="submit" className="fun-zone-primary-button" disabled={saving}>{saving ? "Saving…" : editingActivity ? "Save changes" : "Save activity"}<Icon name="arrow" /></button></footer>
        </form>
      </section></div> : null}

      {selectedActivity ? <div className="fun-zone-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeActivityModal(); }}><section className="fun-zone-modal fun-zone-player-modal" role="dialog" aria-modal="true" aria-labelledby="fun-zone-player-title"><header className="fun-zone-modal-header"><div><p className="fun-zone-overline">{getActivityType(selectedActivity.activity_type).label.toUpperCase()}</p><h2 id="fun-zone-player-title">{selectedActivity.title}</h2><p>{selectedActivity.description || selectedActivity.prompt}</p></div><button type="button" className="fun-zone-icon-button" onClick={closeActivityModal} aria-label="Close activity"><Icon name="close" /></button></header>
        {currentQuestions.length ? !activeAttempt ? <div className="fun-zone-review-loading">Opening your activity…</div> : activeAttempt.completed_at ? <div className="fun-zone-player-complete"><span className="fun-zone-complete-mark"><Icon name="trophy" /></span><p className="fun-zone-overline">WELL PLAYED</p><h3>{activeAttempt.total_points || 0} points</h3><p>You completed this activity. Here’s a look at what you learned.</p><div className="fun-zone-review-list">{attemptReview.map((answer, index) => <article key={answer.question_id}><div><b>{index + 1}. {answer.question_prompt}</b><span className={answer.is_correct ? "is-correct" : "is-not-correct"}>{answer.answer_mode === "reflection" ? "Reflection shared" : answer.is_correct ? `Correct · ${answer.points_awarded} pts` : "Keep learning"}</span></div>{answer.answer_mode === "choice" ? <p>Your answer: {(currentQuestions.find((question) => question.id === answer.question_id)?.options || [])[answer.selected_option] || "—"}{answer.correct_option != null ? ` · Correct answer: ${(currentQuestions.find((question) => question.id === answer.question_id)?.options || [])[answer.correct_option]}` : ""}</p> : <p>{answer.response_text}</p>}{answer.explanation ? <small>{answer.explanation}</small> : null}{answer.answer_mode === "short_text" && answer.accepted_answers?.length ? <small>Accepted answer: {answer.accepted_answers.join(" · ")}</small> : null}</article>)}</div><button type="button" className="fun-zone-primary-button" onClick={closeActivityModal}>Back to Fun Zone</button></div>
          : currentQuestion ? <form className="fun-zone-play-form" onSubmit={submitAnswer}><div className="fun-zone-question-progress"><span>QUESTION {questionIndex + 1} OF {currentQuestions.length}</span><div><i style={{ width: `${(questionIndex / currentQuestions.length) * 100}%` }} /></div></div><h3>{currentQuestion.prompt}</h3>{currentQuestion.answer_mode === "choice" ? <div className="fun-zone-answer-options">{(currentQuestion.options || []).map((option, index) => <button type="button" key={`${index}-${option}`} className={selectedOption === index ? "is-selected" : ""} aria-pressed={selectedOption === index} onClick={() => setSelectedOption(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div> : <label className="fun-zone-response-field"><span>{currentQuestion.answer_mode === "reflection" ? "Your reflection" : "Your answer"}</span><textarea required maxLength={2000} rows={4} value={responseText} onChange={(event) => setResponseText(event.target.value)} placeholder="Take a moment and share…" /></label>}{answerFeedback ? <div className={`fun-zone-answer-feedback${answerFeedback.question_is_correct === true ? " is-correct" : answerFeedback.question_is_correct === false ? " is-incorrect" : ""}`} role="status"><strong>{answerFeedback.question_is_correct == null ? "Thank you for sharing." : answerFeedback.question_is_correct ? "That’s right." : "Not quite. Keep going."}</strong>{answerFeedback.explanation ? <p>{answerFeedback.explanation}</p> : null}</div> : null}{actionError ? <p className="fun-zone-form-error" role="alert">{actionError}</p> : null}<footer className="fun-zone-form-actions">{answerFeedback ? <button type="button" className="fun-zone-primary-button" onClick={continueQuestion}>{answerFeedback.completed ? "See your results" : "Next question"}<Icon name="arrow" /></button> : <button type="submit" className="fun-zone-primary-button" disabled={busyActivity === selectedActivity.id || (currentQuestion.answer_mode === "choice" ? selectedOption == null : !responseText.trim())}>{busyActivity === selectedActivity.id ? "Saving…" : "Submit answer"}<Icon name="arrow" /></button>}</footer></form>
          : <p className="fun-zone-muted-note">This activity has no questions available.</p>
          : <div className="fun-zone-legacy-player"><p>{selectedActivity.prompt}</p>{legacyResponse ? <div className="fun-zone-answer-feedback is-correct" role="status"><strong>Thanks for joining in.</strong><p>{legacyResponse.awarded_points ? `You earned ${legacyResponse.awarded_points} point.` : "Your response has been recorded."}</p></div> : <div className="fun-zone-answer-options">{(selectedActivity.options || []).map((option, index) => <button type="button" key={`${index}-${option}`} disabled={busyActivity === selectedActivity.id} onClick={() => void submitLegacyAnswer(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>}</div>}
        {actionError && !currentQuestions.length ? <p className="fun-zone-form-error" role="alert">{actionError}</p> : null}
      </section></div> : null}

      {resultsActivity ? (
        <div className="fun-zone-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setResultsActivity(null); }}>
          <section className="fun-zone-modal fun-zone-results-modal" role="dialog" aria-modal="true" aria-labelledby="fun-zone-results-title">
            <header className="fun-zone-modal-header">
              <div><p className="fun-zone-overline">GROUP RESPONSES</p><h2 id="fun-zone-results-title">{resultsActivity.title}</h2><p>Shared results from City on a Hill.</p></div>
              <button type="button" className="fun-zone-icon-button" onClick={() => setResultsActivity(null)} aria-label="Close results"><Icon name="close" /></button>
            </header>
            <div className="fun-zone-result-questions">
              {(questionsByActivity[resultsActivity.id] || []).map((question, index) => {
                const rows = activityResults.filter((row) => row.question_id === question.id);
                const total = Number(rows[0]?.total_responses || 0);
                return (
                  <section key={question.id || index}>
                    <h3>{question.prompt || resultsActivity.prompt}</h3>
                    {question.answer_mode === "choice" ? (question.options || []).map((option, optionIndex) => {
                      const count = Number(rows.find((row) => Number(row.selected_option) === optionIndex)?.response_count || 0);
                      return <div className="fun-zone-result-row" key={optionIndex}><div><span>{option}</span><strong>{count}</strong></div><i style={{ width: `${total ? Math.round(count / total * 100) : 0}%` }} /></div>;
                    }) : <p>{total} responses shared.</p>}
                  </section>
                );
              })}
              {!(questionsByActivity[resultsActivity.id] || []).length ? (resultsActivity.options || []).map((option, optionIndex) => {
                const row = activityResults.find((item) => Number(item.selected_option) === optionIndex);
                const total = Number(activityResults[0]?.total_responses || 0);
                const count = Number(row?.response_count || 0);
                return <div className="fun-zone-result-row" key={optionIndex}><div><span>{option}</span><strong>{count}</strong></div><i style={{ width: `${total ? Math.round(count / total * 100) : 0}%` }} /></div>;
              }) : null}
              {!activityResults.length ? <p className="fun-zone-muted-note">No responses have been recorded yet.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {adminReviewActivity ? <div className="fun-zone-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminReviewActivity(null); }}><section className="fun-zone-modal fun-zone-admin-review-modal" role="dialog" aria-modal="true" aria-labelledby="fun-zone-admin-review-title"><header className="fun-zone-modal-header"><div><p className="fun-zone-overline">ADMIN VIEW · PRIVATE RESPONSES</p><h2 id="fun-zone-admin-review-title">{adminReviewActivity.title}</h2><p>Written reflections are visible only to their author and administrators.</p></div><button type="button" className="fun-zone-icon-button" onClick={() => setAdminReviewActivity(null)} aria-label="Close response review"><Icon name="close" /></button></header>{adminReviewLoading ? <div className="fun-zone-review-loading">Loading responses…</div> : adminReviewRows.length ? <div className="fun-zone-admin-responses">{adminReviewRows.map((row) => { const member = profiles.find((profile) => profile.id === row.user_id); return <article className="fun-zone-admin-response" key={row.id}><div className="fun-zone-admin-response-head"><strong>{member?.full_name || "Member"}</strong><span>{row.kind === "attempt" ? row.completed_at ? `${row.total_points} / ${row.max_points} points` : "In progress" : `${row.awarded_points || 0} points`}</span></div>{row.kind === "attempt" ? row.answers.map((answer) => <div className={`fun-zone-admin-answer${answer.is_hidden ? " is-hidden" : ""}`} key={answer.id}><p>{questionsByActivity[adminReviewActivity.id]?.find((question) => question.id === answer.question_id)?.prompt}</p><blockquote>{answer.response_text || (questionsByActivity[adminReviewActivity.id]?.find((question) => question.id === answer.question_id)?.options || [])[answer.selected_option] || "—"}</blockquote>{answer.response_text ? <button type="button" onClick={() => void hideResponse(answer)}>{answer.is_hidden ? "Restore response" : "Hide response"}</button> : null}</div>) : <p className="fun-zone-admin-legacy-answer">Selected: {(adminReviewActivity.options || [])[row.selected_option] || "—"}</p>}</article>; })}</div> : <p className="fun-zone-muted-note fun-zone-review-empty">No one has responded yet.</p>}</section></div> : null}
    </main>
  );
}
