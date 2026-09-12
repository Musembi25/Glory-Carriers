import {
  DEPARTMENTS,
  DISCIPLESHIP_OPTIONS,
  EDITABLE_MEMBERSHIP_STATUSES,
  MONTHS,
  getInitials,
  toggleDepartmentSelection
} from "../../lib/cellGroupManagement";

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
    case "camera":
      return (
        <svg {...props}>
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case "save":
      return (
        <svg {...props}>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <path d="M17 21v-8H7v8M7 3v5h8" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
}

function PhotoUploader({ form, setForm, errors, photoInputRef }) {
  const hasPhoto = form.avatar_preview && !form.remove_avatar;

  return (
    <label className="cgm-field">
      <span>Profile Photo <span className="optional">(Optional)</span></span>
      <div className="cgm-photo-upload">
        {hasPhoto ? (
          <img src={form.avatar_preview} alt="" className="cgm-photo-preview" />
        ) : (
          <div className="cgm-avatar fallback large cgm-no-photo">
            {form.full_name ? getInitials(form.full_name) : <Icon name="camera" size={24} />}
          </div>
        )}
        <div className="cgm-photo-actions">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!file.type.startsWith("image/")) return;
              if (file.size > 5 * 1024 * 1024) return;
              setForm({
                ...form,
                avatar_file: file,
                avatar_preview: URL.createObjectURL(file),
                remove_avatar: false
              });
            }}
          />
          <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => photoInputRef.current?.click()}>
            {hasPhoto ? "Replace Photo" : "Upload Photo"}
          </button>
          {hasPhoto ? (
            <button
              type="button"
              className="cgm-btn cgm-btn-ghost"
              onClick={() =>
                setForm({
                  ...form,
                  avatar_file: null,
                  avatar_preview: "",
                  remove_avatar: true
                })
              }
            >
              Remove Photo
            </button>
          ) : null}
          {!hasPhoto ? <span className="cgm-photo-hint">No Photo</span> : null}
        </div>
      </div>
      {errors.avatar ? <span className="cgm-field-error">{errors.avatar}</span> : null}
    </label>
  );
}

function DiscipleshipYesNo({ value, onChange }) {
  return (
    <div className="cgm-radio-group" role="radiogroup" aria-label="Completed Discipleship Class?">
      <span className="cgm-field-label">Completed Discipleship Class?</span>
      <div className="cgm-radio-options">
        {DISCIPLESHIP_OPTIONS.map((opt) => (
          <label key={opt.value} className={`cgm-radio-option${value === opt.value ? " selected" : ""}`}>
            <input
              type="radio"
              name="discipleship_status"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function MemberFormFields({
  form,
  setForm,
  errors,
  mode,
  userSearch,
  setUserSearch,
  searchableProfiles,
  onSelectProfile,
  photoInputRef
}) {
  const isAdd = mode === "add";
  const isEdit = mode === "edit";

  function toggleDepartment(dept) {
    const next = toggleDepartmentSelection(form.departments, dept);
    setForm({ ...form, ...next, custom_department: dept === "None" ? "" : form.custom_department });
  }

  return (
    <>
      {isAdd ? (
        <div className="cgm-form-section">
          <h4>Member Type</h4>
          <div className="cgm-dept-grid">
            {["existing", "invite"].map((memberMode) => (
              <button
                key={memberMode}
                type="button"
                className={`cgm-dept-chip${form.mode === memberMode ? " selected" : ""}`}
                onClick={() => setForm({ ...form, mode: memberMode })}
              >
                {memberMode === "existing" ? "Existing member" : "Invite by email"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isAdd && form.mode === "existing" ? (
        <div className="cgm-form-section">
          <h4>Find Member</h4>
          <label className={`cgm-field${errors.user_id ? " has-error" : ""}`}>
            <span>Search registered users</span>
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name or email..."
            />
            {errors.user_id ? <span className="cgm-field-error">{errors.user_id}</span> : null}
          </label>
          {searchableProfiles?.length ? (
            <div className="cgm-search-results">
              {searchableProfiles.map((p) => (
                <div
                  key={p.id}
                  className={`cgm-search-result${form.user_id === p.id ? " selected" : ""}`}
                  onClick={() => onSelectProfile(p)}
                >
                  <div className={`cgm-avatar fallback${p.avatar_url ? "" : ""}`}>
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="cgm-avatar" /> : getInitials(p.full_name || p.email)}
                  </div>
                  <div>
                    <div className="cgm-member-name">{p.full_name || "Unnamed"}</div>
                    <div className="cgm-member-email">{p.email}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : userSearch?.trim() ? (
            <p className="cgm-member-email">No matching users found.</p>
          ) : null}
        </div>
      ) : null}

      <div className="cgm-form-section">
        <h4>Profile</h4>
        <PhotoUploader form={form} setForm={setForm} errors={errors} photoInputRef={photoInputRef} />
        <label className={`cgm-field${errors.full_name ? " has-error" : ""}`}>
          <span>Full Name</span>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Member's full name"
            required
          />
          {errors.full_name ? <span className="cgm-field-error">{errors.full_name}</span> : null}
        </label>
        {isAdd && form.mode === "invite" ? (
          <label className={`cgm-field${errors.email ? " has-error" : ""}`}>
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            {errors.email ? <span className="cgm-field-error">{errors.email}</span> : null}
          </label>
        ) : null}
        <label className={`cgm-field${errors.date_of_birth ? " has-error" : ""}`}>
          <span>Date of Birth <span className="optional">(Optional)</span></span>
          <div className="cgm-inline-field-actions">
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              max={new Date().toISOString().split("T")[0]}
            />
            {form.date_of_birth ? (
              <button type="button" className="cgm-btn cgm-btn-ghost" onClick={() => setForm({ ...form, date_of_birth: "" })}>
                Clear
              </button>
            ) : null}
          </div>
          {errors.date_of_birth ? <span className="cgm-field-error">{errors.date_of_birth}</span> : null}
        </label>
      </div>

      <div className="cgm-form-section">
        <h4>Ministry</h4>
        <label className="cgm-field">
          <span>Department(s) They Are Serving</span>
          <div className="cgm-dept-grid">
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept}
                type="button"
                className={`cgm-dept-chip${form.departments.includes(dept) ? " selected" : ""}`}
                onClick={() => toggleDepartment(dept)}
              >
                {dept}
              </button>
            ))}
          </div>
        </label>
        {form.departments.includes("Other") ? (
          <label className={`cgm-field${errors.custom_department ? " has-error" : ""}`}>
            <span>Specify Department</span>
            <input
              type="text"
              value={form.custom_department}
              onChange={(e) => setForm({ ...form, custom_department: e.target.value })}
              placeholder="e.g. Sound Engineering, Security..."
            />
            {errors.custom_department ? <span className="cgm-field-error">{errors.custom_department}</span> : null}
          </label>
        ) : null}
      </div>

      <div className="cgm-form-section">
        <h4>Personal</h4>
        <label className="cgm-field">
          <span>Favorite Food <span className="optional">(Optional)</span></span>
          <input
            type="text"
            value={form.favorite_food}
            onChange={(e) => setForm({ ...form, favorite_food: e.target.value })}
            placeholder="e.g. Pilau, chapati, pizza..."
          />
        </label>
      </div>

      <div className="cgm-form-section">
        <h4>Cell Group</h4>
        <div className="cgm-form-grid">
          <label className={`cgm-field${errors.joined_month ? " has-error" : ""}`}>
            <span>Joined Month <span className="optional">(Optional)</span></span>
            <select
              value={form.joined_month || ""}
              onChange={(e) => setForm({ ...form, joined_month: e.target.value ? Number(e.target.value) : "" })}
            >
              <option value="">Not specified</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className={`cgm-field${errors.joined_year ? " has-error" : ""}`}>
            <span>Joined Year <span className="optional">(Optional)</span></span>
            <input
              type="number"
              min="1900"
              max="2100"
              value={form.joined_year || ""}
              onChange={(e) => setForm({ ...form, joined_year: e.target.value ? Number(e.target.value) : "" })}
              placeholder="e.g. 2026"
            />
          </label>
          <label className={`cgm-field full${errors.joined_date ? " has-error" : ""}`}>
            <span>Exact Joined Date <span className="optional">(Optional)</span></span>
            <div className="cgm-inline-field-actions">
              <input type="date" value={form.joined_date} onChange={(e) => setForm({ ...form, joined_date: e.target.value })} />
              {form.joined_date ? (
                <button type="button" className="cgm-btn cgm-btn-ghost" onClick={() => setForm({ ...form, joined_date: "" })}>
                  Clear
                </button>
              ) : null}
            </div>
          </label>
        </div>
      </div>

      <div className="cgm-form-section">
        <h4>Discipleship</h4>
        <DiscipleshipYesNo
          value={form.discipleship_status}
          onChange={(value) => setForm({ ...form, discipleship_status: value })}
        />
      </div>

      <div className="cgm-form-section">
        <h4>Additional Information</h4>
        <div className="cgm-form-grid">
          <label className={`cgm-field${errors.phone ? " has-error" : ""}`}>
            <span>Phone <span className="optional">(Optional)</span></span>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254..." />
            {errors.phone ? <span className="cgm-field-error">{errors.phone}</span> : null}
          </label>
          <label className="cgm-field">
            <span>Gender <span className="optional">(Optional)</span></span>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="cgm-field full">
            <span>Short Bio <span className="optional">(Optional)</span></span>
            <textarea rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <div className="cgm-char-count">{form.bio.length}/300</div>
          </label>
          <label className="cgm-field full">
            <span>Notes <span className="optional">(Optional)</span></span>
            <textarea rows={3} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="cgm-char-count">{form.notes.length}/500</div>
          </label>
        </div>
      </div>

      <div className="cgm-form-section">
        <h4>Membership</h4>
        <label className="cgm-field">
          <span>Membership Status</span>
          <select value={form.membership_status} onChange={(e) => setForm({ ...form, membership_status: e.target.value })}>
            {(isEdit ? EDITABLE_MEMBERSHIP_STATUSES : EDITABLE_MEMBERSHIP_STATUSES).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

export function MemberFormSheet({
  title,
  mode,
  form,
  setForm,
  errors,
  submitting,
  onSubmit,
  onCancel,
  userSearch,
  setUserSearch,
  searchableProfiles,
  onSelectProfile,
  photoInputRef,
  submitLabel = "Save Changes"
}) {
  return (
    <div className="cgm-overlay cgm-drawer-overlay cgm-form-overlay" onClick={(e) => e.target === e.currentTarget && onCancel(false)}>
      <div className="cgm-form-sheet" role="dialog" aria-labelledby="member-form-title">
        <div className="cgm-form-sheet-header">
          <div>
            <p className="cgm-form-sheet-eyebrow">{mode === "edit" ? "Edit membership" : "Add to cell group"}</p>
            <h3 id="member-form-title">{title}</h3>
          </div>
          <button type="button" className="cgm-close-btn" onClick={() => onCancel(false)} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <form
          className="cgm-form-sheet-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="cgm-form-sheet-scroll">
            <MemberFormFields
              form={form}
              setForm={setForm}
              errors={errors}
              mode={mode}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              searchableProfiles={searchableProfiles}
              onSelectProfile={onSelectProfile}
              photoInputRef={photoInputRef}
            />
          </div>
          <div className="cgm-form-sheet-footer cgm-sticky-save">
            <p>Your changes are saved when you click the button below.</p>
            <div className="cgm-form-sheet-footer-actions">
              <button type="button" className="cgm-btn cgm-btn-secondary" onClick={() => onCancel(false)} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="cgm-btn cgm-btn-primary cgm-btn-save" disabled={submitting}>
                <Icon name="save" />
                {submitting ? "Saving..." : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
