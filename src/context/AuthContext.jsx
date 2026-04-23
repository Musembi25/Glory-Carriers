import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

function getAuthRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}${window.location.pathname}`;
}

function hasRecoveryParams() {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);

  return (
    hashParams.get("type") === "recovery" || queryParams.get("type") === "recovery"
  );
}

function clearAuthUrlState() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const removableParams = [
    "type",
    "code",
    "error",
    "error_code",
    "error_description",
    "token",
    "token_hash"
  ];

  removableParams.forEach((param) => {
    url.searchParams.delete(param);
  });

  url.hash = "";
  window.history.replaceState({}, document.title, url.toString());
}

function getFriendlyAuthError(error, action) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unexpected error");
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("email rate limit exceeded") ||
    normalizedMessage.includes("rate limit")
  ) {
    if (action === "signup") {
      return new Error(
        "Email sending is being throttled by your Supabase project. For testing, disable Confirm email or connect a custom SMTP provider."
      );
    }

    if (action === "password-reset") {
      return new Error(
        "Password reset emails are temporarily throttled. Wait a little, or connect custom SMTP in Supabase Auth for reliable delivery."
      );
    }

    return new Error(
      "Too many authentication requests were sent recently. Please wait a moment and try again."
    );
  }

  if (normalizedMessage.includes("invalid login credentials")) {
    return new Error("That email and password combination doesn't match an account.");
  }

  if (normalizedMessage.includes("user already registered")) {
    return new Error(
      "This email already has an account. Try logging in or use Forgot password."
    );
  }

  if (normalizedMessage.includes("password should be at least")) {
    return new Error("Use a password with at least 6 characters.");
  }

  return error instanceof Error ? error : new Error(message);
}

async function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(() => hasRecoveryParams());
  const [authNotice, setAuthNotice] = useState("");
  const repairedUsersRef = useRef(new Set());

  async function loadProfile(userId) {
    if (!supabase || !userId) {
      setProfile(null);
      return null;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setProfile(data);
        return data;
      }

      await wait(300);
    }

    setProfile(null);
    return null;
  }

  async function ensureCurrentUserProfile() {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.rpc("ensure_current_user_profile");

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  async function claimAdminIfNoActiveAdmin() {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.rpc("claim_admin_if_no_active_admin");

    if (error) {
      throw error;
    }

    return data ?? null;
  }

  async function hydrateSignedInUser(userId) {
    if (!userId) {
      setProfile(null);
      return null;
    }

    let nextProfile = null;

    try {
      nextProfile = await loadProfile(userId);
    } catch (error) {
      console.error("Failed to load profile", error);
    }

    if (!nextProfile) {
      try {
        nextProfile = await ensureCurrentUserProfile();
        setProfile(nextProfile);
      } catch (error) {
        console.error("Failed to ensure current user profile", error);
      }
    }

    if (!nextProfile) {
      return null;
    }

    try {
      const claimedProfile = await claimAdminIfNoActiveAdmin();

      if (claimedProfile) {
        const wasRepaired =
          nextProfile.role !== "admin" && claimedProfile.role === "admin";

        nextProfile = claimedProfile;
        setProfile(claimedProfile);

        if (wasRepaired && !repairedUsersRef.current.has(userId)) {
          repairedUsersRef.current.add(userId);
          setAuthNotice(
            "Admin access was restored for this account because no active admin existed."
          );
        }
      }
    } catch (error) {
      console.error("Failed to repair admin access", error);
    }

    return nextProfile;
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      if (!supabase) {
        setInitializing(false);
        return;
      }

      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setIsRecoveryMode(hasRecoveryParams());
      setSession(currentSession);

      if (currentSession?.user) {
        await hydrateSignedInUser(currentSession.user.id);
      }

      setInitializing(false);
    }

    void bootstrapAuth();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      if (_event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
      } else if (_event === "SIGNED_IN" && !hasRecoveryParams()) {
        setIsRecoveryMode(false);
      } else if (_event === "SIGNED_OUT") {
        setIsRecoveryMode(false);
        clearAuthUrlState();
      }

      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setAuthNotice("");
        setInitializing(false);
        return;
      }

      void hydrateSignedInUser(nextSession.user.id);
      setInitializing(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    if (!supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw getFriendlyAuthError(error, "sign-in");
    }

    return data;
  }

  async function signUp(email, password, fullName) {
    if (!supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      throw getFriendlyAuthError(error, "signup");
    }

    return data;
  }

  async function sendPasswordResetEmail(email) {
    if (!supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl()
    });

    if (error) {
      throw getFriendlyAuthError(error, "password-reset");
    }

    return data;
  }

  async function updatePassword(password) {
    if (!supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    const { data, error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      throw getFriendlyAuthError(error, "update-password");
    }

    return data;
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }
  }

  async function refreshProfile() {
    if (!session?.user) {
      return null;
    }

    return loadProfile(session.user.id);
  }

  function clearRecoveryMode() {
    setIsRecoveryMode(false);
    clearAuthUrlState();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        initializing,
        isRecoveryMode,
        authNotice,
        signIn,
        signUp,
        sendPasswordResetEmail,
        updatePassword,
        signOut,
        refreshProfile,
        clearRecoveryMode,
        clearAuthNotice: () => setAuthNotice("")
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
