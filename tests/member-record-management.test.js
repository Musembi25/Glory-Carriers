import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMemberPayload,
  emptyMemberForm,
  filterMembers,
  memberToForm,
  normalizeMembershipStatus,
  validateMemberForm
} from "../src/lib/cellGroupManagement.js";

function validProspective(overrides = {}) {
  return {
    ...emptyMemberForm(),
    full_name: "  Grace Wanjiku  ",
    birth_day: 29,
    birth_month: 2,
    ...overrides
  };
}

test("new records default to prospective and do not require an account or email", () => {
  const form = emptyMemberForm();
  assert.equal(form.mode, "record");
  assert.equal(form.membership_status, "prospective");
  assert.equal(form.user_id, "");
  assert.equal(form.email, "");
  assert.deepEqual(validateMemberForm(validProspective()), {});
});

test("invitation email remains required and optional email is validated when present", () => {
  const invitation = validProspective({ mode: "invite", email: "" });
  assert.equal(validateMemberForm(invitation).email, "Email is required for an invitation");
  assert.equal(validateMemberForm(validProspective({ email: "not-an-email" })).email, "Enter a valid email address");
});

test("birthday day and month are required, and optional birth year uses the correct date", () => {
  assert.equal(validateMemberForm(validProspective({ birth_day: "", birth_month: "" })).birth_day, "Birthday day is required");
  assert.equal(validateMemberForm(validProspective({ birth_year: 2001 })).birth_year, "That birthday does not occur in the selected birth year");
  const payload = buildMemberPayload(validProspective({ birth_year: 2000, email: "  PERSON@EXAMPLE.COM " }));
  assert.equal(payload.date_of_birth, "2000-02-29");
  assert.equal(payload.contact_email, "person@example.com");
  assert.equal(payload.full_name, "Grace Wanjiku");
});

test("membership status filters include all four supported states and normalize legacy rows", () => {
  const records = ["prospective", "pending", "active", "inactive", "new", "left"].map((membership_status, index) => ({
    id: String(index),
    membership_status,
    full_name: `Person ${index}`,
    contact_email: `person${index}@example.com`
  }));
  assert.equal(normalizeMembershipStatus("new"), "active");
  assert.equal(normalizeMembershipStatus("left"), "inactive");
  assert.equal(filterMembers(records, { status: "all", currentOnly: false }).length, 6);
  assert.equal(filterMembers(records, { status: "prospective", currentOnly: false }).length, 1);
  assert.equal(filterMembers(records, { status: "active", currentOnly: false }).length, 2);
  assert.equal(filterMembers(records, { status: "inactive", currentOnly: false }).length, 2);
});

test("soft-removed memberships are excluded from all report filters, while inactive records remain available", () => {
  const records = [
    { id: "active", membership_status: "active", full_name: "Active Member" },
    { id: "inactive", membership_status: "inactive", full_name: "Inactive Member" },
    {
      id: "removed",
      membership_status: "inactive",
      membership_status_raw: "removed",
      full_name: "Removed Member"
    }
  ];

  assert.deepEqual(
    filterMembers(records, { search: "removed", currentOnly: false }).map(({ id }) => id),
    []
  );
  assert.deepEqual(
    filterMembers(records, { status: "inactive", currentOnly: false }).map(({ id }) => id),
    ["inactive"]
  );
  assert.deepEqual(
    filterMembers(records, { currentOnly: false }).map(({ id }) => id),
    ["active", "inactive"]
  );
});

test("editing keeps the independent record fields and optional account link", () => {
  const member = {
    id: "record-id",
    user_id: null,
    full_name: "Grace Wanjiku",
    contact_email: "grace@example.com",
    membership_status: "prospective",
    birth_day: 4,
    birth_month: 7,
    birth_year: null,
    joined_month: null,
    joined_year: null,
    departments: ["Prayer"],
    notes: "Call after service"
  };
  const form = memberToForm(member, null);
  assert.equal(form.user_id, null);
  assert.equal(form.full_name, member.full_name);
  assert.equal(form.email, member.contact_email);
  assert.equal(form.membership_status, "prospective");
  assert.equal(form.joined_month, "");
  assert.deepEqual(form.departments, ["Prayer"]);
  assert.equal(form.notes, member.notes);
});

test("saving other fields preserves legacy access until an administrator changes the status", () => {
  const form = memberToForm({
    id: "legacy-record",
    user_id: "account-id",
    membership_status: "inactive",
    membership_status_raw: "temporarily_inactive",
    birth_day: 12,
    birth_month: 3,
    departments: []
  }, null);
  assert.equal(form.membership_status, "inactive");
  assert.equal(buildMemberPayload(form).membership_status, "temporarily_inactive");
  form.membership_status = "active";
  assert.equal(buildMemberPayload(form).membership_status, "active");
});
