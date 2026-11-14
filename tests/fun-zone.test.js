import test from "node:test";
import assert from "node:assert/strict";
import {
  getAchievementProgress,
  getActivityAvailability,
  getActivityType,
  sortLeaderboard
} from "../src/lib/funZone.js";

test("activity availability honors draft, schedule, completion, and close times", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(getActivityAvailability({ status: "draft", starts_at: "2026-11-12T10:00:00Z" }, now), "draft");
  assert.equal(getActivityAvailability({ status: "open", starts_at: "2026-11-12T13:00:00Z" }, now), "scheduled");
  assert.equal(getActivityAvailability({ status: "open", starts_at: "2026-11-12T10:00:00Z" }, now), "live");
  assert.equal(getActivityAvailability({ status: "open", starts_at: "2026-11-12T10:00:00Z", closes_at: "2026-11-12T11:59:00Z" }, now), "completed");
  assert.equal(getActivityAvailability({ status: "cancelled" }, now), "cancelled");
});

test("leaderboard sorts by points and assigns competition ranks to ties", () => {
  const rows = sortLeaderboard([
    { user_id: "c", full_name: "Cedar", points: 8 },
    { user_id: "b", full_name: "Birch", points: 12 },
    { user_id: "a", full_name: "Ash", points: 12 },
    { user_id: "d", full_name: "Dogwood", points: 3 }
  ]);
  assert.deepEqual(rows.map(({ user_id, position }) => [user_id, position]), [
    ["a", 1], ["b", 1], ["c", 3], ["d", 4]
  ]);
});

test("achievement progress clamps display values and recognizes earned milestones", () => {
  const definition = { metric_key: "bible_activities_completed", threshold_count: 3 };
  assert.deepEqual(getAchievementProgress(definition, { bible_completed_count: 2 }), {
    current: 2, target: 3, percent: 67, earned: false
  });
  assert.deepEqual(getAchievementProgress(definition, { bible_completed_count: 5 }), {
    current: 3, target: 3, percent: 100, earned: true
  });
  assert.equal(getAchievementProgress(definition, {}, true).earned, true);
});

test("unknown existing activity types remain readable as community activities", () => {
  assert.deepEqual(getActivityType("retired_type"), {
    id: "retired_type",
    label: "Community activity",
    category: "general_knowledge",
    scored: false
  });
});
