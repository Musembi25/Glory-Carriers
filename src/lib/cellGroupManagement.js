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

export const INACTIVE_MEMBERSHIP_STATUSES = ["removed", "left"];

export const EDITABLE_MEMBERSHIP_STATUSES = [
  { value: "active", label: "Active", pillClass: "cgm-pill success" },
  { value: "new", label: "New", pillClass: "cgm-pill info" },
  { value: "temporarily_inactive", label: "Temporarily Inactive", pillClass: "cgm-pill warning" },
  { value: "left", label: "Left", pillClass: "cgm-pill muted" }
];

export const MEMBERSHIP_STATUSES = [
  ...EDITABLE_MEMBERSHIP_STATUSES,
  { value: "removed", label: "Removed", pillClass: "cgm-pill danger" }
];

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
  { key: "date_of_birth", label: "Date of Birth", default: true },
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
  return member && !INACTIVE_MEMBERSHIP_STATUSES.includes(member.membership_status);
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
  return MEMBERSHIP_STATUSES.find((s) => s.value === status) ?? EDITABLE_MEMBERSHIP_STATUSES[0];
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

export function validateMemberForm(form, { isExistingUser = false, isEdit = false } = {}) {
  const errors = {};

  if (!form.full_name?.trim()) {
    errors.full_name = "Full name is required";
  }

  if (!isEdit && !isExistingUser) {
    const emailError = validateEmail(form.email);
    if (emailError) errors.email = emailError;
  }

  const phoneError = validatePhone(form.phone);
  if (phoneError) errors.phone = phoneError;

  if (form.date_of_birth) {
    const dob = new Date(form.date_of_birth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      errors.date_of_birth = "Enter a valid date of birth";
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
  const now = new Date();
  return {
    mode: "existing",
    user_id: "",
    full_name: "",
    email: "",
    phone: "",
    gender: "",
    bio: "",
    notes: "",
    date_of_birth: "",
    favorite_food: "",
    departments: [],
    custom_department: "",
    joined_month: now.getMonth() + 1,
    joined_year: now.getFullYear(),
    joined_date: "",
    discipleship_status: "no",
    membership_status: "new",
    avatar_file: null,
    avatar_preview: "",
    remove_avatar: false
  };
}

export function memberToForm(member, profile) {
  return {
    mode: "edit",
    user_id: member.user_id,
    full_name: profile?.full_name || "",
    email: profile?.email || "",
    phone: member.phone || "",
    gender: member.gender || "",
    bio: member.bio || "",
    notes: member.notes || "",
    date_of_birth: member.date_of_birth || "",
    favorite_food: member.favorite_food || "",
    departments: member.departments?.length ? [...member.departments] : [],
    custom_department: member.custom_department || "",
    joined_month: member.joined_month || "",
    joined_year: member.joined_year || "",
    joined_date: member.joined_date || "",
    discipleship_status: normalizeDiscipleshipStatus(member.discipleship_status),
    membership_status: member.membership_status || "active",
    avatar_file: null,
    avatar_preview: profile?.avatar_url || "",
    remove_avatar: false
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

export async function optimizeImage(file, maxSize = 800, quality = 0.85) {
  if (!file?.type?.startsWith("image/")) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }));
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to process image"));
    };

    img.src = url;
  });
}

export function filterMembers(
  members,
  { search = "", status = "all", department = "all", discipleship = "all", joinedYear = "all", sort = "name_asc", currentOnly = true } = {}
) {
  let result = currentOnly ? members.filter(isCurrentMember) : [...members];

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (m) =>
        m.profile?.full_name?.toLowerCase().includes(q) ||
        m.profile?.email?.toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q)
    );
  }

  if (status !== "all") {
    result = result.filter((m) => m.membership_status === status);
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
    const nameA = (a.profile?.full_name ?? "").toLowerCase();
    const nameB = (b.profile?.full_name ?? "").toLowerCase();
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

  if (fieldSet.has("full_name")) row["Full Name"] = member.profile?.full_name ?? "";
  if (fieldSet.has("date_of_birth")) row["Date of Birth"] = member.date_of_birth ? formatDate(member.date_of_birth) : "Not provided";
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
  if (fieldSet.has("email")) row["Email"] = member.profile?.email ?? "";
  if (fieldSet.has("phone")) row["Phone"] = member.phone ?? "";

  return row;
}

export function formsAreEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
