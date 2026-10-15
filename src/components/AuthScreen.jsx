import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { BrandLogo } from "./BrandLogo";

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

export function AuthScreen() {
  const {
    signIn,
    signUp,
    sendPasswordResetEmail,
    updatePassword,
    isRecoveryMode,
    clearRecoveryMode
  } = useAuth();
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
    setMode(nextMode);
    setMessage("");
    setError("");
    setPasswordUpdated(false);
    setShowPassword(false);
    setShowConfirmation(false);
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
        await signIn(form.email, form.password);
      } else if (mode === "signup") {
        const data = await signUp(form.email, form.password, form.fullName);

        if (!data.session) {
          startEmailCooldown();
          setMessage(
            "Account created. Check your inbox if email confirmation is enabled. For smoother testing, disable Confirm email or connect custom SMTP in Supabase."
          );
        } else {
          setMessage("Account created successfully. You can start planning now.");
        }
      } else {
        await sendPasswordResetEmail(form.email);
        startEmailCooldown();
        setMessage(
          "Password reset link sent. Open the email, then return here to set your new password."
        );
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
  const passwordType = showPassword ? "text" : "password";
  const confirmationType = showConfirmation ? "text" : "password";
  const switcherMode = mode === "signup" ? "signup" : "login";

  return (
    <main
      className="auth-layout polished-auth-layout premium-auth-layout"
      data-auth-mode={mode === "signup" ? "signup" : "login"}
    >
      <div className="auth-atmosphere" aria-hidden="true">
        <span className="auth-orb auth-orb-one" />
        <span className="auth-orb auth-orb-two" />
        <span className="auth-orb auth-orb-three" />
        <span className="auth-light-veil" />
        <span className="auth-geometry" />
        <ChristianArtBackdrop />
        <div className="auth-particles">
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
          <span className="auth-particle" />
        </div>
      </div>

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
        <div className="auth-brand-lockup">
          <BrandLogo />
          <span className="auth-brand-line" aria-hidden="true" />
        </div>
        <div className="hero-copy premium-auth-copy">
          <p className="eyebrow">A place to belong</p>
          <h1>
            Grow in the Word.
            <br />
            Walk together.
          </h1>
          <p className="muted-text">
            A thoughtful community space to connect, serve, and carry the glory together.
          </p>
        </div>
        <div className="auth-verse" aria-label="Glory Carriers community values">
          <span className="auth-verse-mark" aria-hidden="true" />
          <p>Faith in motion, community at heart.</p>
        </div>
      </section>

      <section className="floating-card auth-card polished-auth-card auth-card-elevated premium-auth-card">
        <span className="auth-glass-sheen" aria-hidden="true" />

        {!isRecoveryMode ? (
          <div
            className={`auth-switcher auth-switcher--${switcherMode}${isForgotPasswordMode ? " is-idle" : ""}`}
            role="group"
            aria-label="Choose an account action"
          >
            <span className="auth-switcher-thumb" aria-hidden="true" />
            <button
              type="button"
              className={mode === "login" ? "switcher-button active" : "switcher-button"}
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "switcher-button active" : "switcher-button"}
              onClick={() => switchMode("signup")}
            >
              Sign up
            </button>
          </div>
        ) : null}

        <div className="auth-heading auth-heading-spacious" key={isRecoveryMode ? "recovery" : mode}>
          <p className="eyebrow">
            {isRecoveryMode
              ? "Password Recovery"
              : mode === "signup"
                ? "New Member"
                : isForgotPasswordMode
                  ? "Password Help"
                  : "Secure Access"}
          </p>
          <h2>
            {isRecoveryMode
              ? "Choose a new password"
              : mode === "signup"
                ? "Create your account"
                : isForgotPasswordMode
                  ? "Reset your password"
                  : "Welcome back"}
          </h2>
          <p className="auth-heading-support">
            {isRecoveryMode
              ? "Set a secure password to get back into your community."
              : mode === "signup"
                ? "Join Glory Carriers and grow together."
                : isForgotPasswordMode
                  ? "We’ll help you get safely back into your account."
                  : "Continue your journey with Glory Carriers."}
          </p>
        </div>

        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}

        <form className={`stack-form auth-form auth-form--${mode}`} onSubmit={handleSubmit}>
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
                  ? "Log in securely"
                  : mode === "signup"
                    ? "Create account"
                    : cooldownSeconds > 0
                      ? `Try again in ${formatCountdown(cooldownSeconds)}`
                      : "Send reset link"}
          </button>
        </form>

        {isRecoveryMode && passwordUpdated ? (
          <div className="auth-support-row">
            <button type="button" className="secondary-button" onClick={() => clearRecoveryMode()}>
              Continue to workspace
            </button>
          </div>
        ) : null}
      </section>
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

function ChristianArtBackdrop() {
  const base = import.meta.env.BASE_URL;

  return (
    <div className="auth-sacred-scene">
      <img
        className="auth-photo auth-photo-login"
        src={`${base}community/login-background.jpeg`}
        alt=""
      />
      <img
        className="auth-photo auth-photo-signup"
        src={`${base}community/create-account-background.jpeg`}
        alt=""
      />
      <span className="auth-photo-scrim" />
    </div>
  );
}
