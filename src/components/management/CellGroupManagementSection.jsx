import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { exportMembersExcel, exportMembersPdf } from "../../lib/cellGroupExport";
import {
  DEPARTMENTS,
  EDITABLE_MEMBERSHIP_STATUSES,
  DISCIPLESHIP_OPTIONS,
  EXPORT_FIELDS,
  MANAGEMENT_TABS,
  emptyMemberForm,
  filterMembers,
  formatDate,
  formatDepartments,
  formatJoinedDate,
  formatRelativeTime,
  formsAreEqual,
  getDepartmentChips,
  getInitials,
  getMembershipStatusMeta,
  isCurrentMember,
  memberToForm,
  normalizeDiscipleshipStatus,
  optimizeImage,
  validateMemberForm
} from "../../lib/cellGroupManagement";
import { MemberFormSheet } from "./MemberFormSheet";

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

function MemberAvatar({ profile, size = "" }) {
  const name = profile?.full_name || profile?.email || "?";
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`cgm-avatar ${size}`} />;
  }
  return (
    <div className={`cgm-avatar fallback ${size}`} aria-label="No photo">
      {getInitials(name)}
    </div>
  );
}

function ActionMenu({ member, onView, onEdit, onRemove }) {
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
          <button type="button" onClick={() => { setOpen(false); onEdit(member); }}><Icon name="edit" size={14} /> Edit</button>
          <button type="button" className="danger" onClick={() => { setOpen(false); onRemove(member); }}><Icon name="trash" size={14} /> Remove</button>
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

export function CellGroupManagementSection({
  user,
  isAdmin,
  profiles,
  onNavigateSection
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cellGroup, setCellGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [rules, setRules] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [discFilter, setDiscFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [memberFormMode, setMemberFormMode] = useState(null);
  const [memberForm, setMemberForm] = useState(emptyMemberForm());
  const [memberFormInitial, setMemberFormInitial] = useState(emptyMemberForm());
  const [memberFormErrors, setMemberFormErrors] = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [viewMember, setViewMember] = useState(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({ title: "", content: "" });
  const [groupForm, setGroupForm] = useState(null);
  const photoInputRef = useRef(null);

  const canManage = isAdmin || cellGroup?.leader_id === user?.id;
  const profileMap = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p])),
    [profiles]
  );

  const enrichedMembers = useMemo(() => {
    return members.map((m) => ({
      ...m,
      profile: profileMap.get(m.user_id),
      discipleship_status: normalizeDiscipleshipStatus(m.discipleship_status)
    }));
  }, [members, profileMap]);

  const currentMembers = useMemo(
    () => enrichedMembers.filter(isCurrentMember),
    [enrichedMembers]
  );

  const leaderProfile = profileMap.get(cellGroup?.leader_id);
  const pendingCount = joinRequests.filter((r) => r.status === "pending").length;

  const filteredMembers = useMemo(
    () =>
      filterMembers(enrichedMembers, {
        search,
        status: statusFilter,
        department: deptFilter,
        discipleship: discFilter,
        joinedYear: yearFilter,
        sort: sortBy,
        currentOnly: true
      }),
    [enrichedMembers, search, statusFilter, deptFilter, discFilter, yearFilter, sortBy]
  );

  const stats = useMemo(() => {
    const active = currentMembers.filter((m) => m.membership_status === "active").length;
    const newCount = currentMembers.filter((m) => m.membership_status === "new").length;
    return {
      total: currentMembers.length,
      active,
      new: newCount,
      pending: pendingCount
    };
  }, [currentMembers, pendingCount]);

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
      await supabase.rpc("log_cell_group_activity", {
        p_group_id: cellGroup.id,
        p_action_type: actionType,
        p_description: description,
        p_affected_user_id: affectedUserId,
        p_metadata: metadata
      });
    },
    [cellGroup?.id]
  );

  const loadData = useCallback(async () => {
    if (!supabase) {
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

      const [groupRes, membersRes, requestsRes, rulesRes, activityRes] = await Promise.all([
        supabase.from("cell_groups").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("cell_group_members").select("*").order("created_at", { ascending: true }),
        supabase.from("cell_group_join_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("cell_group_rules").select("*").order("sort_order", { ascending: true }),
        supabase.from("cell_group_activity_log").select("*").order("created_at", { ascending: false }).limit(50)
      ]);

      const firstError =
        groupRes.error ||
        membersRes.error ||
        requestsRes.error ||
        rulesRes.error ||
        activityRes.error;

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
    } catch (err) {
      console.error("Cell group management load failed", err);
      setLoadError(
        "Unable to load cell group management. Run supabase/cell-group-management-migration.sql in your Supabase SQL Editor, then refresh."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!supabase || !cellGroup?.id) return undefined;

    const channel = supabase
      .channel(`cgm-live-${cellGroup.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_members" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_join_requests" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_rules" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_group_activity_log" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "cell_groups" }, () => void loadData())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cellGroup?.id, loadData]);

  async function uploadAvatar(userId, file) {
    if (!file || !supabase) return null;
    const optimized = await optimizeImage(file);
    if (optimized.size > 1024 * 1024) {
      throw new Error("Image must be under 1MB");
    }
    const ext = optimized.name.split(".").pop() || "webp";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, optimized, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
    return data.publicUrl;
  }

  async function handleSaveMemberForm() {
    const isEdit = memberFormMode === "edit";
    const isExisting = memberForm.mode === "existing";
    const errors = validateMemberForm(memberForm, { isExistingUser: isExisting || isEdit, isEdit });
    if (!isEdit && isExisting && !memberForm.user_id) {
      errors.user_id = "Select a member to add";
    }
    setMemberFormErrors(errors);
    if (Object.keys(errors).length) return;

    if (!isEdit) {
      const existingMember = members.find((m) => m.user_id === memberForm.user_id);
      if (existingMember && isCurrentMember(existingMember)) {
        toast("Already a member", "This person already belongs to the cell group.", "error");
        return;
      }
    }

    setSubmitting(true);
    try {
      let targetUserId = memberForm.user_id;

      if (isEdit) {
        targetUserId = editingMember.user_id;
      } else if (memberForm.mode === "invite") {
        const inviteEmail = memberForm.email.trim().toLowerCase();
        const existingProfile = profiles.find((p) => p.email?.toLowerCase() === inviteEmail);
        if (existingProfile) {
          targetUserId = existingProfile.id;
        } else {
          const { error: invError } = await supabase.from("cell_group_invitations").upsert(
            {
              cell_group_id: cellGroup.id,
              email: inviteEmail,
              full_name: memberForm.full_name.trim(),
              invited_by: user.id,
              membership_data: await buildMemberPayload(memberForm)
            },
            { onConflict: "cell_group_id,email" }
          );
          if (invError) throw invError;
          await logActivity("invitation_sent", `Invitation sent to ${memberForm.full_name.trim()} (${inviteEmail})`);
          toast("Invitation sent", `${memberForm.full_name.trim()} will be added when they register.`);
          requestCloseMemberForm(true);
          return;
        }
      }

      if (memberForm.remove_avatar) {
        await supabase.from("profiles").update({ avatar_url: null }).eq("id", targetUserId);
      } else if (memberForm.avatar_file) {
        await uploadAvatar(targetUserId, memberForm.avatar_file);
      }

      if (memberForm.full_name.trim()) {
        await supabase.from("profiles").update({ full_name: memberForm.full_name.trim() }).eq("id", targetUserId);
      }

      const memberData = {
        cell_group_id: cellGroup.id,
        user_id: targetUserId,
        ...(await buildMemberPayload(memberForm))
      };

      if (isEdit) {
        const payload = await buildMemberPayload(memberForm);
        const { error } = await supabase.from("cell_group_members").update(payload).eq("id", editingMember.id);
        if (error) throw error;
        const name = memberForm.full_name.trim() || profileMap.get(targetUserId)?.full_name || "Member";
        await logActivity("member_updated", `${name}'s membership information was updated.`, targetUserId);
        toast("Member updated successfully", `${name}'s information has been saved.`);
        if (!isCurrentMember({ membership_status: payload.membership_status })) {
          setMembers((prev) => prev.filter((m) => m.id !== editingMember.id));
        } else {
          void loadData();
        }
      } else {
        const { error } = await supabase.from("cell_group_members").upsert(memberData, {
          onConflict: "cell_group_id,user_id"
        });
        if (error) {
          if (error.code === "23505") {
            toast("Already a member", "This person already belongs to the cell group.", "error");
            return;
          }
          throw error;
        }
        const name = memberForm.full_name.trim() || profileMap.get(targetUserId)?.full_name || "Member";
        await logActivity("member_added", `${name} was added to the cell group.`, targetUserId);
        toast("Member Added", `${name} has been successfully added to the cell group.`);
        void loadData();
      }

      requestCloseMemberForm(true);
    } catch (err) {
      console.error(err);
      toast(
        isEdit ? "Update failed" : "Unable to add member",
        "Something went wrong while saving this member. Please try again.",
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function buildMemberPayload(form) {
    return {
      date_of_birth: form.date_of_birth || null,
      departments: form.departments.includes("None") ? [] : form.departments.filter((d) => d !== "None"),
      custom_department: form.departments.includes("Other") ? form.custom_department?.trim() || null : null,
      favorite_food: form.favorite_food?.trim() || null,
      joined_month: form.joined_month ? Number(form.joined_month) : null,
      joined_year: form.joined_year ? Number(form.joined_year) : null,
      joined_date: form.joined_date || null,
      discipleship_status: normalizeDiscipleshipStatus(form.discipleship_status),
      membership_status: form.membership_status,
      phone: form.phone?.trim() || null,
      gender: form.gender?.trim() || null,
      bio: form.bio?.trim() || null,
      notes: form.notes?.trim() || null
    };
  }

  function openAddForm() {
    const form = emptyMemberForm();
    setMemberForm(form);
    setMemberFormInitial(JSON.parse(JSON.stringify(form)));
    setMemberFormErrors({});
    setMemberFormMode("add");
    setEditingMember(null);
    setUserSearch("");
  }

  function openEditForm(member) {
    const form = memberToForm(member, member.profile);
    setMemberForm(form);
    setMemberFormInitial(JSON.parse(JSON.stringify(form)));
    setMemberFormErrors({});
    setMemberFormMode("edit");
    setEditingMember(member);
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
    setSubmitting(true);
    const name = profileMap.get(member.user_id)?.full_name || "Member";
    const memberId = member.id;
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    try {
      await logActivity("member_removed", `${name} was removed from the cell group.`, member.user_id);
      const { error } = await supabase.from("cell_group_members").delete().eq("id", memberId);
      if (error) throw error;
      toast("Member removed", `${name} has been removed from the cell group.`);
      setConfirmRemove(null);
      setViewMember(null);
      setMemberFormMode(null);
      setEditingMember(null);
    } catch (err) {
      console.error(err);
      void loadData();
      toast("Remove failed", "Could not remove this member. Please try again.", "error");
    } finally {
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
          name: groupForm.name.trim(),
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

  async function handleExport(format) {
    if (exporting) return;
    setExporting(format);
    toast("Preparing download...", "Your file will save automatically.", "success");
    try {
      const fields = EXPORT_FIELDS.filter((f) => f.default).map((f) => f.key);
      const exportData = { members: filteredMembers, fields, groupName: cellGroup?.name, leaderName: leaderProfile?.full_name };
      if (format === "excel") {
        await exportMembersExcel(exportData);
      } else {
        await exportMembersPdf(exportData);
      }
      toast("Download complete", format === "excel" ? "Excel file saved to your downloads." : "PDF report saved to your downloads.");
    } catch (err) {
      console.error(err);
      toast("Download failed", "We couldn't generate the file. Please try again.", "error");
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
            <p className="cgm-hero-eyebrow">Leadership Portal</p>
            <h1>{cellGroup?.name || "Cell Group Management"}</h1>
            <p className="cgm-hero-desc">
              Manage membership, requests, rules, and settings from one premium workspace.
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
                <button type="button" className="cgm-btn cgm-btn-primary" onClick={openAddForm}>
                  <Icon name="plus" /> Add Member
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="cgm-shell">
      <nav className="cgm-tabs" role="tablist">
        {MANAGEMENT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
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

      {activeTab === "overview" ? (
        <>
          <div className="cgm-stats-grid">
            <div className="cgm-stat-card">
              <span>Cell Group</span>
              <strong>{cellGroup?.name || "—"}</strong>
            </div>
            <div className="cgm-stat-card accent">
              <span>Total Members</span>
              <strong>{stats.total}</strong>
            </div>
            <div className="cgm-stat-card">
              <span>Active</span>
              <strong>{stats.active}</strong>
            </div>
            <div className="cgm-stat-card accent">
              <span>New Members</span>
              <strong>{stats.new}</strong>
            </div>
            <div className="cgm-stat-card">
              <span>Pending Requests</span>
              <strong>{stats.pending}</strong>
            </div>
            <div className="cgm-stat-card">
              <span>Created</span>
              <strong style={{ fontSize: "var(--fs-1)" }}>
                {cellGroup?.created_at ? formatDate(cellGroup.created_at) : "—"}
              </strong>
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
                <button type="button" className="cgm-btn cgm-btn-primary" onClick={() => { setActiveTab("membership"); openAddForm(); }}>
                  <Icon name="plus" /> Add Member
                </button>
                <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setActiveTab("membership")}>
                  <Icon name="users" /> View Membership
                </button>
                {pendingCount > 0 ? (
                  <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setActiveTab("requests")}>
                    Review Requests ({pendingCount})
                  </button>
                ) : null}
                {onNavigateSection ? (
                  <>
                    <button type="button" className="cgm-quick-link" onClick={() => onNavigateSection("members")}>Members Page</button>
                    <button type="button" className="cgm-quick-link" onClick={() => onNavigateSection("discipleship")}>Discipleship</button>
                    <button type="button" className="cgm-quick-link" onClick={() => onNavigateSection("events")}>Dashboard</button>
                  </>
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
              <button type="button" className="cgm-btn cgm-btn-download cgm-btn-download--compact" disabled={!!exporting || !filteredMembers.length} onClick={() => void handleExport("excel")}>
                <Icon name="file-sheet" /> Excel
              </button>
              <button type="button" className="cgm-btn cgm-btn-download cgm-btn-download--compact" disabled={!!exporting || !filteredMembers.length} onClick={() => void handleExport("pdf")}>
                <Icon name="file-pdf" /> PDF
              </button>
              <button type="button" className="cgm-btn cgm-btn-primary" onClick={openAddForm}>
                <Icon name="plus" /> Add Member
              </button>
            </div>
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
                                <MemberAvatar profile={m.profile} />
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
                                onRemove={setConfirmRemove}
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
                            <MemberAvatar profile={m.profile} />
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
                          <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => openEditForm(m)}>
                            <Icon name="edit" size={14} /> Edit
                          </button>
                          <button type="button" className="cgm-btn cgm-btn-ghost cgm-btn-danger" onClick={() => setConfirmRemove(m)}>
                            <Icon name="trash" size={14} /> Remove
                          </button>
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
                <button type="button" className="cgm-btn cgm-btn-primary" onClick={openAddForm}>
                  <Icon name="plus" /> Add Member
                </button>
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
                        <MemberAvatar profile={requester} />
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
                <input type="text" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} required />
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
            </div>
            <div className="cgm-sticky-save">
              <p>Changes are saved to your cell group immediately.</p>
              <button type="submit" className="cgm-btn cgm-btn-primary cgm-btn-save" disabled={submitting}>
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
              email: p.email || "",
              avatar_preview: p.avatar_url || ""
            });
            setUserSearch(p.full_name || p.email);
          }}
          photoInputRef={photoInputRef}
          submitLabel={memberFormMode === "edit" ? "Save Changes" : "Add Member"}
        />
      ) : null}

      {viewMember ? (
        <MemberViewDrawer
          member={viewMember}
          onClose={() => setViewMember(null)}
          onEdit={() => openEditForm(viewMember)}
          onRemove={() => setConfirmRemove(viewMember)}
        />
      ) : null}

      {showDiscardConfirm ? (
        <div className="cgm-overlay" onClick={(e) => e.target === e.currentTarget && setShowDiscardConfirm(false)}>
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
        <div className="cgm-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmRemove(null)}>
          <div className="cgm-modal" role="alertdialog">
            <div className="cgm-modal-header">
              <h3>Remove this member?</h3>
            </div>
            <div className="cgm-modal-body">
              <p className="cgm-confirm-text">
                This will remove {profileMap.get(confirmRemove.user_id)?.full_name || "this member"}&apos;s membership from the cell group.
                Their account will not be deleted.
              </p>
              <div className="cgm-form-actions">
                <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
                <button type="button" className="cgm-btn cgm-btn-primary cgm-btn-danger" disabled={submitting} onClick={() => void handleRemoveMember(confirmRemove)}>
                  Remove Member
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      </div>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />
    </div>
  );
}

function MemberViewDrawer({ member, onClose, onEdit, onRemove }) {
  const statusMeta = getMembershipStatusMeta(member.membership_status);
  const discYes = normalizeDiscipleshipStatus(member.discipleship_status) === "yes";

  return (
    <div className="cgm-overlay cgm-drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cgm-drawer cgm-view-drawer" role="dialog" aria-label="Member details">
        <div className="cgm-drawer-header">
          <div className="cgm-member-cell">
            <MemberAvatar profile={member.profile} size="large" />
            <div>
              <h3>{member.profile?.full_name || "Unnamed"}</h3>
              <div className="cgm-member-email">{member.profile?.email}</div>
            </div>
          </div>
          <button type="button" className="cgm-close-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="cgm-drawer-body">
          <div className="cgm-detail-section">
            <h4>Profile</h4>
            <div className="cgm-detail-row"><span>Full Name</span><span>{member.profile?.full_name || "Not provided"}</span></div>
            <div className="cgm-detail-row"><span>Date of Birth</span><span>{member.date_of_birth ? formatDate(member.date_of_birth) : "Not provided"}</span></div>
            <div className="cgm-detail-row"><span>Favorite Food</span><span>{member.favorite_food || "Not provided"}</span></div>
            <div className="cgm-detail-row"><span>Phone</span><span>{member.phone || "Not provided"}</span></div>
            {member.gender ? <div className="cgm-detail-row"><span>Gender</span><span>{member.gender}</span></div> : null}
            {member.bio ? <div className="cgm-detail-row"><span>Bio</span><span>{member.bio}</span></div> : null}
          </div>
          <div className="cgm-detail-section">
            <h4>Ministry</h4>
            <div className="cgm-detail-row"><span>Department(s)</span><span>{formatDepartments(member)}</span></div>
          </div>
          <div className="cgm-detail-section">
            <h4>Cell Group</h4>
            <div className="cgm-detail-row"><span>Joined</span><span>{formatJoinedDate(member)}</span></div>
            {member.joined_date ? (
              <div className="cgm-detail-row"><span>Exact Date</span><span>{formatDate(member.joined_date)}</span></div>
            ) : null}
            <div className="cgm-detail-row"><span>Status</span><span className={statusMeta.pillClass}>{statusMeta.label}</span></div>
          </div>
          <div className="cgm-detail-section">
            <h4>Discipleship</h4>
            <div className="cgm-detail-row">
              <span>Completed Discipleship Class?</span>
              <span className={`cgm-disc-badge${discYes ? " yes" : ""}`}>{discYes ? "Yes" : "No"}</span>
            </div>
          </div>
          {member.notes ? (
            <div className="cgm-detail-section">
              <h4>Notes</h4>
              <p className="cgm-notes-text">{member.notes}</p>
            </div>
          ) : null}
          <div className="cgm-form-actions">
            <button type="button" className="cgm-btn cgm-btn-primary" onClick={onEdit}>
              <Icon name="edit" /> Edit Member
            </button>
            <button type="button" className="cgm-btn cgm-btn-ghost cgm-btn-danger" onClick={onRemove}>
              <Icon name="trash" /> Remove Member
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
