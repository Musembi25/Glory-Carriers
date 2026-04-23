import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { SetupScreen } from "./components/SetupScreen";
import { isSupabaseConfigured } from "./lib/supabase";

function AppContent() {
  const { session, initializing, isRecoveryMode } = useAuth();

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
    </AuthProvider>
  );
}
