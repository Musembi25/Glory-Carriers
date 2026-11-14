import test from "node:test";
import assert from "node:assert/strict";
import { formatBirthdayDate, getBirthdayOccurrence, getBirthdayParts, getLocalDateKey } from "../src/lib/dashboardBirthday.js";

test("birthday matching uses month and day without depending on the birth year", () => {
  const occurrence = getBirthdayOccurrence({ date_of_birth: "1984-11-13" }, new Date("2026-11-13T10:00:00Z"), "Africa/Nairobi");
  assert.equal(occurrence.isToday, true);
  assert.equal(occurrence.daysUntil, 0);
  assert.equal(occurrence.dateKey, "2026-11-13");
});

test("members sharing a birthday are independently recognized on the same local day", () => {
  const today = new Date("2026-08-07T12:00:00Z");
  const members = [
    { user_id: "member-a", birth_month: 8, birth_day: 7 },
    { user_id: "member-b", date_of_birth: "1999-08-07" }
  ];
  assert.deepEqual(members.map((member) => getBirthdayOccurrence(member, today, "UTC").isToday), [true, true]);
});

test("missing and invalid birthday fields never become a celebration", () => {
  assert.equal(getBirthdayParts(null), null);
  assert.equal(getBirthdayParts({}), null);
  assert.equal(getBirthdayParts({ birth_month: 2, birth_day: 30 }), null);
  assert.equal(getBirthdayParts({ date_of_birth: "not-a-date" }), null);
});

test("date of birth parsing is date-only and does not shift through the browser timezone", () => {
  const birthday = getBirthdayParts({ date_of_birth: "2001-07-04" });
  assert.deepEqual(birthday, { month: 7, day: 4 });
  assert.equal(formatBirthdayDate(birthday.month, birthday.day), "Jul 4");
});

test("birthday boundaries use the configured group timezone", () => {
  const moment = new Date("2026-06-01T16:30:00Z");
  assert.equal(getLocalDateKey(moment, "Asia/Tokyo"), "2026-06-02");
  assert.equal(getBirthdayOccurrence({ birth_month: 6, birth_day: 2 }, moment, "Asia/Tokyo").isToday, true);
  assert.equal(getBirthdayOccurrence({ birth_month: 6, birth_day: 2 }, moment, "America/Los_Angeles").isToday, false);
});

test("February 29 is honored on leap years and on March 1 in other years", () => {
  const leap = getBirthdayOccurrence({ birth_month: 2, birth_day: 29 }, new Date("2028-02-29T12:00:00Z"), "UTC");
  const commonYear = getBirthdayOccurrence({ birth_month: 2, birth_day: 29 }, new Date("2027-03-01T12:00:00Z"), "UTC");
  assert.equal(leap.isToday, true);
  assert.equal(commonYear.isToday, true);
  assert.equal(commonYear.dateKey, "2027-03-01");
});

test("invalid timezone values fall back to a stable UTC day", () => {
  assert.equal(getLocalDateKey(new Date("2026-12-31T23:30:00Z"), "invalid/timezone"), "2026-12-31");
});
