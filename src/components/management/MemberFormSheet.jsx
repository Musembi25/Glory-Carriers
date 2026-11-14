import { MemberInitials } from "../MemberInitials.jsx";
import {

  DEPARTMENTS,

  DISCIPLESHIP_OPTIONS,

  EDITABLE_MEMBERSHIP_STATUSES,

  MONTHS,


  toggleDepartmentSelection

} from "../../lib/cellGroupManagement";



function ProfileChoiceIdentity({ profile }) {
  return <MemberInitials member={profile} className="cgm-identity fallback" />;
}

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

  onSelectProfile

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

            {["record", "existing", "invite"].map((memberMode) => (

              <button

                key={memberMode}

                type="button"

                className={`cgm-dept-chip${form.mode === memberMode ? " selected" : ""}`}

                onClick={() => setForm({ ...form, mode: memberMode, user_id: memberMode === "existing" ? form.user_id : "" })}

              >

                {memberMode === "record" ? "Record a person" : memberMode === "existing" ? "Link registered account" : "Invite by email"}

              </button>

            ))}

          </div>

        </div>

      ) : null}



      {isEdit ? (

        <div className="cgm-form-section">

          <h4>Application Account</h4>

          {form.user_id ? (

            <p className="cgm-form-section-hint">Linked to a registered account. Account association is managed by an authorized administrator.</p>

          ) : (

            <>

              <p className="cgm-form-section-hint">Optional. Link this record to an existing registered account, or leave it independent.</p>

              <label className="cgm-field">

                <span>Search registered accounts</span>

                <input type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search by name or email..." />

              </label>

              {searchableProfiles?.length ? (

                <div className="cgm-search-results">

                  {searchableProfiles.map((profile) => (

                    <button key={profile.id} type="button" className="cgm-search-result" onClick={() => onSelectProfile(profile)}>

                      <ProfileChoiceIdentity profile={profile} />

                      <span><span className="cgm-member-name">{profile.full_name || "Unnamed"}</span><span className="cgm-member-email">{profile.email}</span></span>

                    </button>

                  ))}

                </div>

              ) : userSearch?.trim() ? <p className="cgm-member-email">No matching accounts found.</p> : null}

            </>

          )}

        </div>

      ) : null}



      {isAdd && form.mode === "existing" ? (

        <div className="cgm-form-section">

          <h4>Find Member</h4>

          <label className={`cgm-field${errors.user_id ? " has-error" : ""}`}>

            <span>Search registered accounts</span>

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

                  <ProfileChoiceIdentity profile={p} />

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

        <label className={`cgm-field${errors.email ? " has-error" : ""}`}>

          <span>{isAdd && form.mode === "invite" ? "Invitation email" : "Email"} <span className={isAdd && form.mode === "invite" ? "required-indicator" : "optional"}>{isAdd && form.mode === "invite" ? "Required" : "Optional"}</span></span>

          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" required={isAdd && form.mode === "invite"} />

          {errors.email ? <span className="cgm-field-error">{errors.email}</span> : null}

        </label>

      </div>

      <div className="cgm-form-section cgm-birthday-form-section">

        <h4>Birthday Information</h4>

        <p className="cgm-form-section-hint">Day and month are required for annual birthday reminders. Birth year is optional.</p>

        <div className="cgm-form-grid">

          <label className={`cgm-field${errors.birth_day ? " has-error" : ""}`}>

            <span>Birth day <span className="required-indicator">Required</span></span>

            <input type="number" inputMode="numeric" min="1" max="31" step="1" value={form.birth_day} onChange={(e) => setForm({ ...form, birth_day: e.target.value ? Number(e.target.value) : "" })} placeholder="Day" required />

            {errors.birth_day ? <span className="cgm-field-error">{errors.birth_day}</span> : null}

          </label>

          <label className={`cgm-field${errors.birth_month ? " has-error" : ""}`}>

            <span>Birth month <span className="required-indicator">Required</span></span>

            <select value={form.birth_month || ""} onChange={(e) => setForm({ ...form, birth_month: e.target.value ? Number(e.target.value) : "" })} required>

              <option value="">Choose month</option>

              {MONTHS.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}

            </select>

            {errors.birth_month ? <span className="cgm-field-error">{errors.birth_month}</span> : null}

          </label>

          <label className={`cgm-field${errors.birth_year ? " has-error" : ""}`}>

            <span>Birth year <span className="optional">(Optional)</span></span>

            <input type="number" inputMode="numeric" min="1900" max={new Date().getFullYear()} step="1" value={form.birth_year || ""} onChange={(e) => setForm({ ...form, birth_year: e.target.value ? Number(e.target.value) : "" })} placeholder="Leave blank if unknown" />

            {errors.birth_year ? <span className="cgm-field-error">{errors.birth_year}</span> : null}

          </label>

        </div>

        <p className="cgm-form-section-hint cgm-leap-day-note">February 29 birthdays are observed on March 1 in non-leap years.</p>

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

            {EDITABLE_MEMBERSHIP_STATUSES.map((s) => (

              <option key={s.value} value={s.value}>{s.label}</option>

            ))}

          </select>

        </label>

        <p className="cgm-form-section-hint">{form.membership_status === "prospective" ? "Their information is recorded; they have not officially joined." : null}{form.membership_status === "pending" ? "Membership is being considered or confirmed." : null}{form.membership_status === "active" ? "They have officially joined the cell group." : null}{form.membership_status === "inactive" ? "They are no longer actively participating." : null}</p>

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


  submitLabel = "Save Changes"

}) {

  return (

    <div className="cgm-overlay cgm-drawer-overlay cgm-form-overlay">

      <div className="cgm-form-sheet cgm-member-registration-shell" role="region" aria-labelledby="member-form-title">

        <div className="cgm-form-sheet-header">

          <div>

            <p className="cgm-form-sheet-eyebrow">{mode === "edit" ? "Member records" : "Member records · New person"}</p>

            <h1 id="member-form-title">{title}</h1>

            <p className="cgm-member-registration-description">{mode === "edit" ? "Update this member’s information. Existing details stay in place unless you change them." : "Record someone for the cell group before they officially join. No application account is needed."}</p>

          </div>

          <button type="button" className="cgm-close-btn cgm-form-back-button" onClick={() => onCancel(false)} aria-label="Back to members">

            <Icon name="x" /> <span>Back</span>

          </button>

        </div>

        <form

          className="cgm-form-sheet-form"

          onSubmit={(e) => {

            e.preventDefault();

            onSubmit();

          }}

        >

          <div className="cgm-form-sheet-scroll cgm-member-registration-content">

            <MemberFormFields

              form={form}

              setForm={setForm}

              errors={errors}

              mode={mode}

              userSearch={userSearch}

              setUserSearch={setUserSearch}

              searchableProfiles={searchableProfiles}

              onSelectProfile={onSelectProfile}


            />

          </div>

          <div className="cgm-form-sheet-footer cgm-member-registration-footer">

            <p>Review the required birthday day and month before saving.</p>

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
