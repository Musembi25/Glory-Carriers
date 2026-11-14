import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { BrandLogo } from "./BrandLogo";
import wowBackground from "../../wow.png";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: ""
};

const EMAIL_COOLDOWN_KEY = "glory-carriers-email-cooldown-until";
const THEME_KEY = "glory-carriers-theme";

function getStoredCooldown() {
  if (typeof window === "undefined") {
    return 0;
  }

  const storedValue = window.localStorage.getItem(EMAIL_COOLDOWN_KEY);
  return storedValue ? Number(storedValue) : 0;
}

function formatCountdown(seconds) {
  if (seconds <= 0) {
    return "";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${remainingSeconds}s`;
}

function passwordStrength(password) {
  if (!password) return { score: 0, label: "Add a password" };
  const score = [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ].filter(Boolean).length;
  return {
    score: Math.min(4, score),
    label: score <= 1 ? "Needs strengthening" : score <= 2 ? "Fair" : score <= 3 ? "Good" : "Strong"
  };
}

export function AuthScreen() {
  const {
    signIn,
    signUp,
    signOut,
    setAuthEntryPending,
    sendPasswordResetEmail,
    updatePassword,
    isRecoveryMode,
    clearRecoveryMode
  } = useAuth();
  const [selectedAccess, setSelectedAccess] = useState(null);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(getStoredCooldown);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const storedTheme = window.localStorage.getItem(THEME_KEY);

    if (storedTheme === "dark" || storedTheme === "light") {
      return storedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [emailSent, setEmailSent] = useState(null);

  const themeLabel = useMemo(() => (theme === "dark" ? "Dark" : "Light"), [theme]);

  useEffect(() => {
    if (emailCooldownUntil <= Date.now()) {
      if (emailCooldownUntil && typeof window !== "undefined") {
        window.localStorage.removeItem(EMAIL_COOLDOWN_KEY);
      }
      return undefined;
    }

    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [emailCooldownUntil]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = theme;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (emailCooldownUntil <= currentTime && emailCooldownUntil) {
      setEmailCooldownUntil(0);

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(EMAIL_COOLDOWN_KEY);
      }
    }
  }, [currentTime, emailCooldownUntil]);

  useEffect(() => {
    if (!isRecoveryMode) {
      return;
    }

    setMode("login");
    setMessage("");
    setError("");
    setPasswordUpdated(false);
    setForm((current) => ({
      ...current,
      password: "",
      confirmPassword: ""
    }));
  }, [isRecoveryMode]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function switchMode(nextMode) {
    if (nextMode === "signup") {
      setSelectedAccess(null);
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    }
    setMode(nextMode);
    setMessage("");
    setError("");
    setEmailSent(null);
    setPasswordUpdated(false);
    setShowPassword(false);
    setShowConfirmation(false);
  }

  function chooseAccess(nextAccess) {
    setSelectedAccess(nextAccess);
    setMode("login");
    setMessage("");
    setError("");
    setEmailSent(null);
    const nextHash = nextAccess === "super-admin" ? "#super-admin" : nextAccess === "admin" ? "#admin-login" : "";
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${nextHash}`);
  }

  function backToAccessOptions() {
    setSelectedAccess(null);
    setMode("login");
    setMessage("");
    setError("");
    setEmailSent(null);
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }

  function startEmailCooldown(seconds = 90) {
    const nextTimestamp = Date.now() + seconds * 1000;

    setEmailCooldownUntil(nextTimestamp);
    setCurrentTime(Date.now());

    if (typeof window !== "undefined") {
      window.localStorage.setItem(EMAIL_COOLDOWN_KEY, String(nextTimestamp));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      if (isRecoveryMode) {
        if (form.password.length < 6) {
          throw new Error("Use a password with at least 6 characters.");
        }

        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        await updatePassword(form.password);
        setPasswordUpdated(true);
        setMessage("Password updated successfully. Continue back into your workspace.");
        return;
      }

      if (mode === "login") {
        setAuthEntryPending(true);
        try {
          await signIn(form.email, form.password);
          const profileResult = await supabase.rpc("ensure_current_user_profile");
          if (profileResult.error) {
            try { await signOut(); } catch {}
            throw new Error("We couldn't verify your account permissions. Please try again shortly.");
          }

          const roleResult = await supabase.rpc("current_user_role");
          if (roleResult.error) {
            try { await signOut(); } catch {}
            throw new Error("We couldn't verify your account permissions. Please try again shortly.");
          }

          const activeResult = await supabase.rpc("is_active_user");
          if (activeResult.error) {
            try { await signOut(); } catch {}
            throw new Error("We couldn't verify your account permissions. Please try again shortly.");
          }

          const expectedRole = selectedAccess === "member" ? "user" : "admin";
          let permissionGranted = false;
          if (activeResult.data !== true) {
            permissionGranted = roleResult.data === "user" || roleResult.data === "admin";
          } else if (selectedAccess === "member") {
            permissionGranted = roleResult.data === expectedRole;
          } else {
            const accessCheck = await supabase.rpc(selectedAccess === "super-admin" ? "is_super_admin" : "is_admin");
            if (accessCheck.error) {
              try { await signOut(); } catch {}
              throw new Error("We couldn't verify your account permissions. Please try again shortly.");
            }
            permissionGranted = roleResult.data === expectedRole && accessCheck.data === true;
          }

          const isAuthorized = permissionGranted;
          if (!isAuthorized) {
            try { await signOut(); } catch {}
            throw new Error(selectedAccess === "super-admin"
              ? "This account is not authorized for Super Admin access. Please choose the correct login or contact an administrator."
              : selectedAccess === "admin"
                ? "This account does not have administrator access. Please choose Member Login or contact an administrator."
                : "This account is assigned to a different login type. Please choose its authorized login option.");
          }
          const nextHash = selectedAccess === "super-admin" ? "#super-admin" : selectedAccess === "admin" ? "#dashboard" : "";
          window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${nextHash}`);
        } finally {
          setAuthEntryPending(false);
        }
      } else if (mode === "signup") {
        if (!form.fullName.trim()) {
          throw new Error("Enter your full name to create your member account.");
        }
        if (form.password !== form.confirmPassword) {
          throw new Error("Your passwords do not match. Please check and try again.");
        }
        const data = await signUp(form.email, form.password, form.fullName.trim());

        if (!data.session) {
          startEmailCooldown();
          setEmailSent({ kind: "signup", email: form.email });
          setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
          return;
        } else {
          setMessage("Account created successfully. You can start planning now.");
        }
      } else {
        await sendPasswordResetEmail(form.email);
        startEmailCooldown();
        setEmailSent({ kind: "reset", email: form.email });
      }

      setPasswordUpdated(false);
    } catch (submitError) {
      setError(submitError.message);

      if (submitError.message.toLowerCase().includes("throttled")) {
        startEmailCooldown(120);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const cooldownSeconds = Math.max(
    0,
    Math.ceil((emailCooldownUntil - currentTime) / 1000)
  );
  const isForgotPasswordMode = mode === "forgot";
  const isAccessChooser = !isRecoveryMode && !emailSent && mode === "login" && selectedAccess === null;
  const passwordType = showPassword ? "text" : "password";
  const confirmationType = showConfirmation ? "text" : "password";
  return (
    <main
      className="auth-layout polished-auth-layout premium-auth-layout"
      data-auth-mode={mode === "signup" ? "signup" : "login"}
      data-auth-access={selectedAccess}
      style={{
        "--auth-backdrop-image": `url("${wowBackground}")`
      }}
    >
      <header className="auth-chrome">
        <BrandLogo compact />
        <div className="auth-theme-control">
          <span>{themeLabel} theme</span>
          <button
            type="button"
            className="auth-theme-button"
            data-theme-mode={theme}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </header>

      <section className="hero-panel auth-hero-panel auth-showcase-panel premium-auth-showcase">
        <div className="hero-copy premium-auth-copy">
          <p className="eyebrow">City on a Hill</p>
          <h1>
            Faith grows
            <br />
            in community.
          </h1>
          <p className="muted-text">
            A shared place for fellowship, Scripture, and serving one another.
          </p>
        </div>
      </section>

      {isAccessChooser ? (
      <section className="auth-entry-stage" aria-labelledby="auth-entry-title">
        <div className="auth-entry-heading">
          <p className="eyebrow">Welcome</p>
          <h2 id="auth-entry-title">Come in and make yourself at home.</h2>
          <p>Choose your secure sign-in to continue with City on a Hill.</p>
        </div>
        <div className="auth-entry-options" role="group" aria-label="Choose a login type">
          {[
            { id: "member", title: "Member", detail: "Community access", icon: "member" },
            { id: "admin", title: "Admin", detail: "Group administration", icon: "admin" },
            { id: "super-admin", title: "Super Admin", detail: "System oversight", icon: "super-admin" }
          ].map((option) => (
            <button key={option.id} type="button" className={`auth-entry-option auth-entry-option--${option.id}`} onClick={() => chooseAccess(option.id)} aria-label={`${option.title} login`}>
              <span className="auth-entry-icon"><AuthEntryIcon name={option.icon}/></span>
              <span className="auth-entry-copy"><strong>{option.title}</strong><small>{option.detail}</small></span>
              <span className="auth-entry-arrow" aria-hidden="true"><AuthArrowIcon /></span>
            </button>
          ))}
        </div>
        <p className="auth-entry-signup"><span>New to the community?</span> <button type="button" className="text-button" onClick={() => switchMode("signup")}>Create a Member Account</button></p>
      </section>
      ) : (
      <section className="floating-card auth-card polished-auth-card auth-card-elevated premium-auth-card">
        <span className="auth-glass-sheen" aria-hidden="true" />

        {!isRecoveryMode && mode === "login" ? <div className="auth-selected-context">
          <button type="button" className="auth-back-button" onClick={backToAccessOptions} aria-label="Back to login options"><AuthBackIcon /> <span>Back</span></button>
          <span className={`auth-selected-icon auth-selected-icon--${selectedAccess}`}><AuthEntryIcon name={selectedAccess === "super-admin" ? "super-admin" : selectedAccess}/></span>
          <strong>{selectedAccess === "super-admin" ? "Super Admin Login" : selectedAccess === "admin" ? "Admin Login" : "Member Login"}</strong>
        </div> : mode === "signup" ? <button type="button" className="auth-back-button auth-signup-back" onClick={backToAccessOptions}><AuthBackIcon /> <span>Back to Login</span></button> : null}

        {emailSent ? (
          <section className="auth-email-confirmation" aria-live="polite">
            <span className="auth-email-confirmation-icon" aria-hidden="true"><AuthEntryIcon name="mail"/></span>
            <p className="eyebrow">Check your email</p>
            <h2>{emailSent.kind === "signup" ? "Check your email to finish joining." : "A secure link is on its way."}</h2>
            <p>We sent instructions to <strong>{emailSent.email}</strong>. Open the message to continue. If it doesn’t arrive, check your spam folder.</p>
            <button type="button" className="primary-button auth-submit-button" onClick={() => { setEmailSent(null); switchMode("login"); }}>Return to sign in</button>
          </section>
        ) : null}

        {!emailSent ? <div className="auth-heading auth-heading-spacious" key={isRecoveryMode ? "recovery" : mode}>
          <p className="eyebrow">
            {isRecoveryMode
              ? "Password Recovery"
              : selectedAccess === "super-admin" && mode === "login"
                ? "Super Admin Secure Access"
                : selectedAccess === "admin" && mode === "login"
                  ? "Administrator Access"
              : mode === "signup"
                ? "New Member"
                : isForgotPasswordMode
                  ? "Password Help"
                  : "Secure Access"}
          </p>
          <h2>
            {isRecoveryMode
              ? "Choose a new password"
              : selectedAccess === "super-admin" && mode === "login"
                ? "Sign in to Super Admin"
                : selectedAccess === "admin" && mode === "login"
                  ? "Administrator sign in"
              : mode === "signup"
                ? "Create your account"
                : isForgotPasswordMode
                  ? "Reset your password"
                  : "Welcome back"}
          </h2>
          <p className="auth-heading-support">
            {isRecoveryMode
              ? "Set a secure password to get back into your community."
              : selectedAccess === "super-admin" && mode === "login"
                ? "Use your authorized account. Super Admin access is verified securely after sign-in."
                : selectedAccess === "admin" && mode === "login"
                  ? "Use your existing administrator account. Permissions are verified securely after sign-in."
              : mode === "signup"
                ? "Create a Member account to join City on a Hill."
                : isForgotPasswordMode
                  ? "We’ll help you get safely back into your account."
                  : "Continue your journey with City on a Hill."}
          </p>
        </div> : null}

        {!emailSent && message ? <div className="banner success">{message}</div> : null}
        {!emailSent && error ? <div className="banner error" role="alert">{error}</div> : null}

        {!emailSent ? <form className={`stack-form auth-form auth-form--${mode}`} onSubmit={handleSubmit}>
          {!isRecoveryMode && mode === "signup" ? (
            <label className="field auth-field">
              <span>Full name</span>
              <div className="auth-input-shell">
                <FieldGlyph name="person" />
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
            </label>
          ) : null}

          {!isRecoveryMode ? (
            <label className="field auth-field">
              <span>Email address</span>
              <div className="auth-input-shell">
                <FieldGlyph name="mail" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>
          ) : null}

          {isRecoveryMode ? (
            <>
              <label className="field auth-field">
                <span>New password</span>
                <div className="password-field auth-input-shell">
                  <FieldGlyph name="lock" />
                  <input
                    type={passwordType}
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <PasswordToggle visible={showPassword} onClick={() => setShowPassword((value) => !value)} />
                </div>
              </label>

              <label className="field auth-field">
                <span>Confirm new password</span>
                <div className="password-field auth-input-shell">
                  <FieldGlyph name="lock" />
                  <input
                    type={confirmationType}
                    value={form.confirmPassword}
                    onChange={(event) => updateField("confirmPassword", event.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <PasswordToggle
                    visible={showConfirmation}
                    onClick={() => setShowConfirmation((value) => !value)}
                  />
                </div>
              </label>
            </>
          ) : !isForgotPasswordMode ? (
            <label className="field auth-field">
              <span>Password</span>
              <div className="password-field auth-input-shell">
                <FieldGlyph name="lock" />
                <input
                  type={passwordType}
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
                <PasswordToggle visible={showPassword} onClick={() => setShowPassword((value) => !value)} />
              </div>
            </label>
          ) : null}

          {mode === "signup" && form.password ? <div className={`auth-password-strength strength-${passwordStrength(form.password).score}`} aria-live="polite">
            <div><span>Password strength</span><strong>{passwordStrength(form.password).label}</strong></div>
            <span className="auth-password-strength-track"><span style={{ width: `${passwordStrength(form.password).score * 25}%` }}/></span>
            <small>Use a longer password with a mix of letters, numbers, and symbols.</small>
          </div> : null}

          {!isRecoveryMode ? (
            <div className="auth-utility-row">
              {isForgotPasswordMode ? (
                <button type="button" className="text-button" onClick={() => switchMode("login")}>
                  Back to login
                </button>
              ) : mode === "signup" ? (
                <button type="button" className="text-button" onClick={() => switchMode("login")}>
                  Already have an account? Log in
                </button>
              ) : (
                <button type="button" className="text-button" onClick={() => switchMode("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>
          ) : null}

          {mode === "signup" ? <label className="field auth-field">
            <span>Confirm password</span>
            <div className="password-field auth-input-shell">
              <FieldGlyph name="lock" />
              <input type={confirmationType} value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} placeholder="Enter your password again" autoComplete="new-password" minLength={6} required />
              <PasswordToggle visible={showConfirmation} onClick={() => setShowConfirmation((value) => !value)} />
            </div>
          </label> : null}

          <button
            type="submit"
            className={submitting ? "primary-button auth-submit-button is-loading" : "primary-button auth-submit-button"}
            disabled={submitting || (isForgotPasswordMode && cooldownSeconds > 0)}
          >
            {submitting ? <span className="auth-loading-spinner" aria-hidden="true" /> : null}
            {submitting
              ? "Please wait..."
              : isRecoveryMode
                ? "Update password"
                : mode === "login"
                  ? selectedAccess === "member" ? "Log in securely" : "Verify & continue"
                  : mode === "signup"
                    ? "Create account"
                    : cooldownSeconds > 0
                      ? `Try again in ${formatCountdown(cooldownSeconds)}`
                      : "Send reset link"}
          </button>
        </form> : null}

        {isRecoveryMode && passwordUpdated ? (
          <div className="auth-support-row">
            <button type="button" className="secondary-button" onClick={() => clearRecoveryMode()}>
              Continue to workspace
            </button>
          </div>
        ) : null}
      </section>
      )}
    </main>
  );
}

function FieldGlyph({ name }) {
  return (
    <span className="auth-field-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        {name === "mail" ? (
          <>
            <rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2" />
            <path d="M4 7.2 12 13l8-5.8" />
          </>
        ) : name === "person" ? (
          <>
            <circle cx="12" cy="8.2" r="3.1" />
            <path d="M5.2 19.2c.8-3.4 3.4-5.1 6.8-5.1s6 1.7 6.8 5.1" />
          </>
        ) : (
          <>
            <rect x="6.2" y="10.4" width="11.6" height="8.4" rx="1.6" />
            <path d="M8.4 10.4V8.3a3.6 3.6 0 0 1 7.2 0v2.1" />
          </>
        )}
      </svg>
    </span>
  );
}

function AuthEntryIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "member" ? <><circle cx="12" cy="8" r="3.3"/><path d="M5 20c.6-3.7 3-5.6 7-5.6s6.4 1.9 7 5.6"/></> : null}
    {name === "admin" ? <><path d="M12 3 19 6v5.2c0 4.5-2.8 7.6-7 9.8-4.2-2.2-7-5.3-7-9.8V6l7-3Z"/><path d="m9 11.8 2 2 4-4"/></> : null}
    {name === "super-admin" ? <><path d="m4 7 4.2 4 3.8-6 3.8 6L20 7l-1.4 11H5.4L4 7Z"/><path d="M6 21h12"/></> : null}
    {name === "mail" ? <><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></> : null}
  </svg>;
}

function AuthArrowIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 10h12M10.5 5l5 5-5 5" /></svg>;
}

function AuthBackIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 10H4m5 5-5-5 5-5" /></svg>;
}

function PasswordToggle({ visible, onClick }) {
  return (
    <button
      type="button"
      className="password-toggle"
      onClick={onClick}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {visible ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a3 3 0 0 0 4.24 4.24" />
            <path d="M9.9 5.1A10.7 10.7 0 0 1 12 4.9c5.2 0 8.8 4.1 9.7 6.5a11.4 11.4 0 0 1-3.1 4.3" />
            <path d="M6.2 6.2A11.5 11.5 0 0 0 2.3 11.4C3.2 13.8 6.8 17.9 12 17.9c.8 0 1.6-.1 2.3-.3" />
          </>
        ) : (
          <>
            <path d="M2.3 12S5.8 5.8 12 5.8 21.7 12 21.7 12 18.2 18.2 12 18.2 2.3 12 2.3 12Z" />
            <circle cx="12" cy="12" r="2.8" />
          </>
        )}
      </svg>
    </button>
  );
}

function ThemeIcon({ theme }) {
  return theme === "dark" ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
    </svg>
  );
}
