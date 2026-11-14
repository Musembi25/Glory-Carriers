import test from "node:test";
import assert from "node:assert/strict";
import { getReadingDateInTimezone, summarizeGroupConsistency, summarizeGroupMemberActivity, summarizePersonalReadings } from "../src/lib/personalBibleStudy.js";
import { getNotificationCategory, getSectionForNotification } from "../src/lib/notificationRouting.js";

test("personal progress counts only completed personal plan readings", () => {
  const stats = summarizePersonalReadings([
    { book: "John", chapter: 1, reading_date: "2026-11-10", status: "completed", completed_at: "2026-11-10T10:00:00Z" },
    { book: "John", chapter: 2, reading_date: "2026-11-11", status: "planned", completed_at: null },
    { book: "Romans", chapter: 1, reading_date: "2026-11-12", status: "in_progress", completed_at: null }
  ], new Date("2026-11-12T12:00:00"));

  assert.equal(stats.completedCount, 1);
  assert.equal(stats.totalCount, 3);
  assert.equal(stats.completionPercent, 33);
  assert.equal(stats.nextReading.chapter, 2);
  assert.equal(stats.byBook.find((book) => book.book === "John").completed, 1);
});

test("streak totals are kept out of client calculated personal plan statistics", () => {
  const stats = summarizePersonalReadings([
    { book: "Psalms", chapter: 1, reading_date: "2026-11-10", status: "completed", completed_at: "2026-11-10T10:00:00Z" },
    { book: "Psalms", chapter: 2, reading_date: "2026-11-11", status: "completed", completed_at: "2026-11-11T10:00:00Z" },
    { book: "Psalms", chapter: 3, reading_date: "2026-11-11", status: "completed", completed_at: "2026-11-11T11:00:00Z" }
  ], new Date("2026-11-12T12:00:00"));

  assert.equal(stats.completedCount, 3);
  assert.equal(stats.streak, undefined);
});

test("the configured timezone determines the local reading day across UTC midnight", () => {
  assert.equal(getReadingDateInTimezone(new Date("2026-11-12T20:59:59Z"), "Africa/Nairobi"), "2026-11-12");
  assert.equal(getReadingDateInTimezone(new Date("2026-11-12T21:00:00Z"), "Africa/Nairobi"), "2026-11-13");
});

test("group consistency counts scheduled shared reading days at the configured participation threshold", () => {
  const readings = [
    { id: "mon-1", reading_date: "2026-11-09", status: "scheduled" },
    { id: "tue-1", reading_date: "2026-11-10", status: "scheduled" },
    { id: "wed-1", reading_date: "2026-11-11", status: "scheduled" },
    { id: "thu-1", reading_date: "2026-11-12", status: "scheduled" }
  ];
  const completions = [
    { reading_id: "mon-1", user_id: "a" }, { reading_id: "mon-1", user_id: "b" },
    { reading_id: "tue-1", user_id: "a" }, { reading_id: "tue-1", user_id: "b" },
    { reading_id: "wed-1", user_id: "a" },
    { reading_id: "thu-1", user_id: "a" }, { reading_id: "thu-1", user_id: "b" }
  ];
  const summary = summarizeGroupConsistency(readings, completions, 3, "2026-11-12", 50);
  assert.equal(summary.requiredParticipants, 2);
  assert.equal(summary.days.find((day) => day.date === "2026-11-11").complete, false);
  assert.equal(summary.currentStreak, 1);
  assert.equal(summary.longestStreak, 2);
});

test("unscheduled days do not break the group consistency run", () => {
  const readings = [
    { id: "mon", reading_date: "2026-11-09", status: "scheduled" },
    { id: "wed", reading_date: "2026-11-11", status: "scheduled" }
  ];
  const completions = [
    { reading_id: "mon", user_id: "a" },
    { reading_id: "wed", user_id: "a" }
  ];
  const summary = summarizeGroupConsistency(readings, completions, 1, "2026-11-11", 50);
  assert.equal(summary.currentStreak, 2);
  assert.equal(summary.days.length, 2);
});

test("group accountability requires every assigned chapter and uses live reading sessions", () => {
  const readings = [
    { id: "wed-1", book: "John", chapter: 1, reading_date: "2026-11-11", status: "scheduled" },
    { id: "wed-2", book: "John", chapter: 2, reading_date: "2026-11-11", status: "scheduled" },
    { id: "thu-1", book: "John", chapter: 3, reading_date: "2026-11-12", status: "scheduled" }
  ];
  const completions = [
    { id: "a-1", reading_id: "wed-1", user_id: "a", completed_at: "2026-11-11T09:00:00Z" },
    { id: "b-1", reading_id: "wed-1", user_id: "b", completed_at: "2026-11-11T09:00:00Z" },
    { id: "b-2", reading_id: "wed-2", user_id: "b", completed_at: "2026-11-11T09:15:00Z" }
  ];
  const sessions = [{ reading_id: "thu-1", user_id: "a", ended_at: null, last_seen_at: new Date().toISOString() }];
  const profiles = [{ id: "a", full_name: "A" }, { id: "b", full_name: "B" }, { id: "c", full_name: "C" }];
  const summary = summarizeGroupMemberActivity(readings, completions, sessions, profiles, "2026-11-12", "2026-11-12");
  assert.equal(summary.totalMembers, 3);
  assert.equal(summary.completedMembers, 0);
  assert.equal(summary.currentlyReading, 1);
  assert.equal(summary.pendingMembers, 2);
  assert.equal(summary.rows.find((row) => row.id === "a").weekCompleted, 1);
  assert.equal(summary.rows.find((row) => row.id === "b").longestStreak, 1);
});

test("past group accountability marks incomplete assigned chapters as missed", () => {
  const summary = summarizeGroupMemberActivity(
    [
      { id: "past-1", reading_date: "2026-11-10", status: "scheduled" },
      { id: "past-2", reading_date: "2026-11-10", status: "scheduled" }
    ],
    [{ reading_id: "past-1", user_id: "a", completed_at: "2026-11-10T10:00:00Z" }],
    [],
    [{ id: "a", full_name: "A" }],
    "2026-11-10",
    "2026-11-12"
  );
  assert.equal(summary.rows[0].status, "missed");
  assert.equal(summary.rows[0].completedCount, 1);
  assert.equal(summary.rows[0].completedAt, null);
});

test("Bible streak reminders route to the Bible Study notification category and page", () => {
  const reminder = { notification_type: "bible_study_reminder", entity_table: "bible_study_streaks" };
  assert.equal(getNotificationCategory(reminder.notification_type), "bible_study");
  assert.equal(getSectionForNotification(reminder), "bible-study");
});
