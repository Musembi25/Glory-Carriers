const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

function validBirthdayParts(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  return day <= new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

export function getBirthdayParts(member) {
  if (!member || typeof member !== "object") return null;
  let month = Number(member.birth_month);
  let day = Number(member.birth_day);

  if (!validBirthdayParts(month, day)) {
    const match = typeof member.date_of_birth === "string" ? member.date_of_birth.match(DATE_ONLY_PATTERN) : null;
    if (!match) return null;
    const [, , monthPart, dayPart] = match;
    month = Number(monthPart);
    day = Number(dayPart);
  }

  return validBirthdayParts(month, day) ? { month, day } : null;
}

function getDatePartsInTimeZone(date, timeZone) {
  try {
    const values = new Intl.DateTimeFormat("en", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric"
    }).formatToParts(date);
    return Object.fromEntries(values
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]));
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  }
}

function birthdayDateForYear(month, day, year) {
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 2 && day === 29 && !isLeapYear) return Date.UTC(year, 2, 1);
  return Date.UTC(year, month - 1, day);
}

export function getBirthdayOccurrence(member, referenceDate = new Date(), timeZone = "UTC") {
  const birthday = getBirthdayParts(member);
  if (!birthday || !(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) return null;

  const todayParts = getDatePartsInTimeZone(referenceDate, timeZone);
  const today = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  let nextBirthday = birthdayDateForYear(birthday.month, birthday.day, todayParts.year);
  if (nextBirthday < today) nextBirthday = birthdayDateForYear(birthday.month, birthday.day, todayParts.year + 1);
  const daysUntil = Math.round((nextBirthday - today) / 86_400_000);
  const date = new Date(nextBirthday);

  return {
    ...birthday,
    date,
    daysUntil,
    isToday: daysUntil === 0,
    dateKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
  };
}

export function formatBirthdayDate(month, day, options = { month: "short", day: "numeric" }) {
  if (!validBirthdayParts(Number(month), Number(day))) return "";
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, Number(month) - 1, Number(day))));
}

export function getLocalDateKey(date = new Date(), timeZone = "UTC") {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
