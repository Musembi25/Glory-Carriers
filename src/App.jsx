import { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { SetupScreen } from "./components/SetupScreen";
import { InstallAppPrompt } from "./components/InstallAppPrompt";
import { BrandLogo } from "./components/BrandLogo";
import { isSupabaseConfigured } from "./lib/supabase";

function AppContent() {
  const { session, profile, initializing, isRecoveryMode, authEntryPending, signOut } = useAuth();

  useEffect(() => {
    if (initializing) return undefined;

    const appRoot = document.getElementById("root");
    appRoot?.setAttribute("aria-busy", "false");

    const splash = document.getElementById("startup-splash");
    if (!splash) return undefined;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      splash.remove();
      return undefined;
    }

    splash.classList.add("is-leaving");
    const timeoutId = window.setTimeout(() => splash.remove(), 240);
    return () => window.clearTimeout(timeoutId);
  }, [initializing]);

  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  if (initializing) {
    return <LoadingScreen />;
  }

  if (authEntryPending && !isRecoveryMode) {
    return <AuthScreen />;
  }

  if (session && profile?.is_active === false && !isRecoveryMode) {
    return (
      <main className="account-paused-screen">
        <BrandLogo />
        <section>
          <span className="account-paused-mark" aria-hidden="true" />
          <p className="eyebrow">Account access</p>
          <h1>This account is paused</h1>
          <p>Workspace access is temporarily unavailable. Please contact an administrator for The City on A Hill if you think this is unexpected.</p>
          <button type="button" className="primary-button" onClick={() => void signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  return session && !isRecoveryMode ? <AppShell /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <InstallAppPrompt />
    </AuthProvider>
  );
}
