import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { MemberInitials } from "../MemberInitials.jsx";
import { getBirthdayOccurrence, getInitials, formatDepartments } from "../../lib/cellGroupManagement";
import "../../styles/birthday-management.css";

const MEMBERSHIP_STATUSES = ["active", "prospective", "pending", "new", "temporarily_inactive"];

function CalendarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
    </svg>
  );
}

function BirthdayIdentity({ profile, detail = false }) {
  const className = detail ? "birthday-detail-identity" : "birthday-member-identity";
  return <MemberInitials member={profile} className={className} />;
}

function formatAgeLabel(birthday) {
  return birthday.age === 1 ? "Turns 1" : `Turns ${birthday.age}`;
}

export function BirthdayManagementSection({ profiles = [], isAdmin, groupId = "", focusMemberId = "", onFocusHandled }) {
  const [members, setMembers] = useState([]);
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [search, setSearch] = useState("");
  const handledFocusId = useRef("");

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const birthdayMembers = useMemo(() => members
    .filter((member) => MEMBERSHIP_STATUSES.includes(member.membership_status))
    .map((member) => ({
      ...member,
      profile: {
        ...profileMap.get(member.user_id),
        full_name: member.full_name || profileMap.get(member.user_id)?.full_name || "",
        email: member.contact_email || profileMap.get(member.user_id)?.email || ""
      },
      birthday: getBirthdayOccurrence(member, new Date(), timeZone)
    }))
    .filter((member) => member.birthday && profileMap.get(member.user_id)?.is_active !== false)
    .sort((left, right) => left.birthday.daysUntil - right.birthday.daysUntil || (left.profile?.full_name || "").localeCompare(right.profile?.full_name || "")),
  [members, profileMap, timeZone]);
  const todayBirthdays = birthdayMembers.filter((member) => member.birthday.daysUntil === 0);
  const upcomingBirthdays = birthdayMembers.filter((member) => member.birthday.daysUntil > 0 && member.birthday.daysUntil <= 30);
  const visibleMembers = birthdayMembers.filter((member) => {
    const query = search.trim().toLowerCase();
    return !query || member.profile?.full_name?.toLowerCase().includes(query) || member.profile?.email?.toLowerCase().includes(query);
  });

  async function loadBirthdays() {
    if (!supabase || !isAdmin || !groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [memberResult, groupResult] = await Promise.all([
      supabase.from("cell_group_members").select("id,user_id,cell_group_id,full_name,contact_email,birth_day,birth_month,birth_year,date_of_birth,departments,custom_department,favorite_food,phone,joined_month,joined_year,membership_status").eq("cell_group_id", groupId).in("membership_status", MEMBERSHIP_STATUSES),
      supabase.from("cell_groups").select("timezone").eq("id", groupId).maybeSingle()
    ]);
    if (memberResult.error) {
      setError("Birthday information could not be loaded. Apply the member birthday migration, then try again.");
      setMembers([]);
    } else {
      setMembers(memberResult.data || []);
      setTimeZone(groupResult.data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadBirthdays();
    if (!supabase || !isAdmin) return undefined;
    const channel = supabase.channel("admin-birthday-members")
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_members" }, () => void loadBirthdays())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadBirthdays())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAdmin, groupId]);

  useEffect(() => {
    if (!focusMemberId) {
      handledFocusId.current = "";
      return;
    }
    if (focusMemberId === handledFocusId.current || !birthdayMembers.length) return;
    const member = birthdayMembers.find((candidate) => candidate.id === focusMemberId);
    if (!member) return;
    handledFocusId.current = focusMemberId;
    setSelectedMember(member);
    onFocusHandled?.();
  }, [birthdayMembers, focusMemberId, onFocusHandled]);

  if (!isAdmin) {
    return <section className="birthday-management"><div className="birthday-access-denied"><h1>Access restricted</h1><p>Birthday management is available to authorized administrators.</p></div></section>;
  }

  function renderBirthdayRows(rows, emptyMessage) {
    if (!rows.length) return <p className="birthday-empty-copy">{emptyMessage}</p>;
    return <div className="birthday-list">
      {rows.map((member) => (
        <article className={`birthday-row${member.birthday.daysUntil === 0 ? " is-today" : ""}`} key={member.id}>
          <div className="birthday-date-tile"><strong>{new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(member.birthday.date)}</strong><span>{new Intl.DateTimeFormat(undefined, { month: "short" }).format(member.birthday.date)}</span></div>
          <BirthdayIdentity profile={member.profile} />
          <div className="birthday-member-copy">
            <strong>{member.profile?.full_name || "Member"}</strong>
            <span>{member.birthday.daysUntil === 0 ? "Birthday today" : `In ${member.birthday.daysUntil} day${member.birthday.daysUntil === 1 ? "" : "s"}`}{member.birthday.age !== null ? ` · ${formatAgeLabel(member.birthday)}` : ""}</span>
          </div>
          {member.birthday.daysUntil === 0 ? <span className="birthday-today-badge">Today</span> : null}
          <button type="button" className="birthday-view-button" onClick={() => setSelectedMember(member)}>View member</button>
        </article>
      ))}
    </div>;
  }

  return (
    <section className="birthday-management" aria-labelledby="birthday-management-title">
      <header className="birthday-management-header">
        <div className="birthday-management-heading">
          <span className="birthday-heading-icon"><CalendarIcon size={21} /></span>
          <div><p className="birthday-eyebrow">Administration</p><h1 id="birthday-management-title">Birthday management</h1><p>Keep upcoming celebrations visible and send the right reminder at the right time.</p></div>
        </div>
        <button type="button" className="birthday-refresh-button" onClick={() => void loadBirthdays()} disabled={loading}><CalendarIcon size={16} /> Refresh</button>
      </header>

      {!loading && !error ? <div className="birthday-summary-row">
        <article><span>Today</span><strong>{todayBirthdays.length}</strong><small>{todayBirthdays.length === 1 ? "member celebrating" : "members celebrating"}</small></article>
        <article><span>Next 30 days</span><strong>{upcomingBirthdays.length}</strong><small>Upcoming celebrations</small></article>
        <article><span>Records with birthdays</span><strong>{birthdayMembers.length}</strong><small>Current member records</small></article>
      </div> : null}

      {error ? <div className="birthday-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadBirthdays()}>Try again</button></div> : null}
      {loading ? <div className="birthday-loading" aria-label="Loading birthdays"><span /><span /><span /></div> : (
        <div className="birthday-management-grid">
          <section className="birthday-panel birthday-today-panel"><header><div><p className="birthday-panel-eyebrow">Celebrate together</p><h2>Today’s birthdays</h2></div><span className="birthday-panel-count">{todayBirthdays.length}</span></header>{renderBirthdayRows(todayBirthdays, "No member birthdays today.")}</section>
          <section className="birthday-panel"><header><div><p className="birthday-panel-eyebrow">Looking ahead</p><h2>Coming up</h2></div><span className="birthday-panel-count">30 days</span></header>{renderBirthdayRows(upcomingBirthdays, "No birthdays are scheduled in the next 30 days.")}</section>
          <section className="birthday-panel birthday-directory-panel"><header><div><p className="birthday-panel-eyebrow">Member records</p><h2>Birthday directory</h2></div></header>
            <label className="birthday-search"><span>Search members</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></label>
            {renderBirthdayRows(visibleMembers, "No birthday records match your search.")}
          </section>
        </div>
      )}

      {selectedMember ? <div className="birthday-detail-overlay" onClick={(event) => event.target === event.currentTarget && setSelectedMember(null)}>
        <section className="birthday-detail-panel" role="dialog" aria-modal="true" aria-labelledby="birthday-detail-title">
          <button type="button" className="birthday-detail-close" aria-label="Close member details" onClick={() => setSelectedMember(null)}>×</button>
          <BirthdayIdentity profile={selectedMember.profile} detail />
          <p className="birthday-eyebrow">Member profile</p><h2 id="birthday-detail-title">{selectedMember.profile?.full_name || "Member"}</h2>
          <p className="birthday-detail-date">{selectedMember.birthday.displayDate}{selectedMember.birth_year ? `, ${selectedMember.birth_year}` : ""}{selectedMember.birthday.age !== null ? ` · ${selectedMember.birthday.age} years old` : ""}</p>
          <dl>
            {selectedMember.profile?.email ? <div><dt>Email</dt><dd>{selectedMember.profile.email}</dd></div> : null}
            {selectedMember.phone ? <div><dt>Phone</dt><dd>{selectedMember.phone}</dd></div> : null}
            {selectedMember.departments?.length ? <div><dt>Serving</dt><dd>{formatDepartments(selectedMember)}</dd></div> : null}
            {selectedMember.favorite_food ? <div><dt>Favorite food</dt><dd>{selectedMember.favorite_food}</dd></div> : null}
          </dl>
          <button type="button" className="birthday-detail-done" onClick={() => setSelectedMember(null)}>Close profile</button>
        </section>
      </div> : null}
    </section>
  );
}
