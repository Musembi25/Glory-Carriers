export const DEPARTMENTS = [
  "Praise & Worship",
  "Band",
  "Media",
  "Ushering",
  "Children's Ministry",
  "Teens Ministry",
  "Evangelism",
  "Prayer",
  "Discipleship",
  "Hospitality",
  "Technical",
  "Administration",
  "Other",
  "None"
];

export const INACTIVE_MEMBERSHIP_STATUSES = ["inactive", "temporarily_inactive", "left", "removed"];

export const EDITABLE_MEMBERSHIP_STATUSES = [
  { value: "active", label: "Active", pillClass: "cgm-pill success" },
  { value: "prospective", label: "Prospective", pillClass: "cgm-pill info" },
  { value: "pending", label: "Pending", pillClass: "cgm-pill warning" },
  { value: "inactive", label: "Inactive", pillClass: "cgm-pill muted" }
];

export const MEMBERSHIP_STATUSES = EDITABLE_MEMBERSHIP_STATUSES;

export function normalizeMembershipStatus(status) {
  // Legacy `new` rows already had member access in the database policies.
  if (status === "new") return "active";
  if (["temporarily_inactive", "left", "removed"].includes(status)) return "inactive";
  return EDITABLE_MEMBERSHIP_STATUSES.some((item) => item.value === status) ? status : "prospective";
}

export function getMemberName(member) {
  return member?.full_name || member?.profile?.full_name || "";
}

export function getMemberEmail(member) {
  return member?.contact_email || member?.profile?.email || "";
}

export const DISCIPLESHIP_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

export const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" }
];

export const EXPORT_FIELDS = [
  { key: "full_name", label: "Full Name", default: true },
  { key: "date_of_birth", label: "Birthday", default: true },
  { key: "department", label: "Department(s)", default: true },
  { key: "custom_department", label: "Custom Department", default: true },
  { key: "favorite_food", label: "Favorite Food", default: true },
  { key: "joined_month", label: "Joined Month", default: true },
  { key: "joined_year", label: "Joined Year", default: true },
  { key: "joined_date", label: "Exact Joined Date", default: true },
  { key: "discipleship_status", label: "Discipleship Completed", default: true },
  { key: "membership_status", label: "Membership Status", default: true },
  { key: "email", label: "Email", default: true },
  { key: "phone", label: "Phone", default: true }
];

export const MANAGEMENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "membership", label: "Membership" },
  { id: "requests", label: "Join Requests" },
  { id: "rules", label: "Group Rules" },
  { id: "settings", label: "Settings" },
  { id: "activity", label: "Activity" }
];

export function isCurrentMember(member) {
  return member && member.membership_status_raw !== "removed"
    && member.membership_status !== "removed"
    && !INACTIVE_MEMBERSHIP_STATUSES.includes(member.membership_status_raw || member.membership_status);
}

export function normalizeDiscipleshipStatus(status) {
  return status === "yes" ? "yes" : "no";
}

export function getInitials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function formatDate(value) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today · ${new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date)}`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDateTime(value);
}

export function formatJoinedDate(member) {
  if (member.joined_month && member.joined_year) {
    const monthLabel = MONTHS.find((m) => m.value === member.joined_month)?.label ?? "";
    return `${monthLabel} ${member.joined_year}`;
  }
  if (member.joined_date) return formatDate(member.joined_date);
  return "Not provided";
}

export function formatMemberBirthday(member) {
  const day = Number(member.birth_day || (member.date_of_birth ? member.date_of_birth.slice(8, 10) : 0));
  const month = Number(member.birth_month || (member.date_of_birth ? member.date_of_birth.slice(5, 7) : 0));
  if (!day || !month) return "Not provided";
  const date = new Date(2000, month - 1, day);
  const label = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(date);
  const year = member.birth_year || (member.date_of_birth ? member.date_of_birth.slice(0, 4) : "");
  return year ? `${label}, ${year}` : label;
}

export function formatDepartments(member) {
  const deps = member.departments ?? [];
  if (!deps.length || deps.includes("None")) return "None";
  const labels = deps.filter((d) => d !== "Other");
  if (deps.includes("Other") && member.custom_department) {
    labels.push(member.custom_department);
  } else if (deps.includes("Other")) {
    labels.push("Other");
  }
  return labels.length ? labels.join(", ") : "None";
}

export function getDepartmentChips(member) {
  const text = formatDepartments(member);
  if (text === "None") return [];
  return text.split(", ").filter(Boolean);
}

export function getMembershipStatusMeta(status) {
  const normalized = normalizeMembershipStatus(status);
  return MEMBERSHIP_STATUSES.find((s) => s.value === normalized) ?? EDITABLE_MEMBERSHIP_STATUSES[0];
}

export function getDiscipleshipLabel(status) {
  return normalizeDiscipleshipStatus(status) === "yes" ? "Yes" : "No";
}

export function validateEmail(email) {
  if (!email?.trim()) return null;
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email.trim()) ? null : "Enter a valid email address";
}

export function validatePhone(phone) {
  if (!phone?.trim()) return null;
  const cleaned = phone.replace(/[\s\-().+]/g, "");
  if (cleaned.length < 7 || cleaned.length > 15) {
    return "Enter a valid phone number";
  }
  if (!/^\+?\d+$/.test(cleaned)) {
    return "Enter a valid phone number";
  }
  return null;
}

export function validateMemberForm(form, { isEdit = false } = {}) {
  const errors = {};

  if (!form.full_name?.trim()) {
    errors.full_name = "Full name is required";
  }

  if (form.mode === "invite" && !isEdit) {
    if (!form.email?.trim()) errors.email = "Email is required for an invitation";
  }
  const emailError = validateEmail(form.email);
  if (emailError) errors.email = emailError;

  const phoneError = validatePhone(form.phone);
  if (phoneError) errors.phone = phoneError;

  const birthdayDay = Number(form.birth_day);
  const birthdayMonth = Number(form.birth_month);
  const birthdayYear = form.birth_year ? Number(form.birth_year) : null;
  if (!form.birth_day) errors.birth_day = "Birthday day is required";
  if (!form.birth_month) errors.birth_month = "Birthday month is required";
  if (form.birth_day && form.birth_month) {
    const maximumDay = new Date(2000, birthdayMonth, 0).getDate();
    if (!Number.isInteger(birthdayDay) || !Number.isInteger(birthdayMonth) || birthdayMonth < 1 || birthdayMonth > 12 || birthdayDay < 1 || birthdayDay > maximumDay) {
      errors.birth_day = "Choose a valid day for the selected month";
    }
  }
  if (birthdayYear !== null && (!Number.isInteger(birthdayYear) || birthdayYear < 1900 || birthdayYear > new Date().getFullYear())) {
    errors.birth_year = "Enter a valid birth year, or leave it blank";
  }
  if (birthdayYear !== null && form.birth_day && form.birth_month) {
    const date = new Date(birthdayYear, birthdayMonth - 1, birthdayDay);
    if (date.getFullYear() !== birthdayYear || date.getMonth() !== birthdayMonth - 1 || date.getDate() !== birthdayDay) {
      errors.birth_year = "That birthday does not occur in the selected birth year";
    }
  }

  if (form.joined_date) {
    const jd = new Date(form.joined_date);
    if (Number.isNaN(jd.getTime()) || jd > new Date()) {
      errors.joined_date = "Enter a valid join date";
    }
  }

  if (form.joined_month && !form.joined_year) {
    errors.joined_year = "Year is required when month is selected";
  }

  if (form.joined_year && !form.joined_month) {
    errors.joined_month = "Month is required when year is selected";
  }

  const deps = form.departments ?? [];
  if (deps.includes("Other") && !form.custom_department?.trim()) {
    errors.custom_department = "Specify the department";
  }

  return errors;
}

export function emptyMemberForm() {
  return {
    mode: "record",
    record_id: "",
    original_membership_status: "",
    user_id: "",
    full_name: "",
    email: "",
    phone: "",
    gender: "",
    bio: "",
    notes: "",
    date_of_birth: "",
    birth_day: "",
    birth_month: "",
    birth_year: "",
    favorite_food: "",
    departments: [],
    custom_department: "",
    joined_month: "",
    joined_year: "",
    joined_date: "",
    discipleship_status: "no",
    membership_status: "prospective"
  };
}

export function memberToForm(member, profile) {
  const oldBirthday = member.date_of_birth ? new Date(`${member.date_of_birth}T00:00:00`) : null;
  return {
    mode: "edit",
    record_id: member.id,
    original_membership_status: member.membership_status_raw ?? member.membership_status,
    user_id: member.user_id,
    full_name: profile?.full_name || member.full_name || "",
    email: profile?.email || member.contact_email || "",
    phone: member.phone || "",
    gender: member.gender || "",
    bio: member.bio || "",
    notes: member.notes || "",
    date_of_birth: member.date_of_birth || "",
    birth_day: member.birth_day || (oldBirthday && !Number.isNaN(oldBirthday.getTime()) ? oldBirthday.getDate() : ""),
    birth_month: member.birth_month || (oldBirthday && !Number.isNaN(oldBirthday.getTime()) ? oldBirthday.getMonth() + 1 : ""),
    birth_year: member.birth_year || (oldBirthday && !Number.isNaN(oldBirthday.getTime()) ? oldBirthday.getFullYear() : ""),
    favorite_food: member.favorite_food || "",
    departments: member.departments?.length ? [...member.departments] : [],
    custom_department: member.custom_department || "",
    joined_month: member.joined_month || "",
    joined_year: member.joined_year || "",
    joined_date: member.joined_date || "",
    discipleship_status: normalizeDiscipleshipStatus(member.discipleship_status),
    membership_status: normalizeMembershipStatus(member.membership_status)
  };
}

export function buildMemberPayload(form) {
  const birthDay = Number(form.birth_day);
  const birthMonth = Number(form.birth_month);
  const birthYear = form.birth_year ? Number(form.birth_year) : null;
  const dateOfBirth = birthYear
    ? `${String(birthYear).padStart(4, "0")}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`
    : null;
  const legacyStatus = form.original_membership_status;
  const keepLegacyStatus = ["new", "temporarily_inactive", "left", "removed"].includes(legacyStatus)
    && normalizeMembershipStatus(legacyStatus) === form.membership_status;

  return {
    full_name: form.full_name?.trim() || null,
    contact_email: form.email?.trim().toLowerCase() || null,
    date_of_birth: dateOfBirth,
    birth_day: birthDay,
    birth_month: birthMonth,
    birth_year: birthYear,
    departments: form.departments.includes("None") ? [] : form.departments.filter((department) => department !== "None"),
    custom_department: form.departments.includes("Other") ? form.custom_department?.trim() || null : null,
    favorite_food: form.favorite_food?.trim() || null,
    joined_month: form.joined_month ? Number(form.joined_month) : null,
    joined_year: form.joined_year ? Number(form.joined_year) : null,
    joined_date: form.joined_date || null,
    discipleship_status: normalizeDiscipleshipStatus(form.discipleship_status),
    membership_status: keepLegacyStatus ? legacyStatus : form.membership_status,
    phone: form.phone?.trim() || null,
    gender: form.gender?.trim() || null,
    bio: form.bio?.trim() || null,
    notes: form.notes?.trim() || null
  };
}

function getDatePartsInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  } catch {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
}

export function getBirthdayOccurrence(member, referenceDate = new Date(), timeZone = "UTC") {
  const day = Number(member.birth_day || (member.date_of_birth ? member.date_of_birth.slice(8, 10) : 0));
  const month = Number(member.birth_month || (member.date_of_birth ? member.date_of_birth.slice(5, 7) : 0));
  if (!day || !month || month < 1 || month > 12 || day < 1 || day > new Date(2000, month, 0).getDate()) return null;

  const { year: currentYear, month: currentMonth, day: currentDay } = getDatePartsInTimeZone(referenceDate, timeZone);
  const today = new Date(currentYear, currentMonth - 1, currentDay);
  const observedDate = (year) => month === 2 && day === 29 && new Date(year, 1, 29).getMonth() !== 1
    ? new Date(year, 2, 1)
    : new Date(year, month - 1, day);
  let nextBirthday = observedDate(currentYear);
  if (nextBirthday < today) nextBirthday = observedDate(currentYear + 1);
  const daysUntil = Math.round((nextBirthday - today) / 86400000);
  const birthYear = Number(member.birth_year || (member.date_of_birth ? member.date_of_birth.slice(0, 4) : 0)) || null;

  return {
    date: nextBirthday,
    daysUntil,
    age: birthYear && birthYear <= nextBirthday.getFullYear() ? nextBirthday.getFullYear() - birthYear : null,
    displayDate: new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric" }).format(new Date(2000, month - 1, day)),
    observedLeapDay: month === 2 && day === 29 && nextBirthday.getMonth() === 2
  };
}

export function toggleDepartmentSelection(current, dept) {
  if (dept === "None") {
    return { departments: ["None"], custom_department: "" };
  }
  let deps = current.filter((d) => d !== "None");
  if (deps.includes(dept)) {
    deps = deps.filter((d) => d !== dept);
  } else {
    deps = [...deps, dept];
  }
  return { departments: deps };
}


export function filterMembers(
  members,
  { search = "", status = "all", department = "all", discipleship = "all", joinedYear = "all", sort = "name_asc", currentOnly = true } = {}
) {
  let result = members.filter((member) => member.membership_status_raw !== "removed" && member.membership_status !== "removed");
  if (currentOnly) result = result.filter(isCurrentMember);

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (m) =>
        getMemberName(m).toLowerCase().includes(q) ||
        getMemberEmail(m).toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q)
    );
  }

  if (status !== "all") {
    result = result.filter((m) => normalizeMembershipStatus(m.membership_status) === status);
  }

  if (department !== "all") {
    result = result.filter((m) => {
      const deps = m.departments ?? [];
      if (department === "None") return !deps.length || deps.includes("None");
      if (department === "Other") return deps.includes("Other");
      return deps.includes(department);
    });
  }

  if (discipleship !== "all") {
    result = result.filter((m) => normalizeDiscipleshipStatus(m.discipleship_status) === discipleship);
  }

  if (joinedYear !== "all") {
    result = result.filter((m) => String(m.joined_year) === String(joinedYear));
  }

  result.sort((a, b) => {
    const nameA = getMemberName(a).toLowerCase();
    const nameB = getMemberName(b).toLowerCase();
    switch (sort) {
      case "name_desc":
        return nameB.localeCompare(nameA);
      case "joined_newest":
        return (b.joined_year ?? 0) - (a.joined_year ?? 0) || (b.joined_month ?? 0) - (a.joined_month ?? 0);
      case "joined_oldest":
        return (a.joined_year ?? 0) - (b.joined_year ?? 0) || (a.joined_month ?? 0) - (b.joined_month ?? 0);
      case "status":
        return (a.membership_status ?? "").localeCompare(b.membership_status ?? "");
      default:
        return nameA.localeCompare(nameB);
    }
  });

  return result;
}

export function buildMemberExportRow(member, fields) {
  const row = {};
  const fieldSet = new Set(fields);

  if (fieldSet.has("full_name")) row["Full Name"] = getMemberName(member);
  if (fieldSet.has("date_of_birth")) row.Birthday = formatMemberBirthday(member);
  if (fieldSet.has("department")) row["Department(s)"] = formatDepartments(member);
  if (fieldSet.has("custom_department")) row["Custom Department"] = member.custom_department ?? "";
  if (fieldSet.has("favorite_food")) row["Favorite Food"] = member.favorite_food ?? "";
  if (fieldSet.has("joined_month")) {
    row["Joined Month"] = member.joined_month
      ? MONTHS.find((m) => m.value === member.joined_month)?.label ?? ""
      : "";
  }
  if (fieldSet.has("joined_year")) row["Joined Year"] = member.joined_year ?? "";
  if (fieldSet.has("joined_date")) row["Exact Joined Date"] = member.joined_date ? formatDate(member.joined_date) : "";
  if (fieldSet.has("discipleship_status")) {
    row["Discipleship Completed"] = getDiscipleshipLabel(member.discipleship_status);
  }
  if (fieldSet.has("membership_status")) {
    row["Membership Status"] = getMembershipStatusMeta(member.membership_status).label;
  }
  if (fieldSet.has("email")) row["Email"] = getMemberEmail(member);
  if (fieldSet.has("phone")) row["Phone"] = member.phone ?? "";

  return row;
}

export function formsAreEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
