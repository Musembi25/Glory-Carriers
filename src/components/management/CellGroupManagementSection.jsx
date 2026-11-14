import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import groupLogo from "../../../logo.png";
import { supabase } from "../../lib/supabase";
import { APP_NAME, CELL_GROUP_NAME } from "../../lib/identity";
import { exportMemberProfilePdf, exportMembersExcel, exportMembersPdf } from "../../lib/cellGroupExport";
import {
  DEPARTMENTS,
  EDITABLE_MEMBERSHIP_STATUSES,
  DISCIPLESHIP_OPTIONS,
  EXPORT_FIELDS,
  MANAGEMENT_TABS,
  emptyMemberForm,
  buildMemberPayload,
  filterMembers,
  formatDate,
  formatDepartments,
  formatMemberBirthday,
  formatJoinedDate,
  formatRelativeTime,
  formsAreEqual,
  getBirthdayOccurrence,
  getDepartmentChips,
  getInitials,
  getMembershipStatusMeta,
  normalizeMembershipStatus,
  memberToForm,
  normalizeDiscipleshipStatus,
  validateMemberForm
} from "../../lib/cellGroupManagement";
import { MemberFormSheet } from "./MemberFormSheet";
import { MemberInitials as SharedMemberIdentity } from "../MemberInitials.jsx";

function Icon({ name, size = 16 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };

  switch (name) {
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...props}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case "download":
      return (
        <svg {...props}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "edit":
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...props}>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      );
    case "camera":
      return (
        <svg {...props}>
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case "more":
      return (
        <svg {...props}>
          <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "eye":
      return (
        <svg {...props}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "save":
      return (
        <svg {...props}>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <path d="M17 21v-8H7v8M7 3v5h8" />
        </svg>
      );
    case "file-sheet":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
        </svg>
      );
    case "file-pdf":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M10 13v4M14 13v4" />
        </svg>
      );
    default:
      return null;
  }
}

function MemberIdentity({ profile, size = "" }) {
  return <SharedMemberIdentity member={profile} className={`cgm-identity fallback ${size}`} />;
}

function ActionMenu({ member, onView, onEdit, onDownload, onRemove, canEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="cgm-action-menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="cgm-btn cgm-btn-ghost cgm-icon-btn" aria-label="Actions" onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </button>
      {open ? (
        <div className="cgm-action-menu">
          <button type="button" onClick={() => { setOpen(false); onView(member); }}><Icon name="eye" size={14} /> View</button>
          {canEdit ? <button type="button" onClick={() => { setOpen(false); onEdit(member); }}><Icon name="edit" size={14} /> Edit</button> : null}
          <button type="button" onClick={() => { setOpen(false); onDownload(member); }}><Icon name="download" size={14} /> Download PDF</button>
          {canEdit ? <button type="button" className="danger" onClick={() => { setOpen(false); onRemove(member); }}><Icon name="trash" size={14} /> Remove from Membership</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="cgm-toast-stack" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`cgm-toast ${t.tone}`}>
          <strong>{t.title}</strong>
          {t.body ? <p>{t.body}</p> : null}
          <button type="button" className="cgm-close-btn" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ReportsExportCenter({ groupName, members, exporting, onExport, isFiltered, memberName, onMemberNameChange }) {
  const active = members.filter((member) => normalizeMembershipStatus(member.membership_status) === "active").length;
  const prospective = members.filter((member) => normalizeMembershipStatus(member.membership_status) === "prospective").length;
  const pending = members.filter((member) => normalizeMembershipStatus(member.membership_status) === "pending").length;
  const inactive = members.filter((member) => normalizeMembershipStatus(member.membership_status) === "inactive").length;

  return (
    <section className="cgm-reports" aria-label="Membership reports and exports">
      <div className="cgm-reports-heading">
        <div className="cgm-reports-brand">
          <img src={groupLogo} alt="Soldout Ministry logo" />
          <div>
            <p>{CELL_GROUP_NAME.toUpperCase()}</p>
            <h4>Membership Reports</h4>
          </div>
        </div>
        <p className="cgm-reports-description">Official membership records and administrative reports.</p>
      </div>
      <label className="cgm-report-member-search">
        <span>Member full name</span>
        <div className="cgm-report-member-search-input">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={memberName}
            onChange={(event) => onMemberNameChange(event.target.value)}
            placeholder="Type a member's full name for an individual report"
            aria-label="Member full name for report"
          />
        </div>
        <small>{memberName.trim() ? `Preparing a report for matching records in ${groupName || "this cell group"}.` : "Leave blank to include all member records."}</small>
      </label>
      <div className="cgm-reports-summary" aria-label="Current report summary">
        <div><span>Records</span><strong>{members.length}</strong></div>
        <div><span>Active</span><strong>{active}</strong></div>
        <div><span>Prospective</span><strong>{prospective}</strong></div>
        <div><span>Pending</span><strong>{pending}</strong></div>
        <div><span>Inactive</span><strong>{inactive}</strong></div>
        {isFiltered ? <span className="cgm-reports-filter-note">Filtered membership report</span> : <span className="cgm-reports-filter-note">All member records</span>}
      </div>
      <div className="cgm-report-card-grid">
        <article className="cgm-report-card">
          <div className="cgm-report-card-icon"><Icon name="file-pdf" size={20} /></div>
          <div className="cgm-report-card-copy">
            <h5>Membership PDF Report</h5>
            <p>Generate a professionally formatted report containing the selected membership records.</p>
          </div>
          <button type="button" className="cgm-btn cgm-btn-report" disabled={!!exporting || !members.length} onClick={() => void onExport("pdf")}>
            <Icon name="download" /> {exporting === "pdf" ? "Preparing Membership Report..." : "Download PDF"}
          </button>
        </article>
        <article className="cgm-report-card">
          <div className="cgm-report-card-icon"><Icon name="file-sheet" size={20} /></div>
          <div className="cgm-report-card-copy">
            <h5>Membership Excel Report</h5>
            <p>Download the complete membership records in a structured Excel workbook.</p>
          </div>
          <button type="button" className="cgm-btn cgm-btn-secondary" disabled={!!exporting || !members.length} onClick={() => void onExport("excel")}>
            <Icon name="download" /> {exporting === "excel" ? "Preparing Excel Report..." : "Download Excel"}
          </button>
        </article>
      </div>
      {members.length === 0 ? <p className="cgm-reports-empty">There are no records in this report selection.</p> : null}
    </section>
  );
}

export function CellGroupManagementSection({
  user,
  isAdmin,
  profiles,
  groupId = "",
  isSuperAdmin = false
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cellGroup, setCellGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [rules, setRules] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [groupAdmins, setGroupAdmins] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [discFilter, setDiscFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [birthdayFilter, setBirthdayFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [memberFormMode, setMemberFormMode] = useState(null);
  const [memberForm, setMemberForm] = useState(emptyMemberForm());
  const [memberFormInitial, setMemberFormInitial] = useState(emptyMemberForm());
  const [memberFormErrors, setMemberFormErrors] = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [memberFeedback, setMemberFeedback] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({ title: "", content: "" });
  const [groupForm, setGroupForm] = useState(null);
  const memberSaveInProgressRef = useRef(false);
  const memberRemovalInProgressRef = useRef(false);
  const memberFeedbackButtonRef = useRef(null);

  const canManage = (isAdmin && Boolean(cellGroup?.id)) || cellGroup?.leader_id === user?.id;
  const canEditGroupSettings = Boolean(cellGroup) && (!cellGroup.management_only || isSuperAdmin);
  const profileMap = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p])),
    [profiles]
  );

  const enrichedMembers = useMemo(() => members.map((member) => {
    const linkedProfile = profileMap.get(member.user_id);
    return {
      ...member,
      profile: {
        ...linkedProfile,
        full_name: member.full_name || linkedProfile?.full_name || "",
        email: member.contact_email || linkedProfile?.email || ""
      },
      membership_status_raw: member.membership_status,
      membership_status: normalizeMembershipStatus(member.membership_status),
      discipleship_status: normalizeDiscipleshipStatus(member.discipleship_status)
    };
  }), [members, profileMap]);

  const currentMembers = useMemo(
    () => enrichedMembers.filter((member) => member.membership_status_raw !== "removed"),
    [enrichedMembers]
  );
  const leaderProfile = profileMap.get(cellGroup?.leader_id);
  const pendingCount = joinRequests.filter((r) => r.status === "pending").length;

  const filteredMembers = useMemo(
    () => {
      const filtered = filterMembers(enrichedMembers, {
        search,
        status: statusFilter,
        department: deptFilter,
        discipleship: discFilter,
        joinedYear: yearFilter,
        sort: sortBy,
        currentOnly: false
      });
      if (birthdayFilter === "all") return filtered;
      return filtered.filter((member) => {
        const birthday = getBirthdayOccurrence(member, new Date(), cellGroup?.timezone || "UTC");
        return birthday && (birthdayFilter === "today" ? birthday.daysUntil === 0 : birthday.daysUntil > 0 && birthday.daysUntil <= 30);
      });
    },
    [enrichedMembers, search, statusFilter, deptFilter, discFilter, yearFilter, birthdayFilter, sortBy, cellGroup?.timezone]
  );

  const stats = useMemo(() => {
    const active = currentMembers.filter((member) => normalizeMembershipStatus(member.membership_status) === "active").length;
    const prospective = currentMembers.filter((member) => normalizeMembershipStatus(member.membership_status) === "prospective").length;
    return { total: currentMembers.length, active, prospective, pending: pendingCount };
  }, [currentMembers, pendingCount]);

  const memberStatusCounts = useMemo(() => ({
    all: currentMembers.length,
    active: currentMembers.filter((member) => member.membership_status === "active").length,
    prospective: currentMembers.filter((member) => member.membership_status === "prospective").length,
    pending: currentMembers.filter((member) => member.membership_status === "pending").length,
    inactive: currentMembers.filter((member) => member.membership_status === "inactive").length
  }), [currentMembers]);

  const joinedYears = useMemo(() => {
    const years = new Set(currentMembers.map((m) => m.joined_year).filter(Boolean));
    return [...years].sort((a, b) => b - a);
  }, [currentMembers]);

  const toast = useCallback((title, body = "", tone = "success") => {
    const id = crypto.randomUUID();
    setToasts((c) => [...c, { id, title, body, tone }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 5000);
  }, []);

  const logActivity = useCallback(
    async (actionType, description, affectedUserId = null, metadata = {}) => {
      if (!cellGroup?.id || !supabase) return;
      try {
        const { error } = await supabase.rpc("log_cell_group_activity", {
          p_group_id: cellGroup.id,
          p_action_type: actionType,
          p_description: description,
          p_affected_user_id: affectedUserId,
          p_metadata: metadata
        });
        if (error) console.error("Cell group activity logging failed", error);
      } catch (error) {
        console.error("Cell group activity logging failed", error);
      }
    },
    [cellGroup?.id]
  );

  const loadData = useCallback(async () => {
    if (!supabase || !groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");

    try {
      const { error: rpcError } = await supabase.rpc("ensure_default_cell_group");
      if (rpcError) {
        throw rpcError;
      }

      const [groupRes, membersRes, requestsRes, rulesRes, activityRes, adminsRes] = await Promise.all([
        supabase.from("cell_groups").select("*").eq("id", groupId).maybeSingle(),
        supabase.from("cell_group_members").select("*").eq("cell_group_id", groupId).order("created_at", { ascending: true }),
        supabase.from("cell_group_join_requests").select("*").eq("cell_group_id", groupId).order("created_at", { ascending: false }),
        supabase.from("cell_group_rules").select("*").eq("cell_group_id", groupId).order("sort_order", { ascending: true }),
        supabase.from("cell_group_activity_log").select("*").eq("cell_group_id", groupId).order("created_at", { ascending: false }).limit(50),
        isSuperAdmin
          ? supabase.from("cell_group_admin_assignments").select("cell_group_id,admin_user_id,assigned_at").eq("cell_group_id", groupId)
          : Promise.resolve({ data: [], error: null })
      ]);

      const firstError =
        groupRes.error ||
        membersRes.error ||
        requestsRes.error ||
        rulesRes.error ||
        activityRes.error ||
        adminsRes.error;

      if (firstError) {
        throw firstError;
      }

      if (groupRes.data) {
        setCellGroup(groupRes.data);
        setGroupForm(groupRes.data);
      }
      setMembers(membersRes.data ?? []);
      setJoinRequests(requestsRes.data ?? []);
      setRules(rulesRes.data ?? []);
      setActivityLog(activityRes.data ?? []);
      setGroupAdmins(adminsRes.data ?? []);
    } catch (err) {
      console.error("Cell group management load failed", err);
      setLoadError(
        "Unable to load this group's management data. Apply the cell-group management and private management-groups migrations, then refresh."
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, isSuperAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (memberFeedback) memberFeedbackButtonRef.current?.focus();
  }, [memberFeedback]);

  useEffect(() => {
    if (!supabase || !cellGroup?.id) return undefined;

    const channel = supabase
      .channel(`cgm-live-${cellGroup.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_members", filter: `cell_group_id=eq.${cellGroup.id}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_join_requests", filter: `cell_group_id=eq.${cellGroup.id}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_rules", filter: `cell_group_id=eq.${cellGroup.id}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_activity_log", filter: `cell_group_id=eq.${cellGroup.id}` }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_groups" }, () => void loadData())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cellGroup?.id, loadData]);

  async function handleSaveMemberForm() {
    if (!isAdmin || memberSaveInProgressRef.current) return;
    const isEdit = memberFormMode === "edit";
    const errors = validateMemberForm(memberForm, { isEdit });
    if (!isEdit && memberForm.mode === "existing" && !memberForm.user_id) {
      errors.user_id = "Select a registered account";
    }
    setMemberFormErrors(errors);
    if (Object.keys(errors).length) return;

    memberSaveInProgressRef.current = true;
    setSubmitting(true);
    try {
      let targetUserId = isEdit ? (editingMember.user_id || memberForm.user_id || null) : null;
      if (!isEdit && memberForm.mode === "invite") {
        const inviteEmail = memberForm.email.trim().toLowerCase();
        const existingProfile = profiles.find((profile) => profile.email?.trim().toLowerCase() === inviteEmail);
        if (existingProfile) {
          targetUserId = existingProfile.id;
        } else {
          const { error: inviteError } = await supabase.from("cell_group_invitations").upsert({
            cell_group_id: cellGroup.id,
            email: inviteEmail,
            full_name: memberForm.full_name.trim(),
            invited_by: user.id,
            membership_data: await buildMemberPayload(memberForm)
          }, { onConflict: "cell_group_id,email" });
          if (inviteError) throw inviteError;
          await logActivity("invitation_sent", `Invitation sent to ${memberForm.full_name.trim()} (${inviteEmail})`);
          toast("Invitation sent", `${memberForm.full_name.trim()} will be added when they register.`);
          requestCloseMemberForm(true);
          return;
        }
      } else if (!isEdit && memberForm.mode === "existing") {
        targetUserId = memberForm.user_id;
      }

      let recordId = isEdit ? editingMember.id : memberForm.record_id || null;
      if (!isEdit && targetUserId) {
        const linkedRecord = members.find((member) => member.user_id === targetUserId);
        if (linkedRecord) {
          toast("Record already exists", "Open this person’s existing record to update their information or membership status.", "error");
          return;
        }
        const accountEmail = profiles.find((profile) => profile.id === targetUserId)?.email?.trim().toLowerCase();
        const matchingProspects = accountEmail
          ? members.filter((member) => !member.user_id && member.contact_email?.trim().toLowerCase() === accountEmail)
          : [];
        if (matchingProspects.length > 1) {
          toast("Account not linked", "Several unlinked records share this email. Resolve the matching record before linking the account.", "error");
          return;
        }
        if (matchingProspects.length === 1) recordId = matchingProspects[0].id;
      }
      const payload = {
        cell_group_id: cellGroup.id,
        user_id: targetUserId || null,
        ...(await buildMemberPayload(memberForm))
      };
      const saveQuery = supabase.from("cell_group_members");
      const { data: savedRow, error: saveError } = recordId
        ? await saveQuery
          .update(payload)
          .eq("id", recordId)
          .eq("cell_group_id", cellGroup.id)
          .select("*")
          .maybeSingle()
        : await saveQuery
          .insert(payload)
          .select("*")
          .single();
      if (saveError) throw saveError;
      if (!savedRow?.id) throw new Error("The database did not confirm the member record save.");

      const name = memberForm.full_name.trim() || "Member";
      const action = isEdit ? "member_updated" : "member_added";
      await logActivity(action, `${name}'s membership information was ${isEdit ? "updated" : "recorded"}.`, targetUserId, { member_record_id: savedRow.id });
      setMembers((previous) => {
        const existingIndex = previous.findIndex((member) => member.id === savedRow.id);
        if (existingIndex < 0) return [...previous, savedRow];
        return previous.map((member) => member.id === savedRow.id ? savedRow : member);
      });
      if (!isEdit) {
        setSearch("");
        setStatusFilter("all");
        setDeptFilter("all");
        setDiscFilter("all");
        setYearFilter("all");
        setBirthdayFilter("all");
        setSortBy("name_asc");
      }
      setActiveTab("membership");
      setMemberFormMode(null);
      setEditingMember(null);
      setMemberFormErrors({});
      setShowDiscardConfirm(false);
      setMemberFeedback({
        type: "success",
        title: isEdit ? "Update Success" : "Member Added Successfully",
        message: isEdit
          ? "Member details have been successfully updated."
          : "The new member has been successfully registered."
      });
    } catch (error) {
      console.error("Member record save failed", {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        error
      });
      let title = isEdit ? "Member update failed" : "Member registration failed";
      let message = error?.message || "Supabase did not confirm the member record save. Please try again.";
      if (error?.code === "42501") {
        title = "Permission denied";
        message = "Your administrator access does not allow changes to this cell group.";
      } else if (error?.code === "23503") {
        title = "Invalid linked account";
        message = "The selected account or cell group is no longer available. Refresh and try again.";
      } else if (error?.code === "23505") {
        title = "Account already linked";
        message = "This account already has a record in the cell group. Open that record to update it.";
      } else if (error?.code === "42703" || error?.code === "PGRST204") {
        title = "Database setup required";
        message = "Supabase is missing a member-record column. In this app’s Supabase project, run member-record-status-enum-migration.sql by itself and commit it, then run pre-membership-records-migration.sql. If both already ran, run NOTIFY pgrst, 'reload schema'. Your entries are still here.";
      }
      setMemberFeedback({ type: "error", title, message });
    } finally {
      memberSaveInProgressRef.current = false;
      setSubmitting(false);
    }
  }

  function openAddForm() {
    if (!isAdmin) return;
    const form = emptyMemberForm();
    setActiveTab("membership");
    setMemberForm(form);
    setMemberFormInitial(JSON.parse(JSON.stringify(form)));
    setMemberFormErrors({});
    setMemberFormMode("add");
    setEditingMember(null);
    setUserSearch("");
  }

  function acknowledgeMemberFeedback() {
    const shouldRefresh = memberFeedback?.type === "success";
    setMemberFeedback(null);
    if (shouldRefresh) {
      setActiveTab("membership");
      void loadData();
    }
  }

  function retryMemberRemoval() {
    setMemberFeedback(null);
    if (confirmRemove) void handleRemoveMember(confirmRemove);
  }

  function openEditForm(member) {
    if (!isAdmin) return;
    const form = memberToForm(member, member.profile);
    setMemberForm(form);
    setMemberFormInitial(JSON.parse(JSON.stringify(form)));
    setMemberFormErrors({});
    setMemberFormMode("edit");
    setEditingMember(member);
    setUserSearch("");
    setViewMember(null);
  }

  function requestCloseMemberForm(force = false) {
    if (!force && memberFormMode && !formsAreEqual(memberForm, memberFormInitial)) {
      setShowDiscardConfirm(true);
      return;
    }
    setMemberFormMode(null);
    setEditingMember(null);
    setMemberFormErrors({});
    setShowDiscardConfirm(false);
  }

  async function handleRemoveMember(member) {
    if (!isAdmin || memberRemovalInProgressRef.current) return;
    memberRemovalInProgressRef.current = true;
    setSubmitting(true);
    const name = member.profile?.full_name || member.full_name || "Member";
    try {
      const { data, error } = await supabase
        .from("cell_group_members")
        .update({ membership_status: "removed" })
        .eq("id", member.id)
        .eq("cell_group_id", cellGroup?.id || groupId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("This membership could not be updated. It may already have been removed, or you may not have permission to manage this group.");
      }

      setMembers((previous) => previous.map((entry) => entry.id === member.id
        ? { ...entry, membership_status: "removed" }
        : entry));
      await logActivity("member_removed", `${name} was removed from the cell group.`, member.user_id);
      setConfirmRemove(null);
      setViewMember(null);
      setMemberFeedback({
        type: "success",
        title: "Member Removed Successfully",
        message: `${name} has been successfully removed from the membership.`
      });
    } catch (err) {
      console.error(err);
      setMemberFeedback({
        type: "error",
        title: "Member Could Not Be Removed",
        message: err?.message || "The membership could not be removed. Please try again."
      });
    } finally {
      memberRemovalInProgressRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleJoinRequest(request, approve) {
    setSubmitting(true);
    try {
      const requester = profileMap.get(request.user_id);
      const name = requester?.full_name || "Member";

      if (approve) {
        const { error: memberError } = await supabase.from("cell_group_members").upsert(
          {
            cell_group_id: cellGroup.id,
            user_id: request.user_id,
            membership_status: "new",
            joined_month: new Date().getMonth() + 1,
            joined_year: new Date().getFullYear()
          },
          { onConflict: "cell_group_id,user_id" }
        );
        if (memberError) throw memberError;
        await logActivity("join_request_approved", `${name}'s join request was approved.`, request.user_id);
        toast("Request approved", `${name} has been added to the cell group.`);
      } else {
        await logActivity("join_request_declined", `${name}'s join request was declined.`, request.user_id);
        toast("Request declined", `${name}'s request was declined.`);
      }

      await supabase
        .from("cell_group_join_requests")
        .update({
          status: approve ? "approved" : "declined",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", request.id);

      void loadData();
    } catch (err) {
      console.error(err);
      toast("Action failed", "Could not process the request. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveRule(e) {
    e.preventDefault();
    if (!ruleForm.title.trim()) return;
    setSubmitting(true);
    try {
      if (editingRule?.id) {
        await supabase
          .from("cell_group_rules")
          .update({ title: ruleForm.title.trim(), content: ruleForm.content.trim() })
          .eq("id", editingRule.id);
        await logActivity("rule_updated", `Rule "${ruleForm.title.trim()}" was updated.`);
      } else {
        await supabase.from("cell_group_rules").insert({
          cell_group_id: cellGroup.id,
          title: ruleForm.title.trim(),
          content: ruleForm.content.trim(),
          sort_order: rules.length
        });
        await logActivity("rule_added", `Rule "${ruleForm.title.trim()}" was added.`);
      }
      setEditingRule(null);
      setRuleForm({ title: "", content: "" });
      void loadData();
      toast("Rule saved");
    } catch (err) {
      console.error(err);
      toast("Save failed", "Could not save the rule.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRule(rule) {
    setSubmitting(true);
    try {
      await supabase.from("cell_group_rules").delete().eq("id", rule.id);
      await logActivity("rule_deleted", `Rule "${rule.title}" was deleted.`);
      void loadData();
      toast("Rule deleted");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("cell_groups")
        .update({
          description: groupForm.description?.trim() || "",
          allow_join_requests: groupForm.allow_join_requests,
          allow_member_invitations: groupForm.allow_member_invitations,
          require_leader_approval: groupForm.require_leader_approval,
          visibility: groupForm.visibility,
          timezone: groupForm.timezone,
          default_language: groupForm.default_language
        })
        .eq("id", cellGroup.id);
      if (error) throw error;
      await logActivity("settings_changed", "Group settings were updated.");
      toast("Settings saved", "Group settings have been updated.");
      void loadData();
    } catch (err) {
      console.error(err);
      toast("Save failed", "Could not save settings.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function assignAdminToGroup(event) {
    event.preventDefault();
    if (!isSuperAdmin || !selectedAdminId || !cellGroup?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("cell_group_admin_assignments").insert({
        cell_group_id: cellGroup.id,
        admin_user_id: selectedAdminId,
        assigned_by: user.id
      });
      if (error) throw error;
      setSelectedAdminId("");
      toast("Administrator assigned", "This Admin can now access the selected group.");
      void loadData();
    } catch (error) {
      toast("Assignment failed", error.message || "The administrator could not be assigned.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeGroupAdmin(adminUserId) {
    if (!isSuperAdmin || !cellGroup?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("cell_group_admin_assignments").delete()
        .eq("cell_group_id", cellGroup.id).eq("admin_user_id", adminUserId);
      if (error) throw error;
      toast("Administrator access removed");
      void loadData();
    } catch (error) {
      toast("Could not update access", error.message || "Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport(format) {
    if (exporting) return;
    setExporting(format);
    const isFiltered = Boolean(search.trim() || statusFilter !== "all" || deptFilter !== "all" || discFilter !== "all" || yearFilter !== "all" || birthdayFilter !== "all" || sortBy !== "name_asc");
    try {
      const pageSize = 1000;
      const allMembers = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("cell_group_members")
          .select("*")
          .eq("cell_group_id", cellGroup.id)
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allMembers.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }

      const completeMemberList = allMembers.map((member) => {
        const linkedProfile = profileMap.get(member.user_id);
        return {
          ...member,
          profile: {
            ...linkedProfile,
            full_name: member.full_name || linkedProfile?.full_name || "",
            email: member.contact_email || linkedProfile?.email || ""
          },
          membership_status_raw: member.membership_status,
          membership_status: normalizeMembershipStatus(member.membership_status),
          discipleship_status: normalizeDiscipleshipStatus(member.discipleship_status)
        };
      });
      const exportFilters = {
        search,
        status: statusFilter,
        department: deptFilter,
        discipleship: discFilter,
        joinedYear: yearFilter,
        sort: sortBy,
        currentOnly: false
      };
      let exportMembers = filterMembers(completeMemberList, exportFilters);
      if (birthdayFilter !== "all") {
        exportMembers = exportMembers.filter((member) => {
          const birthday = getBirthdayOccurrence(member, new Date(), cellGroup?.timezone || "UTC");
          return birthday && (birthdayFilter === "today" ? birthday.daysUntil === 0 : birthday.daysUntil > 0 && birthday.daysUntil <= 30);
        });
      }

      const fields = EXPORT_FIELDS.filter((f) => f.default).map((f) => f.key);
      const exportData = {
        members: exportMembers,
        fields,
        groupName: cellGroup?.name,
        filters: { search: search.trim(), status: statusFilter, department: deptFilter, discipleship: discFilter, joinedYear: yearFilter, birthday: birthdayFilter, sort: sortBy }
      };
      if (format === "excel") {
        await exportMembersExcel(exportData);
      } else {
        await exportMembersPdf(exportData);
      }
      toast(
        format === "excel" ? "Membership Excel report downloaded successfully." : "Membership PDF downloaded successfully.",
        `${exportMembers.length} member${exportMembers.length === 1 ? "" : "s"} included${isFiltered ? " using the current filters" : ""}.`
      );
    } catch (err) {
      console.error(`${format} member export failed`, err);
      toast(
        format === "excel" ? "Unable to generate the Excel report." : "Unable to generate the membership PDF.",
        err?.message || "Please try again.",
        "error"
      );
    } finally {
      setExporting(null);
    }
  }

  async function handleMemberPdf(member) {
    if (exporting) return;
    setExporting(`member-${member.id}`);
    try {
      await exportMemberProfilePdf({ member, groupName: cellGroup?.name || CELL_GROUP_NAME });
      toast("Member profile PDF downloaded successfully.", "The individual member profile has been saved to your downloads.");
    } catch (err) {
      console.error("Member profile PDF generation failed", err);
      toast("Unable to generate the member profile PDF.", "Please try again.", "error");
    } finally {
      setExporting(null);
    }
  }

  const searchableProfiles = useMemo(() => {
    const currentMemberIds = new Set(currentMembers.map((m) => m.user_id));
    const q = userSearch.trim().toLowerCase();
    return (profiles ?? [])
      .filter((p) => p.is_active && !currentMemberIds.has(p.id))
      .filter(
        (p) =>
          !q ||
          p.full_name?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [profiles, currentMembers, userSearch]);

  if (loading) {
    return <div className="cgm-root cgm-loading">Loading cell group management...</div>;
  }

  if (loadError) {
    return (
      <div className="cgm-root cgm-access-denied">
        <Icon name="shield" size={40} />
        <h3>Setup required</h3>
        <p>{loadError}</p>
        <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => void loadData()}>
          <Icon name="refresh" /> Try again
        </button>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="cgm-root cgm-access-denied">
        <Icon name="shield" size={40} />
        <h3>Leader access required</h3>
        <p>Cell Group Management is available only to the designated cell group leader.</p>
      </div>
    );
  }

  return (
    <div className="cgm-root">
      <section className="cgm-hero">
        <div className="cgm-hero-glow" aria-hidden="true" />
        <div className="cgm-hero-inner">
          <div className="cgm-hero-copy">
            <p className="cgm-hero-eyebrow">{isAdmin ? `${APP_NAME} Administration` : `${CELL_GROUP_NAME} Leadership`}</p>
            <h1>{isAdmin ? "Admin Control Center" : cellGroup?.name || "Cell Group Management"}</h1>
            <p className="cgm-hero-desc">
              {isAdmin
                ? "Manage your community, review requests, and reach the app's existing administration tools from one secure workspace."
                : "Manage membership, requests, rules, and settings from one workspace."}
            </p>
            {leaderProfile ? (
              <span className="cgm-leader-badge">
                <Icon name="shield" size={14} />
                Leader: {leaderProfile.full_name || leaderProfile.email}
              </span>
            ) : null}
          </div>
          <div className="cgm-hero-actions">
            {activeTab === "membership" ? (
              <div className="cgm-search-wrap cgm-search-wrap--hero">
                <Icon name="search" />
                <input
                  type="search"
                  placeholder="Search members by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search members"
                />
              </div>
            ) : null}
            <button type="button" className="cgm-btn cgm-btn-ghost-light" onClick={() => void loadData()} disabled={loading}>
              <Icon name="refresh" /> Refresh
            </button>
            {activeTab === "membership" ? (
              <>
                <button
                  type="button"
                  className="cgm-btn cgm-btn-download"
                  disabled={!!exporting || !filteredMembers.length}
                  onClick={() => void handleExport("excel")}
                >
                  <Icon name="file-sheet" />
                  {exporting === "excel" ? "Downloading..." : "Download Excel"}
                </button>
                <button
                  type="button"
                  className="cgm-btn cgm-btn-download"
                  disabled={!!exporting || !filteredMembers.length}
                  onClick={() => void handleExport("pdf")}
                >
                  <Icon name="file-pdf" />
                  {exporting === "pdf" ? "Downloading..." : "Download PDF"}
                </button>
                {isAdmin ? <button type="button" className="cgm-btn cgm-btn-primary" onClick={openAddForm}>
                  <Icon name="plus" /> Add Member
                </button> : null}
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="cgm-shell">
      <div className="cgm-admin-workspace">
      <nav className="cgm-tabs cgm-admin-nav" aria-label="Management sections">
        <p className="cgm-admin-nav-heading">Workspace</p>
        {MANAGEMENT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`cgm-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === "requests" && pendingCount > 0 ? (
              <span className="cgm-tab-badge">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="cgm-admin-content">
      <div className="cgm-admin-content-heading">
        <p>{isAdmin ? "ADMIN WORKSPACE" : "GROUP WORKSPACE"}</p>
        <h2>{MANAGEMENT_TABS.find((tab) => tab.id === activeTab)?.label || "Overview"}</h2>
      </div>
      {activeTab === "overview" ? (
        <>
          <div className="cgm-stats-grid">
            <div className="cgm-stat-card accent">
              <span>All Records</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="cgm-stat-card">
              <span>Active</span>
              <strong>{stats.active}</strong>
            </div>
            <div className="cgm-stat-card accent">
              <span>Prospective</span>
              <strong>{stats.prospective}</strong>
            </div>
            <div className="cgm-stat-card">
              <span>Pending Requests</span>
              <strong>{stats.pending}</strong>
            </div>
          </div>
          <div className="cgm-panel">
            <div className="cgm-panel-header">
              <div>
                <h3>Quick Actions</h3>
                <p>Jump to common management tasks or related pages.</p>
              </div>
            </div>
            <div className="cgm-panel-body">
              <div className="cgm-quick-links">
                {isAdmin ? <button type="button" className="cgm-btn cgm-btn-primary" onClick={() => { setActiveTab("membership"); openAddForm(); }}>
                  <Icon name="plus" /> Add Member
                </button> : null}
                <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setActiveTab("membership")}>
                  <Icon name="users" /> View Membership
                </button>
                {pendingCount > 0 ? (
                  <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setActiveTab("requests")}>
                    Review Requests ({pendingCount})
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === "membership" ? (
        <div className="cgm-panel">
          <div className="cgm-panel-header">
            <div>
              <h3>Membership Management</h3>
              <p>
                {filteredMembers.length} member{filteredMembers.length === 1 ? "" : "s"} shown
                {filteredMembers.length !== currentMembers.length ? ` · ${currentMembers.length} total` : ""}
              </p>
            </div>
            <div className="cgm-panel-header-actions">
              {isAdmin ? <button type="button" className="cgm-btn cgm-btn-primary" onClick={openAddForm}>
                <Icon name="plus" /> Add Member
              </button> : null}
            </div>
          </div>
          <div className="cgm-record-status-tabs" role="tablist" aria-label="Filter member records by membership status">
            {[
              { id: "all", label: "All Records" },
              { id: "active", label: "Active Members" },
              { id: "prospective", label: "Prospective" },
              { id: "pending", label: "Pending" },
              { id: "inactive", label: "Inactive" }
            ].map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={statusFilter === item.id}
                className={`cgm-record-status-tab${statusFilter === item.id ? " active" : ""}`}
                onClick={() => setStatusFilter(item.id)}>
                <span>{item.label}</span><strong>{memberStatusCounts[item.id]}</strong>
              </button>
            ))}
          </div>
          <div className="cgm-panel-toolbar">
            <div className="cgm-toolbar-filters">
              <label className="cgm-filter-field">
                <span>Status</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                  <option value="all">All statuses</option>
                  {EDITABLE_MEMBERSHIP_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="cgm-filter-field">
                <span>Department</span>
                <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} aria-label="Filter by department">
                  <option value="all">All departments</option>
                  {DEPARTMENTS.filter((d) => d !== "Other").map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="cgm-filter-field">
                <span>Discipleship</span>
                <select value={discFilter} onChange={(e) => setDiscFilter(e.target.value)} aria-label="Filter by discipleship">
                  <option value="all">All</option>
                  {DISCIPLESHIP_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="cgm-filter-field">
                <span>Joined year</span>
                <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} aria-label="Filter by joined year">
                  <option value="all">All years</option>
                  {joinedYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label className="cgm-filter-field">
                <span>Birthday</span>
                <select value={birthdayFilter} onChange={(e) => setBirthdayFilter(e.target.value)} aria-label="Filter members by birthday">
                  <option value="all">All birthdays</option>
                  <option value="today">Today</option>
                  <option value="upcoming">Next 30 days</option>
                </select>
              </label>
              <label className="cgm-filter-field">
                <span>Sort by</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort members">
                  <option value="name_asc">Name A–Z</option>
                  <option value="name_desc">Name Z–A</option>
                  <option value="joined_newest">Joined (newest)</option>
                  <option value="joined_oldest">Joined (oldest)</option>
                  <option value="status">Status</option>
                </select>
              </label>
            </div>
          </div>
          <ReportsExportCenter
            groupName={cellGroup?.name}
            members={filteredMembers}
            exporting={exporting}
            onExport={handleExport}
            isFiltered={Boolean(search.trim() || statusFilter !== "all" || deptFilter !== "all" || discFilter !== "all" || yearFilter !== "all" || birthdayFilter !== "all" || sortBy !== "name_asc")}
            memberName={search}
            onMemberNameChange={setSearch}
          />
          <div className="cgm-panel-body">
            {filteredMembers.length ? (
              <>
                <div className="cgm-table-wrap">
                  <table className="cgm-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Department</th>
                        <th>Joined</th>
                        <th>Discipleship</th>
                        <th>Status</th>
                        <th className="cgm-th-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => {
                        const statusMeta = getMembershipStatusMeta(m.membership_status);
                        const deptChips = getDepartmentChips(m);
                        const discYes = normalizeDiscipleshipStatus(m.discipleship_status) === "yes";
                        return (
                          <tr key={m.id}>
                            <td onClick={() => setViewMember(m)} className="cgm-clickable">
                              <div className="cgm-member-cell">
                                <MemberIdentity profile={m.profile} />
                                <div>
                                  <div className="cgm-member-name">{m.profile?.full_name || "Unnamed"}</div>
                                  <div className="cgm-member-email">{m.profile?.email}</div>
                                </div>
                              </div>
                            </td>
                            <td onClick={() => setViewMember(m)} className="cgm-clickable">
                              <div className="cgm-dept-chips">
                                {deptChips.length ? deptChips.map((d) => (
                                  <span key={d} className="cgm-dept-chip-inline">{d}</span>
                                )) : <span className="cgm-muted">None</span>}
                              </div>
                            </td>
                            <td onClick={() => setViewMember(m)} className="cgm-clickable">{formatJoinedDate(m)}</td>
                            <td onClick={() => setViewMember(m)} className="cgm-clickable">
                              <span className={`cgm-disc-badge${discYes ? " yes" : ""}`}>
                                {discYes ? <><Icon name="check" size={12} /> Yes</> : "No"}
                              </span>
                            </td>
                            <td onClick={() => setViewMember(m)} className="cgm-clickable">
                              <span className={statusMeta.pillClass}>{statusMeta.label}</span>
                            </td>
                            <td>
                              <ActionMenu
                                member={m}
                                onView={setViewMember}
                                onEdit={openEditForm}
                                onDownload={(member) => void handleMemberPdf(member)}
                                onRemove={setConfirmRemove}
                                canEdit={isAdmin}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="cgm-member-cards">
                  {filteredMembers.map((m) => {
                    const statusMeta = getMembershipStatusMeta(m.membership_status);
                    const discYes = normalizeDiscipleshipStatus(m.discipleship_status) === "yes";
                    return (
                      <article key={m.id} className="cgm-member-card">
                        <div className="cgm-member-card-top">
                          <div className="cgm-member-cell">
                            <MemberIdentity profile={m.profile} />
                            <div>
                              <div className="cgm-member-name">{m.profile?.full_name || "Unnamed"}</div>
                              <div className="cgm-member-email">{m.profile?.email}</div>
                            </div>
                          </div>
                          <span className={statusMeta.pillClass}>{statusMeta.label}</span>
                        </div>
                        <div className="cgm-member-card-body">
                          <div className="cgm-member-card-row">
                            <span>Department</span>
                            <span>{formatDepartments(m)}</span>
                          </div>
                          <div className="cgm-member-card-row">
                            <span>Joined</span>
                            <span>{formatJoinedDate(m)}</span>
                          </div>
                          <div className="cgm-member-card-row">
                            <span>Discipleship</span>
                            <span className={`cgm-disc-badge${discYes ? " yes" : ""}`}>
                              {discYes ? "Completed" : "No"}
                            </span>
                          </div>
                        </div>
                        <div className="cgm-member-card-actions">
                          <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setViewMember(m)}>
                            <Icon name="eye" size={14} /> View
                          </button>
                          {isAdmin ? <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => openEditForm(m)}>
                            <Icon name="edit" size={14} /> Edit
                          </button> : null}
                          <button type="button" className="cgm-btn cgm-btn-download" disabled={!!exporting} onClick={() => void handleMemberPdf(m)}>
                            <Icon name="download" size={14} /> PDF
                          </button>
                          {isAdmin ? <button type="button" className="cgm-btn cgm-btn-ghost cgm-btn-danger" onClick={() => setConfirmRemove(m)}>
                            <Icon name="trash" size={14} /> Remove from Membership
                          </button> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="cgm-empty">
                <Icon name="users" size={40} />
                <h4>Your Cell Group Has No Members Yet</h4>
                <p>Add members to begin building your cell group.</p>
                {isAdmin ? <button type="button" className="cgm-btn cgm-btn-primary" onClick={openAddForm}>
                  <Icon name="plus" /> Add Member
                </button> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "requests" ? (
        <div className="cgm-panel">
          <div className="cgm-panel-header">
            <div>
              <h3>Join Requests</h3>
              <p>Review and approve or decline incoming membership requests.</p>
            </div>
          </div>
          <div className="cgm-panel-body">
            {joinRequests.filter((r) => r.status === "pending").length ? (
              joinRequests
                .filter((r) => r.status === "pending")
                .map((req) => {
                  const requester = profileMap.get(req.user_id);
                  return (
                    <div key={req.id} className="cgm-request-card">
                      <div className="cgm-member-cell">
                        <MemberIdentity profile={requester} />
                        <div>
                          <div className="cgm-member-name">{requester?.full_name || "Unknown"}</div>
                          <div className="cgm-member-email">{requester?.email}</div>
                          <div className="cgm-member-email">Requested {formatRelativeTime(req.created_at)}</div>
                        </div>
                      </div>
                      <div className="cgm-request-actions">
                        <button type="button" className="cgm-btn cgm-btn-primary" disabled={submitting} onClick={() => void handleJoinRequest(req, true)}>Approve</button>
                        <button type="button" className="cgm-btn cgm-btn-secondary" disabled={submitting} onClick={() => void handleJoinRequest(req, false)}>Decline</button>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="cgm-empty">
                <h4>No join requests</h4>
                <p>When someone requests to join, their request will appear here.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "rules" ? (
        <div className="cgm-panel">
          <div className="cgm-panel-header">
            <div>
              <h3>Group Rules</h3>
              <p>Set expectations for meetings, communication, and participation.</p>
            </div>
            <button type="button" className="cgm-btn cgm-btn-primary" onClick={() => { setEditingRule({}); setRuleForm({ title: "", content: "" }); }}>
              <Icon name="plus" /> Add Rule
            </button>
          </div>
          <div className="cgm-panel-body">
            {rules.length ? (
              rules.map((rule) => (
                <div key={rule.id} className="cgm-rule-item">
                  <div className="cgm-rule-content">
                    <strong>{rule.title}</strong>
                    <p>{rule.content || "No details provided."}</p>
                  </div>
                  <div className="cgm-rule-actions">
                    <button type="button" className="cgm-btn cgm-btn-ghost" onClick={() => { setEditingRule(rule); setRuleForm({ title: rule.title, content: rule.content }); }}>
                      <Icon name="edit" />
                    </button>
                    <button type="button" className="cgm-btn cgm-btn-ghost cgm-btn-danger" onClick={() => void handleDeleteRule(rule)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="cgm-empty">
                <h4>No rules yet</h4>
                <p>Add guidelines to help members understand group expectations.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "settings" && groupForm ? (
        <div className="cgm-panel cgm-panel--settings">
          <div className="cgm-panel-header">
            <div>
              <h3>Group Settings</h3>
              <p>Configure membership, visibility, and group preferences.</p>
            </div>
          </div>
          <form className="cgm-settings-form" onSubmit={(e) => void handleSaveSettings(e)}>
            <div className="cgm-panel-body cgm-panel-body--padded">
            <div className="cgm-form-section">
              <h4>General</h4>
              <label className="cgm-field">
                <span>Cell Group Name</span>
                <input type="text" value={CELL_GROUP_NAME} readOnly aria-label="Cell group name" />
              </label>
              <label className="cgm-field">
                <span>Description</span>
                <textarea rows={3} value={groupForm.description || ""} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
              </label>
            </div>
            <div className="cgm-form-section">
              <h4>Membership</h4>
              {[
                { key: "allow_join_requests", label: "Allow join requests", desc: "Let people request to join the group." },
                { key: "allow_member_invitations", label: "Allow member invitations", desc: "Leader can invite people by email." },
                { key: "require_leader_approval", label: "Require leader approval", desc: "New members must be approved by the leader." }
              ].map((s) => (
                <div key={s.key} className="cgm-setting-row">
                  <div>
                    <label htmlFor={s.key}>{s.label}</label>
                    <p>{s.desc}</p>
                  </div>
                  <label className="cgm-toggle">
                    <input
                      id={s.key}
                      type="checkbox"
                      checked={groupForm[s.key]}
                      onChange={(e) => setGroupForm({ ...groupForm, [s.key]: e.target.checked })}
                    />
                    <span className="cgm-toggle-slider" />
                  </label>
                </div>
              ))}
            </div>
            <div className="cgm-form-section">
              <h4>Preferences</h4>
              <div className="cgm-form-grid">
                <label className="cgm-field">
                  <span>Visibility</span>
                  <select value={groupForm.visibility} onChange={(e) => setGroupForm({ ...groupForm, visibility: e.target.value })}>
                    <option value="members_only">Members only</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>
                <label className="cgm-field">
                  <span>Timezone</span>
                  <input type="text" value={groupForm.timezone} onChange={(e) => setGroupForm({ ...groupForm, timezone: e.target.value })} placeholder="e.g. Africa/Nairobi" />
                </label>
                <label className="cgm-field">
                  <span>Default Language</span>
                  <input type="text" value={groupForm.default_language} onChange={(e) => setGroupForm({ ...groupForm, default_language: e.target.value })} placeholder="e.g. en" />
                </label>
              </div>
            </div>
            {isSuperAdmin ? <div className="cgm-form-section">
              <h4>Administrator access</h4>
              <p>Assign an existing Admin account to this group. Role assignment itself remains controlled by the Super Admin role system.</p>
              <div className="cgm-form-grid">
                <label className="cgm-field">
                  <span>Admin account</span>
                  <select value={selectedAdminId} onChange={(event) => setSelectedAdminId(event.target.value)}>
                    <option value="">Choose an Admin</option>
                    {(profiles || []).filter((profile) => profile.role === "admin" && !groupAdmins.some((assignment) => assignment.admin_user_id === profile.id)).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email}</option>)}
                  </select>
                </label>
                <div className="cgm-field"><span>&nbsp;</span><button type="button" className="cgm-btn cgm-btn-primary" disabled={!selectedAdminId || submitting} onClick={(event) => void assignAdminToGroup(event)}>Assign access</button></div>
              </div>
              <div className="cgm-list">
                {groupAdmins.length ? groupAdmins.map((assignment) => {
                  const assignedProfile = profileMap.get(assignment.admin_user_id);
                  return <div className="cgm-list-row" key={assignment.admin_user_id}>
                    <span>{assignedProfile?.full_name || assignedProfile?.email || "Admin account"}</span>
                    <button type="button" className="cgm-btn cgm-btn-ghost cgm-btn-danger" disabled={submitting} onClick={() => void revokeGroupAdmin(assignment.admin_user_id)}>Remove access</button>
                  </div>;
                }) : <p>No additional Admin accounts are assigned to this group.</p>}
              </div>
            </div> : null}
            </div>
            <div className="cgm-sticky-save">
              <p>Changes are saved to your cell group immediately.</p>
              <button type="submit" className="cgm-btn cgm-btn-primary cgm-btn-save" disabled={submitting || !canEditGroupSettings}>
                <Icon name="save" />
                {submitting ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div className="cgm-panel">
          <div className="cgm-panel-header">
            <div>
              <h3>Administrative Activity</h3>
              <p>Recent management actions performed on this cell group.</p>
            </div>
          </div>
          <div className="cgm-panel-body">
            {activityLog.length ? (
              activityLog.map((entry) => {
                const actor = profileMap.get(entry.performed_by);
                return (
                  <div key={entry.id} className="cgm-activity-item">
                    <div className="cgm-activity-dot" />
                    <div className="cgm-activity-body">
                      <strong>{entry.action_type.replace(/_/g, " ")}</strong>
                      <p>{entry.description}</p>
                      <div className="cgm-activity-time">
                        {actor?.full_name ? `By ${actor.full_name} · ` : ""}
                        {formatRelativeTime(entry.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="cgm-empty">
                <h4>No activity yet</h4>
                <p>Management actions will be recorded here.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {memberFormMode ? (
        <MemberFormSheet
          title={memberFormMode === "edit" ? "Edit Member" : "Add Member"}
          mode={memberFormMode}
          form={memberForm}
          setForm={setMemberForm}
          errors={memberFormErrors}
          submitting={submitting}
          onSubmit={() => void handleSaveMemberForm()}
          onCancel={requestCloseMemberForm}
          userSearch={userSearch}
          setUserSearch={setUserSearch}
          searchableProfiles={searchableProfiles}
          onSelectProfile={(p) => {
            setMemberForm({
              ...memberForm,
              user_id: p.id,
              full_name: p.full_name || "",
              email: p.email || ""
            });
            setUserSearch(p.full_name || p.email);
          }}
          submitLabel={memberFormMode === "edit" ? "Save Changes" : "Add Member"}
        />
      ) : null}

      {viewMember ? (
        <MemberViewDrawer
          member={viewMember}
          onClose={() => setViewMember(null)}
          onEdit={() => openEditForm(viewMember)}
          onDownload={() => void handleMemberPdf(viewMember)}
          downloading={exporting === `member-${viewMember.id}`}
          onRemove={() => setConfirmRemove(viewMember)}
          canEdit={isAdmin}
        />
      ) : null}

      {showDiscardConfirm ? (
        <div className="cgm-overlay cgm-confirm-overlay" onClick={(e) => e.target === e.currentTarget && setShowDiscardConfirm(false)}>
          <div className="cgm-modal" role="alertdialog">
            <div className="cgm-modal-header">
              <h3>Discard unsaved changes?</h3>
            </div>
            <div className="cgm-modal-body">
              <p className="cgm-confirm-text">You have unsaved changes that will be lost if you close this form.</p>
              <div className="cgm-form-actions">
                <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setShowDiscardConfirm(false)}>
                  Continue Editing
                </button>
                <button type="button" className="cgm-btn cgm-btn-primary" onClick={() => requestCloseMemberForm(true)}>
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Rule edit modal */}
      {editingRule !== null ? (
        <div className="cgm-overlay" onClick={(e) => e.target === e.currentTarget && setEditingRule(null)}>
          <div className="cgm-modal" role="dialog">
            <div className="cgm-modal-header">
              <h3>{editingRule.id ? "Edit Rule" : "Add Rule"}</h3>
              <button type="button" className="cgm-close-btn" onClick={() => setEditingRule(null)}><Icon name="x" /></button>
            </div>
            <form className="cgm-modal-body" onSubmit={(e) => void handleSaveRule(e)}>
              <label className="cgm-field">
                <span>Title</span>
                <input type="text" value={ruleForm.title} onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })} required />
              </label>
              <label className="cgm-field">
                <span>Content</span>
                <textarea rows={4} value={ruleForm.content} onChange={(e) => setRuleForm({ ...ruleForm, content: e.target.value })} />
              </label>
              <div className="cgm-form-actions">
                <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setEditingRule(null)}>Cancel</button>
                <button type="submit" className="cgm-btn cgm-btn-primary cgm-btn-save" disabled={submitting}>
                  <Icon name="save" size={14} />
                  {submitting ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Remove confirmation */}
      {confirmRemove ? (
        <div className="cgm-overlay cgm-member-remove-confirm-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRemove(null)}>
          <div className="cgm-modal" role="alertdialog" aria-modal="true">
            <div className="cgm-modal-header">
              <h3>Remove Member?</h3>
            </div>
            <div className="cgm-modal-body">
              <div className="cgm-remove-warning-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2.1h16a1.4 1.4 0 0 0 1.2-2.1L12 3Z" />
                  <path d="M12 9v5M12 17.5h.01" />
                </svg>
              </div>
              <p className="cgm-confirm-text">
                Are you sure you want to remove {confirmRemove.profile?.full_name || profileMap.get(confirmRemove.user_id)?.full_name || confirmRemove.full_name || "this member"} from this membership? Their account and historical information will remain in the system.
              </p>
              <div className="cgm-form-actions">
                <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
                <button type="button" className="cgm-btn cgm-btn-primary cgm-btn-danger" disabled={submitting} onClick={() => void handleRemoveMember(confirmRemove)}>
                  {submitting ? "Removing..." : "Remove Member"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {memberFeedback ? (
        <div className={`cgm-overlay cgm-member-feedback-overlay${memberFeedback.type === "success" ? " is-success" : " is-error"}`}>
          <section
            className="cgm-member-feedback"
            role={memberFeedback.type === "success" ? "dialog" : "alertdialog"}
            aria-modal="true"
            aria-labelledby="cgm-member-feedback-title"
            aria-describedby="cgm-member-feedback-message"
          >
            <div className="cgm-member-feedback-brand">
              <img src={groupLogo} alt="" />
              <span>{APP_NAME}</span>
            </div>
            <div className="cgm-member-feedback-icon" aria-hidden="true">
              {memberFeedback.type === "success" ? (
                <svg viewBox="0 0 56 56" fill="none">
                  <circle className="cgm-success-ring" cx="28" cy="28" r="25" />
                  <path className="cgm-success-check" d="m16 28 8 8 16-17" />
                </svg>
              ) : (
                <svg viewBox="0 0 56 56" fill="none">
                  <circle cx="28" cy="28" r="25" />
                  <path d="M28 16v14M28 38h.01" />
                </svg>
              )}
            </div>
            <h2 id="cgm-member-feedback-title">{memberFeedback.title}</h2>
            <p id="cgm-member-feedback-message">{memberFeedback.message}</p>
            <button
              ref={memberFeedbackButtonRef}
              type="button"
              className="cgm-btn cgm-member-feedback-ok"
              onClick={acknowledgeMemberFeedback}
            >
              OK
            </button>
            {memberFeedback.type === "error" && confirmRemove ? (
              <button type="button" className="cgm-btn cgm-btn-secondary" onClick={retryMemberRemoval}>
                Retry
              </button>
            ) : null}
          </section>
        </div>
      ) : null}

      </div>
      </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />
    </div>
  );
}

function MemberViewDrawer({ member, onClose, onEdit, onDownload, downloading, onRemove, canEdit }) {
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
    };
  }, []);

  const statusMeta = getMembershipStatusMeta(member.membership_status);
  const discYes = normalizeDiscipleshipStatus(member.discipleship_status) === "yes";
  const listedDepartments = (member.departments || []).filter((department) => department !== "Other" && department !== "None");
  const departmentValue = listedDepartments.join(", ") || ((member.departments || []).includes("Other") ? "Other" : "No department assigned");
  const profileDate = (value) => new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
  const birthday = formatMemberBirthday(member);

  return (
    <div className="cgm-overlay cgm-drawer-overlay cgm-profile-workspace" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cgm-drawer cgm-view-drawer" role="dialog" aria-label="Member details" aria-modal="true">
        <div className="cgm-drawer-header cgm-profile-drawer-header">
          <div className="cgm-profile-brand"><img src={groupLogo} alt="Soldout Ministry logo" /> <span>{CELL_GROUP_NAME.toUpperCase()}</span></div>
          <button type="button" className="cgm-close-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="cgm-drawer-body">
          <section className="cgm-profile-hero">
            <div className="cgm-profile-initials" aria-hidden="true">
              <MemberIdentity profile={member.profile} size="profile" />
            </div>
            <div><p>{member.user_id ? "Application account linked" : "No application account"}</p><h2>{member.profile?.full_name || "Unnamed"}</h2><span className={statusMeta.pillClass}>{statusMeta.label}</span></div>
          </section>
          <ProfileSection title="Personal information">
            <ProfileCard label="Full Name" value={member.profile?.full_name || ""} />
            <ProfileCard label="Application Account" value={member.user_id ? "Linked" : "Not linked"} />
            {member.profile?.email ? <ProfileCard label="Email" value={member.profile.email} /> : null}
            {member.phone ? <ProfileCard label="Phone" value={member.phone} /> : null}
            {member.gender ? <ProfileCard label="Gender" value={member.gender} /> : null}
            {birthday !== "Not provided" ? <ProfileCard label="Birthday" value={birthday} /> : null}
            {member.favorite_food ? <ProfileCard label="Favorite Food" value={member.favorite_food} /> : null}
          </ProfileSection>
          <ProfileSection title="Membership information">
            <ProfileCard label="Membership Status" value={statusMeta.label} />
            {member.joined_month && member.joined_year ? <ProfileCard label="Joined Month & Year" value={formatJoinedDate(member)} /> : null}
            {member.joined_date ? <ProfileCard label="Exact Joined Date" value={profileDate(member.joined_date)} /> : null}
          </ProfileSection>
          <ProfileSection title="Serving / Department information">
            <ProfileCard label="Department(s) serving in" value={departmentValue} />
            {member.custom_department ? <ProfileCard label="Custom department" value={member.custom_department} /> : null}
          </ProfileSection>
          <ProfileSection title="Discipleship">
            <ProfileCard label="Completed Discipleship Class?" value={discYes ? "Yes" : "No"} highlight={discYes} />
          </ProfileSection>
          {member.bio || member.notes ? <ProfileSection title="Additional information">
            {member.bio ? <ProfileCard label="Short Bio" value={member.bio} /> : null}
            {member.notes ? <ProfileCard label="Notes" value={member.notes} /> : null}
          </ProfileSection> : null}
        </div>
        <footer className="cgm-profile-footer">
          <div className="cgm-profile-actions">
            <button type="button" className="cgm-btn cgm-btn-download" onClick={onDownload} disabled={downloading}>
              <Icon name="download" /> {downloading ? "Preparing Member Profile..." : "Download PDF"}
            </button>
            {canEdit ? <button type="button" className="cgm-btn cgm-btn-primary" onClick={onEdit}>
              <Icon name="edit" /> Edit Member
            </button> : null}
          </div>
          {canEdit ? <button type="button" className="cgm-btn cgm-btn-ghost cgm-btn-danger cgm-profile-remove" onClick={onRemove}>
            <Icon name="trash" /> Remove from Membership
          </button> : null}
        </footer>
      </div>
    </div>
  );
}

function ProfileSection({ title, children }) {
  return <section className="cgm-profile-section"><h3>{title}</h3><div className="cgm-profile-card-grid">{children}</div></section>;
}

function ProfileCard({ label, value, highlight = false }) {
  return <div className="cgm-profile-info-card"><span>{label}</span><strong className={highlight ? "cgm-profile-yes" : ""}>{value}</strong></div>;
}
