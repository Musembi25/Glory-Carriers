export function SetupScreen() {
  return (
    <main className="fullscreen-shell">
      <div className="floating-card auth-card">
        <p className="eyebrow">Setup Required</p>
        <h1>Connect Glory Carriers the easy way</h1>
        <p className="muted-text">
          Add your project credentials to <code>.env</code> so authentication,
          cloud storage, and realtime collaboration can turn on.
        </p>
        <div className="setup-list">
          <div className="setup-item">
            <span>1</span>
            <p>Copy <code>.env.example</code> to <code>.env</code>.</p>
          </div>
          <div className="setup-item">
            <span>2</span>
            <p>
              Set <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          </div>
          <div className="setup-item">
            <span>3</span>
            <p>
              In Supabase Auth settings, turn off <code>Confirm email</code> while
              testing so signup works without waiting for inbox emails.
            </p>
          </div>
          <div className="setup-item">
            <span>4</span>
            <p>Run the SQL in <code>supabase/schema.sql</code>.</p>
          </div>
        </div>
        <div className="auth-note-card setup-note-card">
          <strong>Fresh start option</strong>
          <p>
            If your current Supabase project feels stuck, run <code>supabase/fresh-start.sql</code>,
            then rerun <code>supabase/schema.sql</code>. After that, the first signup becomes admin.
          </p>
        </div>
      </div>
    </main>
  );
}
