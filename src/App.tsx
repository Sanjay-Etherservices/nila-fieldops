import { useCallback, useEffect, useState } from 'react';
import { AdminWorkspace } from './components/AdminWorkspace.tsx';
import { AgentPortal } from './components/AgentPortal.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { apiFetch } from './lib/api.ts';
import type { AuthUser } from './types.ts';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [envAdminEnabled, setEnvAdminEnabled] = useState(false);
  const [booting, setBooting] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await apiFetch<{ needsAdminSetup: boolean; envAdminEnabled: boolean }>(
        '/api/auth/status'
      );
      setNeedsAdminSetup(res.needsAdminSetup);
      setEnvAdminEnabled(res.envAdminEnabled);
    } catch {
      // Fallback safely
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  function handleAuthenticated(newToken: string, authUser: AuthUser) {
    setToken(newToken);
    setUser(authUser);
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    checkAuthStatus();
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600 font-medium">Loading Nila FieldOps...</p>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <AuthScreen
        needsAdminSetup={needsAdminSetup}
        envAdminEnabled={envAdminEnabled}
        onAuthenticated={handleAuthenticated}
        onAdminClaimed={() => setNeedsAdminSetup(false)}
      />
    );
  }

  if (user.role === 'admin') {
    return <AdminWorkspace token={token} user={user} onLogout={handleLogout} />;
  }

  return <AgentPortal token={token} user={user} onLogout={handleLogout} />;
}
