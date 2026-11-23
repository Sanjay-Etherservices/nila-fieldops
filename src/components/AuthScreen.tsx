import React, { useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Lock,
  MapPin,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { AuthUser, UserRole } from '../types.ts';

interface AuthScreenProps {
  needsAdminSetup: boolean;
  envAdminEnabled: boolean;
  onAuthenticated: (token: string, user: AuthUser) => void;
  onAdminClaimed: () => void;
}

export function AuthScreen({
  needsAdminSetup,
  envAdminEnabled,
  onAuthenticated,
  onAdminClaimed,
}: AuthScreenProps) {
  const [role, setRole] = useState<UserRole>(needsAdminSetup ? 'admin' : 'agent');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSetupMode = needsAdminSetup && role === 'admin';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSetupMode) {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/setup-admin', {
          method: 'POST',
          body: { fullName, identifier, password },
        });
        onAdminClaimed();
        onAuthenticated(res.token, res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to complete setup.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: {
          role,
          identifier: identifier.trim(),
          password,
        },
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <Compass className="w-5 h-5 text-blue-700" aria-hidden="true" />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              Nila FieldOps
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap shrink-0">
            <span>Tamil Nadu Operations</span>
            <span aria-hidden="true">·</span>
            <span>Coimbatore</span>
            <span aria-hidden="true">·</span>
            <span>Madurai</span>
            <span aria-hidden="true">·</span>
            <span>Chennai</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-blue-700 tracking-wide mb-3">
                Tamil Nadu Microfinance Network
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-4">
                GPS-verified centre collections and daily field reporting.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-8">
                Built for multi-district operations across Tamil Nadu. Admins manage hubs,
                centres, and agent access dynamically while roaming field agents log verified visits
                from any assigned or visited centre.
              </p>

              <div className="space-y-4 border-t border-slate-100 pt-6">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      100m GPS Check-In & Check-Out
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Every collection visit records In-Time, Out-Time, and metre-level proximity
                      against the centre’s Google Maps coordinates.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <UserCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Flexible Multi-Agent Coverage
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Centres are never locked to a single agent—any authorized agent can visit,
                      verify location, and log Sourcing, Loan, Training, or Collection status.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Privacy-First Field Logs
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Zero loan-amount inputs anywhere—focused strictly on operational attendance,
                      location accuracy, and field activity remarks.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Day Orders: Mon – Sat</span>
              <span aria-hidden="true">·</span>
              <span>Centres: Mars, Saturn, Neptune & custom hubs</span>
            </div>
          </section>

          <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-center">
            <div className="mb-6">
              <div
                role="tablist"
                aria-label="Login role"
                className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={role === 'agent'}
                  onClick={() => {
                    setRole('agent');
                    setError(null);
                  }}
                  className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    role === 'agent'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Agent Login
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={role === 'admin'}
                  onClick={() => {
                    setRole('admin');
                    setError(null);
                  }}
                  className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    role === 'admin'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admin Login
                </button>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="font-display text-xl font-bold text-slate-900">
                {isSetupMode
                  ? 'First-Run Admin Setup'
                  : role === 'admin'
                    ? 'Admin Workspace Sign In'
                    : 'Field Agent Sign In'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {isSetupMode
                  ? 'Create your regional Admin account to start adding locations, centres, and field agents.'
                  : role === 'admin'
                    ? 'Manage Tamil Nadu locations, centres, agents, and audit daily visits.'
                    : 'Enter the Agent ID or email and PIN provided by your Admin.'}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSetupMode && (
                <div>
                  <label
                    htmlFor="setup-fullname"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Admin Full Name
                  </label>
                  <input
                    id="setup-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Karthik Sundaram"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              )}

              {!(role === 'admin' && envAdminEnabled) && (
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    {role === 'admin' ? 'Admin ID or Email' : 'Agent ID or Email'}
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={
                      role === 'admin'
                        ? 'e.g., admin@nilafinance.in'
                        : 'e.g., tn-agt-01 or agent@nilafinance.in'
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {isSetupMode
                    ? 'Create Admin Password'
                    : role === 'admin'
                      ? envAdminEnabled
                        ? 'Admin Passcode'
                        : 'Password'
                      : 'PIN or Password'}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      isSetupMode
                        ? 'Minimum 6 characters'
                        : role === 'agent'
                          ? 'Enter your PIN or password'
                          : 'Enter password'
                    }
                    className="w-full min-h-[44px] px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                  <Lock
                    className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                </div>
              </div>

              {isSetupMode && (
                <div>
                  <label
                    htmlFor="setup-confirm"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="setup-confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Verifying...'
                    : isSetupMode
                      ? 'Create Admin Account & Enter'
                      : role === 'admin'
                        ? 'Sign In to Admin Workspace'
                        : 'Sign In as Field Agent'}
                </span>
              </button>
            </form>
          </section>
        </div>
      </main>

      <footer className="py-4 px-6 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>Nila FieldOps · Tamil Nadu Microfinance Field Operations</span>
          <span>Sessions verified server-side</span>
        </div>
      </footer>
    </div>
  );
}
