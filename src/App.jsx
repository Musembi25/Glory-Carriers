import { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { SetupScreen } from "./components/SetupScreen";
import { InstallAppPrompt } from "./components/InstallAppPrompt";
import { isSupabaseConfigured } from "./lib/supabase";

function AppContent() {
  const { session, initializing, isRecoveryMode } = useAuth();

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
