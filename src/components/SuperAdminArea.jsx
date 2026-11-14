import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { MemberInitials } from "./MemberInitials.jsx";
import { APP_NAME, CELL_GROUP_NAME } from "../lib/identity";
import "../styles/super-admin.css";

const auditLabels = {
  admin_role_granted: "Granted admin access",
  admin_role_revoked: "Revoked admin access",
  member_paused: "Paused member access",
  member_restored: "Restored member access",
  member_deleted: "Deleted member account",
  super_admin_bootstrapped: "Super Admin access bootstrapped",
  admin_bootstrap_granted: "Admin access restored by database owner"
};

function formatAuditTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function SuperAdminIdentity({ member }) {
  return <MemberInitials member={member} className="super-admin-identity" />;
}

async function getFunctionErrorMessage(error) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === "string" && body.error.trim()) return body.error;
    } catch {
      // The SDK error message below is the useful fallback when the response has no JSON body.
    }
  }
  return error?.message || "The selected member accounts could not be deleted.";
}

function isEdgeFunctionTransportError(error) {
  return error?.name === "FunctionsFetchError"
    || /failed to send a request to the edge function/i.test(error?.message || "");
}

export function SuperAdminArea({ user, profiles, platformOverview, workspaceLoading, workspaceError, onNavigateSection, onRefresh, onLeave }) {
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [auditRows, setAuditRows] = useState([]);
  const [superAdminIds, setSuperAdminIds] = useState(() => new Set());
  const [superAdminIdsReady, setSuperAdminIdsReady] = useState(false);
  const [membershipRows, setMembershipRows] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => new Set());
  const [pendingAction, setPendingAction] = useState(null);
  const [deletionDialog, setDeletionDialog] = useState(null);
  const [deletionFeedback, setDeletionFeedback] = useState(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streakSettings, setStreakSettings] = useState(null);
  const [streakSettingsLoading, setStreakSettingsLoading] = useState(true);
  const [streakSettingsSaving, setStreakSettingsSaving] = useState(false);
  const [streakSettingsError, setStreakSettingsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadProtectedData() {
    const [auditResult, superAdminResult, membershipsResult] = await Promise.all([
      supabase.from("super_admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(60),
      supabase.from("super_admin_members").select("user_id, granted_at"),
      supabase.from("cell_group_members").select("user_id,membership_status,cell_group_id")
    ]);
    const failedResult = [auditResult, superAdminResult, membershipsResult].find((result) => result.error);
    if (failedResult?.error) throw failedResult.error;
    setAuditRows(auditResult.data ?? []);
    setSuperAdminIds(new Set((superAdminResult.data ?? []).map((entry) => entry.user_id)));
    setSuperAdminIdsReady(true);
    setMembershipRows(membershipsResult.data ?? []);
  }

  useEffect(() => {
    let mounted = true;
    loadProtectedData().catch((loadError) => {
      if (mounted) setError(loadError.message || "Restricted data could not be loaded.");
    });
    supabase.from("bible_streak_settings").select("*").eq("id", 1).maybeSingle().then(({ data, error: settingsError }) => {
      if (!mounted) return;
      setStreakSettingsLoading(false);
      setStreakSettings(data || null);
      setStreakSettingsError(settingsError?.message || (!data ? "Bible streak settings are unavailable. Apply the Bible streak migration first." : ""));
    });
    return () => { mounted = false; };
  }, []);

  async function saveStreakSettings(event) {
    event.preventDefault();
    if (!streakSettings || streakSettingsSaving) return;
    setStreakSettingsSaving(true);
    setStreakSettingsError("");
    setError("");
    setNotice("");
    const { data, error: saveError } = await supabase.from("bible_streak_settings").update({
      application_timezone: streakSettings.application_timezone.trim(),
      daily_requirement: streakSettings.daily_requirement,
      streak_freeze_enabled: Boolean(streakSettings.streak_freeze_enabled),
      streak_freeze_auto_use: Boolean(streakSettings.streak_freeze_auto_use),
      freezes_per_member: Number(streakSettings.freezes_per_member),
      group_completion_percent: Number(streakSettings.group_completion_percent)
    }).eq("id", 1).select("*").single();
    setStreakSettingsSaving(false);
    if (saveError) {
      setStreakSettingsError(saveError.message || "Bible streak settings could not be saved.");
      return;
    }
    setStreakSettings(data);
    setNotice("Bible streak rules have been saved.");
  }

  const counts = useMemo(() => ({
    total: profiles.length,
    active: profiles.filter((member) => member.is_active).length,
    paused: profiles.filter((member) => !member.is_active).length,
    admins: profiles.filter((member) => member.role === "admin").length
  }), [profiles]);

  const membershipByUser = useMemo(() => {
    const result = new Map();
    for (const row of membershipRows) {
      const current = result.get(row.user_id) ?? [];
      current.push(row);
      result.set(row.user_id, current);
    }
    return result;
  }, [membershipRows]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return profiles.filter((member) => !normalizedQuery || [member.full_name, member.email, member.role]
      .some((value) => value?.toLowerCase().includes(normalizedQuery)));
  }, [profiles, query]);

  const activeAdminCount = useMemo(
    () => profiles.filter((member) => member.role === "admin" && member.is_active).length,
    [profiles]
  );
  const deletableProfiles = useMemo(() => profiles.filter((member) => (
    superAdminIdsReady
      && member.id !== user.id
      && !superAdminIds.has(member.id)
      && !(member.role === "admin" && member.is_active && activeAdminCount <= 1)
  )), [profiles, user.id, superAdminIds, superAdminIdsReady, activeAdminCount]);
  const deletableProfileIds = useMemo(() => new Set(deletableProfiles.map((member) => member.id)), [deletableProfiles]);
  const filteredDeletableProfiles = useMemo(
    () => filteredProfiles.filter((member) => deletableProfileIds.has(member.id)),
    [filteredProfiles, deletableProfileIds]
  );
  const selectedProfiles = useMemo(
    () => deletableProfiles.filter((member) => selectedMemberIds.has(member.id)),
    [deletableProfiles, selectedMemberIds]
  );

  useEffect(() => {
    setSelectedMemberIds((selected) => {
      const next = new Set([...selected].filter((id) => deletableProfileIds.has(id)));
      return next.size === selected.size ? selected : next;
    });
  }, [deletableProfileIds]);

  function toggleMemberSelection(memberId, selected) {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (selected) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  }

  function toggleVisibleMembers() {
    const visibleIds = filteredDeletableProfiles.map((member) => member.id);
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function clearMemberSelection() {
    setSelectedMemberIds(new Set());
  }

  async function confirmAction() {
    if (!pendingAction || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = pendingAction.type === "role"
        ? await supabase.rpc("super_admin_set_admin_role", { target_user_id: pendingAction.member.id, grant_admin: pendingAction.grantAdmin })
        : await supabase.rpc("super_admin_set_member_active", { target_user_id: pendingAction.member.id, target_active: pendingAction.active });
      if (result.error) throw result.error;
      const name = pendingAction.member.full_name || "Member";
      setNotice(pendingAction.type === "role"
        ? `${name} admin access ${pendingAction.grantAdmin ? "granted" : "revoked"}.`
        : `${name} access ${pendingAction.active ? "restored" : "paused"}.`);
      setPendingAction(null);
      await Promise.all([onRefresh(), loadProtectedData()]);
    } catch (actionError) {
      setError(actionError.message || "The requested account change could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedMembers() {
    if (!deletionDialog || deletionBusy) return;
    const userIds = deletionDialog.members.map((member) => member.id);
    if (!userIds.length) return;

    setDeletionBusy(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-delete-user", {
        body: { userIds }
      });
      let deletionResult = data;
      let cleanupUnavailable = false;
      if (invokeError) {
        if (!isEdgeFunctionTransportError(invokeError)) {
          throw new Error(await getFunctionErrorMessage(invokeError));
        }

        const { data: rpcResult, error: rpcError } = await supabase.rpc("super_admin_delete_members", {
          target_user_ids: userIds
        });
        if (rpcError) {
          throw new Error(`${await getFunctionErrorMessage(invokeError)} Database recovery also failed: ${rpcError.message || "the secure deletion operation is unavailable."}`);
        }
        deletionResult = {
          success: true,
          deletedIds: rpcResult?.deleted_ids,
          alreadyMissingCount: rpcResult?.already_missing_count,
          storageCleanupPending: true,
          storageCleanupPendingCount: null,
          storageCleanupWarnings: ["The secure database deletion succeeded, but the Edge Function could not be reached. Uploaded-file cleanup remains queued; retry after the Edge Function is available."]
        };
        cleanupUnavailable = true;
      }
      if (deletionResult?.success !== true || !Array.isArray(deletionResult.deletedIds)) {
        throw new Error(typeof deletionResult?.error === "string" ? deletionResult.error : "The deletion result could not be verified.");
      }

      const alreadyMissingCount = Number(deletionResult.alreadyMissingCount) || 0;
      if (deletionResult.deletedIds.length + alreadyMissingCount !== userIds.length) {
        throw new Error("The server could not confirm the result for every selected account. Refresh the directory before trying again.");
      }

      setDeletionDialog(null);
      clearMemberSelection();
      setDeletionFeedback({
        type: "success",
        deletedCount: deletionResult.deletedIds.length,
        alreadyMissingCount,
        storageCleanupPending: cleanupUnavailable || Boolean(deletionResult.storageCleanupPending),
        storageCleanupPendingCount: deletionResult.storageCleanupPendingCount,
        storageCleanupWarnings: Array.isArray(deletionResult.storageCleanupWarnings) ? deletionResult.storageCleanupWarnings : []
      });
    } catch (deleteError) {
      setDeletionFeedback({
        type: "error",
        message: deleteError.message || "The member accounts could not be deleted. No success was recorded."
      });
    } finally {
      setDeletionBusy(false);
    }
  }

  async function acknowledgeDeletionFeedback() {
    const completed = deletionFeedback?.type === "success";
    setDeletionFeedback(null);
    if (!completed) return;

    setTab("members");
    setError("");
    setDeletionBusy(true);
    try {
      await Promise.all([onRefresh(), loadProtectedData()]);
    } catch (refreshError) {
      setError(refreshError.message || "The deletion completed, but the member directory could not be refreshed.");
    } finally {
      setDeletionBusy(false);
    }
  }

  async function retryPendingStorageCleanup() {
    if (deletionBusy || deletionFeedback?.type !== "success" || !deletionFeedback.storageCleanupPending) return;
    setDeletionBusy(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-delete-user", {
        body: { retryStorageCleanup: true }
      });
      if (invokeError) throw new Error(await getFunctionErrorMessage(invokeError));
      if (data?.success !== true) {
        throw new Error(typeof data?.error === "string" ? data.error : "Queued file cleanup could not be verified.");
      }
      setDeletionFeedback((current) => current?.type === "success" ? {
        ...current,
        storageCleanupPending: Boolean(data.storageCleanupPending),
        storageCleanupPendingCount: data.storageCleanupPendingCount,
        storageCleanupWarnings: Array.isArray(data.storageCleanupWarnings) ? data.storageCleanupWarnings : []
      } : current);
    } catch (retryError) {
      setDeletionFeedback((current) => current?.type === "success" ? {
        ...current,
        storageCleanupPending: true,
        storageCleanupWarnings: [...new Set([
          ...current.storageCleanupWarnings,
          `File cleanup could not be retried: ${retryError.message || "the secure cleanup service is unavailable"}.`
        ])]
      } : current);
    } finally {
      setDeletionBusy(false);
    }
  }

  return (
    <section className="super-admin-page" aria-labelledby="super-admin-title">
      <header className="super-admin-header">
        <div>
          <p className="super-admin-eyebrow">{APP_NAME} · Restricted workspace</p>
          <h1 id="super-admin-title">Super Admin</h1>
          <p>Oversee {CELL_GROUP_NAME}, manage role access, and review an auditable record of privileged changes.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onLeave}>Return to workspace</button>
      </header>

      <nav className="super-admin-tabs" aria-label="Super Admin sections">
        {[{ id: "overview", label: "Overview" }, { id: "members", label: "Members & admins" }, { id: "bible-streaks", label: "Bible consistency" }, { id: "audit", label: "Audit log" }].map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} aria-current={tab === item.id ? "page" : undefined}>{item.label}</button>
        ))}
      </nav>

      {notice ? <div className="super-admin-feedback success" role="status">{notice}</div> : null}
      {error ? <div className="super-admin-feedback error" role="alert">{error}</div> : null}

      {tab === "overview" ? (
        <div className="super-admin-content">
          <section className="super-admin-panel super-admin-group-summary">
            <div className="super-admin-panel-heading"><div><h2>{CELL_GROUP_NAME}</h2><p>Single cell group workspace</p></div><span className="super-admin-secure-badge">Canonical group</span></div>
            <p>Members, Admins, events, prayer, Bible Study, and community activity are managed together in this group.</p>
          </section>
          <div className="super-admin-stat-grid">{[
            { label: "Registered accounts", value: workspaceLoading ? "—" : counts.total, icon: "users", tag: "TOTAL", tone: "indigo" },
            { label: "Active accounts", value: workspaceLoading ? "—" : counts.active, icon: "activity", tag: "LIVE", tone: "emerald" },
            { label: "Administrators", value: workspaceLoading ? "—" : counts.admins, icon: "shield", tag: "ACCESS", tone: "blue" },
            { label: "Paused accounts", value: workspaceLoading ? "—" : counts.paused, icon: "pause", tag: "REVIEW", tone: "orange" }
          ].map((item) => <article className={`super-admin-stat-card ${item.tone}`} key={item.label}>
            <div className="super-admin-stat-top">
              <span className="super-admin-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {item.icon === "users" ? <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-3.4 2.3-5.2 5.5-5.2s5.1 1.8 5.5 5.2M16 5.5a3 3 0 0 1 0 5.8M17 15c2.1.5 3.3 2.2 3.5 5"/></> : item.icon === "activity" ? <><path d="M3 12h4l2.3-6 4.1 12 2.4-6H21"/></> : item.icon === "shield" ? <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></> : <><path d="M6 6l12 12M18 6 6 18"/></>}
              </svg></span>
              <small className="super-admin-stat-tag">{item.tag}</small>
            </div>
            <span className="super-admin-stat-label">{item.label}</span><strong>{item.value}</strong>
          </article>)}</div>
          <section className="super-admin-platform-pulse" aria-label={`${CELL_GROUP_NAME} activity`}>
            <div className="super-admin-panel-heading"><div><h2>Group activity</h2><p>Current records from {CELL_GROUP_NAME}.</p></div></div>
            <div className="super-admin-activity-grid">
              <article><span>Upcoming events</span><strong>{workspaceLoading ? "—" : platformOverview.upcomingEvents}</strong></article>
              <article><span>Prayer requests</span><strong>{workspaceLoading ? "—" : platformOverview.prayerRequests}</strong></article>
              <article><span>Bible Study conversations</span><strong>{workspaceLoading ? "—" : platformOverview.bibleStudyConversations}</strong></article>
            </div>
            <p className={`super-admin-sync-state${workspaceError ? " needs-attention" : ""}`} role="status"><span aria-hidden="true" />{workspaceLoading ? "Workspace data is syncing." : workspaceError ? "Workspace data needs attention." : "Workspace data is current."}</p>
          </section>
          <div className="super-admin-overview-grid">
            <section className="super-admin-panel">
              <div className="super-admin-panel-heading"><div><h2>Administration</h2><p>Open a feature area with the permissions attached to this Super Admin account.</p></div><span className="super-admin-secure-badge">Verified</span></div>
              <button type="button" className="super-admin-quick-link" onClick={() => setTab("members")}>Review member access <span aria-hidden="true">→</span></button>
              <button type="button" className="super-admin-quick-link" onClick={() => onNavigateSection("bible-study")}>Bible Study administration <span aria-hidden="true">→</span></button>
              <button type="button" className="super-admin-quick-link" onClick={() => onNavigateSection("events")}>Events and attendance <span aria-hidden="true">→</span></button>
              <button type="button" className="super-admin-quick-link" onClick={() => onNavigateSection("prayer")}>Prayer care <span aria-hidden="true">→</span></button>
              <button type="button" className="super-admin-quick-link" onClick={() => setTab("audit")}>Review sensitive actions <span aria-hidden="true">→</span></button>
            </section>
            <section className="super-admin-panel">
              <div className="super-admin-panel-heading"><div><h2>Recent changes</h2><p>Most recent privileged actions.</p></div><button type="button" className="text-button" onClick={() => setTab("audit")}>View all</button></div>
              {auditRows.length ? <div className="super-admin-audit-list">{auditRows.slice(0, 5).map((row) => <AuditRow key={row.id} entry={row} profiles={profiles} />)}</div> : <p className="super-admin-empty">No administrative actions have been recorded.</p>}
            </section>
          </div>
        </div>
      ) : null}

      {tab === "members" ? (
        <section className="super-admin-panel super-admin-member-panel">
          <div className="super-admin-panel-heading"><div><h2>Member and admin management</h2><p>Search accounts and manage their access to {CELL_GROUP_NAME}.</p></div></div>
          <label className="super-admin-search"><span>Search accounts</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" /></label>
          <div className="super-admin-member-toolbar">
            <span>{filteredProfiles.length} accounts</span>
            <div className="super-admin-selection-actions" aria-label="Member selection actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!filteredDeletableProfiles.length || deletionBusy}
                aria-pressed={filteredDeletableProfiles.length > 0 && filteredDeletableProfiles.every((member) => selectedMemberIds.has(member.id))}
                onClick={toggleVisibleMembers}
              >
                {filteredDeletableProfiles.length > 0 && filteredDeletableProfiles.every((member) => selectedMemberIds.has(member.id)) ? "Deselect visible" : "Select all visible"}
              </button>
              <button type="button" className="secondary-button" disabled={!selectedProfiles.length || deletionBusy} onClick={clearMemberSelection}>Clear selection</button>
              <span className="super-admin-selection-count" aria-live="polite">{selectedProfiles.length} selected</span>
              <button
                type="button"
                className="ghost-button danger"
                disabled={!selectedProfiles.length || deletionBusy}
                onClick={() => setDeletionDialog({ members: selectedProfiles })}
              >
                Delete selected{selectedProfiles.length ? ` (${selectedProfiles.length})` : ""}
              </button>
            </div>
          </div>
          <div className="super-admin-member-list">
            {filteredProfiles.map((member) => {
              const isSuperAdmin = superAdminIds.has(member.id);
              const canDelete = deletableProfileIds.has(member.id);
              const memberRows = membershipByUser.get(member.id) ?? [];
              const membershipLabel = memberRows.length
                ? memberRows.some((row) => row.membership_status === "active") ? "Member" : "Membership record"
                : "No member record";
              return <article className={`super-admin-member-row${selectedMemberIds.has(member.id) ? " is-selected" : ""}`} key={member.id}>
                <label className="super-admin-member-select" title={canDelete ? `Select ${member.full_name || member.email}` : "This account is protected"}>
                  <input
                    type="checkbox"
                    checked={canDelete && selectedMemberIds.has(member.id)}
                    disabled={!canDelete || deletionBusy}
                    onChange={(event) => toggleMemberSelection(member.id, event.target.checked)}
                    aria-label={`Select ${member.full_name || member.email || "member"} for permanent deletion`}
                  />
                </label>
                <div className="super-admin-member-identity"><SuperAdminIdentity member={member} /><div><strong>{member.full_name || "Unnamed member"}</strong><small>{member.email}</small></div></div>
                <div className="super-admin-member-state"><span className={isSuperAdmin ? "super-admin-tag admin" : "super-admin-tag"}>{isSuperAdmin ? "Super Admin" : member.role === "admin" ? "Admin" : "Member"}</span><span className={member.is_active ? "super-admin-tag active" : "super-admin-tag paused"}>{member.is_active ? "Active" : "Paused"}</span><span className="super-admin-tag group">{membershipLabel}</span></div>
                <div className="super-admin-member-actions">
                  <button type="button" className={member.role === "admin" ? "secondary-button" : "primary-button"} disabled={busy || deletionBusy || isSuperAdmin} onClick={() => setPendingAction({ type: "role", member, grantAdmin: member.role !== "admin" })}>{isSuperAdmin ? "Protected" : member.role === "admin" ? "Revoke admin" : "Grant admin"}</button>
                  <button type="button" className="ghost-button" disabled={busy || deletionBusy || isSuperAdmin || member.id === user.id} onClick={() => setPendingAction({ type: "active", member, active: !member.is_active })}>{member.is_active ? "Pause access" : "Restore access"}</button>
                  <button type="button" className="ghost-button danger" disabled={busy || deletionBusy || !canDelete} onClick={() => setDeletionDialog({ members: [member] })}>Delete member</button>
                </div>
              </article>;
            })}
            {!filteredProfiles.length ? <p className="super-admin-empty">No accounts match this search.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "bible-streaks" ? <section className="super-admin-panel super-admin-streak-settings">
        <div className="super-admin-panel-heading"><div><h2>Bible consistency rules</h2><p>These settings apply consistently to personal reading streaks and the shared group consistency indicator.</p></div></div>
        {streakSettingsLoading ? <p className="super-admin-empty" role="status">Loading Bible consistency settings…</p> : streakSettings ? <form className="super-admin-streak-form" onSubmit={(event)=>void saveStreakSettings(event)}>
          <label><span>Application timezone</span><input value={streakSettings.application_timezone||""} onChange={(event)=>setStreakSettings((current)=>({...current,application_timezone:event.target.value}))} placeholder="Africa/Nairobi" required/><small>Daily boundaries use this timezone. The default is Africa/Nairobi.</small></label>
          <label><span>Daily personal reading requirement</span><select value={streakSettings.daily_requirement} onChange={(event)=>setStreakSettings((current)=>({...current,daily_requirement:event.target.value}))}><option value="at_least_one">At least one personal chapter each day</option><option value="all_assigned">All assigned personal chapters, or one selected chapter if none are assigned</option></select></label>
          <label><span>Group completion threshold</span><div className="super-admin-streak-percent"><input type="number" min="1" max="100" value={streakSettings.group_completion_percent} onChange={(event)=>setStreakSettings((current)=>({...current,group_completion_percent:event.target.value}))}/><b>% of active members per assigned chapter</b></div><small>Every shared chapter due on a group day must meet this threshold.</small></label>
          <fieldset><legend>Streak Freeze</legend><label className="super-admin-streak-check"><input type="checkbox" checked={Boolean(streakSettings.streak_freeze_enabled)} onChange={(event)=>setStreakSettings((current)=>({...current,streak_freeze_enabled:event.target.checked}))}/><span>Enable the optional Streak Freeze</span></label><label><span>Freezes per member per calendar month</span><input type="number" min="0" max="10" value={streakSettings.freezes_per_member} onChange={(event)=>setStreakSettings((current)=>({...current,freezes_per_member:event.target.value}))}/></label><label className="super-admin-streak-check"><input type="checkbox" checked={Boolean(streakSettings.streak_freeze_auto_use)} disabled={!streakSettings.streak_freeze_enabled} onChange={(event)=>setStreakSettings((current)=>({...current,streak_freeze_auto_use:event.target.checked}))}/><span>Use a freeze automatically for an eligible missed day</span></label><small>A freeze can protect one missed day only when the previous day qualified. Manual use is confirmed by the member.</small></fieldset>
          {streakSettingsError?<p className="super-admin-feedback error" role="alert">{streakSettingsError}</p>:null}
          <div className="form-actions"><button type="submit" className="primary-button" disabled={streakSettingsSaving}>{streakSettingsSaving?"Saving…":"Save Bible consistency rules"}</button><small>Last updated {streakSettings.updated_at?formatAuditTime(streakSettings.updated_at):"not yet"}</small></div>
        </form> : <p className="super-admin-feedback error" role="alert">{streakSettingsError||"Bible streak settings are unavailable."}</p>}
      </section> : null}

      {tab === "audit" ? (
        <section className="super-admin-panel">
          <div className="super-admin-panel-heading"><div><h2>Audit log</h2><p>Role and account access actions are written by protected database functions.</p></div></div>
          {auditRows.length ? <div className="super-admin-audit-list">{auditRows.map((row) => <AuditRow key={row.id} entry={row} profiles={profiles} />)}</div> : <p className="super-admin-empty">No administrative actions have been recorded.</p>}
        </section>
      ) : null}

      {pendingAction ? <div className="super-admin-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPendingAction(null); }}>
        <section className="super-admin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="super-admin-confirm-title" aria-describedby="super-admin-confirm-copy">
          <p className="super-admin-eyebrow">Confirm access change</p>
          <h2 id="super-admin-confirm-title">{pendingAction.type === "role" ? pendingAction.grantAdmin ? "Grant administrator access?" : "Revoke administrator access?" : pendingAction.active ? "Restore this account?" : "Pause this account?"}</h2>
          <p id="super-admin-confirm-copy">{pendingAction.member.full_name || pendingAction.member.email} {pendingAction.type === "role" ? pendingAction.grantAdmin ? "will be able to manage the community." : "will lose administrator permissions." : pendingAction.active ? "will be able to sign in again." : "will no longer be able to sign in."} This action will be recorded in the audit log.</p>
          <div className="super-admin-dialog-actions"><button type="button" className="ghost-button" disabled={busy} onClick={() => setPendingAction(null)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={() => void confirmAction()}>{busy ? "Saving…" : "Confirm change"}</button></div>
        </section>
      </div> : null}

      {deletionDialog ? <div className="super-admin-dialog-backdrop super-admin-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletionBusy) setDeletionDialog(null); }}>
        <section className="super-admin-dialog super-admin-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="super-admin-delete-title" aria-describedby="super-admin-delete-copy">
          <p className="super-admin-eyebrow">Permanent account deletion</p>
          <h2 id="super-admin-delete-title">{deletionDialog.members.length === 1 ? "Delete this member permanently?" : `Delete ${deletionDialog.members.length} members permanently?`}</h2>
          <p id="super-admin-delete-copy">The selected accounts, their membership records, and member-owned data will be removed. Shared church content will be retained. This cannot be undone.</p>
          <div className="super-admin-delete-targets">
            {deletionDialog.members.map((member) => <div className="super-admin-delete-target" key={member.id}>
              <SuperAdminIdentity member={member} />
              <span><strong>{member.full_name || "Unnamed member"}</strong><small>{member.email}</small></span>
            </div>)}
          </div>
          <div className="super-admin-delete-actions">
            <button type="button" className="ghost-button" disabled={deletionBusy} onClick={() => setDeletionDialog(null)}>Cancel</button>
            <button type="button" className="ghost-button danger" disabled={deletionBusy} onClick={() => void deleteSelectedMembers()}>{deletionBusy ? "Deleting…" : "Permanently delete"}</button>
          </div>
        </section>
      </div> : null}

      {deletionFeedback ? <div className="super-admin-dialog-backdrop super-admin-delete-feedback-backdrop">
        <section
          className={`super-admin-dialog super-admin-delete-feedback ${deletionFeedback.type}`}
          role={deletionFeedback.type === "error" ? "alertdialog" : "dialog"}
          aria-modal="true"
          aria-labelledby="super-admin-delete-feedback-title"
          aria-describedby="super-admin-delete-feedback-copy"
        >
          <span className="super-admin-delete-feedback-icon" aria-hidden="true">
            {deletionFeedback.type === "success" ? <svg viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="26" />
              <path d="m17 28 7.3 7.3L40 19.8" />
            </svg> : <svg viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="26" />
              <path d="m20 20 16 16M36 20 20 36" />
            </svg>}
          </span>
          <p className="super-admin-eyebrow">{deletionFeedback.type === "success" ? "Member directory updated" : "Deletion could not be completed"}</p>
          <h2 id="super-admin-delete-feedback-title">{deletionFeedback.type === "error"
            ? "No deletion confirmed"
            : deletionFeedback.deletedCount === 0
              ? "Members already removed"
              : deletionFeedback.deletedCount === 1
                ? "Member deleted successfully"
                : `${deletionFeedback.deletedCount} members deleted successfully`}</h2>
          <p id="super-admin-delete-feedback-copy">{deletionFeedback.type === "error"
            ? deletionFeedback.message
            : deletionFeedback.deletedCount
              ? "The selected member account and its member-specific records have been permanently deleted."
              : "The selected account was already absent, so no additional records were deleted."}</p>
          {deletionFeedback.type === "success" && deletionFeedback.alreadyMissingCount ? <p className="super-admin-delete-cleanup-note">{deletionFeedback.alreadyMissingCount} selected account{deletionFeedback.alreadyMissingCount === 1 ? " was" : "s were"} already absent.</p> : null}
          {deletionFeedback.type === "success" && deletionFeedback.storageCleanupPending ? <div className="super-admin-delete-cleanup-note" role="status">
            {deletionFeedback.storageCleanupPendingCount === null
              ? "Some uploaded files remain queued because cleanup could not be verified. Retry cleanup now or it will be retried during a later deletion."
              : `${deletionFeedback.storageCleanupPendingCount} uploaded file${deletionFeedback.storageCleanupPendingCount === 1 ? "" : "s"} remain queued. Retry cleanup now or it will be retried during a later deletion.`}
            {deletionFeedback.storageCleanupWarnings.map((warning) => <small key={warning}>{warning}</small>)}
          </div> : null}
          <div className="super-admin-delete-feedback-actions">
            {deletionFeedback.type === "success" && deletionFeedback.storageCleanupPending ? <button type="button" className="secondary-button" disabled={deletionBusy} onClick={() => void retryPendingStorageCleanup()}>{deletionBusy ? "Retrying cleanup…" : "Retry file cleanup"}</button> : null}
            <button type="button" className={deletionFeedback.type === "error" ? "primary-button" : "super-admin-delete-ok"} disabled={deletionBusy} onClick={() => void acknowledgeDeletionFeedback()}>{deletionBusy && deletionFeedback.type === "success" ? "Please wait…" : "OK"}</button>
          </div>
        </section>
      </div> : null}
    </section>
  );
}

function AuditRow({ entry, profiles }) {
  const actor = profiles.find((member) => member.id === entry.actor_id);
  const target = profiles.find((member) => member.id === entry.target_user_id);
  return <article className="super-admin-audit-row">
    <span className="super-admin-audit-mark" aria-hidden="true" />
    <div><strong>{auditLabels[entry.action] || "Administrative action"}</strong><p>{actor?.full_name || (entry.actor_id ? "Authorized administrator" : "Database owner")}{target ? ` · ${target.full_name || target.email}` : entry.metadata?.member_name || entry.metadata?.member_email ? ` · ${entry.metadata.member_name || entry.metadata.member_email}` : ""}</p></div>
    <time dateTime={entry.created_at}>{formatAuditTime(entry.created_at)}</time>
  </article>;
}
