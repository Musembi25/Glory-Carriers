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

  return (
    <main className="auth-layout polished-auth-layout">
      <section className="hero-panel auth-hero-panel auth-showcase-panel">
        <div className="hero-copy">
          <BrandLogo />
          <p className="eyebrow">Welcome</p>
          <h1>Plan together, beautifully.</h1>
          <p className="muted-text">
            A warm space for events, tasks, prayer points, and real-time updates — designed to feel calm and premium.
          </p>
        </div>

        <div className="hero-badges">
          <div className="hero-badge compact-badge">
            <strong>Realtime collaboration</strong>
            <span>Messages, tasks, and RSVPs sync instantly.</span>
          </div>
          <div className="hero-badge compact-badge">
            <strong>Thoughtful dashboards</strong>
            <span>Everything important, easy to scan.</span>
          </div>
          <div className="hero-badge compact-badge">
            <strong>Light & dark themes</strong>
            <span>Vibrant accents on rich surfaces.</span>
          </div>
        </div>
      </section>

      <section className="floating-card auth-card polished-auth-card auth-card-elevated">
        <div className="auth-card-toprow">
          <div className="auth-chip-row" aria-label="Quick actions">
            <span className="auth-chip">Theme: {themeLabel}</span>
            <button
              type="button"
              className="ghost-button compact"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              aria-label="Toggle theme"
            >
              Toggle
            </button>
          </div>
        </div>

        {!isRecoveryMode ? (
          <div className="auth-switcher" role="tablist" aria-label="Authentication">
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

        <div className="auth-heading auth-heading-spacious">
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
        </div>

        {!isRecoveryMode ? (
          <div className="auth-utility-row">
            {isForgotPasswordMode ? (
              <button
                type="button"
                className="text-button"
                onClick={() => switchMode("login")}
              >
                Back to login
              </button>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            )}
          </div>
        ) : null}

        {message ? <div className="banner success">{message}</div> : null}
        {error ? <div className="banner error">{error}</div> : null}

        <form className="stack-form auth-form" onSubmit={handleSubmit}>
          {!isRecoveryMode && mode === "signup" ? (
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                placeholder="Your name"
                required
              />
            </label>
          ) : null}

          {!isRecoveryMode ? (
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
          ) : null}

          {isRecoveryMode ? (
            <>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) =>
                    updateField("confirmPassword", event.target.value)
                  }
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </>
          ) : !isForgotPasswordMode ? (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                placeholder="At least 6 characters"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </label>
          ) : null}

          <button
            type="submit"
            className="primary-button"
            disabled={submitting || (isForgotPasswordMode && cooldownSeconds > 0)}
          >
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
            <button
              type="button"
              className="secondary-button"
              onClick={() => clearRecoveryMode()}
            >
              Continue to workspace
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
